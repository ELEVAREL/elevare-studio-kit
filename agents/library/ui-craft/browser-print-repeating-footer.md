# A footer that actually repeats on every printed page (browser print / `printToPDF`)

Harvested from `D:\HausAI\src\components\ui\print-sheet.tsx`. The measurement is the asset.

---

## The finding — measured, not assumed

You need a disclosure, disclaimer, counter-stamp, or "not for construction" line at the foot of
**every** page of a printed/PDF'd artifact. Three mechanisms look like they should work. Measured in
Chrome 150, `Page.printToPDF` at US Letter, a 90-row body forced across pages, footer occurrences
counted per page with `pdftotext`:

| mechanism | pages | footer per page |
|---|---|---|
| `<div>`s with `display: table-footer-group` | 2 | **0, 1** ✗ |
| `position: fixed; bottom: 0` | 2 | **0, 1** ✗ |
| **a real `<table>` + a real `<tfoot>`** | 2 | **1, 1** ✓ |

**Chrome's repeating-footer implementation keys on a real table box**, not on an anonymous one
synthesised from `display: table`. The div version falls through to normal flow and prints **once,
at the end** — so page one, the page a reader actually reads, carries none. `position: fixed` does
not repeat either, and would reserve no space even if it did, so it prints *over* body copy.

The table also **reserves room for itself**: page one dropped from 60 body rows to 58 once the
footer was there. That is the property `position: fixed` can never have.

`@page { @bottom-center { … } }` is the CSS Paged Media spec answer. **No browser ships it.**

## When to reach for it

- A print/PDF sheet, invoice, quote, report, packing slip, or certificate where a legal line,
  disclaimer, page footer, or brand mark must travel with **every** page, including the first.
- Any time someone says "the disclosure is in the print stylesheet" and you have not counted it in a
  produced PDF.

## The component (Tailwind v4; ~40 lines)

```tsx
export function PrintSheet({ toolbar, running, children }) {
  return (
    <div className="flex flex-col gap-6 print:gap-0">
      {toolbar ? <div className="print:hidden">{toolbar}</div> : null}
      <div className="print:[print-color-adjust:exact] print:[-webkit-print-color-adjust:exact] …">
        {running ? (
          <table role="presentation" className="block print:table print:w-full">
            {/* <tfoot> BEFORE <tbody>: the engine paints it at the foot of every
                page regardless, and author-first means a renderer with no
                paged-media support still emits it rather than dropping it. */}
            <tfoot className="hidden print:table-footer-group">
              <tr className="block print:table-row"><td className="block print:table-cell">{running}</td></tr>
            </tfoot>
            <tbody className="block print:table-row-group">
              <tr className="block print:table-row"><td className="block print:table-cell">{children}</td></tr>
            </tbody>
          </table>
        ) : children}
      </div>
    </div>
  );
}

/** A unit that must not split across a page break. */
export const PrintBlock = ({ children }) => <div className="break-inside-avoid">{children}</div>;
export const PrintOnly  = ({ children }) => <div className="hidden print:block">{children}</div>;
export const ScreenOnly = ({ children }) => <div className="print:hidden">{children}</div>;
```

Three details that are load-bearing:

1. **`role="presentation"` on the table.** It neutralises the table role and propagates to rows and
   cells, so assistive tech sees generic containers, not a two-cell data table wrapped around the
   whole document.
2. **Every part is `display: block` on screen**, and only the `print:` variants restore table
   display. The screen rendering is exactly what it was before the wrapper existed.
3. **`print-color-adjust: exact`.** Browsers strip background colours by default. Without it, a
   tinted diagram prints as a set of empty outlines and whatever the tints encoded disappears.

## What it costs

One wrapper element pair and a `print:` variant on four class strings. No JS, no dependency, no
server-side rendering. Deliberately **no puppeteer/sharp/canvas** — a heavy native dep static
imported at route module scope is the serverless module-eval trap in STANDARDS. The export is the
browser's own "Save as PDF", and the button should say exactly that.

## What it does NOT do

- **Measured on Chrome 150 only.** Firefox and Safari have their own repeating-footer behaviour;
  `printToPDF` is Chrome-specific. **Re-measure before claiming it on another engine.**
- **It does not repeat a HEADER.** `<thead>` behaves analogously in Chrome but was not measured here.
  Measure it before asserting it.
- **It cannot vary per page** (no page numbers, no "page N of M"). The running block is one static
  node repeated.
- **It cannot guarantee a body element will not straddle a page.** `break-inside-avoid` is a hint;
  an element taller than a page will split regardless.
- **The `<tfoot>` is print-only.** The screen must show the same disclosures somewhere in the flow,
  or you have shipped a disclosure that only paper readers get.
- **Nesting tables inside the body** makes the outer table's footer behaviour engine-dependent.
  Avoid, or re-measure.

## Assumes / adapt

- Tailwind v4 `print:` variants. In plain CSS this is `@media print { .sheet-table { display: table } … }`.
- **Verify by counting occurrences in a produced PDF**, per page, with a text extractor. Reading the
  stylesheet, or looking at the browser's print preview page one, is exactly how the original bug
  survived every review. A comment asserting *"`position: fixed` repeats per page"* sat above a
  footer that printed once — and every reviewer read the comment and moved on.

## Related

- `print-and-video-ads/html-to-300dpi-print-ad.md` — a *different* job: rendering a fixed-size ad to
  a 300dpi raster. That one owns no paged-media flow; this one is for multi-page documents.
- STANDARDS.md — *"a comment that asserts a control IS a claim"*.
