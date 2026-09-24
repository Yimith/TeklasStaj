from __future__ import annotations

import argparse
import csv
import json
import math
import os
import pickle
import time
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import torch
import torchvision

from ucf_video_model import R3DAttentionMIL


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def validate_config(checkpoint):
    if not isinstance(checkpoint, dict) or checkpoint.get("model_class") != "R3DAttentionMIL":
        raise ValueError("Bu dosya R3DAttentionMIL checkpoint'i değil; YOLO/C3D modeli kullanmayın.")
    if checkpoint.get("format_version") != 1:
        raise ValueError("Desteklenmeyen checkpoint biçimi.")
    required = {"model_config", "model_state_dict", "class_names", "class_to_idx",
                "clip_config", "val_config", "epoch"}
    if not required.issubset(checkpoint):
        raise ValueError(f"Checkpoint alanları eksik: {sorted(required - checkpoint.keys())}")
    model = checkpoint["model_config"]
    expected = {"num_classes", "hidden_dim", "attention_dim", "dropout", "encoder_chunk_size"}
    if not isinstance(model, dict) or set(model) != expected:
        raise ValueError("Model ayarları bu mimariyle uyuşmuyor.")
    for name in expected - {"dropout"}:
        if type(model[name]) is not int or model[name] < 1:
            raise ValueError(f"Geçersiz model ayarı: {name}")
    if not 0 <= float(model["dropout"]) < 1:
        raise ValueError("Geçersiz dropout.")
    names = checkpoint["class_names"]
    if (not isinstance(names, list) or not all(isinstance(x, str) and x for x in names)
            or len(names) != model["num_classes"] or len(set(names)) != len(names)):
        raise ValueError("Sınıf isimleri geçersiz.")
    if checkpoint["class_to_idx"] != {name: i for i, name in enumerate(names)}:
        raise ValueError("Checkpoint sınıf sırası uyuşmuyor.")

    clip, val = checkpoint["clip_config"], checkpoint["val_config"]
    for name in ("num_frames", "image_size"):
        if type(clip.get(name)) is not int or clip[name] < 1:
            raise ValueError(f"Geçersiz klip ayarı: {name}")
    if not math.isfinite(float(clip["target_fps"])) or clip["target_fps"] <= 0:
        raise ValueError("Hedef FPS pozitif ve sonlu olmalı.")
    for name, expected_value in {
        "spatial_mode": "letterbox",
        "temporal_mode": "nearest_frame_using_nominal_fps",
        "short_video_padding": "repeat_last_frame",
    }.items():
        if clip.get(name) != expected_value:
            raise ValueError(f"Desteklenmeyen ön işleme: {name}={clip.get(name)}")
    for name in ("mean", "std"):
        values = np.asarray(clip.get(name), dtype=np.float64)
        if values.shape != (3,) or not np.isfinite(values).all():
            raise ValueError(f"Geçersiz normalizasyon: {name}")
        if name == "std" and np.any(values <= 0):
            raise ValueError("Normalizasyon std pozitif olmalı.")
        if name == "mean" and np.any((values < 0) | (values > 1)):
            raise ValueError("Normalizasyon mean 0–1 aralığında olmalı.")
    stride = val.get("stride_frames")
    if type(stride) is not int or not 1 <= stride <= clip["num_frames"]:
        raise ValueError("Geçersiz validation pencere adımı.")
    if val.get("sampling") != "full_video_nominal_fps_with_tail":
        raise ValueError("Desteklenmeyen validation örneklemesi.")


def load_model(path, device):
    if not path.is_file():
        raise FileNotFoundError(
            f"Model bulunamadı: {path}\nKaggle best.pt dosyasını models/best.pt "
            "olarak koyun veya --weights ile tam yolunu verin."
        )
    try:
        checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    except (pickle.UnpicklingError, EOFError) as exc:
        raise ValueError("Checkpoint güvenli biçimde açılamadı. Kendi R3D best.pt dosyanızı kullanın.") from exc
    validate_config(checkpoint)
    model = R3DAttentionMIL(**checkpoint["model_config"], pretrained=False)
    model.load_state_dict(checkpoint["model_state_dict"], strict=True)
    model.requires_grad_(False)
    model.eval().to(device)
    info = {key: checkpoint[key] for key in (
        "epoch", "class_names", "model_config", "clip_config", "val_config"
    )}
    info["best_val_macro_f1"] = checkpoint.get("best_val_macro_f1")
    return model, info


def choose_device(name):
    if name == "auto":
        name = "cuda" if torch.cuda.is_available() else "cpu"
    if name == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA kullanılamıyor; --device cpu seçin.")
    if name == "mps" and not torch.backends.mps.is_available():
        raise ValueError("MPS kullanılamıyor; --device cpu seçin.")
    return torch.device(name)


