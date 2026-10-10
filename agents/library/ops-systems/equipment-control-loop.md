# Equipment control loop — software meets machines

**When to reach for it:** the business's software has to drive physical hardware — car-wash bay controllers, door locks/gates, signage, dispensers, chargers. The machine is a slow, unreliable, occasionally lying peer on the network. Design the loop so the *database* is the source of intent and the machine is only ever the source of observed state.

## The pattern

**Command queue with acknowledgement — never fire-and-forget:**

```sql
create table machine_commands (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id),
  command text not null,             -- 'start_wash' | 'unlock' | 'display' ...
  payload jsonb not null default '{}',
  status text not null default 'queued', -- queued|sent|acked|failed|expired
  issued_by uuid not null,           -- audit: who asked (see staff-roles-console)
  queued_at timestamptz not null default now(),
  sent_at timestamptz, acked_at timestamptz,
  expires_at timestamptz not null    -- a stale 'start' must never fire late
);
```

A dispatcher marks `sent`, the machine (or its bridge) reports `acked`; anything not acked by a deadline flips `failed` and surfaces to the operator. **`expires_at` is load-bearing:** a queued "open bay" that finally delivers 40 minutes later, onto a different customer, is a safety incident — expire aggressively and require re-issue.

**State: poll as the baseline, webhooks/pushes as an accelerant.** Events get lost (the studio's live version of this lesson: a payment processor's events simply never arrived at the endpoint listening for them, and the screen hung forever). So the loop is: machine pushes state when it can, **and** a poller reconciles every N seconds against last-observed state. The DB stores `last_seen_at`, `last_state`, `last_state_at` per machine; any decision reads those, never a live call in the request path.

**The machine-offline path is a designed mode, not an error:** `now() - last_seen_at > threshold` ⇒ machine is *offline* — stop queuing new customer-facing commands to it, take its resource out of the slot generator (`scheduling-and-capacity.md`), show staff an honest banner, and keep taking cash for what still works manually. Commands issued while offline sit `queued` and expire on schedule.

**Never trust the machine's clock.** Embedded clocks drift, reset to epoch on power-cycle, and lie confidently. Every timestamp that matters is stamped **server-side on receipt** (`observed_at`); the machine's own timestamp is stored as `device_reported_at` for diagnostics only. Sequence/ordering decisions use server receipt order or a monotonic per-machine counter — never device wall-clock.

**Manual override is a first-class feature.** The physical business cannot wait for a fix: staff must be able to force-start, force-unlock, or mark-done from the console — PIN-gated, audit-logged (`issued_by` + reason), and recorded as `override=true` so reconciliation knows a human bypassed the loop. A wash that was force-started still produces a sale row. If the only override is "the owner phones the developer," the system has failed.

## The traps

- **Ack ≠ done.** `acked` means the machine heard you; completion is a separate observed state. Bill/complete on observed completion (or staff confirmation), not on ack.
- **Idempotent command delivery:** the bridge may see a command twice — machines must dedupe on command id, or the bridge must (same `client_request_id` discipline as `pos-offline-till.md`).
- **Uniformly-default telemetry columns mean the sensor path is dead**, not that nothing happened — the same diagnosis rule as dead UI controls.
- **A reconcile sweep is the safety net:** a cron that compares recent commands vs observed states and flags orphans (paid but never started, started but never billed) — the equipment version of the payment reconcile cron.
- **Test the offline path on purpose** (unplug it) before launch; it's the mode the owner will actually meet.

## Where it's been used

Not yet used in production as a packaged pattern — seeded 2026-08-29 from studio lessons (events-never-arrive → reconcile-on-poll, self-healing pollers, expiring queued intents, PIN-gated audited manual writes). Sidecar process supervision (local bridge daemons): `local-media-ai/sidecar-supervisor-reliability.md`.
