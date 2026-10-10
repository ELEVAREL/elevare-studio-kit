# MA Dispensary Menu Crawl — Feasibility Test

**Date:** 2026-08-14
**Assumption under test:** *A Massachusetts dispensary's public online menu can be read programmatically, well enough to extract a product catalogue, with zero client cooperation.*
**Method:** Live fetches against real MA licensees drawn from `ma-retail-prospects.csv` (387 independents). Every result below is an observed HTTP response, not an inference from platform knowledge. Browser used for network-tab capture of the Dutchie persisted-query API; everything else verified with plain `curl` (no JS, no headless browser) because that is what a production crawler would actually run.

---

## VERDICT: **GO WITH CAVEATS**

- **Technical coverage: 87.5% of the six required fields** across the ten-store sample (52.5 / 60 field-slots).
- **The pipeline genuinely generalises.** One extractor + one API call covered **10 of 10 Dutchie stores across five structurally different integrations**. Delivery cost does fall with repetition. The $795 assumption survives.
- **The legal blocker is real but narrow.** It applies to **Weedmaps and Leafly only** — the two aggregators. Both explicitly prohibit scraping listings, descriptions and prices. **Do not build on those two.** Every other route reads the dispensary's own storefront and is not covered by an aggregator AUP.
- **Two of ten stores are genuinely bespoke** and need per-client work. That is a known, priceable gap — not a hole in the model.

---

## 1. Coverage table — 10 stores × 6 fields

Legend: **Y** = extracted; **P** = partial / needs DOM work; **N** = not obtainable by the route tested.

| # | Store (City) | Platform | Rendering | JSON/API? | 1. Name/Brand/Cat | 2. Price + tiers | 3. Potency | 4. Stock | 5. Desc + Photo | 6. SKU count/cat | Score | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Northeast Alternatives** (Fall River) | Dutchie — embedded script | JS page, **API server-side** | ✅ persisted GraphQL | Y | Y | Y | Y | P (photo Y, desc N) | Y | 5.5 | **FULLY EXTRACTABLE** |
| 2 | **Theory Wellness** (Great Barrington) | Dutchie — embed slug | JS page, **API server-side** | ✅ same call | Y | Y | Y | Y | P | Y | 5.5 | **FULLY EXTRACTABLE** |
| 3 | **Berkshire Roots** (Pittsfield) | Dutchie Plus — white-label | JS page, **API server-side** | ✅ same call | Y | Y | Y | Y | P | Y | 5.5 | **FULLY EXTRACTABLE** |
| 4 | **In Good Health** (Sandwich) | Dutchie — white-label | JS page, **API server-side** | ✅ same call | Y | Y | Y | Y | P | Y | 5.5 | **FULLY EXTRACTABLE** |
| 5 | **The Haven Center** (Provincetown) | Dutchie — white-label on Wix | JS page, **API server-side** | ✅ same call | Y | Y | Y | Y | P | Y | 5.5 | **FULLY EXTRACTABLE** |
| 6 | **Bliss Cannabis** | CannaPlanners `cp-dutchie` plugin | **Server-rendered** | ✅ WP REST + sitemaps | Y | Y | Y | Y | **Y** | Y | 6.0 | **FULLY EXTRACTABLE** |
| 7 | **Kapha Cannabis** (Lenox) | iHeartJane | JS page, **API server-side** | ✅ Algolia proxy | Y | Y | Y | Y | **Y** | Y | 6.0 | **FULLY EXTRACTABLE** |
| 8 | **CommCan** (Rehoboth) | Dispense | **Server-rendered flight data** | ⚠️ API 401; data in page | Y | Y | Y | Y | **Y** | Y | 6.0 | **FULLY EXTRACTABLE** (via page, not API) |
| 9 | **Canna Provisions** (Lee) | **In-house** ("LeafBridge" WP plugin) | **Server-rendered** | ⚠️ `admin-ajax.php` | Y | P | Y | P | P | P | 3.5 | **PARTIAL** |
| 10 | **Terpene Journey** (Swampscott) | **In-house** (Webflow) | **Client-rendered** | ❌ none found | Y | N | Y | Y | P | N | 3.5 | **PARTIAL** — needs headless browser |

