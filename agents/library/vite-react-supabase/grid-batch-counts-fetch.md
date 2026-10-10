# Grid data-fetch pattern — the anti-N-query layer for card grids

**When to reach for it:** any grid/list of cards where each card shows per-item
counts (likes, comments, views) and/or per-user state (has-this-user-liked-it) and
may open a per-item realtime thread (comments drawer, reactions). The naive build
fires N×2 (or N×3) round-trips per grid and opens N realtime channels — this
collapses it to a fixed number of queries and zero idle subscriptions. Supabase +
React here; the batching principle is general.

Harvested from `D:\flavornews-web` `src/hooks/useBroadcastCounts.ts` +
`src/hooks/useComments.ts` + the card/drawer wiring.

---

## The three moves

### 1. `useBroadcastCounts(ids)` — batch counts + liked-state in ≤3 queries, not N×3
A 12-card signed-in grid was firing 36 requests (each card ran
`get_broadcast_like_count` + `has_liked_broadcast` RPCs and rendered a hardcoded
`comments={0}`). Instead, fetch the raw rows for the visible ids in **three**
queries and tally client-side:
```ts
const [{ data: likeRows }, { data: commentRows }, mineResult] = await Promise.all([
  supabase.from("broadcast_likes").select("broadcast_id").in("broadcast_id", ids),
  supabase.from("comments").select("broadcast_id").in("broadcast_id", ids),
  // current user's own likes across the visible ids — replaces the per-card
  // has_liked RPC storm; SKIP entirely when signed out
  uid
    ? supabase.from("broadcast_likes").select("broadcast_id").eq("user_id", uid).in("broadcast_id", ids)
    : Promise.resolve({ data: [] as { broadcast_id: string }[] }),
]);
// tally into { [id]: {likes, comments} } and { [id]: boolean } maps
```
Signed-in grid: 3 requests. Signed-out: 2 (the per-user query is skipped, not run
and discarded). Load-bearing details:
- **Stable dep key:** `ids.slice().sort().join(",")` so the effect only refetches
  when the id SET changes, not on every render.
- **Fail OPEN, never fake:** on error the map omits that id and the card **hides**
  its badge rather than showing a fake `0`. A wrong count is worse than no count.
- **Cancellation guard** (`cancelled` flag) so a stale response can't overwrite a
  newer one.

### 2. Gate the comment-drawer mount until it's actually open
A grid of cards that each mount a `<CommentSection>` closed still pays the mount
cost — worse, if the section fetches or subscribes on mount, N closed drawers each
open a realtime channel and run a fetch. Gate with an `enabled` flag threaded from
"is this drawer open":
```ts
useEffect(() => { if (!enabled) return; refresh(); }, [broadcastId, user?.id, enabled]);
useEffect(() => {
  if (!enabled) return;              // no channel until the drawer opens
  const channel = supabase.channel(`comments-${broadcastId}`)
    .on("postgres_changes", {/* comments filtered by broadcast_id */}, resync)
    .on("postgres_changes", {/* comment_likes */}, resync)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [broadcastId, resync, enabled]);
```
A mounted-but-closed thread does zero fetches and holds zero subscriptions.

### 3. `useComments(broadcastId, enabled)` — one hook, two consumers, batched enrich
Both the slide-over and the theater/inline view render the SAME hook — neither
re-implements fetch/like/delete/realtime. The enrich step batches profile + like
data for a page of comments into **two** queries via `.in()` (the old inline
version fetched the ENTIRE `comment_likes` table with no filter):
```ts
const [{ data: profiles }, { data: likes }] = await Promise.all([
  supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds),
  supabase.from("comment_likes").select("comment_id, user_id").in("comment_id", commentIds),
]);
```
Plus: `range()` pagination with a `loadedRef`, realtime that re-syncs only the
loaded span (`0..loaded`) so pagination survives a live insert, de-dupe on
load-more (`Set` of seen ids), and optimistic like toggles that roll back on error.

> **⚠ Scope limit on the `range()` pagination (added 2026-09-06).** OFFSET paging is fine here
> because the realtime re-sync of the loaded span papers over inserts. **It is the wrong primitive
> for a feed, timeline, inbox or comment thread with no such re-sync** — an OFFSET page shifts under
> a live insert and the reader gets a duplicate or a hole at every page boundary. For those, use
> keyset cursors: [`../social-feed/keyset-cursor-kway-merge.md`](../social-feed/keyset-cursor-kway-merge.md).

---

## The through-line
**Never scale round-trips or subscriptions with the number of visible items.**
Batch reads with `.in(ids)` + client-side tally, skip per-user work when signed
out, gate every mount-time fetch/subscription behind an `enabled` flag, and share
one hook across every view of the same data. Cross-agent-safe because every batched
call keeps the exact table/args shape it already used — it's the same call surface,
correctly scoped, not an RPC redesign.

## Assumes / adapt
- Assumes Supabase-js (`.in()`, `.range()`, `.channel().on("postgres_changes")`)
  and an `AuthContext` exposing the current user (+ anonymous sign-in). For a
  different backend the moves are identical: batch by id list, skip signed-out
  work, lazy-mount subscriptions, one shared hook.
- Client-side tally assumes the count rows fit a reasonable page (you're counting
  likes/comments for ~12–50 visible cards, not millions). For huge counts use a
  server aggregate RPC returning `{id, count}` — but STILL one call for the whole
  visible set, never one per card.
- Reads only + fail-open means RLS/offline degrades to hidden badges, not errors.
  Pairs with `admin-shell-kit.md` (`LoadMore` = the same `range()` pagination) and
  `supabase-nextjs-pwa/service-role-free-supabase-security.md` (RLS posture).
