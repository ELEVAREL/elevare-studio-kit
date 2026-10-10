# The grader brief: how the conductor briefs a fresh agent to grade a lane it did not build

**Harvested 2026-10-01** from the wave 6 part 2 conductor of `D:\elevare-app` (delivery-lead,
2026-09-30 to 10-01). It spawned 42 agents: 22 gates or grades, and 3 fact-checks of its own
text. The template below is generalised from three briefs read in the conductor's transcript (the
store-shots tooling grade, the L2 database grade, the build-24 S3/L3 grade). The rulings are
committed as `docs/gates/wave-6/grade-*.md` (13 files at `6ff5617`, every one carrying at least
one `claims:` line).

## When to reach for it

Every time a conductor hands finished lane work to a gate: a code grade, a security grade, a
fresh re-grade after a FIX round, a seam pass, a fact-check of the conductor's own edits. The
template is the same for all of them; only the questions change.

## Why it works (the evidence from this wave)

- **The brief's own premises got overturned, and that was counted as success.** The store-shots
  brief relayed the lane's claim that the shooter fails a frame on a blank glyph. The grader proved
  that check could not fail (it counted the svg's children, and the wrapper `<g>` is always one) and
  that the stand-in provenance was recorded but never enforced. Verdict FIX, fixed, round 2 SHIP
  with each fix broken one rule at a time. The L2 database grade overturned a `price_cents` claim
  against the live schema.
- **The grader was told what NOT to run.** The screenshots were already in App Store Connect, so
  the brief forbade running the renderer, Metro or Chrome and touching `docs/store/**`. The grader
  graded by static reading, by running the pure scripts, and by extracting the move-into-place
  block and exercising it against a scratch output root. The shipped PNGs' sha256 were unchanged.
- **Every ruling ends in a countable `claims:` line** with relayed items listed separately, so the
  conductor knows which parts of a SHIP rest on the grader's eyes and which on the lane's word.

## The template

Fill the brackets; delete nothing structural. Keep it under about 3,500 characters; the questions
carry the length, not the rules.

```text
You are a fresh grader (you built none of this) for <lane / change> in <repo>, branch <branch>,
head <sha>. Write your grade to <repo>/docs/gates/<wave>/grade-<name>.md (that file only).

FORBIDDEN: never stage, commit, stash, checkout, restore or reset. Do NOT run <the thing whose run
would change a shipped artifact or a live system, by name>. Do not modify anything under <paths>.
<Live system rules, e.g.: you may READ project <ref> with select only, or DDL inside
begin; ... rollback; and never apply or leave a change.> <Load rules, e.g.: do not run the whole
suite; run the named files with node --test <file>.>

READ FIRST: <the contract file and section that binds this lane>. Skills:
<%USERPROFILE%\.claude\skills\{calibrated-check,claims-ledger-sweep,<domain skills>}\SKILL.md>.

FILES (the lane's descriptions are Tier 3; verify them): <exact paths, and how to see the change:
git diff -- <path>, or "untracked, read them">.

PREMISES (source, tier, owning lane):
- <claim> : <who said it>, Tier <1 read live / 2 committed doc / 3 relayed>, <lane>.
- <the numbers the lane reported, e.g. "65 assertions, 15 of 15 controls fire">: Tier 3, reproduce them.

QUESTIONS (answer each with evidence: file:line, a command and its output, or a probe):
1. <Containment / blast radius: can this reach production? A leak is a BLOCKER.>
2. <Each claimed check: find the branch that throws or marks the failure, and say whether it can
   actually fail. Break it yourself in a scratch copy and show it go red, then restore.>
3. <Exhaustive sweeps: run it, print the COUNT, compare both directions (found vs mapped).>
4. <Live premises: read the live system for every fact the change depends on.>
5. <Names and secrets: grep for the five active client names and secret shapes, print counts,
   calibrated on a scratch copy with planted hits.>
6. <Gates: typecheck exit 0 AND show it can fail; dash gate Tier 1 = 0 with its control.>
HUNT FOR: <the failure classes this domain has produced before, named specifically>.

If the evidence contradicts this brief or the lane's claims, stop and bring the evidence; that is a
successful outcome. The owner is away and has given full authority: do not come back with
questions; make the call and say what you chose. Run calibrated-check before calling anything
green. End with SHIP or FIX, numbered findings (severity, file:line evidence, suggested fix
labelled hypothesis), a "Relayed, not verified" list, and:
claims: <n> verified (how) · <n> relayed
```

## Rules the template encodes, and why each is there

1. **"You built none of this."** Self-review shares the author's blind spots; the grade is only
   worth something from a different agent. A re-grade after a FIX round goes to the SAME grader
   ("Round 2, same grader, same rules") so it can diff against the bytes it already judged.
2. **One output file, named.** The grade is a committed artifact the next session can read; the
   path is fixed so parallel graders never collide.
3. **Forbidden actions by name.** Name the destructive or irreversible run specifically (the
   renderer that would overwrite uploaded frames, an `apply_migration`, a deploy). A generic "be
   careful" protects nothing.
4. **Premises with source and tier.** Everything the lane said is Tier 3 until the grader reads it
   from the code or the live system. Writing the tier into the brief stops the conductor's
   paraphrase from arriving as fact (claim-reality-audit).
5. **Questions, not "review this".** Each question names the evidence that answers it. "Can this
   check actually fail" is asked of every check by name, because a check that cannot fail is the
   most common false green in this studio.
6. **"Break it yourself."** The grader reproduces the lane's negative control in a scratch copy
   (never by editing the repo in place; if it must, it restores byte for byte and prints the hash
   before and after) and confirms `git status --porcelain` matches the starting state.
7. **Contradiction is success.** Without this line a grader that finds the brief wrong tends to
   grade around it. With it, the store-shots grader opened its ruling with "The brief is
   contradicted on one point".
8. **No questions back; make the call and say which.** The owner was away with full authority;
   a grader that returns a question stalls the wave.
9. **The `claims:` line, with relayed items separate.** It makes a SHIP auditable: the conductor
   can see that, for example, "the PNGs in App Store Connect equal the local files" was relayed and
   not read.

## Adapt

- For a taste gate (art-director), replace the code questions with the artifact it must SEE (render
  target named: device build, simulator, web export, deployed), the widths and themes, and real data
  volumes; a taste gate that could not reach the artifact reports BLOCKED, not a pass.
- For a seam pass, the questions are the Breaks / invalidates declarations of every lane diffed
  against each other, the claims ledger, and one real round trip per seam.
- For a fact-check of the conductor's own edits (this wave ran three), the files are the
  conductor's diff and every sentence with a number or a state word is a premise.

## Related

[`parallel-fix-wave.md`](parallel-fix-wave.md), [`canonical-contract-reconciliation.md`](canonical-contract-reconciliation.md)
(the contract the brief points at), [`../offline-native-app/readonly-multigate-audit.md`](../offline-native-app/readonly-multigate-audit.md),
[`../verification/unfalsifiable-claim-discipline.md`](../verification/unfalsifiable-claim-discipline.md),
skills `calibrated-check`, `claim-reality-audit`, `claims-ledger-sweep`.
