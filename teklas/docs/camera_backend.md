# Tek kamerada UCF + Forklift

## Çalıştırma

Bu kaynak paketinin kökünde ilk kurulum (Python 3.10+):

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

İki model ağırlığını `models/` içine koyun (bkz. `models/README.md`).
Birinci terminal, paket kökünde:

```bash
.venv/bin/python src/serve_camera.py
```

İkinci terminal, paket kökünde (Node.js 22.13+ ve pnpm 11 kurulu olmalı):

```bash
bash frontend/dev.sh
```

http://127.0.0.1:5173/ adresini aç. İki terminal de açık kalmalı.
Panelde **İki model hazır** yazmasını bekle. Bir kameraya video seç, altındaki
**Birlikte analiz et** düğmesine bas. Hazır mesajından sonra alt oynatma
düğmesine bas. Aynı kamera UCF + Forklift kullanır. Başka kamerada analizi
başlatmak mevcut analiz oturumunu kapatır; diğer videolar yalnızca oynatılır.

`auto`: CUDA varsa CUDA, Mac'te destekleniyorsa MPS, aksi halde CPU.
R3D için MPS ısınma kontrolü başarısız olursa otomatik CPU'ya döner.
Sorun halinde açık backend'i Ctrl+C ile durdurup:

```bash
.venv/bin/python src/serve_camera.py --device cpu
```

Orijinal `predict_ucf_video.py` cihaz seçimi ve tam-video testi değişmedi.

## Gerçekte ne yapıyor?

- `models/best.pt`: mevcut dört sınıflı R3D-18 Attention MIL ağırlıkları.
- `models/forklift_3class_best.pt`: person/forklift/forklift_tipped ve ByteTrack.
- Modeller servis açılırken bir kez yüklenir, test ağırlıkları indirilmez.
- Video yalnızca **analizi başlatınca**, yerel Python servisine geçici kopyalanır.
  Yükleme videoyu baştan analiz etmez. Çıkarım oynatma başlayınca yürür.
- Tarayıcı gerçek `video.currentTime` değerini gönderir. Servis yalnızca bu
  zamana kadar olan kareleri çözer; gelecek karelere veya tüm-video son kararına bakmaz.
- Her istekte geçerli karenin YOLO kutuları/takip ID'leri üretilir. İstekler
  üst üste birikmez; istemci aynı anda tek çıkarım isteği gönderir. Hedef en çok
  yaklaşık 5 örnek/sn; gerçek hız cihaz ve video çözmeye bağlıdır.
- UCF checkpoint'teki ön işlem korunur: 16 kare, 15 FPS, 112×112 letterbox,
  RGB ve kayıtlı normalizasyon. Kaynak nominal FPS üzerinden kare örneklenir.
- Yaklaşık her 0.53 video saniyesinde, o anda biten 1 saniyelik klip kodlanır.
  Son en fazla 8 saniyedeki klip özellikleri MIL ile birleştirilir. İlk karar
  için en az 4 saniye bağlam ve 3 klip gerekir. Yavaş cihazda klip adımı büyür;
  bu tam-kare veya tüm-klip taraması değildir, kısa olaylar kaçabilir.
- Kullanıcı durdurunca yeni çıkarım isteği gönderilmez. İşlemde olan son istek
  tamamlanabilir. Sarma/yeniden başlama/döngü/kamera değişiminde geçmiş ve takip
  sıfırlanır. 2 saniyeden büyük örnekleme boşluğunda da bağlam yeniden toplanır.
- 0.8 saniyeden eski nesne kutuları, 2 saniyeden eski UCF sonucu gizlenir.
  Gecikme görünürdür; hız düşürülerek denenebilir. Bu değerler mühendislik
  varsayılanıdır, doğrulanmış alarm eşikleri değildir.
- Kutular SVG ile videonun `object-fit: contain` alanına hizalanır.
  Sonuçta box confidence yazabilir; bu kalibre edilmiş kesinlik yüzdesi değildir.

## Yorum sınırları

