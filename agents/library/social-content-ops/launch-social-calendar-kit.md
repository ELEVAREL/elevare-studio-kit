# Launch social calendar kit — the per-post content template (hook / copy / hashtags / visual-brief / best-time)

**When to reach for it:** you need to hand a client (or a seeder) a **batch of ready-to-post social copy** for a launch or a bounded push — a 7/14/30-day daily calendar, a drop build-up, a season. This is the **structure/template** of that deliverable: a content-lane mix, a summary table, and a repeatable per-post block with the five things every post needs. It is the single-source-of-truth markdown the [`draft-and-hold-post-queue-seeder.md`](draft-and-hold-post-queue-seeder.md) parses into a queue — the format below is coupled to that parser's regexes, so keep the `## Post N` / `**Full copy:**` / `**Hashtags:**` markers exact if you plan to seed from it.

**Assumes / adapt:**
- Written by the social/content pod (social-media-manager + social-growth-strategist + conversion-copywriter). The **structure** here is reusable; the copy is per-brand and per-platform — never reuse another client's actual posts.
- Optimized for organic Facebook/Meta by default; the block shape carries over to IG/TikTok/LinkedIn — swap the algorithm notes and the visual-brief conventions per platform.
- **Honesty is a hard gate (STANDARDS claim–reality parity):** every named event/venue/date/feature/number in a post must be real and match the product's actual shipped state. No fabricated scarcity, no invented events, no "coming soon" marketed as live. If the kit references seeded data, every post's specifics trace back to a real row.

---

## 1. Top-of-file frame (set once, governs every post)

```markdown
# <Brand> — Launch: First <N> Daily <Platform> Posts

**Brand:** <brand> (<domain>) — <one-line what-it-is>
**Tagline:** <tagline>
**Voice:** <persona> (<3–4 adjectives: real, warm, local / literate, spare / …>)
**Page:** <Platform> Page/handle
**Window:** <start date> through <end date>. One post per day.
**Every specific named below is real** — sourced from <data file / product truth>. Nothing is invented.
```

Then a short **"Read this first" handoff block** to whoever runs the account:
- **Timezone rule.** State the ONE zone all times are in and why (a local audience lives in one zone). Store/convert to UTC for any cron. Flag the DST + Vercel-cron-runs-in-UTC gotcha if a scheduler consumes these times.
- **"Timing is a defensible default, not gospel."** The windows are a starting hypothesis for the audience shape (retirees skew morning, working families skew lunch/early-evening, etc.). **Replace them with the account's own Insights after ~2 weeks of data** — the account's real numbers beat generic advice every time. Say this explicitly so the client re-times weeks 3+.
- **The platform's current algorithm notes, baked into every post** (see §3).
- **Honesty statement:** every product claim matches the spec; no fake scarcity, no invented events, no unshipped feature promised.

---

## 2. The content-lane mix + summary table

Pick a **rotating set of content lanes** so the feed doesn't read as N variations of "check us out." A proven local-launch mix:

| Lane | Job it does |
|---|---|
| Launch announcement | The reveal. One per launch, day 1, at the evening scroll peak. |
| This-weekend / roundup | Utility. Concrete, named, dated — the "save this" value post. |
| Single-item spotlight | Depth on one real thing (event/product), day-of or just before. |
| Town / community pride | Belonging. Local identity, not product. Pulls shares. |
| Community question | Engagement bait done honestly ("fill in the blank", "settle a debate") — weighted for comments. |
| Utility / how-to | "Save this: how to <do the core job> in under 30 seconds." Teaches the product sideways. |
| Offer / founding-tier | The one soft monetization post. Honest scarcity only. |
| Recap + follow CTA | Closes the window, asks for the follow, reflects on what was learned. |

Then a **summary table** so the whole calendar is skimmable at a glance and the seeder metadata (kind + time) is obvious:

```markdown
| # | Date / Time (<TZ>) | Content lane | Hook line |
|---|---|---|---|
| 1 | Wed, 6:30 PM | Launch announcement | <the actual first line of post 1> |
| 2 | Thu, 12:00 PM | This-weekend roundup | <the actual first line of post 2> |
| … | | | |
```

The **Hook line column is the post's real first line** — filling this table is a forcing function: if the hook doesn't stop the scroll on its own, rewrite it before writing the body.

---

## 3. Algorithm notes to bake into every post (Meta/Facebook 2026 defaults)

State these once up top, then honor them in every block:
- **The hook is the first line and does the work before "See more" truncates.** No throat-clearing, no "We're excited to announce."
- **One idea per post, one soft CTA.** Never salesy.
- **Comments and shares outrank likes.** Questions and "save this" utility posts are weighted for meaningful interaction — build several posts to pull comments.
- **Concrete beats generic:** named venues, named towns, real dates beat "check us out."
- **Native text + image only. No outbound link in the first line** (a raw top link suppresses reach) — drop the link lower or "link in comments."
- **Hashtags: 3–5, tasteful, rotated so no set repeats,** each matched to the post's place/topic. On Meta these set tone + discoverability, not volume.

(Swap this list per platform: IG = carousel/Reels-first + saves; TikTok = hook in 0.5s + trending audio; LinkedIn = dwell + document posts.)

---

## 4. The per-post block (repeat once per post — this is the parseable unit)

```markdown
## Post <N> — <lane>: <short subject>
**When:** <Day, Time TZ> (<one line of WHY this slot — the audience-behavior reason>)
**Hook:** <the first line, verbatim — must stop the scroll alone>

**Full copy:**
<the full post body, ready to paste. Hook line first. One idea. Soft CTA near the end.
Link handled as "link in comments," never a raw top link.>

**Hashtags:** #Tag1 #Tag2 #Tag3 #Tag4 #Tag5

**Visual brief:** <a precise, on-brand art direction the graphic-asset-designer can execute:
the lockup/mark, the palette tokens (real hex from the live site), the ONE accent moment,
layout reference ("clean editorial like a Linear changelog, not a busy events poster"),
and what to avoid ("zero clutter, not a clip-art flyer"). Name real brand tokens, not guesses.>
```

**Why each field:**
- **When + the parenthetical why** — forces the timing to be a reasoned choice tied to audience behavior, not a random slot. Feeds the seeder's `META[n].when`.
- **Hook (separate from copy)** — makes the scroll-stopper a first-class, reviewable artifact. It's also the summary-table entry.
- **Full copy delimited by `**Full copy:**` … `**Hashtags:**`** — this exact framing is what the seeder extracts. Keep it if you'll seed.
- **Hashtags on their own line** — rotated per post; the seeder appends them to the message.
- **Visual brief** — every post ships with art direction so the graphic isn't improvised. Pull palette/lockup tokens **verbatim from the live site** (STANDARDS: the live source is the only brand truth), and ration the accent to one moment.

---

## 5. Definition of done for the kit
- Exactly N post blocks, each with all five fields; the summary table row count matches.
- Every named specific is real and traceable (event, venue, date, price, feature).
- One reveal, one offer, the rest value/community — not N sales posts.
- Times in one stated zone; UTC conversion noted for any scheduler.
- If it will be seeded: the `## Post N` / `**Full copy:**` / `**Hashtags:**` markers are exact, and a summary/META count matches so the seeder's fail-loud guard passes on the first run.
- Handoff note names who runs the account and tells them to re-time from real Insights after ~2 weeks.
