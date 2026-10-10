#!/usr/bin/env bash
# routing-check.sh — reachability audit for an installed skill library.
#
# Answers the question the quality checklist never asks: is this skill
# REACHABLE? A skill that no routing map and no agent definition names is
# installed and invisible to any conductor that routes by the map.
#
# Usage:
#   routing-check.sh [SKILLS_ROOT] [AGENTS_DIR] [MAP_FILE]
# Defaults (Elevare Studio):
#   SKILLS_ROOT=D:/.claude/skills  AGENTS_DIR=D:/.claude/agents
#   MAP_FILE=$AGENTS_DIR/SKILLS-MAP.md
#
# Output: one TAB-separated line per finding —
#   STATUS<TAB>skill-name<TAB>evidence
# STATUS is MAP-MISSING | TRANSIENT-ONLY | UNREACHABLE.
# ROUTED skills are counted in the summary and not listed.
# Always exits 0. Advisory, never a build gate.
#
# PERFORMANCE — do not "simplify" this back into the obvious loop:
#   for s in */; do grep -rq "$s" "$AGENTS_DIR" || echo UNROUTED; done
# One recursive grep per skill. Measured here (Windows/Git Bash, 202 skills,
# 256 markdown files): exceeded a 120s timeout twice. A per-file `head`
# frontmatter loop blew the same budget. Every bulk step below is ONE
# process over MANY files (find / awk / grep -l / grep -oh); only the
# handful of actual findings get a per-name grep for attribution.
# Measured 2026-09-06 on this machine: full run 6.8s warm, ~2m8s on a cold
# disk cache (I/O, not CPU). The per-skill recursive loop never completed
# at all — it hit a 120s timeout twice. Correctness was established instead
# against a completed per-name strict-regex pass over the same corpus:
# token-set output was identical to it, name for name.

set -uo pipefail

SKILLS_ROOT="${1:-D:/.claude/skills}"
AGENTS_DIR="${2:-D:/.claude/agents}"
MAP_FILE="${3:-$AGENTS_DIR/SKILLS-MAP.md}"

