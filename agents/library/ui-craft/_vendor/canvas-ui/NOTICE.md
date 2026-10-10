# Vendored: Canvas UI (third-party source — keep this NOTICE with the code)

These `*.ts` engine files were copied **exactly** from Canvas UI so the studio has a working
local copy to adapt per client. They are **third-party source**, not original Elevare code.

- **Upstream:** https://github.com/DavidHDev/canvas-ui — https://canvasui.dev
- **Author:** David Hidalgo (`DavidHDev`)
- **License:** MIT + Commons Clause

## What this license lets us do
- ✅ Copy into client projects, edit/improve, ship — commercial included.
- ✅ Retheme, rename, refactor for a specific client build.

## What it does NOT let us do
- ❌ Sell/redistribute these files (or a renamed/"improved" fork) **as a product or template**.
  Improving a copy does **not** reset the license — a derivative is still MIT + Commons Clause.
- To get something Elevare can *sell*, write **original** shaders clean-room (don't copy these),
  per memory `canvas-ui-webgl-effects-kit`.

## MIT retention requirement
When we drop any of these into a client repo, keep an attribution line (a one-line comment at the
top of the file, or a repo `THIRD_PARTY_NOTICES` entry) crediting Canvas UI / David Hidalgo. MIT
requires the copyright notice survive in copies.

## Files here
- `components/canvasui/LiquidVanilla.ts` — fluid/liquid trail sim (984 lines, zero deps)
- `components/canvasui/FrostVanilla.ts` — frosted-glass optics (1192 lines, zero deps)
- `components/canvasui/BlazeVanilla.ts` — fire/energy (678 lines, zero deps)

All three: pure WebGL/GLSL, **no dependencies, no network calls, no eval/env access** (scanned on
copy, 2026-08-17). Framework wrappers (React/Vue/Svelte/Solid/Preact) are added per project via
`npx shadcn@latest add https://canvasui.dev/r/<component>-<framework>.json`.
