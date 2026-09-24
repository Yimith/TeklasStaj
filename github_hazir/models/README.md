# Kullanılan son model ağırlıkları

Bu klasörde ağırlık dosyaları **yoktur**. GitHub kaynak paketinin eğitim arşivi
veya büyük binary deposu olmaması için ayrı tutulmuştur. Analiz yapabilmek için
mevcut çalışma projesindeki aşağıdaki iki dosyayı buraya kopyalayın.

| Dosya | Görev | Sınıflar | Bayt |
| --- | --- | --- | ---: |
| `best.pt` | R3D-18 + Attention MIL | Normal, Fighting, Assault, Arson | 333012509 |
| `forklift_3class_best.pt` | YOLO + ByteTrack | forklift, person, forklift_tipped | 5466202 |

Dosya adı "best" tek başına model sürümünü tanımlamaz. Doğru kopyaları
doğrulamak için [manifest.json](manifest.json) içindeki SHA-256 değerlerini kullanın.

İki dosya eklendiğinde `src/serve_camera.py` bunları otomatik bulur. Eksik veya
uyumsuz modelde servis/panel hata gösterir; sahte Normal sonucu üretilmez.

Ağırlıklar `.gitignore` ile dışlanır. Bu dosyaları dağıtmak isterseniz Git LFS
veya ayrı bir ağırlık dağıtım kanalı ayrıca yapılandırılmalıdır; bu pakette
otomatik indirme adresi veya erişim anahtarı yoktur. Güvenilmeyen `.pt` dosyaları
kullanılmamalıdır.

Dahil edilmeyen alternatifler: `best7class.pt`, `forklift_obb_best.pt`,
`person_forklift_yolo11n_best.pt` ve eğitim artifact klasörleri.
