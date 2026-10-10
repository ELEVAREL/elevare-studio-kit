# The container-relative band — a strip that must answer to its pane, not the window

Harvested from `D:\HausAI\src\components\builder\massing\plan-title-block.tsx` (a drawing's title
block inside a resizable split pane). Generic to any horizontal band of figures inside a pane.

---

## The failure it prevents

At 1280px a six-cell figure band collided with itself: a label got **30 of the 87px** it needed, a
currency range was cut at the cell edge, and two labels overprinted into `CONDITIONESD` — six
overlapping text rectangles, the largest 18×28px. A three-item version with a 29-character string
collided identically, so it was **never a long-content edge case**. Four compounding mistakes:

1. **Content-driven flex tracks.** `flex` + `min-w-0` on every cell lets any cell crush any other.
   A band of figures does not renegotiate its frame around its contents — it has **TRACKS**. Use
   `grid` with an explicit template.
2. **A prose note living inside a figure cell.** Its content-based flex basis is a paragraph, and
   that paragraph is what crushed the neighbouring label. It was not mis-weighted; it was winning a
   fight for space it should never have been in. Move it to its own full-width sub-rule beneath the
   figure row — still adjacent to the figure it qualifies. **Adjacency, not co-tenancy.**
3. **A `shrink-0` fixed-width stamp on the figure row.** 400px is 36% of the band at 1920 and it
   never yields. Put it on the notes rule.
4. **A VIEWPORT breakpoint governing a band that lives inside an 818px pane.** A pane-relative
   element governed by a viewport media query is wrong at every width where the two disagree —
   which, in a resizable split, is **most of them**.

## The recipe

```tsx
<div className="@container/titleblock">
  {/* Hairlines are the grid's own gap showing the line colour through, so no cell
      owns a border, a double hairline cannot occur, and a cell that spans a row
      still gets its rule — which `divide-*` cannot do across a wrapping grid. */}
  <div className="grid gap-px bg-line
                  grid-cols-1
                  @min-[30rem]/titleblock:grid-cols-[fit-content(12rem)_minmax(0,1fr)]
                  @min-[48rem]/titleblock:grid-cols-[minmax(0,1fr)_fit-content(12rem)_fit-content(17rem)]">
    …cells, each `bg-surface p-4`…
  </div>
</div>
```

- **`fit-content(<cap>)` for figure cells, `minmax(0,1fr)` for the one reflowable cell.**
  `fit-content()` caps a cell at a width its own label and figure comfortably clear, while letting
  it be narrower when its content is. Exactly one cell — the only one whose content can reflow — is
  allowed to be squeezed.
- **`whitespace-nowrap` on every figure and every label.** Then neither can ever be the thing that
  clips, and `fit-content()`'s cap is a real guarantee rather than a hope.
- **Take the type-scale decision against the container too.** A `clamp()` sized against the viewport
  is the wrong decision inside a pane: 31px is right on a wide sheet and buys 23 characters a line in
  a 703px pane. Step the size at a `@min-[62rem]/name` container breakpoint instead.
- **A painted state ring, never a border.** `shadow-[inset_0_0_0_1px_var(--color-accent)]` marks a
  changed cell without jogging the band by a pixel.
- **Reserve the worst case the contract can produce, per tier.** `line-clamp-N` + `min-h-[Nlh]` at
  each container breakpoint, chosen from the *measured* characters-per-line at that tier. Only the
  band that can be forced onto a third line reserves three. The empty state reserves the same lines
  with an em-dash, so the band does not grow by a pixel when data lands.

## When to reach for it

- Any figure/summary/status band inside a **resizable split**, drawer, modal, sidebar, card, or
  embedded widget — i.e. anything whose width is not the viewport's.
- Any strip of headline numbers that has ever overlapped, truncated, or jumped when data arrived.
- Rule of thumb: **if the element does not span the viewport, its breakpoints must not be viewport
  breakpoints.**

## What it costs

- Container queries: Chrome 105+, Safari 16+, Firefox 110+. **Naming a new browser floor is a
  constraint change** — state it, do not let it drift silently (STANDARDS).
- `@container` establishes containment; the container element cannot itself size to its contents in
  the queried axis. Put the `@container` on a wrapper, not on the grid.
- One extra wrapper element per band.

## What it does NOT do

- **It does not fix a band with too many cells.** Tracks make the collision *impossible*; they do
  not make eight figures fit in 400px. Below the first breakpoint the band stacks to one column —
  design that state deliberately.
- **`fit-content()` caps are hand-measured numbers.** They encode the widest label+figure your
  formatter can emit. Change the formatter (a currency, a locale, a unit) and the caps must be
  re-measured. Nothing enforces this — it is a comment-and-verify, not a type.
- **The zero-CLS claim must be measured, not asserted.** Measure the band's height with no data,
  with short content, and with the contract's maximum-length string, at three widths. The origin
  measured 232px in all three cases at 1280/1440/1920 — that is what makes the claim true rather
  than aspirational.
- **`line-clamp` truncates.** On a title, `truncate` is how "…standing-seam metal gables, bo"
  reaches production. Always carry the full string on `title=` and expose it somewhere unclipped.
- It says nothing about the band's *content* hierarchy — only that the frame cannot collapse.

## Assumes / adapt

- Tailwind v4 container-query variants (`@container/name`, `@min-[48rem]/name:`). In plain CSS:
  `container-type: inline-size; container-name: titleblock` + `@container titleblock (min-width: 48rem)`.
- A tokenised line colour for the `gap-px` hairline trick, and a surface colour on every cell (the
  gap shows the *parent's* background through).

## Related

- `vite-react-supabase/editorial-frontpage-system.md` — hairlines-not-shadows, same discipline.
- STANDARDS.md — constraint drift (a CSS feature moving your browser floor); CLS is almost always
  injected chrome, not the design.
