# Canvas UI — WebGL shader effects over live HTML (studio hero-effect kit)

**External library** by David Hidalgo (`DavidHDev`, author of React Bits). Not harvested internal code — this file is the **studio playbook** for reaching for it: what it is, how to add it, the one rule that keeps it safe on real client traffic, and the license line.

**Repo:** https://github.com/DavidHDev/canvas-ui · **Docs/playground:** https://canvasui.dev

## When to reach for it
A **single hero moment** on a new or current client site that needs a "how'd they do that" GPU effect — fire, liquid, glass refraction, particle dissolve, glitch — painted over the *live, still-interactive* page. Homepage hero, drop/launch page, campaign landing. **Never** wrap a whole site, a checkout flow, or anything a low-power phone must scroll through.

Reach for our existing **GSAP** default for scroll/entrance/timeline motion (`animation-skills-pack`), **React Bits / Magic UI** for animated layout components, and **this** only for the GPU shader-over-DOM layer nothing else gives us.

## How to add it (copies SOURCE into the target repo — we own the copy)
```bash
# React target
npx shadcn@latest add https://canvasui.dev/r/liquid-react.json
# swap: liquid -> any component below · -react -> -vue | -svelte | -solid | -preact | -vanilla
```
No package to install, no version to pin. The component (TS engine `*Vanilla.ts` + GLSL shaders + framework wrapper + demo) lands in the repo and is ours to retheme/rename/edit. Registry speaks the **shadcn protocol**, so agents with the shadcn MCP server can browse + install directly.

## The 34-component roster (each ships React/Vue/Svelte/Solid/Preact/vanilla)
- **Fluid & Motion** — Liquid, Ripple, Cloth, Droplets, Bubble, Displacement
- **Fire & Energy** — Blaze, Flame Wrap, Force Field, Laser
- **Glass & Optics** — Glass, Frost, Magnify, Bend, Peel, Clouds
- **Retro & Glitch** — VHS, Glitch, Retro Dither, Asciify, Decrypt Reveal, Glyph Rain
- **Particles & Structure** — Particle Reveal, Particle Scroll, Shatter, Grid, Hex Float, Canvas
- **3D (Three.js)** — ASCII Object, Glass Object, Particle Object, Dithered Object, Liquid Object

## The one rule that keeps it safe on client traffic — DESIGN TO THE FALLBACK
Two rendering paths, and **most real visitors get the second one**:
1. **HTML-in-canvas** (full DOM-as-texture warp) — **Chrome only**, behind `chrome://flags/#canvas-draw-element`. Lifted for *your* visitors **only** if you ship an **origin-trial token** — and those **expire** (treat like our token-staleness memories: if we ever ship one, it needs a renewal reminder). Otherwise off.
2. **WebGL overlay fallback** — every modern browser. **This is the real deliverable.** 3D/Three.js components work everywhere.

So: prototype and screenshot **without** the Chrome flag — that's what the client's audience sees. Full warp = a Chrome bonus, never the thing we promise. **Mobile → serve a static image** (GPU/battery).

Built-in hygiene (why it clears our CRAFT bar): runs on GPU **outside React's render cycle**, **pauses off-screen**, cleans up on unmount, respects `prefers-reduced-motion`. Still gate every use through `design-auditor` + `performance-engineer` (Core Web Vitals).

## License — safe for client work, NOT for a resold product
**MIT + Commons Clause.** ✅ Free in client sites, commercial included — copy in, edit, ship. ❌ Cannot **resell/redistribute the library itself** (or a thin rename of it) as an Elevare product/template. A sellable effects library would need clean-room original shaders — see the goal split in memory `canvas-ui-webgl-effects-kit`.

## Assumes / adapt
- Assumes a modern bundler (Next.js/Vite) for the framework wrappers; vanilla variant is dependency-free for static/HTML clients.
- Retheme shader colors to the client's brand tokens — don't ship the demo palette.
- One effect per page. Confirm the fallback render before committing to any client repo.
