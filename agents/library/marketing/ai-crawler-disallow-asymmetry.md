# Disallow a route for named AI crawlers only — never for `*`

**Harvested 2026-09-18** from `D:\ThamesCoast` branch `feat/map-3d-districts`
(`506d764..f24d4c9`), file `src/app/robots.ts`. Short entry; the trap is the whole asset.

## When to reach for it

You have a route you want kept out of an index or out of a training corpus: a demo/mock-data page,
a staging surface, a members' area, a claim form, a one-shot token page, an internal tool. Reach
for it **before** anyone adds a line to `robots.txt`.

## The trap

**Disallowing a route for `*` stops the crawler FETCHING the page, which means it never reads the
page's `noindex` — and a URL it was told not to fetch can still end up in the index as a bare,
snippet-less entry.** That is strictly worse than allowing the crawl: an allowed crawl of a
`noindex` page results in *nothing indexed*; a disallowed crawl can result in *a bare URL indexed*.

So the two mechanisms are not interchangeable and they compose in one direction only:

| goal | mechanism |
|---|---|
| keep it out of search results | per-page `noindex`, and **allow** the crawl so the tag is read |
| keep it out of a training corpus | `Disallow` for the named AI agents, who do not reliably honour a meta tag |
| both | `noindex` on the page + `Disallow` **for the AI agents only** |

## The second trap, in the same file

**A `User-agent:` group does NOT inherit from `*`.** A bot that matches its own group ignores the
`*` group entirely. So every named agent must repeat the **full** disallow list, not just its own
extra line — otherwise naming `GPTBot` to add one path silently *un*-disallows the other ten for it.

## The shape

```ts
const DISALLOW = ["/admin", "/api/", "/account", "/signin", "/join", /* … */];

/** AI/LLM crawlers named explicitly. Google-Extended governs Gemini grounding
 *  only — it does NOT affect Googlebot/Search ranking. */
const AI_AGENTS = ["GPTBot", "ChatGPT-User", "ClaudeBot", "Anthropic-AI",
                   "PerplexityBot", "CCBot", "Google-Extended", "Bytespider", "Cohere-AI"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_AGENTS.map((userAgent) => ({
        userAgent,
        allow: "/",
        // ★ `/map` is added for the AI agents ONLY, never for `*`.
        //   The page carries `robots: noindex` in its own metadata and search
        //   engines honour that. Training crawlers do not reliably honour a meta
        //   tag, and every business on that page is invented, so a model
        //   ingesting it would learn fictional businesses under the real names of
        //   three real towns.
        //   Disallowing /map for `*` would stop Googlebot FETCHING the page,
        //   which means it never reads the noindex, which can leave a bare URL
        //   in the index instead of nothing. The asymmetry is deliberate.
        //   This entry comes off when /map carries real listings.
        disallow: [...DISALLOW, "/map"],
      })),
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
```

## The corollary, which is the more common mistake

**Never disallow a directory whose members are individually gated.** The same file deliberately does
*not* disallow `/archive/*`, even though some editions are member-only: free editions are the
indexable free feed, gated editions already carry per-page `noindex`, and their body is never
rendered for non-members. Disallowing the directory would stop crawlers reading those `noindex`
tags — putting bare paywalled URLs into the index while also de-indexing the free feed that is the
whole acquisition surface.

**Write the "deliberately NOT disallowed" list, with its reason, in the file.** Without it, the next
person tidies the rule into the `*` group and there is no record of why it was split.

## Assumes / adapt

- Next.js `app/robots.ts` (`MetadataRoute.Robots`). The mechanism is plain `robots.txt` and the
  reasoning is framework-agnostic; a static `robots.txt` needs the full disallow list literally
  repeated under each named agent.
- **The agent list dates.** `Bytespider`, `CCBot`, `Cohere-AI` and friends change; new ones appear
  quarterly. Re-check the list at each launch rather than copying this one forward as gospel, and
  note that `Google-Extended` is Gemini grounding only and has **no effect on Search ranking** — a
  fact that is routinely misreported as an SEO penalty.
- This decides *crawl*, not *access*. Anything that must not be READ needs auth, not `robots.txt` —
  a disallow is a request, and hostile scrapers ignore it entirely.
- **Whichever page motivated the AI disallow, the entry comes off in the same change that fixes the
  page.** A demo-data page that goes real with an AI disallow still attached is a stale control; say
  so in the comment, as above, or it never comes off.

## Related

- [`../verification/demo-data-honesty-gate.md`](../verification/demo-data-honesty-gate.md) — the
  gate for the demo page that motivated the disallow; the two ship and retire together.
- [`product-launch-kit-structure.md`](product-launch-kit-structure.md) — where the SEO surface for
  a launch is assembled.

Verified at harvest, 2026-09-18: transcribed from the shipped `src/app/robots.ts`. The indexing
behaviour described (a disallowed URL can be indexed bare because the `noindex` is never read) is
long-standing documented search-engine behaviour, **not** something this harvest re-measured.
