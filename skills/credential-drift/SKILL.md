---
name: credential-drift
description: One secret exists in many copies and you are about to trust that they agree. They do not. Two shapes of the same failure. (A) A key lives in several STORES at once (encrypted vault, project .env.local, hosting provider env, platform secrets, a running deployment's baked env) and the code reads only one of them. (B) The same secret is staged on several HOSTS in a fleet and a live test on one proves nothing about the others. Use whenever something needing a key fails (email not sending, posts not publishing, 401, "session invalidated"), before re-minting or rotating anything, before telling an owner to go regenerate something, whenever one copy is rotated, whenever a job works on one box and fails on another, whenever a fleet is rebuilt or migrated, before declaring a credential healthy fleet-wide, whenever a routine reports a credential blocker, and before believing any memory or doc that says a credential is good or bad. A stale copy fails silently: the job keeps firing on schedule and produces nothing.
origin: Elevare Studio — the fleet-host half from repeated multi-box staleness; the store half forged 2026-09 from a routine that reported a healthy Meta token as dead for three consecutive runs while the stale copy sat in production env
owners: devops-engineer, security-reviewer, backend-engineer, automation-engineer, payments-engineer, cto-portfolio, ai-engineer
---

# Credential drift — test the key before you blame it

## The rule

**Never report a credential as dead, expired, revoked or invalid unless you tested
that exact copy, in that store or on that host, in this session, and can quote what
the provider said.**

A failing integration is not evidence about a key. It fails identically when the key
is absent, stale in one copy, missing a scope, or genuinely revoked. Four different
problems, four different fixes. Guessing between them sends the owner at the wrong one.

## Two shapes, one root cause

### A. Store drift — the same host, several places to put a secret

| Store | Read by |
|---|---|
| Encrypted vault (`~/.keyvault`, 1Password) | humans, local scripts |
| Project `.env.local` | local dev, local routines |
| Hosting provider env (Vercel, Netlify, Fly) | **production** |
| Platform secrets (Supabase, GitHub Actions) | edge functions, CI |
| A running deployment's baked env | what is ACTUALLY serving right now |

The only value that matters is the one in the store the failing code reads. Identify
that store before touching anything.

### B. Fleet drift — the same secret, several machines

A credential staged on prox, acer, a laptop and a VPS is four copies. Rotating one
leaves three stale. **A live test on one host proves nothing about the others**, and
the failure is silent: the scheduled job keeps firing, exits cleanly, and produces
nothing, because a missing key and a wrong key both just make the work not happen.

Enumerate every host that runs anything using the secret before you conclude the
rotation worked.

## The failure this exists to catch

A daily routine reported, three runs running:

> "Blocker: re-mint META_PAGE_TOKEN, a password change invalidated it, 18 days dark."

It sounded investigated. Nobody re-checked it, because a plausible diagnosis inside a
well-written report reads as already-established.

One minute of real testing: `is_valid: true`, `expires_at: never`, both required publish
scopes present, and it read the live account fine. **The token had already been
re-minted into the vault.** The stale copy was in the hosting provider's production env,
which is what the running code reads. The fix was *propagate*, not *re-mint*, and three
runs of owner attention went to the wrong task.

The routine was not lying. It saw a real failure and reasoned to a plausible cause. That
is the trap: **a publish path throws identically when the key is merely missing from the
environment**, and the code's own message ("X, Y and Z must all be set") covers both.

## The procedure

1. **Enumerate every copy.** Every store on this host, and every host in the fleet.
   Write the list down before testing. There is never only one.
2. **Test against the provider directly**, not through the app, using the value from
   each copy, so you learn which copies disagree.
   - **Meta**: `GET /v21.0/me?access_token=X`, then
     `GET /v21.0/debug_token?input_token=X&access_token=<app_id>|<app_secret>` which
     returns `is_valid`, `expires_at` and the exact `scopes`. **Read the scopes**: a
     valid token missing `pages_manage_posts` passes every liveness check and still
     cannot publish.
   - **Stripe**: `GET /v1/account`. **Supabase**: `GET /auth/v1/settings`, or the
     Management API `GET /v1/projects/{ref}`. **Resend**: `GET /domains`.
   - Anything OAuth: the provider's introspection or `/me` equivalent.
   `scripts/probe-credential.mjs` covers the common providers.
3. **Compare copies, never just one.** Compare digests, not values: `sha256` of the
   first N chars, or length plus last four. Where a provider will not reveal a stored
   secret, overwrite that store with the value you have just verified. Overwriting with
   a verified value is idempotent and safe.
4. **Only now decide.**

| What you found | The actual fix |
|---|---|
| Valid, right scopes, absent from the reading store or host | **Propagate.** Do not re-mint. |
| Valid, missing a scope | Re-authorise for that scope. Re-minting the same scopes changes nothing. |
| Valid here, different value in production or on another box | **Propagate.** The classic. |
| Genuinely `is_valid: false` | Re-mint, propagate to EVERY copy, re-verify each. |
| No credential anywhere | Never configured. Say that; do not call it expired. |

## Report shape

Report **what you observed** (the provider's response, quoted), **where** (which store,
which host, which endpoint), and **what you ruled out** (which copies you compared).

"Publishing failed" is an observation. "The token is dead" is a conclusion and needs
introspection output behind it.

## Standing rules

- After ANY rotation, propagate to every store and every host in the same session, then
  re-verify each. A half-propagated rotation is worse than the stale key: it works where
  you tested and fails in production.
- Never print a secret. Digests, lengths, last-four only.
- Do not put a credential in production that the runtime does not read. An unused app
  secret in a production env is pure downside.
- **Treat a REPEATED credential blocker with more suspicion than a new one.** Three
  identical reports mean either the diagnosis is wrong or the report is being ignored.
  Both need action.
- "Worked yesterday, fails today" is far more often propagation or scope than revocation.
- Do not trust a memory or doc that says a credential is good or bad. Those record what
  was true when written. Test it. See [[claim-reality-audit]].

See also [[calibrated-check]]: your probe is itself a check, so run it once against a
deliberately wrong value and watch it go red before trusting a green.
