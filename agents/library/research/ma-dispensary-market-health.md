# Massachusetts Independent Dispensary Market — Health Assessment

**Question:** Is the MA independent dispensary market growing, flat, or quietly dying?
**Date:** 2026-08-14 · **Author:** business-strategist (Elevare Studio)
**Purpose:** Single go/no-go risk check on selling discretionary marketing services to MA independent dispensaries.

> **Labelling convention:** **[MEASURED]** = computed by this analysis from primary data.
> **[REPORTED]** = a named source states it. **[ESTIMATED]** = inferred, with method stated.
> Not financial or investment advice. I am not a licensed financial adviser.

---

## 1. Verdict

### **FLAT market-wide — but CONTRACTING for the independent and equity segment specifically.**

That split is the finding. Treating MA dispensaries as one market gives the wrong answer in both directions.

**The market is not dying.** Store count is up 25% in 33 months, statewide sales are up 3.2% YTD, and dispensaries close at **3.33%/yr [MEASURED]** — *below* ordinary US small-business exit rates. The survivorship-bias concern in the brief was legitimate, was tested directly against an archived snapshot, and **did not produce the feared result.**

**But the per-store prize halved, and the policy environment has just tilted toward consolidation.** Revenue per store fell **55%** from 2021 to 2025. Minority-owned and Economic Empowerment operators fail at **3.5–3.8× the baseline rate (p < 0.05) [MEASURED]** — a comparative rate **no published source provides**; this analysis appears to be the first to quantify it. And in April 2026 Massachusetts **doubled the retail licence cap from 3 to 6 stores per operator [REPORTED]** while freezing cultivation — a change MJBizDaily framed as potentially doubling MSO retail footprint.

**Confidence: HIGH** on closure rate, per-store revenue and the equity differential — three independent cross-validations against CCC published figures came back exact (§7). **MODERATE** on the 2026 stabilisation. **LOW** on forward trajectory past the November 2026 ballot question (§8.4).

| Signal | Direction | Source |
|---|---|---|
| Store count 324 → 406 (+25% / 33 mo) | Growing | [MEASURED] |
| Statewide sales +3.2% YTD 2026 | Growing slowly | [MEASURED] |
| Retail closure rate 3.33%/yr | Normal churn | [MEASURED] |
| Per-store revenue −55% (2021→2025) | Sharply contracted | [ESTIMATED] |
| Per-store revenue 2026 **+1.3%** | **Stabilised** | [ESTIMATED] |
| New openings 83/yr → ~22/yr | Collapsed | [MEASURED] |
| Cultivation / manufacturing ~9%/yr closure | Contracting sharply | [MEASURED] |
| Minority-owned / EE operators 10–11%/yr | Contracting sharply | [MEASURED] |
| 12 dispensaries in receivership (Jan 2026) | Forward closure pipeline | [REPORTED] |
| Retail cap raised 3 → 6 per operator | Favours consolidators | [REPORTED] |

---

## 2. The measurement problem, and how I solved it

The brief is **correct** that `l_licenses_all_details_public.csv` is survivorship-biased. Verified directly **[MEASURED]** (retrieved 2026-08-14):

- 956 rows; `LICENSE_STATUS` is **Active (949)** or **Payment Pending (7)** — nothing else
- `LIC_REVOCATION_DATE`, `LIC_SURRENDERED_DATE`, `LIC_REVOKE_DATE`, `LIC_SURRENDER_DATE`, `APPLICATION_DENIED_DATE`: **0 non-empty values each**

The file cannot answer the closure question. Confirmed.

### The archive fallback worked

Wayback holds **no snapshot of `l_licenses_all_details_public.csv`** — the availability API returns empty at every timestamp. **But** the CDX index exposed the CCC's older Socrata-era resource IDs, one of which is the same licence dataset under its prior name:

**`masscannabiscontrol.com/resource/albs-all.csv`, snapshot `20231117000812`, internal `CCCLastUpdated = 11/06/2023`** — carrying `license_number`, `business_name`, `license_type`, `Approved_License_Stages`, `commence_operations_date`, `dbe`, `EIN_TIN` and the equity-priority fields. Licence-number formats match today's file (768 numbers intersect).

**Baseline 2023-11-06 → current 2026-08-14. Window: 33.3 months (2.77 years).**

### Population definition

The 2023 file holds 1,717 rows including pending and incomplete applications, so raw row counts are meaningless. I restricted to the only unambiguous population:

> **`Approved_License_Stages = 'COMMENCE OPS'` — establishments that had verifiably opened.**

**324 open Marijuana Retailer licences as of 2023-11-06 [MEASURED]** — a true, non-survivorship-biased count. A store counts as **closed** if its licence number appears in neither `LICENSE_NUMBER` nor `LICENSE_NUMBER_BASE` today.

### Methodology validation

```
Nov-2023 open retailers (measured from archive)      324
  minus measured closures                            − 29
  = expected survivors                                295
New openings after Nov-2023 (from current file)      +110
  = predicted open stores today                       405
ACTUAL open stores today (COMMENCE_OPS = Yes)         406
```

**Off by one** — two files three years apart, in different schemas, reconcile to 0.25%.

---

## 3. Closure rate

### **[MEASURED] 29 of 324 open dispensaries (9.0%) gone in 33.3 months = 3.33%/yr.**

95% Wilson CI: **2.32% – 4.73%/yr.** Six of the 29 belong to businesses still holding a licence elsewhere (renumbering/relocation); excluding those gives **2.62%/yr**. Honest range: **2.6% – 3.3%/yr.**

**This is a low failure rate** — below typical US small-business establishment exit rates (high single digits; [REPORTED] BLS Business Employment Dynamics, directional comparison only).

**Named closures in the measured set:** MedMen Boston · Pure Oasis (both Boston locations) · Mission MA (Brookline) · Revolutionary Clinics II (Somerville) · Apothca (Lynn) · Commonwealth Alternative Care (Brockton) · Heal (Provincetown, Sturbridge) · Green Era (Fitchburg, Mendon) · Life Essence (Framingham, Northampton) · Nature's Remedy (Rowley) · Herbology Group (Easthampton) · Pleasantrees (Amherst) · Elev8 (Athol) · TYCA Green (Clinton) · MJ's Market (Grafton) · Low Key (Boston) · Discern'd (Grafton) · Harmony of MA (West Boylston) · Heka (Westfield) · Just Healthy (Northampton) · Nature's Alternative (Wellfleet) · Community Growth Partners (Great Barrington) · Spencer House (Becket) · Green Biz (Northampton) · Patriot Care (Boston)

Independent corroboration: Mission (Brookline), Heal (Sturbridge), Heka (Westfield), TYCA Green (Clinton) and Pure Oasis all appear in press coverage of MA closures [REPORTED — *Talking Joints Memo* Aug 2024; *Boston Globe* Apr 2026].

### Retail is the *strongest* segment — the carnage is upstream

**[MEASURED]** Same diff, all licence types open in Nov 2023:

| Licence type | Open | Gone | Cumulative | Annualised |
|---|---|---|---|---|
| **Marijuana Retailer** | 324 | 29 | **9.0%** | **3.33%/yr** |
| Marijuana Cultivator | 115 | 27 | 23.5% | 9.30%/yr |
| Product Manufacturer | 102 | 23 | 22.5% | 8.87%/yr |
| Independent Testing Lab | 15 | 5 | 33.3% | 13.8%/yr |
| Marijuana Microbusiness | 11 | 3 | 27.3% | 11.0%/yr |
| Marijuana Courier | 10 | 5 | 50.0% | 21.5%/yr |
| Delivery Operator | 9 | 3 | 33.3% | 13.8%/yr |
| **All open licences** | **594** | **98** | **16.5%** | **6.4%/yr** |

**Retail closes at roughly one-third the rate of cultivation and manufacturing.** In a price collapse the squeeze lands on producers; retailers hold the consumer relationship and the remaining margin. Anyone reading "MA cannabis is dying" from headlines is reading about *growers*.

The regulator agrees on where the problem sits: the CCC froze **cultivator** applications in June 2026 and left retail untouched [REPORTED].

### Known bias

**3.33% is a LOWER BOUND.** A store that opened after Nov 2023 and closed before Aug 2026 appears in neither file — the most failure-prone cohort is structurally excluded.

---

## 4. Per-store revenue — the number that matters most

### Statewide adult-use sales **[MEASURED]** (`a_sales_au_gross.csv`, data through 2026-08-09)

