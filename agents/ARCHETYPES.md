# Elevare Studio — Design Archetypes (which benchmark applies to THIS job)

[CRAFT.md](CRAFT.md) is the universal craft bar — type, space, color, motion, states. It applies to everything. But its named benchmark (Linear, Stripe, Vercel, Claude) is **one archetype: the product-tool**. Measuring every job against it is why studios ship a bar, a salon, and a fashion drop that all look like a SaaS dashboard with a different accent hue.

**This file fixes the calibration.** Before any visual work starts, the job declares an archetype. The archetype decides the reference set, the density, the role of type vs image, and what "signature moment" means here. CRAFT is the floor; the archetype is the direction.

## The rule

1. **Declare the archetype at kickoff, in writing.** `art-director` owns the call; `product-strategist` proposes it in the brief; every downstream agent (ui-designer, design-engineer, motion-designer, frontend-builder, design-auditor) builds and audits against it. An undeclared archetype defaults to **A. Product-tool**, and that default is the bug.
   - **★ IF THE REPO ALREADY ANSWERS THIS, THE ARCHETYPE IS *READ*, NOT INVENTED — and a WRONGLY-declared archetype is the same bug as an undeclared one, wearing more confidence.** Before anyone proposes an archetype, grep the project for its own direction doc (`docs/design/DIRECTION.md`, `BRAND.md`, an art-direction one-pager, a PLAN §archetype section) and quote the line. The conductor **proposes**; `art-director` **confirms against that document**; neither may coin one when the repo already binds it. Whyza, 2026-09-06: the conductor opened the job by declaring "A, product-tool" for a surface its own `docs/design/DIRECTION.md` §1 binds as **"E with one A component"** — on a page whose direction doc had *pre-committed to blocking drift toward product-tool at the gate*. Every downstream brief then carried the wrong reference set (Linear/Stripe/Vercel instead of TikTok/Instagram/Bluesky to beat, Claude/Arc for craft), and it survived until art-director read the direction doc instead of the brief. A wrong archetype is the most expensive premise error available: it is copied verbatim into every design brief in the wave, and it is caught only by an agent reading a document nobody pointed it at.
   - **A direction doc that names a surface which no longer exists is a finding, not furniture.** Whyza's table still binds an "Early-access page" that this job deleted. Whoever retires or replaces a surface amends the direction doc in the same change; the next conductor reads that table as current.
2. **Commit to ONE signature moment.** Every recent Awwwards Site of the Day winner shares this: *one* interaction or visual that makes you stop scrolling — not twenty effects. Name it at kickoff ("the drop card flips to reveal the plate", "the hero film scrubs to the shoe's sole"), build it to the highest craft in the project, and keep everything else quiet so it lands. Twenty small effects read as a template; one perfect one reads as a studio.
3. **Blending is allowed; drifting is not.** A brand can be "editorial commerce with a product-tool checkout" — say so, and name which surfaces follow which. What kills work is unnamed drift, where the PDP is Nike and the cart is Stripe by accident.
4. **The signature moment must survive a mid-range Android.** Immersive craft that only runs on the builder's laptop is not shipped craft. See the performance clause at the bottom — it binds every archetype.

---

## A. Product-tool / SaaS / app
**Reference:** Linear · Stripe · Vercel · Claude.ai · Lovable · Raycast
**Thesis:** *Precision reads as competence.* The interface should feel fast, dense, and inevitable — nothing decorative competes with the work.

- Neutral ramp does 90% of the work; **one** accent, used rarely and meaningfully. Never pure `#000`/`#fff`.
- Dense but breathable: 14–16px UI text, tight 8px-grid rhythm, hairline `1px` low-alpha borders, small radii from a token scale.
- Type is a **grotesque/geometric workhorse** — clarity over character. Display moments are restrained, not editorial.
- Motion is **functional only**: 150–250ms, ease-out enters, spatial explanation of state change. Zero decorative wiggle.
- Keyboard-first: every action has a focus path; shortcuts where the surface earns them; `focus-visible` designed, not default.
- Empty/loading/error states are **written with real copy** and are often the most memorable surfaces in the product.
- **Signature moment lives in interaction, not imagery** — a command palette, an inline transition, an optimistic update that feels instant.

