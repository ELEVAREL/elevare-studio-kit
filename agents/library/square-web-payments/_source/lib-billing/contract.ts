/**
 * THE BILLING CONTRACT, AS ASSUMED BY THE CLIENT-FACING MONEY SURFACES.
 *
 * ★ THIS FILE IS THE SEAM, AND IT IS NOW RECONCILED AGAINST THE APPLIED
 *   SCHEMA. Every name below was read out of the migrations that are live
 *   on the database, not out of a plan:
 *
 *     supabase/migrations/20260901400300_m3e_billable_earnings_reader.sql
 *     supabase/migrations/20260901400400_m3f_earnings_snapshots.sql
 *     supabase/migrations/20260901400500_m3g_invoices.sql
 *     supabase/migrations/20260901400600_m3h_member_billing_surfaces.sql
 *
 *   The first pass of this wave GUESSED these names from the plan docs.
 *   `earnings_cache`, `monthly_earnings_snapshots` and `invoice_payments`
 *   do not exist at all, and members hold no grant on the `invoices` /
 *   `invoice_lines` base tables, so the pages rendered "not live" against
 *   a schema that was already applied. `flag_transaction_to_ticket` is the
 *   one guess that turned out to be RIGHT - it is applied in the m5
 *   migration and granted to `authenticated` - which is itself the
 *   argument for checking rather than assuming in either direction.
 *
 *   scripts/app-money-selftest.mjs section 9 now asserts every string in
 *   SOURCE and RPC against the migration files, and every column read.ts
 *   selects against the frozen column list of the view it selects from, so
 *   this class of drift fails a test instead of shipping.
 *
 * ★ A MEMBER READS THROUGH `my_*` VIEWS AND `my_*` RPCs, AND THOSE RESOLVE
 *   THE CALLER'S OWN CLIENT ID THEMSELVES (`member_client_ids()` inside the
 *   view, `my_client_id()` inside the function). None of them accept a
 *   client id, and `my_invoices` does not even expose a `client_id` column
 *   to filter on. That is stronger than the belt-and-braces `.eq(client_id)`
 *   this file used to describe: the browser cannot nominate a client,
 *   because there is no parameter to nominate one with.
 *
 * ── THE MODEL THIS RENDERS. READ BEFORE WRITING ANY COPY. ──────────
 * BILLED, NEVER SKIMMED. The client receives 100% of their revenue into
 * their own account. Elevare reads the earnings, computes a fee, and
 * INVOICES it monthly in arrears. No surface here may say or imply that
 * Elevare takes, holds, deducts, withholds, splits or keeps any part of a
 * client's payment. The arithmetic that proves it is the middle line of
 * the statement (src/app/components/monthly-bill.tsx): the two revenue
 * lines sum, to the cent, to "Paid straight into your account".
 *
 * TWO RATES, ONE CLIENT. 10% of deposits and bookings taken through the
 * site, 5% of everything else taken through the site. Both apply to the
 * same client, per transaction type. A rate is NEVER derived from an
 * industry, a business type, or anything else: it is set by hand at
 * onboarding and arrives on the row. `EarningsMonth.depositRatePercent`
 * and `otherRatePercent` are read from the data, never computed here.
 * The two constants below are the PUBLISHED STANDARD rates and exist only
 * as a last-resort display fallback for a row that carries no rate.
 *
 * ── DEGRADATION IS STILL A DESIGNED STATE ──────────────────────────
 * The schema is applied, so these reads are expected to succeed. They can
 * still fail — a member with no `billing_accounts` row, a rolled-back
 * object, a network fault — and every such failure returns
 * `available: false` and renders honest copy. Nothing here ever fabricates
 * a figure, and "we cannot load this" stays a different sentence from
 * "you have none".
 */

/* ── Object names (the reconciliation surface) ─────────────────────── */

/**
 * Views this UI SELECTs from, always on the member's own session (anon key
 * + RLS). The browser never holds a service key. Each view is an
 * owner-definer, security_barrier view over a base table the member holds
 * ZERO privilege on, row-scoped inside the view by `member_client_ids()`
 * (20260901400600). There is no client-id filter to apply and no
 * `client_id` column exposed to apply one with.
 */
