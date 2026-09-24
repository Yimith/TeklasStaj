# GitHub kaynak paketinin kapsamı

Hazırlanma tarihi: 24 Eylül 2026. Bu klasör güncel uygulamanın bağımsız kaynak
kopyasıdır; asıl çalışma klasörü taşınmadı, silinmedi veya yeniden düzenlenmedi.

## Alınan son sürümler

- `src/serve_camera.py`: Yerel tek-oturum API.
- `src/live_analysis.py`: İki modelin nedensel kısa-geçmiş çıkarımı ve takip.
- `src/ucf_video_model.py`: Kullanılan R3D Attention MIL mimarisi.
- `src/predict_ucf_video.py`: Ortak model yükleme/ön işleme ve tüm-video CLI testi.
- `frontend/`: Mevcut birleşik analizli kamera paneli; lockfile, kaynaklar,
  gerekli statik demo görseli ve vendored bileşenler dahil.
- `tests/`: İki backend birim test dosyası ve gerçek-model yapay-video kontrolü.
- `models/manifest.json`: Yalnızca kullanılan iki modelin sınıf/boyut/hash kaydı.

Backend ve frontend uygulama mantığı kaynak projeden değiştirilmeden kopyalandı.
Dağıtım belgelerindeki kişiye özel mutlak yollar kaldırıldı; frontend başlatma
yardımcısı standart Node/pnpm kurulumuna göre sadeleştirildi. Birleşik
`requirements.txt` yeni kurulumun tek girişidir. Bunlar paketleme değişiklikleridir.

## Bilinçli olarak dışarıda bırakılanlar

- Tüm `.ipynb` dosyaları, eğitim deneyleri ve Kaggle notebook sürümleri.
- Eğitim artifact'leri, grafikler, checkpoint çıktıları ve eski model alternatifleri.
- Veri setleri, bounding-box etiketleri ve dataset ZIP'leri.
- Kişisel test videoları, üretilen videolar, raporlar ve `outputs/`.
- `.venv`, `node_modules`, build/cache klasörleri ve yerel uygulama ayarları.
- Eski `track_video.py`, OBB denemesi ve etiket kontrol betikleri. Güncel YOLO
  tespiti/takibi `live_analysis.py` içinde yer alır; bu eski deneme girişleri
  birleşik paneli çalıştırmak için gerekli değildir.
- Model ağırlıkları (`.pt`): ayrı edinilip `models/` içine konmalıdır. Paket
  ağırlıklar olmadan kaynak ve tests içerir, gerçek çıkarım yapamaz.

## Eski çalışma deposuyla karıştırmayın

Bu klasörün hazırlanması üst deponun staged içeriğini değiştirmez. Üst depoda
önceden eklenmiş eğitim/veri dosyaları hâlâ bulunabilir. Kaynak paketini GitHub'a
taşırken bu klasörün **içeriğini** esas alın; eski çalışma arşivini birlikte
göndermeyin. Bu işlemde Git deposu oluşturulmadı, commit veya push yapılmadı.
