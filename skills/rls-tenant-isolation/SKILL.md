---
name: rls-tenant-isolation
description: You are about to write, change, review or trust a Postgres/Supabase Row-Level Security policy, or any query in a multi-tenant app where one customer's rows must never reach another customer. Run this FIRST. Covers the specific ways RLS silently fails OPEN — a table owner bypassing its own policy without FORCE ROW LEVEL SECURITY, service_role and BYPASSRLS, views that are not security_invoker, materialized views, a USING clause with no WITH CHECK letting a row be moved to another tenant, SET instead of SET LOCAL leaking tenant context down a pooled connection, and INSERT ... RETURNING * handing back columns a SELECT would hide. Use when adding a tenant-scoped table, writing or editing any policy, adding a view or RPC over tenant data, wiring a connection pooler, using the service key on a server route, before shipping any multi-tenant feature, and whenever someone says "RLS", "row level security", "tenant isolation", "cross-tenant", "org_id", "workspace_id", "multi-tenant", or "can customer A see customer B's data". Policies existing, the app working, and the test suite passing are all true on a table that leaks.
origin: Elevare Studio 2026-09 — forged after shipping cross-tenant defects; bypass catalog and persona-matrix test design cross-checked against Postgres docs, Supabase guidance, and the pgTAP scenario pattern used in gridaco/grida (Apache-2.0)
owners: database-architect, security-reviewer, backend-engineer, test-engineer
---

# RLS tenant isolation — the ways it fails open

## The rule

**A tenant-scoped table is not isolated until a test has watched a query from the
WRONG tenant return zero rows.** Not "the policy exists". Not "the app shows the
right data". A query, from a second tenant's identity, returning nothing.

RLS fails *open*, quietly. There is no error, no log line, no red test. The app
looks correct to the tenant you are logged in as — which is always the one you test as.

## Part 1 — The bypass catalog

Nine ways a policy that reads correctly still lets data through. Check every one.

### 1. `ENABLE` without `FORCE` — the table owner ignores the policy

The role that owns a table is **exempt from its own RLS policies** unless forced.
Migrations, seeds, and any server code connecting as the owner see everything.

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE  ROW LEVEL SECURITY;  -- the line everyone forgets
```

### 2. `ENABLE` never run at all

A policy on a table without `ENABLE ROW LEVEL SECURITY` is inert — it is stored,
it reads fine in the migration, and it is not applied. Conversely, `ENABLE` with
**no** policy denies everything to non-owners. Both states are easy to ship.

```sql
-- confirm, do not assume:
select relname, relrowsecurity, relforcerowsecurity
from pg_class where relname = 'invoices';
```

### 3. `service_role` / `BYPASSRLS` / superuser

Supabase's `service_role` key bypasses RLS entirely, by design. Any server route,
edge function, cron job, or webhook handler using it **must filter by tenant in its
own SQL** — RLS is not behind it. Treat every `service_role` query as unguarded.

- Never let a `service_role` client be reachable from user-supplied input without an
  explicit tenant check written in that same function.
- Never use the service key in anything shipped to the browser.
- `select rolname from pg_roles where rolbypassrls;` — know who is on that list.

### 4. Views that are not `security_invoker`

A plain view executes with the **view owner's** privileges. A view over a
tenant-scoped table, owned by a privileged role, is a hole straight through RLS.

```sql
create view invoice_summary with (security_invoker = on) as select ...;
```

Check every existing view: `select relname, reloptions from pg_class where relkind='v';`

### 5. Materialized views

A matview holds its own copy of the rows and does **not** re-evaluate the underlying
table's policies on read. Never build one over tenant-scoped data unless it carries
its own RLS and tenant column.

### 6. `USING` with no `WITH CHECK` — the row-moving bug

`USING` decides which rows you can *see* (SELECT/UPDATE/DELETE). `WITH CHECK` decides
which rows you may *write* (INSERT/UPDATE). An UPDATE policy with `USING` only lets a
user take a row they legitimately own and **set its `tenant_id` to someone else's**.

```sql
create policy invoices_update on invoices for update
  using      (tenant_id = (select current_tenant()))   -- rows I may touch
  with check (tenant_id = (select current_tenant()));  -- rows I may leave behind
