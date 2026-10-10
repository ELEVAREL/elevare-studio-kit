# Hold pitch and bearing across the apex: composing a frame inside a MapLibre flight

**Harvested 2026-09-18** from `D:\ThamesCoast` branch `feat/map-3d-districts`
(`506d764..f24d4c9`), file `src/components/map3d/crossing.ts` (461 lines).

## When to reach for it

Any 3D map product where a camera move between two places is supposed to be **the moment** — a
neighbourhood/district selector, a property or venue tour, a store locator with a hero map, a
logistics or coverage visualiser, a travel or real-estate landing page. Reach for it the moment
somebody says "the transition should feel cinematic" over MapLibre or Mapbox GL.

Do **not** reach for it for a utility map where the camera move's job is only to get there. `flyTo`
is correct for that, and this is 460 lines you do not need.

## The defect, which is the whole asset

`flyTo` implements Van Wijk & Nuij's optimal path, which zooms **out** to an apex mid-flight before
descending. On a short hop that apex frame already contains both endpoints and everything between
them — it is the establishing shot of your product, and **it is being rendered today and thrown
away**, because MapLibre interpolates pitch and bearing *linearly against the same eased progress
`k` as the flight*. Verified in `node_modules/maplibre-gl/dist/maplibre-gl-dev.js`, inside `flyTo`'s
ease callback:

```js
if (this._rotating) { tr.setBearing(interpolateFactory.number(startBearing, bearing, k)); }
if (this._pitching) { tr.setPitch(interpolateFactory.number(startPitch, pitch, k)); }
if (this._rolling)  { tr.setRoll(interpolateFactory.number(startRoll, roll, k)); }
```

(`_rolling` is the same defect on a third property, and the same fix applies to it.)

So the camera is rotating at exactly the moment the apex arrives, **and a rotating camera cannot
compose a frame.** Hold pitch and bearing still across the middle of the arc and the apex resolves
into a photograph. Nothing is added; a defect is removed and what was underneath it is the moment.

## Why you must re-implement the flight instead of hooking it

Three closed doors, all verified in the library's own source rather than assumed:

| you might try | why it fails |
|---|---|
| a per-frame camera hook | MapLibre offers none |
| `map.jumpTo` during the flight | `jumpTo(options, eventData) { this.stop(); ... }` — its first statement cancels the flight you are correcting |
| writing `map.transform` directly | the public surface types it `get transform(): IReadonlyTransform` |

So **the flight becomes yours**: the same Van Wijk & Nuij construction, same variable names as the
paper *and* as MapLibre's own implementation so the two can be diffed by eye, driven from your own
`requestAnimationFrame`, with `jumpTo` as the per-frame writer. `stop()` inside `jumpTo` is then a
no-op because no MapLibre ease is ever running while you drive.

**One cost, stated rather than discovered:** `jumpTo` fires `movestart`/`move`/`moveend` on every
call, so during a flight those events fire per frame and mean nothing.

## The four pieces

### 1. A symmetric ease for the flight, not MapLibre's ease-out

MapLibre uses `cubic-bezier(0, 0, 0.25, 1)`. That is right for "get me there" and wrong for a
composed move: eased progress is past 0.8 by roughly **45% of the wall clock**, so the back half of
the flight barely moves while the rotation, keyed off eased progress, is still turning. Measured in
a real browser at 1092 samples: **3.43° of pitch drift and 13.72° of bearing drift across the middle
of the flight.** `easeInOutCubic` puts the arc's midpoint at the wall clock's midpoint, which is
what lets the hold be specified in seconds.

### 2. The hold, driven by WALL-CLOCK progress

```ts
/** `raw` is wall-clock progress, NOT eased progress. Rotate to holdFrom,
 *  freeze dead still to holdTo (the window containing the apex), rotate the rest. */
export function rotationProgress(raw: number, holdFrom: number, holdTo: number): number {
  if (raw <= holdFrom) return smoothstep(raw / holdFrom) * 0.5;
  if (raw >= holdTo)   return 0.5 + smoothstep((raw - holdTo) / (1 - holdTo)) * 0.5;
  return 0.5;
}
```

