# Model ağırlıkları

Ağırlık dosyaları depoda bulunmaz. Analiz için aşağıdaki iki dosyayı
`models/` klasörüne ekleyin.

| Dosya | Görev | Sınıflar | Bayt |
| --- | --- | --- | ---: |
| `best.pt` | R3D-18 + Attention MIL | Normal, Fighting, Assault, Arson | 333012509 |
| `forklift_3class_best.pt` | YOLO + ByteTrack | forklift, person, forklift_tipped | 5466202 |

Eğitim notebookları: [UCF](../notebooks/ucf-data_v1.ipynb) ve
[forklift](../notebooks/objectdetection_3class_kaggle.ipynb).

Dosyaları [manifest.json](manifest.json) içindeki SHA-256 değerleriyle doğrulayın.

`src/serve_camera.py` modelleri bu klasörden yükler. Eksik veya uyumsuz
dosya varsa analiz başlatılamaz.

Ağırlıklar `.gitignore` ile dışlanır ve otomatik indirilmez. Paylaşım için
Git LFS veya ayrı bir dosya sunucusu kullanılabilir. Yalnızca güvenilir
kaynaklardan alınan `.pt` dosyalarını kullanın.

Dahil edilmeyen alternatifler: `best7class.pt`, `forklift_obb_best.pt`,
`person_forklift_yolo11n_best.pt` ve eğitim artifact klasörleri.
