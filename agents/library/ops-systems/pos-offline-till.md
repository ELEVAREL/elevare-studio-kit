# POS / offline till — keep selling when the network dies

**When to reach for it:** any point-of-sale surface at a physical business — kiosk, till, tablet at the counter. The network WILL drop mid-shift, and a till that stops selling costs real money and trust. Design the till as an offline-first queue that the server reconciles, not a thin client that dies with the Wi-Fi.

## The pattern

**Local queue first, server second.** Every sale is written to a local outbox (IndexedDB / localStorage ring) the instant the operator confirms it, with a **client-minted UUID** and a client timestamp. The UI acknowledges from the local write — the network is not in the hot path for cash sales. A background flusher drains the outbox on reconnect, oldest first, stopping (and keeping the queue) on any error.

**Idempotent server writes.** The server upserts on the client-minted id (`client_request_id` unique constraint) so a double-tap, a retry, and a replay after reconnect all land exactly one row. Never SELECT-then-INSERT — the constraint is the idempotency, the error branch is the dedupe.

**Record the payment method AT WRITE TIME, on every row, no default:**

```sql
payment_method text not null check (payment_method in ('cash','card','other')),
payment_ref text,   -- processor charge/PI id when card; null for cash
```

**The live lesson this encodes: Fanta's kiosk recorded no payment method and the data is unrecoverable.** Kiosk charges stored no PaymentIntent reference, so when the business later needed to split cash from card (owner distribution, fee attribution, a processor account migration), the only tool left was *guessing by date cutover* — and the daily summaries were meanwhile **double-counting kiosk cash** because cash existed as two parallel row types (`walk_ins` + `manual_earnings`) that only some screens deduped. Weeks of money data, permanently ambiguous. One `not null` column and one row-type at write time would have prevented all of it. You cannot backfill what was never captured.

**Card while offline:** cards need the processor, so the honest degraded mode is explicit — "card unavailable, cash only" on the till, never a spinner. If a card flow involves a redirect/QR to the customer's phone, poll a server endpoint that **self-heals against the processor** (looks up the session by metadata and marks paid) rather than polling your own DB row and hanging forever.

**End-of-day reconciliation** is a first-class screen, not a spreadsheet: expected cash (sum of today's `cash` rows) vs counted drawer; card total vs processor's daily net; every discrepancy gets a note row, and the day is explicitly *closed* by a person. Anything the outbox failed to flush surfaces here loudly.

## The traps

- **A local write that isn't checked is a lie.** The till said "cash recorded" while RLS silently rejected the insert (live: `manual_earnings` had no staff INSERT policy and the code never read the result). Check every write's result; surface failure at the till, enqueue for retry.
- **One row type per sale.** Two tables both meaning "money came in" guarantees a double-count somewhere downstream.
- **Cash vs card asymmetry in auth:** a QR that *collects* money needs no gate; a button that *writes* "paid cash" from an unattended screen does — anyone walking past can credit a sale that never happened. Gate the action that writes, not the one that collects (see `staff-roles-console.md`).
- **Client clock ≠ truth.** Keep the client timestamp for ordering the outbox, but stamp server receipt time on flush; report business days in the venue's timezone.
- **Reconcile cron as the safety net:** sweep recent `pending` charges against the processor every few minutes so a closed tab or missed webhook can't strand a paid sale.

## Where it's been used

Not yet used in production as a packaged pattern — seeded 2026-08-29 from studio lessons (Fanta kiosk: missing payment-method capture, cash double-count, unchecked writes, self-healing `get-charge-details` poller, `reconcile-pending-charges`). Outbox mechanics: `personal-pwa/offline-first-vendored-supabase-sync.md`; credits-style idempotency: `serverless-thin-client/atomic-metered-credits.md`.
