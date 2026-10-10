# Elevare Studio — Craft Bar (top-tier or it doesn't ship)

The benchmark is the best product design on the web: **Linear, Stripe, Vercel, Claude.ai, Family, Arc, Framer, Apple**. Everything we make should be able to sit next to those without embarrassment. This file is the concrete, opinionated bar. "Looks fine" is a failure state — it must look *considered*.

The difference between top-tier and generic is almost never a big idea — it's a hundred small decisions made correctly and consistently. Sweat them.

**But this file is the floor, not the direction.** The benchmark named above is *one archetype* — the product-tool. Measuring a fashion drop, a restaurant, an award-tier immersive site, or a newspaper against Linear is how everything ends up looking like a SaaS dashboard in a different accent hue. **Before designing anything, declare the archetype from [ARCHETYPES.md](ARCHETYPES.md)** (product-tool · editorial commerce · immersive · local trust · content/media · conversational · internal operator console) — it sets the right reference set, density, and the role of type vs image. CRAFT still applies underneath all seven. For sector-specific requirements (the money moment, required sections, schema, compliance landmines), read [INDUSTRIES.md](INDUSTRIES.md).

## Typography (the #1 lever)
- **A real modular scale.** Pick a ratio (1.2 minor-third for dense UI, 1.25–1.333 for marketing) and derive every size from it. No arbitrary font-sizes.
- **Display type:** tight leading (`line-height: 1.0–1.1`), negative tracking (`-0.02em` to `-0.03em`) on large headings, optical sizing on variable fonts. Big type should feel set, not scaled-up body.
- **Body:** `line-height 1.5–1.65`, measure capped at **60–75ch**, size 16–18px. Never justify. Never full-viewport-width paragraphs.
- **Pairing:** at most two families with real contrast (a characterful display + a clean grotesque/geometric), or one great variable family used across weights. Avoid default system-only stacks for brand surfaces.
- Details: tabular-nums for figures/prices, true quotes/apostrophes, non-breaking spaces before units, hanging punctuation where supported, `text-wrap: balance` on headings.

## Space & layout
- **8px base grid** (4px for fine tuning). Every margin/padding/gap is a scale step, not a one-off.
- **Whitespace is the product.** Elite sites are generous and confident with space; density is a deliberate choice, not an accident. Section rhythm should be obvious and consistent.
- Strong grid + alignment; optical alignment beats mathematical when they disagree. Intentional asymmetry reads as designed; accidental asymmetry reads as broken.
- Content max-widths and consistent gutters; nothing touches the viewport edge on desktop without reason.

## Color
- **Restrained palette:** a considered neutral ramp (8–12 steps, subtly warm or cool — never pure `#000`/`#fff`), one confident accent, semantic states. Most of the page is neutrals; accent is rare and earns attention.
- Build the ramp with consistent perceptual steps (think OKLCH); derive hover/active/subtle from tokens, not new hexes.
- **Dark mode is not inverted light mode** — re-tuned surfaces, lowered accent chroma, elevation via lighter surfaces not just shadows. Ship parity or don't claim it.
- Contrast: body/UI text **AA 4.5:1** minimum (compute it). Elite ≠ low-contrast grey mush.

## Motion (the polish layer top sites have and clones don't)
- **Purposeful only.** Motion explains a change (enter/exit, state, spatial relationship). No decorative wiggle.
- **Timing:** UI transitions 150–250ms; ease-out for enters, ease-in for exits; a subtle spring for playful/tactile moments. Micro-interactions on hover/press/focus (2–6px, 100–150ms).
- Orchestrate: stagger list/section reveals ~40–80ms; animate transform/opacity only (never layout props). Respect `prefers-reduced-motion` fully — and "fully" means **three layers**: (1) media-wrap every CSS keyframe/transition, (2) an explicit JS `matchMedia` check for WAAPI/Canvas/rAF motion (the CSS media query never reaches JS-driven animation), (3) canvas/WebGL decorations render a **composed static frame** under reduced motion — never a blank surface (a blank-canvas gap survived two audit waves because only the CSS layer was checked).
- **The payoff beat must land AND hold.** A success/completion moment (activation done, install finished, purchase confirmed) is the emotional climax — don't let it evaporate in <1s. Play the reveal, then hold ~800ms of stillness on the resolved state before auto-advancing or handing off. A climax that flashes and vanishes under-delivers the whole flow.
- Scroll should feel choreographed, not gimmicky. Parallax and reveals are seasoning, not the meal.
- **No empty frame mid-transition.** A sweep/wipe/slide/split-screen that moves content off-screen must keep the incoming content on-screen before the outgoing leaves (crossfade or overlap the seam) — never a moment where the frame is bare. Invisible at 60fps in a live browser, this becomes a jarring near-empty flash the instant the motion is captured to video/MP4 or hit at a slow frame rate. Verify on the RENDERED output (scrub the frames), not only live playback.

