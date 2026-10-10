---
name: hydration-assertion
description: A deployed page loads and looks completely right but nothing on it works — every button does nothing, forms/inputs/a composer/a modal are dead, clicking has no effect, or it works in dev and is inert in production. Check this BEFORE debugging any individual control — if the whole route is inert the client tree never mounted, and every other observation you make is about server HTML. Proves per route that a deployed React/Next.js page actually HYDRATED (the client tree really mounted) instead of serving dead server HTML. Run it whenever a rendered page is non-interactive, after any CSP / nonce / security-header change, after any render-mode change (static vs dynamic, force-dynamic, ISR, generateStaticParams), and before shipping any Next.js build. A green build, a clean console, passing tests, the right response header, and the element being present in the DOM ALL pass on a completely dead page — this counts React fibers and runs a known-dead control, so a false green is impossible.
origin: Elevare Studio — forged from the HausAI A5 incident (2026-08)
owners: design-auditor, qa-verifier
---

# Hydration assertion — prove the client tree mounted

## The failure this exists to catch

HausAI shipped a Next 16 CSP with a nonce policy. **Next 16 stamps nonces only on DYNAMICALLY
rendered routes**, and under CSP the presence of a nonce makes the browser *ignore*
`'unsafe-inline'` — so the inline bootstrap (`self.__next_f.push(…)`, which carries the flight data
hydration needs) was blocked on every **prerendered** page. React never hydrated. `/builder` — where
every "Start a design" CTA on the site lands — rendered **with no composer**. The product could not
be used.

It was invisible to `next build`, to `tsc`, to **1,400+ passing tests**, and to a **completely clean
browser console**. Two conductor verifications returned confident green against the broken build
before the third worked:

| # | What was checked | Why it passed on a dead page |
|---|---|---|
| 1 | Grepped the **first 8 script tags on one route**, generalised | The routes that broke were the ones not sampled |
| 2 | Asserted an element was **present in the DOM** | The **server HTML contains it**. Presence is a property of the markup, not of React |
| — | Read the response **header** | Right header, dead page |
| — | `window.__next_f` is defined | It is defined by the inline script that *did* run, or by nothing at all |

Only a **React fiber count** worked: a signal that cannot exist on a page whose client tree never
mounted. `design-auditor` had to invent it mid-run. This skill is that check, made a tool.

**Not this skill if** one control misbehaves while the rest of the page is alive — that is a logic or
state bug (`click-path-audit`). This one is for *nothing works*. It costs ~10 s per route, so when in
doubt run it first: it is the only failure that makes every other piece of evidence meaningless.

## The rule

