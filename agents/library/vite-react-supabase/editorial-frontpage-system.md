# Editorial front-page component system + design contract

**When to reach for it:** any content/publishing surface that must read like a
real newspaper/magazine front page rather than a generic card grid — a news site,
a blog index, a magazine home, a "latest stories" section, a long-form article
reader. Gives you a small set of composable story-tier primitives plus the
opinionated **editorial design contract** that makes them look designed, not
defaulted. React/Tailwind here; the design rules are stack-agnostic.

Harvested from `D:\flavornews-web` `src/components/editorial/` + `src/lib/
FOUNDATION_CONTRACT.md` (Good News USA — a Vite/React front page + reader that
went through a craft level-up to the studio bar).

---

## The primitives (a `src/components/editorial/` barrel)

Import as one unit: `import { Eyebrow, LeadStory, ... } from "@/components/editorial"`.

| Component | Role | Renders |
|---|---|---|
| `Eyebrow` | the front-page kicker | 11px uppercase `tracking-[0.08em]` **gold** micro-label, flat (no pill/badge). |
| `Meta` | the ONE byline/timestamp unit | `text-xs` subtle ink, byline muted, middot separators, `<time>` via relative-time (tabular figures). Every tier composes this via a `meta` prop, never re-rolls it. |
| `SectionHeader` | section divider | display-serif title + `flex-1` hairline rule + optional count + action slot. |
| `LeadStory` | **tier 1** — the single dominant story | large display hed (`text-4xl md:text-6xl`), optional lead image (16:9), kicker + excerpt + meta, hairline aesthetic (no card shadow), whole tile is a `<Link>`. `headingLevel` prop so it can be the page `<h1>` or an `<h2>`. |
| `SecondaryStory` | **tier 2** | `text-lg/xl` hed, 2-line clamped excerpt, `stacked` or `inline` layout. |
| `BriefItem` | **tier 3** — the list row | `text-base` hed row; live inside a `divide-y divide-hairline` list. |
| `ReadingProgress` | article scroll indicator | `fixed top-0 h-0.5 bg-gold origin-left` scaleX bar; doc-wide or track a ref. |
| `LoadingSkeleton` | pre-content state | `animate-pulse` + shimmer sheen, `role="status"` `aria-busy`. |
| `DropCap` / `PullQuote` / `Dateline` / `Deck` / `SectionRule` | long-form reader | `::first-letter` gold initial, display-serif quote w/ gold lead-in rule, byline·place·time, standfirst, labelled hairline rule. |

**The tier hierarchy is the point.** A front page is `LeadStory` ×1 → a row of
`SecondaryStory` → a `divide-y` list of `BriefItem`. Three sizes of the same
story object, decreasing prominence. Don't render 12 equal cards.

`LeadStory` reference (the shape the others follow — whole-tile link, meta via
prop, no shadow, group-hover hed recolor):
```tsx
export const LeadStory = React.forwardRef<HTMLAnchorElement, LeadStoryProps>(
  ({ kicker, title, excerpt, href, image, imageAlt = "", meta, headingLevel = 2, className }, ref) => {
    const Hed = `h${headingLevel}` as "h1" | "h2";
    return (
      <Link ref={ref} to={href} className={cn("group block rounded-sm focus-visible:outline-none", className)}>
        {image && (
          <div className="mb-5 overflow-hidden rounded-lg border border-hairline bg-surface-2">
            <div className="aspect-[16/9] w-full">
              <img src={image} alt={imageAlt} loading="eager"
                className="h-full w-full object-cover transition-transform duration-slow ease-out-editorial group-hover:scale-[1.03]" />
            </div>
          </div>
        )}
        {kicker && <Eyebrow className="mb-2">{kicker}</Eyebrow>}
        <Hed className="font-display text-4xl font-bold leading-tight text-ink text-balance transition-colors duration-fast group-hover:text-gold md:text-6xl">
          {title}
        </Hed>
        {excerpt && <p className="mt-3 max-w-measure font-sans text-md text-ink-muted text-pretty">{excerpt}</p>}
        {meta && <Meta {...meta} className={cn("mt-3", meta.className)} />}
      </Link>
    );
  },
);
```

---

## The editorial design contract (the part that makes it look designed)

This is the load-bearing taste layer. Encode it once (a `FOUNDATION_CONTRACT.md`
+ tokens in `index.css`/`tailwind.config`) and every page consumes it.

1. **3-tier lead-well hierarchy.** One dominant lead, a secondary row, a briefs
   list. Prominence via type size + image presence, not via card chrome.
2. **Hairlines, not shadows.** Structure comes from 1px rules at ~10% ink
   (`--hairline`, one divider token, used everywhere), not drop shadows or
   glassmorphism. Cards are `bg-surface` + 1px hairline + tiny radius, no blur.
3. **Gold rationed to STATE only.** ONE accent (gold). It appears on eyebrows/
   kickers, link hover, active nav, live dots, reading progress — **never** on
   generic borders, decorative icons, or gradients. Dividers are always the
   neutral hairline, never gold. One accent + strict rationing reads as editorial;
   accent-everywhere reads as slop.
4. **The reader body contract:** ~68ch measure (`--measure`), ~18–20px body,
   1.6–1.7 line-height, a `DropCap` gold initial on the first paragraph, and
   `PullQuote`s to break the column. Headings `text-wrap: balance`, body
   `text-pretty`. Fluid `clamp()` type scale (ratio ~1.25) with tight leading +
   negative tracking baked into the large tokens so callers don't re-add it.
5. **Dual reading tier via a `.paper` class.** The dark "paper at night" default
   (warm hue, never pure #000) flips to a light ivory reading tier by adding
   `.paper` on a wrapper — it re-scopes the local token context so ALL child
   editorial primitives recolor for free. One class, whole subtree recolors.
6. **Every text token passes WCAG AA, computed numerically.** ink 17:1,
   ink-muted 8:1, ink-subtle 5.3:1, gold 9:1 on ground, paper-gold 5.2:1. Compute
   the ratio the moment you add/reuse a token (a reused `--muted` fails everywhere
   at once — STANDARDS).

---

## Assumes / adapt
- Assumes React + `react-router-dom` (`<Link>`) + Tailwind with a token layer
  (HSL channel vars consumed via `hsl(var(--x))`). For Next.js swap `<Link>` for
  `next/link`; for plain HTML the design contract still holds, only the components
  change.
- The `color-mix()` gold-derived tokens raise the browser floor to Chrome 111 /
  Safari 16.2 / FF 113 — fine for a modern PWA, name the floor if the target is
  older (STANDARDS "constraint drift").
- Uses `@tailwindcss/typography` for the reader prose. Fonts self-hosted, latin
  subset, only the weights the UI uses, `font-display: swap`.
- Cross-links: `ecommerce-supabase-stripe/tailwind-v4-warm-brand-tokens.md` (a
  warm editorial token block on Tailwind v4 — this one is Tailwind v3 with HSL
  channel tokens), `marketing/brand-tokenized-svg-asset-system.md` (pull the same
  tokens verbatim into campaign graphics).
