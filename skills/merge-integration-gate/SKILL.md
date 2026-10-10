---
name: merge-integration-gate
description: You merged branches, cherry-picked commits, rebased a stack, or integrated parallel-lane/worktree work, and git reported no conflict — or a conflict list you resolved. Run this BEFORE you push, tag, deploy or open the PR. Proves two things nothing else checks: (1) that the merge did not SILENTLY DELETE files git never asked you about, which happens whenever one side deleted a path and the other never re-touched it after the branch point; and (2) that typecheck, tests and the production build were run on THE MERGE RESULT AS GIT HOLDS IT, not on your working copy. A conflict-free merge, a green local build, a passing suite and a clean `git status` are all true of a tree that compiles nowhere. Use after any merge into a branch that previously reverted work, after any wave of parallel agents, and any time a local build passes but CI/Vercel fails on a missing module or export.
origin: Elevare Studio — forged from the Whyza wave2-3 merge (2026-09-06) and the elevare-studio mixed-revision deploys (2026-08-04)
owners: delivery-lead, code-quality-engineer, launch-engineer, devops-engineer
---

# Merge integration gate — verify the result, not the branches

## The failure this exists to catch

The studio verifies lanes, and it verifies gates. **Nothing verified the integration step itself** —
the one place where a tree appears that never existed on either side.

**Whyza, 2026-09-06.** `wave2-3-wip` merged into `main`. Git reported 17 modify/delete conflicts,
all resolvable, and **silently dropped 13 further files**. `main` had deleted them weeks earlier
when a botched `git add -A` was reverted; the finished lanes never re-touched them, so git saw the
deletion as the *only* change to those paths and took it — no conflict, no warning, no prompt.
Every file importing them survived. The merge result compiled nowhere:

| Signal | What it said about the broken merge |
|---|---|
| `git merge` exit status | success, after the 17 conflicts were resolved |
| `git status` on the merge | clean |
| The conflict list | never mentioned the 13 |
| A local `npm run build` | passes — it builds the **working copy**, which still had the files on disk |
| `tsc --noEmit` **on the merge tree** | 106 errors, **85 of them `TS2307 Cannot find module`** naming the dropped paths |

**elevare-studio, 2026-08-04** is the same defect from the other direction: a background agent was
mid-refactor, so git held files from two revisions of one feature. `npm run build` passed locally
and two Vercel deploys failed with `planImageAction not found`. **Local builds the working copy;
CI builds git.** A green local build is not evidence about the commit you are pushing.

> **The rule.** An integration produces a *new artifact*. Verify the artifact. Neither branch's
> green, nor the absence of conflicts, nor your working copy is evidence about it.

## Not this skill

PLAYBOOK **§4b** already owns the rest of the wave barrier and this skill does not restate it: the
Breaks/invalidates seam diff, the called-vs-defined external-symbol sweep (`supabase.rpc("x")` with
no migration), the data-path consumer count, the walk-the-path barrier, the claims ledger. Run §4b
for *what the lanes did to each other*. Run this for *what the merge did to the tree*. Both.

## Run it

```bash
bash D:/.claude/skills/merge-integration-gate/scripts/merge-gate.sh -C <repo> [--rev <merge-commit>]
```

Read-only: `ls-tree`, `ls-files`, `grep` only. Nothing is checked out, staged, stashed or written,
so it is safe against a repo another agent is working in. `--rev` defaults to `HEAD`; `--against`
defaults to every parent of `--rev` (both sides of a merge, symmetric and free). On a non-merge
commit pass `--against <the ref you integrated>` — otherwise check A just lists that commit's own
deletions, and it says so.

### A. Tree drop — what the merge deleted without asking

```bash
comm -23 <(git ls-tree -r --name-only <branch> | sort) <(git ls-tree -r --name-only HEAD | sort)
```

Every path listed was in the branch and is not in the result. **This is a review list, not an
automatic red** — a legitimate rename or an intended deletion lands here too. The bar is: for each
path you either **name it as a deletion you meant**, or you restore it:

```bash
git checkout <branch> -- <paths>
```