export const SOURCE = {
  /**
   * `my_invoices(id, invoice_number, period_month, period_start,
   * period_end, currency, subtotal_cents, credits_cents, total_cents,
   * status, issued_at, due_at, sent_at, paid_at)`.
   *
   * `credits_cents` is ZERO OR NEGATIVE in the database and
   * `total_cents = subtotal_cents + credits_cents` is enforced by a CHECK.
   * `public_token` is deliberately NOT in the view: it is the capability
   * key for the unauthenticated receipt link.
   */
  invoices: "my_invoices",
  /**
   * `my_invoice_lines(invoice_id, line_no, line_kind, txn_ref,
   * source_table, occurred_at, txn_kind, rate_percent, base_cents,
   * fee_cents)`.
   *
   * ★ THIS IS THE DISPUTE KILLER. One row per transaction the fee was
   * computed on, frozen at invoice generation from the immutable month
   * snapshot. It is the transaction list the invoice page renders, and it
   * is the reason a client can check every line of their bill against
   * their own dashboard. There is no `id` column: `(invoice_id, line_no)`
   * is the key.
   */
  invoiceLines: "my_invoice_lines",
} as const;

/**
 * SECURITY DEFINER RPCs. Each one calls `my_client_id()` first, so it
 * resolves the CALLER'S own client and takes no client id from anywhere.
 */
export const RPC = {
  /**
   * `my_earnings_summary(p_month date default null) -> jsonb`.
   *
   * ★ EARNINGS IS A FUNCTION CALL, NOT A TABLE READ. There is no earnings
   * cache table and there never was one. When the month has closed this
   * returns the SNAPSHOT row (`source: "snapshot"`), so the figure matches
   * the invoice to the cent by construction; while the month is open it
   * runs the same reader live (`source: "live"`). `p_month` defaults to
   * the current month in the CLIENT'S OWN timezone, never a rolling UTC
   * window.
   *
   * Keys: source, snapshot_id, period_month, period_start, period_end,
   * timezone, currency, deposit_fee_percent, transaction_fee_percent,
   * fee_basis, charge_count, credit_count, charge_base_cents,
   * charge_fee_cents, credit_base_cents, credit_fee_cents,
   * deposit_fee_cents, other_fee_cents, base_cents, fee_cents,
   * billing_status, first_sale_at, as_of.
   *
   * ★ EVERY `*_cents` TOTAL IS NET. `base_cents` and `fee_cents` already
   * include the month's credit lines (which are negative), and
   * `deposit_fee_cents + other_fee_cents = fee_cents`. There is no
   * carried-forward credit BALANCE on this surface; a refund is a dated
   * negative line inside the month. Credits as a separate figure exist
   * only on an invoice, where `credits_cents` is a real column.
   */
  earningsSummary: "my_earnings_summary",
  /**
   * `my_earnings_transactions(p_month date default null)` -> setof
   * `(line_kind, txn_ref, source_table, occurred_at, txn_kind,
   * rate_percent, base_cents, fee_cents, currency)`.
   *
   * The list behind the number, from the SAME place the number came from:
   * a closed month reads its lines out of the snapshot, an open month runs
   * live. A credit line carries the SAME `txn_ref` as the charge it
   * reverses, so `txn_ref` alone is not a unique key within a month.
   */
  earningsTransactions: "my_earnings_transactions",
  /**
   * `my_invoice_for_payment(p_invoice_id uuid) -> jsonb`. The read the
   * payment route makes before it charges; it returns the amount FROM the
   * invoice row. Named here so the contract is complete. This UI does not
   * call it: the browser never names an amount, and the charge route
   * (SQUARE_PAY_ENDPOINT) is the only caller.
   */
  invoiceForPayment: "my_invoice_for_payment",
  /**
   * `flag_transaction_to_ticket(p_project text, p_txn_ref text,
   * p_note text, p_month text default null, p_invoice_id uuid default
   * null) -> jsonb {id, public_ref}`.
   *
   * ★ THIS ONE IS REAL, contrary to the note that used to sit here. It is
   * applied in 20260901120000_m5_marketing_and_ticket_flags.sql:800 and
   * granted to `authenticated` at :883. It opens a billing-category
   * ticket - the one category a SUSPENDED workspace may still file - and
   * stores {txn_ref, month, invoice_id} in the ticket's context, which is
   * what makes drill-to-source work in both directions. The last two
   * arguments default to null.
   */
  flagTransaction: "flag_transaction_to_ticket",
  /**
   * Phase C, exists today. The FALLBACK for the flag control, used only
   * when the structured function above is absent from the database. The
   * reference then travels in the message body instead of the context.
   */
  createClientTicket: "create_client_ticket",
  /** Phase A, exists today. Resolves the member's project key SERVER-SIDE. */
  memberProjectKeys: "member_project_keys",
} as const;

