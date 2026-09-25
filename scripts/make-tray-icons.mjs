// Gera os ícones da bandeja em public/tray a partir das formas da borboleta (#i-butterfly no index.html).
// Uso: node scripts/make-tray-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const VIEWBOX = 56;
// Na ordem de pintura do SVG: a última forma fica por cima.
const SHAPES = [
  { type: 'ellipse', cx: 15.7, cy: 17.9, rx: 14, ry: 11.2, color: [0x2e, 0x7f, 0xe0] },
  { type: 'ellipse', cx: 40.3, cy: 17.9, rx: 14, ry: 11.2, color: [0x2e, 0x7f, 0xe0] },
  { type: 'ellipse', cx: 19, cy: 39.2, rx: 10, ry: 8.4, color: [0x6b, 0x3f, 0xa0] },
  { type: 'ellipse', cx: 37, cy: 39.2, rx: 10, ry: 8.4, color: [0x6b, 0x3f, 0xa0] },
  { type: 'rect', x: 25.8, y: 10.6, w: 4.4, h: 34.8, color: [0x1a, 0x2b, 0x45] },
];
const SAMPLES = 4; // 4×4 amostras por pixel (antisserrilhado)

const inside = (s, x, y) =>
  s.type === 'ellipse'
    ? ((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2 <= 1
    : x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;

function render(size, template) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = VIEWBOX / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) * scale;
          const y = (py + (sy + 0.5) / SAMPLES) * scale;
          const top = SHAPES.findLast((s) => inside(s, x, y));
          if (!top) continue;
          hits++;
          r += top.color[0];
          g += top.color[1];
          b += top.color[2];
        }
      }
      const i = (py * size + px) * 4;
      if (hits === 0) continue;
      // Template do macOS: só preto + transparência; o sistema pinta conforme o tema.
      rgba[i] = template ? 0 : Math.round(r / hits);
      rgba[i + 1] = template ? 0 : Math.round(g / hits);
      rgba[i + 2] = template ? 0 : Math.round(b / hits);
      rgba[i + 3] = Math.round((255 * hits) / (SAMPLES * SAMPLES));
    }
  }
  return encodePng(size, rgba);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
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

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/tray/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const [file, size, template] of [
  ['tray.png', 16, false],
  ['tray@2x.png', 32, false],
  ['trayTemplate.png', 16, true],
  ['trayTemplate@2x.png', 32, true],
]) {
  writeFileSync(new URL(file, out), render(size, template));
  console.log(`public/tray/${file}`);
}
