# The pointer-not-copy social primitive (repost / reshare / boost / pin)

One person putting **someone else's** item into their own audience's feed. Build it as a **pointer
row**, never as a duplicated item — and then make the wrong state unrepresentable at the type level
rather than commenting about it.

## When to reach for it
Any "amplify someone else's content" feature: repost/retweet, reshare, boost, cross-post, pin to
profile, add-to-collection, feature-on-homepage. Also the read-only cousins — a "saved" or "liked by"
list that renders other people's items.

## The primitive

```sql
create table pointers (
  item_id    uuid not null references items on delete cascade,
  actor_id   uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (actor_id, item_id)      -- the PK IS the idempotency guarantee
);
-- "this person's pointers, newest first" (the profile listing AND the feed fan-out path),
-- keyset-paged on (created_at, item_id) so ties at the same instant are still a total order.
create index pointers_actor_created on pointers (actor_id, created_at desc, item_id desc);
-- "who pointed at this item, newest first" + the FK's own lookup path.
create index pointers_item_created on pointers (item_id, created_at desc);
```

**What the PK buys you.** `(actor_id, item_id)` makes the action idempotent — one per person per item
— *and* makes all of one person's pointers contiguous for the listing. No `id` column is needed; the
pair is the identity.

**No UPDATE grant of any kind.** A pointer has nothing to edit. Undo is a DELETE.
`created_at` is not insertable — the default is the truth.

```sql
grant select on pointers to anon, authenticated;
grant insert (item_id, actor_id) on pointers to authenticated;
grant delete on pointers to authenticated;
```

**What you get for free by not copying:** moderation on the original reaches every surface
automatically. Hide, edit, delete, or age-gate the item once and every pointer to it changes with it,
because there is only ever one copy of the content. A copy-based reshare needs a fan-out job to
propagate every moderation action, and that job is where the failures live.

**The card that renders is the ORIGINAL**, wrapped in an attribution envelope ("X reshared this")
above an untouched item card. The original author stays the dominant identity on the card; the
resharer is the small line. One extra profile read per page, and only when the page actually contains
a pointer.

---

## The RLS rule people get wrong: *can I see this* ≠ *may I pass it on*

A visibility helper answers "can I see this". Reusing it as the insert gate is the bug.

```sql
create policy pointers_auth_insert on pointers for insert to authenticated
  with check (actor_id = (select auth.uid())
          and public.item_visible(item_id)                      -- can I see it
          and exists (select 1 from public.items i               -- MAY I pass it on
                       where i.id = item_id
                         and i.audience = 'public'
                         and i.status in ('published','demoted')
                         and i.deleted_at is null)
          and not exists (select 1 from public.items i           -- and it is not my own
                           where i.id = item_id and i.author_id = (select auth.uid())));
```

**Why the audience clause matters, and why it is invisible without it.** Without it, a connection can
reshare a connections-only item. The row inserts, the count bumps, an engagement event is written,
the author is notified — and then every follower of the resharer who is *not* also a connection reads
the pointer under their own policy, the visibility check returns false, and the row simply is not
there. **RLS holds perfectly; nothing leaks.** That is exactly why it is invisible: the product tells
the resharer they passed something on, tells the author it happened, shows a count that says it
happened, and for most of the audience nothing happened at all. That is a **claim–reality defect, not
a leak** — and no security review looking for leaks will find it.

**Why the status clause matters.** A moderator's SELECT policy typically returns every item
regardless of status. Without the status/`deleted_at` clause, a moderator can reshare a hidden or
soft-deleted item into their own followers' feed — where only other moderators can see it. Same
defect, worse subject matter.

**Why self-pointing is refused.** If the destination feed is strictly reverse-chronological,
resharing your own item is a way to re-bump yourself to the top of your own audience's feed. Refuse
it in the policy (and defensively again in any trigger, since a service-role or definer write does
not evaluate the policy).

---

## Make the wrong state unrepresentable — and FAIL LOUDLY, don't comment