`smoothstep` (zero derivative at **both** ends) is load-bearing: the rotation must arrive at the
hold with no residual velocity, or the "static" middle reads as a camera that *slowed down* rather
than one that stopped.

Then the one line the whole moment is made of, inside the rAF frame:

```ts
const r = rotationProgress(raw, holdFrom, holdTo);   // flat across the apex
map.jumpTo({
  center,
  zoom:    startZoom + Math.log2(scale),
  pitch:   startPitch   + dPitch   * r,     // ← r, not k
  bearing: startBearing + dBearing * r,     // ← r, not k
});
```

### 3. Find the apex per flight — never assume 0.5

The apex is the widest visible span on the path (the lowest zoom). It sits at the midpoint **only
when the start and end zooms match**, which on a real map they never do. Sample `w(s)` 200 times and
take the max, then map it back through the exact inverse of your easing to get its wall-clock
position. Guessing 0.5 puts the rotation back over the one frame the hold exists to protect.

### 4. Shift the hold window to contain the apex — never clamp both ends

Measured in a browser before this was written: clamping both ends collapsed the frozen window to
**19.3%** of an overview-to-district flight, because that transition has *no ascent at all* — the
camera starts at zoom 11.4 and ends at 14.1, so `w(s)` is largest at `s = 0` and the "apex" is the
first frame. **Preserve the window's width and slide it**; that keeps ~60% of every flight frozen,
including the flights with no apex to protect.

```ts
let holdFrom = rawApex - HALF_WIDTH, holdTo = rawApex + HALF_WIDTH;
if (holdFrom < MIN) { holdTo += MIN - holdFrom; holdFrom = MIN; }
if (holdTo   > MAX) { holdFrom -= holdTo - MAX; holdTo   = MAX; }
holdFrom = Math.max(MIN, holdFrom);
holdTo   = Math.min(MAX, Math.max(holdFrom + 0.05, holdTo));
```

## Reduced motion: three traps in a row

1. **Check it per flight, never once at boot.** A visitor can flip the OS setting with the page
   open, and on a page whose whole design is one camera move, that is exactly the visitor who
   meant it.
2. **Never pass `essential: true`.** Reading MapLibre's `_prefersReducedMotion` path: `essential`
   makes a flight ignore the preference outright, and the default fallback is `jumpTo`, a hard cut.
   Both are wrong. Own the decision in your own module.
3. **★ THE GLOBAL REDUCED-MOTION RESET MAKES A CSS CROSS-FADE IMPOSSIBLE — USE WAAPI.** The
   standard reset the studio itself prescribes
   ([`../offline-native-app/reduced-motion-three-layers.md`](../offline-native-app/reduced-motion-three-layers.md))
   is `*, *::before, *::after { transition-duration: 0.001ms !important; ... }`. `!important` on a
   universal selector means **no CSS transition can run anywhere in the product under reduced
   motion, including an inline one.** Measured: with a CSS transition the canvas read opacity 0.000
   at **53ms into a 250ms fade** — a hard cut wearing a fade's name, i.e. precisely the jumping
   camera the accessible path exists to avoid. A `el.animate()` (Web Animations API) animation is
   not subject to it: it composites in the animations origin and only loses to an `!important`
   declaration of *the same property*, and the reset declares `transition-duration`, not `opacity`.
   And the reset is right about what it is aimed at — an opacity dissolve with a **stationary**
   camera is not motion in the sense a vestibular-sensitive reader is asking us to remove.

