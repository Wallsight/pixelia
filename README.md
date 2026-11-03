# Pixelia

Prosedürel üretilmiş, pastel tonlu voksel bir "yaşayan dünya" yürüyüş oyunu. Oyun yok, görev yok: sadece keşif.

**Oyna:** https://pixeliaverse.github.io/

- 18 biyom, kaleler, yollar, köyler ve başlangıç noktası olan canlı bir şehir (Külkent)
- Birbiriyle konuşan, alışveriş yapan, oyun oynayan NPC'ler
- Hayvanlar, balıklar, kuş sürüleri ve avlanıp uyuyan ejderhalar
- Gizli yerler, söylentiler, sisli harita ve keşif bildirimleri
- Tamamen tarayıcıda üretilen sesler ve müzik (hiç ses dosyası yok)

## Kontroller

| Tuş | İşlev |
| --- | --- |
| Fare | Etrafa bak |
| W A S D | Yürü (Shift: koş) |
| Boşluk | Zıpla / yüz |
| M | Harita |
| T | Zamanı hızlandır |
| N / B | Ses / müzik aç-kapa |
| F | Uçma modu |
| F3 | Bilgi paneli |

URL parametreleri: `?seed=123` (dünya tohumu), `?rd=12` (görüş mesafesi, 4-24), `?shadows=0`, `?hour=20`.

## Geliştirme

```sh
npm ci
npm run dev      # http://127.0.0.1:5173
npm run build
npm test
npm run deploy   # derleyip gh-pages dalına yayınlar
```

Three.js dışında bağımlılık yoktur; dokular, modeller ve sesler çalışma anında üretilir.
