from pathlib import Path
import tempfile
import time
import uuid

import cv2
import httpx
import numpy as np


def main():
    base = "http://127.0.0.1:8000"
    headers = {"X-Teklas-Client": "camera-wall", "X-Video-Extension": ".mp4"}
    with httpx.Client(base_url=base, timeout=60) as client:
        health = client.get("/api/health").raise_for_status().json()
        if not health["ready"] or health["active_sessions"]:
            raise RuntimeError("Test için modeller hazır olmalı ve aktif analiz oturumu bulunmamalı.")
        with tempfile.TemporaryDirectory(prefix="teklas-smoke-") as folder:
            path = Path(folder) / "synthetic.mp4"
            writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 30, (320, 240))
            if not writer.isOpened():
                raise RuntimeError("Yapay test videosu oluşturulamadı.")
            for i in range(360):
                frame = np.full((240, 320, 3), 45, dtype=np.uint8)
                cv2.rectangle(frame, (i % 220, 70), (i % 220 + 50, 150), (120, 160, 90), -1)
                writer.write(frame)
            writer.release()
            endpoint = f"/api/sessions/{uuid.uuid4()}"
            results = []
            try:
                with path.open("rb") as source:
                    client.put(endpoint, content=source, headers=headers).raise_for_status()
                origin = time.monotonic()
                while (at := time.monotonic() - origin) < 10:
                    result = client.post(endpoint + "/step", json={"time_s": at, "generation": 0}, headers=headers).raise_for_status().json()
                    assert result["frame_time_s"] <= at + .001, "Gelecek kare kullanıldı."
                    results.append(result)
                    time.sleep(.2)
                assert any(item["ucf"] for item in results), "UCF bağlamı birikmedi."
                reset = client.post(endpoint + "/step", json={"time_s": 0, "generation": 1}, headers=headers).raise_for_status().json()
                assert reset["ucf"] is None and reset["context_seconds"] == 0
                times = [r["processing_ms"] for r in results]
                print(f"HTTP testi: {len(results)} adım; UCF ve sarma kontrolü geçti.")
                print(f"İşlem medyanı: {np.median(times):.0f} ms; maksimum: {max(times):.0f} ms; cihaz: {health['device']}")
                print("Yapay video kullanıldı; olay tespit başarısı ölçülmedi.")
            finally:
                client.delete(endpoint, headers=headers).raise_for_status()
            assert not client.get("/api/health").json()["active_sessions"]


if __name__ == "__main__":
    main()
