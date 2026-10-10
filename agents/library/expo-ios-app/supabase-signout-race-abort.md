# A sign-out that times out must ABORT its logout request, or it deletes the next person's session

**Harvested 2026-09-29** from `D:\elevare-app` (Expo, React Native, `@supabase/supabase-js` with
auth-js 2.116.0, AsyncStorage session storage), merged to `main` at `ef19800`. Sources:
`createSignOutAwareFetch`, `beginSignOut` and `abortPendingSignOut` in `src/lib/supabase.ts`, and
`forceLocalSignOut`, `SIGN_OUT_TIMEOUT_MS` and `signOutOfThisPhone` in `src/lib/auth.tsx` (commit
`8f66f13`, "Make sign out leave nothing behind"). Proof: `tests/screens/tabs-sign-out.test.mjs`,
which drives the REAL supabase-js client. Verified green at harvest on the clean `ef19800` checkout
(part of the 147 of 147 run).

## When to reach for it

A Supabase client app with a sign-out button that must work offline and on a shared device: any
React Native or Expo app, a kiosk, a staff tablet, any client that passes custom `storage` and no
`lock` to `createClient`. Also read it before you add ANY timeout around `supabase.auth.signOut()`.

**The tell:** `await supabase.auth.signOut()` with nothing reading its `{ error }`, or a
`Promise.race` between `signOut()` and a timer with nothing done to the loser.

## The three defects, in the order they were found (all proven against real auth-js 2.116.0)

1. **signOut can leave the phone signed in.** With an EXPIRED access token and no network, `signOut`
   first tries to refresh, the refresh fails, and `_signOut` returns that error BEFORE
   `_removeSession`. The session stays stored, no `SIGNED_OUT` fires, the alert closes, and the
   person is still signed in. **Fix:** read the error; when signOut reports one (or throws) and the
   session is still stored, remove it yourself through the same storage adapter the client writes
   with: the session key, its `-user` twin and the PKCE `-code-verifier`. Then clear the provider's
   in-memory session, because a key removed underneath auth-js fires no event.
2. **signOut can take 25 seconds.** The refresh retries with backoff (measured 25,437 ms). A person
   in airplane mode stares at a busy button, and if they kill the app in that window the `finally`
   never runs. **Fix:** race it against a 4 s timer (an online local sign-out is one request, well
   under a second) and take the forced path on timeout.
3. **The timeout creates the worst bug.** A `/auth/v1/logout` still in flight when the timer wins
   will, on landing, run `_removeSession`, which deletes WHATEVER session is stored by then,
   including the NEXT person who signed in meanwhile. With no `lock` passed, nothing serialises that
   sign-out against a sign-in; the auth-js commit and epoch guards protect the REFRESH path only.
   **Fix: cancel the logout, never outlive it.**

## The recipe

A fetch wrapper handed to the client as `global.fetch` (supabase-js passes it to the auth client).
It touches exactly one request kind, matched by method AND exact path, never substring:

```ts
export function createSignOutAwareFetch(base: () => typeof fetch) {
  const pending = new Set<AbortController>();
  let refusing = false;
  const isLogout = (input: RequestInfo | URL, init?: RequestInit) => {
    let href: string; let method = init?.method;
    if (typeof input === 'string') href = input;
    else if (input instanceof URL) href = input.href;
    else { href = input.url; method = method ?? input.method; }
    if ((method ?? 'GET').toUpperCase() !== 'POST') return false;
    try { return new URL(href).pathname === '/auth/v1/logout'; } catch { return false; }
  };
  const wrapped = ((...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    if (!isLogout(input, init)) return base()(...args);      // SAME arguments, untouched
    const controller = new AbortController();
    if (refusing) controller.abort();                        // a logout that starts after the timeout
    const outer = init?.signal;
    if (outer) outer.aborted ? controller.abort()
      : outer.addEventListener('abort', () => controller.abort(), { once: true });
    pending.add(controller);
    const request = base()(input, { ...init, signal: controller.signal });
    const forget = () => { pending.delete(controller); };
    request.then(forget, forget);
    return request;
  }) as typeof fetch;
  return {
    fetch: wrapped,
    beginSignOut: () => { refusing = false; },
    abortPendingSignOut: () => {                             // returns how many were in flight
      refusing = true;
      const n = pending.size;
      for (const c of pending) c.abort();
      pending.clear();
      return n;
    },
  };
}
const aware = createSignOutAwareFetch(() => globalThis.fetch); // resolved per call
export const supabase = createClient(url, anonKey, {
  auth: { storage: authStorage, /* no lock */ },
  global: { fetch: aware.fetch },
});
```

And the sign-out itself:

```ts
export const SIGN_OUT_TIMEOUT_MS = 4000;
export async function signOutOfThisDevice(userId: string | null) {
  let failed = false; let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    beginSignOut();
    const attempt = supabase.auth.signOut({ scope: 'local' });
    attempt.catch(() => undefined);                         // a late rejection is nobody's to handle
    const timedOut = new Promise<'timeout'>((r) => { timer = setTimeout(() => r('timeout'), SIGN_OUT_TIMEOUT_MS); });
    const first = await Promise.race([attempt, timedOut]);
    if (first === 'timeout') {
      if (abortPendingSignOut() > 0) await attempt.then(() => undefined, () => undefined);
      failed = true;                                        // ABORT FIRST, then force
    } else failed = first.error !== null;
  } catch (err) { failed = true; throw err; }
  finally {
    if (timer !== undefined) clearTimeout(timer);
    if (failed) await forceLocalSignOut();                  // key, -user, -code-verifier
    await Promise.allSettled([clearCache(), clearPerUserKeys(userId)]); // every per-person local key
  }
}
```

Why abort works: an aborted logout makes auth-js return a retryable fetch error, and `_signOut` then
removes the session AT ONCE, at a moment when no new session can exist yet. The `refusing` flag
covers the one gap abort alone leaves: a refresh that finishes just before the timeout, whose logout
starts just after it.

## Tests that hold it

- Drive the real supabase-js client with a scripted fetch: an expired token plus no network leaves
  the device signed out within the timeout (defects 1 and 2).
- The race: logout held in flight, timer wins, a second user signs in, the held logout is released.
  The second user's session must survive. Control: without the abort, it is deleted.
- Pass-through: REST, functions, a table named like `logout`, a GET to the logout path and the token
  call arrive byte for byte with the caller's own signal. Control: a wrapper that signals every
  request goes red.
- Prove the real client routes its logout through `global.fetch`, so the wrapper is on the path at
  all (a wrapper the client never calls passes every other test).

## Assumes / adapt

- The line numbers and behaviour were read in auth-js **2.116.0**. Re-read `_signOut`,
  `_removeSession` and the lock default in YOUR installed version before trusting this; if you pass a
  real `lock` (or run where auth-js picks `navigator.locks` by default), defect 3 may already be
  serialised, but defects 1 and 2 still apply.
- `scope: 'local'` signs out this device only; the server refresh token expires on its own. If you
  need global sign-out, that is a separate, online-only action.
- 4 s is a reliability bound on a network call, not a design token. Keep it a named constant with the
  reason next to it.
- Per-person local state (consent, drafts, caches) must be cleared by its EXACT key in the same
  `finally`, not only by a sweep that lists keys first, because a failed listing leaves them for the
  next person.
