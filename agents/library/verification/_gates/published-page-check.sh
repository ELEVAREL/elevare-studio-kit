#!/usr/bin/env bash
# published-page-check.sh: prove a PUBLISHED legal page (privacy policy, terms) carries no draft
# placeholder and no HTML comment, and is really the page you think it is.
#
# Harvested 2026-09-29 from D:\elevare-app docs/store/PRIVACY-POLICY-DELTAS.md section 6 (on main at
# ef19800). Generalized into a script with a self-calibration mode.
#
# usage:
#   published-page-check.sh <url|file> <control-string>
#   published-page-check.sh --selftest <url|file> <control-string>
#
#   <control-string>  a literal that MUST be on the real page and is not split by the framework,
#                     e.g. the legal entity name. Its absence means "this is not the policy".
#   PLACEHOLDER       env, default "[needs". Matched case-insensitively. The studio convention is
#                     "[NEEDS OWNER/LEGAL: ...]".
#
# exit: 0 pass, 1 fail (the page is wrong), 2 could not run (bad usage, network error). A 2 is never
# a pass.
set -u

PLACEHOLDER="${PLACEHOLDER:-[needs}"

usage() { echo "usage: $0 [--selftest] <url|file> <control-string>" >&2; exit 2; }

# fetch <url|file> <dest>: 0 ok, 1 page answered but not 200, 2 transport failure.
fetch() {
  if [ -f "$1" ]; then cp "$1" "$2"; return 0; fi
  local code
  code="$(curl -sSL -o "$2" -w '%{http_code}' "$1")" || { echo "COULD NOT RUN: fetch failed for $1" >&2; return 2; }
  if [ "$code" != "200" ]; then echo "FAIL: HTTP $code, expected 200"; return 1; fi
  return 0
}

# check_file <file> <control>: prints one verdict line, returns 0 pass / 1 fail.
check_file() {
  local f="$1" control="$2" stripped
  [ -s "$f" ] || { echo "FAIL: the body is empty"; return 1; }
  grep -q -F -- "$control" "$f" || { echo "FAIL: positive control missing, so this is not the page"; return 1; }
  # Strip ONLY the React/Next.js streaming markers. Anything else that opens a comment is a finding.
  stripped="$(sed -E 's/<!--( |\$|\$\?|\$!|\/\$)-->//g' "$f")"
  if printf '%s' "$stripped" | grep -q -F -- '<!--'; then echo "FAIL: an HTML comment is on the page"; return 1; fi
  if printf '%s' "$stripped" | grep -q -i -F -e "$PLACEHOLDER" -e '&lt;!--'; then
    echo "FAIL: a placeholder or an encoded comment is on the page"; return 1
  fi
  if printf '%s' "$stripped" | sed 's/<[^>]*>//g' | grep -q -i -F -- "$PLACEHOLDER"; then
    echo "FAIL: a placeholder split by markup is on the page"; return 1
  fi
  echo "PASS: control present, no placeholder, no comment"
  return 0
}

selftest=0
if [ "${1:-}" = "--selftest" ]; then selftest=1; shift; fi
[ $# -eq 2 ] || usage
target="$1"; control="$2"
[ -n "$control" ] || usage

work="$(mktemp -d)" || { echo "COULD NOT RUN: mktemp" >&2; exit 2; }
trap 'rm -rf "$work"' EXIT
base="$work/base.html"

fetch "$target" "$base"; rc=$?
[ $rc -eq 0 ] || exit $rc

if [ $selftest -eq 0 ]; then
  check_file "$base" "$control"; exit $?
fi

# ---------------------------------------------------------------- self-calibration
# The real page must PASS, and each planted copy of the real bytes must FAIL. If any planted copy
# passes, the checker is blind to that shape and its PASS on the real page is not evidence.
echo "self-test against: $target"
failures=0
printf '  real page            : '; if check_file "$base" "$control" >/dev/null; then echo "PASS (expected PASS)"; else echo "FAIL (expected PASS)"; failures=$((failures+1)); fi

plant() { # plant <name> <text-to-append>
  local copy="$work/$1.html"
  cp "$base" "$copy"; printf '%s\n' "$2" >> "$copy"
  printf '  %-21s: ' "$1"
  local why
  if why="$(check_file "$copy" "$control")"; then echo "PASS (expected FAIL)"; failures=$((failures+1)); else echo "$why"; fi
}
plant lowercase        '<p>[needs owner/legal: x]</p>'
plant react-split      '<p>[<!-- -->NEEDS OWNER/LEGAL: x]</p>'
plant attribute        '<p title="[NEEDS OWNER/LEGAL: x]">t</p>'
plant encoded-comment  '<p>&lt;!-- draft note --&gt;</p>'
plant tag-split        '<p>[<b>NEEDS</b> OWNER/LEGAL: x]</p>'
plant real-comment     '<!-- draft note -->'

: > "$work/empty.html"
printf '  %-21s: ' empty
if check_file "$work/empty.html" "$control" >/dev/null; then echo "PASS (expected FAIL)"; failures=$((failures+1)); else echo "FAIL (expected FAIL)"; fi

content="$(cat "$base")"
printf '%s' "${content//"$control"/}" > "$work/no-control.html"
printf '  %-21s: ' no-control
if check_file "$work/no-control.html" "$control" >/dev/null; then echo "PASS (expected FAIL)"; failures=$((failures+1)); else echo "FAIL (expected FAIL)"; fi

if [ $failures -eq 0 ]; then echo "SELF-TEST OK: 9 of 9 behaved as expected"; exit 0; fi
echo "SELF-TEST FAILED: $failures case(s) misbehaved. Do not trust this checker's PASS."; exit 1