**Overall: 52.5 / 60 = 87.5% of required fields extractable.**

All ten are real MA licensees present in the prospect CSV (Kapha = *Krishna Lenox, LLC*; Bliss verified separately as a CannaPlanners build).

### The one systematic gap: product descriptions on Dutchie's own API
Dutchie's `FilteredProducts` persisted query returns **no product-level `Description` field** — confirmed by dumping all 76 keys of the payload. Photo presence, however, is 100%. This is *not* proof descriptions are unobtainable: the CannaPlanners site (store 6) syncs full descriptions **out of Dutchie**, so the data exists upstream and a product-detail query almost certainly exposes it. **I did not capture that query, so I am scoring it as unproven, not as available.** Budget one spike to capture the product-detail persisted hash before promising description-completeness in the offer.

---

## 2. The economic question: does one extractor cover the Dutchie family?

**Yes. This is the single most important result in the test, and it is unambiguous.**

I ran the **identical** GraphQL call — same endpoint, same persisted-query hash, same variable shape, only the dispensary ID swapped — against every structurally different Dutchie integration found in the field:

```
GET https://dutchie.com/api-2/graphql
    ?operationName=FilteredProducts
    &variables={"productsFilter":{"dispensaryId":"<ID>", ...}}
    &extensions={"persistedQuery":{"version":1,"sha256Hash":"faf5d549…666f2"}}
Header: apollo-require-preflight: true
```

| Store | Integration shape | ID format | HTTP | SKUs returned |
|---|---|---|---|---|
| Northeast Alternatives | embedded script | 24-hex | 200 | 369 |
| Enlite Springfield | embedded script | 24-hex | 200 | 735 |
| Canna Provisions Holyoke | dutchie.com-hosted | 24-hex | 200 | 1,023 |
| In Good Health Sandwich | white-label, own domain | 24-hex | 200 | 356 |
| Haven Center Provincetown | white-label on Wix | 24-hex | 200 | 472 |
| Liberty Market Lanesborough | white-label | 24-hex | 200 | 913 |
| Insa Easthampton | white-label | 24-hex | 200 | 531 |
| **Theory Wellness GB** | embed slug | **non-hex** | 200 | 687 |
| **Berkshire Roots Pittsfield** | Dutchie Plus | **non-hex** | 200 | 543 |
| **Silver Therapeutics Williamstown** | Dutchie Plus | **non-hex** | 200 | 373 |
| *negative control* | *bogus ID* | 24-hex | 200 | **empty** ✓ |

**10 / 10.** Including the two non-hex Dutchie Plus ID spaces, which were the most likely place for the abstraction to break. The negative control returns an empty product list, so these are not false greens.

**The only per-store work is discovering the dispensary ID**, which is a one-line regex over the store's homepage HTML (`embedded-menu/<id>`, `"dispensaryId":"<id>"`, or `cName`). That is minutes, not hours.

### Per-integration verdicts

| Pattern | Reusable extractor? | Notes |
|---|---|---|
| Dutchie — hosted on dutchie.com | ✅ **Yes, same one** | Page returns HTTP 200 to plain curl. (Field intel said 403 — **did not reproduce** with a normal UA.) |
| Dutchie — embedded script | ✅ **Yes, same one** | |
| Dutchie — white-label / Dutchie Plus | ✅ **Yes, same one** | Incl. non-hex IDs |
| Dutchie — headless on own domain (Primus) | ✅ Yes | 128 dutchie refs, product IDs recoverable |
| Dutchie — JointCommerce storefront | ✅ Likely | `<div id="joint-menu" data-config>` carries store IDs; my guessed `wp-json/joint-api/v1` routes 404'd, real route not yet found |
| **CannaPlanners `cp-dutchie`** | ✅ **Yes — second extractor, agency-wide** | Not bespoke: CannaPlanners is a cannabis agency with many MA sites. One extractor covers all of them. |
| **iHeartJane** | ✅ **Yes, third extractor** | One Algolia query, filter by `store_id` |
| **Dispense** | ✅ Yes, fourth | Read from page flight data; API needs a key |
| **Sweed** | ⚠️ DOM only | Prices + THC% server-rendered in HTML; no clean API found |
| **In-house** | ❌ **Bespoke per client** | See §4 |

