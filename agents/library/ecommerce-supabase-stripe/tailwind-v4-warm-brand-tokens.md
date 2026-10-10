# Tailwind v4 warm brand-token system (`@theme` + component layer + paper-grain/stitch motifs)

**What it is.** A complete Tailwind **v4** design-token setup for a warm, editorial, handmade/heirloom brand — the `@theme` custom-property block (so tokens become real utilities: `bg-surface`, `text-muted`, `border-border`), a `@layer components` set of `.btn`/`.card`/`.field`/`.badge`/`.eyebrow` classes, and two signature texture motifs (paper-grain body overlay + running-stitch divider). AA-verified, no dark mode, no gradients.

**When to reach for it.** Any Tailwind v4 project that needs a *warm, restrained, editorial* identity (craft, boutique, wellness, food, stationery, handmade goods) rather than the default cool-gray SaaS look. Also a clean reference for **how to do tokens in Tailwind v4** at all (the `@theme` mechanism differs from v3's `tailwind.config`).

## The `@theme` block (tokens → utilities automatically)
```css
@import "tailwindcss";
@theme {
  /* warm neutrals */
  --color-bg: #FBF6EC; --color-bg-deep: #F4ECDD; --color-surface: #FFFFFF; --color-surface-sink: #F7F0E2;
  --color-ink: #2B2622; --color-muted: #6E6357; --color-border: #E7DCC9; --color-border-strong: #D8C9B0;
  /* one accent (dusty rose) + tint + dark-on-tint ink for AA badges */
  --color-primary: #9E5B6B; --color-primary-hover: #874A59; --color-primary-tint: #F3E3E6;
  --color-tint-ink-rose: #7E3B4B;              /* AA text on the rose tint */
  /* type: display serif + sans, wired to next/font vars */
  --font-display: var(--font-fraunces), Georgia, serif;
  --font-sans: var(--font-inter), system-ui, sans-serif;
  --radius-md: 10px; --radius-lg: 16px;
  --shadow-sm: 0 1px 2px rgba(43,38,34,.05), 0 1px 3px rgba(43,38,34,.06);  /* warm-black, not pure black */
}
```
`--color-*` names auto-generate `bg-*/text-*/border-*` utilities; `--font-*` → `font-display`/`font-sans`; `--radius-*`, `--shadow-*` likewise. That's the v4 idiom — **define the token, get the utility.**

## Component layer (hand-authored classes over the tokens)
`.btn` (+ `-primary`/`-secondary`/`-ghost`/`-lg`), `.card`, `.field`/`textarea.field`/`.label`, `.badge` (+ status variants), `.container-x`, `.prose-measure`, and the signature `.eyebrow` (uppercase-tracked label) — all referencing the tokens, none hard-coding hex.

## Signature motifs
- **Paper grain** — one tiny inline SVG `feTurbulence` data-URI as a `position:fixed` `body::before` overlay at `opacity:.035`. Adds tactile warmth, never touches LCP.
- **Running-stitch divider** — `.stitch-divider { border-top: 1.5px dashed var(--color-border-strong); }` (dashed = stitches). Echoed as dashed borders on cards/receipts.

## The cascade-layer gotcha (the one that bites)
```css
/* z-index:-1 keeps the grain BEHIND content WITHOUT forcing position onto body's
   children — a positioned body would break sticky/fixed headers & the cart drawer. */
body::before { position: fixed; inset: 0; z-index: -1; pointer-events: none; opacity: .035; background-image: url("data:image/svg+xml,..."); }
```
- Keep helper classes in `@layer components` / `@layer utilities` so Tailwind's own layers can still override them predictably — un-layered CSS wins over layered utilities and causes "why won't `mt-0` work" bugs.
- The full-bleed overlay goes at **`z-index:-1`**, *not* `position:relative` on `body` — a positioned body re-parents the stacking context and breaks every `sticky`/`fixed` child (header, cart, modals).

## Assumes / adapt
- **Tailwind v4** (`@import "tailwindcss"` + `@theme`). Not portable to v3's JS config as-is.
- Fonts wired via `next/font` CSS vars (`--font-fraunces`, `--font-inter`); load only the weights the UI uses. Display weight in CSS must be a loaded weight (asking 800 when only 400–700 load → faux-bold).
- **Every text token must pass WCAG AA** — compute the ratio the moment you add/reuse a `--color-muted`/`-soft` token; one failing token fails everywhere it's used. This palette's pairs are AA-verified; if you re-hue, re-verify.
- Swap the accent hue + display serif to re-skin for a different warm brand; the structure (neutrals + one accent + tint + dark-on-tint ink + two textures) is the reusable part.
- No dark mode in v1 — add a `@media (prefers-color-scheme)` / `.dark` token set if needed.
