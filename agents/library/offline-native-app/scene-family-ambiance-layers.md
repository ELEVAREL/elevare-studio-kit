# Scene-family ambiance layers — making N hand-drawn scenes read as one product

When one app ships many themed decorative scenes (per-section canvas headers, category art, team/department flourishes), each drawn by hand, they read as N unrelated doodles unless they share ambient DNA. The fix that worked: **one universal signature on every scene + a small set of shared background "family" helpers** drawn before each scene's subject. The subject varies wildly (a penguin, a gear train, a bookshelf); the air it breathes is shared. Harvested from a 20-scene decorative header system where this pass visibly turned a grab-bag into a product.

**When to reach for it:** any suite of 4+ hand-authored decorative scenes in one product — section headers, level/category art, empty-state illustrations, dashboard flourishes. Renderer-agnostic idea (shown as Canvas 2D). Pairs with `battery-lean-canvas-decorations.md` (scenes stay pure `draw(ctx, w, h, t)` — the helpers take the same args).

## The pattern

1. **One universal signature, drawn on EVERY scene.** Here: a 1px accent-colored hairline near the bottom at ~15% alpha. Cheap, invisible-until-you-notice, and it stamps every scene as family:
   ```js
   var ACCENT = "#c9a227";                       // your brand accent
   function baseline(ctx, w, h) {
     ctx.fillStyle = "rgba(201,162,39,0.15)";    // ACCENT @ 15%
     ctx.fillRect(0, Math.round(h * 0.92), w, 1);
   }
   ```
2. **2–4 family background helpers**, each very cheap, each drawn BEFORE the subject. Group scenes by theme and give each group shared atmosphere. The harvested trio (rename to your themes):
   ```js
   /** Family 1 (e.g. "underwater"): depth tint + slow drifting motes + one rising micro-bubble. */
   function underwater(ctx, w, h, t) {
     var g = ctx.createLinearGradient(0, 0, 0, h);
     g.addColorStop(0, "rgba(8,14,28,0)"); g.addColorStop(1, "rgba(5,10,24,0.35)");
     ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
     for (var i = 0; i < 3; i++) {
       var mx = (rand(i * 13.7) * w + t * (2 + i * 1.5)) % w;
       var my = h * (0.22 + 0.24 * i) + Math.sin(t * 0.35 + i * 2.1) * 3;
       ctx.fillStyle = "rgba(154,163,176,0.10)"; ctx.fillRect(mx, my, 1.5, 1.5);
     }
     var bp = (t % 5) / 5, cyc = Math.floor(t / 5);
     var bx = (0.15 + 0.7 * rand(cyc * 3.1 + 17)) * w + Math.sin(t * 3) * 2;
     var by = h * (1.05 - bp * 1.1);
     ctx.strokeStyle = "rgba(200,210,225," + (0.14 * Math.min(1, 4 * (1 - bp))).toFixed(3) + ")";
     ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, Math.PI * 2); ctx.stroke();
   }
   /** Family 2 (e.g. "tech"): faint accent scanlines + a slow horizontal signal shimmer. */
   function techair(ctx, w, h, t) {
     ctx.fillStyle = "rgba(201,162,39,0.04)";                       // ACCENT @ 4%
     for (var y = 10; y < h - 6; y += 22) ctx.fillRect(0, y, w, 1);
     var sx = ((t % 6) / 6) * (w + 160) - 80;
     var g = ctx.createLinearGradient(sx - 45, 0, sx + 45, 0);
     g.addColorStop(0, "rgba(232,196,74,0)"); g.addColorStop(0.5, "rgba(232,196,74,0.05)"); g.addColorStop(1, "rgba(232,196,74,0)");
     ctx.fillStyle = g; ctx.fillRect(sx - 45, 0, 90, h);
   }
   /** Family 3 (e.g. "machinery"): a dark floor band grounding the subject. */
   function machineFloor(ctx, w, h) {
     var fy = h * 0.84;
     ctx.fillStyle = "rgba(8,10,14,0.30)"; ctx.fillRect(0, fy, w, h - fy);
     ctx.fillStyle = "rgba(154,163,176,0.10)"; ctx.fillRect(0, fy, w, 1);
   }
   ```
3. **Every scene body follows the sandwich:** family helper → subject → `baseline`. A scene with no family still gets the baseline.

## Why it works

- Coherence comes from the *cheapest* pixels: a gradient, three motes, a hairline. The subjects stay individually crafted; the shared layers carry the "one product" read.
- One shared palette does the rest: subjects reuse the same accent constant + 2–3 neutrals, so even unrelated subjects rhyme.
- Whisper-quiet is the discipline: **helper alphas live in 0.04–0.35**. The ambiance grounds the subject; the moment it competes, cut its alpha, not the idea.

## Assumes / adapt

- Needs a `rand(seed)` seed-hash (see `stateless-time-driven-randomness.md`) so helpers stay pure functions of `t`.
- Family groupings should follow the *content's* themes (water/tech/machinery here); 2–4 families is the sweet spot — one family is monotone, per-scene ambiance defeats the purpose.
- Helpers must stay O(few draw calls); they run before every subject on every frame. Anything expensive (per-pixel work, big blurs) breaks the battery budget of the host loop.
- The signature element should echo something real in the app's chrome (this one echoed the header's hairline rule) — that's what ties canvas art to the surrounding UI, not just to its sibling scenes.
