# Segmented control (view switcher) — minimal vanilla CSS recipe

**When to reach for it:** a small mutually-exclusive view switcher (Month / Week / Upcoming, List / Grid, All / Mine) in a vanilla-JS app with a global button style. This is the minimal segmented-control pattern: one bordered inline-flex container, borderless flush buttons inside, a filled `.active` state. Exists as an entry because its absence is invisible — see [`state-class-css-existence-check.md`](state-class-css-existence-check.md) for the audit that catches an emitted-but-unstyled `.active`.

```css
/* ---------- segmented control ---------- */
.seg{display:inline-flex;border:1px solid var(--bd);border-radius:8px;overflow:hidden}
.seg button{border:0;border-radius:0;background:transparent;color:var(--mut);padding:6px 14px}
.seg button:hover{color:var(--txt);background:var(--bg3)}
.seg button.active{background:var(--accent);color:#111;font-weight:600}
```

```js
// Render (re-rendered on switch; aria-pressed carries the state for AT):
html+='<div class="seg" role="group" aria-label="View">'
  +'<button class="'+(view==="month"?"active":"")+'" aria-pressed="'+(view==="month")+'" onclick="setView(\'month\')">Month</button>'
  +'<button class="'+(view==="week" ?"active":"")+'" aria-pressed="'+(view==="week") +'" onclick="setView(\'week\')">Week</button>'
  +'</div>';
```

**Why each line is there:**
- **Container owns the chrome** (`border` + `border-radius` + `overflow:hidden`): buttons stay flush with no double borders, and the corner rounding clips the end buttons automatically — no `:first-child`/`:last-child` radius fiddling.
- **`.seg button{border:0;border-radius:0;background:transparent}` is a reset, not decoration.** Most codebases have a global `button{background:…;border:…;border-radius:…}`; the descendant selector `.seg button` (0,1,1) beats the element selector `button` (0,0,1), so these three properties must be *explicitly zeroed* here or the global style bleeds through and the control reads as three separate buttons.
- **Muted resting / filled active:** resting text uses the muted token so the filled `.active` (accent background + near-black text + `font-weight:600`) is unmistakable. Weight + fill means the state isn't conveyed by color alone.
- **Hover is a step between resting and active** (text brightens, subtle bg) — never the same treatment as `.active`, or hovering lies about the current view.

**Assumes / adapt:**
- Tokens: `--bd` border, `--mut` muted text, `--txt` full text, `--bg3` subtle surface, `--accent` brand fill (with near-black text on it — check contrast if your accent is dark; flip to `#fff`).
- `aria-pressed` + `role="group"` is the lightweight ARIA for a re-rendering vanilla switcher. If the control switches visible tab *panels* and you manage focus, use `role="tablist"`/`tab`/`aria-selected` instead — don't cargo-cult tablist without its arrow-key behavior.
- If the app re-renders on every switch (innerHTML apps), state lives in the render — no classList juggling needed. In a persistent-DOM app, toggle `active` + `aria-pressed` on click instead.
- Global `button:hover`/`:active` transforms (e.g. `translateY(1px)`) also apply inside `.seg`; zero them here too if the pressed-shift looks wrong on flush segments.