> **Pick a signal that CANNOT be present when the thing is broken.** (STANDARDS, "Verify before you
> claim done".) A check that passes on a dead page manufactures confidence, which is worse than no
> check.

`__reactFiber$*` / `__reactProps$*` / `__reactContainer$*` are written onto DOM nodes **by ReactDOM
at hydrate time**. Server HTML cannot contain them. That is the only acceptable criterion here.
Everything else in the report is diagnostic colour.

## Run it

```bash
node D:/.claude/skills/hydration-assertion/scripts/assert-hydration.mjs \
  --base https://your-deployment.vercel.app \
  --app-dir D:/YourRepo/src/app \
  --control both --json hydration.json
```

No dependencies. Node ≥ 22 + local Chrome/Edge, driven over raw CDP.

Per route it reports: **prerendered vs dynamic · nonce attribute count · inline script count ·
fiber count · hydrated yes/no · whether the control went dead · whether the route redirected.**

Exit `0` GREEN · `1` RED or VOID · `2` bad invocation · `3` crash.

## Three non-negotiables

**1. A known-dead control runs in the same session, or the run is void.**
`--control csp` rewrites the document's CSP to a nonce policy mid-flight — reproducing the historical
failure *exactly*, inline bootstrap blocked while external chunks still load. `--control nojs` blocks
every script. If a control run ever reports "hydrated", the probe cannot tell working from broken and
the tool prints **VOID** and refuses to emit a green. Without this, the skill would reproduce the very
failure it exists to catch. STANDARDS requires calibrating a new gate against known-good *and*
known-bad before its verdicts count; here the known-bad is built into every run.

**2. Rehearse the red before you believe the green.** `--self-test` breaks hydration on every live
load and asserts the tool goes RED. A tool that has only ever been seen green has not been tested.

```bash
node .../assert-hydration.mjs --base https://your-deployment.vercel.app --app-dir ./src/app \
  --control csp --self-test --settle 6000 --control-settle 5000
```

**3. Enumerate every route. Never sample one and generalise.** That was failure #1, and the routes
that broke were precisely the ones not sampled. The script unions **sitemap.xml + robots.txt
`Disallow:` + `--app-dir` (walks `src/app` for every `page.tsx`) + `--routes`**.
**`--app-dir` is the one that matters** — on HausAI the sitemap listed 8 routes and the app dir
found 21, and `/builder`, the route that actually broke, was in the second set only, because it is
`noindex` and robots-disallowed. Cross-check the count against `next build`'s route table.

## Reading a RED

Root causes, in the order to check them:

1. **Next 16 nonce ↔ prerender (check this FIRST — it is silent everywhere else).** Fingerprint:
   the failing routes are `prerendered`, ship `inline > 0`, and show `nonce attrs = 0`. Grep the CSP
   header for `'nonce-`. The tool names this automatically when the fingerprint matches. The fix is
   either `script-src 'self' 'unsafe-inline'` (documented honestly as **not** an XSS control — see
   `D:\HausAI\src\lib\security\csp.ts`) or forcing dynamic rendering on every route and keeping the
   nonce. That is a product decision, not a config tweak.
2. **Any other CSP/script blocking** — a `script-src` that misses a chunk origin, a `Trusted Types`
   directive, an over-eager `require-trusted-types-for`.
3. **A module-eval crash in the client bundle** — the first page error is printed; React `#412`
   ("Connection closed") means the RSC stream ended with rows pending, which is what a blocked
   bootstrap looks like from the inside.
4. **A render-mode change** — someone added `force-dynamic`/ISR/`generateStaticParams` and moved a
   route between the two regimes (see STANDARDS: render mode is a cross-agent contract).

## Failure modes of this tool — read before quoting it

- **A redirected route proves nothing about itself.** `/account → /login` measures `/login`. The
  table says `redirected → …`; re-run those with a session cookie before calling them covered.
- **`fibers` is a count over the first 4,000 DOM nodes**, so a huge page reports a floor, not a
  total. `hydrated` is `fibers > 0 || containers > 0` — the count is evidence, not a threshold.
- **Green means *hydrated*, not *working*.** A hydrated page can still have a broken flow. This
  replaces nothing in `browser-qa` / `qa-verifier`; it removes the one failure that makes all of
  their other evidence meaningless.
- **`prerendered` vs `dynamic` is read from `x-nextjs-prerender` / `x-vercel-cache`.** Off-Vercel it
  degrades to `unknown` and the column is not evidence.
- It drives real Chrome, so it needs a reachable deployment. Behind Vercel deployment protection,
  pass a bypass cookie or run against a preview with protection off.

## Copy-paste probe (when you cannot run the script)

In devtools, the Browser pane, or `Runtime.evaluate` — same criterion, one route:

```js
(() => { let f = 0; for (const el of document.querySelectorAll("*"))
  if (Object.keys(el).some(k => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"))) f++;
  return { fibers: f, hydrated: f > 0 }; })()
```

Run it on **every** route, and run it once against a deliberately broken load (devtools → Settings →
Debugger → *Disable JavaScript*, reload) to confirm it returns `0` before you trust a non-zero.

## Where it sits in the gate

`design-auditor` and `qa-verifier` run it **first**, before any other browser evidence is collected —
because on a dead page every other observation is about server HTML. Re-run it after any change to
CSP, security headers, middleware, or a route's render mode. Wire it into post-deploy checks
alongside `canary-watch`.
