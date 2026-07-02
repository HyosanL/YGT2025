# YGT 2025 PWA 아이콘 세트

## 파일
| 파일 | 용도 |
|---|---|
| icon-192.png / icon-512.png | manifest `purpose: "any"` |
| icon-maskable-192.png / icon-maskable-512.png | manifest `purpose: "maskable"` (안드로이드 원형/스쿼클 마스크 대응, 콘텐츠 78% 축소) |
| apple-touch-icon.png | iOS 홈 화면 (180x180, iOS가 모서리를 알아서 둥글림) |
| favicon.ico (16/32/48) + favicon-16/32.png | 브라우저 탭 |
| icon-any.svg / icon-maskable.svg | 원본 벡터 (수정 후 재추출용) |

## 배치
전부 `public/icons/` 에 두고, favicon.ico만 `public/` 루트에.

## manifest.webmanifest
```json
"icons": [
  { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
  { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
],
"theme_color": "#ff8c42",
"background_color": "#ff8c42"
```

## index.html
```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#ff8c42">
```
