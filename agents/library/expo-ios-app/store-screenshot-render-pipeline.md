# App Store screenshots from an Expo app with no Mac: a deterministic web render with stand-ins, then a compositor that refuses

**Harvested 2026-10-01** from `D:\elevare-app`, wave 6 part 2 (`wave-6/foundation`, `58b6ab3..6ff5617`).
Sources: `scripts/design/preview/store-shots/**` (renderer, commit `6ff5617`, graded FIX then SHIP in
`docs/gates/wave-6/grade-store-shots-tooling.md`) and `scripts/store/compose-screenshots.mjs`
(compositor, commits `6427c88`, `bf9dff5`, `ef9c690`). The eleven PNGs it produced went to App
Review for build 23. Drop-in code: [`_lib/store-shots-checks.mjs`](_lib/store-shots-checks.mjs),
[`_lib/store-png.mjs`](_lib/store-png.mjs), proven by
[`_lib/store-shots.selftest.mjs`](_lib/store-shots.selftest.mjs) (43 of 43; calibrated red by
breaking the blank-glyph rule and the alpha rule, each restored green).

## Read this first: what this pipeline is, and what the studio rule says

**The studio rule is: App Store screenshots come from a device or simulator build, never from a web
export** (PLAYBOOK, the "aggravated form" bullet under gate reach; elevare-app wave 4 taste gate
section 14.5). A web render of a React Native app silently drops three layers and keeps their
layout: `expo-symbols` draws an empty box of the right size, `expo-router/unstable-native-tabs`
draws no tab bar, `headerLargeTitle` degrades to a compact web header. Every text, blankness and
diff gate passes on that.

This pipeline is the studio's answer for the case where that rule cannot be met on the day: a
Windows-only machine, no simulator, a review deadline. The owner looked at the bare web frames on
2026-09-30 and ruled them unshippable ("doesn't have icons, people will not download"), and the
conductor chose this route with real device captures from the owner's phone as the fallback. **It
is still an approximation.** Each SF Symbol is drawn as the nearest Lucide icon, so glyph shapes
differ from what the phone shows; the status bar, tab bar, back button and sheet title are painted
from the design board's tokens, not by iOS. Use it only when a device or simulator capture is not
available, say so in the release record (`render target: web export + stand-ins`), and replace the
frames with device captures at the next chance. A Mac or a simulator build beats everything below.

## When to reach for it

- An Expo / React Native app needs a store screenshot set and there is no Mac or simulator.
- You already have per-screen preview entries (a Metro web entry per lane that mounts real screen
  components on stubbed data). The renderer drives those; it does not build screens of its own.
- You need the set to be REPRODUCIBLE: same inputs, same bytes, every frame checked before it can
  replace a good one.

The compositor half (frame, caption, PNG encode, refusals) is useful on its own for ANY source of
phone screenshots, device captures included. Reach for it whenever a listing set is assembled.

## The pipeline

### Renderer (one PNG per frame, 1290 x 2796)

1. **One preview server at a time, each on its own port, the lane's own `serve.mjs` unmodified.**
   Refuse to start when the port already answers (a stale server hands back an old bundle).
2. **A `node --require` hook wraps `Metro.runServer`** and changes exactly two things in the
   lane's own config: `expo-symbols` resolves to a stand-in module, and when `node_modules` is a
   junction (a detached worktree borrowing the main install) its real path joins `watchFolders`,
   symlinks are followed, and the font URLs Metro would 404 are served read-only (font and image
   extensions only, inside that directory only, loopback only). The hook prints one line,
   `expo-symbols stand-in active`, which step 4 requires.
3. **The stand-in `SymbolView`** looks the SF name up in a map (`sf-map.json`: `{ icon, fill?,
   knockout?, knockoutFill? }`), draws the Lucide nodes at the size, weight and tint the app passed
   (SF weight to stroke width: regular 1.75, semibold 2.25, bold 2.5), fills `.fill` variants and
   cuts SF's holes through an SVG mask. **An unmapped name throws.** It records every name drawn on
   `window.__SF_SYMBOLS__` and every miss on `window.__SF_UNMAPPED__`. The icon data is generated
   from a local `lucide-react` package, never downloaded, and carries the ISC licence text and
   version.