**Must not borrow:** full-bleed lifestyle photography as chrome, uppercase condensed display type, scroll-jacking, hero video.

---

## B. Editorial commerce / brand-led retail
**Reference:** Nike · Adidas · SSENSE · Aesop · Bottega Veneta · Patagonia · Glossier · Oatly
**Thesis:** *The product is the demo.* Static product grids convert worse than interactive product moments. The page sells a feeling and then removes every obstacle to buying.

- **Pick a camp and commit.** 2026 editorial commerce has split into two, and mixing them is mush:
  - **Luxury restraint** (Aesop, Bottega, Patagonia) — near-monochrome, enormous whitespace, one serif or one refined grotesque, imagery does everything, chrome nearly invisible.
  - **Challenger maximalism** (Poppi, Glossier, Oatly) — saturated brand color as ground, playful display type, dense collage, voice-forward copy.
- **Type is a hero, not a label.** Large display, tight leading (1.0–1.1), negative tracking, often uppercase condensed. It must feel *set*, not scaled up.
- **Full-bleed image and film**, edge to edge, with content max-widths only for reading passages. Product photography shows the product **as it actually is** — clear, well-lit, multiple angles, in real-use context. No fantasy renders that the box won't match.
- **Homepage storytelling → PDP depth → post-purchase** is where the margin lives. Budget design effort in that order. A gorgeous homepage over a thin PDP is a losing trade.
- **PDP is the real product:** hero film or scroll-driven sequence, size/fit truth, material and care, real reviews with photos, shipping/returns answered *before* they're asked, sticky add-to-cart on mobile.
- **Navigation:** typography-forward mega-menu with thumbnail-image featured collections — routing that reads as editorial, not as a sitemap.
- Motion is **cinematic**: scroll-driven reveals, film loops, product rotation. Still obeys `prefers-reduced-motion` at all three layers (CSS, JS, canvas — see CRAFT).

**Must not borrow:** dashboard density, dense card grids of equal weight, SaaS gradient meshes, accent-colored CTA buttons floating over neutral cards.

---

## C. Immersive / award-tier
**Reference:** Awwwards SOTD & FWA winners · Apple product pages · Active Theory
**Thesis:** *Turn the visitor from observer into participant.* Reach for this only when the brand's whole point is spectacle, and the budget covers doing it properly.

- Immersive 3D/WebGL is now the majority rendering strategy among Awwwards Site of the Day winners (≈61% in Q1 2026, up from ≈23% in 2024) — it is the primary layer, not an enhancement. Three.js is the default engine; route via `web3d-integration-patterns` → `threejs-webgl` / `react-three-fiber`.
- **Interactivity over animation:** let the user inspect the product, shift the lighting, walk the space, drive the terrain. A cinematic that plays *at* the user is a lesser version of one they steer.
- **One signature moment, aggressively.** The tell of an amateur immersive site is many effects; the tell of a winner is one unforgettable one with silence around it.
- **★ LOOK FOR THE SIGNATURE MOMENT THE LIBRARY IS ALREADY RENDERING AND THROWING AWAY, BEFORE YOU ADD ONE.** Thames Coast's map flight across the Thames was not built; it was *uncovered*. MapLibre's own `flyTo` already arcs through an apex framing both banks, and destroys that frame by interpolating pitch and bearing linearly on the same eased progress — the camera is rotating at exactly the moment the composition arrives. Holding pitch and bearing flat across the middle of the flight was the whole moment. **A default animation curve is a taste decision someone else made for you, usually for the general case, and the best moment in a scene is frequently one the library is actively spoiling.** Two riders the same wave paid for: (1) a hold written against *eased* progress drifts (an ease-out passes k=0.8 at ~45% of wall clock) — compose against **wall clock**, and measure the result off the shipped DOM through the library's own readouts rather than a debug hook; (2) **pitch buys nothing in flat terrain unless the composition turns the subject's long axis into DEPTH** — a region with no relief gets its drama from the framing, not from the tilt, and one camera pose will not serve both a wide and a narrow container, so compose the narrow pose separately and pick it by measured container width.
- **Performance under pressure is a judging criterion, not a nice-to-have** — complex visuals that load fast and stay smooth on mid-range devices. Budget it: lazy-load the scene, pause offscreen, cap DPR ≤2, throttle to 30fps for ambient layers, ship a composed static frame under reduced motion (never a blank canvas).
- Always ship the **non-WebGL path**: the content, nav, and conversion must work with the canvas removed entirely.

