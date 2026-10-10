/**
 * THE SINGLE DATA-ACCESS MODULE for the client-facing money surfaces.
 *
 * SERVER ONLY by convention (the repo does not carry the `server-only`
 * package as a hard dependency, so this is stated rather than enforced by
 * an import, same as src/lib/auth/auth-settings.ts): every function here
 * calls the cookie-backed server client and must only be reached from a
 * server component or a "use server" action.
 *
 * ★ THE MEMBER'S OWN SESSION, AND NO CLIENT ID ANYWHERE. Every read runs
 *   on the anon key with the member's cookie. Nothing here takes, sends or
 *   filters on a client id, because the database does not offer one to
 *   send: `my_invoices` / `my_invoice_lines` scope themselves inside the
 *   view with `member_client_ids()`, and `my_earnings_summary` /
 *   `my_earnings_transactions` call `my_client_id()` as their first
 *   statement. A page cannot hand these functions another client's id by
 *   accident, because there is no parameter for one. That is a stronger
 *   guarantee than the `.eq("client_id", ...)` belt this module used to
 *   carry against base tables the member could not read anyway.
 *
 * ★ EARNINGS IS AN RPC, NOT A TABLE READ. `earnings_cache` never existed.
 *   `my_earnings_summary()` returns the closed SNAPSHOT when the month has
 *   closed and runs the reader live when it has not, and
 *   `my_earnings_transactions()` returns the lines behind whichever of
 *   those it was. Both come from the same place, so the number and the
 *   list cannot disagree.
 *
 * Read failures are DESIGNED STATES, not crashes. Callers render honest
 * copy. No function in this file ever invents, estimates, or back-fills a
 * figure.
 */

import { createClient } from "@/lib/supabase/server";
import {
  RPC,
  SOURCE,
  type BillingRead,
  type EarningsLine,
  type EarningsMonth,
  type EarningsSource,
  type Invoice,
  type InvoiceStatus,
} from "./contract";
import { monthStartDate } from "./contract";
import { parseEarningsSummary, parseTransactionRows } from "./parse";

/**
 * Postgres/PostgREST's structural wording for "this object is not there".
 * Matched on the CODE first (42P01 undefined_table, 42883 undefined_
 * function, PGRST20x schema-cache miss), never on our own copy. Same
 * discipline as src/app/app/settings/rpc-code.ts.
 */
function isMissingObject(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST205"
  ) {
    return true;
  }
  const message = error.message ?? "";
  return /relation .* does not exist|function .* does not exist|could not find the (table|function)/i.test(
    message
  );
}

/**
 * `my_earnings_summary` raises `ELV:BAD_INPUT` when the client has no
 * `billing_accounts` row. That is not a fault and not a crash: it is the
 * literal statement "the reader that totals your payments is not switched
 * on for your workspace", which is the copy `reason: "not-live"` renders.
 * Branching on the ELV CODE, never on the message copy.
 */
function isNotBillingEnabled(error: { message?: string } | null): boolean {
  return /ELV:BAD_INPUT/.test(error?.message ?? "");
}

function readFailure<T>(
  where: string,
  error: { code?: string; message?: string } | null
): BillingRead<T> {
  if (isMissingObject(error) || isNotBillingEnabled(error)) {
    warnOnce(where, error?.message ?? "missing object");
    return { available: false, reason: "not-live" };
  }
  console.error(`[billing/${where}] read failed:`, error?.message ?? "unknown");
  return { available: false, reason: "failed" };
}

const warned = new Set<string>();
function warnOnce(where: string, message: string): void {
  if (warned.has(where)) return;
  warned.add(where);
  console.warn(
    `[billing/${where}] billing not enabled for this member: ${message}`
  );
}

/* ── Earnings ───────────────────────────────────────────────────────── */

/**
 * One month of earnings: the summary and the lines behind it.
 *
 * `month` is "YYYY-MM" and is passed to the RPC as the first day of that
 * month. Omitting it is not the same as passing today's month: the RPC
 * defaults to the current month in the CLIENT'S OWN timezone, which this
 * process cannot compute, so the default is always left to the database.
 *
 * The two calls are issued together. If the SUMMARY fails there is no
 * month at all and the page says so. If only the LINE LIST fails, the
 * totals still render and the ledger below them says the list is not
 * available - never an empty ledger presented as "no payments", which
 * would be a false statement about the client's own trade.
 */
