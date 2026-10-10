# Map store purchase errors fail safe: only a code PROVEN pre-charge may say "nothing was bought"

**Harvested 2026-09-29** from `D:\elevare-app` (Expo, `expo-iap` 5.8.1, StoreKit, Supabase edge
function `verify-transaction`), wave 5, merged to `main` at `ef19800`. Sources: `storeErrorOutcome`,
the `PurchaseOutcome` union, `verifiedOutcome` and `restoreRank` in `src/lib/iap.ts` (commit
`9a322c7`, carried to `9da0c64`), and `tests/iap/outcome-kinds.test.mjs`. Verified green at
harvest on the clean `ef19800` checkout (part of the 147 of 147 run).

## When to reach for it

Any purchase flow whose error handler decides which sentence the buyer reads: Apple IAP, Google
Play Billing, RevenueCat, Stripe or Square client SDKs, any wallet. The moment a screen can say
"nothing was charged", "try again", or "Apple has your payment", that sentence is a claim about
money and the classifier behind it is a money control.

**The tell:** an error `switch` that lists the few codes it treats specially and sends everything
else to a friendly "Purchase did not go through, nothing was charged. Try again."

## The defect

The first version allowlisted the two known POST-charge codes and let the other 33 fall to
`store_refused` ("nothing was bought"), reasoning that StoreKit returns a refusal instead of a
transaction. That reasoning lived in a native CocoaPod that is not in `node_modules`, so nobody had
read it. Network errors, service errors, interruptions and unknown codes were all told "nothing was
bought", and "try again" on an uncertain charge invites a double purchase. The security grade
reversed the default.

## The shape: five buckets, default = uncertain

```ts
const USER_CANCEL_CODES = new Set(['user-cancelled' /* plus older spellings a shipped binary may send */]);
const PRE_CHARGE_CODES = new Set([        // the store could not even START a purchase
  'item-unavailable', 'sku-not-found', 'iap-not-available', 'billing-unavailable',
  'feature-not-supported', 'init-connection', 'not-prepared', 'query-product',
  'developer-error', 'empty-sku-list', 'sku-offer-mismatch', 'activity-unavailable', 'user-error',
]);
const AWAITING_APPROVAL_CODES = new Set(['deferred-payment', 'pending']); // Ask to Buy, buyer auth
const UNVERIFIED_CODES = new Set(['transaction-validation-failed', 'purchase-verification-failed']);

export function storeErrorOutcome(error: unknown): PurchaseOutcome {
  const raw = (error as { code?: unknown } | null)?.code;
  const code = typeof raw === 'string' ? raw : '';
  if (USER_CANCEL_CODES.has(code)) return { kind: 'user_cancelled' };               // say nothing
  if (AWAITING_APPROVAL_CODES.has(code)) return { kind: 'awaiting_approval' };       // NOT "try again"
  if (code === 'already-owned') return { kind: 'failed', reason: 'already_owned' };  // point to Restore
  if (UNVERIFIED_CODES.has(code)) return { kind: 'failed', reason: 'receipt_unverified' }; // post-charge
  if (PRE_CHARGE_CODES.has(code)) return { kind: 'failed', reason: 'store_refused' };  // "nothing was bought"
  return { kind: 'failed', reason: 'store_uncertain' }; // DEFAULT: the copy makes the charge conditional
}
```

The code lists above are `expo-iap` 5.8.1's `ErrorCode` values. **They are an example, not a
contract**: re-derive them from the SDK you install, with the enum walk below.

Three rules the shape encodes:

1. **The safe bucket is the default.** A code must be proven pre-charge to earn "nothing was
   bought". Everything unknown, including every code a later SDK version adds, lands in
   `store_uncertain`, whose copy makes the charge conditional ("If Apple charged you, Restore will
   pick it up").
2. **One classifier for both channels.** The `requestPurchase` promise rejection and the error
   listener carry the same error object; route both through the same function, or a Cancel arriving
   on the promise gets reported as a failure.
3. **Awaiting approval is its own kind, never a failure.** Apple may charge on approval, so "try
   again" there invites a second request.

## Companion: one outcome kind per thing the SERVER can say

Map the verified server status to kinds with the same discipline. A `pending` kind that caught every
status except active and trialing rendered "Apple has the payment" for `past_due` (billing retry)
and `cancelled` (ended, refunded, revoked): false about money. Give each status in the server's real
vocabulary its own kind, plus a `not_active` kind that CARRIES the raw status so the fallback never
guesses. For Restore with several transactions, rank explicitly (`active` > `past_due` >
`wrong_account` > `cancelled` > `not_active` > other refusals). `wrong_account` sits above
`cancelled` because otherwise the person reads "ended, nothing to restore" while a live subscription
bought for a different account sits on the same Apple ID.

## The test that keeps it honest: walk the INSTALLED enum at test time

Copying the code list into the test freezes it. Read it from the installed package instead, so a new
code is walked the day `npm install` brings it:

```js
const TYPES = join(ROOT, 'node_modules', 'expo-iap', 'build', 'types.d.ts');
function installedErrorCodes() {
  const src = readFileSync(TYPES, 'utf8');
  const m = src.match(/export declare enum ErrorCode \{([\s\S]*?)\}/);
  assert.ok(m, 'expo-iap no longer declares enum ErrorCode');          // fail loud, never vacuous
  return [...m[1].matchAll(/=\s*"([^"]+)"/g)].map((x) => x[1]);
}
it('the pre-charge list is made only of names the installed enum has', () => {
  const codes = installedErrorCodes();
  assert.equal(codes.length, 36, `ErrorCode now has ${codes.length} values; re-read the classifier`);
  for (const c of PRE_CHARGE) assert.ok(codes.includes(c), `${c} is not in the installed enum`);
});
it('EVERY installed code lands where it may, on BOTH channels', async () => {
  for (const code of installedErrorCodes()) {
    assert.deepEqual(await listenerError(code), expectedFor(code), `listener: ${code}`);
    assert.deepEqual(await rejectedPurchase(code), expectedFor(code), `promise: ${code}`);
  }
});
// plus: an unknown code, and no code at all, are store_uncertain, never store_refused
```

`listenerError` and `rejectedPurchase` drive the REAL hook (`useSubscription`) with the store SDK,
the Supabase client and React substituted by fakes, so the test exercises the production code path,
not a copy of the classifier.

The pinned count (36) is deliberate: an SDK upgrade that adds a code turns the test red and forces a
human to classify it, instead of letting it ride the default silently. (Riding the default is SAFE,
but the new code may deserve its own line of copy.)

Mutation controls that must go red (build them with
[`../verification/mutation-control-harness.md`](../verification/mutation-control-harness.md) so a
drifted marker cannot pass on unmodified code): adding an ambiguous code such as `network-error` to
the pre-charge set; flipping the default back to `store_refused`; collapsing a server status back
into a catch-all; routing the promise rejection around the classifier; flattening the
`wrong_account` rank.

## Assumes / adapt

- The rendered SENTENCE per kind lives in the paywall copy and has its own test in the source repo
  (`tests/screens/paywall-outcome-lines.test.mjs`). Keep kinds and sentences in separate tests so a
  copy edit cannot silently re-merge two kinds.
- **What this cannot prove:** which code StoreKit emits for which real-world condition. That is the
  SDK's contract, read, not observed on a device. Say so in the test header, as the source does.
- The server status vocabulary here is five values (`active`, `trialing`, `past_due`, `cancelled`,
  `incomplete`) read from the notification handler. Derive yours from YOUR server, and assert in a
  test that the list the client covers is the list the server declares.
- Payment rail: this is Apple IAP for an iOS app's digital subscription. It does not touch the
  studio's card rails; for web card payments see `square-web-payments/` and STANDARDS Payments.
