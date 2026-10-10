# Autonomous Support + Real-Time Ticket System

A complete, drop-in **"Report a Problem or Request a Change" → central desk → self-fixing routine** for a fleet of sites you host. One hosted `<script>` on any client's admin dashboard gives the owner an intake form AND a live-tracked "My Requests" view; tickets land in one central Supabase desk; a headless Claude Code routine on an always-on PC diagnoses, fixes, builds, deploys, health-checks, rolls back on failure, and emails you — one ticket at a time, within ~2 minutes of it being filed.

Harvested from `D:\elevare-studio` (the widget + endpoints + admin desk) and `D:\.claude\automations\support-routine` (the autonomous routine). Verified live across all 6+ Elevare client sites, 2026-07-08.

## When to reach for it
You run **more than one site you built** and want the owner of each to file "this is broken" / "change this" from inside their own dashboard, watch it get worked in real time, and have most tickets fixed automatically without you babysitting a queue. It is the ops layer that sits **on top of** the fleet the studio already ships (each site is `admin-dashboard/` + `supabase-nextjs-pwa/` etc.). If you have exactly one site, the routine is overkill — but the widget + endpoint + desk still pay for themselves.

## The five pieces (what exists, do NOT re-architect)

```
[Client site owner dashboard]                         [Central desk: elevare-studio]
  support-widget.js  ── POST/GET /api/support/external ──►  support_tickets
   • Report form                (project+token auth,          support_events
   • My Requests (live)          CORS allow-list,             support_project_tokens
                                 rate limit, service-role)         │
                                                                   │ reads status/events
                                                            /admin/support desk
                                                             (auto-refresh + stepper)
                                                                   ▲ writes status/events
                                            ┌──────────────────────┘
                          [Always-on PC]  Windows Scheduled Task (every ~2 min)
                            run.ps1 → cheap pre-check → (new ticket?) → headless `claude -p ROUTINE.md`
                            → per-project registry.json → diagnose/fix/build/deploy/health-check/rollback → 2 emails
```

### 1. Hosted embeddable widget — `public/support-widget.js`
One self-contained, **dependency-free** file served from your own origin (`https://<you>.co/support-widget.js`). Any site adds it with one tag:
```html
<script src="https://elevarestudio.co/support-widget.js"
        data-project="styledbymyiah" data-token="<per-project bearer>"></script>
```
It injects a floating launcher + a themed modal with a **segmented control** switching two views:
- **Report** — title / description / priority (`low|normal|high|down`), and it **auto-captures page context**: `location.href`, `pathname`, `navigator.userAgent`, and a **ring buffer of the last ~15 JS errors** (it wraps `window.onerror`, `onunhandledrejection`, and `console.error` at load, chaining the prior handlers so it never breaks the host page).
- **My Requests** — a live-polled (`GET`, ~20s) ticket list with a per-status **lifecycle stepper** `Submitted → Received → Working → Deployed → Resolved`, terminal off-ramps (`Needs you` / `Failed`), an **honest "next automated check in ~2:00" countdown** (anchored to the last poll, not a fake bar), an activity stream of the routine's progress messages, an open-count badge, and full loading / empty / error states.

Craft invariants that make it safe and on-brand (keep these — they are the point):
- **Themed per brand** via a token layer: ONE structural stylesheet written entirely in `var(--elvsw-*)`, plus **N brand token blocks** (`.elvsw-t--<project>{ --elvsw-accent:…; --elvsw-bg:… }`) selected by `data-project` (unknown → default theme). Tokens live on `.elvsw-scope`, **never `:root`**, so they cannot leak onto the host page. Pull each brand's tokens from that site's LIVE source (STANDARDS: the live site is the only brand truth).
- **XSS-safe:** every dynamic string (ticket titles, descriptions, event messages) is written with `textContent` only — never `innerHTML`. Ticket text is untrusted.
- **Namespaced** `.elvsw-` on every class; guarded against double-injection (`window.__elevareSupportWidget`).
- **Full a11y:** `role="tablist"`/`tab`/`tabpanel` with arrow-key nav, focus trap + Esc + focus restore, an SR live region announcing status changes.
- **3-layer `prefers-reduced-motion`:** (1) a CSS `@media` block killing animation durations + composing static end-states, (2) a JS `matchMedia` guard no-oping the WAAPI/timer-driven bits (spinner, countdown interval), (3) terminal/appear animations that don't fire on reduced motion. (Cross-links `offline-native-app/reduced-motion-three-layers.md`.)

