# Verify, then finish; retry unfinished purchases on every cold start, one flight per user and transaction

**Harvested 2026-09-29** from `D:\elevare-app` (Expo, `expo-iap` 5.8.1, StoreKit 2, Supabase edge
function `verify-transaction`), wave 5, merged to `main` at `ef19800`. Sources in `src/lib/iap.ts`
(commit `9da0c64`): `verifyThenFinish`, `settleOne`, `syncOwnedPurchases`,
`startLaunchPurchaseSync`, `useLaunchPurchaseSync`, `openConnection` and `closeConnection`; the
caller is the signed-in `(app)` layout. Proof: `tests/iap/launch-sync.test.mjs` (six sections, each
with a mutation control). Verified green at harvest on the clean `ef19800` checkout (part of the 147
of 147 run).

## When to reach for it

Any app that sells through a platform store (StoreKit, Play Billing) and records the entitlement on
its own server. The server call can fail AFTER the store has charged (network, a misconfigured
function, a cold database), and the UI copy wants to promise "we will try again". This makes that
promise true without a paywall being open.

**The tell:** `finishTransaction` is called in the purchase listener before, or regardless of, the
server's answer; or the only code that re-reads the store's transaction queue runs inside the
paywall screen.

## The five rules

1. **Verify first, finish second, and never finish a failure.** `finishTransaction` tells the store
   the app has honoured the purchase and removes it from the queue. Finishing before the server has
   recorded it throws away the only copy of a paid transaction, and the store stops replaying it. A
   transaction whose verify failed is deliberately LEFT UNFINISHED. A failed `finish` after a
   successful verify is swallowed: the entitlement is written, and the replay settles it later.
2. **Sync from the signed-in root layout, once per process, after first paint.** Two lists, because
   they answer different questions, de-duplicated by transaction id:
   - `getPendingTransactionsIOS` (`Transaction.unfinished`): purchases whose verify failed. This is
     what makes "Elevare will try again the next time the app opens" true.
   - `getAvailablePurchases`: what this store account is entitled to now. This heals a dropped or
     out-of-order server-to-server notification.
   Filter to your own product id. Fire it from an effect, never await it on the render path, open
   no UI, report nothing; a failure is left for the next cold start. Skip it when signed out, while
   auth is still loading, in a build with no backend, and in a binary without the store module (the
   last two do not set the once flag, since neither can change while the process lives).
3. **One flight per transaction.** The launch sync, the paywall's mount sync, the purchase listener
   and Restore can all be handed the same transaction at once. Keep a module map of in-flight
   promises; a second caller gets the SAME promise, so the server sees one verify and the store sees
   at most one finish. Drop the entry when it settles so a later attempt is a real retry.
4. **Key every in-flight map by the signed-in user as well as the transaction.** The map is module
   scoped and outlives a sign-out. Keyed by transaction alone, A's verify still in flight when A
   signs out and B signs in hands B's Restore A's answer: B's screen says "That went through" while
   B's row is unchanged. Key rather than clear-on-sign-out, because a clear depends on some mounted
   component noticing the change, and a key does not. The same applies to the per-user sync map.
5. **Reference-count the store connection.** Two holders now exist (the paywall while mounted, the
   launch sync while running). Whichever finishes first would otherwise call `endConnection` under
   the other. `initConnection` for the first holder, `endConnection` for the last; a failed connect
   is not remembered, so the next holder retries.

## The core, generalized

```ts
const verifying = new Map<string, Promise<VerifyResult>>();
const ownerKey = (userId: string | null) => (userId === null ? 'signed-out' : `user:${userId}`);
const txKey = (p: unknown, token: string) => {
  const id = (p as { id?: unknown } | null)?.id;
  return typeof id === 'string' && id.length > 0 ? `id:${id}` : `jws:${token}`;
};

function verifyThenFinish(iap: StoreApi, purchase: unknown, userId: string | null): Promise<VerifyResult> {
  const token = purchaseToken(purchase);
  if (token === null) return Promise.resolve({ ok: false, reason: 'no_receipt' });
  const key = `${ownerKey(userId)}|${txKey(purchase, token)}`;
  const running = verifying.get(key);
  if (running !== undefined) return running;               // join, never a second verify
  const flight = (async () => {
    const verified = await verifyWithServer(token);        // server reads the caller from the JWT
    if (!verified.ok) return verified;                     // LEFT UNFINISHED on purpose
    try { await iap.finishTransaction({ purchase, isConsumable: false }); } catch { /* replayed later */ }
    return verified;
  })();
  verifying.set(key, flight);
  const forget = () => { if (verifying.get(key) === flight) verifying.delete(key); };
  flight.then(forget, forget);
  return flight;
}

let launchSyncStarted = false;
export function startLaunchPurchaseSync(userId: string): Promise<void> | null {
  if (launchSyncStarted) return null;
  if (!backendConfigured) return null;       // does not set the flag
  const iap = store(); if (iap === null) return null; // does not set the flag
  launchSyncStarted = true;
  return (async () => {
    try { await openConnection(iap); await syncOwnedPurchases(iap, userId); }
    catch { /* silent: next cold start */ }
    finally { closeConnection(iap); }
  })();
}
export function useLaunchPurchaseSync(userId: string | null): void {
  useEffect(() => { if (userId !== null) void startLaunchPurchaseSync(userId); }, [userId]);
}
```

`syncOwnedPurchases` is the same flight-map shape keyed by `ownerKey(userId)`: read both lists
(each read wrapped so a throw becomes `[]`), filter to the product id, de-duplicate by `txKey`, and
`await verifyThenFinish` one at a time inside a try so one bad transaction does not stop the rest.

## Tests that hold it (the six sections of the source test)

1. A cold start re-verifies an unfinished transaction with NO paywall mounted; first paint is not
   held; the layout names no paywall; an already-owned entitlement is re-presented once; another
   product on the same store account is not sent. Control: remove the layout call, it stops.
2. No sync when signed out, while auth loads, or on a sign-in screen; a source walk proves the
   `(app)` layout is the only caller in `src/`. Control: an unguarded call is caught.
3. At most once per process, across a second mount and a second user. Control: drop the once flag.
4. The paywall mounting mid-sync JOINS (one verify), the listener joins and reports the answer, the
   launch sync does not end the paywall's connection. Controls: no flight map, no refcount.
5. Every server refusal and a network failure leave the transaction unfinished, silently. Control:
   finishing before the verify is read goes red.
6. A's verify in flight, sign-out, B signs in: B's Restore reports B's own answer, and A's verify
   still settles once for A. Control: key by transaction alone and B's screen claims A's purchase.

## Assumes / adapt

- The server endpoint identifies the buyer from the session JWT and writes the entitlement row
  idempotently (the same signed transaction verified twice must be a no-op). The user id in the key
  changes nothing the server is sent; it only partitions the client maps.
- `getPendingTransactionsIOS` is iOS only. On Android the equivalent is `queryPurchases` plus
  checking `isAcknowledged`; the rule (never acknowledge before the server records) is the same.
  Google's billing docs say an unacknowledged purchase is refunded after three days, so the retry
  matters more there (not verified in this harvest; read the current docs before relying on it).
- Keep the server-to-server notification handler as the primary source of truth. This sync is the
  repair path for its failure modes, not a replacement.
- Never block first paint or open UI from the sync; a paywall that pops on launch because a retry
  ran is a worse bug than the one fixed.