/**
 * Optional re-read endpoint for an OPEN month, called by the client island
 * after first paint. It does not exist in this repo, and that is fine:
 * `my_earnings_summary` already runs live inside the request that renders
 * the page, so the figures in the HTML are current as of that request.
 * This route only ever exists to refresh them without a navigation.
 *
 * Expected 200 body: `{ month: EarningsMonthPayload }` in the field names
 * `parseMonth` accepts. Anything else (404, 501, 5xx, a shape that fails
 * validation) leaves the server-rendered figures on screen with their own
 * "as of" stamp. There is no state in which a stale number is presented as
 * a fresh one.
 */
export const LIVE_EARNINGS_ENDPOINT = "/api/app/earnings/live";

/* ── Published standard rates (display fallback only) ───────────────── */

/** 10% of deposits and bookings taken through the site. */
export const STANDARD_DEPOSIT_RATE_PERCENT = 10;
/** 5% of everything else taken through the site. */
export const STANDARD_OTHER_RATE_PERCENT = 5;

/* ── Row shapes ─────────────────────────────────────────────────────── */

/**
 * Which rate a transaction met. NEVER inferred from an industry or a
 * business type: the reader classifies the transaction itself.
 */
export type TxnKind = "deposit" | "other";

/** One payment the client's own site took. Their data, not ours. */
export type EarningsLine = {
  /**
   * Stable reference: order number, booking id, or PI fragment
   * (`txn_ref`).
   *
   * ★ NOT UNIQUE WITHIN A MONTH. A refund line carries the same `txn_ref`
   * as the charge it reverses (20260901400300, the `union all`), so a
   * React key built from this alone collides on any refunded transaction.
   * Key on the index as well.
   */
  ref: string;
  /**
   * Charge or credit. A credit is a refund or chargeback: its
   * `amountCents` and `feeCents` are NEGATIVE, and they are the exact
   * negation of the charge, so a fully refunded transaction nets to zero
   * fee.
   */
  lineKind: "charge" | "credit";
  /** ISO timestamp of the payment. */
  occurredAt: string;
  /** What it was: service name, product name, "Deposit". */
  label: string;
  kind: TxnKind;
  /** What the CLIENT received. Gross, in cents. */
  amountCents: number;
  /** What Elevare will invoice on this line, in cents. */
  feeCents: number;
  /** The rate applied to this line, as a percentage. */
  ratePercent: number;
  /**
   * ★ THIS IS THE DRILL-TO-SOURCE. Deep link into the client's own site
   * where this payment lives (their order page, their booking). Absolute
   * http(s) URL or null; `parse.ts` rejects any other scheme, because
   * this value originates in a client site's own database.
   *
   * ★ ALWAYS NULL ON THE DATABASE PATH TODAY. Neither
   * `my_earnings_transactions` nor `my_invoice_lines` carries a source
   * URL; the closest thing the schema holds is `source_table` plus
   * `txn_ref`. The row still shows its reference, which is enough to find
   * the payment by hand, but the one-tap drill is gone: a client checking
   * a disputed figure has to go looking. This is a gap in the DATABASE,
   * not a supported state, and it is reported as such rather than faked.
   */
  sourceUrl: string | null;
};

