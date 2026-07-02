// PWA 플레이스홀더 아이콘 생성기 (외부 의존성 없이 순수 Node로 PNG 생성)
// 사용: node scripts/gen-icons.mjs  → public/icons/*.png
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixelFn) {
  // 필터 바이트 0 + RGBA 스캔라인
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      const i = rowStart + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 디자인: 남색 배경 + 장미색 원 + 흰색 "쉿" 느낌의 세로 바 2개 (일시정지 아이콘 모티프)
const BG = [0x1a, 0x1a, 0x2e, 255];
const ACCENT = [0xe9, 0x45, 0x60, 255];
const WHITE = [0xf5, 0xf5, 0xf5, 255];

function iconPixel(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const d = Math.hypot(x - cx, y - cy);
  if (d < size * 0.38) {
    // 원 내부: 일시정지 바 2개
    const barW = size * 0.075;
    const barH = size * 0.26;
    const gap = size * 0.07;
    const inBarY = Math.abs(y - cy) < barH / 2;
    const inLeft = Math.abs(x - (cx - gap)) < barW / 2;
    const inRight = Math.abs(x - (cx + gap)) < barW / 2;
    if (inBarY && (inLeft || inRight)) return WHITE;
    return ACCENT;
  }
  if (d < size * 0.4) return WHITE; // 얇은 링
  return BG;
}

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(outDir, name), encodePng(size, iconPixel));
  console.log(`generated ${name} (${size}x${size})`);
}