4. **Assert on the served BYTES before shooting:** the page is the preview shell, the bundle is
   JavaScript with HTTP 200, it registers every screen module the frames claim
   (`js.includes('],"src/app/...")')`), the stand-in module is in it, and the hook line was
   printed. `assertStandIn` throws on either flag false. Without that, the platform's own web view
   draws blank boxes and every glyph check passes on nothing (round-1 finding 2 in the source).
5. **Pre-flight, before any server starts:** scan `src/` for every SF name (five literal shapes:
   `<Glyph name=>`, `glyph=` / `glyph:`, tab `sf={{ default, selected }}`, a
   `Record<..., SFSymbol>` table, a typed `??` fallback), throw on any name missing from the map,
   and run `iconMapProblems` (empty icon, index out of range, filled and cut, every node cut).
6. **Headless Chrome over CDP, no Puppeteer:** `--headless=new`, a throwaway profile,
   `DevToolsActivePort` for the port, Node's built-in `WebSocket`. Per frame:
   `Emulation.setDeviceMetricsOverride` 430 x 932 at deviceScaleFactor 3, `mobile: true`, light
   scheme; register `PINNED_CLOCK` with `Page.addScriptToEvaluateOnNewDocument` BEFORE navigating
   (Monday of this week at 9:41 local, still ticking, so the greeting matches the 9:41 status bar);
   wait for `window.__PREVIEW_READY__`; **read the page clock back and refuse unless it is 9:41 to
   9:45**; run the frame's interaction through the real controls (type into the real composer via
   the native value setter plus an `input` event, click the real Send, press radios by
   `aria-label`); wait for the resting frame; paint the device chrome; capture.
7. **The device chrome is generated from the build's own source,** not typed: tabs are parsed from
   the `NativeTabs.Trigger` elements in `(app)/_layout.tsx`, minus any whose `hidden={!FLAG}` flag
   is false in the flags file, and the parser throws when it counts more triggers than it parsed
   (a skipped trigger would vanish from the bar silently). Known residual: the trigger needle
   assumes `name=` is the first attribute; count `/<NativeTabs\.Trigger\b(?![.\w])/g` instead.
