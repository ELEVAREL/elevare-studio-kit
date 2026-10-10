/**
 * Squarified treemap — Bruls, Huizing & van Wijk.
 * <https://vanwijk.win.tue.nl/stm.pdf>  (DESIGN-RESEARCH Pattern 7)
 *
 * ELEVARE STUDIO PATTERN LIBRARY — generic, drop-in, no dependencies.
 * See `../exact-area-treemap.md` for when to reach for it and what it does NOT do.
 *
 * WHY THIS IS HAND-WRITTEN RATHER THAN `d3-hierarchy`.
 * `d3-hierarchy`'s squarify tiling is the same algorithm. Reach for THIS one only
 * when area must be EXACTLY proportional, for one reason that is a correctness
 * requirement rather than a preference:
 *
 *   d3's treemap expresses group separation through `paddingInner` /
 *   `paddingOuter` / `paddingTop`, which subtract a CONSTANT inset from every
 *   node's rect. A constant inset takes a larger fraction of a small block than a
 *   large one, so a padded treemap's leaf areas are *not* proportional to their
 *   values. (Same failure mode as putting a real `border` on a block instead of
 *   painting the ring inside it.)
 *
 * This module therefore tiles with ZERO padding and the caller expresses grouping
 * through rails and PAINTED rings, never through inset.
 *
 * PURE. No React, no DOM, no `Math.random`.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SquarifyInput<T> {
  key: string;
  /** Must be > 0. The caller filters out non-positive values. */
  value: number;
  datum: T;
}

export interface SquarifyResult<T> {
  key: string;
  value: number;
  datum: T;
  rect: Rect;
}

/** The worst aspect ratio in a row of areas laid along a strip of length `side`. */
function worstRatio(areas: readonly number[], sum: number, side: number): number {
  if (sum <= 0 || side <= 0) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const a of areas) {
    if (a < min) min = a;
    if (a > max) max = a;
  }
  const s2 = sum * sum;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

/**
 * Tile `rect` with one sub-rect per input, area exactly proportional to `value`.
 *
 * Guarantees:
 *  - `sum(result.rect.w * result.rect.h) === rect.w * rect.h` to float precision.
 *  - `rect(i).area / rect(j).area === value(i) / value(j)` to float precision.
 *  - Deterministic: the same input always produces the same output. Ties in the
 *    descending sort are broken by `key`, so the layout does not depend on the
 *    engine's sort stability.
 *  - Sub-rects abut exactly (no gutters, no overlap), which is what lets the
 *    painted 1px ring be the only separation.
 */
export function squarify<T>(items: readonly SquarifyInput<T>[], rect: Rect): SquarifyResult<T>[] {
  const positive = items.filter((i) => i.value > 0);
  if (positive.length === 0) return [];
  if (rect.w <= 0 || rect.h <= 0) {
    return positive.map((i) => ({ ...i, rect: { x: rect.x, y: rect.y, w: 0, h: 0 } }));
  }

  const total = positive.reduce((sum, i) => sum + i.value, 0);
  const scale = (rect.w * rect.h) / total;

  // Descending by value; `key` breaks ties so the result never depends on the
  // engine's sort stability. A saved design must render identically tomorrow.
  const queue = positive
    .map((i) => ({ item: i, area: i.value * scale }))
    .sort((a, b) => b.area - a.area || (a.item.key < b.item.key ? -1 : a.item.key > b.item.key ? 1 : 0));

  const out: SquarifyResult<T>[] = [];
  let free: Rect = { ...rect };
  let index = 0;

  while (index < queue.length) {
    const side = Math.min(free.w, free.h);
    const row: (typeof queue)[number][] = [];
    const rowAreas: number[] = [];
    let rowSum = 0;
    let best = Number.POSITIVE_INFINITY;

    while (index < queue.length) {
      const next = queue[index];
      const candidateSum = rowSum + next.area;
      rowAreas.push(next.area);
      const ratio = worstRatio(rowAreas, candidateSum, side);
      if (row.length === 0 || ratio <= best) {
        row.push(next);
        rowSum = candidateSum;
        best = ratio;
        index += 1;
      } else {
        rowAreas.pop();
        break;
      }
    }

    const isLastRow = index >= queue.length;
    const horizontal = free.w >= free.h;

    if (horizontal) {
      // A vertical strip on the left edge, `stripW` wide, full height.
      const stripW = isLastRow ? free.w : rowSum / free.h;
      let y = free.y;
      for (let r = 0; r < row.length; r += 1) {
        const last = r === row.length - 1;
        // Snap the last cell to the strip's exact end so accumulated float
        // error cannot open a hairline gap between abutting blocks.
        const h = last ? free.y + free.h - y : row[r].area / stripW;
        out.push({ ...row[r].item, rect: { x: free.x, y, w: stripW, h } });
        y += h;
      }
      free = { x: free.x + stripW, y: free.y, w: free.w - stripW, h: free.h };
    } else {
      // A horizontal strip on the top edge, `stripH` tall, full width.
      const stripH = isLastRow ? free.h : rowSum / free.w;
      let x = free.x;
      for (let r = 0; r < row.length; r += 1) {
        const last = r === row.length - 1;
        const w = last ? free.x + free.w - x : row[r].area / stripH;
        out.push({ ...row[r].item, rect: { x, y: free.y, w, h: stripH } });
        x += w;
      }
      free = { x: free.x, y: free.y + stripH, w: free.w, h: free.h - stripH };
    }
  }

  return out;
}
