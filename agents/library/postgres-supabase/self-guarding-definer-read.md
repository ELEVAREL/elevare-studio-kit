# The owner cannot read their own row — RLS-narrowed self-reads, and the bounded definer that fixes them

A defect class general to every RLS project, and one that returns **200 OK with incomplete data**:
*a plain table read of an RLS-scoped table can silently return a SUBSET to the row's own owner,
because the policy is scoped by something other than ownership.*

## The symptom
A subject-access / data-export / "your activity" surface looks correct, returns 200, contains rows,
and is **missing some of the user's own records**. No error is raised anywhere. Nothing in a build,
a typecheck, a screenshot, or an integration test can see it — the query succeeded.

## The diagnosis
Read the SELECT policy on the table and ask *what predicate does it actually scope on*. The bug
appears whenever that predicate is **not ownership**:

```sql
-- Looks fine. Is not an ownership scope.
create policy child_auth_select on children for select to authenticated
  using (public.parent_visible(parent_id)
     and (actor_id = (select auth.uid()) or not public.is_blocked_either_way(actor_id)));
```

`parent_visible` answers *"is the parent still publicly readable"*. So the person's own row about a
parent that was later **hidden, moderated, pulled, unpublished, archived, or soft-deleted** is
invisible **to the person who created it**. Their export is quietly short.

The same shape appears wherever a child row's visibility is delegated to a parent: comments on a
removed post, reactions on a hidden item, messages in an archived thread, line items on a voided
order, attendance on a cancelled event.

## The fix: a bounded, self-guarding SECURITY DEFINER read

```sql
-- Takes NO id argument. Answers only about auth.uid(). Cannot be aimed at anyone else.
create or replace function public.my_children()
returns table (parent_id uuid, created_at timestamptz)
language sql stable security definer set search_path = '' as $fn$
  select c.parent_id, c.created_at
    from public.children c
   where c.actor_id = (select auth.uid())
   order by c.created_at desc
$fn$;
revoke all on function public.my_children() from public, anon;
grant execute on function public.my_children() to authenticated;
```

**Every clause is load-bearing:**
- **No `p_user_id` parameter.** A definer that takes an id is an aiming device; the whole point is
  that this one cannot be pointed at anyone. The identity comes from `auth.uid()` inside the body.
- **`security definer`** so it is not narrowed by the visibility policy — that is the bug being
  fixed.
- **`set search_path = ''`** and fully-qualified `public.` names. Mandatory on every definer: without
  it a caller can shadow your tables via their own search path and hijack the function.
- **`stable`**, not `volatile` — it reads, and the planner should know.
- **`revoke all ... from public, anon` then `grant execute ... to authenticated`.** A definer read
  about "me" is meaningless to `anon` and must not be callable by it.
- **Return only the columns the consumer needs.** A definer bypasses RLS; do not widen it into a
  general table view.

## The trap next door: an INVOKER helper called from inside a DEFINER

This one is subtle enough to have shipped past a parse, an apply, and a clean advisor run:

**A `security invoker` helper called from inside a `security definer` function runs as the DEFINER's
owner** — typically `postgres`, who bypasses RLS. So a visibility helper that correctly returns
`false` for a hidden row when called from a policy returns **`true` for everything** when called
inside a definer. A gate built out of it is not a gate.

In the case this came from, a definer RPC gated on an invoker `post_visible()` helper and therefore
let a signed-in stranger read a hidden item's ranking tier. It parsed, applied, and left the Supabase
advisors at 0 ERROR; only a second persona in a live probe caught it.

**Rule:** inside a `security definer` body, never delegate an authorization decision to an INVOKER
helper. Spell the predicate out inline against the pool the caller is actually allowed to see, or
call a helper that is itself DEFINER and self-guarding.

## The account-deletion counterpart (check both halves)
Export and deletion fail differently and both need checking when you add a table:
- **Deletion** usually needs nothing, *if* the table's FK to the identity row is `on delete cascade`
  — the cascade carries it out. Confirm that the deletion routine's table list is a **comment
  describing the cascade** and not a hardcoded list the code walks. If it is hardcoded, extend it.
- **Export** is almost always a real hardcoded list, and it usually lives in **application code**, not
  in SQL — which means the lane that adds the table often does not own the file that enumerates it.
  Say so explicitly in your handoff: *"the export list at `<file>` needs a row for this table; I do
  not own that file."* An export that silently omits a table is a subject-access failure with a 200.

## Assumes / adapt
- Supabase / Postgres with RLS and a `auth.uid()` equivalent. On plain Postgres, substitute your
  session-identity function and keep the "no id parameter" rule.
- Assumes revoke-by-default privileges. If your schema grants `execute` to `PUBLIC` by default, the
  `revoke all` line is not optional cleanup — it is the gate.
- Every such function should be **listed in the project's contract doc** with who may call it, so an
  "anon-callable definer function" advisor note can be triaged as expected residue vs. a finding. A
  name not on that list is a finding.

## See also
- [`../supabase-nextjs-pwa/service-role-free-supabase-security.md`](../supabase-nextjs-pwa/service-role-free-supabase-security.md)
  — the fuller "table locked, definer RPC is the one door" posture this is a special case of.
- [`../supabase-nextjs-app-scale-invariants.md`](../supabase-nextjs-app-scale-invariants.md) — the
  default-deny-on-tenant-identity rule, and `rls-tenant-isolation` as the test.

*Harvested from the Whyza reposts wave: `supabase/migrations/0025_reposts.sql` §7 (`my_reposts()`)
and `docs/CONTRACT.md` §1 (the INVOKER-inside-DEFINER incident), 2026-09-06.*
