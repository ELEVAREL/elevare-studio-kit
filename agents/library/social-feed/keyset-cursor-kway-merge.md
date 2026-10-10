# Keyset cursors + a k-way merge feed with a heterogeneous sort key

The pagination primitive for any live, insert-heavy list, plus the harder case: merging several
independently-paged sources into one page **when one source sorts on a different table's timestamp
than the others**. The cursor subtlety is the reusable part and it is genuinely easy to get wrong —
encoding the wrong timestamp at a page boundary silently re-serves or skips a whole range, and
nothing errors.

## When to reach for it
- **Any feed, timeline, inbox, activity list, or comment thread that receives new rows while people
  are reading it.** `range()` / `LIMIT ... OFFSET` shifts under a live insert: a reader sees a
  duplicate or a hole at every page boundary. Use keyset instead.
- **Any list assembled from more than one source** — followed authors + groups + connections +
  reshares; owned + shared + public; mentions + replies + system notices.
- Especially when one of those sources is a **pointer** (a repost, a share, a bookmark, a pin) whose
  correct position in the list is *when it was pointed at*, not when the underlying item was created.

Do **not** reach for this for an admin grid or a static archive; `range()` is simpler and correct
there.

---

## Part 1 — the cursor module (copy this whole file)

```ts
/**
 * Keyset cursors. Every list pages with (created_at, id) and NEVER an OFFSET.
 *
 * The timestamp is carried as the RAW string the API returned, with only `+00:00` rewritten
 * to `Z`. Two reasons, both load-bearing:
 *   1. Postgres timestamptz keeps MICROseconds; `new Date(x).toISOString()` truncates to
 *      milliseconds, which either skips or repeats every row inside the same millisecond.
 *   2. A literal `+` inside a PostgREST `or=(...)` filter is decoded as a SPACE, so the
 *      comparison silently becomes an invalid timestamp. `Z` means the same instant and
 *      survives the query string.
 *
 * Pure: no I/O, no client. Importable by tests and self-test scripts.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$/;

export type Cursor = { t: string; i: string };

/** `2026-09-05T12:00:00.123456+00:00` -> `2026-09-05T12:00:00.123456Z`. Idempotent. */
export function normalizeTimestamp(raw: string): string {
  return raw.trim().replace(/\+00:?00$/, "Z").replace(" ", "T");
}

export function encodeCursor(timestamp: string, id: string): string {
  const c: Cursor = { t: normalizeTimestamp(timestamp), i: id };
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

/**
 * Returns null for anything that is not a cursor this server minted. A bad cursor is a
 * FIRST PAGE, never a 500 and never an unfiltered query: a client that garbles its cursor
 * gets the top of the feed, which is the honest recovery.
 */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw || raw.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const { t, i } = parsed as Record<string, unknown>;
    if (typeof t !== "string" || typeof i !== "string") return null;
    if (!TS_RE.test(t) || !UUID_RE.test(i)) return null;
    return { t: normalizeTimestamp(t), i };
  } catch {
    return null;
  }
}

/**
 * The PostgREST `or=` expression for "strictly older than this cursor" on (column, id).
 * Values are double-quoted so a timestamp's `:` and `-` are never read as operators.
 */
export function keysetFilter(column: string, cursor: Cursor): string {
  return `${column}.lt."${cursor.t}",and(${column}.eq."${cursor.t}",id.lt."${cursor.i}")`;
}

/** Clamp a client-supplied page size into the contract's range. */
export function pageSize(raw: string | number | null | undefined, fallback: number, max: number): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.trunc(n), max);
}

export type Keyed = { id: string; sort: string };

/**
 * Merge k already-sorted (desc) lists into the global top `limit`. Each source must have
 * been fetched with at least `limit + 1` rows for this to be exact — that is the caller's
 * contract and why every source query asks for one extra row.
 *
 * FIRST-SEEN-WINS on id: argument order decides which duplicate survives.
 */
export function mergeDesc<T extends Keyed>(lists: T[][], limit: number): T[] {
  const seen = new Set<string>();
  const all: T[] = [];
  for (const list of lists) {
    for (const row of list) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      all.push(row);
    }
  }
  all.sort((a, b) => (a.sort === b.sort ? (a.id < b.id ? 1 : -1) : a.sort < b.sort ? 1 : -1));
  return all.slice(0, limit);
}

/** Split an id list into URL-safe chunks; a PostgREST `in.(...)` of 500 uuids is an 18 KB URL. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
```

### The four facts in that file that people get wrong
1. **Carry the raw microsecond string.** Round-tripping through `Date` truncates to milliseconds and
   silently skips or repeats every row inside the same millisecond.
2. **Rewrite `+00:00` to `Z` before it enters a query string.** A literal `+` in a PostgREST
   `or=(...)` filter decodes as a space and the comparison becomes an invalid timestamp — which does
   not error, it just stops filtering the way you think.
