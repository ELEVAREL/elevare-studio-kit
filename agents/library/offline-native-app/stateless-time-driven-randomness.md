# Stateless randomness for time-driven art

The toolbox for making a pure `draw(ctx, w, h, t)` canvas scene *feel* random — flickering lightning, targets that jump to new positions, a different book pulled from a shelf each cycle — **without any retained state or RNG**. Everything derives from `t` and a seed hash, so identical `t` always reproduces the identical frame. Harvested from a suite of themed decorative header scenes.

**When to reach for it:** any time-driven animation (canvas decoration, generative art, loading ambience, SVG/WebGL scene) that wants organic/random-feeling behavior but must stay a pure function of time — for reduced-motion stills, frame-skip immunity, scrubbing, deterministic tests, or replay. Generic to any rendering target. Pairs with `battery-lean-canvas-decorations.md` (the loop + purity contract this enables).

## The primitive: seed-hash `rand`

```js
/** Deterministic pseudo-random 0..1 from a numeric seed. */
function rand(n) { var x = Math.sin(n * 99.71) * 43758.5453; return x - Math.floor(x); }
```

One shared function; every "random" decision in every scene is `rand(someSeed)`. No state, no sequence position, no `Math.random()`.

## The tricks (each maps a facet of `t` to a seed)

1. **Per-cycle re-randomization** — a new random value each period, stable *within* the period:
   ```js
   var cyc = Math.floor(t / period);
   var x = (0.15 + 0.7 * rand(cyc * 3.1 + 17)) * w;   // e.g. where this cycle's bubble rises
   ```
2. **Smooth drift between cycles** — interpolate from last cycle's value to this cycle's (targets glide instead of teleporting):
   ```js
   var n = Math.floor(t / period), p = (t % period) / period;
   var dp = Math.min(1, p / 0.35); dp = 1 - (1 - dp) * (1 - dp) * (1 - dp);   // ease-out arrival
   var x = tx(n - 1) + (tx(n) - tx(n - 1)) * dp;      // tx(k) = w * (0.18 + 0.64 * rand(k * 7.31 + 2))
   ```
   The rest of the period (`p` past the arrival window) is free for settle/lock/flare states — a whole event sequence, still stateless.
3. **Flicker seeds** — jitter that changes rapidly but deterministically (lightning, static, sparks):
   ```js
   var seed = Math.floor(t * 12);                      // re-rolls ~12x/sec
   var y = midY + (rand(seed + i) - 0.5) * h * 0.6;    // per-segment bolt jitter
   ```
4. **Deterministic branching** — "sometimes" events, reproducible per flicker/cycle:
   ```js
   if (rand(seed * 1.31 + 5) > 0.62) { /* this bolt forks; where/which way also from rand(seed + k) */ }
   ```
5. **Item selection** — which of `n` things animates this cycle, plus its local phase:
   ```js
   var pick = Math.floor(t * rate) % n;                // which book tilts out
   var ph   = (t * rate) % 1;                          // its 0..1 pull-and-settle phase
   ```
6. **Static scatter without rand at all** — index-hash placement for starfields/motes:
   ```js
   var sx = (i * 53.7) % w, sy = (i * 31.3) % h;       // irrational-ish strides avoid visible rows
   ```
7. **Salt every consumer differently** (`i * 13.7`, `k * 9.1`, `cyc * 3.1 + 17`, `n * 7.31 + 2`) so parallel streams don't correlate — two elements sharing a seed move in visible lockstep.

## Why this beats an RNG here

- The scene stays a **pure function of `t`**: the reduced-motion still, pause/resume, frame-rate caps, scrubbing, and byte-identical purity tests (see the harness in `battery-lean-canvas-decorations.md`) all come free.
- Replays are identical — a bug seen once reproduces at the same `t`.
- No per-element state objects to allocate, sync, or leak in a long-open app.

## Assumes / adapt

- The sin-hash is **decorative-grade**, not statistical or crypto: it can show correlation at very large or highly structured seeds. Keep seeds in modest ranges and salt with odd multipliers; if a scene visibly patterns, change the salts before reaching for a real RNG.
- Trick 2's ease-out window (`0.35` of the period) and trick 3's re-roll rate (`12`/sec) are taste constants — tune per scene.
- The same math works verbatim for SVG attribute updates or WebGL uniforms; only the drawing calls differ.
