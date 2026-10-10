# Battery-lean canvas decoration loop

The checklist that lets a purely decorative, looping Canvas 2D animation (header art, ambient background, brand flourish) live in a long-running app without burning CPU/battery. Harvested from an offline portal whose themed header animations run all day on shared workstations.

**When to reach for it:** any decorative `requestAnimationFrame` canvas loop in an app that stays open for hours. Decoration must be free when it isn't being looked at — this is what earns the right to ship it at all. Generic to any web app.

## The checklist

1. **30fps cap via timestamp delta.** Decoration doesn't need 60/120Hz; halving the frame rate halves the cost:
2. **Timestamp-derived `t`.** All draw math takes `t = (ts - t0) / 1000` seconds — skipped/throttled frames can never desync the animation clock (never accumulate `t += dt`).
3. **DPR clamp ≤ 2.** A 3x backing store is 2.25× the pixels of 2x for no visible gain on decoration.
4. **Pause when hidden** (`document.hidden` via `visibilitychange`).
5. **Pause when scrolled off-screen** (`IntersectionObserver`), mirroring the hidden logic.
6. **Auto-clean on detach.** In `innerHTML`-render apps, navigation replaces the canvas without anyone calling `.stop()` — check `canvas.isConnected` in the frame loop and self-stop.
7. **Static frame under reduced motion** — draw one composed still at `t≈0.35` and never start the loop (see `reduced-motion-three-layers.md`, layer 3).
8. **Registry + `stopAll()`** so route changes can hard-stop everything.

## The mount skeleton (all eight together)

```js
var running = [];

function mount(canvas, draw) {                       // draw(ctx, w, h, tSeconds)
  if (!canvas || !draw) return { stop: function(){} };
  var ctx = canvas.getContext("2d");
  var dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));   // (3) clamp
  var raf = 0, t0 = 0, stopped = false, lastDraw = 0;

  function resize() {
    var w = canvas.clientWidth || 600, h = canvas.clientHeight || 70;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);          // draw in CSS pixels
  }
  resize();

  // (7) reduced motion: one composed still, no loop, same handle shape
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    try { draw(ctx, canvas.width / dpr, canvas.height / dpr, 0.35); } catch (e) {}
    return { stop: function(){} };
  }

  var ro = null;
  try { ro = new ResizeObserver(resize); ro.observe(canvas); } catch (e) {}

  function frame(ts) {
    if (stopped) return;
    if (!canvas.isConnected) { handle.stop(); return; }        // (6) auto-clean
    if (ts - lastDraw < 33) { raf = requestAnimationFrame(frame); return; }  // (1) 30fps cap
    lastDraw = ts;
    if (!t0) t0 = ts;
    var t = (ts - t0) / 1000;                                  // (2) timestamp-derived clock
    var w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);
    try { draw(ctx, w, h, t); } catch (e) {}                   // a buggy scene never kills the app
    raf = requestAnimationFrame(frame);
  }

  var inView = true;
  function start() { if (!raf && !stopped && !document.hidden && inView) raf = requestAnimationFrame(frame); }
  function pause() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function onVis() { if (document.hidden) pause(); else start(); }             // (4)
  document.addEventListener("visibilitychange", onVis);
  var io = null;
  try {
    io = new IntersectionObserver(function (entries) {                        // (5)
      inView = entries[entries.length - 1].isIntersecting;
      if (!inView) pause(); else if (!document.hidden) start();
    });
    io.observe(canvas);
  } catch (e) {}
  start();

  var handle = {
    stop: function () {
      stopped = true; pause();
      document.removeEventListener("visibilitychange", onVis);
      if (io) try { io.disconnect(); } catch (e) {}
      if (ro) try { ro.disconnect(); } catch (e) {}
      var i = running.indexOf(handle); if (i >= 0) running.splice(i, 1);      // (8)
    }
  };
  running.push(handle);
  return handle;
}

function stopAll() { running.slice().forEach(function (h) { h.stop(); }); }
```

Draw functions are pure `draw(ctx, w, h, t)` with looping math (`(t % period) / period` for a 0..1 saw) — they hold no state, so the mount skeleton owns *all* lifecycle and the same scene works animated, throttled, or as a reduced-motion still.

## The draw-side contract: scenes are pure functions of `t`

The mount skeleton above only delivers its guarantees if every scene honors this contract:

- **Signature is `draw(ctx, w, h, t)` and nothing else.** No closures over mutable variables, no module-level state written from inside a draw, no `Date.now()`, no `Math.random()`. Two calls with the same `(w, h, t)` must produce the identical frame.
- **Everything periodic derives from `t`:** `loop(t, period) = (t % period) / period` for 0..1 phases; `Math.sin(t * rate)` for oscillation.
- **Everything "random" derives from a seed hash**, never an RNG:

```js
/** Deterministic pseudo-random 0..1 from a numeric seed (shared by all scenes). */
function rand(n) { var x = Math.sin(n * 99.71) * 43758.5453; return x - Math.floor(x); }
```

**Why the purity rule pays for itself:** frame skips/throttling can't drift a scene (there's nothing to accumulate); pause/resume needs no bookkeeping; the reduced-motion still is literally one call; a scene renders correctly at ANY `t` (scrubbing, screenshots, tests); and purity is *machine-checkable* (harness below). The full toolbox of stateless-random tricks (per-cycle targets, flicker seeds, item selection) lives in [`stateless-time-driven-randomness.md`](stateless-time-driven-randomness.md).

### Purity harness (verification recipe)

Purity is testable without a real canvas: record the ctx **call-stream** in a stub and assert byte-identical output for identical `t` — including after drawing *other* `t` values in between (that interleave is what catches retained state).

```js
function recordScene(draw, w, h, t) {
  var calls = [];
  function fmt(v) { return (v !== null && typeof v === "object") || typeof v === "function" ? "<obj>" : JSON.stringify(v); }
  var stub = new Proxy({}, {
    get: function (_, prop) {
      if (prop === "canvas") return { width: w, height: h };
      return function () { calls.push(prop + "(" + [].map.call(arguments, fmt).join(",") + ")"); return stub; };
    },
    set: function (_, prop, v) { calls.push("set " + prop + "=" + fmt(v)); return true; }
  });
  draw(stub, w, h, t);
  return calls.join("\n");
}

// For each scene, sweep a few t values across its loop periods:
[0, 0.35, 1.7, 4.2, 9.99].forEach(function (t) {
  var a = recordScene(draw, 600, 70, t);
  recordScene(draw, 600, 70, t + 1.23);        // interleave a DIFFERENT t
  var b = recordScene(draw, 600, 70, t);        // then repeat the original
  console.assert(a === b, "scene not pure at t=" + t);
});
```

Notes: gradient/pattern objects created on the stub are recorded via their *construction* calls (`createLinearGradient(...)` + `addColorStop(...)`), so `fmt` collapsing the object itself to `<obj>` loses nothing — determinism of the construction stream IS the assertion. Any scene that reads `Math.random()`, a counter, or wall-clock time fails the interleave test immediately.

### Static-frame composition: design the reduced-motion poster

The reduced-motion path renders ONE still at a canonical `t_still` (`0.35` here). Left alone, traveling elements (`x = ((t * speed + PHASE) % span) - margin`) land wherever the modulo says — usually off-screen. Design the still instead of freezing at random:

- **Pick one canonical `t_still` for the whole family** so every scene is composed against the same frame.
- **Phase-shift every traveling element** so it sits where you want at `t_still`. To center it: `PHASE = w * 0.5 + margin - t_still * speed` — then `x(t_still) = w * 0.5` exactly, for any speed. (Verified across four scenes in the harvested code; the formula is exact, not a nudge.)
- For multi-instance scenes (a convoy of crates, two satellites), pick the phase constant so **all instances are on-screen** at `t_still`, then eyeball each scene rendered at `t_still` as its own review artifact — it's the poster low-vision and reduced-motion users get.

This costs nothing at runtime (it's a constant in the position math) and turns the accessibility fallback from a degraded state into a composed frame.

## Assumes / adapt

- Pure Canvas 2D, everything drawn in code (fits no-network/offline directives — no image fetches). For WebGL the same lifecycle applies; also handle context loss.
- The `start()` guard condition (`!raf && !stopped && !document.hidden && inView`) is the invariant — both pause sources funnel through one gate, so they can't fight.
- Frame-cap threshold `33` ≈ 30fps; drop to `50` (20fps) for very subtle ambience.
- If several canvases mount per view, the per-canvas RAF is fine at this scale; dozens+ → share one RAF ticker.
