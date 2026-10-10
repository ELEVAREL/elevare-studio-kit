/**
 * Money and month formatting for the client-facing billing surfaces.
 *
 * ★ HAND-ROLLED, AND NOT NEGOTIABLE. Same rule as
 *   src/app/components/monthly-bill.tsx and src/lib/feed/format.ts:
 *   `toLocaleString` / `Intl.NumberFormat` resolve against the ICU data of
 *   whichever runtime is asking, so the Node process that renders the HTML
 *   and the browser that hydrates it can legitimately disagree about a
 *   separator. When they do, React throws the whole client tree away and
 *   the page is served as dead HTML: it looks perfect, every control is in
 *   the DOM, and not one of them does anything. The bill component shipped
 *   exactly that for one build. These figures are the most consequential
 *   numbers in the product, and the earnings statement is a client island,
 *   so this is the one place the risk is highest.
 *
 * The formatting is a deliberate copy of the bill's, not an import: that
 * component is a "use client" module the brief forbids modifying, and
 * importing from it would drag the whole marketing bill into the app
 * bundle. Two callers, one behaviour, verified by the same worked example
 * in both headers.
 */

/** Group a whole number with thousands separators. */
function group(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Cents as US dollars, always two decimals, thousands separated.
 * `usd(137550)` is "$1,375.50"; `usd(-13750)` is "-$137.50".
 */
export function usd(cents: number): string {
  const negative = cents < 0;
  const whole = Math.abs(Math.round(cents));
  const dollars = Math.floor(whole / 100);
  const rest = String(whole % 100).padStart(2, "0");
  return (negative ? "-$" : "$") + group(dollars) + "." + rest;
}

/**
 * A percentage as the client reads it: "10%", "7.5%". Trailing zeros are
 * dropped so a whole rate never renders as "10.00%".
 */
export function percent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return (Number.isInteger(rounded) ? String(rounded) : String(rounded)) + "%";
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "2026-09" to "September 2026". Unparseable input returns the input. */
export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const index = Number(match[2]) - 1;
  if (index < 0 || index > 11) return month;
  return `${MONTHS[index]} ${match[1]}`;
}

/** "2026-09" to "Sep 2026". */
export function monthLabelShort(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const index = Number(match[2]) - 1;
  if (index < 0 || index > 11) return month;
  return `${MONTHS_SHORT[index]} ${match[1]}`;
}

/** The current UTC month as "YYYY-MM". */
export function currentMonthUTC(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * How stale a figure is, said WITHOUT claiming an observation we did not
 * make. The house rule: a humanized freshness string is a claim about an
 * observation, so this only ever describes the stamp it was given.
 * "Just now" is reserved for a read that completed in this request, which
 * is why the caller passes `source`, not just a timestamp.
 */
export function freshnessLabel(asOf: string, live: boolean): string {
  if (live) return "Updated just now";
  const d = new Date(asOf);
  if (Number.isNaN(d.getTime())) return "Last updated: unknown";
  const day = `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes()
  ).padStart(2, "0")} UTC`;
  return `Figures as of ${day}, ${time}`;
}
