# Örnek kamera görselleri

- Dosya: `public/camera-demo.png`
- Araç: built-in `image_gen`, imagegen becerisi; CLI/API fallback kullanılmadı.
- Tek üretim, 1774 × 887 piksel; altı sahne 3 × 2 düzende. Her kamera aynı sprite içindeki ilgili sahneyi CSS ile gösterir. Görüntü dosyası sonradan düzenlenmedi.
- İçerik kurgusaldır. Gerçek kamera görüntüsü, gerçek olay veya model sonucu değildir. Hiçbir kullanıcı videosu görüntü üretimine gönderilmedi.

## Üretim promptu

```text
Use case: photorealistic-natural
Asset type: one static photographic contact-sheet sprite for six simulated factory surveillance camera posters.
Primary request: Produce EXACTLY ONE image. Landscape canvas with exactly THREE equal columns and TWO equal rows, forming six equal 4:3 photographic panels. Overall canvas aspect ratio 2:1 (for example 3072×1536); mathematical grid boundaries at 1/3 and 2/3 of the width and 1/2 of the height. All photographs touch edge to edge with absolutely no gutters, border lines, framing, margin, rounded corners or padding. Fill the entire canvas. The result is six separate camera views, not one continuous scene.
Style: photorealistic fixed high-angle CCTV stills of a fictional industrial factory, wide views, realistic concrete and metal textures, modest surveillance-camera detail, natural muted warehouse and daylight lighting, believable scale.
Panels in exact reading order:
TOP LEFT: Indoor production line with machinery and several adult workers in ordinary factory workwear, broad high ceiling view.
TOP MIDDLE: Warehouse aisle with tall storage racks, one upright yellow forklift, and an adult worker nearby.
TOP RIGHT: Outdoor loading yard by an industrial building, a small localized material fire with visible orange flames and rising gray smoke. No person harmed or near the flames.
BOTTOM LEFT: Dispatch lane viewed from overhead, one upright yellow forklift and an adult worker beside the designated lane.
BOTTOM MIDDLE: Factory corridor, two distant adult workers in a non-graphic pushing altercation, standing with extended arms touching each other's shoulders. Small in frame, full bodies visible, no weapons, no blood, no injuries.
BOTTOM RIGHT: Concrete industrial yard with a yellow forklift clearly overturned and lying on its SIDE, sideways wheels visible and mast horizontal to the ground. No trapped people, no people under or touching the forklift, no injuries.
Constraints: Only six photographic panels; exact 3×2 equal grid. No UI, no detection boxes, no labels, no timestamps, no text, no letters, no logos, no watermark, no borders. This is a fictional static visual simulation asset and contains no real incident or model results.
```