**And the dissolve goes through the ground, not A-over-B.** A true crossfade needs the departure
frame held as pixels, and the only ways to get those off a WebGL canvas (`toDataURL`, `drawImage`)
require `preserveDrawingBuffer: true` **on every frame the map ever draws** — a permanent
performance cost for one transition. Instead: fade the canvas to 0, apply the new pose, fade back,
with the stage's background set to the canvas's own land colour. There is no empty frame and no
flash to a foreign colour. State it as a deviation from the spec rather than presenting it as
the spec.

## Adjacent, and it will bite you separately: the palette cannot be CSS custom properties

**A MapLibre style is JSON handed to WebGL. It cannot read `var(--x)`** — paint properties need
literal colours. So the canvas palette is a TypeScript module and the chrome palette is CSS tokens,
and **the same value now exists twice with no mechanism to share it.** Name the consequence where
it lives and gate the mirror:

```ts
// src/lib/map-palette.ts — canvas half only. Both themes authored here so they cannot drift.
export const MAP_PALETTE_LIGHT: MapPalette = { land: "#EEFAFF", water: "#9FC7DD", /* … */ };
```

```js
// in the contrast gate: --map-land in globals.css must equal MAP_PALETTE.land
const mapLandLight = /:root\s*\{[^}]*--map-land:\s*([^;]+);/.exec(stripComments(globalsCss));
```

Anything the CSS side needs (a stage background behind the canvas, a skeleton colour, a fade
ground) mirrors one value from the TS palette, and **the gate checks the mirror** — see
[`token-resolved-contrast-gate.md`](token-resolved-contrast-gate.md).

## Assumes / adapt

- MapLibre GL JS (the `jumpTo`/`IReadonlyTransform`/`_prefersReducedMotion` details are verified
  against MapLibre; Mapbox GL is the same paper and near-identical internals, **re-read its source
  before claiming the same lines**).
- The module registers **no map handlers at all**, deliberately. Every consumer handler —
  `zoom`, `move`, `moveend`, and especially **`styledata`** — must be gated on `isFlying`. On the
  originating build `styledata` was the one that was missed, and a sibling-district fade ran during
  the flight and hollowed out the apex. `styledata` fires when a source's data changes, which a
  flight causes *by definition* because it loads tiles.
- The settle beat hangs off the module's own completion callback, never MapLibre's `moveend`, so a
  **cancelled** flight still settles.
- Handle the degenerate path: when start and end centres coincide (`|u1| < 2e-6`) the paper's
  construction divides by ~0 and the camera leaves the planet. Branch to a pure exponential zoom,
  as MapLibre does.
- Duration derived from the path's own length `S`, clamped at both ends so a short hop still reads
  as a flight and a long one never outstays the moment.
- Export `rotationProgress` and `bearingDelta` as pure functions so they can be unit-tested without
  a map.

## Related

- [`canvas-ui-webgl-hero-effects.md`](canvas-ui-webgl-hero-effects.md) — the other "one GPU moment
  on the page" asset; same budget discipline, different layer.
- [`../orchestration/two-lane-visual-component-seam.md`](../orchestration/two-lane-visual-component-seam.md)
  — how to build the canvas and the UI around it in parallel without either lane blocking.
- [`../offline-native-app/reduced-motion-three-layers.md`](../offline-native-app/reduced-motion-three-layers.md)
  — the three-origin reduced-motion pattern whose global kill is trap 3 above.

Verified at harvest, 2026-09-18. The three MapLibre internals were re-read **by this harvest**, not
relayed, in `D:\ThamesCoast\node_modules\maplibre-gl` at pinned version **5.24.0**: the
`_rotating`/`_pitching`/`_rolling` block at `dist/maplibre-gl-dev.js:69852-69860`, `jumpTo(options,
eventData) { this.stop(); … }` at `:69319-69320`, and `get transform(): IReadonlyTransform` in
`dist/maplibre-gl.d.ts`. Cite the quoted strings rather than these ordinals — the line numbers move
with the version. The behavioural measurements (1092 browser samples, the 19.3% collapsed window,
the 53ms-into-250ms CSS fade) were taken by the originating build and are **not** re-measured here.
