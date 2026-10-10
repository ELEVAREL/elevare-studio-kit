# The two-lane seam: building a heavy visual component and the UI around it in parallel

**Harvested 2026-09-18** from `D:\ThamesCoast` branch `feat/map-3d-districts`
(`506d764..f24d4c9`), file `src/lib/map-types.ts`. Two lanes, ~6,400 lines, no merge conflict and no
seam defect.

## When to reach for it

Any job shaped **"one heavy visual component plus the UI around it"** — a 3D/WebGL map, a canvas
chart or dashboard, a video or timeline editor, a floorplan or seating picker, a document viewer, a
3D configurator. The visual lane is slow, specialist, and needs its own library expertise; the
chrome lane is panels, lists, modals, copy and conversion. **They are the natural parallel split and
they wreck each other if the seam is not pinned first.**

Also reach for it whenever two agents are about to build against each other's not-yet-existing code.

## The rule, in one sentence

**One file declares the contract, both lanes import it, neither lane imports the other.**

```
src/lib/map-types.ts        ← the seam. Pinned ONCE, before either lane starts.
src/components/map3d/**     ← canvas lane.  Never imports from map-chrome/**
src/components/map-chrome/** ← chrome lane. Never imports from map3d/**
```

The canvas never renders chrome. The chrome never touches the map library. Both import the types.
That single constraint is what makes the two lanes genuinely independent rather than nominally
parallel.

## The four things the seam file must carry

### 1. Data down, intent up — two props objects, written once and pasted verbatim into both briefs

```ts
/** What the CHROME lane reads and the CANVAS lane writes. Single source of truth. */
export interface MapView {
  mode: "overview" | "district" | "business";
  selectedDistrict: DistrictId | null;
  selectedBusiness: string | null;
  hoveredDistrict: DistrictId | null;
  /** True while the camera is in flight. Chrome quiets itself during a flight. */
  isFlying: boolean;
}

/** Implemented by the canvas lane, consumed by the chrome lane. */
export interface MapController {
  flyToDistrict(id: DistrictId): void;
  flyToOverview(): void;
  isReady(): boolean;
}

export interface Map3DProps {
  /** The current view. The canvas OBEYS this; it does not own it. */
  view: MapView;
  /** The canvas calls this when the CANVAS causes a change. */
  onViewChange: (next: MapView) => void;
  /** Called once when the component is usable. Hands the chrome its controller. */
  onReady: (controller: MapController) => void;
  /** Called when the component cannot initialise at all. */
  onUnavailable: (reason: string) => void;
}
```

**"Pasted verbatim into both briefs" is the operative phrase.** Neither lane re-declares any of it,
and a lane that wants a change changes the seam file first rather than forking a local type.
Cross-link: [`canonical-contract-reconciliation.md`](canonical-contract-reconciliation.md) is the
recovery procedure for when this step was *skipped* and several docs have already diverged. This
file is how you avoid needing it.

### 2. The chrome must be the whole product with the canvas removed

`onUnavailable(reason)` is not an error handler, it is a **product requirement encoded as a
callback**. No WebGL, tiles blocked, an old device, a corporate proxy — the content, navigation and
conversion path must still work:

```ts
/** Null until the canvas is ready. Chrome must render fully without it. */
controller: MapController | null;
/** Non-null when the canvas could not start. Chrome stays the product. */
mapUnavailable: string | null;
```

The flat fallback sits **below** the canvas as ordinary document flow, never floating over it — a
real readable index, not a `<noscript>` apology. Remove the canvas entirely and that section still
sells and still lists everything.

This also removes the worst dependency in the wave: **the chrome lane never has to wait for the
canvas lane to be runnable**, because rendering with `controller: null` is a first-class state it
had to build anyway.

### 3. Name the trap that will silently ruin it, at the seam, in the type

```ts
/**
 * ★ COORDINATE ORDER IS THE ONE THING THAT WILL SILENTLY RUIN THIS.
 *   TOWNS[].center in src/lib/constants.ts is [lat, lng] because Leaflet wants it
 *   that way. MapLibre wants [lng, lat]. Passing one straight into the other flies
 *   the camera into the Indian Ocean and throws nothing.
 */
/** [longitude, latitude]. GeoJSON order. Never [lat, lng]. */
export type LngLat = [number, number];
```

The generalisable move: **find the one silent-wrong-answer conversion in your domain and give it a
named type at the seam** so the order is visible at every call site. Axis order, units (px vs CSS
px vs device px), time base (ms vs s), 0-1 vs 0-255 colour domains, row-major vs column-major
matrices — each of these has ruined a parallel build, and each is invisible to typecheck when both
sides are `number[]`.

### 4. Honesty constraints belong in the types, not in a review comment

```ts
/** ALWAYS true in this build, and the type makes false impossible. */
isSample: true;
```

A literal type is a constraint the compiler enforces across both lanes. See
[`../verification/demo-data-honesty-gate.md`](../verification/demo-data-honesty-gate.md) — that
gate and this seam were written for each other.

## ★ When a lane cannot wire its own test into the aggregate

