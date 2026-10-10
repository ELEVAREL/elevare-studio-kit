# Exact-area squarified treemap (no `d3-hierarchy`)

**Runnable asset:** [`_lib/squarify.ts`](_lib/squarify.ts) — 148 lines, pure, zero dependencies.
Bruls/Huizing/van Wijk squarified tiling. Harvested from `D:\HausAI` (a room-program massing board).

---

## Reach for it ONLY when area must be EXACTLY proportional

**Otherwise use `d3-hierarchy`.** It is the same algorithm, better tested, and gives you hierarchy,
nesting, and padding for ~10KB.

The one thing it will not give you is exactness, and that is a correctness requirement in a narrow
set of cases: **d3 expresses group separation through `paddingInner`/`paddingOuter`/`paddingTop`,
which subtract a CONSTANT inset from every node's rect.** A constant inset takes a larger fraction
of a small block than a large one, so a padded treemap's leaf areas are *not* proportional to their
values. The same failure mode as putting a real `border` on a block instead of painting the ring
inside it.

Reach for this module when a viewer will *read quantity off the area*:

- A space/floor-area program, a land-use or site plan.
- A budget or cost breakdown where "this block is twice that one" must be literally true.
- Disk/storage usage, portfolio allocation, headcount, capacity — anything where a reader might
  measure.
- Any treemap you will put a numeric label on. A labelled block that is 8% smaller than its number
  says is a claim–reality defect.

## Guarantees

- `sum(rect.w × rect.h) === rect.w × rect.h` to float precision.
- `area(i)/area(j) === value(i)/value(j)` to float precision. **Verified at max area error 0.0000%.**
- **Deterministic.** Ties in the descending sort are broken by `key`, so the layout never depends on
  the engine's sort stability — a saved design renders identically tomorrow.
- Sub-rects **abut exactly**: no gutters, no overlap. The last cell in each strip is snapped to the
  strip's exact end so accumulated float error cannot open a hairline gap.

```ts
const cells = squarify(
  rooms.map((r) => ({ key: r.id, value: r.sqft, datum: r })),
  { x: 0, y: 0, w: 960, h: 540 },
);
```

## What it costs

148 lines you now own. No dependency added — which was a secondary but real benefit in a repo with
four agents live in it.

## What it does NOT do

- **No padding, ever.** That is the point. Express grouping through **painted** rings (`inset`
  box-shadow), rails, and tint — never through inset, or you have re-introduced the bug.
- **Flat only. No hierarchy, no nesting.** One level of items into one rect. Nested treemaps,
  `d3.hierarchy`, `sum()`, `sort()` — not here. If you need a tree, use d3 and accept the padding
  tradeoff, or tile recursively yourself and re-verify exactness.
- **Positive values only.** The caller must filter `value <= 0` (the module drops them; it does not
  tell you it did).
- **Degenerate rects collapse silently.** `w <= 0 || h <= 0` returns zero-size rects rather than
  throwing.
- **It does not fit labels.** Squarified means *closer to square*, not readable. Small values still
  produce slivers. Label fitting, truncation, and the "too small to label" state are yours — and are
  usually more work than the tiling.
- **No animation, no transitions, no interaction, no accessibility.** It returns rectangles.
- **Aspect ratio is a heuristic, not a bound.** No guarantee any block is within a given ratio.

## Assumes / adapt

- TypeScript, but pure and portable — no React, no DOM, no `Math.random`, no clock.
- `key` must be stable and unique across renders, or the tie-break stops being deterministic.
- Render into SVG or absolutely-positioned divs; the module is unit-agnostic (px, %, viewBox units).

## Related

- `offline-native-app/battery-lean-canvas-decorations.md` — the same purity discipline (a scene as a
  pure function of its inputs, so a still and a replay are identical).
