# "Paid = editorial prestige" design system — one PaidBadge + the live-preview keepsake composer

Harvested from `D:\flavornews-web` (`src/components/cities/commerce/PaidBadge.tsx` + `src/components/cities/celebrations/CelebrationComposer.tsx` + `CelebrationKeepsake.tsx`). How to make paid placement read as EDITORIAL PRESTIGE, not "AD" — and the two-pane composer that turns a paid submission into a keepsake.

## When to reach for it
Any product where paid content sits ALONGSIDE editorial/organic content and must not look like a banner ad — a local-news network, a community board, a curated marketplace, a publication with sponsors. Two reusable pieces:
1. **The rationed-accent PaidBadge system** — one component that is the ONLY place the accent color says "paid," so it can't drift into slop.
2. **The two-pane live-preview + printable-keepsake composer** — a dignified way to author a paid submission where the buyer watches their keepsake build as they type.

## Assumes / adapt
- A tokenized design system with ONE confident accent reserved for brand/state (the sample: gold `--gold`, with `--gold-line` at ~40% for the one sanctioned hairline, `--gold-subtle` for tints). Swap the token names; keep the discipline.
- A `.paper` opt-in tier that REMAPS tokens to a warm reading surface so a component flips light without hardcoding a hex (see `vite-react-supabase/editorial-frontpage-system.md`).
- React + Tailwind in the sample; the rules are framework-agnostic.

---

## 1. PaidBadge — ration ONE accent color as the paid signal

The thesis: paid placement reads as prestige, so the cue is a **quiet accent micro-label — flat, tracked, hairline at most — never a loud colored "AD / SPONSORED" box.** The accent appears HERE and nowhere decorative, so its presence always means "someone paid for this."

One component, one variant per paid signal:

```ts
type PaidVariant = "featured" | "sponsor" | "boosted" | "celebration";
// featured   — a featured business / lead-story-tier placement
// sponsor    — the masthead-patron line ("Presented by …", the quietest tier)
// boosted    — an owner-only cue that a post/event is boosted (pinned)
// celebration— a paid resident keepsake marker
```

Rendering rules baked into the component:
- **Flat tracked uppercase accent eyebrow + one stroked icon.** No pill fill, no colored background. `text-[11px]` (`sm`) or `text-xs` (`md`), `tracking-[0.08em]`, `font-semibold`, `text-<accent>`.
- **`hideIcon` for dense meta lines**; label override for state (`"Boosted · 6 days left"`).
- Ship **companions in the same module** so the accent's structural uses are also centralized:
  - **`PaidTopRule`** — a 2px accent hairline a `relative` card hangs above its content to mark Featured/Boosted. This is the ONLY place the accent draws a line (a section-kicker rule). Uses `--gold-line` (40%), decorative, `aria-hidden`.
  - **`SponsorLine`** — the quietest paid tier: a `Presented by <name>` row with an optional wordmark slot, accent only as a tiny leading rule (`h-4 w-0.5`), never a fill. Used in the header card AND the footer.

Why one component: the "accent = paid, and accent is rationed" rule is now enforced **in code** — a designer can't accidentally reintroduce a loud ad box, and the accent can't leak into decoration elsewhere because every legitimate paid use routes through this module.

## 2. Reverent variant — drop the accent entirely for sensitive content

A memorial celebration flips to a `reverent` layout: **no gold at all** (no top-rule, muted-ink eyebrow instead of accent), a single centered round portrait, an italic serif tribute at reading measure, centered dateline ("Remembered by"). Dignity over decoration. The lesson generalizes: **your paid-prestige system needs an opt-out register for emotionally-loaded content** where even a rationed accent would read wrong. Drive it off the content type's metadata (`reverent: true`), not a manual flag at each call site.

---

## 3. The two-pane live-preview + printable keepsake composer

The signature surface for authoring a paid submission (`CelebrationComposer`). Structure:

```
LEFT  = the form  — occasion chips → headline → message → photo → your name + email → price + submit.
                    Dignified, no "form feeling"; char counters; inline validation on attempt.
RIGHT = the LIVE keepsake — the SAME render component the published card + printable receipt use,
        re-rendered on every keystroke, sticky on scroll. Empty state is a placeholder keepsake,
        not a blank box.
```

The load-bearing ideas:
- **ONE render component, three surfaces.** `CelebrationKeepsake` renders (a) the composer's live preview, (b) the published gallery card (`variant="card"`, clamped), and (c) the printable receipt (`tier="paper"`). The buyer's live preview IS the artifact they'll get — no "preview vs reality" gap. Build the keepsake renderer first; the composer just feeds it form state.
- **The printable keepsake is the `tier="paper"` flip** — the component re-scopes to the warm ivory reading tokens with zero hardcoded hexes, so it's screenshot- and print-ready as-is.
- **The composer owns the payoff beat.** It passes `holdMs={0}` to the shared checkout (see `shared-checkout-component.md`) and, on success, reveals the finished keepsake with a held ~1.9s "Sent for review" state before routing to the receipt — instead of the dialog's generic confirmation. Carry the just-created data via router state so the receipt renders instantly even while the row is `pending_review` (which RLS hides from an anonymous re-fetch).
- **Honest pricing before pay** (STANDARDS claim-reality): the one-time price + "reviewed before it publishes — no surprise charges" is shown in the submit card, not discovered at the Stripe step.
- **Paid content is `pending_review` after payment, not live** (moderation default): pay → held for owner approval → publish, or reject → auto-refund. The composer sets that expectation in copy explicitly.

## The rules that generalize (steal these even without the code)
1. Ration ONE accent as the paid signal; route every paid cue through ONE component; keep the accent out of all decoration so its presence always means "paid."
2. No "AD/SPONSORED" boxes — quiet tracked micro-labels + one sanctioned hairline.
3. Give the system a reverent opt-out register for sensitive content.
4. One render component for the live preview, the published card, AND the printable artifact — the preview must equal the deliverable.
5. Let the composer own the post-payment payoff beat and carry created data via navigation state so the receipt doesn't wait on RLS.

## Source references
- `D:\flavornews-web\src\components\cities\commerce\PaidBadge.tsx` (badge + `PaidTopRule` + `SponsorLine`)
- `D:\flavornews-web\src\components\cities\celebrations\CelebrationComposer.tsx` (two-pane composer)
- `D:\flavornews-web\src\components\cities\celebrations\CelebrationKeepsake.tsx` (the one render component, `screen`/`paper` + `full`/`card`)
- Design rationale: `D:\flavornews-web\docs\cities-network\DESIGN_DIRECTION.md` §0/§2A/§2B