### 2. Public cross-origin endpoint — `src/app/api/support/external/route.ts`
One Next.js route, `runtime = "nodejs"`, `dynamic = "force-dynamic"`:
- **POST** files a ticket; **GET** returns that project's own tickets for the live view.
- **Auth = a `(project, token)` pair** matched against a `support_project_tokens` row via a **service-role** client (RLS bypass). The token is a **shared bearer secret shipped in client JS** — it is NOT end-user auth; its only job is to stop arbitrary third parties from filing into the desk and to bind a submission to a project. Rotate by updating the row.
- **CORS is a hardcoded allow-list** of live client origins (echo `Origin` only when allow-listed; always `Vary: Origin`). Deliberately NOT data-driven from a table.
- **Per-IP+project rate limit** (~5/min POST, ~40/min GET), all strings trimmed + length-capped, `safeEqual` non-short-circuiting token compare, generic error copy (never disclose whether project or token was wrong; never an existence oracle).
- GET returns **only minimal non-sensitive fields** (id, title, status, timestamps, and `progress`-kind event messages) — never another project's data, never full context.

### 3. Data — three tables in ONE central Supabase project (RLS: service-role only)
- `support_tickets` — `project, title, description, severity(low|normal|high|down), status, context jsonb, resolution jsonb, created_at, updated_at, resolved_at`.
- `support_events` — `ticket_id, kind, detail jsonb, created_at`. `kind` in `submitted|diagnosing|deployed|resolved|notified|progress|…`; `progress` rows carry `{message:"<short human line>"}` and are the live activity stream.
- `support_project_tokens` — `project, token`. The whole auth boundary for the public endpoint.
- **Statuses:** `new → diagnosing → fix_staged → deployed → resolved`, plus terminal `needs_human` / `failed`. The status column is the source of truth for the UI stepper.

### 4. Admin desk — `src/app/admin/support/` (`page.tsx` + `ticket-card.tsx` + `live-refresh.tsx` + `next-run.tsx`)
An auto-refreshing back-office inbox behind the existing `/admin` role gate. Reads through the service client (tickets are RLS-locked). Same lifecycle stepper + next-run countdown as the widget, a manual "mark resolved" fallback (`PATCH /api/support`), open-count. `next-run.tsx` computes the next scheduled-task fire from the client clock (a `RUN_MINUTE` constant — **keep it in sync with the actual Scheduled Task**).

### 5. Autonomous routine — `D:\.claude\automations\support-routine\`
- `ROUTINE.md` — the routine's brain (the headless prompt). Owner's standing permission to act. Reads the queue, works **one ticket at a time** through its full lifecycle, then stops.
- `registry.json` — the project map. Each `project` → `{repo, live_url, framework, supabase_ref, deploy, dashboard_path, status}`. `deploy` is `"git"` (push → Vercel auto-deploy) or `"vercel-cli"` (commit local + `vercel --prod --scope <team>`, no git remote). A ticket whose project is missing / `repo:null` / `status:"pre-launch"` → `needs_human`.
- `run.ps1` — the launcher (see instant-trigger model below).
- `set-oauth-token.ps1` / `set-svc-key.ps1` — one-time DPAPI-encrypted secret installers.
- Windows Scheduled Task fires every ~2 min; `heartbeat.txt` records liveness.

**Instant-trigger model (cheap-first):** every 2 min `run.ps1` does a **cheap REST pre-check** — "are there any `status=new` tickets?" — writes the heartbeat, and if zero, **exits silently** (no log, no Claude spun up, zero subscription cost). Only when a new ticket waits does it take a single-instance lock, load the subscription OAuth token, and launch `claude -p "$(ROUTINE.md)"` headless over the queue. So a ticket starts being worked within ~2 min, but the frequent polls cost nothing.

