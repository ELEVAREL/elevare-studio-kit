---
name: skill-stocktake
description: "Use when auditing Claude skills and commands for quality AND for reachability — whether an installed skill is actually routed to any agent, named in the skills map, or orphaned/unrouted/inert. Supports Quick Scan (changed skills only) and Full Stocktake modes with sequential subagent batch evaluation."
origin: ECC
---

# skill-stocktake

Slash command (`/skill-stocktake`) that audits all Claude skills and commands using a quality checklist + AI holistic judgment. Supports two modes: Quick Scan for recently changed skills, and Full Stocktake for a complete review.

## Scope

The command targets the following paths **relative to the directory where it is invoked**:

| Path | Description |
|------|-------------|
| `~/.claude/skills/` | Global skills (all projects) |
| `{cwd}/.claude/skills/` | Project-level skills (if the directory exists) |

**At the start of Phase 1, the command explicitly lists which paths were found and scanned.**

### Targeting a specific project

To include project-level skills, run from that project's root directory:

```bash
cd ~/path/to/my-project
/skill-stocktake
```

If the project has no `.claude/skills/` directory, only global skills and commands are evaluated.

## Phase 0 — Reachability (run before any quality work)

The checklist below grades how **good** a skill is. It never asks the cheaper question:
**can anyone reach it?** A skill that no routing map and no agent definition names is
installed and inert to every conductor that routes by the map — the same defect as a
deliberate non-install, seen from the other side, and it costs one script to find.

```bash
bash D:/.claude/skills/skill-stocktake/scripts/routing-check.sh \
     [SKILLS_ROOT] [AGENTS_DIR] [MAP_FILE]
# defaults: D:/.claude/skills  D:/.claude/agents  <AGENTS_DIR>/SKILLS-MAP.md
```

**Run it from the skill directory you are actually reading, not from `~`.** Verified
2026-09-06: this machine has *two* divergent skill roots — `D:/.claude/skills` (204
skills, the studio library the map indexes) and `~/.claude/skills` (192
skills, an older copy whose `skill-stocktake/SKILL.md` is a different file). A `~`-rooted
path silently audits the wrong library and undercounts. Pass `SKILLS_ROOT` explicitly
whenever more than one root exists; the same applies to the `~` paths in the flows below.

Output is `STATUS<TAB>skill<TAB>evidence`, in three tiers:

| Status | Meaning | What to do |
|--------|---------|-----------|
| `MAP-MISSING` | An agent definition (or STANDARDS/PLAYBOOK/CRAFT/README) names it, but the routing map does not | Add a map line. Conductors that route by the map cannot see it. |
| `TRANSIENT-ONLY` | Named **only** in HANDOFF / STATE / a dated session note | Promote to the map or an agent file. Those files get rewritten and the mention evaporates. |
| `UNREACHABLE` | Named nowhere under the agents dir | Route it, or Retire it. An unroutable install is library bloat by definition. |

If there is no map file, the script says so and reports agent-definition reachability
only — it does not invent a green. Feed each finding into the Phase 2 verdicts:
unreachable **and** weak → `Retire`; unreachable but genuinely good → `Improve`
("write the routing line"). Run this in **both** modes — Quick Scan included, because
routing rots when *other* files change, not when the skill does, so an mtime diff will
never surface it.

### What this check does NOT prove

- **Unrouted ≠ uninvocable.** Claude Code auto-discovers every skill in the skills root
  and can invoke it from its `description` alone. `UNREACHABLE` means *no human or agent
  document routes it*, not *the harness cannot load it*. Do not report it as "dead".
- **Being named ≠ being routed.** Matching is token-level, so a skill whose name is a
  common English word can pass on prose. Measured here 2026-09-06: `run` occurs 256×,
  `benchmark` 16×, `impeccable` 7×, `ck` exactly 1× (a genuine route line). For any
  finding-adjacent name shorter than ~10 chars, open the matching line before believing
  the green.
- **A clean run is only as real as `MAP_FILE`.** Point the script at an empty or renamed
  map and every skill silently becomes "unrouted"; conversely a stale map that still
  lists deleted skills reports nothing wrong. The script prints a WARNING when zero
  skills are missing from the map, because on a library of any size that is more likely
  a bad path than a perfect map.

### Worked example (this machine, 2026-09-06)

Full run over 204 skills / 256 markdown files returned 9 findings in 6.8s warm
(~2 min cold — cold disk, not CPU; give it a generous timeout on a first run):