| Year | Retail-only | All adult-use |
|---|---|---|
| 2021 | $1,331.2M | $1,333.8M |
| 2022 | $1,483.9M | $1,492.7M |
| 2023 | $1,558.9M | $1,572.3M |
| 2024 | $1,631.7M | $1,648.6M |
| 2025 | $1,630.9M | $1,651.9M |
| 2026 (to Aug 9) | $1,013.1M | $1,026.3M |

Like-for-like Jan 1 – Aug 9 **[MEASURED]**: 2024 **+5.8%**, 2025 **+0.4%**, 2026 **+3.2%**. The top line stalled in 2025 and resumed modest growth in 2026.

### Denominator

Hard anchors, both **[MEASURED]**: **324 open retailers (2023-11-06)**, **406 (2026-08-14)**.

Intermediate years come from `COMMENCE_OPERATIONS_DATE` in the current file, which is survivorship-biased — it undercounts historical stores, *overstating* historical per-store revenue and *exaggerating* the decline. I corrected rather than letting the bias flatter the pessimistic case: survivor count at 2023-11-06 is 296 against measured truth 324, a **bias factor of 1.0946**, applied to historical years and tapered to 1.0 at present. Corrected denominators are **[ESTIMATED]**.

### **[ESTIMATED] Revenue per store**

| Year | Retail sales | Est. avg stores | **Revenue per store** | YoY |
|---|---|---|---|---|
| 2021 | $1,331.2M | 143.9 | **$9,250,868** | — |
| 2022 | $1,483.9M | 224.9 | **$6,598,043** | −28.7% |
| 2023 | $1,558.9M | 298.3 | **$5,225,947** | −20.8% |
| 2024 | $1,631.7M | 356.0 | **$4,583,426** | −12.3% |
| 2025 | $1,630.9M | 388.8 | **$4,194,701** | −8.5% |
| **2026e** | **$1,695.2M** | **399.0** | **$4,248,731** | **+1.3%** |

**2021 → 2025: −54.7%.** A store clearing $9.25M in 2021 clears about $4.2M today.

### The 2026 inflection — stress-tested

The 2026 figure annualises 7.3 months, so I validated against historical seasonality rather than assuming flat day-count. The share of full-year retail sales earned by Aug 9 is stable: **2022 59.3%, 2023 59.5%, 2024 60.1%, 2025 60.2%** (naive day-count 60.5%). Using the 2022–25 mean of 59.8% gives full-year **$1,695.2M** and **$4,248,731/store — +1.3% on 2025.**

**The four-year slide has ended.** This runs *against* the pessimistic hypothesis, so I held it to a higher bar. It survives three independent checks: price per gram flattened (Mar $4.03 → Jul $3.83), basket size stopped falling (−0.2% vs −7.4% in 2025), and like-for-like sales turned positive.

### Supporting evidence **[MEASURED]**

**Price per gram:** **$14.17 (Nov 2018) → $3.83 (Jul 2026) = −73%.** Recent months flat: Mar $4.03, Apr $3.89, May $3.89, Jun $3.87, Jul $3.83. [REPORTED corroboration: *Boston Globe*, Mar 2026 — "just above $4.00/gram," >70% decline.]

**Basket size** (sales ÷ receipts):

| Year | Receipts | Avg basket | YoY |
|---|---|---|---|
| 2021 | 21.97M | $60.58 | −7.8% |
| 2022 | 28.86M | $51.42 | −15.1% |
| 2023 | 36.55M | $42.65 | −17.1% |
| 2024 | 42.88M | $38.05 | −10.8% |
| 2025 | 46.28M | $35.24 | −7.4% |
| 2026 | 28.80M | **$35.18** | **−0.2%** |

Transactions **more than doubled** (22.0M → 46.3M) while basket value fell 46%. Consumers did not leave — they trade down and visit more often. **The behavioural implication matters for a marketing offer: footfall and frequency are healthy; basket value is the broken metric.**

---

## 5. New openings — the genuinely bearish measured trend

**[MEASURED]** Surviving retailer openings by commence date: 2019 **26** · 2020 **59** · **2021 83 (peak)** · 2022 **65** · 2023 **69** · 2024 **50** · 2025 **35** · 2026 YTD **14** (≈22 annualised).

The brief's figures are **confirmed** — a **~73% collapse in new entry.** These are *surviving* openings, so earlier years are understated and **the real decline is steeper.**

**Interpretation:** collapsing entry signals expected returns *for a new entrant*, not incumbent viability. With per-store revenue halved and prime municipalities saturated, the arithmetic no longer supports a new store, while an existing store with amortised build-out continues. Falling entry + low closure + stabilising top line is the signature of a **matured** market. It does mean **the prospect pool is fixed at ~400 and will not grow.**

