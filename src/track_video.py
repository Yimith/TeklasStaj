from pathlib import Path

import torch
from ultralytics import YOLO



PROJECT_ROOT = Path(__file__).resolve().parents[1]

MODEL_PATH = PROJECT_ROOT / "models/person_forklift_yolo11n_best.pt"
VIDEO_PATH = PROJECT_ROOT / "data/videos/test2.mp4"
OUTPUT_DIR = PROJECT_ROOT / "outputs/videos"



if not MODEL_PATH.is_file():
    raise FileNotFoundError(f"Model bulunamadı: {MODEL_PATH}")

if not VIDEO_PATH.is_file():
    raise FileNotFoundError(f"Video bulunamadı: {VIDEO_PATH}")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)



device = "mps" if torch.backends.mps.is_available() else "cpu"

print(f"Kullanılan cihaz: {device}")
print(f"Model: {MODEL_PATH}")
print(f"Video: {VIDEO_PATH}")



model = YOLO(str(MODEL_PATH))



results = model.track(
    source=str(VIDEO_PATH),
    tracker="bytetrack.yaml",
    persist=True,
    stream=True,
    conf=0.25,
    iou=0.50,
    device=device,
    save=True,
    project=str(OUTPUT_DIR),
    name="test_track",
    exist_ok=True,
    verbose=True,
)


frame_count = 0
detection_count = 0
track_ids = set()


for result in results:
    frame_count += 1
    boxes = result.boxes

    if boxes is None or len(boxes) == 0:
        continue

    detection_count += len(boxes)

    if boxes.id is not None:
        track_ids.update(boxes.id.int().cpu().tolist())


print("\nİşlem tamamlandı.")
print(f"İşlenen kare sayısı: {frame_count}")
print(f"Toplam kutu tahmini: {detection_count}")
print(f"Benzersiz takip ID sayısı: {len(track_ids)}")
print(f"Sonuç klasörü: {OUTPUT_DIR / 'test_track'}")