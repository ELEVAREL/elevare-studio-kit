#!/usr/bin/env bash
# merge-gate.sh — detect files an integration step dropped, and files git does not hold.
#
# Two checks, both READ-ONLY on the repo (ls-tree / ls-files / grep only — nothing is
# written, checked out, staged or stashed, so it is safe to run against a repo another
# agent is working in).
#
#   A. TREE DROP    every path present in a merged-in ref and ABSENT from the merge result.
#                   git reports no conflict for these when one side deleted the file and the
#                   other never re-touched it after the branch point.
#   B. GIT-vs-DISK  source files that exist on disk, are NOT tracked by git, and are
#                   REFERENCED BY TRACKED CODE. A local build passes on these; a build of
#                   what git holds (Vercel, CI, a fresh clone) cannot resolve them.
#
# Usage:
#   bash merge-gate.sh [-C <repo>] [--rev <commit>] [--against <ref>]... [--src <dir>]...
#
#   -C <repo>       repo root (default: cwd)
#   --rev <commit>  the integration result to judge (default: HEAD)
#   --against <ref> a ref that was merged in; repeatable.
#                   Default: every parent of --rev. On a non-merge commit pass this
#                   explicitly — otherwise check A just lists that commit's own deletions.
#   --src <dir>     source dir for check B; repeatable. Default: any of
#                   src tests app lib packages apps that exist at --rev.
#
# Exit 0 = nothing found. Exit 1 = findings (review each; see SKILL.md — a listed path is
# either a DELETION YOU NAMED, or work the integration lost). Exit 2 = bad usage.

set -uo pipefail

# Git-Bash/MSYS rewrites arguments that look like POSIX paths. A grep pattern such as
# "@/app/components/x" is silently mangled and matches NOTHING — measured on this machine:
# `git grep -F "@/app/components/discover/discover.css"` returned rc=1 while the identical
# pattern minus the "@/" matched. Disable the conversion for this process.
export MSYS2_ARG_CONV_EXCL='*'

REPO="."; REV="HEAD"; AGAINST=(); SRCS=(); ALIAS="@/"; ALIAS_DIR="src"
while [ $# -gt 0 ]; do
  case "$1" in
    -C) REPO="$2"; shift 2 ;;
    --rev) REV="$2"; shift 2 ;;
    --against) AGAINST+=("$2"); shift 2 ;;
    --src) SRCS+=("$2"); shift 2 ;;
    --alias) ALIAS="$2"; shift 2 ;;       # import prefix, e.g. "@/"  (tsconfig paths)
    --alias-dir) ALIAS_DIR="$2"; shift 2 ;;  # dir it maps to, e.g. "src"
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "merge-gate: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 || { echo "merge-gate: '$REPO' is not a git repo" >&2; exit 2; }
git -C "$REPO" rev-parse --verify --quiet "$REV^{commit}" >/dev/null || { echo "merge-gate: no such commit '$REV'" >&2; exit 2; }

g() { git -C "$REPO" "$@"; }

SHA=$(g rev-parse --short "$REV")
SUBJ=$(g log -1 --format=%s "$REV")
echo "merge-gate  repo=$REPO  rev=$SHA  \"$SUBJ\""

