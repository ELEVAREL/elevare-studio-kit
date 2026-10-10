# One CSS design system → many ad variants (build.mjs)

**When to reach for it:** you're producing **several versions of the same ad** (A/B concepts for the client to pick from, or the same offer sized to different placements) and they must look like one coherent campaign — same palette, type scale, logo lockup, lower-third/plate treatment. Rather than hand-authoring each HTML file, write **one `build.mjs`** that holds a shared CSS token block + reusable component snippets (lockup, badge, feature list, footer plate) and composes each variant from them. Change a token once, every variant updates. This is the print-ad cousin of a component library.

**Assumes / adapt:**
- **Tokens as CSS custom properties** in `:root`, referenced everywhere — never hardcode a hex twice. The Traway set (warm/editorial senior-care brand): `--paper:#F4EDE0; --ink:#26303F; --navy:#1F2A44; --burgundy:#6E2B2B; --wood:#9A7B5A; --gold:#B8862F`. Swap these for the client's brand and the whole system re-skins. Same tokens feed the video's `theme.ts` (see [`remotion-mp4-ad-pipeline.md`](remotion-mp4-ad-pipeline.md)) so print + video read as one campaign.
- **A type-scale pair, not one font.** One serif display (`--serif: 'Cormorant Garamond'`) for headlines + one humanist sans (`'Source Sans 3'`) for body/labels. Big editorial headline (100–112px on the 1500px canvas), italic serif sub, 33–34px body, ~29px uppercase-tracked eyebrow. Keep it consistent across variants.
- **Recreate the logo as inline SVG, don't embed a raster.** A vector lockup stays crisp at 300 DPI and re-colors with a token (`stroke`/`fill` = brand color). The Traway mark is a twin-gable house drawn with `<path>`/`<rect>` strokes + a two-line wordmark (serif name over tracked-uppercase tagline). A `lockup(align)` helper returns the markup so every variant drops the same lockup in.
- **Reusable component snippets** as template-literal functions / CSS classes: `.eyebrow` (tracked uppercase kicker), `.badge` (solid accent chip for urgency/availability), `ul.feats li::before` (rotated-square bullet feature list), `.frame` (hairline photo frame), `.mandate` (italic pull-quote), `.footer` (full-bleed navy plate — note the `margin:0 -113px -113px` to break out of the padding), `.gold-underline` (gradient underline highlight). Compose, don't copy.
- **`page(body)` wrapper** stamps the doctype + `<style>${CSS}</style>` + `.ad` container so each variant is just its inner HTML. `writeFileSync` one file per variant at the end.
- **`print-color-adjust:exact`** (and `-webkit-`) on the ad container so Chrome's PDF path doesn't strip your background fills/plates.
- **Keep client copy in named consts** (`MANDATE`, `CONTACT_LINES`) referenced by every variant — a required-verbatim sentence or the contact block changes in one place. Generalize these to placeholders when harvesting.
- **Reference implementation:** `D:\TrawayHome\ad\build.mjs` — three variants (V1 warm-editorial "Join our family", V2 bold-availability with urgency badge, V3 photo-led hero) from one 48-line CSS block + a `MARK` SVG + a `lockup()` helper.

## Skeleton (adapt tokens, mark, copy)

```js
import { writeFileSync } from "node:fs";

const CSS = `
@import url('assets/fonts/gf-local.css');           /* self-hosted, see html-to-300dpi entry */
:root{ --paper:#F4EDE0; --ink:#26303F; --navy:#1F2A44;
       --burgundy:#6E2B2B; --wood:#9A7B5A; --gold:#B8862F; }
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1500px;height:2100px;background:#fff}
.ad{ width:1500px;height:2100px;background:var(--paper);color:var(--ink);
     font-family:'Source Sans 3',Arial,sans-serif;position:relative;overflow:hidden;
     padding:113px;display:flex;flex-direction:column;
     -webkit-print-color-adjust:exact;print-color-adjust:exact; }
.serif{font-family:'Cormorant Garamond',Georgia,serif}
.eyebrow{font-weight:600;letter-spacing:.18em;text-transform:uppercase;font-size:29px;color:var(--burgundy)}
.frame{border:1.5px solid var(--wood);padding:6px;background:var(--paper)}
.photo{filter:contrast(1.07) brightness(1.05) saturate(1.06);width:100%;height:100%;object-fit:cover;display:block}
.badge{background:var(--burgundy);color:#fff;font-weight:700;letter-spacing:.09em;
       text-transform:uppercase;font-size:24px;padding:12px 22px;display:inline-block}
ul.feats{list-style:none}
ul.feats li{position:relative;padding-left:44px;font-size:33px;line-height:1.34;margin:15px 0}
ul.feats li::before{content:"";position:absolute;left:8px;top:15px;width:16px;height:16px;
       background:var(--burgundy);transform:rotate(45deg)}
.footer{background:var(--navy);color:var(--paper);margin:0 -113px -113px;padding:44px 113px 84px}
.mandate{font-style:italic;font-size:32px;line-height:1.42;color:var(--ink)}
@media print{ html,body{width:5in;height:7in;overflow:hidden}
  .ad{transform:scale(0.32);transform-origin:top left}       /* 5*96/1500 */
  @page{size:5in 7in;margin:0} }
`;

const MARK = `<svg class="mark" viewBox="0 0 260 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<g fill="none" stroke="#1F2A44" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
  <path d="M18 80 L70 28 L122 80"/><path d="M138 80 L190 28 L242 80"/>
  <path d="M30 80 L30 140 L230 140 L230 80"/><path d="M130 82 L130 140"/>
  <path d="M112 140 L112 110 Q130 98 148 110 L148 140"/>
  <rect x="50" y="96" width="24" height="26"/><rect x="186" y="96" width="24" height="26"/>
</g></svg>`;

const lockup = (align = "flex-start") => `<div class="lockup" style="display:flex;align-items:center;gap:26px;justify-content:${align}">
${MARK}<div><div class="serif" style="font-weight:600;font-size:52px;letter-spacing:.06em;text-transform:uppercase;color:var(--navy);line-height:.95">BRAND NAME</div>
<div style="font-size:20px;letter-spacing:.28em;text-transform:uppercase;color:var(--burgundy);font-weight:600;margin-top:8px">Tagline line</div></div></div>`;

const MANDATE = `&ldquo;Client-required sentence, verbatim.&rdquo;`;   // keep client copy in one place
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="ad">${body}</div></body></html>`;

const v1 = page(`${lockup()} …variant 1 body…`);
const v2 = page(`<div class="badge">Urgency line</div> …variant 2 body…`);
writeFileSync("v1.html", v1);
writeFileSync("v2.html", v2);
```

## Cross-references
- Render each variant: [`html-to-300dpi-print-ad.md`](html-to-300dpi-print-ad.md).
- The video ad reuses these exact tokens + the recreated SVG lockup: [`remotion-mp4-ad-pipeline.md`](remotion-mp4-ad-pipeline.md).
- Legibility on newsprint: [`newsprint-safe-print-rules.md`](newsprint-safe-print-rules.md).