8. **Verdict, then the move.** Each PNG is written to a temp staging dir first. `shotProblems`
   fails the shot on: fonts not loaded (the entry sets `fonts: 'loaded'` only after
   `Font.loadAsync` resolves; the old failure was a silent system-font fallback), size read back
   from the IHDR not 1290 x 2796, any page error (`__PREVIEW_ERRORS__` plus CDP
   `Runtime.exceptionThrown`), a missing state needle, a real client name, an unmapped glyph, a
   blank glyph (`blankGlyphs` over the `outerHTML` of every `svg[data-sf]`, the app's and the
   chrome's). **Only a passing shot is moved into the output folder**, so a failing retake can
   never overwrite a good frame. One error control per run injects a throw and requires both
   collectors to see it.
9. **The report** (`report.json`) records per frame: file, IHDR size, entry, query, interaction,
   needles, glyphs drawn, page clock, page errors, provenance (bundle bytes, modules included,
   stand-in flags), plus the rendering commit and `git status --porcelain`. Merging across runs:
   keep only shots still in the plan whose PNG is on disk, recompute `failures` over the merged list.

### Compositor (the listing set)

- **Inputs:** one phone render per frame. A missing source is REFUSED; a `--stand-ins` flag may
  fill gaps for a pipeline proof only and records each substitution in the manifest and captions
  file. Stand-ins are never uploaded.
- **Source checks:** phone aspect; not blank (fewer than 24 distinct colours or one colour over
  98.5 percent of a 160 x 347 sample); theme read from the ground pixel at a corner every screen
  leaves empty must match the set's theme.
- **Captions are claims.** At most six words, a line budget per frame, `captionProblems` bans
  (dashes and dash entities, "unlimited", a price, an AI label, plus product-specific claims such
  as a cadence the build does not offer or a payment company's name). Every frame carries a
  `basis`: the sentence in the live store description that makes its caption true.
- **Held frames.** A frame whose screen sits behind a build flag that is false is HELD, not
  composed (`heldReason`): a screenshot of a screen the reviewer cannot reach is a false screenshot
  under guideline 2.3.3. A source named `...HIDDEN...` whose flag says live is refused as stale. A
  frame can also be omitted by the critic with the reason recorded.
- **Deterministic drawing:** a headless page draws on a 2D canvas (software raster,
  `--force-color-profile=srgb`, embedded fonts loaded with `FontFace` from base64), reads the RGB
  back, and Node encodes the PNG itself (`encodePngRgb`: colour type 2, no alpha by construction,
  sRGB chunk, no timestamp). A rerun is byte identical, so a manifest of sha256 per output is a
  real fingerprint. Two-line captions are balanced (no orphan last word).
- **Output checks** (`outputProblems`): exact declared size, no alpha, colour type 2, 8-bit, sRGB
  present, under the size limit, and not byte identical to another frame.
- `--selftest` runs the refusal controls and writes nothing; `--check` re-verifies files already
  written.

## Assumes / adapt

- **Sizes at harvest** (6.9 inch from Apple's page, read 2026-09-13; the rest from memory): 6.9
  inch accepts 1320 x 2868, 1290 x 2796, 1260 x 2736; 6.5 inch 1284 x 2778 or 1242 x 2688 only when
  the Media Manager marks it required. Read the Media Manager on the day.
- Every preview entry must expose `window.__PREVIEW_READY__`, `window.__PREVIEW_ERRORS__` and
  `window.__PREVIEW_BOOT__.fonts`. Without them steps 6 and 8 have nothing to read.
- The stand-in only covers names the scanner finds. A name built at run time is caught by the
  runtime throw, not by the pre-flight.
- `build-icons.mjs` evaluates a slice of the local package's source with `Function()`. That is
  acceptable for a package already on disk; never point it at a downloaded copy.
- **Client names:** pass the active-client patterns from the project at call time. The source repo
  hard-coded them in `checks.mjs`; the library copy does not, and refuses an empty list. Use a
  fictional fixture business with invented figures, and make the fixture rows on different frames
  agree (the source proved Home's rows equal the Boardroom fixture's by evaluating both).
- **Render from the commit you ship.** Point the renderer at a detached worktree of the build's
  commit (`STORE_SHOTS_OUT` writes into the main tree's output folder), so the frames picture the
  binary under review, not a branch in progress.

## Known residuals (named by the grader, not fixed at harvest)

1. The final move is `copyFileSync` onto the destination, which is not atomic on Windows; a kill
   mid-copy can leave a truncated PNG. Fix: copy to `<final>.part` in the same folder, then
   `renameSync` (the temp dir is on another drive, so a bare rename cannot work).
2. The staging dir is removed only on the success path; a crashed run leaks temp PNGs.
3. Shots kept from runs before a check existed carry the old value and read as passing a rule they
   were never judged by. Re-shoot the whole set after adding a check.
4. Some needles prove the screen, not the state (a title other states also print). The state is
   proven by the query plus the interaction, so say that in the frame list.

## Related

[`../verification/control-first-check.md`](../verification/control-first-check.md) (every check
here was built to that shape), [`../verification/mutation-control-harness.md`](../verification/mutation-control-harness.md),
[`../print-and-video-ads/html-gsap-canvas-mp4-pipeline.md`](../print-and-video-ads/html-gsap-canvas-mp4-pipeline.md)
(the same CDP-driven headless capture idea for video), and the
[`eas-local-credentials-clean-tree-build.md`](eas-local-credentials-clean-tree-build.md) entry for
cutting the build these frames must match.
