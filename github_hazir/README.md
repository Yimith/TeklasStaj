# Teklas · UCF + Forklift İzleme

**Güncel uygulama kopyası · 24 Eylül 2026**

Kayıtlı fabrika videolarını kamera panelinde oynatırken aynı görüntü üzerinde
olay sınıflandırması ve nesne tespiti/takibi yapan yerel prototip.
Bu klasör yalnızca mevcut uygulamanın kaynaklarını içerir; eğitim ve deneme arşivi değildir.

## Güncel kapsam

- Altı video alanı; **aynı anda bir aktif analiz kamerası**.
- UCF: R3D-18 + Attention MIL, dört sınıf: Normal, Fighting, Assault, Arson.
- Forklift: YOLO + ByteTrack; person, forklift, forklift_tipped.
- Aynı kamerada iki modelin sonuçları, nesne kutuları ve takip ID'leri.
- Oynatma, duraklatma, sarma, döngü, gecikme göstergesi ve eski sonuçların gizlenmesi.
- UCF kısa-geçmiş çıkarımı deneyseldir: son yaklaşık 8 saniyeyi değerlendirir;
  ilk karar için en az 4 saniye bağlam gerekir. Kesin olay başlangıç/bitişi değildir.
- UCF Normal sonucu, devrilmiş forklift uyarısını bastırmaz.

| Model sınıfı | Arayüz başlığı |
| --- | --- |
| Normal | Normal |
| Arson | Yangın ve patlama tehlikesi (Arson) |
| Fighting | Olası şiddet olayı (Fighting) |
| Assault | Olası şiddet olayı (Assault) |

Arson başlığı bağımsız bir patlama modeli anlamına gelmez. Bu sürüm altı kamerayı
eşzamanlı analiz etmez; RTSP veya doğrulanmış iş güvenliği alarm sistemi değildir.

## Klasörler

```text
src/                   Güncel backend ve model çıkarım kodu
frontend/              Kamera paneli, kaynaklar ve kilitli bağımlılıklar
models/                Gerekli iki ağırlığın açıklaması ve SHA-256 kaydı
docs/                  Çalışma biçimi ve paket kapsamı
tests/                 Backend testleri ve yapay-video kontrolü
requirements.txt       Backend için tek kurulum girişi
```

**Notebooklar, eğitim kodları/çıktıları, veri setleri, kişisel test videoları,
eski model sürümleri, `.venv`, `node_modules` ve derlenmiş çıktılar bu pakete alınmadı.**
Model ağırlıkları da kaynak paketinden ayrıdır; uygulamanın analiz yapması için
aşağıdaki iki dosyayı ayrıca eklemek gerekir.

## Kurulum

Python 3.10+, Node.js 22.13+ ve pnpm 11 gerekir. Aşağıdaki komutları
**bu README'nin bulunduğu klasörde** çalıştırın. GitHub'a bu klasörün içeriği
depo kökü olarak konabilir; `github_hazir` adını korumak zorunlu değildir.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Windows'ta `.venv/bin/python` yerine `.venv\Scripts\python.exe` kullanılır.
CUDA kurulumu kullanılan sisteme uygun PyTorch/torchvision sürümlerini gerektirir.
Paket Python bağımlılıklarını sürüm aralıklarıyla tanımlar; her platformda aynı
GPU sürümünün kurulacağını varsaymaz.

### Model dosyaları

Yalnızca kendi/güvenilir model dosyalarınızı şu adlarla yerleştirin:

```text
models/best.pt                    UCF · 4 sınıf
models/forklift_3class_best.pt     YOLO · 3 sınıf
```

[Model açıklaması](models/README.md) ve [boyut/hash kaydı](models/manifest.json)
hangi dosyaların kullanıldığını belirtir. `best7class.pt`, OBB veya önceki iki
sınıflı forklift ağırlıkları bu uygulamanın güncel modelleri değildir.

### İki terminalle başlatma

Birinci terminal, proje kökünde:

```bash
.venv/bin/python src/serve_camera.py
```

İkinci terminal, proje kökünde:

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

**Panel: http://127.0.0.1:5173/**

`8000` Python API portudur; orada web arayüzü yoktur. İki terminal açık kalmalı.
Panelde model hazır mesajını gördükten sonra video seçin → **Birlikte analiz et** →
hazır mesajı → **Oynat**. Bir başka kamerada analiz başlatmak önceki analizi kapatır.

Videolar sadece bu bilgisayardaki servise aktarılır; internete yüklenmez.
Geçici kopya oturum kapandığında temizlenir. Ayrıntılar: [Backend rehberi](docs/camera_backend.md).

## Testler

Backend, model dosyası veya kişisel video gerektirmeyen birim testleri:

```bash
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

Frontend:

```bash
cd frontend
pnpm typecheck
pnpm test
pnpm build
```

Açık/boş backend ve iki model ağırlığı varken `tests/smoke_live_camera.py`, geçici
yapay videoyla gerçek HTTP çıkarım akışını kontrol eder. Gerçek olay başarısını ölçmez.

## GitHub'a hazırlık

Bu klasörde `.git` oluşturulmadı; commit/push yapılmadı. [.gitignore](.gitignore)
notebook, veri/video, model ağırlığı, bağımlılık ve yerel ayar dosyalarını dışlar.
Model ağırlıklarını standart kaynak commit'ine eklemeyin; paylaşımı ayrıca planlayın.

Bu klasör eski çalışma deposunun içinde duruyorsa **üst depodaki staged dosyalar
bu paketle temizlenmiş olmaz**. Önceki eğitim/veri dosyalarını yanlışlıkla
göndermemek için üst klasörde doğrudan `git add .` / `git commit` çalıştırmayın.
Bu hazırlık, orijinal çalışma dosyalarını veya Git indeksini değiştirmez.

Paket seçimleri: [PAKET_ICERIGI.md](docs/PAKET_ICERIGI.md).
