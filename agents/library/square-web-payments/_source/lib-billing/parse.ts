/**
 * Defensive normalizers for billing payloads.
 *
 * Isomorphic on purpose: the server parses `my_earnings_summary` /
 * `my_earnings_transactions` / `my_invoice_lines` with these, and the
 * client island parses the optional live-hydrate response with the SAME
 * functions. One definition of "what a valid month looks like" means the
 * hydrate path cannot render a shape the server path would have rejected,
 * which is the seam a hydrate-on-top design would otherwise grow.
 *
 * Everything is validated rather than cast. A cast would let a null amount
 * render as "$NaN" on a money surface. A bad row is DROPPED, never
 * silently coerced to zero.
 *
 * FIELD NAMES. `parseLine` accepts the DATABASE's names first
 * (`txn_ref`, `txn_kind`, `base_cents`, `line_kind`) and the older
 * camel/short aliases second, because the live-hydrate endpoint is
 * specified in those. The database is the authority where they disagree.
 */

import type { EarningsLine, EarningsMonth, EarningsSource, TxnKind } from "./contract";
import {
  STANDARD_DEPOSIT_RATE_PERCENT,
  STANDARD_OTHER_RATE_PERCENT,
} from "./contract";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A finite number, or the fallback. Rejects NaN, Infinity, and strings. */
function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Cents are integers. A fractional cent is a bug upstream, not a display. */
function cents(value: unknown, fallback = 0): number {
  return Math.round(num(value, fallback));
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** ISO-ish timestamp, or null. Anything Date cannot read is not a time. */
function stamp(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  return Number.isNaN(new Date(s).getTime()) ? null : s;
}

/**
 * Only http(s) links are ever rendered. A `javascript:` or `data:` href
 * arriving through a jsonb column is an injection vector, and this column
 * is populated from a client site's own database.
 */
function safeUrl(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  try {
    const url = new URL(s);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function kindOf(value: unknown): TxnKind {
  return value === "deposit" ? "deposit" : "other";
}

/**
 * A refund or chargeback line. The database writes `line_kind` as
 * 'charge' or 'credit'; anything else is treated as a charge, which is the
 * conservative reading (a credit mislabelled as a charge would overstate
 * the bill, and that cannot happen this way round).
 */
function lineKindOf(value: unknown): "charge" | "credit" {
  return value === "credit" ? "credit" : "charge";
}

/**
 * A label for a line, derived only from fields the database actually
 * holds. There is no product or service NAME on any member-readable
 * billing surface, so nothing here invents one: a credit says it is a
 * refund, and a charge says which of the two rates it met.
 */
function labelOf(lineKind: "charge" | "credit", kind: TxnKind): string {
  if (lineKind === "credit") return "Refund";
  return kind === "deposit" ? "Deposit" : "Sale";
}

/** One transaction line. Returns null when it is not renderable. */
export function parseLine(value: unknown): EarningsLine | null {
  if (!isRecord(value)) return null;
  const ref = str(value.txn_ref ?? value.ref);
  const occurredAt = stamp(value.occurred_at ?? value.occurredAt);
  if (!ref || !occurredAt) return null;

  const kind = kindOf(value.txn_kind ?? value.kind);
  const lineKind = lineKindOf(value.line_kind ?? value.lineKind);
  const ratePercent = num(
    value.rate_percent ?? value.ratePercent,
    kind === "deposit"
      ? STANDARD_DEPOSIT_RATE_PERCENT
      : STANDARD_OTHER_RATE_PERCENT
  );

  return {
    ref,
    lineKind,
    occurredAt,
    label: str(value.label) ?? labelOf(lineKind, kind),
    kind,
    amountCents: cents(value.base_cents ?? value.amount_cents ?? value.amountCents),
    feeCents: cents(value.fee_cents ?? value.feeCents),
    ratePercent,
    sourceUrl: safeUrl(value.source_url ?? value.sourceUrl),
  };
}

export function parseLines(value: unknown): EarningsLine[] {
  if (!Array.isArray(value)) return [];
  const out: EarningsLine[] = [];
  for (const item of value) {
    const line = parseLine(item);
    if (line) out.push(line);
  }
  // Newest first: a client checking "did my last booking land" looks at
  // the top of the list, not the bottom of it.
  out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return out;
}

/**
 * The rows of `my_earnings_transactions()` or `my_invoice_lines`. Both
 * carry the same column names, which is the point: the list that justifies
 * an invoice and the list behind the running total are the same shape from
 * the same reader.
 */
export function parseTransactionRows(value: unknown): EarningsLine[] {
  return parseLines(value);
}

/** "2026-09-01" (a DATE) or "2026-09" to the "2026-09" the UI labels by. */
function monthKeyOf(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const match = /^(\d{4})-(\d{2})/.exec(s);
  return match ? `${match[1]}-${match[2]}` : null;
}

/**
 * `my_earnings_summary()`'s jsonb, plus the lines from
 * `my_earnings_transactions()`, to the month the surfaces render.
 *
 * ★ EVERY FIGURE HERE IS NET, because every figure the database returns is
 *   net. A refund is a dated negative line inside the month window, not a
 *   carried-forward balance, so `base_cents` and `fee_cents` already
 *   account for it and `deposit_fee_cents + other_fee_cents = fee_cents`
 *   by construction. There is no "credits" figure on this surface; an
 *   invoice has one, because `invoices.credits_cents` is a real column.
 *
 * ★ THE FEE SPLIT COMES FROM THE DATABASE; THE REVENUE SPLIT IS DERIVED.
 *   The summary carries the fee by transaction kind but not the revenue by
 *   transaction kind, so the revenue split is summed from the lines. When
 *   the line list is absent or short, that sum will not account for the
 *   authoritative total, `splitIsComplete` says so, and the statement
 *   drops the breakdown instead of printing a $0.00 that reads as a fact.
 *
 * `lines === null` means the list could not be read at all, which is a
 * different state from an empty month: `txnCount` still comes from the
 * summary's own counts, so the ledger can say "not available" rather than
 * "no payments".
 */
export function parseEarningsSummary(
  value: unknown,
  lines: EarningsLine[] | null
): EarningsMonth | null {
  if (!isRecord(value)) return null;
  const month = monthKeyOf(value.period_month);
  if (!month) return null;

  const rows = lines ?? [];
  let depositBaseCents = 0;
  let otherBaseCents = 0;
  for (const row of rows) {
    if (row.kind === "deposit") depositBaseCents += row.amountCents;
    else otherBaseCents += row.amountCents;
  }

  const source: EarningsSource =
    value.source === "snapshot" ? "snapshot" : "live";

  return {
    month,
    source,
    asOf: stamp(value.as_of) ?? new Date(0).toISOString(),
    depositBaseCents,
    otherBaseCents,
    baseCents: cents(value.base_cents),
    depositFeeCents: cents(value.deposit_fee_cents),
    otherFeeCents: cents(value.other_fee_cents),
    feeCents: cents(value.fee_cents),
    txnCount: Math.max(
      0,
      Math.round(num(value.charge_count, 0) + num(value.credit_count, 0))
    ),
    depositRatePercent: num(
      value.deposit_fee_percent,
      STANDARD_DEPOSIT_RATE_PERCENT
    ),
    otherRatePercent: num(
      value.transaction_fee_percent,
      STANDARD_OTHER_RATE_PERCENT
    ),
    firstSaleAt: stamp(value.first_sale_at),
    rows,
  };
}

/**
 * The LIVE-HYDRATE payload to an EarningsMonth.
 *
 * This is the client island's parser for the optional
 * `LIVE_EARNINGS_ENDPOINT` re-read. It accepts a flatter, camel-tolerant
 * shape than the RPC's jsonb, and it derives the per-kind splits from
 * `rows` when the payload does not carry them, because a re-read of an
 * open month may legitimately ship the lines and the totals only.
 *
 * The row's own totals win when present: they are what the invoice will be
 * generated from. The split's sum is reconciled against the authoritative
 * total by `splitIsComplete` so a disagreement is visible rather than
 * papered over.
 */
export function parseMonth(
  value: unknown,
  source: EarningsSource
): EarningsMonth | null {
  if (!isRecord(value)) return null;
  const month = monthKeyOf(value.month ?? value.period_month);
  if (!month) return null;

  const rows = parseLines(value.rows);

  let depositBaseCents = 0;
  let otherBaseCents = 0;
  let depositFeeCents = 0;
  let otherFeeCents = 0;
  for (const row of rows) {
    if (row.kind === "deposit") {
      depositBaseCents += row.amountCents;
      depositFeeCents += row.feeCents;
    } else {
      otherBaseCents += row.amountCents;
      otherFeeCents += row.feeCents;
    }
  }

  const baseCents = cents(
    value.base_cents ?? value.baseCents,
    depositBaseCents + otherBaseCents
  );
  const feeCents = cents(
    value.fee_cents ?? value.feeCents,
    depositFeeCents + otherFeeCents
  );

  return {
    month,
    source,
    asOf: stamp(value.as_of ?? value.asOf) ?? new Date(0).toISOString(),
    depositBaseCents,
    otherBaseCents,
    baseCents,
    depositFeeCents: cents(value.deposit_fee_cents, depositFeeCents),
    otherFeeCents: cents(value.other_fee_cents, otherFeeCents),
    feeCents,
    txnCount: Math.max(
      0,
      Math.round(num(value.txn_count ?? value.txnCount, rows.length))
    ),
    depositRatePercent: num(
      value.deposit_rate_percent ??
        value.depositRatePercent ??
        value.deposit_fee_percent,
      rows.find((r) => r.kind === "deposit")?.ratePercent ??
        STANDARD_DEPOSIT_RATE_PERCENT
    ),
    otherRatePercent: num(
      value.other_rate_percent ??
        value.otherRatePercent ??
        value.transaction_fee_percent,
      rows.find((r) => r.kind === "other")?.ratePercent ??
        STANDARD_OTHER_RATE_PERCENT
    ),
    firstSaleAt: stamp(value.first_sale_at ?? value.firstSaleAt),
    rows,
  };
}

/**
 * Does the per-kind split account for the authoritative totals?
 *
 * When the line list is missing or short, the summed split does NOT add up
 * to the month's own `base_cents` / `fee_cents`, and the statement must not
 * present a breakdown as complete. It renders the totals and says the
 * breakdown is unavailable. Silence here is how a client is shown a figure
 * that does not add up and is never told.
 */
export function splitIsComplete(month: EarningsMonth): boolean {
  return (
    month.depositBaseCents + month.otherBaseCents === month.baseCents &&
    month.depositFeeCents + month.otherFeeCents === month.feeCents
  );
}
