import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import cv2
import numpy as np
import torch
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from live_analysis import CausalReader, LiveSession
from serve_camera import create_app

CONFIG = {"num_frames": 16, "target_fps": 15, "image_size": 112,
          "mean": [.43216, .394666, .37645], "std": [.22803, .22145, .216989]}
META = {"fps": 30., "frame_count": 1800, "duration_s": 60., "width": 40, "height": 20}


class FakeModels:
    info = {"clip_config": CONFIG, "val_config": {"stride_frames": 8}}
    device = "cpu"

    def __init__(self):
        self.resets = 0
        self.encodes = 0

    def reset_tracker(self):
        self.resets += 1

    def detect(self, frame):
        return [{"class_name": "forklift_tipped", "track_id": 1,
                 "score": .8, "xyxyn": [.1, .1, .8, .8]}]

    def encode(self, rgb):
        self.encodes += 1
        assert rgb.shape == (16, 112, 112, 3)
        return torch.zeros(512)

    def classify(self, features):
        return {"Normal": .7, "Fighting": .1, "Assault": .1, "Arson": .1}


class FakeReader:
    def __init__(self, *args):
        self.calls = []
        self.closed = False

    def read(self, target, include_clip):
        self.calls.append(target)
        return np.zeros((20, 40, 3), dtype=np.uint8), np.zeros((16, 112, 112, 3), dtype=np.uint8), (target - 30) / 30

    def close(self):
        self.closed = True


class FakeCapture:
    def __init__(self):
        self.position = 0
        self.reads = []

    def isOpened(self): return True
    def release(self): pass
    def set(self, key, value):
        self.position = value
        return True
    def get(self, key): return self.position
    def read(self):
        self.reads.append(self.position)
        self.position += 1
        return True, np.full((20, 40, 3), self.position % 255, dtype=np.uint8)


class LiveTests(unittest.TestCase):
    def session(self):
        return LiveSession(Path("unused.mp4"), FakeModels(), reader_factory=FakeReader, meta=META)

    def test_no_future_frames_and_bounded_seek(self):
        capture = FakeCapture()
        with patch("live_analysis.cv2.VideoCapture", return_value=capture):
            reader = CausalReader(Path("unused.mp4"), CONFIG, META)
        _, clip, start = reader.read(900, True)
        self.assertEqual(start, 29)
        self.assertEqual(capture.reads, list(range(870, 901)))
        self.assertEqual(clip.shape, (16, 112, 112, 3))
        reader.read(906, False)
        reader.read(918, True)
        self.assertLessEqual(max(capture.reads), 918)
        self.assertLessEqual(len(reader.cache), 32)
        reader.read(0, False)
        self.assertEqual(capture.reads[-1], 0)

    def test_rolling_context_and_independent_tipped_alarm(self):
        session = self.session()
        result = session.step(0, 0)
        self.assertIsNone(result["ucf"])
        for at in np.arange(.6, 18, .6):
            result = session.step(float(at), 0)
        self.assertEqual(result["ucf"]["class_name"], "Normal")
        self.assertEqual(result["detections"][0]["class_name"], "forklift_tipped")
        self.assertLessEqual(result["ucf"]["window_end_s"], result["frame_time_s"])
        self.assertLessEqual(result["ucf"]["window_end_s"] - result["ucf"]["window_start_s"], 8)
        self.assertLessEqual(len(session.features), 16)

    def test_seek_generation_and_gap_clear_history(self):
        session = self.session()
        for at in np.arange(0, 6, .6): session.step(float(at), 0)
        self.assertIsNotNone(session.ucf_result)
        result = session.step(20, 1)
        self.assertIsNone(result["ucf"])
        self.assertEqual(result["context_seconds"], 0)
        with self.assertRaises(ValueError): session.step(20, 0)
        session.step(20.6, 1)
        result = session.step(24, 1)
        self.assertEqual(result["reset_reason"], "time_gap")
        self.assertIsNone(result["ucf"])
        result = session.step(0, 1)
        self.assertEqual(result["context_seconds"], 0)

    def test_duplicate_time_does_not_run_models_and_close_releases(self):
        session = self.session()
        session.step(0, 0)
        count = len(session.reader.calls)
        session.step(0, 0)
        self.assertEqual(len(session.reader.calls), count)
        session.close()
        self.assertTrue(session.reader.closed)


class ApiTests(unittest.TestCase):
    session_id = "12345678-1234-4123-8123-123456789abc"
    headers = {"x-teklas-client": "camera-wall", "x-video-extension": ".mp4", "origin": "http://127.0.0.1:5173"}

    def test_upload_step_single_session_and_cleanup(self):
        paths = []
        def factory(path, models):
            paths.append(path)
            return LiveSession(path, models, reader_factory=FakeReader, meta=META)
        with TestClient(create_app(FakeModels, factory)) as client:
            self.assertTrue(client.get("/api/health").json()["ready"])
            url = f"/api/sessions/{self.session_id}"
            self.assertEqual(client.put(url, content=b"fake", headers=self.headers).status_code, 200)
            self.assertTrue(paths[0].is_file())
            self.assertEqual(client.put(url, content=b"fake", headers=self.headers).status_code, 409)
            response = client.post(url + "/step", json={"time_s": 1.2, "generation": 0}, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertIsNone(response.json()["ucf"])
            self.assertEqual(client.post(url + "/step", json={"time_s": -1, "generation": 0}, headers=self.headers).status_code, 422)
            self.assertEqual(client.get(url).status_code, 200)
            self.assertEqual(client.delete(url, headers=self.headers).status_code, 200)
            self.assertFalse(paths[0].parent.exists())
            self.assertEqual(client.get(url).status_code, 404)

    def test_reject_cross_origin_arbitrary_paths_and_oversize(self):
        with TestClient(create_app(FakeModels)) as client:
            url = f"/api/sessions/{self.session_id}"
            self.assertEqual(client.put(url, content=b"x").status_code, 403)
            headers = dict(self.headers, origin="https://untrusted.example")
            self.assertEqual(client.put(url, content=b"x", headers=headers).status_code, 403)
            headers = dict(self.headers, **{"content-length": str(513 * 1024 * 1024)})
            self.assertEqual(client.put(url, content=b"x", headers=headers).status_code, 413)
            self.assertEqual(client.put("/api/sessions/local-file", content=b"x", headers=self.headers).status_code, 422)
            self.assertEqual(client.put(url, content=b"", headers=self.headers).status_code, 400)
            self.assertEqual(client.get("/api/health").json()["active_sessions"], 0)

    def test_model_and_decode_errors_are_not_normal(self):
        def broken(): raise ValueError("model missing")
        with TestClient(create_app(broken)) as client:
            self.assertFalse(client.get("/api/health").json()["ready"])
        def bad_video(*args): raise ValueError("invalid video")
        with TestClient(create_app(FakeModels, bad_video)) as client:
            response = client.put(f"/api/sessions/{self.session_id}", content=b"x", headers=self.headers)
            self.assertEqual(response.status_code, 422)
            self.assertEqual(client.get("/api/health").json()["active_sessions"], 0)


if __name__ == "__main__":
    unittest.main()