export async function readEarningsMonth(
  month?: string
): Promise<BillingRead<EarningsMonth | null>> {
  const supabase = await createClient();
  const args = month ? { p_month: monthStartDate(month) } : {};

  const [summaryRes, linesRes] = await Promise.all([
    supabase.rpc(RPC.earningsSummary, args),
    supabase.rpc(RPC.earningsTransactions, args),
  ]);

  if (summaryRes.error) return readFailure("earnings-summary", summaryRes.error);

  if (linesRes.error) {
    // Reported, not hidden, and not turned into an empty list by silence.
    console.error(
      "[billing/earnings-transactions] read failed:",
      linesRes.error.message
    );
  }

  const parsed = parseEarningsSummary(
    summaryRes.data,
    linesRes.error ? null : parseTransactionRows(linesRes.data)
  );
  if (!parsed) {
    console.error("[billing/earnings-summary] unreadable payload shape");
    return { available: false, reason: "failed" };
  }
  return { available: true, data: parsed };
}

/**
 * The month history strip: every month this client has traded in, newest
 * first, capped at `limit`.
 *
 * ★ ONE RPC PER MONTH, DELIBERATELY BOUNDED. The schema exposes no bulk
 *   per-month reader to a member - `earnings_snapshots` is a base table a
 *   member holds no grant on, and `my_earnings_summary` answers for one
 *   month at a time. So the strip fans out, and the fan-out is bounded
 *   TWICE: by `limit`, and by the anchor month's own `first_sale_at`, so a
 *   client who started trading in August is never asked about (or shown) a
 *   July that predates them. A client with no first sale gets no strip at
 *   all rather than a column of $0.00, which on a money page is a claim.
 *
 *   A month that comes back with no snapshot and no money is dropped for
 *   the same reason. What remains is months that actually happened.
 *
 *   If this ever needs to be one round trip, the database - not this file
 *   - is where it belongs: a `my_earnings_months(p_limit int)` RPC beside
 *   the others in 20260901400600.
 */
export async function readEarningsHistory(
  anchor: EarningsMonth,
  limit = 12
): Promise<BillingRead<Array<{ month: string; baseCents: number; feeCents: number }>>> {
  if (!anchor.firstSaleAt) return { available: true, data: [] };

  const firstMonth = anchor.firstSaleAt.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(firstMonth)) return { available: true, data: [] };

  const months: string[] = [];
  for (let i = 0; i < limit; i += 1) {
    const m = shiftMonthKey(anchor.month, -i);
    if (m < firstMonth) break;
    months.push(m);
  }
  if (months.length === 0) return { available: true, data: [] };

  const supabase = await createClient();
  const results = await Promise.all(
    months.map((m) =>
      supabase
        .rpc(RPC.earningsSummary, { p_month: monthStartDate(m) })
        .then((res) => ({ month: m, res }))
    )
  );

  const rows: Array<{ month: string; baseCents: number; feeCents: number }> = [];
  for (const { month, res } of results) {
    if (res.error) {
      if (!isMissingObject(res.error) && !isNotBillingEnabled(res.error)) {
        console.error(
          `[billing/earnings-history] ${month} failed:`,
          res.error.message
        );
      }
      continue;
    }
    const summary = res.data as Record<string, unknown> | null;
    if (!summary || typeof summary !== "object") continue;
    const baseCents = intOf(summary.base_cents);
    const feeCents = intOf(summary.fee_cents);
    const closed = summary.source === "snapshot";
    // A month with no close and no money is a month that did not happen
    // for this client. Listing it as $0.00 would assert something.
    if (!closed && baseCents === 0 && feeCents === 0) continue;
    rows.push({ month, baseCents, feeCents });
  }
  return { available: true, data: rows };
}

function intOf(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Shift a "YYYY-MM" key by whole months, in UTC. */
function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* ── Invoices ───────────────────────────────────────────────────────── */

/**
 * Backstage statuses never reach a client surface. `draft` is a number
 * nobody has checked yet.
 */
const CLIENT_VISIBLE: ReadonlySet<string> = new Set([
  "sent",
  "paid",
  "void",
  "uncollectible",
]);

/**
 * The stored status, plus the one derived one.
 *
 * `overdue` is not a column: it is `sent` with a `due_at` that has passed,
 * measured at render time. `uncollectible` is shown as past due because
 * that is what it is from the client's side - unpaid, past its date, and
 * still payable (`my_invoice_for_payment` accepts it). Hiding it would
 * hide a real debt from the person who owes it.
 */
function invoiceStatus(value: unknown, dueAt: string | null): InvoiceStatus | null {
  if (typeof value !== "string" || !CLIENT_VISIBLE.has(value)) return null;
  if (value === "paid") return "paid";
  if (value === "void") return "void";
  if (value === "uncollectible") return "overdue";
  if (dueAt && new Date(dueAt).getTime() < Date.now()) return "overdue";
  return "sent";
}

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  period_month: string;
  status: string;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  subtotal_cents: number | null;
  credits_cents: number | null;
  total_cents: number | null;
};