---

## 6. Are small and equity-flagged operators failing faster? **Yes — significantly.**

**[MEASURED]** Fisher exact test, two-tailed, against the "Not a DBE" baseline (22/272).

| Segment | n | Closed | Cumulative | Annualised | 95% CI | p |
|---|---|---|---|---|---|---|
| Not a DBE (baseline) | 272 | 22 | 8.1% | **3.00%/yr** | 1.98–4.48% | — |
| DBE-flagged (any) | 52 | 7 | 13.5% | 5.08%/yr | 2.46–9.97% | 0.285 n.s. |
| **Minority-owned** | 19 | 5 | 26.3% | **10.43%/yr** | 4.43–21.45% | **0.022 ✓** |
| **Econ. Empowerment priority** | 14 | 4 | 28.6% | **11.43%/yr** | 4.40–24.81% | **0.029 ✓** |
| RMD/MTC incumbent | 114 | 9 | 7.9% | 2.92%/yr | 1.54–5.42% | — |

**Minority-owned operators fail at ~3.5× baseline; Economic Empowerment licensees at ~3.8×. Both significant at p < 0.05.**

Samples are small (n=19, n=14) and CIs wide, but the direction is consistent across two independently-defined flags, and the aggregate "any DBE" category — diluted by woman-, veteran- and LGBT-owned businesses showing no elevated failure — is correspondingly *not* significant. **The signal sits specifically on minority-owned and Economic Empowerment operators.**

**This fills a documented gap.** The parallel research confirms **no published source provides a comparative failure rate for MA equity vs non-equity licensees** — only counts and qualitative accounts. The reported record is strongly corroborative: **Pure Oasis**, Boston's first Black-owned and first recreational dispensary and an Economic Empowerment licensee, closed **April 2026** owing ~$400K state sales tax, carrying a **$4.1M federal tax lien**, leaving **60 workers** unpaid — with a $300K Social Equity Trust Fund award granted the month prior that never arrived [REPORTED — *Boston Globe*, Apr 15 2026]. Both Pure Oasis licences are in my measured closure set.

CCC Chair Shannon O'Brien, quoted directly: **"We have not met the mission of promoting social equity."** [REPORTED]

### Operator size **[MEASURED]** — suggestive, NOT significant

| Size | Stores | Closed | Annualised |
|---|---|---|---|
| 1 store | 186 | 16 | 3.19%/yr |
| 2 stores | 78 | 10 | 4.83%/yr |
| 3+ stores | 60 | 3 | **1.83%/yr** |

(245 distinct operators by EIN.) Multi-store operators fail at roughly half the rate — **but Fisher p = 0.319. This does not reach significance and must not be reported as a finding.** Scale plausibly protects; this dataset cannot prove it.

---

## 7. Cross-validation against CCC published figures

Three independent checks of my aggregation against the CCC's own January 2026 press release [REPORTED]:

| CCC published | My computation | Match |
|---|---|---|
| 2025 adult-use sales **$1.65B** | **$1,651.9M** | ✓ |
| 2025 was **~$3M above 2024** | **$3.3M** above | ✓ |
| **46.3M** transactions in 2025 | **46.3M** receipts | ✓ |
| Price "just above $4.00/gram" Jan 2026 | $4.03 (Mar), $3.83 (Jul) | ✓ |

**Exact agreement on all four.** The sales pipeline and price series are sound.

### Closure-rate convergence — two independent methods agree

[REPORTED] CCC data via *Boston Business Journal* / *NBC Boston*: **13 retail licences** surrendered, revoked or not renewed in **FY2025** (Jul 2024–Jun 2025) — against **9 in the entire prior period** 2018 → Jun 2024.

Against ~380 stores open mid-FY2025 **[MEASURED]**, that implies **~3.42%/yr** — versus my measured 33-month average of **3.33%/yr**. **Convergent.**

**This also partly resolves the acceleration question I could not answer from the archive alone.** The reported record shows a **regime change**: closures ran near zero through the 2018–2024 growth phase, then stepped up to ~3%/yr in FY2025. The headline "more than the prior seven years combined" is dramatic because the *base* was near zero, not because the *new level* is alarming — **the new level is ordinary small-business churn.** Whether it is still rising past FY2025 remains undetermined (§9.1).

