# Bolt the Elevare support desk onto a static / no-build app (delta)

**When to reach for it:** you host a **static / no-build app** (plain HTML/CSS/JS, no
Next.js, no bundler) and want its user to file "this is broken / change this" from inside
the app and watch it get worked — using the studio's existing autonomous support desk. This
is a **delta / runbook on top of** `autonomous-support/autonomous-support-ticket-system.md`
— read that first for the full system (the hosted `support-widget.js`, the central
`/api/support/external` endpoint, the 3-table desk, the headless-`claude -p` self-heal
routine, and the HARD RAILS). This file only covers **what's different when the app is a
static site that does NOT use the drop-in `<script>` widget** — because a no-build phone PWA
wants its ticket surface hand-rolled into its own design system, not an injected iframe/script.

Everything about the *desk* (endpoint auth, tables, statuses `new→diagnosing→fix_staged→
deployed→resolved`+`needs_human`/`failed`, the routine, the rails) is unchanged. Only the
*client integration* changes.

---

## The five concrete steps

### 1. Desk-side registration (owner/conductor, once) — unchanged from the base system

- Insert a `support_project_tokens` row: `(project, token, allowed_origins)`. `project` is a
  stable slug (`my-app`); `token` is a random public per-project bearer.
- Add the project to the routine's `registry.json` (repo path, deploy command, health URL) so
  the self-heal routine can diagnose→fix→deploy→health-check this app.
- Add the app's production origin to the endpoint's `ALLOWED_ORIGINS` / `KNOWN_PROJECTS` so
  cross-origin GET/POST from the app is accepted (the origin allow-list + rate-limit are the
  real gates; the token is public).

### 2. Public config in the static app (no build → the token ships in a JS file)

```js
// config.js — the support token is a PUBLIC per-project bearer. Safe in client JS:
// the route documents it as non-confidential; the real gates are the desk's origin
// allow-list + rate limit. (The Anthropic/service keys are NEVER here — server /api only.)
export const SUPPORT_INTAKE_URL = 'https://elevarestudio.co/api/support/external';
export const SUPPORT_PROJECT     = 'my-app';
export const SUPPORT_TOKEN       = '<public-per-project-token>';
```

### 3. CSP `connect-src` — allow the app to reach the desk cross-origin

The static app's `vercel.json` CSP must permit `fetch` to the desk origin, alongside
Supabase/self:

```json
"connect-src 'self' https://*.supabase.co wss://*.supabase.co https://elevarestudio.co"
```

Without this the desk `fetch` is blocked by CSP with a console error and every ticket silently
fails to send. (Keep the rest of the CSP tight — `script-src 'self'`, `object-src 'none'`,
`frame-ancestors 'none'`.)

### 4. Service worker — network-first for the desk origin, never cached

If the app is a PWA with a SW, route the desk like the other live data — **network-first, never
written to cache** (a stale cached ticket list or a cached POST would be wrong/insecure). Only
GET is ever cached; non-GET is passthrough:

```js
function isNetworkFirst(url) {
  if (url.pathname.startsWith('/api/')) return true;
  if (url.hostname.endsWith('.supabase.co')) return true;
  if (url.hostname === 'elevarestudio.co') return true;   // support intake
  return false;
}
// networkFirst() returns { ok:false, offline:true } (503) on failure so the app's
// own offline handling (queue + honest note) takes over.
```

### 5. The hand-rolled ticket surface (in the app's own design system)

Instead of the injected widget, build the Report form + "My Requests" view natively and talk
to the same public intake. The pieces that matter:

- **POST to file a ticket**, GET to list this project's tickets. Same wire contract as the base
  system — `{ project, token, title, description, severity, category, reporterName?,
  reporterEmail?, context }` on POST; `?project=&token=` on GET returning `{ tickets:[…] }`.

```js
async function postTicket(payload) {
  const res = await fetch(SUPPORT_INTAKE_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 401 || res.status === 403) return { ok: false, code: res.status }; // allow-list not live yet
  if (!res.ok) return { ok: false, code: res.status };
  try { return await res.json(); } catch { return { ok: true }; }
}
```

- **`textContent`-only for every dynamic string** — ticket titles, descriptions, progress
  messages, the user's own echoed input. The desk is a **shared, cross-project store**; its
  text is an untrusted stored-XSS boundary. Structural markup uses literals only; never
  `innerHTML` with desk data. (This is the same XSS discipline the hosted widget enforces —
  you must re-implement it since you're rendering the desk's data yourself.)

- **A SEPARATE local outbox from the sync outbox.** Offline tickets queue in a dedicated
  localStorage key (`help_outbox`), **not** the app's Supabase sync outbox — that outbox only
  round-trips the app's own Supabase tables and would DROP a foreign support ticket. Flush the
  support queue on reconnect; show queued rows optimistically with a "will send" chip.

- **The lifecycle stepper + polling** are the app's own components mapping the desk's statuses:
  `Submitted→Received→Working→Deployed→Resolved` with `needs_human`/`failed` off-ramps. Poll
  fast (~7s) while a ticket is active, idle (~20s) otherwise, **pause on hidden tab**, resume on
  visibility/online. Announce status changes to an `aria-live` region.

- **Capture context** on submit for the routine's diagnostics: `url`, `path`, `viewport`,
  `userAgent`, `referrer`, and a **JS-error ring buffer** (install a bounded, length-capped
  `window.onerror` + `onunhandledrejection` hook once, guarded, chaining any prior handler,
  never throwing). This gives the self-heal routine the recent-error trail the hosted widget
  would otherwise capture.

- **Every failure is graceful.** A `401/403` (origin not allow-listed yet at deploy) or a
  network throw preserves the user's draft and shows an honest "couldn't reach the desk, your
  words are safe" note — never a lost message.

---

## Assumes / adapt

- **Assumes** the base autonomous-support desk exists and is live (endpoint + tables + routine).
  This delta does not stand alone — it's the *client wiring* for a static app.
- **Read `autonomous-support/autonomous-support-ticket-system.md` for the rails** — they're
  unchanged and non-negotiable: owner/user-facing only (never a public page), **payments are
  human-only** (→`needs_human`), strict per-client isolation, one ticket at a time, and the
  Windows routine gotchas (ASCII-only `.ps1`, DPAPI secrets, service key targets the TICKETS
  project). This file doesn't restate them; it assumes them.
- **Why hand-roll instead of the hosted widget:** a no-build phone PWA wants the ticket surface
  in its own tokens/typography/motion and its own offline model, not an injected script. If the
  app is a conventional dashboard, prefer the drop-in `support-widget.js` — it's less code and
  themed per-brand already.
- **The token is genuinely public** — don't try to hide it; the origin allow-list + rate-limit
  are the boundary. Do keep it in `config.js` alongside the (also public) Supabase anon key, and
  keep all real secrets server-side.
- **At deploy the origin must be added to the desk's allow-list** before tickets send; until
  then the app 401s gracefully. Verify with one real submit from the production domain that a
  row lands on `/admin/support`.