[ -d "$SKILLS_ROOT" ] || { echo "routing-check: skills root not found: $SKILLS_ROOT" >&2; exit 0; }
[ -d "$AGENTS_DIR" ]  || { echo "routing-check: SKIPPED — no agents dir at $AGENTS_DIR (nothing routes skills here)" >&2; exit 0; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# --- 1. skill names -------------------------------------------------------
( cd "$SKILLS_ROOT" && ls -1d */ 2>/dev/null | sed 's#/$##' ) | sort -u > "$TMP/names.txt"
TOTAL=$(wc -l < "$TMP/names.txt" | tr -d ' ')
[ "$TOTAL" -gt 0 ] || { echo "routing-check: no skill directories under $SKILLS_ROOT" >&2; exit 0; }

# --- 2. corpora (three tiers) --------------------------------------------
#   map       = the routing table itself
#   durable   = agent definitions (top-level *.md with a `name:` frontmatter
#               key in the first 8 lines) + house docs every agent obeys
#   transient = every other markdown under AGENTS_DIR — HANDOFF, STATE,
#               dated session notes. Being named ONLY here is a finding:
#               those files get rewritten and the mention evaporates.
find "$AGENTS_DIR" -name '*.md' -not -path '*/.git/*' | sort > "$TMP/allmd.txt"
grep -v -x -F "$MAP_FILE" "$TMP/allmd.txt" > "$TMP/nonmap.txt"

ls -1 "$AGENTS_DIR"/*.md 2>/dev/null | sort > "$TMP/toplevel.txt"
if [ -s "$TMP/toplevel.txt" ]; then
  awk 'FNR==1{seen[FILENAME]=0}
       FNR<=8 && /^name:[ \t]*[A-Za-z0-9_-]/ {seen[FILENAME]=1}
       END{for(f in seen) if(seen[f]) print f}' $(cat "$TMP/toplevel.txt") | sort > "$TMP/defs.txt"
else
  : > "$TMP/defs.txt"
fi
for h in STANDARDS.md PLAYBOOK.md README.md CRAFT.md; do
  [ -f "$AGENTS_DIR/$h" ] && echo "$AGENTS_DIR/$h" >> "$TMP/defs.txt"
done
sort -u "$TMP/defs.txt" -o "$TMP/defs.txt"
comm -12 "$TMP/nonmap.txt" "$TMP/defs.txt" > "$TMP/durable.txt"
comm -23 "$TMP/nonmap.txt" "$TMP/durable.txt" > "$TMP/transient.txt"

# Tokenise each corpus ONCE. A token is a maximal run of [A-Za-z0-9_-], so
# `benchmark` does not match inside `benchmark-suite`: a skill name counts
# as named only when it appears as a whole slug.
tok() { if [ -s "$1" ]; then grep -ohE '[A-Za-z0-9_-]+' $(cat "$1") 2>/dev/null | sort -u; fi; }
if [ -f "$MAP_FILE" ]; then
  grep -ohE '[A-Za-z0-9_-]+' "$MAP_FILE" | sort -u > "$TMP/tok_map.txt"; HAVE_MAP=1
else
  : > "$TMP/tok_map.txt"; HAVE_MAP=0
  echo "routing-check: no map at $MAP_FILE — reporting agent-definition reachability only" >&2
fi
tok "$TMP/durable.txt"   > "$TMP/tok_durable.txt"
tok "$TMP/transient.txt" > "$TMP/tok_transient.txt"

# --- 3. classify ----------------------------------------------------------
comm -23 "$TMP/names.txt"        "$TMP/tok_map.txt"       > "$TMP/miss_map.txt"
comm -23 "$TMP/miss_map.txt"     "$TMP/tok_durable.txt"   > "$TMP/miss_durable.txt"
comm -23 "$TMP/miss_durable.txt" "$TMP/tok_transient.txt" > "$TMP/unreachable.txt"

attribute() { # $1 = skill name, $2 = file-list path
  [ -s "$2" ] || { echo "?"; return; }
  grep -lE "(^|[^A-Za-z0-9_-])${1}([^A-Za-z0-9_-]|\$)" $(cat "$2") 2>/dev/null \
    | xargs -r -n1 basename | paste -sd, - | sed 's/^$/?/'
}

comm -23 "$TMP/miss_map.txt" "$TMP/miss_durable.txt" | while IFS= read -r n; do
  [ -n "$n" ] || continue
  printf 'MAP-MISSING\t%s\t%s\n' "$n" "$(attribute "$n" "$TMP/durable.txt")"
done

comm -23 "$TMP/miss_durable.txt" "$TMP/unreachable.txt" | while IFS= read -r n; do
  [ -n "$n" ] || continue
  printf 'TRANSIENT-ONLY\t%s\t%s\n' "$n" "$(attribute "$n" "$TMP/transient.txt")"
done

while IFS= read -r n; do
  [ -n "$n" ] || continue
  printf 'UNREACHABLE\t%s\t%s\n' "$n" "named in no map, agent definition or note"
done < "$TMP/unreachable.txt"

# --- 4. summary + anti-false-green self-check ----------------------------
MM=$(wc -l < "$TMP/miss_map.txt" | tr -d ' ')
UR=$(wc -l < "$TMP/unreachable.txt" | tr -d ' ')
ROUTED=$(( TOTAL - MM ))
echo "---"
echo "routing-check: $TOTAL skills | $ROUTED routed in map | $MM absent from map | $UR unreachable"
if [ "$HAVE_MAP" -eq 1 ] && [ "$MM" -eq 0 ]; then
  echo "routing-check: WARNING — zero misses. Confirm \$MAP_FILE is the real map and not an empty/renamed file before trusting this green."
fi
exit 0
