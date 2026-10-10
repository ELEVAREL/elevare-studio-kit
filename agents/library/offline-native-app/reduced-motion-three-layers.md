# Three-layer reduced-motion pattern (CSS + JS + Canvas)

Honoring `prefers-reduced-motion` once, at each of the three places motion originates, so no code path can leak animation to a user who asked for none — and decorative surfaces degrade to something *designed*, not blank.

**When to reach for it:** any app that mixes CSS keyframes, JS-triggered animation (class toggles / WAAPI), and Canvas decorations. Generic to any web project, not just offline apps. One layer alone always leaks: CSS-only misses JS triggers; JS-only misses pure-CSS insertion animations; both miss canvas loops.

## Layer 1 — CSS: opt-in via ONE media block (not override)

Wrap **all** keyframes and animation bindings in a single `@media (prefers-reduced-motion: no-preference)` block. Motion is *opted into* when allowed, rather than defined globally and clawed back:

```css
@media (prefers-reduced-motion: no-preference){
  @keyframes m-view-in{from{opacity:0;transform:translateY(8px)}}
  #view.view-enter{animation:m-view-in var(--mo-base) var(--mo-out) both}
  /* ...every other @keyframes + animation rule in the app... */
}
```

Why one block: a new keyframe added later *inside* the block is automatically compliant; added outside, it's a leak you have to catch in review. Opt-in beats the common `reduce`-override approach, but keep a belt-and-suspenders global kill for transitions and any stragglers:

```css
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;
    transition-duration:.001ms!important;scroll-behavior:auto!important}
}
```

(`.001ms` not `0s` — zero-duration animations still fire `animationend` immediately, so class-cleanup handlers keep working.)

### ★ The cost of that global kill, and the one escape hatch (added 2026-09-18)

`!important` on a **universal** selector means **no CSS transition can run anywhere in the product under reduced motion — including an inline one you write later, on purpose, as the accessible alternative.** That is usually right and occasionally fatal. Measured on `D:\ThamesCoast` (`feat/map-3d-districts`): a specified *"cross-fade between two composed frames, 250–300ms, opacity only"* — the accessible replacement for a 3D camera flight — read **opacity 0.000 at 53ms into a 250ms fade**. A hard cut wearing a fade's name, i.e. exactly the jarring transition the reduced-motion path existed to avoid.

The escape hatch is **WAAPI, not a more specific selector**. A `el.animate()` animation composites in the *animations* origin and only loses to an `!important` declaration of **the same property**; the reset above declares `transition-duration`, not `opacity`. So:

```js
// Runs under reduced motion. A CSS transition on the same element does not.
const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" });
a.onfinish = () => { applyNewState(); el.animate([{opacity:0},{opacity:1}], {duration:250, fill:"forwards"}); };
if (typeof el.animate !== "function") { applyNewState(); }   // honest fallback: a plain cut
```

This is not a loophole in the rule — the reset exists to stop **motion**, and an opacity dissolve with a stationary camera is not motion in the sense a vestibular-sensitive reader is asking us to remove. It IS the accessible presentation. But be deliberate: reaching for WAAPI to sneak *actual* motion past the reset is the abuse this note must not be read as licensing. Layer 2 above still applies — every WAAPI call that starts real movement checks `matchMedia` and no-ops.

Worked example with the full reasoning, incl. why the dissolve goes through the ground colour rather than an A-over-B crossfade: [`../ui-craft/maplibre-composed-camera-flight.md`](../ui-craft/maplibre-composed-camera-flight.md).

## Layer 2 — JS: mq check no-ops every programmatic trigger

Any JS that *starts* motion — class-toggle helpers, WAAPI `el.animate()`, scroll choreography — checks the media query first and no-ops:

```js
var mq = matchMedia("(prefers-reduced-motion: reduce)");
function reduced(){ return mq.matches; }

function retrigger(el, cls){
  if (!el || reduced()) return;   // the no-op
  /* ... */
}
```

And at call sites that add choreography classes or mount decorations:

```js
if (window.Motion && !Motion.reduced()) view.classList.add("dash-enter");

var reduceMotion = typeof matchMedia === "function"
  && matchMedia("(prefers-reduced-motion:reduce)").matches;
if (window.DecorAnim && !reduceMotion) DecorAnim.mount(canvasEl, key);
```

Layer 1 would neutralize the *visible* animation anyway, but layer 2 also skips the work (listeners, RAF scheduling, layout flushes) — reduced motion should reduce CPU too.

## Layer 3 — Canvas: draw ONE composed static frame, never go blank

A canvas decoration that simply doesn't mount leaves a hole in the layout, and a mounted-but-frozen loop wastes the design. Instead: render the scene's draw function **once** at a hand-picked representative time and never start the RAF loop:

```js
// Reduced motion: draw a single themed still (t≈0.35 gives each scene
// a representative pose) and never start the RAF loop. Same handle shape.
if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
  try { draw(ctx, w, h, 0.35); } catch (e) {}
  return { stop: function () {} };   // callers can't tell the difference
}
```

Details that matter:
- **`t≈0.35s`, not `t=0`** — many loops start from an empty/degenerate pose at t=0; ~a third of a second in, elements are on-screen and composed. Eyeball-pick per scene family; one constant usually works for all.
- **Return the same handle shape** (`{stop}`) — callers manage lifecycles identically, no reduced-motion branching outside the mount function.
- The static frame still respects DPR sizing, so it's crisp.

## Assumes / adapt

- Pairs with `dependency-free-motion-layer.md` (layers 1–2 are its substrate) and `battery-lean-canvas-decorations.md` (layer 3 lives inside its mount function).
- If motion preference can change mid-session and you keep long-lived loops, listen on `mq.addEventListener("change", ...)`; for one-shot cues, checking at trigger time (as above) is enough.
- Framework apps: layer 2 becomes a `usePrefersReducedMotion()` hook gating effects/springs; layers 1 and 3 are unchanged.