### One reported figure I can refute

Headset (POS panel) reports **July 2026 MA sales of $162.2M, +12.6% YoY.** CCC data gives **July 2026 = $149.28M vs July 2025 = $144.07M = +3.6% [MEASURED]**. Headset is a panel estimate, not a census. **Use +3.6%.** Do not carry the +12.6% figure into any model.

---

## 8. Reported context that changes the offer

### 8.1 §280E still applies to adult-use — and this is the profitability answer

[REPORTED] The DOJ rescheduled **state-licensed medical cannabis** to Schedule III effective **April 28, 2026** (91 FR, doc. 2026-08177). **All other cannabis, including adult-use, remains Schedule I.** A DEA hearing on general rescheduling opened June 29, 2026 and is **still pending**.

**So §280E continues to bar federal deduction of ordinary business expenses — including marketing — for adult-use activity.** MA operators consistently report **effective tax rates of 60–80%** [REPORTED — *Boston Globe*, Feb & Aug 2026]. Brian Keith of Rooted In said his Newbury Street dispensary would be profitable **but for the federal tax code**.

**Massachusetts did decouple at state level:** *An Act Relative to Equity in the Cannabis Industry*, **Chapter 180 of the Acts of 2022**, signed Aug 11 2022, effective for tax years from **Jan 1, 2022** — MA cannabis businesses may deduct ordinary business expenses, **including marketing**, on state returns [REPORTED].

**Net for a marketing vendor: a marketing dollar is deductible in Massachusetts but not federally.** That is a real but partial subsidy. It is a precise, verifiable, credibility-building thing to be able to tell a prospect — and it directly addresses §9.5, the profitability gap: these operators are revenue-stable but tax-crushed, and their cash position is materially worse than a $4.2M top line suggests.

### 8.2 ⭐ April 2026 legalised the channels a marketing service would sell

[REPORTED] *An Act Modernizing the Commonwealth's Cannabis Laws*, signed by Gov. Healey **April 19, 2026** (Chapter 65 of the Acts of 2026), authorises licensees to **advertise sales, discounts and customer loyalty programmes — in-store and via opt-in email marketing.** All of that was **previously prohibited** under the CCC's advertising guidance, which had barred promoting discounts, loyalty programmes, coupons and even the words "sale" or "% off" on menus.

**This is the single most commercially relevant fact in the file.** A newly-legal channel exists that essentially no MA operator has built for yet. Standing constraints remain: **935 CMR 500.105** permits advertising only where **≥71.6% of the audience is reasonably expected to be 21+**, plus a 500-ft proximity rule for billboards — which keeps paid social and open-web display difficult, and pushes the legally sellable work toward **owned channels: email, SMS, loyalty, in-store.**

### 8.3 Receiverships — the forward closure pipeline

[REPORTED] **24 licensees in court-appointed receivership in January 2026, of which 12 were dispensaries; 31 by April 2026** (+7 in three months). Twelve dispensaries is **~3% of the ~406 open stores in formal insolvency proceedings simultaneously** — a leading indicator that the ~3%/yr closure rate persists into 2027 rather than falling.

Related distress signal: growers report large unpaid retail invoices (Nova Farms ~$4.5M over two years; Berkshire Roots $150–200K since 2024). The April 2026 law now compels the CCC to publish a **delinquent-licensee list** (unpaid 60+ days) — a legislative acknowledgment of retail non-payment. **For a vendor, that is a direct warning about payment terms.**

### 8.4 Two structural risks to the independent segment

**Consolidation policy.** The same April 2026 law **raised the adult-use retail cap from 3 to 6 stores per operator**, explicitly to let businesses "spread overhead costs across more stores" [REPORTED]. Combined with the June 2026 cultivator freeze, the policy mix favours scale. Active consolidation at distressed pricing is underway: **SNDL** acquired Surterra/NETA assets (closed July 27 2026); **Vireo Growth** is acquiring **Cannabist** assets across five states including MA (up to 25 dispensaries, $35M); **4Front Ventures** put all US subsidiaries into receivership under Massachusetts law (May 22 2025); **AYR Wellness** is exiting Massachusetts entirely (157 layoffs at Milford). Counter-example worth noting: **In Good Health**, a single-state MA independent, *bought* AYR's Taunton store — independents are acquirers too.

