---
name: claims-ledger-sweep
description: "Find COMMENTS that assert a control living in another file — \"Pro-gated SERVER-SIDE\", \"sanitised upstream\", \"every layout renders <main>\", \"checked before this was written\" — with no file:line anyone can follow. A comment asserting a control IS a claim, and it is worse than a false UI claim because every reviewer reads it and moves on. Use at the ship gate, on any security/payment/legal/quota change, when writing a claims ledger (PLAYBOOK §4b), and after any wave where several agents wrote headers about each other's files."
origin: elevare
---

# claims-ledger-sweep

A comment that says a control exists **is a claim**, subject to claim–reality parity exactly like user-facing copy — and it is *worse* than false marketing copy, because it actively suppresses the review that would have caught the gap.

HausAI shipped eight of these in one run. In every case the comment is *why* the defect survived: each reader saw the assertion and moved on.

| The comment | The reality |
|---|---|
| `"Pro-gated SERVER-SIDE"` | no gate anywhere; a Free user took the paid artifact |
| `"no inline HTML (checked before this was written)"` | 16 internal drafting notes rendered on the LIVE privacy page, 10 on terms — one announcing the liability clause was unreviewed by counsel |
| `"there are no inline scripts on static pages"` | there were; the CSP killed hydration on 8 of 11 routes |
| `"position: fixed repeats per page"` | it printed once, on the last page |
| `"every layout renders <main id='main'>"` | none did; the skip link was dead on four routes |
| `"rejected 400 upstream"` (a `client_supplied_tier` guard) | documented on routes where it cannot fire |
| `/pricing` `"every number comes from the plan config"` | false for the metadata |
| the conductor's `"zero placeholders now render"` | 26 did |

**The rule this enforces** (STANDARDS, claim–reality parity): *if you assert a control exists in a file you do not own, cite `file:line` or do not write the sentence.* If it is in your own file, the control must be visible in that file or one it directly calls.

---

## Run it

```bash
node D:/.claude/skills/claims-ledger-sweep/scripts/sweep.mjs <repo>            # gate: critical+high
node .../sweep.mjs <repo> --min low                                            # full audit
node .../sweep.mjs <repo> --changed HEAD~1                                     # this wave only  ← routine use
node .../sweep.mjs <repo>/docs --docs --min low                                # retro notes, decision docs, gate reports
node .../sweep.mjs <repo> --json                                               # for a ledger table
node .../sweep.mjs <repo> --all                                                # also list what a citation discharged
```

No dependencies, Node 18+, read-only, always exits 0. `--changed` is the one to wire into a gate: a full first pass on a mature repo is a real piece of work, a per-wave pass is a handful of lines.

---

## What it flags, and why that is the only usable gate

The gate is **scope, not vocabulary**. Grepping for "validated" flags every comment in the repo and is ignored by its second run. A comment explaining the code directly beneath it is not something anyone needs to go verify. A comment asserting what some *other* file does is unverifiable by construction.

So a line is nominated only when it is **(1) an assertion** *and* **(2) about somewhere else** *and* **(3) uncited**:

**1 — an assertion.** Indicative forms only (`rejects`, `is gated`, `repeats`, `was checked`). A bare stem is an imperative — `"validate the input"` is an instruction, not a claim.

**2 — about somewhere else.** One of three shapes:

- `delegated` — the control is said to live elsewhere: *upstream, downstream, elsewhere, globally, gated **by** X, enforced **in** the middleware, already sanitised, server-side by, comes from `X`*.
- `universal` — a quantifier over a class of artifacts this file does not own: *every **layout**, all **routes**, no **component**, zero **placeholders**, per **page**, on static **pages**.* The noun list is deliberately narrow — `every block` / `all rows` is describing an algorithm, not the repo.
- `past-audit` — asserts a verification happened, names no artifact: *"(checked before this was written)"*, *"verified against the security gate"*, *"measured by hand"*.

**3 — uncited.**

| Evidence in the sentence | Discharges |
|---|---|
| `file.ts:142` | any scope. This is the STANDARDS bar. |
| a path or module — `src/lib/csp.ts`, `` `@/lib/plans` `` — or a doc pointer (`DECISIONS D3`, `§7.9`) | `delegated`, `past-audit` |
| a symbol declared/imported/called in this file | a *soft* delegation (`comes from \`amountUsd\``) — never a hard one (`rejected upstream`) |
| — | **nothing discharges a `universal` claim but `file:line`.** Naming one source does not prove the quantifier holds over every member of the set. |