```

### 7. `SET` instead of `SET LOCAL` behind a pooler

Setting tenant context with `SET app.tenant_id = ...` persists **on the connection**.
Under PgBouncer/Supavisor in transaction mode, the next request — a different customer —
inherits it. Use `SET LOCAL` inside a transaction so it dies at commit.

```sql
begin;
  set local app.tenant_id = '...';   -- LOCAL, always
  select ...;
commit;
```
This is the highest-severity item in the list, because it leaks *across users* under
load only, so it never reproduces in development.

### 8. `INSERT ... RETURNING *` and column privileges

RLS is **row**-level. It does not hide columns. `RETURNING *` can hand back a column
that no SELECT policy would have exposed. Use column `GRANT`s, and return an explicit
column list.

### 9. Policy predicates that are not tenant predicates

`auth.uid() is not null` is authentication, not isolation — every logged-in user on the
platform passes it. The predicate must join the row to *this* tenant. Grep for policies
whose `USING` never mentions the tenant column.

## Part 2 — Prove it, with the wrong tenant

### The persona × operation matrix

Every tenant-scoped table, view and RPC gets tested from each identity, for each
operation, with **positive and negative** assertions:

| Persona | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `anon` (`auth.uid()` is NULL) | 0 rows | denied | 0 rows | 0 rows |
| member of tenant A | own rows | own tenant only | own rows | own rows |
| admin/owner of tenant A | per role rules | per role rules | per role rules | per role rules |
| **member of tenant B** | **0 rows** | **rejected** | **0 rows** | **0 rows** |
| authenticated, no membership | 0 rows | rejected | 0 rows | 0 rows |

The row that matters is **member of tenant B**. If your suite has no persona that is a
real, logged-in user of a *different* tenant, it is not testing isolation — it is
testing login.

### The false green in this specific test

**A blocked UPDATE or DELETE is not an error. It affects zero rows and returns
success.** A test that asserts "no exception was raised" passes identically against a
correct policy and a completely absent one.

```sql
-- WRONG: passes on a table with no RLS at all
update invoices set total = 0 where id = :other_tenants_invoice;  -- no error, test green

-- RIGHT: assert the count, and assert the row is unchanged
with u as (update invoices set total = 0 where id = :other_tenants_invoice returning 1)
select count(*) from u;                       -- must be 0
-- then, as tenant A, re-read the row and assert total is untouched
```

Assert **row counts and post-state**, never the absence of an exception. Per
`calibrated-check`: before you trust any of these tests, drop the policy on purpose,
watch every one of them go red, and put it back.

### Reviewing a diff

Three tells that a change is unsafe:

1. A test was weakened in the same commit as the policy it covers.
2. A new table, view, or RPC appears with no matching negative-persona test.
3. `service_role` appears in a route that takes a user-supplied id.

## Part 3 — Performance, so isolation survives contact with production

An RLS predicate runs per row. Two fixes cover most of it:

- **Index the policy's columns** — `tenant_id`, and any membership-join column.
- **Wrap the identity call in a subselect** so the planner evaluates it once as an
  InitPlan instead of per row: `(select auth.uid())`, not `auth.uid()`.
- Denormalise `tenant_id` onto child tables rather than making every policy join
  upward through a parent.

A policy so slow it gets disabled "temporarily" is a policy that does not exist.

## Output

Report per table/view/RPC: RLS enabled? forced? which of the nine bypasses apply, with
the object named; which matrix cells have tests; and which cells are **untested** —
untested is not passing. End with the cross-tenant test you actually ran and its result.
