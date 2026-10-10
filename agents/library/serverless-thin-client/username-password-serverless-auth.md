# Email-less username + password auth for serverless (no framework, no npm auth deps)

**When to reach for it:** a low-bandwidth / network-quiet / no-build-step product where you need real accounts but **can't afford an email round-trip** (no confirmation mail, no magic link, no reset email) and don't want NextAuth/Supabase-Auth/Passport. A dumb static client + plain Node serverless functions (`module.exports = (req,res)`) + Supabase used **purely as a REST database behind the service-role key** (the browser never touches the DB). Pure `node:crypto` + `fetch` — zero auth dependencies.

The whole auth spine fits in one server-only `lib/store.js`: **scrypt** password hashing + **your own HMAC-signed session token** (signed and verified locally, no DB round-trip to check a session), all reads/writes through Supabase REST with the service-role key.

**Origin:** asky (`D:\asky\lib\store.js` + `api\auth.js`). De-branded here (`ASKY_*` → generic, `askt_users` → `app_users`).

---

## Why this shape

- **Network-quiet:** the client opens exactly one connection — to your own domain. The server is the only thing that talks to Supabase, so no `@supabase/supabase-js` in the browser, no anon key exposed, no PostgREST surface facing users.
- **No email:** username is the identity. That removes the entire deliverability/verification/reset-email apparatus. The tradeoff is real and must be documented (see **Assumes / adapt**): a lost password has no self-serve reset.
- **Stateless sessions:** the session token is an HMAC you can verify with a string compare + one `crypto.createHmac` — no `sessions` table, no lookup per request. Verification is **fail-closed**: no secret, bad signature, tampered payload, missing `uid`, or expired `iat` all return `null`.

## `lib/store.js` — the REST + crypto spine

```js
// Server-only. Supabase is a DB via REST with the service-role key; the browser
// never talks to it. Auth = username + password. No npm deps: raw fetch + crypto.
const crypto = require("crypto");

const SB_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();   // ALWAYS .trim() a pasted secret
const SESSION_SECRET = (process.env.SESSION_SECRET || "").trim();
const OWNER_USERNAME = (process.env.OWNER_USERNAME || "").trim().toLowerCase();

function storeConfigured() { return !!(SB_URL && SB_KEY && SESSION_SECRET); }

// ---- Supabase REST (service-role; bypasses RLS — server only) ----
async function sb(path, { method = "GET", body, prefer } = {}) {
  const headers = { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" };
  if (prefer) headers.prefer = prefer; // e.g. "return=representation"
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!r.ok) throw new Error(`supabase ${r.status}: ${String(text).slice(0, 200)}`);
  return data;
}
async function rpc(fn, args) { return sb(`rpc/${fn}`, { method: "POST", body: args }); }

// ---- Passwords (scrypt) ----
// Usernames stored + matched LOWERCASED so uniqueness, login lookup, and the
// owner-reservation check all agree ("Alice" and "alice" can't be two accounts).
const uname = (u) => String(u || "").trim().toLowerCase();
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pw), salt, 32).toString("hex");
  return { salt, hash };
}
function checkPw(pw, salt, hash) {
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(String(pw), salt, 32).toString("hex");
  // constant-time compare; length-guard first (timingSafeEqual throws on length mismatch)
  return h.length === hash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash));
}

// ---- Users ----
async function getUserByUsername(username) {
  const rows = await sb(`app_users?username=eq.${encodeURIComponent(uname(username))}&select=*`);
  return rows && rows[0] ? rows[0] : null;
}
async function getUserById(id) {
  const rows = await sb(`app_users?id=eq.${encodeURIComponent(id)}&select=*`);
  return rows && rows[0] ? rows[0] : null;
}
async function createUser(username, password) {
  const u = uname(username);
  const { salt, hash } = hashPw(password);
  const isOwner = !!OWNER_USERNAME && u === OWNER_USERNAME;
  const rows = await sb(`app_users`, { method: "POST", prefer: "return=representation",
    body: { username: u, password_hash: hash, password_salt: salt, is_owner: isOwner } });
  return rows && rows[0] ? rows[0] : null;
}

// ---- Sessions: our own signed token, verified locally (no DB hop) ----
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function signSession(payload) {
  const data = b64u(Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })));
  const sig = b64u(crypto.createHmac("sha256", SESSION_SECRET).update(data).digest());
  return `${data}.${sig}`;
}
function verifySession(token) {
  if (!token || typeof token !== "string" || token.indexOf(".") < 0 || !SESSION_SECRET) return null;
  const [data, sig] = token.split(".");
  const expect = b64u(crypto.createHmac("sha256", SESSION_SECRET).update(data).digest());
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  let p; try { p = JSON.parse(Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()); } catch (_) { return null; }
  if (!p || !p.uid) return null;
  if (p.iat && Date.now() - p.iat > 180 * 24 * 3600 * 1000) return null; // 180-day sessions
  return { uid: p.uid };
}

// Public projection sent to the client (never the hash/salt).
function publicUser(u) { return u ? { username: u.username, credits: u.credits, owner: !!u.is_owner } : null; }

module.exports = { storeConfigured, OWNER_USERNAME, uname, hashPw, checkPw,
  getUserByUsername, getUserById, createUser, signSession, verifySession, publicUser, sb, rpc };
```

