# Dependency-free motion layer for innerHTML-render apps

A complete micro-interaction motion system for vanilla-JS apps that render views by replacing `innerHTML`: one ~50-line helper, a tokenized CSS keyframe contract, and zero idle cost. Harvested from an offline zero-server crew portal (craft + motion groom wave).

**When to reach for it:** any dependency-free / offline / vanilla-JS app that needs premium-feeling micro-motion (view transitions, toast/modal entrances, badge ticks, bell rings, shake-on-error, dashboard staggers) without shipping an animation library. Especially apps that re-render via `innerHTML` — this layer is designed around that.

## Decision note: why NOT GSAP (or any JS animation lib) here

- **The app's constraint is the point.** Offline / `file://` / no-network / no-external-deps apps can't lean on a CDN, and vendoring 60KB+ of animation runtime for one-shot 150ms cues is the wrong trade.
- **`innerHTML` replacement kills JS-held tweens.** A GSAP timeline animating a node dies silently when the view re-renders and the node is replaced. CSS insertion-triggered animations (below) *survive* re-render by design — the fresh node fires the animation itself.
- **The motion needs are one-shot cues, not choreography.** Everything here is "play once, clean up." CSS keyframes + a class-toggle helper cover 100% of it at zero runtime bytes and zero idle cost.
- **Reach for GSAP when** you need scroll-driven scenes, physics, morphing, or timelines that sequence many elements with dynamic values. (Studio default for *that* tier is GSAP — see the animation skills pack.)

## 1. Motion tokens (CSS)

Three durations, three named curves. Every transition/animation in the app references these — nothing hardcodes a duration.

```css
:root{
  --mo-fast:120ms;
  --mo-base:160ms;
  --mo-slow:240ms;
  --mo-out:cubic-bezier(0.22,1,0.36,1);   /* decelerate — entrances */
  --mo-in:cubic-bezier(0.4,0,1,1);        /* accelerate — exits */
  --mo-move:cubic-bezier(0.2,0,0,1);      /* standard move — drawers/slides */
}
```

## 2. The retrigger helper (~50 lines, the whole JS layer)

```js
(function () {
  "use strict";
  var mq = matchMedia("(prefers-reduced-motion: reduce)");
  function reduced() { return mq.matches; }

  /** Restart a one-shot CSS animation by re-adding its class.
      Cleaned up on animationend so nothing lingers. */
  function retrigger(el, cls) {
    if (!el || reduced()) return;
    el.classList.remove(cls);
    void el.offsetWidth;                 // force style flush so the animation restarts
    el.classList.add(cls);
    el.addEventListener("animationend", function h() {
      el.classList.remove(cls);
      el.removeEventListener("animationend", h);
    });
  }

  window.Motion = {
    reduced: reduced,
    viewEnter: function () { retrigger(document.getElementById("view"), "view-enter"); },
    flash: function (el) { retrigger(el, "m-flash"); },
    ring:  function (el) { retrigger(el, "m-ring") },
    tick:  function (el) { retrigger(el, "m-tick"); },
    shake: function (el) { retrigger(el, "m-ring"); } // same class, keyframe binding differs by selector
  };
})();
```

Three load-bearing details:
1. **`void el.offsetWidth`** between remove and add — forces a style flush so re-adding the same class restarts the animation (otherwise the browser coalesces and nothing plays).
2. **`animationend` self-cleanup** — the class never lingers, so the element returns to a clean state and the next trigger always works.
3. **Graceful degradation** — no-op under reduced motion; harmless if the CSS keyframe doesn't exist (the class just does nothing).

Note the `shake` alias trick: one class (`m-ring`) can bind to *different* keyframes per selector (`#notifBell.m-ring` → bell ring; `#loginPin.m-ring` → wrong-PIN shake), so the JS API stays tiny.

## 3. Insertion-triggered keyframes (zero-JS motion)

Because views render by replacing `innerHTML`, every element is *freshly inserted* — a CSS animation on a matching selector fires automatically, no JS trigger at all. Toasts, modals, and the login gate animate themselves:

```css
@media (prefers-reduced-motion: no-preference){
  /* toast — animates on insertion */
  @keyframes m-toast-in{from{opacity:0;transform:translateY(8px)}}
  .toast{animation:m-toast-in var(--mo-base) var(--mo-out)}

  /* modal — scrim and box separately */
  @keyframes m-scrim-in{from{opacity:0}}
  @keyframes m-box-in{from{opacity:0;transform:scale(.97)}}
  .modal{animation:m-scrim-in var(--mo-base) var(--mo-out)}
  .modal .box{animation:m-box-in 150ms var(--mo-out)}
}
```

Style: declare only `from{}` — the implicit `to` is the element's natural resting state, so the keyframe can never drift out of sync with the design.

## 4. One-shot choreography gates (staggers that fire exactly once)

An entrance stagger on the dashboard must NOT re-fire when a background poll re-renders the same view. Gate it with a once-per-session flag:

```js
let _dashAnimated = false;   // reset to false on login AND on lock/logout

// in render():
if (cur === "dashboard") {
  view.innerHTML = viewDashboard();
  if (!_dashAnimated) {
    _dashAnimated = true;
    if (window.Motion && !Motion.reduced()) {
      view.classList.add("dash-enter");
      setTimeout(() => view.classList.remove("dash-enter"), 600); // > longest delay+duration
    }
  }
}
```

Three parts that all matter:
- **Flag set on first render** — poll-driven re-renders skip the stagger.
- **Flag reset on login/lock** — the next session gets its entrance back.
- **Class removed on a timeout** — even if a re-render happens inside the animation window, the class is gone before the next `innerHTML` replacement can re-trigger insertion animations.

The stagger itself, with a **capped tail** so long lists don't cascade forever:

```css
@keyframes m-dash-in{from{opacity:0;transform:translateY(10px)}}
#view.dash-enter>*{animation:m-dash-in 200ms var(--mo-out) both}
#view.dash-enter>:nth-child(2){animation-delay:40ms}
#view.dash-enter>:nth-child(3){animation-delay:80ms}
#view.dash-enter>:nth-child(4){animation-delay:120ms}
#view.dash-enter>:nth-child(5){animation-delay:160ms}
#view.dash-enter>:nth-child(6){animation-delay:200ms}
#view.dash-enter>:nth-child(n+7){animation-delay:240ms}  /* everything past 6 lands together */
```

## 5. Count-change cues (badge/counter motion)

Ring the bell only when the unread count *increases*; tick the badge on any nonzero change; stay silent on the first paint after login (the refresh isn't news):

```js
var prevN = -1;   // module-level; -1 = never painted → no motion on first paint

function paint() {
  var n = unread();
  badge.style.display = n ? "inline-block" : "none";
  if (n) badge.textContent = n > 99 ? "99+" : n;
  if (n > prevN  && prevN >= 0 && window.Motion) Motion.ring(bellEl);  // only on INCREASE
  if (n !== prevN && n > 0 && prevN >= 0 && window.Motion) Motion.tick(badge);
  prevN = n;
}
```

The `-1` initialization is the whole trick: login/first-refresh paints the real count without fanfare; only *subsequent* increases announce themselves. Reset `prevN = -1` if the user logs out/in.

## 6. Zero-idle-cost discipline

The bar the whole layer holds: **when nothing is happening, the motion system costs nothing.**
- No `will-change` anywhere (it pins layers and eats memory permanently for 150ms of payoff).
- No infinite/looping CSS animations; no idle timers or RAF loops (decorative canvas loops are a separate, aggressively-paused system — see `battery-lean-canvas-decorations.md`).
- Every animation class is removed after play (`animationend` or timeout).
- Transitions only on cheap properties (`transform`, `opacity`, `background`, `border-color`) with token durations.

## Assumes / adapt

- Assumes views render via `innerHTML` replacement into a known container (`#view`) — the insertion-trigger and choreography-gate patterns depend on that.
- Assumes the reduced-motion three-layer setup (`reduced-motion-three-layers.md`) — all keyframes live inside one `@media (prefers-reduced-motion: no-preference)` block.
- Rename tokens/classes to your project's convention; keep the `m-` prefix idea (motion classes are greppable — pairs with `state-class-css-existence-check.md`).
- If the app is a framework SPA (React/Vue), insertion-triggered keyframes still work on mount, but the retrigger helper should become a small hook/directive instead of a global.