**Must not borrow:** unmotivated 3D blobs, WebGL applied to a business whose customer is trying to find a phone number.

---

## D. Local trust / service business
**Reference:** the best-run local operators, not agencies — plus Google Business Profile as the real competitor
**Thesis:** *Conversion over spectacle.* Someone is standing in a parking lot on a phone deciding whether to call you. Every design decision serves that.

- **Above the fold, on a phone:** what you do · where you are · one proof signal (licensed/insured, years, rating) · one primary action (Call / Book / Order). Nothing else.
- **A trust signal within view of every major CTA.** Reviews that name a specific outcome, name the reviewer's location, and carry a photo beat a star average. Put one next to the button, not on a testimonials page nobody visits.
- **NAP in the header and footer of every page** — phone, address, hours. It tells a human you're real and tells Google you're local.
- **Tap-to-call and tap-for-directions are first-class controls**, not text. Hours must show *today's* hours, and say "Open now / Closed" honestly.
- **Under 2 seconds or they're back on the map results.** This archetype has the least tolerance for heavy hero video and the most to lose from it.
- Individual **service pages** (one per service, one per service area) beat a single services list for both conversion and local search.
- Craft still applies — restraint, real photography of the actual place and actual people, no stock. A local site can absolutely be beautiful; it just may not be *slow*.

**Must not borrow:** immersive 3D, scroll-jacking, hero video that delays LCP, a contact form as the only path to a human.

---

## E. Content / media / publication
**Reference:** The Verge · Bloomberg · NYT interactives · Stripe Press
**Thesis:** *Reading is the product.* Everything is judged by whether a long piece is a pleasure to read on a phone.

- Measure capped at 60–75ch, body 17–19px, `line-height` 1.55–1.65, real vertical rhythm between elements. This archetype punishes type sloppiness harder than any other.
- **Hierarchy must survive skimming:** section heads, pull quotes, captions, and figure treatment are designed components, not afterthoughts.
- **Monetization slots are part of the design system** — ad units, sponsor cards, and subscribe prompts get designed placements and reserved space (zero CLS), never injected into whatever gap exists.
- Article furniture is craft: byline, dateline, reading time, share, related, and a genuinely useful end-of-article next step.
- Motion is nearly absent in the reading column. Save it for interactives and the index pages.

**Must not borrow:** heavy scroll animation inside body copy, autoplaying media beside text, carousels as the primary index.