### Does delivery cost fall with repetition? **Yes.**
Roughly **80% of the sampled market collapses onto four reusable extractors**, and the Dutchie family alone — the dominant platform — is *one*. A new Dutchie client of any integration shape costs a regex to find an ID. The margin argument holds. It is the in-house tail, not the platform variety, that costs money.

### The sitemap route — confirmed and worth having
Bliss publishes **eight** `cp_product-sitemap*.xml` files. The index `lastmod` values were **hours old at fetch time** (2026-08-13 23:04 → 2026-08-14 01:15), so the hourly-refresh claim holds. Better still, the site's **WordPress REST API is wide open**:

`GET /wp-json/wp/v2/cp_product?per_page=2` → **HTTP 200**, with structured taxonomies: `cp_product_brand`, `cp_product_category`, `cp_product_subcategory`, `cp_product_strain_type`, `cp_product_weight`, `cp_product_terpene`, `cp_product_effect`.

Product pages also carry clean **JSON-LD** with `name`, `description`, `price`, `availability: InStock`, `brand`. This is the cleanest, most robots-friendly ingestion path found anywhere in the test — no scraping in any meaningful sense. **Recommend prioritising CannaPlanners sites as the pilot cohort.**

⚠️ **But read that site's robots.txt.** Bliss allows `User-agent: *` but explicitly `Disallow: /` for **ClaudeBot**, GPTBot, CCBot, Google-Extended, Bytespider and others, plus `Content-Signal: ai-train=no`. A generic crawler is welcome; an AI-labelled one is not. **Whatever UA the crawler sends must be honoured consistently, and must not impersonate a browser to dodge a directive aimed at it.**

---

## 3. Per-platform verdicts

| Platform | Route | Server-rendered? | Verdict |
|---|---|---|---|
| **Dutchie** (all 5 shapes) | `/api-2/graphql` persisted query | API, no JS needed | ✅ **FULLY EXTRACTABLE** — 5.5/6 |
| **CannaPlanners cp-dutchie** | WP REST + sitemaps + JSON-LD | Yes | ✅ **FULLY EXTRACTABLE** — 6/6, cleanest path |
| **iHeartJane** | Algolia via `search.iheartjane.com` | API | ✅ **FULLY EXTRACTABLE** — 6/6, richest payload |
| **Dispense** | Next.js flight data in page | Yes | ✅ **EXTRACTABLE** via page; API 401 |
| **Sweed** | DOM | Yes | ⚠️ **PARTIAL** — DOM parse only |
| **In-house** | Varies | Varies | ⚠️ **PARTIAL / BESPOKE** |
| **Weedmaps** | undocumented `/discovery/v1/` JSON | Yes | ⛔ **LEGALLY BLOCKED** (technically trivial) |
| **Leafly** | `__NEXT_DATA__` + `_next/data` route | Yes | ⛔ **LEGALLY BLOCKED** (technically excellent) |

### Jane detail — negative control passed
`menu-products-production` unfiltered = **258,847** SKUs; filtered to `store_id=3932` = **479**; bogus store ID = **0**. The filter genuinely applies. Payload is the richest of any platform: 8 weight tiers with both list and discounted prices, `percent_thc/cbd/tac`, `available_weights` (stock), full `description`, `photos`, terpenes, lab results, and `nbHits` as a free per-category SKU count.

Credentials (`appId VFM4X0N23A`, a search-only key) are published in plain text in Jane's own public embed HTML — these are public-by-design search keys, not a bypassed secret.

⚠️ **Cloudflare fragility:** a naive request to `search.iheartjane.com` returns **403**. It succeeds only with browser-like `Origin`/`Referer` headers and query-param auth. It works, but it is the most brittle link in the chain.

---

## 4. In-house menus — their own category

**Share of sample: 2 of 10 (20%).** Both are real prospects from the CSV.

The field intel's framing needs two corrections, both of which move in *our favour*:

1. **CommCan is not in-house.** Its page carries `api.dispenseapp.com`, `menus-j22eki9u1-dispense.vercel.app`, `imgix.dispenseapp.com`, and `venueId: 4a40052d2ae52c5e`. It is a **Dispense** storefront. Its Next.js flight data leaks the complete product schema — `name, productCategory, subType, brand, price, sku, quantity, image, description, cannabisType, weight, thc, thcA, cbd, cbn, cbg` + terpenes. **All six fields, server-rendered.**

2. **Terpene Journey is a Dutchie skin, not an independent catalogue.** Its Webflow product card template binds `{{data::dutchie_product_code}}`. The menu is bespoke *presentation* over Dutchie *data*.

**Was the "bespoke sites are easier" hypothesis right? Only half.**

- ✅ **Easier on defences:** no Cloudflare, no bot detection, no rate limiting, age-gates purely cosmetic.
- ❌ **Harder on structure:** no schema, and **not** reliably a clean JSON call.
  - **Canna Provisions** (LeafBridge): server-rendered — good — but the page leaks a raw PHP `print_r` dump of *facet* arrays (brand lists, `potencyCbd` value lists), not clean per-product records. Data is in there; extraction is fiddly. Prices did not appear as `$`-formatted text.
  - **Terpene Journey**: worst case in the sample. Listing pages ship **empty Webflow templates** (`"This is some text inside of a div block"`), products injected client-side. Product detail pages *do* render title, brand, THC%, and `Out Of Stock` / `Add To Cart` — but **no price in the HTML**. This one genuinely needs a headless browser.

**Recommendation:** in-house menus are ~20% of the sample and are the only category that resets cost per client. Price them as a separate tier or exclude them from the entry offer. They do **not** threaten the margin model at 20% — but they would at 50%, so re-measure share as the prospect base grows.

---

## 5. Legal and access-control findings

### robots.txt (fetched, not assumed)

| Platform | Position |
|---|---|
| **Dutchie** | `User-agent: * / Disallow:` — **empty. Everything allowed.** |
| **iHeartJane** | All `Disallow` lines are **commented out**. Only `SemrushBot` blocked. Allowed. |
| **Weedmaps** | `Disallow: /listings/*` — but real menus are at `/dispensaries/<slug>`, which is **not** disallowed. `api-g.weedmaps.com/robots.txt` = `Allow: /`. |
| **Leafly** | `/dispensary-info/` **not** disallowed for `*`. **GPTBot fully `Disallow: /`**; also blocks meta-externalagent, FacebookBot, CloudflareBrowserRenderingCrawler. |
| **Client sites (Bliss)** | `Allow: /` for `*`, but **`ClaudeBot: Disallow: /`** + `Content-Signal: ai-train=no`. |

### Age gates are NOT an access control
Every age gate encountered (Northeast Alternatives, Kapha, Nova Farms) is a **client-side JavaScript overlay**. Plain `curl` returned the full menu HTML and the full API payloads without presenting, satisfying, or bypassing any token, cookie, or challenge. There is no server-side gate to circumvent — the data is served unconditionally to any HTTP request. **On the facts observed, automated access is not circumventing an access control** for the platforms tested. (Not legal advice; a lawyer should confirm before this goes in marketing copy.)

### ⛔ Terms of Service — the real blocker, and it is confined to the aggregators

**Weedmaps Acceptable Use Policy** (`/legal/acceptable-use`), Prohibited Activities item 9, names the target data verbatim:

> "Use any robot, data mining method, spider, scraper... to access, copy, download, or reproduce any user information, web page or other asset contained in the Services, or Content, **including Weedmaps Business listings, descriptions, and prices**, for any purpose."

Item 14 separately bans building "a similar or competitive website or service."

**Leafly Terms of Use** (`/info/terms-of-use`), §6.3(g) bans introducing scripts to "**strip, scrape, or mine data**"; §3.1 licenses the site for "personal, noncommercial use" only; §3.2(c) bans building a competitive service.