## `api/auth.js` — the signup/login endpoint

```js
const S = require("../lib/store");
const USER_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

module.exports = async (req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") { res.statusCode = 405; res.end(JSON.stringify({ error: "Use POST" })); return; }
  if (!S.storeConfigured()) { res.statusCode = 500; res.end(JSON.stringify({ error: "accounts not configured" })); return; }

  let body = {}; try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch (_) {}
  const username = S.uname(body.username);
  const password = String(body.password || "");

  try {
    if (body.action === "signup") {
      if (!USER_RE.test(username)) { res.statusCode = 400; res.end(JSON.stringify({ error: "username: 3-24 chars, letters/numbers/._- only." })); return; }
      if (password.length < 6) { res.statusCode = 400; res.end(JSON.stringify({ error: "password must be at least 6 characters." })); return; }

      // OWNER RESERVATION: the owner username is reserved. Claiming it requires a
      // one-time OWNER_SIGNUP_CODE so nobody grabs the privileged account by guessing.
      if (S.OWNER_USERNAME && username === S.OWNER_USERNAME) {
        const need = (process.env.OWNER_SIGNUP_CODE || "").trim();
        const got = String(body.ownerCode || "").trim();
        if (!need || got !== need) { res.statusCode = 403; res.end(JSON.stringify({ error: "That username is reserved.", ownerCode: true })); return; }
      }
      if (await S.getUserByUsername(username)) { res.statusCode = 409; res.end(JSON.stringify({ error: "username taken." })); return; }
      const user = await S.createUser(username, password);
      if (!user) { res.statusCode = 500; res.end(JSON.stringify({ error: "could not create the account." })); return; }
      res.end(JSON.stringify(Object.assign({ ok: true, token: S.signSession({ uid: user.id }) }, S.publicUser(user))));
      return;
    }

    if (body.action === "login") {
      if (!username || !password) { res.statusCode = 400; res.end(JSON.stringify({ error: "enter username and password." })); return; }
      const user = await S.getUserByUsername(username);
      // Run scrypt EVEN WHEN the user doesn't exist, so response time doesn't reveal
      // which usernames are registered (timing-based account enumeration).
      const ok = user ? S.checkPw(password, user.password_salt, user.password_hash)
                      : (S.checkPw(password, "0".repeat(32), "0".repeat(64)), false);
      if (!user || !ok) { res.statusCode = 401; res.end(JSON.stringify({ error: "wrong username or password." })); return; }
      res.end(JSON.stringify(Object.assign({ ok: true, token: S.signSession({ uid: user.id }) }, S.publicUser(user))));
      return;
    }

    res.statusCode = 400; res.end(JSON.stringify({ error: "unknown action" }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: "auth error: " + (e.message || e) })); }
};
```

## Every protected endpoint gates the same way (one line, no DB hop)

