---
name: outcome-integrity-sweep
description: A write or a send that never reads its own outcome, and then tells the user it worked. The library RESOLVES with `{ error }` instead of throwing, so the try/catch catches nothing and the success path runs unconditionally — the iPad chimes "Cash logged — $140 recorded" while the row was refused, the route answers 200 on a 401'd email, the dashboard says "Quote sent to the customer" while Resend refused every one. Use before shipping anything that writes, sends, charges, notifies or archives; at the ship gate on any money/booking/email path; when a user says "I did it and nothing happened"; and any time you are about to write a success toast, a chime, a `sent: true`, or a 200.
origin: Elevare Studio — five incidents across four repos, 2026-08-14 → 2026-09-05
owners: code-quality-engineer, security-reviewer, backend-engineer, qa-verifier, payments-engineer, design-auditor
---

# Outcome-integrity sweep — a write that never reads its own outcome

## The rule

**If a call returns an outcome, read it before you claim it worked.**

Not "wrap it in a try/catch" — that is the failure, not the fix. The libraries this
studio ships on **resolve with an error instead of throwing**, so the catch is dead
code and the success path runs no matter what the database or the mail provider did.

```ts
try {
  await supabase.from("manual_earnings").insert({ ... });   // refused by RLS
  playGlobalSound("success");
  toast({ title: "Cash logged", description: "$140 recorded" });   // fires anyway
} catch (err) { /* never reached */ }
```

Nothing threw. Nothing was written. The stylist heard the chime, the client's cash
went in the drawer, and the ledger stayed empty — every single time, because the
kiosk runs as a *staff* login and `manual_earnings` had no staff INSERT policy.
**RLS denial was the normal case, not the edge case.**

## Five incidents, one shape

| Date · repo | The dropped outcome | What the human was told |
|---|---|---|
| 2026-08-14 · Fanta kiosk | `await supabase…insert()` unchecked (×2), the appointments UPDATE, the walk_ins UPDATE, and a duplicate-booking archive **followed by an unconditional delete** | "Cash logged — $140 recorded" · "Marked as Done" · a refused archive destroyed a real booking |
| 2026-08-16 · flavornews | `functions.invoke()` throws away the body on any non-2xx, so `data?.code` can never fire | a deliberately LOUD `CONNECT_ACCOUNT_NOT_CONFIGURED` 503 rendered as a generic error |
| 2026-08-23→30 · SentinelBox | `/api/notify` answered **200 on a 401'd send** | the engine, the uptime check and every status-code monitor read healthy while zero emails went out |
| 2026-08-31 · elevare-studio | a non-fatal `catch` around the intake send | the owner's first real `/get-started` lead notified nobody; the row saved, so the form looked fine |
| 2026-09-05 · Petal | `sendEmail()` correctly returned `{sent:false, reason:"refused"}`; `sendQuote()` only flipped on a **throw** and never read the return | "Quote sent to the customer" while Resend refused every one |

Note what these share and what they do not. Two are Supabase, two are Resend, one is
a plain HTTP handler. The library is incidental. **The defect is a return value that
nobody read, standing next to a sentence that says it worked.**

### Why this is its own thing

The studio already owns three neighbouring gates, and none of them sees this:

- `calibrated-check` asks whether a **check** can fail. Here there is no check.
- `claims-ledger-sweep` asks whether a **comment** naming a control cites its file.
  Here the claim is a toast, a chime, or an HTTP status.
- PLAYBOOK §4b asks whether an external **symbol** is defined and whether a produced
  value has a consumer. Here the symbol is fine and the value has a consumer —
  the consumer just never looks at the error field.

---

## Run it

```bash
node D:/.claude/skills/outcome-integrity-sweep/scripts/sweep.mjs <repo>   # default --min high
node .../sweep.mjs <repo> --min critical        # the ship-gate bucket
node .../sweep.mjs <repo> --min low             # full audit, incl. deliberate telemetry
node .../sweep.mjs <repo> --changed HEAD~1      # this wave only   ← routine use
node .../sweep.mjs <repo> --json                # for a ledger table
node .../sweep.mjs <repo> --window 40           # tighten how far a claim may sit after the call
node .../sweep.mjs --calibrate                 # SELF-TEST. Exits NON-ZERO if its own defect fails to fire
```

