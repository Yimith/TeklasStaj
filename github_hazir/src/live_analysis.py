from __future__ import annotations

from collections import deque
import math
import os
from pathlib import Path
import time

import cv2
import numpy as np
import torch

from predict_ucf_video import choose_device, letterbox_rgb, load_model, read_metadata

ROOT = Path(__file__).resolve().parents[1]
UCF_CLASSES = {"Normal", "Fighting", "Assault", "Arson"}
OBJECT_CLASSES = {"person", "forklift", "forklift_tipped"}


class Models:
    def __init__(self, device="auto"):
        torch.set_num_threads(min(4, os.cpu_count() or 1))
        selected = device
        if device == "auto":
            selected = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        self.device = choose_device(selected)
        self.ucf, self.info = load_model(ROOT / "models/best.pt", self.device)
        if set(self.info["class_names"]) != UCF_CLASSES:
            raise ValueError("Bu panel dört sınıflı models/best.pt bekliyor.")
        config = self.info["clip_config"]
        probe = np.zeros((config["num_frames"], config["image_size"], config["image_size"], 3), dtype=np.uint8)
        try:
            self.encode(probe)
        except (RuntimeError, NotImplementedError):
            if device != "auto" or selected != "mps":
                raise
            self.device = torch.device("cpu")
            self.ucf.to(self.device)
            self.encode(probe)
        weights = ROOT / "models/forklift_3class_best.pt"
        if not weights.is_file():
            raise FileNotFoundError("models/forklift_3class_best.pt bulunamadı.")
        os.environ.setdefault("YOLO_AUTOINSTALL", "False")
        from ultralytics import YOLO
        self.yolo = YOLO(str(weights))
        if set(self.yolo.names.values()) != OBJECT_CLASSES:
            raise ValueError(f"Forklift model sınıfları uyuşmuyor: {self.yolo.names}")
        self.detect(np.zeros((320, 320, 3), dtype=np.uint8))
        self.reset_tracker()

    def reset_tracker(self):
        for tracker in getattr(getattr(self.yolo, "predictor", None), "trackers", []):
            tracker.reset()

    @torch.inference_mode()
    def detect(self, frame):
        result = self.yolo.track(
            frame, persist=True, tracker="bytetrack.yaml", device=str(self.device),
            conf=0.25, iou=0.5, imgsz=640, verbose=False, save=False,
        )[0]
        boxes = result.boxes
        if boxes is None:
            return []
        ids = boxes.id.int().cpu().tolist() if boxes.id is not None else [None] * len(boxes)
        return [
            {"class_name": self.yolo.names[int(cls)], "score": float(score),
             "track_id": track_id, "xyxyn": [float(v) for v in xyxy]}
            for xyxy, cls, score, track_id in zip(
                boxes.xyxyn.clamp(0, 1).cpu().tolist(), boxes.cls.cpu().tolist(),
                boxes.conf.cpu().tolist(), ids)
        ]

    @torch.inference_mode()
    def encode(self, rgb):
        config = self.info["clip_config"]
        clip = torch.from_numpy(rgb).permute(3, 0, 1, 2).float() / 255
        mean = torch.tensor(config["mean"]).view(3, 1, 1, 1)
        std = torch.tensor(config["std"]).view(3, 1, 1, 1)
        clip = ((clip - mean) / std).unsqueeze(0).to(self.device)
        return self.ucf.encode_clips(clip).float().cpu()[0]

    @torch.inference_mode()
    def classify(self, features):
        tensor = torch.stack(features).unsqueeze(0).to(self.device)
        logits, _ = self.ucf.classify_features(tensor)
        if not torch.isfinite(logits).all():
            raise ValueError("UCF geçersiz sayısal sonuç üretti.")
        values = logits.float().softmax(dim=1)[0].cpu().tolist()
        return dict(zip(self.info["class_names"], values))


