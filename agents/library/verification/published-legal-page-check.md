# Check the PUBLISHED legal page, not the draft: no placeholder, no comment, and really the page

**Harvested 2026-09-29** from `D:\elevare-app` `docs/store/PRIVACY-POLICY-DELTAS.md` section 6 ("What
still holds this block: five placeholders and one publish check"), last touched in `ef19800` on
`main`; the check was calibrated by the wave 5 docs lane on 2026-09-29. Generalized into a runnable,
self-calibrating script:

**[`_gates/published-page-check.sh`](_gates/published-page-check.sh)**, studio-generic, use as-is.

Calibrated at harvest (2026-09-29) against the live `https://elevarestudio.co/privacy` with the
control `ELEVARESTUDIO LLC`: `--selftest` reported 9 of 9 (the real page PASS; lowercase, React-split,
attribute, encoded-comment, tag-split and real-comment plants each FAIL naming the right cause;
empty body and control-removed FAIL). Plain runs: apex PASS exit 0, `www` PASS exit 0 (redirect
followed), a missing path `FAIL: HTTP 404` exit 1, an unresolvable host `COULD NOT RUN` exit 2.

## When to reach for it

After ANY publish of a privacy policy, terms, cookie notice, refund policy, App Store privacy URL or
other legal page, and before anyone says "it is live". Especially when the source text carries owner
placeholders (the studio convention is `[NEEDS OWNER/LEGAL: ...]`), draft notes in HTML comments, or
a paste block that must stay held until those placeholders are filled.

**The tell:** someone confirmed the policy by reading the markdown or the repo, not the served bytes.

## Why each rule is there

```bash
bash published-page-check.sh <url|file> '<control string>'             # the check
bash published-page-check.sh --selftest <url|file> '<control string>'  # prove it can fail, first
```

- **Follow redirects and require HTTP 200.** `www` answered 307 to the apex; a 404 must fail, and a
  network error must be "could not run" (exit 2), never a pass.
- **Positive control.** A literal that must be on the real page (the filed legal entity name works:
  it is on every policy and nothing interpolates it). An empty body, a login wall, a CDN error page or
  the wrong route all "contain no placeholder"; only the control makes a clean result mean something.
- **Strip ONLY the framework's own comment markers, then fail on any remaining `<!--`.** React and
  Next.js stream `<!-- -->`, `<!--$-->`, `<!--$?-->`, `<!--$!-->` and `<!--/$-->` (the source page
  carried 52 of them). A naive "no `<!--`" check fails every Next.js page; a naive "ignore comments"
  check misses a real draft note. If your framework emits another marker the check goes RED (the safe
  direction); read the marker, then add it.
- **Strip before the placeholder search, not after.** React writes `Version <!-- -->2026-09-29` and
  `[<!-- -->NEEDS ...]`: an interpolated placeholder is split by a marker in the served bytes, so
  `grep '[NEEDS'` on raw HTML misses it.
- **Case-insensitive, and also the entity-encoded comment `&lt;!--`**, which a CMS or an MDX
  pipeline produces from a comment pasted into prose.
- **Search again on a tag-stripped copy**, so `[<b>NEEDS</b> OWNER/LEGAL]` is still caught. The raw
  search also sees attributes (`title="[NEEDS ...]"`), which the tag-stripped copy would lose, so run
  both.
- **`grep -F`, never `grep -P`.** `grep -P` errors on this machine and the error reads as a clean
  pass (STANDARDS; [`false-green-casebook.md`](false-green-casebook.md)).

## Pair it with a count of what the page MUST and MUST NOT say

The source doc also counted phrases on the fetched bytes: retired sentences at 0 ("contact email
address", "If you decline, nothing is sent"), the corrected sentence present, and a control phrase at
a known non-zero count. Two things to know when you copy that:

- A Next.js page carries each visible sentence TWICE (once as HTML, once in the flight payload), so
  byte counts are double the visible counts. State which you are counting.
- Gate the policy on the DEPLOYED backend it describes, never on a merge: the source policy was
  corrected only after the edge function version it describes was read back live.

## Assumes / adapt

- `bash`, `curl`, `sed -E`, `grep -F` (Git Bash on Windows works; verified there at harvest).
- Choose a control string with no characters the framework escapes (`&`, `<`, quotes) and that no
  component interpolates.
- `PLACEHOLDER` env overrides the default `[needs` token for a different convention.
- This checks the page, not the truth of its sentences. For the truth, pin each disclosure to code
  ([`disclosure-to-code-pinning.md`](disclosure-to-code-pinning.md)) and read the live system for
  every factual claim (`compliance-counsel` owns the words).