/** How a rendered figure was established. Drives the freshness copy. */
export type EarningsSource =
  /** The reader run live inside this request. An open month. */
  | "live"
  /** An immutable month-close. The figure an invoice was made from. */
  | "snapshot";

/** One month of billable earnings and the fee accruing on it. */
export type EarningsMonth = {
  /** "2026-09" */
  month: string;
  source: EarningsSource;
  /** ISO timestamp the figures were true as of. */
  asOf: string;
  depositBaseCents: number;
  otherBaseCents: number;
  /** depositBaseCents + otherBaseCents. The client keeps all of it. */
  baseCents: number;
  depositFeeCents: number;
  otherFeeCents: number;
  /**
   * depositFeeCents + otherFeeCents. NET of the month's credit lines,
   * because every figure the earnings reader returns is net: a refund is
   * a dated negative line inside the window, not a separate balance.
   * `my_earnings_summary` guarantees
   * `deposit_fee_cents + other_fee_cents = fee_cents`.
   */
  feeCents: number;
  /** Charge lines plus credit lines. Matches `rows.length` when the list loaded. */
  txnCount: number;
  depositRatePercent: number;
  otherRatePercent: number;
  /**
   * When this client's site first took money, from `billing_accounts`.
   * Null means it never has. Bounds the month-history fan-out so the page
   * cannot render a row of $0.00 for a month that predates the client.
   */
  firstSaleAt: string | null;
  rows: EarningsLine[];
};

/**
 * Statuses a client is ever shown.
 *
 * The database column is `check (status in
 * ('draft','sent','paid','void','uncollectible'))` (20260901400500).
 * `overdue` is NOT a stored status: it is derived here from
 * `status = 'sent'` with a `due_at` in the past, which is a measured
 * statement rather than a stored flag. `draft` is backstage and is
 * filtered out before a row reaches a client surface.
 */
export type InvoiceStatus = "sent" | "overdue" | "paid" | "void";

/**
 * One invoice header plus everything the detail page renders.
 *
 * ★ WHAT IS DELIBERATELY ABSENT, AND WHY. The database has no
 * `invoice_payments` table and the `invoices` row carries no
 * `amount_paid_cents`. Settlement is BINARY in this schema: `status`
 * plus `paid_at`. So there is no `payments` list and no partial-payment
 * balance on this type. Inventing either would mean rendering a payments
 * ledger nobody wrote and a "balance" nobody computed, on a money page.
 * The Paid / Balance rows and the "Payments received" section were
 * removed rather than faked.
 *
 * There is also no summary line table. `invoice_lines` is one row PER
 * TRANSACTION, which is the evidence list (`transactions`), not a
 * statement breakdown. The statement is rendered from the header's own
 * real columns: subtotal, credits, total.
 */
export type Invoice = {
  id: string;
  /** Human reference printed on the invoice (`invoice_number`). */
  number: string;
  /** "2026-08" - the month the fee was earned on (from `period_month`). */
  month: string;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  /**
   * Revenue the site took that month. Context, never a charge.
   *
   * NOT a column on `invoices`: it is summed from `my_invoice_lines`,
   * which is the same evidence list printed below it. NULL when those
   * lines could not be read, and the page then omits the row rather than
   * printing a revenue figure it did not compute.
   */
  baseCents: number | null;
  /** Fee on charges, before credits. `subtotal_cents`, always >= 0. */
  subtotalCents: number;
  /**
   * Credits applied. POSITIVE cents here; the column is zero or negative
   * (`credits_cents <= 0`) and the sign is flipped once, on read.
   */
  creditsCents: number;
  /** What is actually due. `total_cents = subtotal_cents + credits_cents`. */
  totalCents: number;
  /**
   * The transaction list that justifies the bill, from `my_invoice_lines`
   * - frozen at generation from the immutable snapshot, so it cannot
   * drift from the figure it explains.
   */
  transactions: EarningsLine[];
};