**Per-ticket lifecycle (in ROUTINE.md):** set `status=diagnosing` as the FIRST DB write (client sees "Received" instantly) → classify (small/clear/safe → handle; big/ambiguous/risky/payments → `needs_human`) → `git tag` + `git bundle` backup → branch → diagnose + minimal fix → `npm run build`/tsc must pass (else restore + `failed`) → merge to default branch + push/`vercel` (author `elevarecreativ@gmail.com`) → `status=deployed` → wait ~90s + curl homepage AND affected path → healthy? `resolved` : **rollback** (`git revert` + push, confirm healthy) + `failed` → write `resolution` jsonb → **TWO separate emails** (one per recipient) with problem / root cause / files+commit / result. A `progress` event is inserted at each major step so the owner watches it live.

Runs on the **Claude subscription** (not metered API): `run.ps1` clears `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` and loads a DPAPI-encrypted `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`.

---

## HARD RAILS (non-negotiable — learned the hard way, do not relax)

- **OWNER-DASHBOARD-ONLY.** The widget loads ONLY on **auth-gated owner/admin/dashboard** segments — never on public/customer pages. End-users and customers must never be able to file tickets (that would let the public drive an autonomous deploy pipeline). Verify the embed placement on every site. The host page controls where the `<script>` renders; put it behind the same gate as the dashboard, not in a global layout.
- **PAYMENTS ARE HUMAN-ONLY.** The routine has the tokens but the rule is absolute discipline: it NEVER creates/modifies/cancels/refunds a charge, payment intent, subscription, price, coupon/discount, payout, transfer, or fee; never touches Stripe / Stripe Connect config, settlement rows, application-fee %, webhooks, or keys; never moves money. Anything payment-adjacent → `needs_human` + email. (Reinforces `[[no-discounts-without-client-signoff]]`.) It MAY freely edit non-money UI/copy/content and fix non-payment bugs.
- **STRICT PER-CLIENT ISOLATION.** One ticket = exactly ONE client's repo + data + secrets (its `project` in the registry). Never read/edit/deploy another client's repo; never copy one client's data/keys/images/copy into another's site; never cross-reference. Ambiguous owner → `needs_human`. One client's info must never leak into another's site or into an email about a different client.
- **ONE TICKET AT A TIME (serial).** Each ticket does a branch + build + deploy; overlapping them crosses wires and risks a bad deploy. Order by severity (`down > high > normal > low`, oldest-first within), take exactly one through its FULL lifecycle before the next. A single-instance lock guarantees one RUN; this rule guarantees one TICKET within a run.
- **Backup → verify → health-check → auto-rollback.** Never leave a site broken. Tag + bundle before any edit; build must be green before deploy; curl the live path after; revert + confirm healthy on any failure. (STANDARDS non-destructive protocol.)

## Windows gotchas (each one bricked the system once — bake them in)
- **`.ps1` must be pure ASCII.** Windows PowerShell 5.1 parses `.ps1` as ANSI; a single em-dash / smart-quote anywhere in the file breaks the **whole** scheduled script. Keep launchers and setup scripts ASCII-only. (See `[[ascii-only-ps1-scheduled-tasks]]`.)
- **Disable "Start only if on AC power" on laptops.** The Scheduled Task's default `DisallowStartIfOnBatteries` means the task silently never fires on battery. Clear it, or the whole system looks dead.
- **DPAPI-encrypt secrets, and know the decryption context.** `.oauth-token` and `.svc-key` are DPAPI (user-scoped) — useless to any other user/machine. They decrypt only in the **same Windows account** context; configure the Scheduled Task to run as that user with stored credentials (InteractiveToken-style), or the decrypt returns empty and the run no-ops. Never print a secret; never commit one.
- **Point the service key at the TICKETS project, not a stale `.env.local`.** The desk's `.env.local` may point at a DIFFERENT Supabase project — using it 401s against the ticket DB. The pre-check reads a `.svc-key` created specifically from the tickets-project (`<platform-project-ref>`) `service_role` key; `set-svc-key.ps1` even decodes the JWT and refuses to store a key whose `ref` isn't the tickets project. (STANDARDS: `.env.local` is not production truth and may belong to another project.)