```js
const sess = S.verifySession((req.headers["x-my-token"] || "").trim());
if (!sess) { res.statusCode = 401; res.end(JSON.stringify({ error: "signin" })); return; }
// sess.uid is trustworthy — it was HMAC-verified locally. Load the row only if you
// need fresh fields (credits/permissions); the token alone proves identity.
```

The client stores `token` in `localStorage` and sends it as `x-my-token` on every request. That is the whole session layer.

## SQL — the users table

```sql
create table app_users (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,      -- stored lowercased
  password_hash text not null,
  password_salt text not null,
  is_owner      boolean not null default false,
  credits       integer not null default 50,   -- if you meter (see atomic-metered-credits.md)
  created_at    timestamptz not null default now(),
  last_seen     timestamptz
);
-- RLS: leave the table with NO anon/authenticated grants. The service-role key
-- (server only) bypasses RLS; the browser never reaches PostgREST at all.
```

---

## The load-bearing invariants (don't drop these when adapting)

1. **The session secret is a single point of failure.** Losing/rotating `SESSION_SECRET` invalidates every live session (everyone re-logs-in). Store it like a key: env var only, `.trim()` on read, never in a tracked file.
2. **`verifySession` is fail-closed at every branch** — no secret, no dot, bad sig, unparseable payload, no `uid`, expired `iat` all return `null`. The signature check uses `crypto.timingSafeEqual` with a length-guard (it throws on mismatched lengths).
3. **Login runs scrypt even on a missing user** — otherwise a fast "no such user" reply is a username-enumeration oracle. Keep the dummy `checkPw` call.
4. **Usernames are lowercased everywhere** (`uname()`): create, lookup, uniqueness, owner-reservation. One casing rule or "Alice"/"alice" split into two accounts.
5. **Never return `password_hash`/`password_salt` to the client** — send `publicUser(u)` only.
6. **Owner/admin reservation** — if one account is privileged (unlimited, admin tools), reserve its username behind a one-time `OWNER_SIGNUP_CODE`. Once the owner account exists the code is spent (username is unique), so claim it immediately after first deploy, then the code's value is gone.
7. **`.trim()` every secret env read.** A pasted trailing newline in `SESSION_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` silently breaks signing and every DB call. (Studio memory: [[trim-secret-env-reads]].)

## Assumes / adapt

- **No password reset by email — this is the deliberate tradeoff.** Document the recovery story before shipping: for a small/owner-run product, admin resets a hash directly in the DB (regenerate `password_hash`/`password_salt` exactly as `hashPw` does — `scryptSync(pw, salt, 32)`, salt = 16 random bytes hex). For a consumer product, either add an optional recovery email/phone or accept "lost password = lost account" and say so at signup. Don't ship silent data-loss.
- **scrypt is CPU-bound and synchronous** (`scryptSync`). Fine on a serverless function per login; if you expect high login QPS, switch to the async `crypto.scrypt` so you don't block the event loop, or move to argon2 (adds a native dep — breaks the zero-dep property).
- **Session tokens don't support server-side revocation** (that's the price of statelessness). To force-logout, rotate `SESSION_SECRET` (nukes everyone) or add a `token_version` int on the user row and put it in the payload, checking it on verify (costs one DB read — you're no longer round-trip-free). For most low-stakes products the 180-day expiry is enough.
- **6-char password minimum + a `USER_RE` allowlist** are the floor. Raise the minimum and add a breach check (k-anonymity HIBP range API) if the account holds anything valuable.
- **This is the platform-owns-identity model.** For "guest reads one RLS-locked row via a token" (no account at all), use `guest-capability-token/capability-token-guest-intake.md`. For a full RLS-as-the-boundary Next.js app **with** a service-role-free posture, use `supabase-nextjs-pwa/service-role-free-supabase-security.md` — that's the opposite stance (DB is the gate); this pattern makes the **service-role key + your own code** the gate and keeps the browser off the DB entirely.
- Sits directly under `atomic-metered-credits.md` (the `credits` column + `rpc()` helper feed it) and `vanilla-embedded-stripe-checkout.md` (buys top up those credits). All three share this `lib/store.js`.