def read_metadata(path):
    if not path.is_file():
        raise FileNotFoundError(f"Video bulunamadı: {path}")
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise ValueError(f"Video açılamadı: {path}")
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        count = float(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = float(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = float(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if not all(math.isfinite(v) and v > 0 for v in (fps, count, width, height)):
            raise ValueError("Video FPS/kare sayısı/boyut bilgisi okunamadı; sessiz varsayılan kullanılmadı.")
        frame_count = int(round(count))
        if frame_count < 1:
            raise ValueError("Videoda kare yok.")
        return {"fps": fps, "frame_count": frame_count, "duration_s": frame_count / fps,
                "width": int(round(width)), "height": int(round(height))}
    finally:
        cap.release()


def window_starts(meta, clip_config, val_config):
    span = (clip_config["num_frames"] - 1) / clip_config["target_fps"]
    max_start = max(0.0, (meta["frame_count"] - 1) / meta["fps"] - span)
    stride = val_config["stride_frames"] / clip_config["target_fps"]
    starts = np.arange(0.0, max_start, stride, dtype=np.float64)
    return np.concatenate([starts[starts < max_start - 1e-8], [max_start]])


def sample_ids(start, meta, config):
    times = start + np.arange(config["num_frames"]) / config["target_fps"]
    return np.clip(np.rint(times * meta["fps"]).astype(np.int64), 0, meta["frame_count"] - 1)


def letterbox_rgb(frame, config):
    size = config["image_size"]
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    height, width = rgb.shape[:2]
    scale = min(size / width, size / height)
    new_w, new_h = max(1, round(width * scale)), max(1, round(height * scale))
    resized = cv2.resize(rgb, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    canvas = np.empty((size, size, 3), dtype=np.uint8)
    canvas[:] = np.rint(np.array(config["mean"]) * 255).astype(np.uint8)
    top, left = (size - new_h) // 2, (size - new_w) // 2
    canvas[top:top + new_h, left:left + new_w] = resized
    return canvas


def iter_clip_batches(path, meta, config, starts, batch_size):
    if batch_size < 1:
        raise ValueError("Batch boyutu en az 1 olmalı.")
    mean = torch.tensor(config["mean"]).view(3, 1, 1, 1)
    std = torch.tensor(config["std"]).view(3, 1, 1, 1)
    cap = cv2.VideoCapture(str(path))
    cache, pending = {}, []
    next_frame = 0
    try:
        if not cap.isOpened():
            raise ValueError(f"Video açılamadı: {path}")
        for start in starts:
            ids = sample_ids(start, meta, config)
            first, last = int(ids[0]), int(ids[-1])
            cache = {i: frame for i, frame in cache.items() if i >= first}
            while next_frame <= last:
                ok, frame = cap.read()
                if not ok or frame is None or frame.size == 0:
                    raise ValueError(f"Video tamamlanamadı; okunamayan kare: {next_frame}")
                if next_frame >= first:
                    cache[next_frame] = letterbox_rgb(frame, config)
                next_frame += 1
            rgb = np.stack([cache[int(i)] for i in ids])
            clip = torch.from_numpy(rgb).permute(3, 0, 1, 2).float() / 255.0
            pending.append(((clip - mean) / std).contiguous())
            if len(pending) == batch_size:
                yield torch.stack(pending)
                pending.clear()
        if next_frame != meta["frame_count"]:
            raise ValueError("Video sonuna ulaşılamadı.")
        extra_ok, _ = cap.read()
        if extra_ok:
            raise ValueError("Video bildirilen kare sayısından uzun; sonuç eksik olacağı için durduruldu.")
        if pending:
            yield torch.stack(pending)
    finally:
        cap.release()


@torch.inference_mode()
def infer_video(model, path, meta, info, device, batch_size, progress=True):
    starts = window_starts(meta, info["clip_config"], info["val_config"])
    parts, processed = [], 0
    begin = last_report = time.perf_counter()
    model.eval()
    with closing(iter_clip_batches(path, meta, info["clip_config"], starts, batch_size)) as stream:
        for clips in stream:
            inputs = clips.to(device)
            with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=device.type == "cuda"):
                features = model.encode_clips(inputs)
            parts.append(features.float().cpu())
            processed += len(clips)
            now = time.perf_counter()
            if progress and (processed == len(starts) or now - last_report >= 5):
                print(f"Klip: {processed}/{len(starts)} | Süre: {now - begin:.1f} sn", flush=True)
                last_report = now
            del inputs, features
    if processed != len(starts):
        raise ValueError("Beklenen kliplerin tamamı işlenmedi.")
    features = torch.cat(parts).unsqueeze(0).to(device)
    with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=device.type == "cuda"):
        logits, attention = model.classify_features(features)
    if not torch.isfinite(logits).all() or not torch.isfinite(attention).all():
        raise ValueError("Model çıktısında geçersiz sayısal değer var.")
    if tuple(logits.shape) != (1, len(info["class_names"])) or tuple(attention.shape) != (1, len(starts)):
        raise ValueError("Model çıktı boyutları uyuşmuyor.")
    scores = logits.float().softmax(dim=1)[0].cpu().tolist()
    return {"prediction": info["class_names"][int(np.argmax(scores))],
            "softmax_scores": dict(zip(info["class_names"], scores)),
            "num_clips": processed, "elapsed_s": time.perf_counter() - begin,
            "starts": starts, "attention": attention.float()[0].cpu().tolist()}


def save_results(output_root, source, weights, meta, info, device, batch_size, result):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ")
    run_dir = output_root / f"{source.stem}_{stamp}"
    run_dir.mkdir(parents=True, exist_ok=False)
    report = {key: value for key, value in result.items() if key not in ("starts", "attention")}
    report.update({"source": str(source), "weights": str(weights), "device": str(device),
                   "batch_size": batch_size, "video": meta, "checkpoint": info,
                   "versions": {"torch": str(torch.__version__), "torchvision": str(torchvision.__version__),
                                "opencv": cv2.__version__, "numpy": np.__version__},
                   "notes": ["Video düzeyinde tahmin; kutu veya zaman bazlı olay etiketi üretmez.",
                             "Softmax skorları kalibre edilmiş güvenilirlik yüzdeleri değildir.",
                             "Dikkat ağırlıkları olay olasılığı/olay sınırı değildir.",
                             "Kaggle gibi nominal FPS kullanır; değişken FPS için zaman damgası desteği yoktur."]})
    with (run_dir / "result.json").open("x", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2, allow_nan=False)
    with (run_dir / "attention.csv").open("x", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["clip_index", "window_start_s", "sampled_first_s", "sampled_last_s", "mil_attention"])
        for index, (start, weight) in enumerate(zip(result["starts"], result["attention"])):
            ids = sample_ids(start, meta, info["clip_config"])
            writer.writerow([index, float(start), float(ids[0] / meta["fps"]),
                             float(ids[-1] / meta["fps"]), weight])
    return run_dir


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Test videosunun yolu")
    parser.add_argument("--weights", type=Path, default=PROJECT_ROOT / "models/best.pt")
    parser.add_argument("--device", choices=("auto", "cpu", "cuda", "mps"), default="auto",
                        help="auto: CUDA varsa CUDA, aksi halde CPU. MPS deneysel/isteğe bağlı.")
    parser.add_argument("--batch-size", type=int, default=4, help="Bellek sorunu olursa 1 kullanın")
    parser.add_argument("--threads", type=int, default=min(4, os.cpu_count() or 1))
    parser.add_argument("--output-dir", type=Path, default=PROJECT_ROOT / "outputs/ucf",
                        help="Her çalıştırma altında ayrı tarihli sonuç klasörü oluşturur")
    args = parser.parse_args()
    try:
        if args.batch_size < 1 or args.threads < 1:
            raise ValueError("Batch boyutu ve thread sayısı en az 1 olmalı.")
        source, weights = args.source.expanduser().resolve(), args.weights.expanduser().resolve()
        if not source.is_file():
            raise FileNotFoundError(f"Video bulunamadı: {source}")
        device = choose_device(args.device)
        torch.set_num_threads(args.threads)
        print(f"Cihaz: {device} | Model: {weights}", flush=True)
        model, info = load_model(weights, device)
        meta = read_metadata(source)
        count = len(window_starts(meta, info["clip_config"], info["val_config"]))
        print(f"Epoch: {info['epoch']} | Video: {source.name}\n"
              f"Süre: {meta['duration_s']:.2f} sn | Kaynak FPS: {meta['fps']:.3f}\n"
              f"Klip: {count} | Tam video işleniyor.", flush=True)
        result = infer_video(model, source, meta, info, device, args.batch_size)
        run_dir = save_results(args.output_dir.expanduser().resolve(), source, weights,
                               meta, info, device, args.batch_size, result)
        print(f"\nTahmin: {result['prediction']}\nSoftmax skorları:")
        for name, score in result["softmax_scores"].items():
            print(f"  {name:<12}: {score:.4f}")
        print(f"Toplam süre: {result['elapsed_s']:.1f} sn\nSonuçlar: {run_dir}\n"
              "Video sınıflandırmasıdır; olay zamanı veya kutu üretmez.")
    except (ValueError, RuntimeError, OSError, KeyError, TypeError) as exc:
        parser.exit(2, f"Hata: {exc}\n")
    except KeyboardInterrupt:
        parser.exit(130, "\nİşlem kullanıcı tarafından durduruldu; tamamlanmış tahmin üretilmedi.\n")


if __name__ == "__main__":
    main()
