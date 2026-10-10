/**
 * The zero-sales clock (OPERATIONS.md SOP-7, Ladder B). SERVER-ONLY.
 *
 * The ladder:
 *   1 consecutive zero-sale month   internal flag only, nothing to the client
 *   2                               warning plus a diagnosis and an offer to
 *                                   help, drafted by an agent, SENT BY A HUMAN
 *   3                               the engagement ends, human approval required
 * Any sale at all resets the count to zero.
 *
 * ★ THIS MODULE DOES NOT DEFINE THE NUMBER. It reads the same closed-month
 *   snapshots /admin/billing invoices from, most recent first, and counts the
 *   leading run of months whose transaction count was zero. Consequences:
 *
 *   - It reads a WINDOW (three months). A client at three is at "three or
 *     more"; the field says so rather than implying an exact history.
 *   - A client with no snapshot for the most recent closed month has not been
 *     billed yet, so the clock does not apply and renders as such. It is never
 *     rendered as zero, because "zero" and "we have not started counting" are
 *     different facts and only one of them is reassuring.
 *   - When the billing schema is absent the whole thing is unavailable, and the
 *     column says that rather than showing a number nobody computed.
 */

import type { createClient } from "@/lib/supabase/server";
import {
  BILLING_MONTH_RPC,
  lastClosedMonth,
  monthStartDate,
  shiftMonth,
  type BillingMonthRow,
} from "./contract";

/** How many closed months are read. The clock therefore saturates here. */
export const ZERO_SALES_WINDOW = 3;

export type ZeroSalesClock =
  | { state: "not_billed" }
  | { state: "counted"; months: number; saturated: boolean };

export type ZeroSalesReading =
  | { available: false; reason: string }
  | { available: true; byClient: Map<string, ZeroSalesClock> };

/** The signed-in admin's session client, exactly as the pages build it. */
type AdminSessionClient = Awaited<ReturnType<typeof createClient>>;

/**
 * @param supabase the SIGNED-IN ADMIN's client. The RPC asserts is_admin()
 *   inside and journals the actor, so it must not be a service-role client.
 */
export async function readZeroSalesClock(
  supabase: AdminSessionClient,
  now: Date = new Date(),
): Promise<ZeroSalesReading> {
  const months: string[] = [];
  const latest = lastClosedMonth(now);
  for (let i = 0; i < ZERO_SALES_WINDOW; i += 1) {
    months.push(shiftMonth(latest, -i)); // most recent first
  }

  const results = await Promise.all(
    months.map((m) =>
      supabase.rpc(BILLING_MONTH_RPC, { p_month: monthStartDate(m) }),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return { available: false, reason: failed.error.message };
  }

  // month index -> clientId -> txn_count
  const perMonth = results.map((r) => {
    const rows = (r.data ?? []) as BillingMonthRow[];
    return new Map(
      rows
        .filter((row) => row.snapshot_id != null)
        .map((row) => [row.client_id, row.txn_count]),
    );
  });

  const clientIds = new Set<string>();
  for (const m of perMonth) for (const id of m.keys()) clientIds.add(id);

  const byClient = new Map<string, ZeroSalesClock>();
  for (const id of clientIds) {
    if (!perMonth[0].has(id)) {
      // No closed month at the top of the window: nothing to count from.
      byClient.set(id, { state: "not_billed" });
      continue;
    }
    let run = 0;
    for (const m of perMonth) {
      const count = m.get(id);
      if (count === undefined) break; // the window ran out of known months
      if (count > 0) break; // a sale resets the clock
      run += 1;
    }
    byClient.set(id, {
      state: "counted",
      months: run,
      saturated: run >= ZERO_SALES_WINDOW,
    });
  }

  return { available: true, byClient };
}
