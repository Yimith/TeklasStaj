import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import predict_ucf_video as ucf


CLIP = {"num_frames": 16, "target_fps": 15.0, "image_size": 112,
        "spatial_mode": "letterbox", "temporal_mode": "nearest_frame_using_nominal_fps",
        "short_video_padding": "repeat_last_frame",
        "mean": [0.43216, 0.394666, 0.37645], "std": [0.22803, 0.22145, 0.216989]}
VAL = {"stride_frames": 8, "clip_batch_size": 16, "sampling": "full_video_nominal_fps_with_tail"}
INFO = {"epoch": 15, "class_names": ["Normal", "Fighting", "Assault", "Arson"],
        "clip_config": CLIP, "val_config": VAL,
        "model_config": {"num_classes": 4, "hidden_dim": 128, "attention_dim": 64,
                         "dropout": 0.3, "encoder_chunk_size": 4}}


class FakeCapture:
    def __init__(self, count, fail_at=None):
        self.count, self.fail_at = count, fail_at
        self.position, self.released = 0, False

    def isOpened(self):
        return True

    @staticmethod
    def frame(index):
        return np.full((20, 40, 3), [index % 256, 70, 150], dtype=np.uint8)

    def read(self):
        if self.position >= self.count or self.position == self.fail_at:
            return False, None
        frame = self.frame(self.position)
        self.position += 1
        return True, frame

    def release(self):
        self.released = True


class FakeMIL:
    def __init__(self):
        self.pool_sizes = []

    def eval(self):
        return self

    def encode_clips(self, clips):
        return clips.mean(dim=(2, 3, 4)).repeat(1, 2)

    def classify_features(self, features):
        self.pool_sizes.append(features.shape[1])
        attention = features[:, :, 0].softmax(dim=1)
        pooled = (features * attention.unsqueeze(-1)).sum(dim=1)
        return pooled[:, :4], attention


class InferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)

    def meta(self, count=95, fps=30.0):
        return {"frame_count": count, "fps": fps, "duration_s": count / fps}

    def test_rgb_letterbox(self):
        image = ucf.letterbox_rgb(FakeCapture.frame(12), CLIP)
        self.assertEqual(image.shape, (112, 112, 3))
        np.testing.assert_array_equal(image[56, 56], [150, 70, 12])
        np.testing.assert_array_equal(image[0, 0], np.rint(np.array(CLIP["mean"]) * 255))

    def test_full_reader_matches_direct_sampling_and_reaches_tail(self):
        for fps in (25.0, 30.0):
            with self.subTest(fps=fps):
                meta = self.meta(fps=fps)
                starts = ucf.window_starts(meta, CLIP, VAL)
                self.assertEqual(starts[0], 0)
                self.assertEqual(ucf.sample_ids(starts[-1], meta, CLIP)[-1], 94)
                cap = FakeCapture(95)
                with patch.object(ucf.cv2, "VideoCapture", return_value=cap):
                    batches = list(ucf.iter_clip_batches(Path("fake.mp4"), meta, CLIP, starts, 3))
                actual = torch.cat(batches)
                expected = []
                for start in starts:
                    ids = np.clip(np.rint((start + np.arange(16) / 15) * fps).astype(int), 0, 94)
                    rgb = np.stack([ucf.letterbox_rgb(FakeCapture.frame(i), CLIP) for i in ids])
                    tensor = torch.from_numpy(rgb).permute(3, 0, 1, 2).float() / 255
                    expected.append((tensor - torch.tensor(CLIP["mean"]).view(3, 1, 1, 1))
                                    / torch.tensor(CLIP["std"]).view(3, 1, 1, 1))
                torch.testing.assert_close(actual, torch.stack(expected), rtol=0, atol=0)
                self.assertTrue(cap.released)
                self.assertEqual(cap.position, 95)

    def test_short_video_repeats_last_frame(self):
        meta = self.meta(count=1)
        starts = ucf.window_starts(meta, CLIP, VAL)
        np.testing.assert_array_equal(starts, [0])
        np.testing.assert_array_equal(ucf.sample_ids(0, meta, CLIP), np.zeros(16))
        cap = FakeCapture(1)
        with patch.object(ucf.cv2, "VideoCapture", return_value=cap):
            batch = list(ucf.iter_clip_batches(Path("fake.mp4"), meta, CLIP, starts, 4))[0]
        self.assertEqual(tuple(batch.shape), (1, 3, 16, 112, 112))
        torch.testing.assert_close(batch[:, :, 0], batch[:, :, -1])

    def test_decode_failure_and_wrong_frame_count_raise_and_close(self):
        meta = self.meta()
        starts = ucf.window_starts(meta, CLIP, VAL)
        for cap in (FakeCapture(95, fail_at=40), FakeCapture(94), FakeCapture(96)):
            with patch.object(ucf.cv2, "VideoCapture", return_value=cap):
                with self.assertRaises(ValueError):
                    list(ucf.iter_clip_batches(Path("fake.mp4"), meta, CLIP, starts, 3))
            self.assertTrue(cap.released)

    def test_early_close_releases_capture(self):
        meta = self.meta()
        cap = FakeCapture(95)
        with patch.object(ucf.cv2, "VideoCapture", return_value=cap):
            stream = ucf.iter_clip_batches(Path("fake.mp4"), meta, CLIP,
                                          ucf.window_starts(meta, CLIP, VAL), 1)
            next(stream)
            stream.close()
        self.assertTrue(cap.released)

    def test_global_pooling_is_once_and_batch_independent(self):
        results = []
        for batch_size in (1, 3):
            model = FakeMIL()
            with patch.object(ucf.cv2, "VideoCapture", return_value=FakeCapture(95)):
                result = ucf.infer_video(model, Path("fake.mp4"), self.meta(), INFO,
                                         torch.device("cpu"), batch_size, progress=False)
            self.assertEqual(model.pool_sizes, [result["num_clips"]])
            self.assertAlmostEqual(sum(result["softmax_scores"].values()), 1.0, places=6)
            self.assertAlmostEqual(sum(result["attention"]), 1.0, places=6)
            results.append(result)
        np.testing.assert_allclose(results[0]["attention"], results[1]["attention"])
        np.testing.assert_allclose(list(results[0]["softmax_scores"].values()),
                                   list(results[1]["softmax_scores"].values()))

    def test_checkpoint_config_rejects_incompatible_settings(self):
        checkpoint = copy.deepcopy(INFO)
        checkpoint.update({"format_version": 1, "model_class": "R3DAttentionMIL",
                           "model_state_dict": {}, "class_to_idx": {n: i for i, n in enumerate(INFO["class_names"])}})
        ucf.validate_config(checkpoint)
        for field, value in (("spatial_mode", "center_crop"), ("std", [0, 1, 1]), ("target_fps", 0)):
            bad = copy.deepcopy(checkpoint)
            bad["clip_config"][field] = value
            with self.assertRaises(ValueError):
                ucf.validate_config(bad)
        with self.assertRaises(ValueError):
            ucf.validate_config({"model_class": "YOLO"})

    def test_result_files_unique_and_no_clip_class_claim(self):
        with patch.object(ucf.cv2, "VideoCapture", return_value=FakeCapture(95)):
            result = ucf.infer_video(FakeMIL(), Path("fake.mp4"), self.meta(), INFO,
                                     torch.device("cpu"), 3, progress=False)
        with tempfile.TemporaryDirectory(prefix="ucf_unit_test_") as directory:
            args = (Path(directory), Path("fake.mp4"), Path("fake.pt"), self.meta(),
                    INFO, torch.device("cpu"), 3, result)
            first, second = ucf.save_results(*args), ucf.save_results(*args)
            self.assertNotEqual(first, second)
            report = json.loads((first / "result.json").read_text())
            self.assertEqual(report["num_clips"], result["num_clips"])
            rows = (first / "attention.csv").read_text().splitlines()
            self.assertEqual(len(rows), result["num_clips"] + 1)
            self.assertNotIn("class", rows[0])


if __name__ == "__main__":
    unittest.main()