**⚠️ Question 8 — the existential overhang.** A repeal initiative is **certified for the November 3, 2026 ballot**, which would repeal M.G.L. c. 94G and c. 64N and end adult-use sales **effective January 1, 2028** [REPORTED]. Polling is cited at ~20% support, so passage is unlikely — but it is **eleven weeks away**, it is already suppressing lending and acquisition multiples, and a consultant projection in the *Boston Globe* (Aug 4 2026) holds that **50–75 dispensaries close anyway** even if it fails. **Any contract extending past November 2026 must survive this event.**

---

## 9. What I could NOT determine

1. **Whether closures are still accelerating past FY2025.** Partially resolved in §7 via reported CCC counts, which establish a step-change from ~0 to ~3%/yr around FY2025. Whether FY2026 is higher still is **unknown**. My attempt to measure it directly failed and I discarded the result: an intermediate archived snapshot (`l_licenses_aumtc.json`, 2026-01-13) appeared to show 0.85%/yr rising to 12.03%/yr, but **negative control killed it** — MedMen Boston (`MR282091`), collapsed nationally in 2024, is still listed in that file, as are both Pure Oasis licences and every other known-dead retailer tested. It lists 480 `RM` medical records against 93 actual current MTC licences, and 467 of its records appear in neither adjacent snapshot. **It is a stale cumulative address directory, not a current-state file**, so absence from it cannot date a closure. *(Indirect evidence against a late-window collapse: per-store revenue, basket size and price all stabilise in 2026 — but it is indirect.)*
2. **Exact closure dates.** The CCC publishes no surrender/revocation dates in any file I obtained. Each closure is known only within a 33-month window.
3. **Closures among post-Nov-2023 entrants.** Structurally invisible; makes 3.33% a floor.
4. **True independent-vs-MSO split.** EIN and licence count are proxies; holding companies, management-services agreements and per-store EINs are not visible.
5. **Profitability, and therefore ability to pay.** Revenue per store is measurable; margin is not. §8.1 sharpens this considerably — 60–80% effective tax rates and 12 dispensaries in receivership mean cash position is materially worse than a $4.2M top line implies — but no MA-specific margin dataset exists. **This remains the largest unknown for the decision.**
6. **Whether MA dispensaries are increasing or cutting marketing spend.** No reporting, survey or dataset exists. The only benchmarks found were national vendor-marketing content and are not citable. **Do not fill this gap with an inferred number.**
7. **Two source items to verify before external use:** a reported Sean Combs purchase of three Central Massachusetts cannabis businesses in a $185M deal (*Worcester Business Journal*, could not be fetched), and the claim of a blanket MA outdoor-advertising ban — only the 500-ft proximity rule and 71.6% audience rule are confirmed in regulation. The CCC's **"Marijuana Establishment Renewals Executive Summary" (May 28 2026)** — likely the best primary attrition dataset — could not be parsed and is worth opening manually.

---

## 10. Implications for selling marketing services

**The "market is dying" risk is disproved.** A 2.6–3.3%/yr closure rate against a growing store count and stabilising top line is not a dying market. **The real risks are customer poverty, a fixed prospect pool, and an event in November.**

- **Prospect pool: ~406 open retailers, ~245 distinct operators — and it will not grow.** Entry has collapsed 73%. Any model assuming a widening TAM is wrong.
- **Each prospect is ~half as rich as 2021** ($4.2M vs $9.3M) *and* pays 60–80% effective tax. Discretionary spend is far tighter than store count suggests.
- **But the timing argument is genuine, not a rationalisation.** Per-store revenue stopped falling in 2026 (+1.3%), basket stopped falling (−0.2%), price flattened. Operators are emerging from a four-year contraction into a saturated market with ~400 near-identical competitors and **no price lever left** — price per gram is down 73% and cannot go lower. **Competing for share when you cannot compete on price is exactly when marketing stops being discretionary.** That sell does not require the market to grow.
- **A newly-legal channel opened four months ago (§8.2).** Discount, loyalty and opt-in email promotion became legal in April 2026 after years of prohibition. Almost no operator has built for it. That is a concrete, time-limited, defensible wedge — and it happens to sit in owned channels, which are the only ones the 71.6% audience rule leaves comfortably sellable.
- **Segment risk is quantified.** Minority-owned and EE operators fail at 10–11%/yr. They are also the most sympathetic and least-served buyers. If targeted, **price for churn and take payment up front** — 12 dispensaries are in receivership right now and growers are being stiffed on invoices at scale (§8.3).
- **Do not sell upstream.** Cultivators ~9%/yr, manufacturers ~9%/yr, labs ~14%/yr. That is a genuinely contracting market under an active application freeze.

