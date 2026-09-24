# Teklas kamera paneli

UCF ve forklift analizini gösteren kamera paneli. React, TypeScript,
Vinext/Vite, Tailwind ve Shadcn/Base UI bileşenlerini kullanır.
Python servisini çalıştırmadan videolar oynatılabilir, ancak model analizi yapılamaz.

## Çalıştırma

Önce [ana README](../README.md) üzerinden Python ortamını ve model dosyalarını hazırlayın.
Backend ayrı terminalde `python src/serve_camera.py` ile çalışmalıdır (proje sanal ortamını kullanın).

Bu klasörde, Node.js 22.13+ ve pnpm 11 ile:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Panel: http://127.0.0.1:5173/ — API proxy: http://127.0.0.1:8000/.
macOS/Linux için proje kökünden `bash frontend/dev.sh` de kullanılabilir.

Video seç → Birlikte analiz et → hazır mesajını bekle → Oynat.
Altı video alanı vardır, ilk sürümde bir kamera analiz edilir. Tüm kameralar
UCF + Forklift modundadır. Kamera değiştirilince önceki analiz oturumu kapanır.

## Gerçek sonuç ve demo

- Boş kameralardaki posterler ve örnek kutular kurgusal demodur. [Görsel kaydı](ASSETS.md).
- Kendi videosunu seçen kamerada demo kutu/uyarı gösterilmez.
- Gerçek analiz yalnızca kullanıcı başlatınca yapılır. Dosya yalnızca yerel Python servisine aktarılır.
- Nesne kutuları, takip ID'leri, UCF sonucu ve gecikme aynı paneldedir.
- Eski sonuçlar gizlenir; durdurma/sarma/döngü model geçmişini uygun şekilde yönetir.
- UCF kısa-geçmiş değerlendirmesi deneyseldir; pencere sınırları kesin olay zamanı değildir.
- Yerel seçimler yenilemede kaybolur; model ağırlıkları tarayıcı paketine girmez.

## Kontroller

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm start` üretim önizlemesini 4173 portunda açar; Python API yine gereklidir.
Statik dosyaların internete yüklenmesi Python çıkarım servisini yayınlamaz.

Kaynaklar: `app/` sayfa/stiller, `components/` kamera ve durum alanları,
`hooks/` oynatma/analiz bağlantısı, `lib/` ortak mantık, `tests/` birim testleri.
