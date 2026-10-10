# Staff roles console — operator views on a shared device

**When to reach for it:** the software staff actually run the business from — the shared iPad at the counter, the manager's dashboard, the owner's phone. Different roles, one system, often one physical device. Distinct from `admin-dashboard/owner-dashboard-blueprint.md` (the owner's private back-office): this is the shop-floor surface.

## The pattern

**Role-based views, enforced at the DB.** Owner sees money (revenue, distribution, payroll); manager sees the day's book and staff; staff see *their own* queue and earnings; the kiosk/customer face sees nothing private. Views are a UI convenience — RLS/definer-RPCs are the enforcement. When a shared-device role legitimately needs a slice of gated data (e.g. the staff login needs the stylist roster to assign work, but the roster table is owner-only), expose a **minimal SECURITY DEFINER RPC** (`list_active_staff()` → id+name only), not a wider policy. Live lesson: the roster RLS silently returned 0 rows to the kiosk's staff session, so every control gated on "pick a stylist" was disabled — no error anywhere.

**PIN / short-auth at the shared device.** A full login per action is unusable at a counter; a 4-digit PIN is the right friction — but only if the server enforces it:

- **The PIN is re-verified server-side in the same request as the write it authorizes.** A PIN checked in the browser with the answer discarded gates a *screen*, not the action (live bug: exactly that shipped).
- A passed PIN authorizes **that one action**, not a session — the client list stays shut.
- **Gate the action that WRITES, not the one that collects.** A QR that moves money *into* the till can sit open on the customer-facing screen; "record cash sale" writes a row anyone could fake and takes the PIN. This asymmetry is the durable design rule.
- Rate-limit PIN attempts **in the DB keyed on the authenticated user**, never in per-instance memory keyed on a client-supplied header. Never commit the PIN to a migration/repo; rotate via a settings row.

**Per-action audit trail.** Every consequential act writes who/what/when/from-which-device: `audit_log(actor_id, role, action, subject_id, device, created_at)` plus a `client_request_id` for idempotency. Voids, refunds, comps, roster changes, PIN-authorized writes — all of it. The audit row is written in the same transaction as the action; an action that can't be attributed shouldn't commit.

**Degraded mode per role** — decide it per role, in advance:
- *Staff:* keep selling — cash queue locally (see `pos-offline-till.md`), card explicitly unavailable, today's schedule from last-good cache marked stale.
- *Manager:* read-only view of the cached day; edits queue or are refused loudly — never silently dropped.
- *Owner:* money figures either live or clearly labeled "as of HH:MM" — a stale number presented as current is worse than none.

## The traps

- **Portalled dropdowns die silently inside full-screen kiosk shells** (Radix `Select` at z-50 behind a z-100 shell — the tap just does nothing). Plain inline `<button>` grids on kiosk/tablet surfaces, always.
- **Prove a dead control from the DATA, not screenshots:** a column that is 100% its default value is the signature of a control nobody can use; a merely-unpopular control produces a mix.
- **A shortcut behind the gate it shortcuts is not a shortcut** — put the frequent staff action on the surface staff actually see, then gate its write.
- **Shared-device sessions live forever.** Idle timeout back to the neutral face; never leave the manager view up for the next customer to find.
- **Never remove/merge a staff row** — deactivate. Pay history hangs off it.

## Where it's been used

Not yet used in production as a packaged pattern — seeded 2026-08-29 from studio lessons (Fanta kiosk: server-side PIN re-verification, write-vs-collect gating, `list_active_staff()` definer RPC, dead-Radix-select diagnosis, role-split owner/manager/stylist views). Owner back-office spine: `admin-dashboard/owner-dashboard-blueprint.md`.