**★ E ALSO COVERS SHORT-FORM AND USER-AUTHORED SURFACES — read the FRAME rules, not the MEASURE rules.** Everything above is written for a long column of the house's own prose, and that narrowness is a live cause of archetype drift: a conductor holding a social feed, a card wall, a forum, a comments surface or a personal profile finds nothing here that fits, and defaults to **A**, which is the bug rule 1 names. Whyza 2026-09-06 did exactly that, and the project's own direction doc had to write the correction itself: *"Whyza's content is short-form cards, not columns, so the E rules that bind here are the frame rules, not the measure rules."* So, for short-form / user-authored E:
- **The measure rules do not bind.** 60–75ch, 17–19px body and reading rhythm are for columns. A card wall is judged on scan density and how many real items reach the first screen.
- **The frame rules bind harder.** The chrome is quiet so the content is loud; hierarchy survives skimming; motion lives in the transitions BETWEEN surfaces, never inside the content.
- **When the content is USER-AUTHORED, the app is the gallery wall and the user is the painter.** The house design system stops at a named scope boundary (`.pf-root` on Whyza) and the person's own palette, type and effects own everything inside it. The two drifts to block are the mirror pair: the app going loud to compete with its users (rainbow chrome, gradient buttons), and the app imposing product-tool restraint on a canvas that is supposed to be maximalist (neutral ramps, one-accent discipline, a grey sidebar). **Restraint applied to someone else's self-expression is drift, not taste** — the discipline goes into the chrome and the contrast floor, never into the person's colours.
- **The one A component that stays A:** wherever the product prints a number about the user, precision reads as honesty. Tabular numerals, real empty/loading/error copy, designed focus. Blend it by surface and name which is which (rule 3).

---

## F. Conversational / consumer AI
**Reference:** Claude.ai · ChatGPT · Perplexity
**Thesis:** *Calm at low density.* The content is generated and unpredictable, so the frame must be quiet enough to hold anything.

- Single-column focus, generous whitespace, a **narrow measure even on wide screens** — the composer and the transcript are the whole interface.
- **Latency is the aesthetic.** Streaming cadence, token rhythm, a considered thinking state, and instant-feeling submit matter more than any static styling choice.
- **Empty state carries the personality** — it's the most-seen screen in the product and the one place voice belongs.
- Message-level affordances (copy, retry, edit, branch) appear on hover/focus without cluttering the resting state.
- Everything generated must be **legible in both themes and at any length** — code blocks, tables, long lists, images. Test with hostile content, not sample content.

**Must not borrow:** marketing gradients, dense dashboard chrome, decorative motion inside the transcript.

---

## G. Internal operator console (staff-facing operations)

**For:** the software a business runs on, used by its OWN people — booking/scheduling boards, POS and tills, dispatch, equipment control, back-office ops (Playbook N deliverables). The user is standing up, mid-shift, often on a shared device.

**Benchmark against:** Linear (density + keyboard speed), Square's seller dashboard and register, Toast/Fresha operator views, ServiceTitan. NOT against marketing sites — an ops console judged by archetype D's warmth is broken, and vice versa.

**The bar:** information density over decoration — the operator scans, never scrolls marketing prose; sub-100ms perceived interactions on the actions done 200×/day; keyboard-first on desktop, thumb-reach-first on tablet/till; role-based VIEWS (owner sees money, staff sees their queue) not just role-based hiding; every state visible (what's booked, what's running, what's stuck) without a click; **degraded mode is part of the design** — the till keeps selling offline and says so plainly; short-auth (PIN) for shared devices; large tap targets for wet/gloved hands where the vertical calls for it.

**Signature moment lives in flow, not on landing:** the one interaction that feels unreasonably good is the most-repeated one — the 2-tap checkout, the drag-to-reschedule, the one-glance morning board.

**Must not borrow:** hero sections, scroll animation, marketing gradients, anything that costs a frame during a transaction. Motion only as state feedback (150ms, transform/opacity).

## Binding clause — performance is part of every archetype

Whichever archetype is declared, the numeric budgets in [STANDARDS.md](STANDARDS.md) (LCP / INP / CLS at p75, and the archetype-specific weight budget) are a **gate, not an aspiration**. An immersive site that misses them is not award-tier, it's unfinished; a local site that misses them is losing the customer it was built for.

## The archetype gate (design-auditor + art-director run this before ship)

1. Which archetype was declared? Does the built surface actually read as that archetype, or did it drift toward Product-tool?
2. What is the one signature moment? Point at it. Is it the highest-craft thing in the project, and is there enough quiet around it to land?
3. Is anything borrowed from the "must not borrow" list of the declared archetype?
4. Do the numeric perf/a11y budgets pass on the archetype's real target device?
