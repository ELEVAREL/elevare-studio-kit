# Deterministic engine + optional AI layer that degrades gracefully

**When to reach for it:** a product where a **deterministic client-side engine is the
always-on source of truth**, and a **server-side AI layer is an optional enhancement** that
must degrade to a friendly note — with **zero loss of core function** — whenever it's down
(offline, signed-out, over budget, dead key, 502/503, or a bad response shape). Reach for it
for any "smart when the AI is up, fully usable when it's down" app: a training/coaching app
whose progression logic is deterministic but whose chat/planning is AI, a rules engine with
an AI explainer, a calculator with an AI assistant, a form with AI autofill. The architecture
that keeps you honest: the AI can *suggest and phrase*, but it can never be a single point of
failure for the thing the app is *for*.

The shape in one sentence: **the engine always runs; the AI is a `try` whose every failure
class returns `null`; the caller falls back to the engine and the app never notices.**

---

## The three tiers

1. **Deterministic engine** — pure, no DOM, no network, no randomness in the logic. Same
   inputs → same outputs. The ONLY non-determinism is id/timestamp minting, injected via an
   optional `ctx.deps = { uuid, now }` so tests are fully deterministic and no decision ever
   branches on an id or clock. This is the source of truth for every real state change.

2. **Optional AI wrappers (client)** — each talks to a serverless `/api` and returns `null`
   (or a safe default) on **every** failure class, so the caller falls back. Nothing here
   ever throws uncaught.

3. **The serverless AI boundary** — auth-gated, budget-metered, and on generation actions it
   **validates the AI's response shape** and returns a distinct error status so the client
   falls back to the engine instead of persisting garbage.

## Tier 2 — the client wrapper: one `null` for every failure class

```js
// coach.js (client) — the SMART layer. Every call degrades to null; caller uses the engine.
async function post(path, bodyObj) {
  if (!online()) return null;                       // offline
  const token = await getToken();
  if (!token) return null;                          // signed-out
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(bodyObj),
    });
  } catch { return null; }                          // network threw
  if (!res || !res.ok) return null;                 // 401/403/429/500/502/503 -> fall back
  try { return await res.json(); } catch { return null; }  // malformed body
}

// A generation call: null means "caller runs the deterministic generator instead".
export async function generatePlanAI(profile) {
  const data = await post('/api/coach', { action: 'generate', payload: { profile } });
  return data && data.plan ? data.plan : null;
}
```

The caller composes the fallback so a failure never leaves a half-applied state — **compute
the new result FIRST (AI, then engine), and only then persist**:

```js
// Try AI; on null fall back to the deterministic engine; persist only a real result.
let plan = await generatePlanAI(nextProfile);
if (!plan && engine && typeof engine.generatePlan === 'function') {
  try { plan = engine.generatePlan(nextProfile, library); } catch { plan = null; }
}
if (!plan) return { ok: false, label: 'Could not rebuild your plan right now' };  // honest
// ...now persist plan + enqueue sync. The engine stays source of truth for progression.
```

For a free-text surface (chat/insights) the "fallback" is a **friendly offline note**, not a
fabricated answer — return a typed reason and let the screen phrase it:

```js
export async function ask(messages, context) {
  if (!online()) return { error: 'offline' };
  const token = await getToken(); if (!token) return { error: 'signed-out' };
  let res;
  try { res = await fetch(`${API_BASE}/api/coach`, { method:'POST', /* … */ }); }
  catch { return { error: 'offline' }; }
  if (res.status === 503) return { error: 'over-cap' };     // budget cap / AI unavailable
  if (!res.ok)            return { error: 'unavailable' };
  const data = await res.json().catch(() => null);
  if (!data) return { error: 'unavailable' };
  return { reply: String(data.reply || ''), actions: data.actions || [] };
}
// The screen shows a warm note on {error}; deterministic tabs still work.
```

## Tier 3 — the serverless boundary validates SHAPE and picks the right status code

The endpoint's job on a generation action isn't just to call the model — it's to **validate
the returned structure** and hand the client a status that means "fall back", not "here's
broken data". The status code is the contract:

```js
// api/coach.js — generate: parse + VALIDATE, or 502 so the client uses the engine.
const raw = await meteredJson(userId, { system, userText, max_tokens: 3000 });
if (!validatePlanShape(raw)) throw new ApiError(502, 'BAD_AI_SHAPE', 'Plan shape invalid');
const plan = normalizePlan(raw, userId, profile);   // mint ids, set engine-expected defaults
return sendJson(res, 200, { plan });
```

The status taxonomy the client relies on:

| Status | Meaning | Client does |
|---|---|---|
| `200` + valid shape | AI produced usable output | use it |
| `502 BAD_AI_SHAPE` | model replied but the JSON was wrong | fall back to engine |
| `503 AI_UNAVAILABLE` | budget cap hit / key dead / model down | fall back / "over-cap" note |
| `401/403` | not the allowed user | fall back (never surfaces to core function) |
| `429` | rate-limited | fall back |

`validatePlanShape()` is a strict structural check (arrays non-empty, required numeric fields
present, `rep_high >= rep_low`, etc.) — because a green fetch with a plausibly-shaped-but-wrong
object is *worse* than a clean failure. On valid, `normalizePlan()` re-mints ids server-side and
sets the defaults the engine expects (e.g. starting weights `null` = "calibrate from real use")
so the AI's output enters the deterministic pipeline in the engine's own vocabulary.

## The agentic variant: AI decides, engine/store execute

If the AI is agentic (tool-use loop), keep the same discipline by **splitting tools into READ
(executed server-side against the user's own rows) and ACTION (captured, returned, applied
CLIENT-side through the engine/store)**. The model never mutates state directly — it emits an
action, the client maps it to a real engine/store call, and reports `ok:false` honestly when
the change doesn't go through. Every model call inside the loop is metered (reserve before,
settle after) and a cap/error throws a 503/502 that propagates to the client's graceful
fallback. The engine stays source of truth; the AI is an intent layer over it.

> Honesty gate (STANDARDS): a run/action/number only appears if the model actually produced
> it. Never canned success copy — author the confirmation from the *real* outcome. If the AI
> claims a change the engine didn't apply, that's a bug, not a UX nicety.

---

## Assumes / adapt

- **Assumes** the core value of the app is expressible as deterministic logic (rules, math, a
  state machine) and the AI is enhancement (phrasing, planning, chat, extraction). If the AI
  *is* the core function (it can't be replaced by an engine), this pattern doesn't apply —
  you instead need retries/queueing, not silent fallback.
- **`null`-means-fallback is the whole contract** — keep every wrapper returning `null` (or a
  typed `{error}`) on every failure, never throwing, or one uncaught path takes the app down
  with the AI.
- **Compute-then-persist ordering is load-bearing** — never mutate state before you have a
  valid result, or an AI failure leaves a half-applied change.
- **The status codes are an API contract** — `502` = "bad shape, use your fallback", `503` =
  "unavailable, tell the user". Pin them; the client branches on the code, never on message
  text.
- Pairs with `single-user-lockdown.md` (the `/api` auth gate that runs before any AI),
  `offline-first-vendored-supabase-sync.md` (the engine reads local IndexedDB, so it works
  with no network at all), and the metering lives in
  `serverless-thin-client/atomic-metered-credits.md` / `metered-quota/` (don't re-implement).