class CausalReader:
    def __init__(self, path, config, meta):
        self.config, self.meta = config, meta
        self.cap = cv2.VideoCapture(str(path))
        if not self.cap.isOpened():
            self.cap.release()
            raise ValueError("Video çözücü açılamadı.")
        self.next_frame = 0
        self.cache = {}
        self.last_frame = None
        self.last_id = -1

    def read(self, target, include_clip):
        fps = self.meta["fps"]
        if include_clip:
            offsets = np.arange(self.config["num_frames"] - 1, -1, -1)
            ids = np.rint(target - offsets * fps / self.config["target_fps"]).astype(int)
            ids = np.clip(ids, 0, target)
        else:
            ids = np.array([target])
        first = int(ids[0])
        needed = set(int(i) for i in ids)
        missing_old = any(i < self.next_frame and i not in self.cache for i in needed)
        if missing_old or self.next_frame < first or self.next_frame > target + 1:
            if not self.cap.set(cv2.CAP_PROP_POS_FRAMES, first):
                raise ValueError("Video konumuna gidilemedi.")
            position = self.cap.get(cv2.CAP_PROP_POS_FRAMES)
            if not math.isfinite(position) or abs(position - first) > 0.5:
                raise ValueError("Video çözücü kare konumunu doğrulayamadı.")
            self.next_frame = first
            self.cache.clear()
        while self.next_frame <= target:
            ok, frame = self.cap.read()
            if not ok or frame is None:
                raise ValueError(f"Video karesi okunamadı: {self.next_frame}")
            if self.next_frame in needed:
                self.cache[self.next_frame] = letterbox_rgb(frame, self.config)
            if self.next_frame == target:
                self.last_frame, self.last_id = frame, target
            self.next_frame += 1
        if self.last_id != target:
            raise ValueError("Görüntü ve zaman eşleşmiyor.")
        rgb = np.stack([self.cache[int(i)] for i in ids]) if include_clip else None
        self.cache = {i: value for i, value in self.cache.items() if i >= first}
        return self.last_frame, rgb, float(ids[0]) / fps

    def close(self):
        self.cap.release()
        self.cache.clear()
        self.last_frame = None


class LiveSession:
    WINDOW_SECONDS = 8.0
    MIN_CONTEXT_SECONDS = 4.0
    GAP_RESET_SECONDS = 2.0

    def __init__(self, path: Path, models, *, reader_factory=CausalReader, meta=None):
        self.models = models
        self.meta = meta or read_metadata(path)
        if (self.meta["width"] * self.meta["height"] > 16_777_216
                or self.meta["fps"] > 240):
            raise ValueError("Bu prototip en fazla 16 MP ve 240 FPS video kabul eder.")
        self.config = models.info["clip_config"]
        self.reader = reader_factory(path, self.config, self.meta)
        self.features = deque(maxlen=64)
        self.generation = -1
        self.last_time = None
        self.origin = 0.0
        self.last_encoded = -math.inf
        self.ucf_result = None
        self.last_result = None
        self.reset_reason = "started"
        self.models.reset_tracker()

    def reset(self, generation, at, reason):
        self.models.reset_tracker()
        self.features.clear()
        self.ucf_result = None
        self.last_result = None
        self.last_encoded = -math.inf
        self.generation, self.origin = generation, at
        self.last_time = None
        self.reset_reason = reason

    def step(self, requested_time, generation):
        begin = time.perf_counter()
        if not math.isfinite(requested_time) or requested_time < 0:
            raise ValueError("Geçersiz video zamanı.")
        if generation < self.generation:
            raise ValueError("Eski oynatma oturumu reddedildi.")
        fps = self.meta["fps"]
        target = min(int(math.floor(requested_time * fps + 1e-7)), self.meta["frame_count"] - 1)
        at = target / fps
        if generation != self.generation:
            self.reset(generation, at, "playback_changed")
        elif self.last_time is not None and (at < self.last_time or at - self.last_time > self.GAP_RESET_SECONDS):
            self.reset(generation, at, "time_gap")
        if self.last_time == at and self.last_result is not None:
            return self.last_result
        span = (self.config["num_frames"] - 1) / self.config["target_fps"]
        stride = self.models.info["val_config"]["stride_frames"] / self.config["target_fps"]
        encode = at - self.origin >= span and at - self.last_encoded >= stride - 1e-6
        frame, rgb, clip_start = self.reader.read(target, encode)
        detections = self.models.detect(frame)
        if encode:
            feature = self.models.encode(rgb)
            self.features.append((clip_start, at, feature))
            self.last_encoded = at
            while self.features and self.features[0][0] < at - self.WINDOW_SECONDS:
                self.features.popleft()
            coverage = at - self.features[0][0]
            if coverage >= self.MIN_CONTEXT_SECONDS and len(self.features) >= 3:
                scores = self.models.classify([entry[2] for entry in self.features])
                self.ucf_result = {
                    "class_name": max(scores, key=scores.get), "scores": scores,
                    "window_start_s": self.features[0][0], "window_end_s": at,
                    "clip_count": len(self.features), "experimental": True,
                }
        self.last_time = at
        self.last_result = {
            "generation": generation, "frame_time_s": at,
            "width": self.meta["width"], "height": self.meta["height"],
            "detections": detections, "ucf": self.ucf_result,
            "context_seconds": max(0.0, at - self.origin),
            "min_context_seconds": self.MIN_CONTEXT_SECONDS,
            "reset_reason": self.reset_reason, "processing_ms": (time.perf_counter() - begin) * 1000,
        }
        return self.last_result

    def close(self):
        self.reader.close()
        self.features.clear()
        self.models.reset_tracker()
