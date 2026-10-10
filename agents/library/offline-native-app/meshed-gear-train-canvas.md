# Meshed gear train (canvas) — teeth that actually slot into valleys

The exact math for drawing two or more spinning gears whose teeth **mesh for all `t`** — pitch-radius contact spacing, speed ratio, counter-rotation, and the phase-lock so a tooth always enters the facing valley. Most drawn "gears" overlap or clip because they skip one of these four; this recipe closes all of them. Harvested from a machinery-themed decorative canvas scene (verified visually across the full loop).

**When to reach for it:** any mechanical-themed canvas/SVG/motion art — gears, cogs, clockwork, "engineering/automation" brand animations, loading spinners with personality. The math is renderer-agnostic. Pairs with `battery-lean-canvas-decorations.md` (the loop that hosts it) — the whole train is a pure function of `t`.

## The four rules

With a tooth profile whose **tips sit at `R + tip`** and **valleys at `R`** (so the *pitch radius* ≈ `R + tip/2`):

1. **Center spacing = sum of pitch radii.** For `tip = 4`: `dist(A,B) = (R_A + 2) + (R_B + 2)`. Closer clips; farther gaps.
2. **Angular speed ∝ 1/teeth.** If the driver A turns at `base` rad, follower B turns at `base * N_A / N_B`. (Invariant: `ω · N` — teeth per second through the contact point — is equal for every gear in the train.)
3. **Meshed neighbors counter-rotate:** B's rotation term is `-base * N_A / N_B`.
4. **Phase-lock at t=0:** orient the driver so a tooth **tip** points along the center-line direction `φ` toward the follower, and start the follower with a **valley** facing back: initial angle `φ + π − π/N_B` (π/N is half a tooth pitch — that's the tip→valley offset). Locked at t=0 + rule 2 ⇒ locked for all `t`.

Placing a second follower C around the same driver: put it `k` whole tooth-pitches around A — `φ_C = φ_B + k · (2π / N_A)` — so a driver tooth tip also points at C, then apply rule 4 with `N_C`.

## The code

```js
// Tunables: R* = valley radius, N* = tooth count, tip height = 4 → pitch radius = R + 2.
var RA = 17, NA = 12,  RB = 11, NB = 8,  RC = 8, NC = 6;
var base = t * 0.5;                          // driver rotation (rad) — any pure function of t
var phiB = -0.60;                            // direction A -> B
var phiC = phiB + 2 * (2 * Math.PI / NA);    // C sits two tooth-pitches around A
var dAB = (RA + 2) + (RB + 2), dAC = (RA + 2) + (RC + 2);          // rule 1
var bx = cx + Math.cos(phiB) * dAB, by = cy + Math.sin(phiB) * dAB;
var gx = cx + Math.cos(phiC) * dAC, gy = cy + Math.sin(phiC) * dAC;
// A tooth tip points along phiB (and phiC) at t=0; B and C start with a
// valley facing A, so the mesh holds for all t.                    // rule 4
drawGear(ctx, cx, cy, RA, NA, phiB + base,                              colorA);
drawGear(ctx, bx, by, RB, NB, phiB + Math.PI - Math.PI / NB - base * NA / NB, colorB);  // rules 2+3
drawGear(ctx, gx, gy, RC, NC, phiC + Math.PI - Math.PI / NC - base * NA / NC, colorC);

function drawGear(c, x, y, R, teeth, ang, color) {
  c.save(); c.translate(x, y); c.rotate(ang);
  c.fillStyle = color;
  c.beginPath();
  for (var i = 0; i < teeth; i++) {
    var a0 = (i / teeth) * Math.PI * 2;
    var a1 = ((i + 0.5) / teeth) * Math.PI * 2;
    var a2 = ((i + 1) / teeth) * Math.PI * 2;
    c.lineTo(Math.cos(a0) * (R + 4), Math.sin(a0) * (R + 4));   // tip
    c.lineTo(Math.cos(a1) * R,       Math.sin(a1) * R);         // valley
    c.lineTo(Math.cos(a2) * (R + 4), Math.sin(a2) * (R + 4));   // next tip
  }
  c.closePath(); c.fill();
  c.fillStyle = "#0d0d0d";                                       // hub hole
  c.beginPath(); c.arc(0, 0, R * 0.35, 0, Math.PI * 2); c.fill();
  c.restore();
}
```

Note the tooth profile puts a **tip at local angle 0** — that's what rule 4's "tip points along φ when gear angle = φ" relies on. If you round or reshape the teeth, keep tip-at-angle-0 or re-derive the phase offset.

## Assumes / adapt

- Triangular teeth (straight tip→valley→tip lines), fine at decoration scale. Real involute profiles need the same four rules but a different tooth path.
- `tip = 4` is baked into the `+2` pitch-radius terms — change tip height and update both (`pitch = R + tip/2`).
- Verify the mesh across a full revolution of the *slowest* gear (the train's visual period), not just a few seconds: `t` up to `2π · N_slow / (baseRate · N_A)` — a near-miss phase error accumulates visibly at the far end of the cycle. The purity harness + a rendered sweep in `battery-lean-canvas-decorations.md` covers this.
- Speeds: keep `base` slow (`t * 0.5` rad ≈ 1 rpm-ish feel); small gears in the train spin `N_A/N_C` times faster and read frantic quickly.
