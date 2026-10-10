# Single-user lockdown — lock a Supabase app to exactly ONE known human

**When to reach for it:** you're building an app for **one specific person** and nobody else should ever get in — a personal tool you built for a family member or a client's private dashboard, a single-tenant app, a "just for you" companion app. Not a staff group (that's `supabase-nextjs-pwa/service-role-free-supabase-security.md`'s `is_staff()` allowlist), not an admin allowlist that can grow (`stripe-connect/admin-allowlist-hand-created-user.md`), not a guest with a capability link (`guest-capability-token/`). This is the strictest posture: **one and only one user, ever**, enforced at four independent layers so no single misconfiguration opens the door.

The four layers (defense in depth — each one alone would be enough; together a slip in any one is caught by the others):

1. **Pre-create the user out of band.** The one human's account is created by the owner via the admin API / dashboard *before* the app ships. The app never creates users.
2. **Disable public signups** in Supabase Auth (Authentication → Providers / Settings → "Allow new users to sign up" OFF).
3. **`shouldCreateUser: false`** on the client sign-in call — so even if signups were accidentally re-enabled, an unknown email can never mint an account through the app.
4. **An email/uid allowlist on the serverless boundary** — every `/api` route verifies the caller's token against the live project AND checks it's the allowed identity, **failing closed** if no allowlist is configured.

This is a passwordless (magic-link / OTP) posture, but the same lockdown works for password auth — the load-bearing parts are `shouldCreateUser:false` + signups-off + the server allowlist.

---

## Layer 3 — client sign-in that can never create a user

Passwordless OTP with `shouldCreateUser:false`. An unknown email comes back as a
stable `NOT_INVITED` code the login screen turns into a gentle "this app is just
for you" — never a raw Supabase error, and never a signup.

```js
// auth.js — real passwordless sign-in that NEVER creates a user.
export async function sendMagicLink(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))
    return { ok: false, email: clean, code: 'INVALID_EMAIL' };

  const client = await getClient();
  if (!client) return { ok: false, email: clean, code: 'OFFLINE' };

  const emailRedirectTo = (typeof window !== 'undefined' && window.location)
    ? window.location.origin : undefined;   // return to THIS app's origin

  try {
    const { error } = await client.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: false, emailRedirectTo },  // <- the lockdown
    });
    if (error) {
      // Do NOT surface raw Supabase copy. Map "signups disabled / no such user"
      // to a stable NOT_INVITED code; everything else is a generic send failure.
      return { ok: false, email: clean, code: isNotInvitedError(error) ? 'NOT_INVITED' : 'SEND_FAILED' };
    }
    return { ok: true, email: clean };
  } catch {
    return { ok: false, email: clean, code: 'SEND_FAILED' };
  }
}

// With shouldCreateUser:false an unknown email returns a 422/400
// "Signups not allowed for otp" / "User not found". Detect that FAMILY without
// depending on exact copy (Supabase wording drifts across versions).
function isNotInvitedError(error) {
  const status = Number(error && (error.status || error.code));
  const msg = String((error && error.message) || '').toLowerCase();
  if (status === 422 || status === 400)
    if (/signup|not allowed|user not found|otp_disabled|user_not_found/.test(msg)) return true;
  return /signups?\s+not\s+allowed|user\s+not\s+found|not\s+allowed\s+for\s+otp/.test(msg);
}
```

PKCE magic-link callback (`?code=…`) is completed by an idempotent
`handleAuthCallback()` that exchanges the code, then **scrubs the auth params from
the URL** (a single-use code must never linger in history) while preserving the
app's own `#/route` hash. Tolerate all three return shapes: `?code=` (PKCE),
`#access_token=` (implicit), `?token_hash&type` (verify-otp). Create the browser
client with `detectSessionInUrl:false` so your callback owns the URL cleanup, and
`flowType:'pkce'` so the hash stays free for client-side routing.

## Layer 4 — the email/uid-allowlisted serverless boundary

Every `/api` route calls `verify()` **first**, before it touches any budget/metering
layer or the upstream AI. Verify the token against the live project with the
**service-role key** as `apikey`, then enforce the allowlist. **Fail closed** if no
allowlist is configured — a missing env must never silently open the surface.

> Why this is strict: an unguarded metered AI endpoint in the fleet once fired
> hundreds of times and cost real money (memory: *shared-anthropic-key-misattribution*).
> No token, wrong token, or wrong identity => reject, and NEVER fall through to
> "assume it's fine."