3. **A malformed cursor is a FIRST PAGE**, never a 500 and never an unfiltered query.
4. **Tiebreak on id, with both comparisons strictly `<`.** `(sort, id)` must be a total order or ties
   at the same instant reorder between pages.

---

## Part 2 — the heterogeneous source (the hard part)

Add a `sort` field to every row and merge on **that**, not on the row's own `created_at`:

```ts
type SortedRow = Row & { sort: string; via?: Pointer };

// Direct sources: sort IS the row's own timestamp.
const withSort = (rows: Row[]): SortedRow[] => rows.map((r) => ({ ...r, sort: r.created_at }));

// The pointer source: sort is the POINTER's timestamp, and its keyset filter runs against
// the pointer table's column, not the item's.
out.push({ ...item, sort: pointerRow.created_at, via: pointerRow });
```

### The five decisions to make explicitly, and write down

**1. The cursor is minted from `last.sort`, never from `last.created_at`.**
For the direct sources these are the same string, which is exactly why the bug survives review. For a
pointer row they differ by potentially years — a page boundary landing on a pointer would resume from
the *underlying item's* age and re-serve or skip everything in between.

**2. The tie must work across both id spaces.** Give the pointer row the **item's** id as its `id`,
not the pointer's — that is also what makes the dedupe work. Then `(sort, id)` is a total order over
the merged set, and a same-microsecond collision needs one item to be both the cursor's direct row
*and* its own pointer row (a self-repost). If your schema permits that, the collision costs one
duplicated card and never a dropped page — both filters are strictly `<`, so the boundary row is
excluded by id rather than by luck.

**3. Argument order to the merge is load-bearing.** `mergeDesc` is first-seen-wins, so put the
pointer source **LAST**: an item reachable directly keeps its own chronological place and the pointer
row is dropped. "An item reachable two ways appears once" extended one more way.

**4. Exactness, and what to do when a source cannot be exact.** Each direct source asks for `limit +
1`, which makes it exact for the top `limit`. A source that *collapses* many rows into one card (many
people pointed at the same item) cannot be exact at `limit + 1` — ask for twice that, which covers
the case that actually happens (a page whose pointers all aim at items already reachable directly).
Beyond that it under-fills, and **an under-filled source is indistinguishable from an exhausted one
to the merge**: order is never wrong, a page is never skipped, at worst a row arrives one page later
than it might have. That is an acceptable, statable trade — say it in a comment rather than leaving a
reader to discover it.

**5. Cross-page dedupe is the CLIENT's job.** The server dedupes within a page. An item seen as a
pointer row on page 1 will reach its own chronological place on page 4; the client drops any id it
has already rendered. The pointer copy is the one that survives, which is the honest outcome — it is
the one the reader actually saw.

### Also: a pointer row usually needs the reason line suppressed
If your feed annotates each row with *why you are seeing this*, ask that function about a pointer row
and it will answer `null` for most of them (you follow the pointer's author, not the item's), and a
"drop rows with no reason" filter will then **delete the entire source**. The attribution line ("X
reshared this") *is* the reason for those rows. Set reason to null deliberately and render
attribution instead.

## Assumes / adapt
- PostgREST/Supabase for `keysetFilter`'s syntax. On a SQL backend the equivalent is
  `WHERE (col, id) < ($1, $2)` — a row-value comparison, which is cleaner and indexes better; keep
  the raw-string and total-order rules unchanged.
- `Buffer` is Node/edge-runtime. In a browser, swap for `btoa`/`atob` over `encodeURIComponent`.
- Assumes `id` is a uuid and the sort column is `timestamptz`. Change `UUID_RE`/`TS_RE` together with
  the tiebreak comparison if not.
- Every source needs a **composite index on its keyset** — `(scope_col, sort_col desc, id desc)` —
  or the keyset filter is a sequential scan with extra steps.
- **Cap the number of ids per source.** A `in.(...)` of 500 uuids is an 18 KB URL; `chunk()` exists
  for that. Return a `truncated` flag so the UI can say so rather than silently under-serving.
- Export the merge function itself and test it directly on arrays. A test that reaches it through a
  fake API client is testing the fake.

## Breaks / supersedes
[`../vite-react-supabase/grid-batch-counts-fetch.md`](../vite-react-supabase/grid-batch-counts-fetch.md)
uses `range()` offset pagination. That is fine for an admin grid over a mostly-static table; it is
**wrong for any list that receives inserts while it is being read**. Reach for this entry instead in
that case.

*Harvested from the Whyza reposts wave: `src/lib/posts/cursor.ts` (lifted whole) and the design
rationale in `src/lib/feed/home.ts` (2026-09-06). Generalized — the pointer source is described
abstractly.*
