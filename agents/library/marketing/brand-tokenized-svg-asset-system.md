# Brand-tokenized SVG asset system (social / OG / thumbnail graphics that match the shipped product)

**When to reach for it:** you need launch/social graphics — square social posts (1080×1080), OG/share images (1200×630), video thumbnails (1280×720), banners — that look like they came from the same team that shipped the product, produced as **hand-authored SVG** (crisp at any size, versionable, diffable, editable in code, no Figma/PNG round-trip). This is the recipe for a *system* — a token table + type scale + one recurring motif reused across every asset — not a pile of one-off images.

**Assumes / adapt:**
- **Pull tokens verbatim from the shipped site, do not re-derive.** The whole point is that campaign assets are indistinguishable from the product. Copy the exact hex values out of the live `index.html`/CSS into a canonical token table at the top of your graphics doc (ground, panel, the ONE accent, text tints, a `--line` hairline, and the "ink-on-accent" text color for glyphs sitting on the accent fill). Re-deriving colors by eye is how campaign assets drift off-brand.
- **Discipline the color budget.** One accent, spent sparingly. A success/live color used **exactly once per asset**. A single permitted gradient (a subtle panel wash) — everything else is flat. This restraint is what reads as "premium/serious" vs "template." (Directly reuses the `night-watch-token-system.md` philosophy from `desktop-native-app/` when the brand is dark/serious.)
- **One recurring motif = brand recognition.** Identify the product's signature mark (here: a "beacon" — concentric scan rings around an amber core) and place it on every asset. Cross-asset recognition comes from the repeated motif + the mono-uppercase-accent "kicker" label, not from each asset being clever.
- **Type system travels with the tokens.** Name the exact fonts + weights + the tracking rules (display headline tracking, the mono uppercase kicker with wide letter-spacing, body measure ≤~60ch, mono tabular numbers). The "highlight phrase flips to the accent color, never a second color" rule keeps headlines on-brand.
- **Author accessibly:** `role="img"` + `aria-label` on the root `<svg>`, a `clipPath` frame, real text elements (not paths) so it stays legible/translatable. Keep a `preview.html` that renders every asset together for a one-glance review + the `art-director` gate.
- **Fonts:** SVGs reference brand fonts by name (`font-family="'Bricolage Grotesque'..."`); they render with those fonts where the fonts are installed/loaded (the preview harness + when rasterized in-browser). For a guaranteed-identical raster, load the webfonts in `preview.html` before export, or convert critical text to paths for the final PNG only.

**Reference:** `D:\SentinelBox\marketing\10-graphics.md` (the system: token table §1.1, type scale §1.2, the motif §1.3) + `marketing\assets\*.svg` (worked social/OG/thumbnail assets) + `marketing\preview.html` (review harness). Pairs with `marketing/product-launch-kit-structure.md` (this is that kit's `10-graphics.md` + `assets/`).

## The reusable skeleton (per asset)

```xml
<svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg"
     role="img" aria-label="<one-sentence description of the asset>">
  <defs>
    <!-- the ONE permitted gradient: a subtle panel wash -->
    <linearGradient id="panelWash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#161F38"/><stop offset="1" stop-color="#12192E"/>
    </linearGradient>
    <clipPath id="frame"><rect width="1080" height="1080"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="1080" height="1080" fill="#10172A"/>            <!-- ground token -->
    <!-- wordmark: motif dot + brand name in mono/display -->
    <!-- KICKER: mono, UPPERCASE, wide tracking, accent color — the signature label -->
    <!-- headline: display 800, tight tracking; highlight phrase flips to the accent, never a 2nd color -->
    <!-- content panel: fill=url(#panelWash), stroke=<--line hairline> -->
    <!-- exactly ONE use of the success/live color, if any -->
  </g>
</svg>
```

**Token block to fill once, then reuse across every asset** (example values — replace with the shipped site's):
`ground #10172A · panel #161F38 · raised #1E2A49 · accent #F2A93B · accent-deep #E0881C · text #EDF1FA · body #C4CDE3 · muted #8C98B6 · success #67D6A6 (once per asset) · line rgba(255,255,255,.09) · ink-on-accent #23170A`.