```
MAP-MISSING     calibrated-check          STANDARDS.md,delivery-lead.md,security-reviewer.md
MAP-MISSING     claim-reality-audit       STANDARDS.md,delivery-lead.md
MAP-MISSING     credential-drift          STANDARDS.md
TRANSIENT-ONLY  fleet-scheduled-failover  HANDOFF.md
UNREACHABLE     outcome-integrity-sweep   named in no map, agent definition or note
UNREACHABLE     project-guidelines-example ...
```

`fleet-scheduled-failover` is the instructive one: a real 110-line skill whose only
mention in the entire agents tree was HANDOFF.md, the file that gets rewritten at the
end of every session. Two of the `UNREACHABLE` entries were installed by a concurrent
session *while this run was in progress* — which is the point. Routing drift is
produced by writers who are not you.

**Controls, both run 2026-09-06.** A planted directory `zz-planted-unrouted` alongside
five known-routed skills produced exactly one `UNREACHABLE` line and left the other five
silent. The same root pointed at an empty map file turned all six red. The check can
fire, and it is not green by construction.

## Modes

| Mode | Trigger | Duration |
|------|---------|---------|
| Quick Scan | `results.json` exists (default) | 5–10 min |
| Full Stocktake | `results.json` absent, or `/skill-stocktake full` | 20–30 min |

**Results cache:** `~/.claude/skills/skill-stocktake/results.json`

## Quick Scan Flow

Re-evaluate only skills that have changed since the last run (5–10 min).

0. Run Phase 0 (`routing-check.sh`) **unconditionally** — routing changes when other
   files change, so it is never covered by the mtime diff
1. Read `~/.claude/skills/skill-stocktake/results.json`
2. Run: `bash ~/.claude/skills/skill-stocktake/scripts/quick-diff.sh \
         ~/.claude/skills/skill-stocktake/results.json`
   (Project dir is auto-detected from `$PWD/.claude/skills`; pass it explicitly only if needed)
3. If output is `[]`: report "No content changes since last run", still report the Phase 0
   routing findings, then stop
4. Re-evaluate only those changed files using the same Phase 2 criteria
5. Carry forward unchanged skills from previous results
6. Output only the diff
7. Run: `bash ~/.claude/skills/skill-stocktake/scripts/save-results.sh \
         ~/.claude/skills/skill-stocktake/results.json <<< "$EVAL_RESULTS"`

## Full Stocktake Flow

### Phase 1 — Inventory

Run: `bash ~/.claude/skills/skill-stocktake/scripts/scan.sh`

The script enumerates skill files, extracts frontmatter, and collects UTC mtimes.
Project dir is auto-detected from `$PWD/.claude/skills`; pass it explicitly only if needed.
Present the scan summary and inventory table from the script output:

```
Scanning:
  ✓ ~/.claude/skills/         (17 files)
  ✗ {cwd}/.claude/skills/    (not found — global skills only)
```

| Skill | 7d use | 30d use | Description |
|-------|--------|---------|-------------|

### Phase 2 — Quality Evaluation

Launch an Agent tool subagent (**general-purpose agent**) with the full inventory and checklist:

```text
Agent(
  subagent_type="general-purpose",
  prompt="
Evaluate the following skill inventory against the checklist.

[INVENTORY]

[CHECKLIST]

Return JSON for each skill:
{ \"verdict\": \"Keep\"|\"Improve\"|\"Update\"|\"Retire\"|\"Merge into [X]\", \"reason\": \"...\" }
"
)
```

The subagent reads each skill, applies the checklist, and returns per-skill JSON:

`{ "verdict": "Keep"|"Improve"|"Update"|"Retire"|"Merge into [X]", "reason": "..." }`

**Chunk guidance:** Process ~20 skills per subagent invocation to keep context manageable. Save intermediate results to `results.json` (`status: "in_progress"`) after each chunk.

After all skills are evaluated: set `status: "completed"`, proceed to Phase 3.

**Resume detection:** If `status: "in_progress"` is found on startup, resume from the first unevaluated skill.

Each skill is evaluated against this checklist:

```
- [ ] Content overlap with other skills checked
- [ ] Overlap with MEMORY.md / CLAUDE.md checked
- [ ] Freshness of technical references verified (use WebSearch if tool names / CLI flags / APIs are present)
- [ ] Usage frequency considered
- [ ] Reachable: Phase 0 status is not MAP-MISSING / TRANSIENT-ONLY / UNREACHABLE
```

Carry the Phase 0 status into the `reason` field for any non-routed skill, e.g.
`"UNREACHABLE — no map line, no agent names it; content is sound, so Improve = write the routing line, not Retire."`