## Detail & states (where clones fall apart)
- Every interactive element has **hover, active, focus-visible, disabled, loading** states. Every list/collection has **empty, loading, error** states written with real copy.
- Hairline borders (`1px` at low-alpha), consistent radii from a token scale, soft layered shadows (multiple low-alpha layers > one hard shadow). Crisp 1px lines on HiDPI.
- Pixel alignment; consistent icon sizing/stroke; optical centering. Iconography from one set, one stroke weight.
- **No lorem, no placeholder emptiness.** Real copy, real numbers, real imagery or intentional generative/tonal art.
- **Measure the POPULATED state — an empty band always measures clean.** HausAI's plan title block collided with itself and clipped both headline figures on *every* generated plan at *every* desktop width (`CONDITIONED AREA` rendered as 30 of the 87px it needed; the price range cut at the cell edge; two labels overprinting into `CONDITIONESD`). **Four gates walked past it**, because each looked at that band before a plan had ever landed in it, and the empty state's cells measure fine. It was not a long-content edge case — a 3-room cabin produced the identical collision. Lay out and audit every container against real content at its real extremes: longest label, largest number, most rows, and the *restored/reloaded* state (a first-run onboarding rendering beside a finished 22-room result is the same blind spot). **★ AND A FIXTURE THAT EXERCISES EVERY BRANCH PROVES THE RENDERER *CAN*, NOT THAT PRODUCTION *DOES*.** The $49-report wave built an `extremes.json` carrying one finding per `money_confidence` value, so all three markers were designed, rendered and gate-checked against it, and every lane felt covered. The first real run emitted `reasoned` **6 times out of 6**, and `measured` is structurally unreachable, because it needs the client's traffic and close rate, which the product does not collect and the claims ledger forbids it from claiming. Same wave, same shape: the question-for-owner register was designed assuming questions would be peripheral, and the run flagged ranks 1 and 2. **A three-state visual system with a production distribution of one state is not information, it is decoration plus two dead branches.** Before designing one appearance per enum value, run the real pipeline once and count what it actually emits.
- **A pane-relative element governed by a viewport media query is wrong at every width where the two disagree.** That was the mechanism above: a `drawer:flex-row` **viewport** breakpoint governing a band that lives inside an 818px split pane, so it flipped on the *window* rather than on the space the element actually had. Anything inside a drawer, split pane, sidebar, card, or modal sizes off a **container query** (`@container`), never a viewport breakpoint. Same class: degradation tiers that gate on *area* pass a block that is failing on width alone.

## Feel / performance-as-craft
- Fast is a design property: no layout shift (reserve space), quick LCP, instant-feeling interactions, no jank. A beautiful page that pops and reflows is not top-tier.
- Accessibility is craft, not compliance: keyboard paths, focus order, labelled controls, motion/contrast respect.

## Anti-slop (auto-reject)
Purple→blue gradient defaults; glassmorphism with no purpose; drop-shadow on everything; centered hero over a stock gradient; **emoji as UI icons (🔒🙈🪧 — especially fatal on legal/trust/security surfaces, where they read as toy-grade; use ONE stroked SVG icon set at a consistent stroke weight)**; rainbow accents; generic rounded-everything; unmotivated 3D blobs; AI-writing copy ("elevate", "unlock", "seamless", "in today's fast-paced world"). If it looks like a default template, it isn't done.

**★ EVERY INDUSTRY HAS ITS OWN SLOP SIGNATURE, and the list above only catches the SaaS one.** The purple gradients and glass panels are what generic *startup* work looks like. A generic law firm, restaurant, salon or fence company fails in a completely different way and would pass the list above untouched. So the auto-reject is not a fixed checklist, it is one question:

> **Swap the logo. Could this page belong to any competitor in the same industry?**
> If yes, it has failed, however clean the typography is.

That test is universal and it is the one that matters. The signatures below are worked examples, not the whole set: when you build in an industry not listed, spend ten minutes on four real competitors and write down what they ALL do, because that list is the thing you must not do.

- **Trade and local service** (fence, roofing, plumbing, HVAC, landscaping): stock photography of somebody else's finished work presented as the client's; a "Why Choose Us" band of three or four identical icon-over-heading-over-two-lines cards; trust badges nobody issued ("100% Satisfaction Guaranteed", five gold stars with no review behind them); "Licensed & Insured" as decoration rather than a checked fact; a form demanding eleven fields before it will take a phone call; a service list where every entry is the same paragraph with the noun swapped.
- **Restaurant / food**: a full-bleed hero of a dish that is not theirs; a PDF menu; "farm to table", "passion for flavour"; hours buried three scrolls down when hours and the phone number are the entire reason anyone came.
- **Salon / beauty / wellness**: rose-gold-on-cream with a script font used at 14px where it cannot be read; a stock model who is not a client and does not resemble the clientele; "your journey to radiance"; a price list that hides every price behind "call for pricing".
- **Professional services** (law, accounting, consulting): a stock handshake or glass-tower skyline; "trusted advisors"; partner bios that list credentials and say nothing about who they help; a contact form as the only route to a human.
- **E-commerce / DTC**: a hero carousel; "as seen in" logos nobody licensed; invented urgency counters; five payment-badge icons doing the work that a real returns policy should do.
- **Real estate / fitness / clinics**: a drone shot or gym stock photo that could be anywhere; "state of the art facilities"; a team grid of headshots with no names.

**The fix is always the same and it is never decoration: specificity the competitors cannot copy.** This owner, this street, this week's availability, the actual materials and how they differ, what they will and will not take on, the real constraint they work within. Concrete beats polished, and concrete is the one thing a template cannot fake. It is also usually free: the facts already exist, someone just has to ask for them and be willing to print them.

See [[never-hand-author-logos]] for the related rule on marks, and STANDARDS "Claim-reality parity" for why the specificity has to be TRUE as well as specific.

**The design system must obey its own thesis.** Audit the token/CSS file itself for slop, not just the rendered pages — a "flat surfaces, one accent" brand had amber linear-gradients and colored glow-shadows baked into its own button/empty-state tokens, contradicting the stated direction at the source. If the thesis is flat + one accent, then no `linear-gradient`, no colored `box-shadow` glow, no second accent lives in the tokens. Grep the stylesheet for `gradient` and glow shadows and reconcile every hit against the stated direction.

## Brand marks & favicons (small, matted, right format)
- **★ NEVER hand-author an SVG logo mark. No path data, ever.** Owner verdict 2026-09-05: "our SVG logos look trash." The ladder, in order: **(1)** the client's own existing mark; **(2)** a real image/design tool; **(3)** a clearly-labelled placeholder. A hand-written `<path d="…">` is not step 4 — it is the failure. This binds every agent that produces, animates or gates a mark: a draw-on or morph effect *requires* path data, so if the client supplied raster, there is no draw-on — fade, mask, scale, or set the wordmark in the real typeface instead of tracing it. **design-auditor checks this at the gate**; a hand-authored logo/wordmark/favicon path is a blocker. See [[never-hand-author-logos]].
- **Favicons are tiny — treat them as such.** Ship a purpose-built small mark (≤ ~64px), not the full logo file — a 131KB full-logo favicon is both dead weight and illegible at 16px. Provide the icon sizes (16/32/apple-touch) as an optimized set.
- **Inline brand marks need transparent or vector.** A raster logo on a solid page shows a rectangular seam where its baked-in background meets the surface. Use a transparent PNG or SVG; if it must be raster, matte it to the exact surface color. Never place an opaque-background raster mark on a tinted/cream surface.

## The test before shipping any surface
1. Would this look at home on Linear/Stripe/Vercel/Claude? If not, what specifically is weaker — type, space, color, motion, or detail? Fix that.
2. Is every value a token/scale step, or are there magic numbers?
3. Are all interaction + collection states designed?
4. Does it hold up on mobile, dark mode, keyboard, and slow network?