Bu bir **kayıtlı videoyu canlıymış gibi oynatırken analiz prototipidir**;
RTSP/kamera donanımı entegrasyonu veya doğrulanmış güvenlik alarm sistemi değildir.
UCF modeli tam-video etiketleriyle eğitildi. Kısa-geçmiş çıkarımı **deneyseldir**:
eski validation F1 değeri bu mod için geçerli kabul edilemez. Yeniden eğitim
yapılmadı. Pencere zamanları olayın kesin başlangıç/bitiş etiketi değildir;
attention olay olasılığı gibi gösterilmez. Her pencere tek sınıf tahmin eder,
eşzamanlı birden fazla UCF olayı ayrı çıkmaz.

UI etiketleri:

- Normal → Normal (yalnızca UCF değerlendirmesi)
- Arson → Yangın ve patlama tehlikesi (Arson)
- Fighting → Olası şiddet olayı (Fighting)
- Assault → Olası şiddet olayı (Assault)

Arson başlığı bağımsız Explosion modeli anlamına gelmez. UCF Normal olsa bile
forklift_tipped kutusu ve uyarısı korunur. Henüz zamansal alarm doğrulama/histerezis
yoktur; görünen uyarı model tahminidir ve titreşebilir. Telefon, e-posta veya dış
servise alarm gönderilmez. Kayıtlı olay geçmişi/veritabanı bu sürümde yoktur.

## Yerellik ve kaynak kullanımı

- Python yalnızca `127.0.0.1:8000`, panel `127.0.0.1:5173` üzerinde dinler.
  Vite `/api` isteklerini yerel Python'a yönlendirir. `pnpm start` önizlemesinde
  de aynı proxy vardır; dışarı dağıtılan statik HTML tek başına API içermez.
- API tam dosya yolu, URL veya model yüklemesi kabul etmez. Rastgele UUID
  oturumu, boyut sınırı (512 MiB), izinli uzantı, host/origin kontrolü ve mutasyon
  başlığı kullanılır. Bu LAN/internet dağıtımına uygun bir kimlik doğrulama sistemi değildir.
- Aynı anda tek oturum. Model/tracker istekleri kilitli ve seri çalışır; farklı
  kameraların ID/geçmişleri karışmaz.
- Geçici kopya analiz kapatılınca temizlenir. Sekme kapanınca temizleme isteği
  gönderilir; bağlantı koparsa yaklaşık 3–3.5 dakika içinde oturum temizlenir.
  Normal servis kapanışında da temizlenir. Zorla process öldürme/güç kesintisi
  halinde sistem geçici klasöründe artık kopya kalabilir. Orijinal video silinmez.
- Model ağırlıkları kaynak paketinden ayrıdır. Çalıştırma yeni eğitim yapmaz;
  mevcut ağırlıklar yalnızca okunur. Eğitim notebookları bu pakette bulunmaz.

## Kontroller

```bash
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
.venv/bin/python tests/smoke_live_camera.py
```

İkinci komut açık/boş backend ister. Geçici yapay video oluşturup gerçek modeller
üzerinden HTTP yükleme, çıkarım, sarma ve temizliği sınar. Kullanıcı videolarını
açmaz ve olay doğruluğunu ölçmez. Birim testleri nedensellik, sınırlı bellek,
sarma/döngü, tek oturum, dosya/origin kontrolü ve temizlik yollarını kapsar.

Frontend: `pnpm typecheck`, `pnpm test`, `pnpm build`.

Kaynak projenin geliştirildiği Mac'teki yapay-video HTTP kontrolünde MPS işlem medyanı yaklaşık
442 ms (13 adım), CPU medyanı yaklaşık 1106 ms (8 adım) ölçüldü; ısınma
adımlarında daha uzun süreler görüldü. Bunlar gerçek CCTV FPS garantisi değildir.
Tarayıcıda yapay WebM seçme, iki modeli başlatma, oynatma sırasında sonucu görme,
duraklatma ve başa sarınca eski sonucu temizleme de kontrol edildi.

Sonraki gerçek test: Senin seçeceğin bir videoda uyarıların doğruluğu, küçük
nesneler, takip ID değişimleri ve gecikme ölçülmeli; bundan sonra çoklu kamera
analizine geçilmeli.

API/izleme referansları: [FastAPI Request](https://fastapi.tiangolo.com/advanced/using-request-directly/),
[Ultralytics takip](https://docs.ultralytics.com/modes/track/).
