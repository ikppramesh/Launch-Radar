import { deflateSync } from 'node:zlib';

// Text-free share card for each day (1200×630 PNG, the size link previews expect).
// A radar holds one blip per launch and the launch count is drawn in seven-segment digits.
// Pixels are drawn by hand and encoded with node:zlib, so there are no dependencies to install.
const W = 1200;
const H = 630;
const BG = [23, 23, 28];
const RING = [46, 46, 56];
const MUTED = [107, 107, 115];
const ACCENT = [255, 90, 31];
const RADAR = { cx: 860, cy: 315, r: 230 };
const MAX_BLIPS = 60;
const DIGIT = { w: 110, h: 200, t: 22, gap: 24, x: 90, y: 215 };

const SEGMENTS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])), 0);
  return Buffer.concat([head, data, crc]);
}

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function forBox(x0, y0, x1, y1, fn) {
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) fn(x, y);
  }
}

function paint(px, x, y, color, alpha) {
  const i = (y * W + x) * 3;
  for (let k = 0; k < 3; k++) px[i + k] += (color[k] - px[i + k]) * alpha;
}

function rect(px, x, y, w, h, color) {
  forBox(x, y, x + w - 1, y + h - 1, (X, Y) => paint(px, X, Y, color, 1));
}

// Anti-aliased edges: coverage falls off over one pixel.
function disc(px, cx, cy, r, color) {
  forBox(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (x, y) => {
    const cov = clamp(r - Math.hypot(x - cx, y - cy) + 0.5);
    if (cov > 0) paint(px, x, y, color, cov);
  });
}

function ring(px, cx, cy, r, w, color) {
  forBox(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    const cov = Math.min(clamp(d - (r - w) + 0.5), clamp(r - d + 0.5));
    if (cov > 0) paint(px, x, y, color, cov);
  });
}

// The sweep is a faint wedge in the upper-right quadrant, brightest at the leading edge.
function sweep(px, cx, cy, r) {
  const span = Math.PI / 3;
  forBox(cx - r, cy - r, cx + r, cy + r, (x, y) => {
    const dx = x - cx;
    const dy = cy - y;
    const a = Math.atan2(dy, dx);
    if (a >= 0 && a <= span && Math.hypot(dx, dy) <= r) paint(px, x, y, ACCENT, 0.05 + 0.25 * (a / span));
  });
}

function digit(px, x, y, w, h, t, d) {
  const half = (h - 3 * t) / 2;
  const parts = {
    a: [x + t, y, w - 2 * t, t],
    b: [x + w - t, y + t, t, half],
    c: [x + w - t, y + 2 * t + half, t, half],
    d: [x + t, y + h - t, w - 2 * t, t],
    e: [x, y + 2 * t + half, t, half],
    f: [x, y + t, t, half],
    g: [x + t, y + t + half, w - 2 * t, t],
  };
  for (const s of SEGMENTS[d]) rect(px, ...parts[s], ACCENT);
}

// FNV-1a: a stable hash, so each launch keeps the same spot on the radar from run to run.
function hash(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function encodePng(px) {
  const stride = W * 3;
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0; // filter type "none"
    raw.set(px.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// items: the day's records. Returns PNG bytes.
export function renderShareCard(items) {
  const px = new Uint8ClampedArray(W * H * 3);
  rect(px, 0, 0, W, H, BG);
  rect(px, 0, 0, W, 8, ACCENT);

  const { cx, cy, r } = RADAR;
  ring(px, cx, cy, r, 3, RING);
  ring(px, cx, cy, (r * 2) / 3, 2, RING);
  ring(px, cx, cy, r / 3, 2, RING);
  rect(px, cx - r, cy - 1, 2 * r, 2, RING);
  rect(px, cx - 1, cy - r, 2, 2 * r, RING);
  sweep(px, cx, cy, r);
  ring(px, cx, cy, r, 3, RING);

  for (const it of items.slice(0, MAX_BLIPS)) {
    const h = hash(it.id);
    const angle = ((h % 3600) / 3600) * 2 * Math.PI;
    const dist = r * (0.22 + 0.7 * (((h >>> 12) % 1000) / 1000));
    const x = cx + dist * Math.cos(angle);
    const y = cy - dist * Math.sin(angle);
    const size = 6 + Math.min(it.sources.length, 6) * 2;
    if (it.status === 'Launched') disc(px, x, y, size, ACCENT);
    else ring(px, x, y, size, 3, MUTED);
  }
  disc(px, cx, cy, 6, ACCENT);

  const digits = String(Math.min(items.length, 99)).split('').map(Number);
  const { w, h, t, gap, x, y } = DIGIT;
  digits.forEach((d, i) => digit(px, x + i * (w + gap), y, w, h, t, d));
  rect(px, x, y + h + 40, digits.length * w + (digits.length - 1) * gap, 4, ACCENT);

  return encodePng(px);
}
