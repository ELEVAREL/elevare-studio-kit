# HTML → true 300-DPI print ad (PNG + vector PDF, no Photoshop)

**When to reach for it:** a client needs a **print-ready advertisement** at an exact physical size and resolution — a newspaper/magazine quarter-page, a flyer, a poster, a rack card, a mailer — and you want to author it in HTML/CSS (fast iteration, real type, a tokenized design system) instead of a design tool. This produces **both** deliverables a print vendor asks for: a raster PNG stamped with a real DPI, and a vector PDF sized to the exact trim. No InDesign/Photoshop, no paid tooling — just Node + a locally-installed Chrome.

**Assumes / adapt:**
- **Design at the exact pixel target.** physical size × DPI = the canvas. 5×7in @ 300 DPI = **1500×2100px**; a full US-Letter flyer @ 300 = 2550×3300; a business card 3.5×2in @ 300 = 1050×600. Set `html,body,.ad{width:Wpx;height:Hpx}` to that number and lay everything out in px against it. One `build.mjs` writes every variant so they share one CSS design system (see [`shared-ad-design-system.md`](shared-ad-design-system.md)).
- **PNG = `D:\.claude\agents\tools\render-png.mjs`**, which sends the render to the on-prem worker (prox CT 112) and only falls back to local Chrome when prox is unreachable. `--width W --height H --scale 1` is the 1:1 canvas (the helper's `scale` is the device pixel ratio, exactly the old `--force-device-scale-factor`), and it already sets a white background and hides scrollbars on the local fallback so bleed/edges are clean. The raw local invocation below still works and is what the helper's fallback runs; prefer the helper so the laptop is not doing the rasterizing.
- **★ Before you route a print ad through the worker, BASE64-EMBED the fonts and images.** The worker is a container on another machine and cannot read `D:` — the local self-hosted `fonts.css` and any `file:///` image referenced further down this doc resolve to nothing there, and Playwright does not error: the page settles, the screenshot succeeds, and you ship a 300-DPI ad in Liberation Serif with blank photo slots. Verified 2026-09-07. Either inline every asset as a data URI (then the worker is the better renderer, since it also loads Google Fonts) or pass `--no-fallback`-free local rendering by pointing the helper at the HTML file with `--html-file`, whose local fallback renders the file in place and still resolves relative paths.
- **The pHYs stamping below is unchanged and still required.** Playwright emits no `pHYs` chunk either, so a worker-rendered PNG reports 96 DPI exactly like a Chrome one — stamp it after the helper returns.
- **PDF = `--print-to-pdf`** with a print stylesheet that shrinks the canvas to the physical page. The screen canvas is 1500px wide but the page is 5in, so `@media print{ .ad{transform:scale(0.32);transform-origin:top left} @page{size:5in 7in;margin:0} }` — the scale factor is `physical_px / canvas_px` where physical_px = inches × 96 (CSS px/in), i.e. `5*96/1500 = 0.32`. `--no-pdf-header-footer` (newer Chrome) / `--no-pdf-header-footer` kills the URL/date furniture.
- **THE DPI GOTCHA — you must stamp the PNG or it reports 96 DPI.** A Chrome screenshot has no `pHYs` chunk, so print software reads it as 96 DPI and blows it up to ~15×22in. Insert a `pHYs` chunk right after `IHDR`: 300 DPI = `round(300/0.0254) = 11811` px/metre in both axes, unit byte = 1 (metre). Strip any existing `pHYs` first, recompute the chunk CRC, splice it in. Full code below.
- **CRC-table TDZ bug (bit me once):** if you build the CRC lookup table in a `const` declared *after* the code that first calls `crc32()`, you get a `ReferenceError: Cannot access 'CRC_TABLE' before initialization` (temporal dead zone). Declare it `var CRC_TABLE;` and lazily initialize inside `crc32()` (as below), or hoist the table above first use. Do **not** use a top-level `const CRC_TABLE = (()=>{…})()` if any earlier top-level statement can reach it.
- **Self-host the fonts** so the render is byte-identical every time and never waits on / silently drops a network font — see cross-reference below. Inject them via `@import url('assets/fonts/gf-local.css')` at the top of the CSS.
- **Newsprint / low-quality-stock contrast rules** (skip for glossy) — see [`newsprint-safe-print-rules.md`](newsprint-safe-print-rules.md).
- **Reference implementation:** `D:\TrawayHome\ad\render.mjs` (the renderer), `D:\TrawayHome\ad\build.mjs` (the variant generator). Chrome path on this machine: `C:\Program Files\Google\Chrome\Application\chrome.exe`.

## Renderer (`render.mjs` — one HTML in, PNG@300 + 5×7 PDF out)

```js
// Usage: node render.mjs <input.html> <outBaseName>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const [, , inHtml, outBase] = process.argv;
if (!inHtml || !outBase) { console.error("usage: node render.mjs input.html outBase"); process.exit(1); }

const dir = path.dirname(path.resolve(inHtml));
const url = pathToFileURL(path.resolve(inHtml)).href;
const png = path.join(dir, outBase + ".png");
const pdf = path.join(dir, outBase + ".pdf");

// PNG at exactly 1500x2100 (canvas is designed at that pixel size)
execFileSync(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-sandbox",
  "--force-device-scale-factor=1", "--window-size=1500,2100",
  "--default-background-color=ffffffff", `--screenshot=${png}`, url,
], { stdio: "inherit" });

// PDF at 5in x 7in (canvas scaled via @media print in the HTML)
execFileSync(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, url,
], { stdio: "inherit" });

stampDpi(png, 300); // <-- without this the PNG reports 96 DPI
console.log("OK:", png, pdf);

function stampDpi(file, dpi) {
  const buf = readFileSync(file);
  const ppm = Math.round(dpi / 0.0254);           // px per metre; 300dpi -> 11811
  const data = Buffer.alloc(9);
  data.writeUInt32BE(ppm, 0); data.writeUInt32BE(ppm, 4); data.writeUInt8(1, 8); // unit=metre
  const type = Buffer.from("pHYs");
  const len = Buffer.alloc(4); len.writeUInt32BE(9, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data])), 0);
  const phys = Buffer.concat([len, type, data, crc]);
  const ihdrEnd = 8 + 4 + 4 + 13 + 4;              // sig + IHDR(len+type+13+crc)
  const out = stripChunk(buf, "pHYs");             // never double-stamp
  writeFileSync(file, Buffer.concat([out.subarray(0, ihdrEnd), phys, out.subarray(ihdrEnd)]));
}
function stripChunk(buf, name) {
  let i = 8; const parts = [buf.subarray(0, 8)];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    const end = i + 12 + len;
    if (type !== name) parts.push(buf.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return Buffer.concat(parts);
}
var CRC_TABLE;                                     // var + lazy init (NOT a const after first use) — TDZ
function crc32(b) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
```

## Verify the stamp took
Open the PNG's properties (Windows: Details tab → Horizontal/Vertical resolution) or `identify -format '%x x %y'` (ImageMagick) — it should read **300**, not 96. A print vendor placing it at "100%" should land at exactly the physical size.

## Cross-references
- Fonts: reuse [`../desktop-native-app/self-hosted-fonts-fetch.md`](../desktop-native-app/self-hosted-fonts-fetch.md) — the same Chrome-UA CSS2 → woff2 → local `fonts.css` trick, so the render never touches the network.
- Design system + variants: [`shared-ad-design-system.md`](shared-ad-design-system.md).
- Low-quality-stock legibility: [`newsprint-safe-print-rules.md`](newsprint-safe-print-rules.md).
- Deliver the finished package: [`resend-attachment-delivery.md`](resend-attachment-delivery.md).
