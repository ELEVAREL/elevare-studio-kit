# Accessible slide-in drawer / dialog (a11y recipe)

**When to reach for it:** any slide-in drawer, side panel, or modal dialog (notifications, filters, a detail pane). This is the full accessible recipe most hand-rolled drawers get wrong: `role="dialog"` + scrim + Esc-to-close + focus **move in** on open and **restore** on close + trigger `aria-expanded` sync + an `aria-live` badge for async count changes.

**Assumes / adapt:**
- Vanilla JS + CSS; no framework needed. Swap class names / transitions for your design system.
- The **trigger button** owns `aria-haspopup="dialog"` and an `aria-expanded` that you keep in sync with open state — screen-reader users need this.
- On open: remember `document.activeElement`, then move focus into the panel (`panel.focus()`, panel has `tabindex="-1"`). On close: restore focus to the remembered trigger. Missing focus restore is the most common a11y bug in hand-rolled drawers.
- Esc closes; clicking the scrim closes. For a true modal, also trap Tab within the panel (a minimal trap is included).
- A live count (e.g. unread badge) uses `aria-live="polite"` + `aria-atomic="true"` so updates are announced without stealing focus.

**Markup:**
```html
<button id="trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="drawer">
  🔔 <span id="badge" class="badge" aria-live="polite" aria-atomic="true" hidden>0</span>
</button>

<div id="scrim" class="scrim" hidden></div>
<div id="drawer" class="drawer" role="dialog" aria-modal="true" aria-label="Notifications" tabindex="-1" hidden></div>
```

**CSS (slide-in + scrim + reduced-motion):**
```css
.scrim{ position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:200; }
.drawer{
  position:fixed; top:0; right:0; height:100%; width:min(420px,92vw);
  background:var(--bg2,#141414); z-index:201; overflow:auto; padding:16px;
  transform:translateX(100%); transition:transform .22s ease;
}
.drawer.open{ transform:translateX(0); }
.drawer:focus-visible{ outline:2px solid var(--gold,#c9a227); outline-offset:-2px; }
@media (prefers-reduced-motion: reduce){ .drawer{ transition:none; } }
```

**Controller:**
```js
const trigger = document.getElementById("trigger");
const drawer  = document.getElementById("drawer");
const scrim   = document.getElementById("scrim");
let _lastFocus = null;

function openDrawer(){
  _lastFocus = document.activeElement;          // remember where focus was
  scrim.hidden = false; drawer.hidden = false;
  requestAnimationFrame(() => drawer.classList.add("open"));  // let transition run
  trigger.setAttribute("aria-expanded", "true");
  drawer.focus();                               // move focus in
  document.addEventListener("keydown", onKey);
}

function closeDrawer(){
  drawer.classList.remove("open");
  trigger.setAttribute("aria-expanded", "false");
  document.removeEventListener("keydown", onKey);
  setTimeout(() => { drawer.hidden = true; scrim.hidden = true; }, 220);  // after transition
  if (_lastFocus && _lastFocus.focus) _lastFocus.focus();  // restore focus
}

function onKey(e){
  if (e.key === "Escape"){ closeDrawer(); return; }
  if (e.key === "Tab"){                          // minimal focus trap
    const f = drawer.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length-1];
    if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
}

trigger.addEventListener("click", () => drawer.hidden ? openDrawer() : closeDrawer());
scrim.addEventListener("click", closeDrawer);

// async count update — announced via aria-live, no focus theft
function setBadge(n){ const b = document.getElementById("badge"); b.textContent = n; b.hidden = n <= 0; }
```
