# Status / type design-token block (AA-safe translucent badges)

**When to reach for it:** you have status badges/pills (ok / info / warn / bad) or typed event chips (training / drill / inspection…) and want them tinted, not solid — a translucent fill of the semantic color over a dark card. The naive version fails WCAG AA because the same hue used for both the tint *and* the text has too little contrast. This token block fixes it by pairing each semantic color with a **separate, lightened `-fg` text token** that is AA-safe on the tint.

**Assumes / adapt:**
- Designed for a **dark UI** (tints sit over a dark card). For a light theme, darken the `-fg` variants instead of lightening them, and re-verify ratios.
- The `-fg` values are hand-tuned to clear **AA (4.5:1 for body, 3:1 for large)** against the tinted background. If you change a base hue, **recompute the ratio** for its `-fg` — don't eyeball it (STANDARDS: compute the ratio for every color token used as text).
- Uses `color-mix()` to derive the translucent fill from the base token, so you tune one value not two. **Caveat:** `color-mix()` needs **Chrome/Edge 111+, Safari 16.2+, Firefox 113+**. If you must support older engines, replace the `color-mix()` fills with pre-baked `rgba()` or a translucent `background`.
- Rename tokens to your domain (`--st-*` = status, `--type-*` = event/category). Keep the base/`-fg` pairing discipline.

```css
:root{
  /* status tokens — base = fill/border tint source, -fg = AA-safe text on that tint over a dark card */
  --st-ok:#2dc653;   --st-ok-fg:#6ee89a;
  --st-info:#00b4d8; --st-info-fg:#5fd6f2;
  --st-warn:#f4a261; --st-warn-fg:#ffc38a;
  --st-bad:#e63946;  --st-bad-fg:#ff9b9b;

  /* typed-event tokens (calendar / scheduler / dashboard chips) */
  --type-training:#b07cff;   --type-training-fg:#cbabff;
  --type-drill:#ff8a3d;      --type-drill-fg:#ffb27a;
  --type-inspection:#7fd0ff; --type-inspection-fg:#a9e0ff;
  --type-none:#8899aa;       --type-none-fg:#aebccb;
}

/* Drop-in badge: translucent tint from the base token, AA-safe text from the -fg token. */
.badge{
  display:inline-block; border-radius:12px; padding:2px 8px;
  font-size:11px; font-weight:600;
}
.badge.ok  { background:color-mix(in srgb, var(--st-ok)  18%, transparent); color:var(--st-ok-fg);  border:1px solid color-mix(in srgb, var(--st-ok)  45%, transparent); }
.badge.info{ background:color-mix(in srgb, var(--st-info)18%, transparent); color:var(--st-info-fg);border:1px solid color-mix(in srgb, var(--st-info)45%, transparent); }
.badge.warn{ background:color-mix(in srgb, var(--st-warn)18%, transparent); color:var(--st-warn-fg);border:1px solid color-mix(in srgb, var(--st-warn)45%, transparent); }
.badge.bad { background:color-mix(in srgb, var(--st-bad) 18%, transparent); color:var(--st-bad-fg); border:1px solid color-mix(in srgb, var(--st-bad) 45%, transparent); }
```