**Run `--calibrate` before you trust a green.** It is the only mode that exits
non-zero. It plants the exact defect (a bare awaited write with no destructure,
under a success claim) in a scratch copy under THREE different binding names,
none of them spelled `supabase`, reached by three different resolution routes,
and requires three CRITICAL rows back. It then plants the identical statement
destructured into `{ error }` and branched on, and requires ZERO. If either
control misses, it prints `CALIBRATION FAILED` and exits 1, because a sweep whose
own defect does not fire is not evidence of a clean tree.

No dependencies, Node 18+, read-only, always exits 0. It **nominates**; it never
verdicts. Wall time is dominated by file IO on this machine — **35–50 s for 268
files** — so wire `--changed` into the gate and keep the full pass for audits.

---

## What it flags, and why that is the only usable gate

Three conditions, all three required. Drop any one and you have something benign:

**1. an outcome is produced.** Tier A nominates on its own: a database client's
`.from().insert/update/upsert/delete`, `.rpc()`, `.functions.invoke()`, `auth.*` and
storage writes, `resend.emails.send()` and friends, and any `send*/notify*/email*/alert*`
call. Tier B (a `.from().select()`, `fetch`, `axios`, prisma writes, `.save()`) only
earns a row when a success claim also fires, otherwise this rebuilds the naive verb
grep it exists to replace.

> **THE CLIENT IS RESOLVED BY ASSIGNMENT AND BY METHOD SHAPE, NEVER BY NAME.** This
> was the tool's own worst bug and it is the reason `--calibrate` exists. Until
> 2026-09-28 Tier A keyed on the literal identifier `supabase`. Measured in
> `D:\elevare-studio`: `src/lib/report/store.ts` binds the service client as `svc`,
> so the injected defect did not fire there while the byte-identical statement
> spelled `supabase` fired CRITICAL. A client is now any variable assigned from a
> factory (`createClient`, `createServerClient`, `getServiceClient`, ...), any
> variable annotated `SupabaseClient`, any variable assigned from a LOCAL function
> whose declared return type is `SupabaseClient` (the `const svc = service()` shape),
> anything derived by `.schema(...)`/`.from(...)`/aliasing, and any identifier
> carrying the PostgREST method shape anywhere in the file, which is what resolves a
> client that arrives as a FUNCTION PARAMETER (`async function meterAttempt(db, ...)`).
>
> A second, quieter half of the same bug: the statement scanner broke at the first
> balanced line ending in `)`, so a multi-line chain
> (`await svc` / `.from(T)` / `.update({...})`) was truncated to `await svc .from(T)`,
> which carries no write verb. Both defects fail toward green. Together they made the
> tool sweep **0 of 16** awaited write statements across
> `D:/elevare-studio/src/lib/report` and `D:/elevare-studio/server/report-worker`
> while printing `0 row(s)` twice.

> **stripe-node is deliberately NOT on the list.** The class is *libraries that
> resolve with an error instead of throwing*; stripe throws, so `try { await
> stripe.transfers.create() }` really is handled. Listing it produced six false rows
> on fantahair's webhook alone.

**2 — nobody reads it.** Two detectors:
- **D1 dropped** — a bare `await x(...)` statement whose return goes nowhere.
- **D2 unread** — `const { error } = await …` where `error` is never referenced
  before the enclosing function ends or the name is re-declared; or `const res =
  await sendX()` where `res` is never read (the Petal shape). A destructure that
  binds `data` and omits `error` entirely is the flavornews shape and is reported
  as *"no error binding"* — one notch quieter, because a caller can legitimately be
  inferring failure from a null.

**3 — a success claim fires AFTER it.** Ordering is the whole discriminator. A chime
*before* the write is about something else. fantahair's `send-booking-notification`
invoke is dropped on purpose and is correctly silent here, because its
`setKioskView("book-success")` runs *before* the send.

| Claim | Strength |
|---|---|
| `playGlobalSound("success")`, `toast(…)` with no failure wording, `set*Confirmed/Sent/Done(…)`, `{ ok/success/sent: true }`, success copy in a `title`/`description`/`message` prop, a call to `complete*/finali*e/mark*Done` | **strong** → critical |
| a plain 200 / `NextResponse.json(…)` with no 4xx-5xx nearby | **weak** → critical **only if the dropped call is a send** (the SentinelBox 200-on-a-401 shape); otherwise high |

### The four filters that keep this from becoming noise

Each one was added because it fired falsely on a real file in `D:\clients\fantahair`:

