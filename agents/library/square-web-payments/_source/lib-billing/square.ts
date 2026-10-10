/**
 * SQUARE IS THE RAIL. Stripe is not, and never will be again.
 *
 * Elevare's Stripe platform account was permanently closed on 2026-08-21 and
 * the appeal was denied (STANDARDS.md, memory [[square-is-the-card-rail]],
 * [[elevare-revamp-2026-08]]). Every invoice Elevare sends goes out through
 * SQUARE. Nothing on this surface may reach for Stripe.
 *
 * ★ THIS MODULE IS SERVER-ONLY. It reads secret env vars. It exports whether
 *   they are PRESENT and never what they contain -- not their length, not a
 *   prefix, not a masked form. Import it from server components and server
 *   actions only. (There is no `server-only` package in this repo; the rule is
 *   held by review, and by the fact that nothing here is ever passed to a
 *   client component as a prop.)
 *
 * WHY THERE IS NO LIVE SEND YET, AND WHAT IT WOULD TAKE
 * ------------------------------------------------------
 * Sending a monthly fee invoice needs THREE things. Today none of the three is
 * true, and the Send control is disabled with all three named on screen:
 *
 *   1. SQUARE CREDENTIALS in the environment (below). Not present anywhere in
 *      this branch, this repo's env, or the key registry seed
 *      (scripts/seed-key-registry.ps1 registers a vercel_token, a stripe key
 *      and others -- no square_* entry exists).
 *   2. THE BILLING SCHEMA (wave/money-db): the snapshot the invoice must be
 *      generated FROM, and create_invoice_from_snapshot(). See
 *      src/lib/billing/contract.ts.
 *   3. A DISPATCH IMPLEMENTATION that somebody has WATCHED SUCCEED against a
 *      real Square sandbox. There is none, so the flag below is false and the
 *      server action refuses even if 1 and 2 were satisfied. An affordance the
 *      studio has not watched succeed is not shipped (STANDARDS.md: "Never
 *      ship an affordance you haven't watched succeed").
 *
 * ★ TODO(square-invoice-dispatch) -- the whole of what remains, in order:
 *      a. Register SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID,
 *         SQUARE_APPLICATION_ID and SQUARE_WEBHOOK_SIGNATURE_KEY in the key
 *         registry (scripts/seed-key-registry.ps1) with a $0 RetrieveLocation
 *         probe, per APP-DATA-SECURITY section 3, and put them in the studio's
 *         Vercel env (strip wrapping quotes -- Vercel stores values literally).
 *      b. Implement createAndPublishSquareInvoice() in THIS file: Square
 *         Invoices API, amount read from the invoice row the DB produced and
 *         NEVER from the request, idempotency_key = `${invoiceId}:${attempt}`,
 *         Net 14 due date, the itemized transaction list attached, the monthly
 *         report in the same email (SOP-6, the 3rd).
 *      c. Verify it end to end against the Square SANDBOX -- create, publish,
 *         receive the payment.updated webhook, HMAC-verify it -- and only then
 *         flip SQUARE_DISPATCH_IMPLEMENTED to true.
 *      d. Sending is still a human tap. It never charges a card: publishing a
 *         Square invoice asks the client to pay. Elevare does not hold, and
 *         must never hold, a stored instrument for a client fee.
 */

/**
 * The four values APP-DATA-SECURITY section 3 names. The first two are what a
 * SEND needs; the last two belong to the client-side payment path and the
 * webhook, and are listed because a half-configured rail is worth naming.
 */
const REQUIRED_TO_SEND = ["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID"] as const;
const REQUIRED_TO_COLLECT = [
  "SQUARE_APPLICATION_ID",
  "SQUARE_WEBHOOK_SIGNATURE_KEY",
] as const;

/**
 * ★ Flip to true ONLY after step (c) of the TODO above has actually been
 * watched to succeed. This exists so that adding the credentials later cannot
 * silently light up a button whose code path nobody has ever run.
 */
export const SQUARE_DISPATCH_IMPLEMENTED = false;

export type SendReadiness = {
  /** True only when every blocker below is cleared. */
  ready: boolean;
  /** Env var names that are absent. Names only -- never values. */
  missingCredentials: string[];
  /** Env var names the collection path needs and does not have. */
  missingCollectionCredentials: string[];
  /** False until the dispatch has been implemented and verified. */
  dispatchImplemented: boolean;
  /** One line per reason the Send control is disabled, in owner language. */
  blockers: string[];
};

function absent(name: string): boolean {
  return (process.env[name] ?? "").trim() === "";
}

/**
 * Can this console send a Square invoice right now?
 *
 * `billingSchemaPresent` is passed in rather than probed here: the page
 * already knows whether the snapshot RPC answered, and probing twice would
 * let the two answers disagree.
 */
export function squareSendReadiness(billingSchemaPresent: boolean): SendReadiness {
  const missingCredentials = REQUIRED_TO_SEND.filter(absent);
  const missingCollectionCredentials = REQUIRED_TO_COLLECT.filter(absent);
  const blockers: string[] = [];

  if (missingCredentials.length > 0) {
    blockers.push(
      `Square credentials are not configured. Missing: ${missingCredentials.join(", ")}.`,
    );
  }
  if (!billingSchemaPresent) {
    blockers.push(
      "The billing schema is not applied, so there is no closed-month snapshot to invoice from.",
    );
  }
  if (!SQUARE_DISPATCH_IMPLEMENTED) {
    blockers.push(
      "The Square invoice dispatch has not been built and verified against a Square sandbox. See TODO(square-invoice-dispatch) in src/lib/billing/square.ts.",
    );
  }

  return {
    ready: blockers.length === 0,
    missingCredentials: [...missingCredentials],
    missingCollectionCredentials: [...missingCollectionCredentials],
    dispatchImplemented: SQUARE_DISPATCH_IMPLEMENTED,
    blockers,
  };
}

/**
 * Write the TODO where an operator will actually meet it: the server log of
 * the page that is missing the capability. Called once per /admin/billing
 * render while the rail is not ready.
 */
export function logSquareTodo(readiness: SendReadiness): void {
  if (readiness.ready) return;
  console.warn(
    "[TODO][square-invoice-dispatch] /admin/billing rendered with Send disabled. " +
      readiness.blockers.join(" "),
  );
}