Calibration, run on the repo where it happened (`D:\whyza`):
`--rev dfa7e1b` → **13 paths**, exactly the incident's file list (`src/lib/posts/envelope.ts`,
`cursor.ts`, `src/lib/social/source.ts`, `src/lib/feed/reason.ts`, `src/lib/groups/slug.ts`,
three `components/composer/*`, two `components/discover/*`, two `components/feed/*`,
`components/groups/types.ts`). The same check on the repaired `HEAD` against `wave2-3-wip` →
**0 paths**. Red on the defect, silent on the fix.

### B. Git-vs-disk — files your build resolves and git does not have

Untracked source that **tracked code imports**. This is the 2026-08-04 mechanism, and it is a
property of the working copy, not of `--rev`. Matched by real import specifier (alias path or
same-directory relative), never by basename.

Run 2026-09-06 against `D:\whyza`: 21 untracked files under `src`/`tests`, **5 flagged, 0 false
positives** — `src/app/you/page.tsx` and `src/app/discover/page.tsx` (both tracked) import
`components/settings/{Rows,DeletionBanner,queries,settings.module.css}` and
`components/discover/discover.css`, none of which git holds. A push in that state breaks CI while
the local build stays green. Same script on `D:\elevare-studio`: 0 untracked, silent.

### C. Run the checks ON THE MERGE RESULT

This is the half that cannot be automated away, and the half that was skipped both times.

```bash
# clean repo — a detached worktree is the honest artifact
git worktree add --detach /tmp/mg <merge-sha> && cd /tmp/mg

# repo shared with another agent, or a dirty tree: archive instead (writes nothing under .git)
git -C <repo> archive --format=tar -o /tmp/mg.tar <merge-sha> src tests tsconfig.json package.json
mkdir -p /tmp/mg && (cd /tmp/mg && tar -xf /tmp/mg.tar)

# then, IN THAT TREE — not in the repo you were working in:
npm run typecheck && npm test && npm run build
```

Node deps: junction/symlink `node_modules` in rather than installing
(`New-Item -ItemType Junction -Path <tree>\node_modules -Target <repo>\node_modules`), and add the
generated `next-env.d.ts` if the framework needs one — it is gitignored, so the archive lacks it.

**Measured both ways on this machine**, `D:\whyza`, archived source trees + junctioned
`node_modules`, `tsc --noEmit`:

| Tree | Result |
|---|---|
| `dfa7e1b` — the merge as pushed | exit 2 · **106 errors**, 85 × `TS2307` naming the 13 dropped modules |
| `a63be9d` — "Restore thirteen files the merge dropped without saying so" | exit 0 · **0 errors** |

The typecheck is the cheap one and it caught this. Tests and the production build go in the same
tree for the failures a typecheck cannot see (a missing asset, a runtime-only import, an env-gated
route). *Only the typecheck half of C has been executed here; tests/build on a merge tree are
prescribed from the two incidents, not measured.*

## Traps

- **A conflict list is not a change list.** The 13 were never in it. Diff the trees.
- **Do not `git worktree add` inside a repo another agent holds** — it writes `.git/worktrees`.
  Use `git archive`, which touches nothing.
- **Windows: Git-Bash mangles path-looking grep patterns.** Measured here —
  `git grep -F "@/app/components/discover/discover.css"` returned rc=1 while the same pattern
  minus `@/` matched the line. The script exports `MSYS2_ARG_CONV_EXCL='*'`. A silent zero-hit
  measuring tool is worse than no tool (WAVES: *"your measuring tool is as likely to be wrong as
  the page"*).
- **Cherry-picks and rebases have the same hole**, without a second parent to diff against. Pass
  `--against <source-branch>` explicitly.
- **Repos that previously reverted work are the high-risk class.** A revert is a deletion with a
  long fuse: it only detonates at the next merge from a branch that predates it.

## Report line

State the result where the next person can see its absence, per PLAYBOOK's declaration rule:

```
merge-gate: A <n> dropped (<named intended> / <restored>) · B <n> untracked-but-imported ·
            C typecheck|tests|build on <sha> in a clean tree: pass/fail  [or SKIPPED + reason]
```

Related memories: `a-clean-merge-is-not-a-green-one`, `concurrent-agent-commit-race`,
`verify-the-artifact-not-the-switch`.