if [ ${#AGAINST[@]} -eq 0 ]; then
  # every parent; on a merge this is both sides, on a normal commit it is just the predecessor
  while read -r p; do [ -n "$p" ] && AGAINST+=("$p"); done < <(g rev-parse "$REV^@" 2>/dev/null)
  NPAR=${#AGAINST[@]}
  echo "  --against defaulted to the $NPAR parent(s) of $SHA"
  [ "$NPAR" -lt 2 ] && echo "  NOTE: $SHA is not a merge commit. Check A below is listing its own deletions;" \
                    && echo "        pass --against <the ref you integrated> to judge an integration."
fi

FINDINGS=0

echo
echo "== A. TREE DROP — present in the ref, absent from $SHA =="
for ref in "${AGAINST[@]}"; do
  rsha=$(g rev-parse --short "$ref" 2>/dev/null) || { echo "  ! cannot resolve ref '$ref'"; FINDINGS=1; continue; }
  dropped=$(comm -23 <(g ls-tree -r --name-only "$ref" | sort) <(g ls-tree -r --name-only "$REV" | sort))
  n=$(printf '%s' "$dropped" | grep -c . || true)
  if [ "$n" -eq 0 ]; then
    echo "  OK   $ref ($rsha): 0 paths dropped"
  else
    echo "  DROP $ref ($rsha): $n path(s) present there and gone here —"
    printf '%s\n' "$dropped" | sed 's/^/         /'
    FINDINGS=1
  fi
done

echo
echo "== B. GIT-vs-DISK — untracked source that TRACKED code imports =="
echo "   (a property of the WORKING COPY, not of --rev: 'would a build of what git holds resolve?')"
if [ ${#SRCS[@]} -eq 0 ]; then
  for d in src tests app lib packages apps; do
    [ -d "$REPO/$d" ] && SRCS+=("$d")
  done
fi
if [ ${#SRCS[@]} -eq 0 ]; then
  echo "  (no source dirs found; pass --src)"
else
  untracked=$(g ls-files --others --exclude-standard -- "${SRCS[@]}")
  un=$(printf '%s' "$untracked" | grep -c . || true)
  if [ "$un" -eq 0 ]; then
    echo "  OK   0 untracked files under: ${SRCS[*]}"
  else
    echo "  $un untracked file(s) under ${SRCS[*]}; matching each against real import SPECIFIERS:"
    hit=0
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      dir=$(dirname "$f"); base=$(basename "$f"); stem="${base%.*}"
      refs=""
      # NOTE: quote characters inside a git-grep pattern are mangled by MSYS/Git-Bash on
      # Windows and silently match nothing. Patterns below are quote-free; the import
      # context is enforced by a second grep, and every hit is printed for eye-check.
      # 1. alias specifier: src/app/x/y.ts -> @/app/x/y  (and with extension, for css/json)
      if [ "${f#$ALIAS_DIR/}" != "$f" ]; then
        rest="${f#$ALIAS_DIR/}"
        for spec in "${ALIAS}${rest%.*}" "${ALIAS}${rest}"; do
          r=$(g grep -n --fixed-strings "$spec" -- "${SRCS[@]}" 2>/dev/null \
              | grep -E "(^|[^A-Za-z])(import|require|from)([^A-Za-z]|$)")
          [ -n "$r" ] && refs="$refs$r"$'\n'
        done
      fi
      # 2. relative specifier: only files in the SAME directory can write ./<stem>
      #    the leading '.' in the pattern stands in for the opening quote character
      r=$(g grep -nE "(from|import|require\()[[:space:]]*.[.]/(${stem//./[.]}|${base//./[.]})[^A-Za-z0-9_-]" \
            "$dir" 2>/dev/null | grep -v "^$f:")
      [ -n "$r" ] && refs="$refs$r"$'\n'
      refs=$(printf '%s' "$refs" | grep -c . >/dev/null && printf '%s' "$refs" | grep . | sort -u)
      if [ -n "$refs" ]; then
        echo "    UNTRACKED-BUT-IMPORTED  $f"
        printf '%s\n' "$refs" | head -4 | sed 's/^/        <- /'
        hit=1
      fi
    done <<< "$untracked"
    if [ "$hit" -eq 1 ]; then
      echo "  ^ these resolve on your disk and NOT in git. Commit them, or a build of what git"
      echo "    holds (CI / Vercel / a fresh clone) fails on an unresolvable import."
      FINDINGS=1
    else
      echo "  OK   no untracked file is imported by tracked code"
      echo "       ($un untracked file(s) exist but nothing tracked imports them — not a build risk,"
      echo "        though unfinished work outside git is still unshipped work.)"
    fi
  fi
fi

echo
echo "== C. NOW VERIFY THE RESULT, NOT THE WORKING COPY =="
echo "  Clean tree:  git -C $REPO worktree add --detach /tmp/mg $SHA && cd /tmp/mg"
echo "  Shared/dirty repo (read-only, no .git writes):"
echo "     git -C $REPO archive --format=tar -o /tmp/mg.tar $SHA <src dirs> tsconfig.json package.json"
echo "     mkdir -p /tmp/mg && (cd /tmp/mg && tar -xf /tmp/mg.tar)"
echo "  then, IN THAT TREE:  npm run typecheck && npm test && npm run build"

echo
if [ "$FINDINGS" -eq 0 ]; then
  echo "merge-gate: no findings. (This is check A+B only — C is not automatable here; run it.)"
  exit 0
else
  echo "merge-gate: FINDINGS above. Each listed path is either a deletion you can NAME as intended,"
  echo "            or work this integration lost. Restore with: git checkout <ref> -- <paths>"
  exit 1
fi
