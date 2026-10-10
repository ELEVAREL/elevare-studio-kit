# Animated branded installer — 6-state machine + SVG progress ring (Discord/Chrome style)

**When to reach for it:** you want a **branded, animated install experience** — the small frameless window that walks connecting → downloading → installing → optimizing → done, with a live progress ring and a satisfying checkmark on completion — instead of a stock MSI wizard or a fake timer bar. Works two ways: driven by a real native installer over a JS bridge (the honest version, progress tied to bytes copied), or standalone as a browser demo. Reach for it for any desktop app install, an "app is updating" screen, or any long multi-phase operation that deserves a real-feeling progress UI.

**Assumes / adapt:**
- **Self-contained single HTML file.** All CSS + JS inline; only dependency is a local `fonts.css` (see [`self-hosted-fonts-fetch.md`](self-hosted-fonts-fetch.md)) — drop that and it falls back to system fonts. No framework, no build step. Swap the brand tokens (`:root`) and the copy in the `STAGES` map; everything else is mechanism.
- **The public API is `window.SBX`** — `{ setStage(id), setProgress(0..1), setDownload(loadedMB, totalMB, rateMBs), complete() }`. A native host drives these via `window.evaluate_js("window.SBX.setStage('installing')")`. The reverse channel is `window.pywebview.api.<action>()` for install / launch / cancel / advanced. If your host isn't pywebview, keep the `window.SBX` surface and rewire the `bridge()` helper to your IPC.
- **Honest progress, not a fake timer.** In the reference, "downloading" is the payload copy and the ring is tied to **bytes actually copied**, painted throttled to ~30fps (a onedir payload is hundreds of files — per-file paints/sleeps add real wall-clock time). If your work has no natural percentage, use the *indeterminate* arc mode for that phase, not a lie.
- **The win must LAND and HOLD.** On `complete()` the beacon does one final expand and yields to a spring-settle mint checkmark, then the app holds ~900ms **before** swapping the footer to "Open" and handing off. Don't snap straight to done — the pause is the payoff (art-director note baked in).
- **State drives everything via `data-mode` on `.mark`** — `idle | indeterminate | determinate | done`. The ring has three stacked `<circle>`s (track / spinning arc / determinate progress) + a `<path>` check, all `pathLength="100"` so `stroke-dashoffset = 100*(1-p)` is your percentage. CSS `@media (prefers-reduced-motion: reduce)` kills the spin/pulse — keep that block.
- **Native vs demo detection:** `?native=1` in the URL → fill the window, no window chrome, wait for the host to drive stages. No param → auto-run the browser demo (smoothed rate so it reads real, not frantic). `-webkit-app-region: drag` on the card makes the frameless window draggable; `no-drag` on every button.
- **Reference:** `D:\SentinelBox\desktop\installer\ui\index.html` (13.5KB, the whole thing) + `bootstrapper.py` (the pywebview host that copies the payload and streams real progress to `window.SBX`). Pairs with [`pywebview-pyinstaller-boilerplate.md`](pywebview-pyinstaller-boilerplate.md).

## The load-bearing mechanism (copy the file; these are the parts to understand)

**Stage map — one object per phase, `mode` picks the ring animation:**
```js
const STAGES = {
  idle:        { eyebrow: "…",  headline: "Ready to install",  mode: "idle" },
  connecting:  { eyebrow: "…",  headline: "Connecting…",       mode: "indeterminate" },
  downloading: { eyebrow: "…",  headline: "Downloading…",      mode: "determinate" },
  installing:  { eyebrow: "…",  headline: "Installing",        mode: "indeterminate" },
  optimizing:  { eyebrow: "…",  headline: "Finishing up",      mode: "indeterminate" },
  done:        { eyebrow: "Ready", headline: "You're set.",    mode: "done" },
};
function setStage(id){ const s=STAGES[id]; if(!s) return;
  swapCopy(s); mark.dataset.mode = s.mode; /* toggle readout/cta visibility */ }
```

**SVG ring — three circles + a check, all `pathLength="100"`:**
```html
<svg class="ring" viewBox="0 0 120 120">
  <circle class="ring-track"    cx="60" cy="60" r="52" pathLength="100"></circle>
  <circle class="ring-arc"      cx="60" cy="60" r="52" pathLength="100"></circle>  <!-- spins when indeterminate -->
  <circle class="ring-progress" cx="60" cy="60" r="52" pathLength="100"></circle>  <!-- determinate % -->
  <path class="ring-check" d="M40 62 L54 76 L82 44" pathLength="100"></path>       <!-- spring-settle on done -->
</svg>
```
```js
const ringProgress = document.querySelector(".ring-progress");
const setProgress = p => ringProgress.style.strokeDashoffset =
  String(100 * (1 - Math.max(0, Math.min(1, p))));   // pathLength=100 → offset IS the inverse %
```

**Determinate arc / spinning arc / done are pure CSS off `data-mode`:**
```css
.ring-arc { stroke-dasharray: 22 78; animation: ring-spin 1.35s linear infinite; opacity:0; }
@keyframes ring-spin { to { transform: rotate(360deg); } }
.ring-check { stroke-dasharray:100; stroke-dashoffset:100; transform: rotate(90deg) scale(.6); opacity:0;
  transition: stroke-dashoffset .34s ease .12s, transform .34s var(--spring) .12s, opacity .2s ease .12s; }
.mark[data-mode="indeterminate"] .ring-arc      { opacity:1; }
.mark[data-mode="determinate"]   .ring-progress { opacity:1; }
.mark[data-mode="done"] .ring-progress { opacity:1; stroke-dashoffset:0; stroke: var(--mint); }
.mark[data-mode="done"] .ring-check    { stroke-dashoffset:0; transform: rotate(90deg) scale(1); opacity:1; }
/* --spring: cubic-bezier(.34,1.56,.64,1) — the gentle overshoot that makes the check feel earned */
```

**Completion holds before handoff:**
```js
function complete(){
  setStage("done"); setProgress(1);
  bridge("launch");                        // native: prime the launch during the hold
  setTimeout(() => { /* swap footer to an "Open <App>" button */ }, 900);  // let it LAND
}
```

**Native bridge (pywebview) + browser-demo fallback on the CTA:**
```js
function bridge(action){
  if (window.pywebview?.api?.[action]) window.pywebview.api[action]();
}
window.SBX = { setStage, setProgress, setDownload, complete };
cta.onclick = () => (window.pywebview?.api) ? bridge("install") : runDemo();
```
Host side streams real progress in (pywebview): `window.evaluate_js("window.SBX.setDownload(41.2,86.4,22.0)")` per throttled paint while copying bytes.