/**
 * The FROZEN column list of `my_invoices`, minus what this UI does not
 * render. Every name here is in the view (20260901400600); a name that is
 * not in the view is a 400 from PostgREST, not a silent null.
 */
const INVOICE_SELECT =
  "id, invoice_number, period_month, status, issued_at, due_at, paid_at, subtotal_cents, credits_cents, total_cents";

function cents(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** "2026-08-01" (a DATE column) to the "2026-08" the UI labels months by. */
function monthOf(periodMonth: unknown): string | null {
  if (typeof periodMonth !== "string") return null;
  const match = /^(\d{4})-(\d{2})/.exec(periodMonth);
  return match ? `${match[1]}-${match[2]}` : null;
}

/** The header shape the list page renders. No transaction list. */
export type InvoiceSummary = Omit<Invoice, "transactions" | "baseCents">;

function toSummary(row: InvoiceRow): InvoiceSummary | null {
  const status = invoiceStatus(row.status, row.due_at);
  if (!status) return null;
  const month = monthOf(row.period_month);
  if (!month) return null;
  return {
    id: row.id,
    number: row.invoice_number ?? row.id.slice(0, 8).toUpperCase(),
    month,
    status,
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    paidAt: row.paid_at,
    subtotalCents: cents(row.subtotal_cents),
    // The column is zero or negative; the UI reads it as a positive
    // reduction. The sign is flipped exactly once, here.
    creditsCents: Math.abs(cents(row.credits_cents)),
    totalCents: cents(row.total_cents),
  };
}

export async function readInvoices(): Promise<BillingRead<InvoiceSummary[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(SOURCE.invoices)
    .select(INVOICE_SELECT)
    .order("period_month", { ascending: false })
    .limit(60);

  if (error) return readFailure("invoices", error);

  const rows: InvoiceSummary[] = [];
  for (const row of (data ?? []) as InvoiceRow[]) {
    const summary = toSummary(row);
    if (summary) rows.push(summary);
  }
  return { available: true, data: rows };
}

/**
 * One invoice with the evidence behind it.
 *
 * The invoice id comes from the URL, so it is untrusted input. It travels
 * as a bound query parameter and the VIEW is the gate: `my_invoices` only
 * ever contains this member's own rows, so another client's id and a
 * nonexistent id are one indistinguishable empty result. There is nothing
 * to cross-check it against in the app, and nothing that needs to be.
 *
 * `transactions` is `my_invoice_lines`: one row per transaction the fee
 * was computed on, frozen when the invoice was generated. `baseCents` is
 * summed from those same rows, so the revenue line and the list under it
 * are the same arithmetic. When the lines cannot be read, `baseCents` is
 * null and the page omits the revenue row rather than printing a total it
 * did not compute.
 */
export async function readInvoice(
  invoiceId: string
): Promise<BillingRead<Invoice | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(SOURCE.invoices)
    .select(INVOICE_SELECT)
    .eq("id", invoiceId)
    .limit(1);

  if (error) return readFailure("invoice", error);

  const row = (data?.[0] ?? null) as InvoiceRow | null;
  if (!row) return { available: true, data: null };
  const summary = toSummary(row);
  if (!summary) return { available: true, data: null };

  const linesRes = await supabase
    .from(SOURCE.invoiceLines)
    .select(
      "line_no, line_kind, txn_ref, source_table, occurred_at, txn_kind, rate_percent, base_cents, fee_cents"
    )
    .eq("invoice_id", invoiceId)
    .order("line_no", { ascending: true });

  if (linesRes.error) {
    console.error("[billing/invoice-lines] read failed:", linesRes.error.message);
    return {
      available: true,
      data: { ...summary, baseCents: null, transactions: [] },
    };
  }

  const transactions = parseTransactionRows(linesRes.data);
  const baseCents = transactions.reduce((sum, line) => sum + line.amountCents, 0);

  return {
    available: true,
    data: { ...summary, baseCents, transactions },
  };
}

/* ── The member's project key ───────────────────────────────────────── */

/**
 * The member's single project key, resolved SERVER-SIDE through the
 * Phase A definer RPC. The browser never nominates a project. Same
 * approach as src/app/app/tickets/actions.ts, which is the path the flag
 * control reuses.
 */
export async function memberProjectKey(): Promise<
  { key: string } | { error: "unavailable" | "none" | "ambiguous" }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(RPC.memberProjectKeys);
  if (error) {
    console.error("[billing/project-key] failed:", error.message);
    return { error: "unavailable" };
  }
  const keys = Array.isArray(data) ? (data as string[]) : [];
  if (keys.length === 0) return { error: "none" };
  if (keys.length > 1) return { error: "ambiguous" };
  return { key: keys[0] };
}

/* Re-exported so a caller needing the line type does not reach past this
   module into the contract for it. */
export type { EarningsLine, EarningsSource };