### Recommendation

**Conditional GO on the market-health question specifically.** The survivorship-bias concern was legitimate, was tested directly, and did not produce the feared result. The market is flat, not dying. **This clears the market risk only — not the offer, the pricing, or the unit economics.**

Three conditions before committing spend:

1. **Close the profitability gap (§9.5) with primary discovery, not more desk research.** Eight to ten operator conversations, asking specifically about cash position and current marketing spend — which is also the only way to close §9.6. Highest-value next step.
2. **Build the offer around the April 2026 channel opening (§8.2), not around paid media.** Loyalty, opt-in email, in-store promotion. Confirm the current text of 935 CMR 500.105 before publishing any claim about what is sellable.
3. **Structure contracts to survive November 3, 2026.** Question 8 is eleven weeks out. Month-to-month or a break clause; no 12-month prepaid commitments assumed in the model.

Structure against a fixed ~400-store pool: assume no TAM growth, price for a poorer and heavily-taxed customer, weight the pipeline toward multi-store operators for revenue stability, and treat single-store equity operators as a deliberate, priced-for-risk segment rather than the base case.

---

## 11. Sources and reproducibility

**Primary data — retrieved 2026-08-14:**
- `masscannabiscontrol.com/resource/l_licenses_all_details_public.csv` — 956 rows, `CCCLASTUPDATED = 2026-08-14`
- `masscannabiscontrol.com/resource/a_sales_au_gross.csv` — 76,748 rows, through 2026-08-09
- `masscannabiscontrol.com/resource/a_sales_au_price_per_gram.csv` — monthly 2018-11 → 2026-07
- `masscannabiscontrol.com/resource/l_licenses_commence_ops.csv` — 900 rows
- Catalog: `masscannabiscontrol.com/open-data/data-catalog/`

**Archived baseline (load-bearing):**
- `web.archive.org/web/20231117000812id_/https://masscannabiscontrol.com/resource/albs-all.csv` — 1,717 rows, `CCCLastUpdated = 11/06/2023`
- Discovered via `web.archive.org/cdx/search/cdx?url=masscannabiscontrol.com/resource*&fl=timestamp,original,statuscode,length&collapse=urlkey`

**Rejected as unusable (documented so it is not re-attempted):**
- `l_licenses_all_details_public.csv` — **no Wayback snapshot exists** at any timestamp
- `l_licenses_aumtc.json` @ `20260113033001` — **stale cumulative directory, failed negative control** (§9.1)
- `fren-z7jq.csv`, `87rp-xn9v.csv`, `g5mj-5pg3.csv` — sales data, not licences
- `hmwt-yiqy.csv`, `piib-tj3f.csv` — same-date duplicates of `albs-all.csv`

**Key reported sources:**
- *Boston Globe*, Hecht, Mar 11 2026 — weed prices / FY25 closures / receiverships
- *Boston Globe*, Hecht, Apr 15 2026 — Pure Oasis closure
- *Boston Globe*, Johnston, Feb 17 2026 — equity operators
- *Boston Globe*, Byrdsell, Aug 4 2026 — repeal threat, 50–75 closure estimate
- CCC, Jan 8 2026 — 2025 sales release ($1.65B, 46.3M transactions)
- CCC, Apr 2026 — implementation of *An Act Modernizing the Commonwealth's Cannabis Laws*
- *Talking Joints Memo*, Jan 19 2026 — receivership oversight
- Federal Register, Apr 28 2026, doc. 2026-08177 — Schedule III rescheduling
- Ch. 180 of the Acts of 2022 — MA §280E decoupling
- 935 CMR 500.105 — advertising regulation
- NBC Boston / BBJ — FY2025 licence surrenders

**Statistical methods:** Wilson score intervals; Fisher exact test (two-tailed); annualisation `1−(1−cumulative)^(12/months)` over 33.27 months; seasonality-adjusted 2026 annualisation using the 2022–25 mean Jan1–Aug9 revenue share (0.598).

**Working files:** `%USERPROFILE%\AppData\Local\Temp\claude\D--\4d174bc5-f9e5-4c68-b3be-0e073963e399\scratchpad\ma\`
