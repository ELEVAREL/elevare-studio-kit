# Scheduling & capacity — bookable resources with DB-level double-booking prevention

**When to reach for it:** any business where a finite physical resource is sold by the time slot — car-wash bays, salon chairs, machines, rooms, lifts, grooming tables. The moment two customers (or a customer and a walk-in) can want the same resource at the same time, the schedule is a concurrency problem, and it must be solved **in the database**, not in application code.

## The pattern

**Model resources explicitly**, even when today there's only one kind:

```sql
create table resources (           -- a bay, a chair, a machine
  id uuid primary key default gen_random_uuid(),
  kind text not null,              -- 'bay' | 'chair' | ...
  label text not null,             -- "Bay 2"
  is_active boolean not null default true
);
create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_min int not null,       -- service time
  buffer_min int not null default 0,  -- cleanup/reset AFTER, part of the block
  resource_kind text not null      -- which kind of resource it consumes
);
```

**A booking claims a resource for a time RANGE (duration + buffer), and the DB refuses overlap** — an exclusion constraint, never an application-level "check then insert" (two requests both pass the check, both insert):

```sql
create extension if not exists btree_gist;
create table bookings (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id),
  staff_id uuid references staff(id),          -- null until assigned, if staff float
  starts_at timestamptz not null,
  ends_at   timestamptz not null,              -- starts_at + duration + buffer
  status text not null default 'confirmed',    -- confirmed|in_progress|done|cancelled|no_show
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status not in ('cancelled','no_show'))
);
```

The `where` clause is load-bearing: a cancelled booking must release its slot without being deleted (its money/audit history stays). If staff are the scarce resource rather than the room, add a second exclusion constraint on `staff_id` — a stylist can't braid two heads, even in two different chairs.

**Walk-in vs reservation interleaving:** walk-ins are bookings too — insert them with `starts_at = now()` and an estimated range; the same constraint arbitrates. Hold policy: reservations own their exact slot; walk-ins fill gaps and may be quoted "next free = X" by querying the earliest non-overlapping range. Never run a separate walk-in ledger that the reservation path can't see — that's two sources of truth for one physical bay.

## The traps

- **Application-level availability checks are UI hints, not guards.** Keep them (grey out taken slots) but the constraint is the only line that holds under concurrency. Treat the insert's exclusion-violation error as the normal "slot just taken — pick another" path with friendly copy, not a 500.
- **Buffer inside the range, not beside it.** Modeling buffer as a separate follow-on row (or ignoring it) is how back-to-back bookings end up sharing a wet bay.
- **Capacity > 1** (three identical bays): either three `resources` rows and an allocator that tries each, or a slot-counting table with a unique partial index per (slot, seq). Prefer N rows — it keeps the exclusion constraint doing the work.
- **Store timestamptz, compute business days in the venue's timezone.** "Today's bookings" computed in UTC is off by a working evening (live lesson: a salon's daily summary reported the wrong ET day for weeks).
- **Never delete or merge a staff row** — earnings, assignments, and audit history hang off it. Deactivate (`is_active=false`) and stop.

## Where it's been used

Not yet used in production as a packaged pattern — seeded 2026-08-29 from studio lessons (Fanta salon scheduling: cancelled-must-release, UTC/ET day bugs, staff-row immutability; exclusion-constraint shape is the standard Postgres answer). Pairs with `booking-engine.md` (the customer-facing half) and `staff-roles-console.md` (who runs the board).
