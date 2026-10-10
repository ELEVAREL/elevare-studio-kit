# Internal-tool login gate: identity treatment

How to make an internal tool's login screen read as *the front door of this product* instead of a generic form — using only the app's existing tokens, plus a deliberate demotion hierarchy for the scary links (recovery, break-glass reset) every internal tool accumulates.

**When to reach for it:** any internal/ops/admin tool with its own login or lock screen — portals, dashboards, kiosks, self-hosted apps. The gate is seen every day; it sets the tone for whether the tool feels institutional or thrown-together.

## 1. Command-presence identity block

Product/org name in "command caps" — uppercase, heavy, letterspaced, in the accent color — with a quieter letterspaced sub-line carrying one highlighted token (version, hull number, org unit):

```css
.gate-id{position:relative;padding-bottom:var(--sp-4);margin-bottom:var(--sp-5)}
.gate-ship{margin:0;font-size:var(--fs-xl);font-weight:800;letter-spacing:.14em;
  text-transform:uppercase;color:var(--accent);text-shadow:0 3px 14px rgba(0,0,0,.6);text-wrap:balance}
.gate-sub{margin:var(--sp-1) 0 0;font-size:var(--fs-sm);letter-spacing:.18em;
  text-transform:uppercase;color:var(--mut)}
.gate-sub .sub-key{color:var(--accent-2);font-weight:700}   /* the one highlighted token */
```

Numbers: `.14em` tracking on the title, `.18em` on the smaller sub-line (smaller type wants *more* tracking), `text-wrap:balance` so a two-line name breaks evenly.

## 2. Keyline echo — the gate and the app read as one product

The gradient hairline under the identity is the **same** hairline the in-app header uses. That single repeated element is what makes login → app feel continuous:

```css
.gate-id::after{ /* same gradient hairline as header.top::after */
  content:"";position:absolute;left:14%;right:14%;bottom:0;height:2px;
  background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.7}
```

The gate cards echo it again as a hairline top edge, plus a whisper of accent in the surface:

```css
.gate .card{position:relative;overflow:hidden;
  border-color:color-mix(in srgb, var(--accent) 14%, var(--bd));
  background:linear-gradient(180deg, color-mix(in srgb, var(--accent) 4%, var(--bg2)), var(--bg2) 46%)}
.gate .card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.55}
.gate .card h3{font-size:var(--fs-sm);font-weight:700;letter-spacing:.14em;
  text-transform:uppercase;color:var(--accent)}
```

`color-mix()` percentages are the discipline: 14% accent in the border, 4% in the surface — present, never loud.

## 3. Demotion hierarchy for secondary and scary actions

One primary action per card; everything else steps down a full visual register per step:

| Rank | Action | Treatment |
|---|---|---|
| 1 | Sign in | `.primary` button |
| 2 | New-user sign-up | small quiet button, same row |
| 3 | Forgot PIN / recovery | plain **text link**, muted, dotted underline |
| 4 | Break-glass admin reset | `<details>` **disclosure**, muted summary; body only appears on open |

```css
.gate-alt{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3);margin-top:var(--sp-3)}
.gate-recover{font-size:var(--fs-sm);color:var(--mut);text-decoration:none;
  border-bottom:1px dotted color-mix(in srgb, var(--mut) 60%, transparent);padding-bottom:1px}
.gate-recover:hover{color:var(--accent-2);border-color:var(--accent-2)}

/* break-glass: findable, but demoted to a muted disclosure */
.gate-breakglass{margin-top:var(--sp-5)}
.gate-breakglass summary{display:inline-block;cursor:pointer;list-style:none;
  font-size:var(--fs-xs);color:var(--mut);letter-spacing:.04em;
  border-bottom:1px dotted color-mix(in srgb, var(--mut) 60%, transparent)}
.gate-breakglass summary::-webkit-details-marker{display:none}
.gate-breakglass-body{margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);text-align:left;
  border:1px dashed var(--bd);border-radius:8px;background:var(--bg2)}
```

```html
<details class="gate-breakglass"><summary>Recovery / Reset Admin Setup (break-glass)</summary>
  <div class="gate-breakglass-body">
    <p class="muted">What this does and what it does NOT touch.</p>
    <button class="bad sm" onclick="resetAdminSetup()">Reset Admin Setup</button>
  </div>
</details>
```

The point of the `<details>` demotion: destructive recovery must be **findable without support** (it's an offline/self-hosted tool — there's no help desk) but must never visually compete with sign-in. A dashed-border body signals "maintenance hatch, not a feature."

Also: `.gate-msg:empty{display:none}` — status/error `<p>` slots collapse until they have content, so empty message holders don't leave gaps.

## 4. Entrance

Gate children stagger in via insertion-triggered keyframes with a capped tail — zero JS, since the gate is shown by un-hiding/re-rendering. See `dependency-free-motion-layer.md` §3–4:

```css
@media (prefers-reduced-motion: no-preference){
  @keyframes m-gate-in{from{opacity:0;transform:translateY(6px)}}
  .gate .center>*{animation:m-gate-in var(--mo-slow) var(--mo-out) both}
  .gate .center>:nth-child(2){animation-delay:80ms}
  .gate .center>:nth-child(3){animation-delay:160ms}
  .gate .center>:nth-child(4){animation-delay:220ms}
  .gate .center>:nth-child(n+5){animation-delay:260ms}
}
```

## Assumes / adapt

- Assumes a tokenized theme (`--accent`, `--accent-2`, `--bg2`, `--bd`, `--mut`, spacing/type scales). The treatment is *entirely* token-derived — no new colors — which is why it reads as the same product.
- `color-mix()` needs a 2023+ browser; for wider support precompute the tints.
- The "command caps" register fits institutional/ops tools; a consumer product would soften tracking and weight, but the keyline echo + demotion hierarchy transfer as-is.
- Wrong-credential feedback: pair with the motion layer's `shake` (same class, per-selector keyframe binding).
