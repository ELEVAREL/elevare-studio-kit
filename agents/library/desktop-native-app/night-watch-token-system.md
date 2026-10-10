# "Night-watch" dark token system — navy ground + single amber accent (+ one mint)

**When to reach for it:** you need a **dark, serious, trustworthy** visual system for a security / monitoring / NVR / infra / developer-tool / "always-on watching over you" product — and you want the site, the app, and the installer to read as **one product**. This is a disciplined dark palette: a night-navy ground with raised surfaces, hairline borders, exactly **one amber accent** (used sparingly so it means "this matters"), and **one mint** spent exactly once (a live/success signal). Reach for it as a starting dark theme whenever the brief is "secure, calm, premium, not another neon-cyberpunk dashboard."

**Assumes / adapt:**
- **The discipline is the value, not the hex codes.** One accent, spent sparingly; one success/live color, spent once; everything else is navy + slate text on hairline borders. Swap amber → your brand accent and it still holds. What breaks the look is *adding a second accent* — resist it.
- **Ships identically across surfaces.** These same `:root` tokens live in the landing site, the app UI, the tray icon (drawn from `--ink` + `--beacon`), and the installer — that's what makes install → app → site feel continuous. Keep one token block; don't fork per surface.
- **Font pairing (optional, matches the reference):** display = *Bricolage Grotesque* (700–800, tight tracking), body/UI = *IBM Plex Sans*, mono/eyebrows = *IBM Plex Mono* (uppercase, wide letter-spacing for that "system readout" label voice). Self-host via [`self-hosted-fonts-fetch.md`](self-hosted-fonts-fetch.md). Any grotesk + humanist-sans + mono trio works.
- **The two easing curves matter:** `--ease` for normal motion, `--spring` (a gentle overshoot) reserved for the *win* moment (checkmark settle, success). Don't spring everything — the overshoot only reads as "earned" when it's rare.
- **Contrast:** `--paper` on `--ink`/`--ink-2` is AA+. `--slate`/`--slate-dim` are for secondary/label text on dark only — check any translucent tints against their real backdrop (see the sibling `offline-native-app/status-type-design-tokens.md` for AA-safe badge tints on translucent fills).
- **Reference:** `D:\SentinelBox\site\index.html` (origin) → mirrored into the app and `D:\SentinelBox\desktop\installer\ui\index.html`.

## The token block (drop into `:root`)

```css
:root {
  /* Ground & surfaces — night-watch navy, layered by elevation */
  --ink:    #10172A;   /* app/page ground */
  --ink-2:  #161F38;   /* card / installer surface */
  --ink-3:  #1E2A49;   /* raised element */
  --line:        rgba(255,255,255,.09);   /* hairline border */
  --line-strong: rgba(255,255,255,.16);   /* emphasized border / top sheen */

  /* The single accent — "the beacon". Spend it sparingly; it means "this matters". */
  --beacon:      #F2A93B;   /* amber */
  --beacon-deep: #E0881C;   /* hover/active */

  /* Text */
  --paper:     #EDF1FA;   /* primary (AA+ on ink/ink-2) */
  --slate:     #8C98B6;   /* secondary */
  --slate-dim: #7A88AD;   /* labels / tertiary */

  /* Live/success — spent EXACTLY ONCE (the check, the "online" dot) */
  --mint: #67D6A6;

  /* Motion */
  --ease:   cubic-bezier(.2,.7,.2,1);      /* normal */
  --spring: cubic-bezier(.34,1.56,.64,1);  /* gentle overshoot — reserve for the WIN */
}
```

**Signature ground gradient** (the "watching from above" glow), and the CTA / hairline-sheen treatments that ride these tokens:
```css
body {
  background: radial-gradient(130% 110% at 50% -25%, #1a2340 0%, #10172a 55%, #0b1122 100%);
  color: var(--paper);
  font-family: "IBM Plex Sans", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
/* top hairline sheen on a raised card */
.card::before { content:""; position:absolute; inset:0 0 auto 0; height:1px;
  background: linear-gradient(90deg, transparent, var(--line-strong), transparent); }
/* the one amber CTA */
.btn { background: var(--beacon); color:#23170A; border:0; border-radius:10px;
  box-shadow: 0 10px 26px -12px rgba(242,169,59,.6);
  transition: transform .15s var(--ease), background .15s var(--ease); }
.btn:hover { background: var(--beacon-deep); transform: translateY(-1px); }
/* eyebrow / "system readout" label voice */
.eyebrow { font-family:"IBM Plex Mono",monospace; font-size:11px;
  letter-spacing:.2em; text-transform:uppercase; color: var(--slate); }
```