The dangerous downstream case: a pointer card reaching a **ranked, tier-carrying, or
impression-reportable** surface. If impressions from a pointer card counted toward the original
author's test, strangers would be entering that author's measurement at full weight, straight past
whatever follower cap exists to stop reach being bought.

A comment saying "reposts are never re-tested" is a claim, and every reviewer reads it and moves on.
Two structural layers instead:

**Layer 1 — the type.** Split the card type so the ranked path cannot accept an attributed card:

```ts
export type PostCard = { /* ... */ repost: RepostAttribution | null };

/** A card reached directly. Its `repost` is null BY TYPE. */
export type DirectPostCard = PostCard & { repost: null };

/** A card surfaced because someone pointed at it. Carries attribution; can never carry a tier. */
export type RepostedPostCard = PostCard & { repost: RepostAttribution };
```

Then the one serializer that attaches a tier takes `DirectPostCard`, not `PostCard`. A plain
`PostCard` is **not assignable** to it, so any surface trying to hand an attributed card to the
ranked path gets a **compile error at the call site** instead of a silent ranking defect. Make the
hydrator return `DirectPostCard[]` so every existing caller keeps compiling and only a deliberately
attributed card is excluded.

**Layer 2 — the runtime throw.** A cast (`as`, `any`, JSON off the wire) walks straight past the
type, so check the invariant in the function too — and **throw** rather than dropping the field:

```ts
export function wireDiscoverPost(card: DirectPostCard, opts: {...}): WireDiscoverPost {
  if (card.repost !== null) {
    throw new Error(
      `wireDiscoverPost: post ${card.id} carries repost attribution. ` +
      `A reposted card must never carry a tier or be reportable as an impression.`,
    );
  }
  // ...
}
```

Throwing is the right call when the state cannot be reached through any path in the codebase: a 502
on one surface is a far smaller harm than silently corrupting a measurement nobody audits. Dropping
the field would have made it a permanent silent bug.

**Layer 3 — calibrate the type guard.** A type constraint is only load-bearing while it holds. Pin it
with a `@ts-expect-error` in the test suite that goes **red the moment anyone widens the parameter
back** to the general card type. Without that, the narrowing gets relaxed in some future refactor to
make a call site compile, and nothing notices.

---

## Assumes / adapt
- Postgres/Supabase with RLS. On a non-RLS backend the audience/status/self checks move into a single
  server-side insert path — the checks themselves are unchanged.
- Assumes **one** destination audience for the pointer (the actor's followers). If pointers can also
  target groups or lists, the row needs a destination column and the PK becomes a triple.
- Assumes the item table has an `audience` / `status` / `deleted_at` vocabulary. Map yours onto
  "publicly readable" and "may be redistributed" — they are different questions and both are needed.
- Quote-reshare (adding commentary) is a **different primitive**: it creates a new item that
  references the original, and it needs its own moderation and its own measurement. Do not bolt it
  onto this table.
- Decide deliberately whether a pointer counts as engagement on the original. If it does, it should
  be worth at least what a "copy link" share is worth, and it must obey the same per-user caps — see
  [`../postgres-supabase/toggle-relation-counter-and-ledger.md`](../postgres-supabase/toggle-relation-counter-and-ledger.md)
  for why that event's timestamp must come from an append-only ledger and not from `now()`.

## See also
- [`keyset-cursor-kway-merge.md`](keyset-cursor-kway-merge.md) — how a pointer source is merged into
  the feed at the *pointer's* timestamp without breaking pagination.
- [`../postgres-supabase/toggle-relation-counter-and-ledger.md`](../postgres-supabase/toggle-relation-counter-and-ledger.md)
  — the count trigger and the ledger every derived fact must read instead of the pointer table.

*Harvested from the Whyza reposts wave: `supabase/migrations/0025_reposts.sql` §1/§2,
`src/lib/posts/types.ts` and `src/lib/feed/serialize.ts` (2026-09-06). Generalized.*