/**
 * The result shape every reader in this module returns.
 *
 * `available: false` is any read failure. It is rendered as honest copy,
 * never as an empty ledger: "no invoices yet" and "we cannot reach your
 * figures" are different sentences and the UI must not confuse them.
 *
 * `"not-live"` means the billing surface is genuinely not switched on for
 * this member: the relation or function is absent, or the member has no
 * `billing_accounts` row for the reader to total against
 * (`ELV:BAD_INPUT` out of `my_earnings_summary`). `"failed"` is
 * everything else, and says so in different words.
 */
export type BillingRead<T> =
  | { available: true; data: T }
  | { available: false; reason: "not-live" | "failed" };

/* ── Square (the themed in-app payment panel) ───────────────────────── */

/**
 * The two values the Web Payments SDK needs in the browser. Both are
 * public by design (APP-DATA-SECURITY §3: "browser gets application id
 * and location id only"). The access token is server-held and never
 * reaches this file, this bundle, or any page.
 */
export type SquareConfig = {
  applicationId: string;
  locationId: string;
  /** "sandbox" or "production". Drives which SDK bundle loads. */
  environment: "sandbox" | "production";
};

/**
 * Server route that takes a Square card token and charges it. Owned by
 * the money-db / backend wave: it reads the amount FROM the invoice row
 * (never from the browser), holds SQUARE_ACCESS_TOKEN, and keys
 * idempotency on `invoice_id:attempt` so a double-click cannot
 * double-charge.
 *
 * Until it exists, the payment panel renders its honest disabled state
 * and names what is missing. A Pay button that cannot pay is never
 * rendered.
 */
export const SQUARE_PAY_ENDPOINT = "/api/app/invoices/pay";

/**
 * Read the Square browser config from env. Returns null when either
 * public value is absent, which is the state today.
 *
 * Both names must be literal `process.env.X` reads: Next inlines
 * NEXT_PUBLIC_* at build time only for a static property access, so a
 * computed lookup would silently be undefined in the browser bundle.
 */
export function squareConfigFromEnv(): SquareConfig | null {
  const applicationId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID;
  const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID;
  if (!applicationId || !locationId) return null;
  return {
    applicationId,
    locationId,
    environment:
      process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === "production"
        ? "production"
        : "sandbox",
  };
}

/**
 * Which pieces of the payment path are missing, in the client's language.
 * Rendered verbatim in the disabled panel: the honesty gate says a
 * surface must name what it cannot do, not go quiet.
 */
export function squareMissing(config: SquareConfig | null): string[] {
  const missing: string[] = [];
  if (!config) missing.push("the Square payment keys");
  // The charge route is the other half. It is not probed from the browser
  // (a probe on every render is a request nobody asked for); its absence
  // is declared by the server page through `payEnabled`.
  return missing;
}


/* ------------------------------------------------------------------ *
 * CONSOLE SIDE
 *
 * /admin/billing was built in a parallel wave against the names below.
 * They live in this same file on purpose: the client surface and the
 * console surface must never drift into two different ideas of what the
 * billing schema is called.
 * ------------------------------------------------------------------ */

/**
 * One admin-only RPC returns the whole month. See the header for its status.
 *
 * Two asks for whoever implements it:
 *   - assert is_admin() inside, and be granted to `authenticated` only, so the
 *     console can call it on the signed-in admin's session rather than a
 *     service key (the shape every other console RPC here uses);
 *   - do NOT journal to admin_actions on every read. admin_health_board() does,
 *     and it is a read the console makes once per page. This one is called four
 *     times per /admin/clients render (the month, plus the zero-sales window),
 *     and a journal that fills with reads stops being a record of decisions.
 */
export const BILLING_MONTH_RPC = "admin_billing_month";

/** Grounded in APP-DATA-SECURITY section 3. Creates the invoice FROM a snapshot. */
export const CREATE_INVOICE_RPC = "create_invoice_from_snapshot";

/**
 * One row per billable client for one closed month.
 *
 * `snapshot_id` is the immutable close artifact the invoice must be generated
 * from. A row with a null snapshot_id is a client whose month has not closed:
 * it is shown, and it is NOT sendable, because there is nothing to invoice.
 */