1. **Telemetry dominates the claim.** fantahair writes `email_send_log` unchecked and
   then answers 200 — deliberately. Ranking those critical is exactly the failure that
   buries the six rows that are about the owner's money. Target-name match only
   (`_log`, `analytics`, `audit`, `events`, `metrics`, …) — a payload field called
   `tracking_code` is not telemetry.
2. **An explicit "I know" caps the row at high** — `background(…)`, `waitUntil(…)`,
   a trailing `.catch(…)`, or a *best-effort / fire-and-forget* comment on the call.
3. **A log line is not a claim to a human**, and neither is `.eq("status","completed")`
   (a query filter) or `case "sent":` (a switch label). All three produced
   misattributed claims before the filter went in.
4. **A `delete` on the FAILURE path is the opposite of the bug.** Both of fantahair's
   notification functions delete a claim row inside their `catch` to release it for
   retry. The archive-then-delete rule stops at the `catch`.

### It reads the callee's contract

The Petal bug in one sentence: `sendEmail()` **returned** `{sent:false}` and
`sendQuote()` only flipped on a **throw**. So whether a bare `await helper()` is a
defect depends entirely on the helper's contract — and the sweep resolves it:

- callee **throws** on failure and nothing else → the surrounding try/catch is real → **demoted to high**, and the note says so.
- callee can hand back a failure **without throwing** (`return null`, `return {error…}`) → stays where it is, with the file to open named.
- callee does **both** → **high**, note: *"BOTH throws and can return a failure without throwing — read `<file>` to see which path this call is on."* fantahair's `enqueueEmail()` is exactly this: it throws when the queue write fails and returns `null` when a marketing gate silently skips the send, so a caller that then writes `logNotification(…, 'sent')` is lying on one path and correct on the other.

---

## Calibration — measured, not asserted

Run against the tree that shipped the kiosk bug and the tree that fixed it. The fix
commit is `2adf0f0` *"Kiosk: stop the screen lying about writes that never happened"*
in `D:\clients\fantahair`, and its message enumerates the six known-bad sites.

```bash
git -C D:/clients/fantahair archive 2adf0f0^ src | tar -x -C <tmp>/bad
git -C D:/clients/fantahair archive 2adf0f0  src | tar -x -C <tmp>/fixed
node .../sweep.mjs <tmp>/bad --min critical      # 8 rows
node .../sweep.mjs <tmp>/fixed --min critical    # 2 rows
```

- **Recall 6/6.** Every site the fix commit names is nominated **critical** in the
  bad tree: the two `manual_earnings` inserts (`PayMode.tsx:1361`, `:1401`), the
  appointments UPDATE (`:1444`), the archive insert (`:1460`), the unconditional
  delete behind it (`:1475`), and the walk_ins UPDATE (`:1479`). The archive rows
  additionally carry *★ destructive follow-up at line 1475 — a refused copy, then a
  real delete.*
- **All 6 go silent in the fixed tree.** The flag goes green exactly where the defect
  was fixed. The two rows that remain (`DuplicatesDetector.tsx:193`,
  `PayMode.tsx:1575`) are genuinely unfixed instances the commit never touched —
  `DuplicatesDetector` still archives unchecked and then deletes, **today**.
- **Calibrated red on an injected defect, on the real file.** Copy today's
  `src/pages/PayMode.tsx`, delete the `if (error) throw error` under the appointments
  insert, re-run: a new critical appears at `PayMode.tsx:1011` naming the claim it
  gates — `setKioskView("book-success")` at `:1028`. Restore the guard, it goes green.
  (`calibrated-check` step 2–4, on the file where the bug happened.)
- **Precision 93 % on the critical bucket** of a full fantahair HEAD pass
  (268 files → **15 critical · 29 high · 23 low**; 15 rows hand-labelled, 1 false —
  an `rpc("kiosk_pin_clear_attempts")` whose only "claim" sits 75 lines away).
  Rows included `create-booking-payment-intent/index.ts:546` and
  `refund-reconcile/index.ts:155`.
- **Base rate is near zero elsewhere.** `whyza/src` (307 files): **0 critical**, 4
  high, 2 low. `flavornews-web/src` (185 files): **0 critical**, 5 high, 2 low. The
  tool is not firing indiscriminately — fantahair is genuinely dense with this class
  because it is the repo where the incident happened.

**Re-calibrate before trusting it on a new stack.** It knows supabase-js, Resend,
and locally-defined helpers. Prisma/Drizzle/Firebase/Mongo shapes are Tier B stubs.