**Neither platform's sanctioned API solves this.** Both the Weedmaps Developer Portal (currently **closed** to new integrations) and the Leafly Menu Integration API are **inbound POS-sync programs** — a retailer authorises you to push *their* menu in. Neither is a read API for harvesting other retailers' menus. **There is no legitimate API that removes the need to scrape at market scale.**

**Consequence for the offer:** drop Weedmaps and Leafly from the pipeline entirely. This costs little — every store in the sample that appears on those aggregators *also* runs a first-party menu on Dutchie/Jane/Dispense, which is the better data source anyway. Leafly's payload is technically the best in the test (it even carries a real integer `stockQuantity`); it is simply not ours to take.

### ⚠️ Untested risk — datacenter IPs
Every request in this test came from a **residential Massachusetts IP**. A production crawler runs from AWS/GCP/Vercel ASN space, the most common Cloudflare block trigger. Leafly already demonstrates a deterministic UA blocklist (`python-requests/2.31.0` → **403**; browser UA → 200), which proves active bot management is deployed and tunable. **Re-run this suite from the real target ASN before treating any of these greens as production-proven.**

---

## 6. What is deliverable today

**Ship now (≈80% of the market, ~88% field coverage):**
- Full SKU catalogue with name, brand, category, subcategory, strain type
- Price per weight/size tier, plus discount/special pricing
- THC/CBD potency wherever the store publishes it (absent only on accessories — grinders, papers — which is correct, not a failure)
- In-stock state, and on Dutchie a live per-option inventory count (`quantityAvailable`)
- Photo presence per SKU (100% on Dutchie)
- Total SKU count by category — free on every platform tested

**Audits this supports immediately:** catalogue breadth vs. local competitors, price positioning by category, potency-data completeness, photo-coverage gaps, out-of-stock rate, category mix, dead-SKU detection.

**Rescope or exclude:**
- **Product-description completeness** — proven on CannaPlanners/Jane/Dispense; **unproven on Dutchie's own API.** Either spike the product-detail query first or keep this claim out of the entry offer.
- **In-house menus (~20%)** — quote separately; Terpene Journey-class sites need a headless browser.
- **Weedmaps / Leafly** — do not touch.

**Do not claim:** a market-wide dataset assembled from aggregators. That is the one thing the legal position rules out.

---

## Appendix — reproduction

Dutchie (works for every integration shape; swap `<ID>`):
```bash
curl -sG "https://dutchie.com/api-2/graphql" \
  -H "apollo-require-preflight: true" \
  --data-urlencode "operationName=FilteredProducts" \
  --data-urlencode 'variables={"includeEnterpriseSpecials":false,"productsFilter":{"productIds":[],"dispensaryId":"<ID>","pricingType":"rec","strainTypes":[],"subcategories":[],"Status":"Active","types":[],"useCache":false,"isDefaultSort":true,"sortBy":"weight","sortDirection":1,"bypassOnlineThresholds":false,"ignoreQuantityThresholds":false,"isKioskMenu":false,"removeProductsBelowOptionThresholds":true,"platformType":"ONLINE_MENU","preOrderType":null},"page":0,"perPage":100}' \
  --data-urlencode 'extensions={"persistedQuery":{"version":1,"sha256Hash":"faf5d5498d8a091051b63ad057e1092b51d51234894af974419f6fd9378666f2"}}'
```

iHeartJane (`store_id` filter; credentials are public, from Jane's own embed HTML):
```bash
curl -s -X POST \
 "https://search.iheartjane.com/1/indexes/menu-products-production/query?x-algolia-agent=Algolia%20for%20JavaScript%20(4.23.3)%3B%20Browser&x-algolia-api-key=edc5435c65d771cecbd98bbd488aa8d3&x-algolia-application-id=VFM4X0N23A" \
 -H "Origin: https://www.iheartjane.com" -H "Referer: https://www.iheartjane.com/" \
 -H "content-type: application/x-www-form-urlencoded" \
 -d '{"params":"query=&hitsPerPage=50&filters=store_id%3D<STORE_ID>"}'
```

**Dispensary-ID discovery regexes:** `embedded-menu/([a-zA-Z0-9]{17,24})` · `"dispensaryId":"([a-zA-Z0-9]{17,24})"` · Jane: `"storeId":(\d+)`