export type BillingMonthRow = {
  client_id: string;
  display_name: string;
  /** The project the money came through. Used for the Fanta assertion. */
  project_key: string | null;
  /** First day of the billing month, YYYY-MM-DD. */
  month: string;
  /** Immutable close artifact. Null = the month has not closed for this client. */
  snapshot_id: string | null;
  /** This client's own rates, copied at signature. Never inferred. */
  deposit_fee_percent: number | null;
  transaction_fee_percent: number | null;
  /** Gross that ran through the site in the period. */
  base_cents: number;
  /** The split the two rates apply to. */
  deposits_cents: number;
  other_cents: number;
  /** The number being invoiced. Computed in the DB, never in this console. */
  fee_cents: number;
  txn_count: number;
  /** Set once an invoice exists for this snapshot. */
  invoice_id: string | null;
  invoice_status: string | null;
  invoice_sent_at: string | null;
  /** The itemization that justifies fee_cents. */
  transactions: BillingTransaction[];
};

export type BillingTransaction = {
  /** The client-side reference the line drills back to. */
  ref: string;
  occurred_at: string;
  /** deposit | other -- decides which of the two rates applied. */
  kind: string;
  gross_cents: number;
  fee_cents: number;
  description: string | null;
};

/**
 * Fanta is NEVER billed (OPERATIONS.md standing rails; BUSINESS-PLAN section 3).
 *
 * The primary gate is structural and lives in the database: client_projects
 * carries `constraint no_fanta` (supabase/migrations/20260831120000_m1_tenancy.sql:101)
 * so no Fanta tenancy row can exist at all. This constant is the SECOND gate --
 * a console that would rather render nothing than render her a bill.
 */
export const NEVER_BILLED_PROJECT_KEYS: readonly string[] = ["fanta"];

/** True when a row must never appear on a billing surface. */
export function isNeverBilled(row: {
  project_key: string | null;
  display_name: string;
}): boolean {
  const key = (row.project_key ?? "").trim().toLowerCase();
  if (NEVER_BILLED_PROJECT_KEYS.includes(key)) return true;
  // Name check as well: a client could in principle be created with no project
  // link yet, which would slip past the key test above.
  return /\bfanta\b/i.test(row.display_name);
}

/**
 * A PostgREST failure that means "the object is not in the database yet"
 * rather than "the call was wrong". Drives the honest pre-migration state.
 *
 * PGRST202 = no such function. 42P01 = undefined_table. 42883 = undefined_function.
 */
export function isMissingBillingSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "PGRST202" || code === "42P01" || code === "42883") return true;
  const message =
    "message" in error ? String((error as { message: unknown }).message) : "";
  return (
    /could not find the function/i.test(message) ||
    /does not exist/i.test(message)
  );
}

/* ── Month helpers ─────────────────────────────────────────────────────────
   The billing period is the calendar month (SOP-6). All arithmetic is done in
   UTC on a YYYY-MM string so a server timezone can never shift the label. The
   per-client local midnight that decides the CLOSE is the database's business,
   not this console's -- the console only ever names a month.               */

/** "YYYY-MM" for the month that has most recently closed (the previous one). */
export function lastClosedMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based; month-1 is the previous month
  const d = new Date(Date.UTC(y, m - 1, 1));
  return monthKey(d);
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Accepts only YYYY-MM within a sane range. Anything else returns null. */
export function parseMonth(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  if (year < 2026 || year > 2100) return null;
  return `${match[1]}-${match[2]}`;
}

/** The DATE the RPC takes: the first day of the month. */
export function monthStartDate(month: string): string {
  return `${month}-01`;
}

/** Shift a YYYY-MM by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return monthKey(new Date(Date.UTC(y, m - 1 + delta, 1)));
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "September 2026". Fixed strings only -- never toLocaleString on the server. */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Cents to "$1,234.56". The only place money is formatted on this surface. */
export function money(cents: number): string {
  const negative = cents < 0;
  const whole = Math.floor(Math.abs(cents) / 100);
  const rest = String(Math.abs(cents) % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}.${rest}`;
}