---

## Then do the work

The sweep tells you nobody read the outcome. It cannot tell you whether the write
would have failed. Resolve every critical row one of four ways:

1. **Read it and branch.** `const { error } = await …; if (error) throw error;` —
   and make the failure message tell the person *what to do instead*. On a kiosk the
   stylist is standing there holding the client's money: **"Cash NOT logged — write
   it down and add it from the dashboard"**, not "Error".
2. **Order the write before the destruction.** A write that is a safety copy for a
   delete must be *verified* before the delete runs. Archive-then-delete is only safe
   if the archive landed. That one cost a real booking.
3. **Make the status tell the truth.** SentinelBox's fix commit `d51224e` says it in
   its own title: *a failed alert email is a 502, not a 200*. A handler that answers
   OK for a failed send blinds the engine, the uptime check and every monitor at once.
4. **If you genuinely mean best-effort, say so in code, and raise something a human
   sees.** A swallowed send is correct for the visitor's UX and invisible to everyone
   else. `background(…)` / `waitUntil(…)` plus an alert beats a bare dropped await —
   but the elevare-studio intake proved the log line alone is not enough.

Do not "fix" a row by widening the try/catch. The catch was never the problem.

### The one client-side trap the sweep can only warn about

`supabase.functions.invoke()` **discards the response body on any non-2xx**. Still true
on this machine today: `@supabase/functions-js@2.112.4`,
`dist/main/FunctionsClient.js:273-274` — `if (!response.ok) throw new
FunctionsHttpError(response)`, and body parsing does not start until line 276. First
hit on `2.87.1` (flavornews, 2026-08-16); re-verified `2.112.4`, 2026-09-06. The
library's own docstring names the recovery (`await error.context.json()`) and it is
still routinely missed. So `if (data?.code)` is dead code for
every 400/403/409/429/500/503, and `error.message` is the literal string
`"Edge Function returned a non-2xx status code"`. The body is recoverable:

```ts
const ctx = (error as { context?: Response } | null)?.context;
const body = ctx?.clone ? await ctx.clone().json().catch(() => null) : null;  // .clone() — one-shot stream
```

Do **not** work around it by returning HTTP 200 for errors; that breaks retries,
status semantics and monitoring. Fix the client.

## Known limits — state these, do not hide them

- It cannot tell a **failing** write from a passing one. It finds writes nobody checks,
  which is a strictly smaller and much more mechanical thing.
- **A claim that sits more than `--window` lines away, or one function call deeper, is
  missed.** `completeItem()`'s toast was caught only because the sweep also treats a
  call to `complete*/mark*Done` as a terminal-state claim.
- **A local helper it cannot resolve is ranked as if the outcome mattered.** Cross-file
  resolution is by function *name*; two helpers with the same name collide, first wins.
  Under `--changed` only the changed files are indexed, so a helper defined in an
  untouched `_shared/` file will not resolve and its callers rank one notch hotter.
  Re-run the row's file without `--changed` before you act on it.
- Statement boundaries are found by brace/paren balance on a comment- and
  string-masked copy, not by a parser. Exotic formatting can split a statement.
- JS/TS only (`.ts .tsx .js .jsx .mjs .cjs`), tests and `.d.ts` skipped.
- **Read the `swept N statements across M files` line, not just the row count.** A
  zero row count over a zero coverage count means the sweep did not look, which is
  exactly how the name-keyed version reported two clean directories it had never
  read. A zero is only evidence when the coverage number is plausible for the tree.
- Client resolution is PER FILE. A client that is only ever a bare parameter, never
  used with a `.from(...)` chain in that same file, is not resolved.
- **Advisory, never a build-blocker** — same standing as `claims-ledger-sweep`.

## Related

- `calibrated-check` — run it on this sweep itself before reporting a green.
- `claims-ledger-sweep` — the sibling gate for claims made in *comments*; this one is
  for claims made to *users*. Both feed the PLAYBOOK §4b claims ledger.
- `rls-tenant-isolation` — why the write was refused in the first place, and the
  reason a blocked UPDATE raises no error and affects zero rows.
- `verification-loop`, `security-review` — what you run once a row turns out to be real.
- Memory: `unchecked-supabase-write-reports-success`, `functions-invoke-discards-error-body`,
  `deployed-credential-goes-stale`, `empty-env-var-passes-env-ls`.
