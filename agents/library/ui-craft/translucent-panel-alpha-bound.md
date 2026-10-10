# The translucent panel's alpha is a computed bound, and it is theme-asymmetric

**Harvested 2026-09-18** from `D:\ThamesCoast` branch `feat/map-3d-districts`
(`506d764..f24d4c9`), `src/app/globals.css` (`.map-glass`).

## When to reach for it

Any floating panel over a surface you do not control the colour of — over a map, a photo, a video, a
canvas visualisation, a user-uploaded background, a hero image. Reach for it the moment someone
says "glass", "frosted", "blurred panel" or "backdrop-filter", and **before** anyone picks an alpha
value by eye.

## The rule

**A blurred panel has no single contrast ratio — it inherits whatever is behind it — so its alpha
is bounded by the WORST ground the panel can sit on.** Not the average, not the design mock's
ground: the worst.

That makes the alpha a computed number, not a taste decision:

1. Enumerate every colour the panel can float over (for a map: the brightest authored land and the
   darkest authored water; for a photo: white and black, because you do not control the photo).
2. Composite the panel colour at candidate alphas onto each, and compute the text ratio against
   the composite.
3. The highest alpha that still fails is your floor. Author **above** it, for margin.

Worked on the originating build: measured against the brightest authored land `#EEFAFF` and the
darkest authored water, light clears its **6:1 body-text floor at alpha 0.59** and is **authored at
0.72**.

## The finding that makes this an asset rather than a formula

**The same computation gave dark a bound of 0.77 — which is not translucent by any honest reading.
So dark ships OPAQUE.**

```css
/* Opaque first. Blur is progressive enhancement. */
.map-glass {
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
}
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
  :root:not([data-theme="dark"]) .map-glass {
    background: rgba(255, 255, 255, 0.72);
    -webkit-backdrop-filter: blur(20px) saturate(1.6);
            backdrop-filter: blur(20px) saturate(1.6);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .map-glass {
      background: var(--color-surface);          /* opaque, on purpose */
      -webkit-backdrop-filter: none;
              backdrop-filter: none;
    }
  }
}
```

Dark takes its separation from **the border and the shadow** instead. **That asymmetry is the honest
answer, not an oversight** — and it needs saying in the stylesheet in those words, or the next
designer "fixes" it by adding alpha back and quietly breaks AA on the darkest ground.

The generalisable form: **when the computed bound says a treatment is not available in one theme,
the answer is a different treatment in that theme, never a lower bar.** STANDARDS §Accessibility is
explicit that a treatment whose effective contrast cannot be computed honestly does not ship; "we
could not make it translucent and keep AA" is a valid reason to refuse the effect in that theme.

## ★ The consequence for TEXT: ink on glass is bounded, not sampled — so most of your type scale is not allowed on it

Bound each text token over the **two extremes** of any possible ground (pure black to pure white)
and the answer is usually that only the primary ink survives. Measured on the originating build,
white tint at 0.72, against its 6:1 product floor:

| token | bound (dark ground .. light ground) | verdict |
|---|---|---|
| `--color-text` | 7.35 .. 14.57 | **passes at both extremes** |
| `--color-text-secondary` | 4.76 .. 9.45 | fails the dark bound |
| `--color-text-tertiary` | 3.33 .. 6.61 | fails the dark bound |

So the rule the stylesheet enforces is **`--color-text`, full stop, on the glass layer** — and that
is a proof, not a preference. The design consequence is real and worth designing for up front: **you
cannot use a muted/secondary ink for hierarchy on a floating panel.** Build the hierarchy out of
size, weight, spacing and rules instead. A panel whose caption is grey is a panel that fails AA over
half the grounds it can float across, and it will look fine in every screenshot taken over the
other half.

## Three mechanics that come with it

**Opaque first, blur inside `@supports`.** The base rule is the accessible one and the enhancement
is additive, so a browser without `backdrop-filter` gets a correct panel rather than a transparent
one. Never the reverse.

**One glass layer, budget of one.** Exactly one floating material layer over the canvas. The card,
the modal, every list and every form are opaque. A second glass layer is how the "worst ground"
analysis above stops being tractable — you are now compositing glass over glass over an unknown.

**★ No white 1px border, ever.** It is the Dribbble tell, and it *vanishes over bright ground* —
which is exactly the moment a floating panel needs an edge. Use a token border that has its own
computed contrast against the worst ground.

## Assumes / adapt

- The numbers above (`0.59`, `0.72`, `0.77`, the 6:1 floor) are **that build's** — a 6:1 product
  floor stricter than WCAG AA's 4.5, over that palette. Re-run the computation for your own palette
  and floor; do not copy the alphas. Writing the operands next to the value
  (`/* 0.72 over #EEFAFF clears 6:1 — recomputed <date> */`) is what keeps the comment from rotting
  into an unfalsifiable number (STANDARDS §derived number in a comment).
- **Compute the ratio against the COMPOSITE, not the token pair.** A translucent *background* has
  no ratio until it is composited; a gate that computes text-on-`--color-surface` while the
  stylesheet ships `rgba(…, 0.72)` prints an optimistic number for every panel in the product.
  [`token-resolved-contrast-gate.md`](token-resolved-contrast-gate.md) does the compositing and
  **throws** on a translucent background rather than guessing.
- `backdrop-filter` is a real GPU cost on a large panel over an animating canvas. Measure it on a
  mid-range Android, not on the builder's laptop (STANDARDS §Performance, immersive archetype).
- Over a *user-supplied* image the worst ground is unbounded — there is no honest alpha. Either put
  an opaque panel on it or compute nothing and refuse the effect.

## Related

- [`token-resolved-contrast-gate.md`](token-resolved-contrast-gate.md) — measures the composited
  ratio and gates the bound.
- [`../offline-native-app/status-type-design-tokens.md`](../offline-native-app/status-type-design-tokens.md)
  — the same problem one scale down (translucent badges and pills).
- [`../ui-craft/maplibre-composed-camera-flight.md`](maplibre-composed-camera-flight.md) — the
  canvas this panel floats over, and why its palette cannot be CSS custom properties.

Verified at harvest, 2026-09-18: the CSS above is transcribed verbatim from the shipped
`src/app/globals.css`. The alpha bounds `0.59` / `0.72` / `0.77` are **the originating build's
measurements, quoted not re-measured** — treat them as that palette's answer, never as constants.
