/**
 * store-png.mjs: write and check PNGs the way App Store Connect and Play Console want them.
 *
 * Generalised from D:\elevare-app scripts/store/compose-screenshots.mjs (commit 6ff5617,
 * wave 6 part 2). Dependency free: node:zlib (crc32 needs Node 22.2 or later) and Buffer.
 *
 *   encodePngRgb(w, h, rgb)   8-bit RGB, colour type 2, NO alpha by construction, an sRGB
 *                             chunk, per-row filter by minimum absolute sum, zlib level 9.
 *                             No tIME chunk and no text chunks, so the same pixels give the
 *                             same bytes on every run (a rerun is byte identical).
 *   pngFacts(buf)             size, depth, colour type, alpha (colour type 4/6 or tRNS),
 *                             sRGB / iCCP present, byte length. Reads chunk headers only.
 *   outputProblems(buf, w, h, { maxBytes })
 *                             [] or the reasons a store would reject or mis-render it.
 *
 * Proven by ./store-shots.selftest.mjs (planted RGBA, wrong size, missing sRGB, oversize).
 */
import { crc32, deflateSync } from 'node:zlib';

export const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Apple's screenshot upload limit is 8 MB per file at the time of harvest; read the Media Manager on the day. */
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/** Encode 8-bit RGB (or RGBA with { alpha: true }, which outputProblems will then refuse). */
export function encodePngRgb(w, h, pixels, { alpha = false, srgb = true } = {}) {
  const bpp = alpha ? 4 : 3;
  const stride = w * bpp;
  if (pixels.length !== stride * h) throw new Error(`pixel buffer is ${pixels.length} bytes, expected ${stride * h}`);
  const out = Buffer.alloc((stride + 1) * h);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  const zero = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const cur = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y ? pixels.subarray((y - 1) * stride, y * stride) : zero;
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const c = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const cc = i >= bpp ? prev[i - bpp] : 0;
        let pred = 0;
        if (f === 1) pred = a;
        else if (f === 2) pred = b;
        else if (f === 3) pred = (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - cc;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - cc);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : cc;
        }
        const v = (cur[i] - pred) & 0xff;
        c[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    out[y * (stride + 1)] = best;
    cand[best].copy(out, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    ...(srgb ? [chunk('sRGB', Buffer.from([0]))] : []), // perceptual rendering intent
    chunk('IDAT', deflateSync(out, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** What a store checks, read from chunk headers. No decoding. */
export function pngFacts(buf) {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG)) return { ok: false, why: 'not a PNG' };
  const chunks = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    chunks.push(buf.toString('ascii', off + 4, off + 8));
    off += 12 + len;
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const depth = buf[24];
  const colorType = buf[25];
  const alpha = colorType === 4 || colorType === 6 || chunks.includes('tRNS');
  return { ok: true, w, h, depth, colorType, alpha, srgb: chunks.includes('sRGB'), iccp: chunks.includes('iCCP'), bytes: buf.length };
}

export function outputProblems(buf, w, h, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const f = pngFacts(buf);
  if (!f.ok) return [f.why];
  const p = [];
  if (f.w !== w || f.h !== h) p.push(`${f.w}x${f.h}, expected ${w}x${h}`);
  if (f.alpha) p.push(`alpha channel present (colour type ${f.colorType})`);
  if (f.colorType !== 2) p.push(`colour type ${f.colorType}, expected 2 (RGB)`);
  if (f.depth !== 8) p.push(`bit depth ${f.depth}, expected 8`);
  if (!f.srgb && !f.iccp) p.push('no sRGB or iCCP chunk');
  if (f.bytes >= maxBytes) p.push(`${f.bytes} bytes, the limit is ${maxBytes}`);
  return p;
}