File ownership is what makes the lanes independent, and it creates one predictable gap: a lane owns
`src/components/<its-dir>/**` but **`tests/` and `vitest.config.ts` belong to the conductor**. So a
lane that writes a selftest cannot make `npm test` run it. The three wrong answers are to reach into
`tests/` anyway (collision), to skip the test (no evidence), or to report "selftest passing" as
though the aggregate covered it (a false green).

The right answer, from the originating build's `style.selftest.ts` header:

```ts
/**
 * ★ NOT YET WIRED INTO `npm test`, AND SAYING SO IS THE POINT.
 *   This lane owns src/components/map3d/** only; tests/ and vitest.config.ts
 *   belong to the conductor. The one-line file that wires it is, verbatim:
 *
 *     // tests/map3d-style.test.ts
 *     import { test, expect } from "vitest";
 *     import { runStyleSelftest } from "@/components/map3d/style.selftest";
 *     test("style contrast selftest", () => expect(runStyleSelftest().failures).toEqual([]));
 *
 *   Until that exists, this file is a control that has been RUN (2026-09-17,
 *   16 of 16 cases passing, transpiled and executed out of the scratchpad) but
 *   is not run by the aggregate — which is a gap in the aggregate, not a pass.
 */
```

Three things make that work and all three are portable: **ship the wiring file verbatim** in the
header so the conductor's job is a copy-paste, not a design decision; **state when and how you ran
it yourself**, with the count, so the evidence exists even though CI does not have it; and **name
the gap in the right place** — "a gap in the aggregate, not a pass" is the sentence that stops the
handoff report from laundering an unwired test into coverage.

The conductor's half: **the wave is not closed until every lane's shipped wiring file has been
created.** Collect them as an explicit checklist item, because each one is a test that currently
protects nothing. On the originating build this worked — the conductor created
`tests/map3d-style.test.ts` in a later commit of the same wave, and improved on the shipped one-liner
by **also asserting the denominator**:

```ts
expect(result.failures).toEqual([]);
// A comparator that returned early would also produce zero failures, so
// assert the denominator as well as the numerator.
expect(result.passes.length).toBeGreaterThanOrEqual(19);
```

Copy that second assertion into every selftest wiring you write. An empty `failures` array is the
output of a working comparator **and** of one that returned before it compared anything.

## Why the seam file is also where the design rationale lives

The originating file carries the opening camera pose with ~40 lines explaining what it replaced,
what it does, and **the measured chrome occlusion it was framed against** ("at 1440×900 the panel
occupies x1076..1416 y96..623; the three anchors land in clear stage"). That is the right home for
it, because the pose is the one value **both lanes** constrain: the canvas renders it, the chrome
occludes it. Keeping the measurement next to the value is the only thing that makes
"re-measure these if the chrome moves" an instruction anyone can follow.

Same file, same reason: a second pose for narrow stages, because a phone's chrome is a **bottom
sheet**, not a side panel, so both the stage aspect *and* the occlusion change. One pose cannot
serve both. That is a seam fact, not a canvas fact.

## Assumes / adapt

- TypeScript. In a JS codebase the seam is a JSDoc `@typedef` file plus a runtime shape assertion in
  dev; you lose the compiler but keep the single-declaration discipline, which is most of the value.
- **The no-cross-import rule needs enforcing or it decays.** An ESLint `no-restricted-imports` rule
  per directory, or a one-line grep in the ship gate:
  `grep -rn "map-chrome" src/components/map3d/ && exit 1`.
- The seam file must be written and reviewed **before either lane is briefed**, by whoever is
  conducting. Writing it after one lane has started means it documents that lane's choices rather
  than constraining both.
- Sizing: this pays for itself at roughly 1,000+ lines per lane. Below that, one agent building both
  halves is faster than writing the contract.
- It does not remove the seam pass. PLAYBOOK §4b (Breaks-declaration diff + claims ledger + a real
  round-trip) still runs at the end — the contract makes the seam pass cheap, it does not make it
  unnecessary.

## Related

- [`canonical-contract-reconciliation.md`](canonical-contract-reconciliation.md) — the *recovery*
  when no seam was pinned and the docs diverged.
- [`parallel-fix-wave.md`](parallel-fix-wave.md) — the wave-running mechanics this contract feeds.
- [`../ui-craft/maplibre-composed-camera-flight.md`](../ui-craft/maplibre-composed-camera-flight.md)
  — what the canvas lane built behind this seam.
- [`../verification/demo-data-honesty-gate.md`](../verification/demo-data-honesty-gate.md) — the
  gate that enforces the seam's honesty constraint at the served bytes.

Verified at harvest, 2026-09-18: read out of the shipped `src/lib/map-types.ts`, and the
no-cross-import claim was **grepped rather than inferred from the file's own comment** —
`grep -rn "map3d" src/components/map-chrome/` returns **0 hits**, and
`grep -rn "map-chrome" src/components/map3d/` returns **3, all of them comments** (two
cross-referencing a CSS breakpoint, one asserting the rule itself), **0 imports**. That is the
check to run in your own ship gate; note that a naive grep counts prose, so assert on import lines
(`^import .* from` ) rather than on a bare substring.