---

## Add this to a new site in ~20 minutes

**Assumes:** the central desk (endpoint + 3 tables + `/admin/support`) already exists in your studio's Supabase/Next project, and the autonomous routine + Scheduled Task are already running on your always-on PC. Steps 1–5 onboard one *new* site; steps A–B are the one-time desk setup if you're standing it up fresh.

**Onboard a site (repeat per client):**
1. **Mint a token + register the project.** Insert a `support_project_tokens` row: `project='<key>'`, `token=<crypto.randomBytes(24).hex>`. Add `'<key>'` to `KNOWN_PROJECTS` and the site's live origin to `ALLOWED_ORIGINS` in `route.ts` (redeploy the desk).
2. **Add a brand token block** to the widget: copy an existing `.elvsw-t--<project>{…}` line, swap in the new site's tokens **pulled from its live `:root`/`index.css`** (accent, bg, surface, ink, muted, border, success/danger/warn, fonts, radius), add the `project → theme class` entry to `THEME_MAP`. Redeploy the widget file.
3. **Embed the script behind the dashboard gate** (owner/admin-only route, NOT a public/global layout):
   ```html
   <script src="https://<you>.co/support-widget.js"
           data-project="<key>" data-token="<token>"></script>
   ```
4. **Add the project to `registry.json`** on the always-on PC: `{ repo, live_url, framework, supabase_ref, deploy:"git"|"vercel-cli", dashboard_path, status:"live" }`. This is what tells the routine which repo to edit and how to ship it.
5. **Smoke-test end to end:** file a test ticket from the dashboard → confirm it lands in `/admin/support` and in "My Requests" → let the routine pick it up (or a small safe change) → watch the stepper move → confirm the two emails + a healthy deploy. Live-curl the endpoint's happy + bad-token paths (STANDARDS: build-green ≠ ship-green for serverless routes).

**One-time desk + routine setup (if starting fresh):**
- **A.** Create the 3 tables (service-role-only RLS) in the central Supabase project; build `route.ts` (POST+GET, project+token auth, CORS allow-list, rate limit); build `/admin/support` behind your existing admin gate. Copy `public/support-widget.js` and strip it to one default theme + your own brand block.
- **B.** On the always-on PC: drop `ROUTINE.md` + `registry.json` + `run.ps1` + the two setup scripts; run `claude setup-token` then `set-oauth-token.ps1`; run `set-svc-key.ps1`; register the Scheduled Task (every ~2 min, run-as-user with stored creds, **clear DisallowStartIfOnBatteries**). Confirm `heartbeat.txt` updates and a filed ticket gets worked.

## Adapt notes
- **Central-desk model:** all tickets live in ONE Supabase project; each site only ever talks to it through the public endpoint with its own token. This is what lets a single routine + single desk serve the whole fleet. Don't scatter per-site ticket tables.
- **Deploy per project varies** (`git` vs `vercel-cli`, default branch `master` vs `main`) — that's exactly why `registry.json` carries `deploy` + `deploy_note`. Read it, don't assume.
- **The routine is a discipline system, not a sandbox** — it holds the tokens, so every rail above is enforced by the prompt, not by capability limits. Keep the rails in `ROUTINE.md` verbatim; a relaxed rail is how a payment change or a cross-client leak ships.
- **Commit author must be a real GitHub account** (`elevarecreativ@gmail.com` for Elevare) or Vercel blocks the deploy (`[[deploy-identity]]`).
- Cross-links: memory `[[autonomous-support-system]]` (the live system + its standing owner permissions + two-email rule), `[[ascii-only-ps1-scheduled-tasks]]` (the ASCII rail), `[[no-discounts-without-client-signoff]]` (the payments/discount human-only rail). Adjacent library assets: `admin-dashboard/owner-dashboard-blueprint.md` (the dashboard the widget rides on), `ops/external-approval-golive-watcher.md` (the sibling unattended-scheduled-script pattern), `orchestration/parallel-fix-wave.md` (the human-run multi-agent fix wave the `needs_human` tickets route to).
```