```js
// api/_lib/auth.js — server-only gate for the whole private surface (Node 18+, dep-free).
export async function verify(req) {
  const token = extractBearer(req);
  if (!token) throw new ApiError(401, 'NO_TOKEN', 'Missing bearer token');

  const url = mustEnv('SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = mustEnv('SUPABASE_SERVICE_ROLE_KEY');

  let res;
  try {
    res = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
    });
  } catch {
    throw new ApiError(401, 'AUTH_UNREACHABLE', 'Could not verify token'); // never assume authorized
  }
  if (!res.ok) throw new ApiError(401, 'INVALID_TOKEN', 'Token rejected');

  const user = await res.json().catch(() => { throw new ApiError(401, 'INVALID_TOKEN', 'Malformed user'); });
  const userId = user && user.id ? String(user.id) : '';
  const email  = user && user.email ? String(user.email).trim().toLowerCase() : null;
  if (!userId) throw new ApiError(401, 'INVALID_TOKEN', 'No user id in token');

  // Honor BOTH an email allowlist and a uid allowlist; whichever is configured
  // must match. If NEITHER is set, FAIL CLOSED (403) — refuse to run wide open.
  const allowedEmail = (process.env.ALLOWED_EMAIL || '').trim().toLowerCase();
  const allowedUid   = (process.env.ALLOWED_USER_ID || '').trim();
  if (!allowedEmail && !allowedUid)
    throw new ApiError(403, 'ALLOWLIST_UNSET', 'Access allowlist not configured');
  if (allowedEmail && email  !== allowedEmail) throw new ApiError(403, 'FORBIDDEN', 'Not allowed');
  if (allowedUid   && userId !== allowedUid)   throw new ApiError(403, 'FORBIDDEN', 'Not allowed');

  return { userId, email };
}
```

`mustEnv()` throws a `500 CONFIG_ERROR` on a missing/empty secret (a gate with a
missing key must become a loud 500, never a silent no-op). The `ApiError` carries a
stable machine `code` the client branches on — never message copy (STANDARDS).

## The database is still the real boundary (layers, not trust)

The server allowlist protects the *AI/compute* surface. Her **data** is protected by
RLS: every user table is `user_id = auth.uid()` (or `id = auth.uid()` for the
1-row-per-user `profiles`), RLS ON for every table, `anon` has zero table grants, and
no `SELECT` policy is `USING (true)` or `user_id IS NULL`. Prove it empirically with
the anon-key sweep (`security-audit/anon-leak-sweep.md`) — the linter can't see
`USING (true)`. Single-user doesn't mean single-layer.

## Deploy-time wiring (the runbook)

1. **Pre-create the one user** (admin API / dashboard) with their real email.
2. **Disable public signups** (Authentication settings).
3. **Enable Email/magic-link** provider.
4. **Site URL = the real production domain, NOT localhost** (a localhost Site URL
   breaks the auth-email link fleet-wide — known trap; memory
   *supabase-site-url-localhost-fleet-bug*). Add `http://localhost:*` to the
   *redirect allowlist* for dev, but the Site URL itself is prod.
5. After the user's **first** sign-in, read their `auth.users.id` and set
   `ALLOWED_USER_ID` (and/or `ALLOWED_EMAIL`) in the server env.
6. Verify: signing in with any other email shows the "just for you" screen and
   returns no session; a curl to `/api/*` with a foreign token 403s.

---

## Assumes / adapt

- **Assumes** Supabase Auth (magic-link or password) and a serverless `/api` (Vercel
  functions / plain Node). Swap the OTP call for `signInWithPassword` if you want a
  password — keep `shouldCreateUser` semantics by leaving signups OFF; the server
  allowlist is unchanged.
- **The email allowlist reconciles two naming conventions on purpose** (`ALLOWED_EMAIL`
  vs `ALLOWED_USER_ID`) — honoring both means a build brief and a contract that
  disagree on the env name both work, and neither leaves the surface open. Keep the
  fail-closed branch even if you only ever set one.
- **uid is more durable than email** for the allowlist (email can change); prefer
  `ALLOWED_USER_ID` once you know it, keep `ALLOWED_EMAIL` as the bootstrap before the
  first sign-in.
- **Offline-first apps:** sign-in is *additive identity*, never a gate on core
  function — `getClient()` returning null (offline / config not injected) must degrade
  to signed-out with the app still fully usable on local data. Represent signed-out as
  real `null`, not a fake "local" user (see `offline-first-vendored-supabase-sync.md`).
- Do **not** reuse the metered-AI budget gate from here — that's covered by
  `serverless-thin-client/atomic-metered-credits.md` + `metered-quota/`. This file is
  only the *identity* boundary; `verify()` runs before any budget code.
- Related: `stripe-connect/admin-allowlist-hand-created-user.md` (owner allowlist that
  can grow, hand-created SQL user with the empty-string token incantation) — reach for
  that when it's "the owner(s)"; reach for THIS when it's "exactly one human, ever."
