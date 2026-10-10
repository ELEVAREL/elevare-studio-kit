# Product launch-kit structure (the 01–10 marketing deliverable skeleton)

**When to reach for it:** you're launching a product/site/app and need the **full marketing package**, not a one-off asset. This is the reusable folder structure + document sequence a `marketing-strategist` hands out and reassembles — market strategy → offer → messaging → copy → SEO → social → email → ads → graphics — so every launch produces a consistent, gate-able kit instead of scattered files. Reach for it at the top of any launch or campaign job to seed the deliverable tree.

**Assumes / adapt:**
- **One numbered markdown file per discipline, in funnel order.** The numbering makes the kit skimmable and forces coverage — a gap in the sequence is a visible gap in the launch. Drop numbers you genuinely don't need (e.g. no paid budget → skip 09), don't renumber the rest.
- **Each file names its owning agent + handoff** at the top (e.g. "Prepared by offer-architect · handoff to sales-closer + client-partner"). That's how the conductor routes the pieces to specialists and knows who consumes each one.
- **The "honest-framing / built-vs-roadmap" rule is load-bearing for any real product**, doubly so for regulated/security/health/finance. Every doc reconciles claims against **shipped reality** and uses three explicit states — *Included now* / *Coming (roadmap)* / *Optional add-on* — and never blurs them. False-advertising risk lives here. Copy the ground-rules block into strategy + offer + copy.
- **`assets/` holds the produced visuals** (SVGs, OG images) + a `preview.html` harness to eyeball them all at once. See the sibling `marketing/brand-tokenized-svg-asset-system.md`.
- **Pricing/offer numbers get validated against the real store** (Stripe/Supabase) before the offer doc is called done — the offer file is the source of truth for what's sold at what price, and it must match live product config.

**Reference:** `D:\SentinelBox\marketing\` — a complete worked example of the kit.

## The structure

```
marketing/
  01-market-strategy.md    # business-strategist — positioning statement, TAM/SAM (directional,
                           #   sourced), competitor map, ICP. Opens with the built-vs-roadmap ground rules.
  02-marketing-plan.md     # marketing-strategist — channel strategy, funnel, calendar, KPIs.
  03-brand-messaging.md    # brand-strategist — value prop, messaging framework, tone, taglines.
  04-offer.md              # offer-architect — the ONE thing sold, tiers, price, included-now vs coming
                           #   vs add-on, guarantee. Reconciled against live Stripe/DB pricing.
  05-conversion-copy.md    # conversion-copywriter — hero/section copy, headlines, CTAs, sales-page blocks.
  06-seo.md                # seo-specialist — keyword/intent map, on-page targets, structured data, briefs.
  07-social.md             # social-media-manager — platform-native posts/threads, cadence, per-network angle.
  08-email.md              # email-marketer — welcome/launch/re-engagement sequences.
  09-paid-ads.md           # paid-ads-specialist — campaign structure, audiences, ad copy, budget/bidding.
  10-graphics.md           # graphic-asset-designer — the visual system + per-asset specs (see SVG entry).
  assets/                  # produced SVGs, OG/share images, thumbnails
  preview.html             # harness that renders every asset on one page for review
```

**How the next launch pulls it:** conductor (`marketing-strategist` or `delivery-lead`) copies this tree, fills `01`+`04` first (they gate everything downstream — you can't write copy or ads before positioning + offer are locked), then fans `05–10` out to specialists in parallel, and reviews `assets/` via `preview.html` behind the `art-director` taste gate. The built-vs-roadmap ground-rules block is the first thing pasted into `01`.