Verdict criteria:

| Verdict | Meaning |
|---------|---------|
| Keep | Useful and current |
| Improve | Worth keeping, but specific improvements needed |
| Update | Referenced technology is outdated (verify with WebSearch) |
| Retire | Low quality, stale, or cost-asymmetric |
| Merge into [X] | Substantial overlap with another skill; name the merge target |

Evaluation is **holistic AI judgment** — not a numeric rubric. Guiding dimensions:
- **Actionability**: code examples, commands, or steps that let you act immediately
- **Scope fit**: name, trigger, and content are aligned; not too broad or narrow
- **Uniqueness**: value not replaceable by MEMORY.md / CLAUDE.md / another skill
- **Currency**: technical references work in the current environment

**Reason quality requirements** — the `reason` field must be self-contained and decision-enabling:
- Do NOT write "unchanged" alone — always restate the core evidence
- For **Retire**: state (1) what specific defect was found, (2) what covers the same need instead
  - Bad: `"Superseded"`
  - Good: `"disable-model-invocation: true already set; superseded by continuous-learning-v2 which covers all the same patterns plus confidence scoring. No unique content remains."`
- For **Merge**: name the target and describe what content to integrate
  - Bad: `"Overlaps with X"`
  - Good: `"42-line thin content; Step 4 of chatlog-to-article already covers the same workflow. Integrate the 'article angle' tip as a note in that skill."`
- For **Improve**: describe the specific change needed (what section, what action, target size if relevant)
  - Bad: `"Too long"`
  - Good: `"276 lines; Section 'Framework Comparison' (L80–140) duplicates ai-era-architecture-principles; delete it to reach ~150 lines."`
- For **Keep** (mtime-only change in Quick Scan): restate the original verdict rationale, do not write "unchanged"
  - Bad: `"Unchanged"`
  - Good: `"mtime updated but content unchanged. Unique Python reference explicitly imported by rules/python/; no overlap found."`

### Phase 3 — Summary Table

| Skill | 7d use | Routing | Verdict | Reason |
|-------|--------|---------|---------|--------|

`Routing` is the Phase 0 status (`routed` / `MAP-MISSING` / `TRANSIENT-ONLY` / `UNREACHABLE`).

### Phase 4 — Consolidation

1. **Retire / Merge**: present detailed justification per file before confirming with user:
   - What specific problem was found (overlap, staleness, broken references, etc.)
   - What alternative covers the same functionality (for Retire: which existing skill/rule; for Merge: the target file and what content to integrate)
   - Impact of removal (any dependent skills, MEMORY.md references, or workflows affected)
2. **Improve**: present specific improvement suggestions with rationale:
   - What to change and why (e.g., "trim 430→200 lines because sections X/Y duplicate python-patterns")
   - User decides whether to act
3. **Update**: present updated content with sources checked
4. **Route**: for each Phase 0 finding kept rather than retired, propose the exact one-line
   map entry (skill name → owning agents → what it routes to) and the agent files that
   should reference it. Proposing the line is in scope; **editing a shared routing map or
   an agent definition is not** — hand the lines to whoever owns those files.
5. Check MEMORY.md line count; propose compression if >100 lines

## Results File Schema

`~/.claude/skills/skill-stocktake/results.json`:

**`evaluated_at`**: Must be set to the actual UTC time of evaluation completion.
Obtain via Bash: `date -u +%Y-%m-%dT%H:%M:%SZ`. Never use a date-only approximation like `T00:00:00Z`.

```json
{
  "evaluated_at": "2026-02-21T10:00:00Z",
  "mode": "full",
  "batch_progress": {
    "total": 80,
    "evaluated": 80,
    "status": "completed"
  },
  "skills": {
    "skill-name": {
      "path": "~/.claude/skills/skill-name/SKILL.md",
      "verdict": "Keep",
      "reason": "Concrete, actionable, unique value for X workflow",
      "routing": "routed",
      "mtime": "2026-01-15T08:30:00Z"
    }
  }
}
```

## Notes

- Evaluation is blind: the same checklist applies to all skills regardless of origin (ECC, self-authored, auto-extracted)
- Archive / delete operations always require explicit user confirmation
- No verdict branching by skill origin
- `routing` is additive and optional: absent means Phase 0 was not run for that entry, which
  is not the same as `"routed"`. Never default it to `"routed"`.
- Phase 0 is read-only. It reports; it never edits the map, an agent file, or another skill.