**Explicitly not claims** (dropped, not ranked): obligations and instructions (*must / should / never add X / see Y*), hypotheticals (*will, would, could*), conditionals, historical corrections (*previously, no longer*), honest self-disclaimers (*"this is NOT an XSS control"* — the opposite of the defect class), `@param`/lint/licence boilerplate, and quantifiers the author explicitly scoped locally (*"every X in this file"*).

Identical claims restated across files collapse into one row with a site list — a house rule written into eight headers is one thing to verify, not eight.

**Ranked by blast radius.** Base severity from the path (auth / billing / stripe / consent / entitlement / quota / tier / security / CSP / middleware / RLS / migration / legal / privacy / `api/` → critical; `route.ts` / `server/` / `lib/` → high; tests and docs → low), +1 for a security-or-money verb, +1 for a hard elsewhere-marker.

---

## Then do the work

The sweep **nominates**; it cannot tell a true claim from a false one, only that nothing in the sentence lets you check. Resolve every row into a ledger and close it one of three ways:

| Claim | `file:line` that implements it | Verdict |
|---|---|---|
| "Pro-gated SERVER-SIDE" | *(none found)* | **BLOCKER** — the control does not exist |
| "every layout renders `<main id='main'>`" | `app/layout.tsx:82`, +3 others | rewrite the comment to cite them |
| "rejected 400 upstream" | `lib/server/http.ts:154` — but this route reads no body | **BLOCKER** — the guard cannot fire here |

1. **Go look.** Open the file the claim points at. A row with no implementing file is a blocker, not a nit — that is the `Pro-gated SERVER-SIDE` case exactly.
2. **If the claim is true, cite it** — `file:line`, in the comment. That permanently discharges the row and is one edit.
3. **If it is true but you cannot cite it, delete the enumeration.** Write the sentence without the "where" clause; a claim you can't point at should not be in the file at all.
4. **If it is false, fix the code — and sweep every surface that repeats it in the same change.** When a feature is descoped, the comments that document it are part of the descope.

Do not "fix" a row by softening the wording (*"is probably gated"*). A hedge is the same failure with deniability.

---

## Calibration (STANDARDS: calibrate a new gate before trusting it)

Run against the HausAI history — the tree that shipped the eight defects (`a7e4bab`, `dbdf2ce`) and the tree that fixed them (`c36055a`).

- **Recall 8/8.** Every one of the eight known-bad comments is nominated, including the conductor's own report line (`--docs`).
- **All four fixes clear.** `Pro-gated SERVER-SIDE`, `repeats per page`, `no inline scripts on static pages` and `rejected 400 upstream` are all silent in the fixed tree — the flag goes green exactly where the defect was fixed.
- **Precision 86%** on the `critical` bucket (49 rows labelled by hand, 7 false — mostly a comment quantifying over its own module's data).
- **Base rate is low.** 0–2 rows on ordinary studio repos (rootedbyel, precisionaim, GameNight), 115 in 30 732 comment blocks on asky-work (0.4%). HausAI runs 4.2% because its house style writes essay-length headers full of cross-file assertions — the tool is not firing indiscriminately, that codebase genuinely is claim-dense.

**Re-calibrate before trusting it on a new stack.** It reads `//`, `/* */`, `#` and `--` comments; JS/TS/CSS/SQL are well covered, Python/Go/Rust/Ruby less so.

### Known limits — state these, do not hide them
- It cannot tell a **true** claim from a false one. It finds claims you cannot check, which is a strictly smaller and much more mechanical thing.
- A claim that **cites a module but is still wrong** is discharged. `/pricing`'s "every number comes from `@/lib/plans`" survived here only because it is *also* universal; a purely delegated claim naming a real file passes.
- **Prose-heavy `--docs` mode is noisy** (~120 rows on 28 HausAI docs). Point it at the specific report or decision doc, not the whole folder.
- A one-line comment sitting on the line it describes is **not** exempt by position — only by scope. If it says "upstream", it gets flagged wherever it sits.

## Related
- **STANDARDS** → *Claim–reality parity*: the rule this mechanises, and the surface-enumeration rule above it.
- **PLAYBOOK §4b** → the claims ledger this feeds (claim → implementing `file:line` → verified reachable).
- `hydration-assertion`, `verification-loop`, `security-review` → what you run *after* a row turns out to be a blocker.
- Owners: **code-quality-engineer** and **security-reviewer** at the gate; **retrospective** when writing up a run; every agent writing a file header.
