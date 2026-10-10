# Booking engine — slots, deposits, cancellation windows, reminders

**When to reach for it:** the customer-facing half of any reservation business — the flow that turns "I want Saturday at 2" into a deposit-secured booking with honest cancellation terms. Sits on top of `scheduling-and-capacity.md` (which owns the truth about what's free).

## The pattern

**Slot generation is a pure function of capacity**, never a hand-maintained list: `open hours × resources × service duration+buffer − existing bookings = offered slots`. Generate server-side on request; the client renders what it's given. A slot the generator offers can still be lost between render and pay — the DB exclusion constraint is the arbiter, and "that slot was just taken" is a normal, friendly outcome of the pay step, not an error page.

**Deposit at booking, balance at service.** House default: **10% deposit** (or a flat amount when the service price varies wildly — a flat $50 reads simpler to customers than "10% of $140–200+"). The deposit is what makes a no-show cost something; price it to sting, not to punish.

**Cancellation window with refund eligibility encoded in data, not prose:**

```sql
-- on the booking row
deposit_cents int not null,
deposit_refundable_until timestamptz not null,  -- starts_at - interval '48 hours'
cancelled_at timestamptz,
refund_status text  -- null | 'eligible' | 'refunded' | 'forfeited'
```

Live example: **Fanta African Hair runs a $50 deposit, refundable if the customer cancels 48+ hours before the appointment** — cancel inside the window and the deposit is forfeited toward the held slot. Compute eligibility at cancel time from the stored timestamp (`cancelled_at < deposit_refundable_until`), stamp `refund_status`, and let the refund itself be a separate, human-visible step. State the window on the booking page, in the confirmation email, and at cancel time — the same number in all three places.

**Reminder / no-show flow:**
- Confirmation immediately; reminder at ~24h (before the refund window closes is the kind move — give them a chance to cancel free); optional same-day nudge.
- No-show is an explicit status set by staff, not an inference — it releases the slot's history correctly, forfeits the deposit, and feeds the "should we require prepayment from this customer" signal.
- Make every send **idempotent at the DB**: a unique partial index on `(booking_id, email_type)` in the email log. Queue layers happily deliver twice; the index is what actually dedupes.

## The traps

- **The Stripe idempotency key must cover the WHOLE request** (live loss: Fanta's booking intent keyed on a subset of params — customer switched stylist on the same slot, key collided, and that customer+service+date+time was **permanently bricked**; 4 lost bookings before it was found). Key = hash of the full sorted param object; catch `idempotency_error` and retry once under a fresh key. A rejected create leaves no PaymentIntent and no row — it reads as ordinary abandonment, which is why this class of bug hides.
- **Run a reconcile cron** (every 5–10 min): sweep recent succeeded payments that lack a booking row and re-run confirmation idempotently. Webhooks fail, tabs close mid-flow; a paying customer must never end with nothing.
- **Dropping a unique index silently breaks every `upsert onConflict` on that column** — grep `onConflict` after any constraint change (live bug: new customers charged with no appointment created).
- **Refund terms are a promise.** Never auto-refund outside the encoded rule, and never quietly change the window on existing bookings.

## Where it's been used

Not yet used in production as a packaged pattern — seeded 2026-08-29 from studio lessons (Fanta: 48-hour refundable $50 deposit, the idempotency-key bricking incident, `reconcile-pending-bookings`, unique-partial-index email dedupe). Payments spine: `ecommerce-supabase-stripe/themed-inapp-payments.md`; fee-split variant: `stripe-connect/`.
