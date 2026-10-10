# admin-shell kit — a drop-in Linear-grade admin collection layer

**When to reach for it:** any admin/back-office collection screen — a list of
orders, users, posts, tickets, submissions — that needs a sortable table, filters,
search, bulk actions, pagination, and calm empty/loading/error states, all at the
Linear/Stripe density bar. It's the presentational + interaction layer; the caller
owns the data and the mutations. Pairs with `admin-dashboard/owner-dashboard-
blueprint.md` (this is the *collection page* inside that shell) and any project
using the `vite-react-supabase` stack.

Harvested from `D:\flavornews-web` `src/components/admin-shell/` + `src/lib/csv.ts`.

---

## The kit (a `src/components/admin-shell/` barrel + `lib/csv.ts`)

| File | Exports | Role |
|---|---|---|
| `AdminTable.tsx` | `AdminTable`, `applySort`, `AdminColumn`, `SortState` | the ONE table primitive: opt-in row selection (header select-all + indeterminate + per-row), click-to-sort columns (`aria-sort`), sticky accessible `<thead>`, horizontal overflow, delegated loading/empty states. Caller supplies a `comparators` map to `applySort`. |
| `AdminFilters.tsx` | `AdminFilters`, `AdminSearch` | a declarative array of labelled Selects + an icon-prefixed search input (wired to `useDebouncedValue`). Accessible by construction — every Select has an `aria-label`, search has a visually-hidden `<label>`. |
| `BulkActionBar.tsx` | `BulkActionBar` | selection toolbar: gold count pill, divider, caller action buttons, clear. Slides in when a selection exists, respects reduced motion, `role="region"`. |
| `LoadMore.tsx` | `LoadMore` | the `range()`-pagination control: renders nothing when nothing more to load, "Showing all N" when exhausted, inline spinner while a page is in flight, "N of M loaded" context. |
| `states.tsx` | `EmptyState`, `ErrorState`, `LoadingRows`, `LoadingCards` | the calm copy-bearing states. `LoadingRows` matches resting row height so there's no layout shift when real rows arrive; `ErrorState` is `role="alert"` with an optional retry. |
| `AdminShell.tsx` / `AdminSidebar.tsx` / `SectionHeader.tsx` | shell + grouped nav + page header | the frame the collections sit in. |
| `lib/csv.ts` | `toCsv`, `downloadCsv`, `exportCsv`, `CsvColumn` | typed CSV export with the **formula-injection guard**. |

**The composition:** `AdminShell` → `SectionHeader` (title + count + an `AdminFilters`/`AdminSearch` action slot + an export button) → `BulkActionBar` (when a selection exists) → `AdminTable` → `LoadMore`. Every collection page is this same spine with different columns and mutations.

---

## The two load-bearing details

**1. `AdminTable` is presentation-only; the caller owns ordering.** The table
reports a `SortState` via `onSortChange` and you apply it yourself with the
supplied helper, so sorting never fights the caller's data pipeline:
```tsx
export function applySort<T>(rows: T[], sort: SortState | null | undefined,
  comparators: Record<string, (a: T, b: T) => number>): T[] {
  if (!sort) return rows;
  const cmp = comparators[sort.columnId];
  if (!cmp) return rows;
  const sorted = [...rows].sort(cmp);
  return sort.dir === "asc" ? sorted : sorted.reverse();
}
```
Selection is a `Set<string>` of row ids owned by the caller; `AdminTable`'s
select-all computes `allSelected`/`someSelected` (indeterminate) from it.

**2. `lib/csv.ts` guards against spreadsheet formula injection** (STANDARDS: a
hard rule, quoting alone does NOT stop it). Any cell starting with `= + - @`, tab,
or CR is prefixed with `'` before RFC-4180 quoting — header cells too:
```ts
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];
function encodeCell(raw: string | number | null | undefined): string {
  let s = raw == null ? "" : String(raw);
  if (s.length > 0 && FORMULA_TRIGGERS.includes(s[0])) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => encodeCell(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => encodeCell(c.value(row))).join(",")).join("\r\n");
  return body ? `${head}\r\n${body}` : head;
}
```
`downloadCsv` prepends a UTF-8 BOM so Excel opens accented characters, and is a
safe no-op outside the browser (`typeof document === "undefined"`). `exportCsv`
adds a `YYYY-MM-DD` date stamp to the filename.

---

## Design discipline (matches the editorial contract)
- Hairline row rules (`border-border/60`), `surface-2` sticky header, muted ink
  headers (uppercase `text-xs tracking-wider`).
- **Gold reserved for selected state only** — selected row is `bg-gold-subtle/40`,
  the bulk-bar count pill is gold. Nothing else is gold. Same rationing rule as
  the editorial system.
- Every state (empty/loading/error) is copy-bearing and calm, one CTA max, one
  gold accent reserved for the primary action.
- Full a11y: `scope="col"`, `aria-sort`, `aria-label` on every control, `role`
  on the bulk bar + error state, `sr-only` search label, `aria-busy` skeletons.

## Assumes / adapt
- Assumes shadcn/ui primitives (`Checkbox`, `Select`, `Input`, `Button`),
  `lucide-react` icons, `framer-motion` (bulk-bar entrance — swap for CSS if you
  don't want the dep), and the token classes from the editorial/foundation
  contract (`bg-surface`, `text-ink-subtle`, `bg-gold-subtle`, `border-hairline`).
- `csv.ts` is fully standalone (no deps) — copy it into any project that exports
  CSV, framework or not. It's the concrete impl of the STANDARDS formula-injection
  rule and the generic cousin of `offline-native-app/export-hardening-helpers.md`.
- `LoadMore` assumes Supabase `.range(from, to)` cursor pagination; pair it with
  the grid/comments fetch pattern in `grid-batch-counts-fetch.md`.
