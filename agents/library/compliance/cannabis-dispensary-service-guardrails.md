# Cannabis Dispensary Service — Compliance Guardrails

**Elevare Studio | Consumer-behaviour reporting + marketing asset production for licensed cannabis retailers**

**Version:** 1.0
**Effective date:** 14 August 2026
**Previous version:** none (first issue)
**Owner:** compliance-counsel
**Review cadence:** quarterly, and immediately on any of the trigger events in §12
**Markets covered:** Massachusetts (primary), Rhode Island (secondary), Connecticut (third)

---

## THIS IS NOT LEGAL ADVICE

I am not a licensed attorney and this document is not legal advice. It is a research-grounded
operating guardrail written to make a licensed attorney's review cheaper and faster, and to stop
the studio doing something obviously wrong before that review happens. Nothing here creates an
attorney-client relationship, and nothing here certifies compliance with anything.

**A cannabis-licensee attorney admitted in each target state must review this document, the
engagement letter in §8, and the data processing addendum in §7 before Elevare signs a single
dispensary client.** The open questions that genuinely need that attorney are listed in §10.
Regulations in this sector change faster than almost any other; every citation below carries a
date, and a citation older than the last legislative session should be re-verified before it is
relied on.

**Scope of the service this document covers.** Elevare (a) produces recurring consumer-behaviour
reports built from a dispensary's OWN point-of-sale data, optionally joined with certificate-of-
analysis (COA) lab data, and (b) produces finished marketing asset FILES — menu boards, shelf
talkers, in-store signage, social graphics, motion and print ads, email templates — which **the
dispensary publishes**. Elevare does not run campaigns, does not buy media, does not post on a
client's behalf, does not touch product, and does not take custody of cannabis. Every guardrail
below assumes that boundary holds. **If the studio ever starts publishing on a client's behalf,
this document is void and must be rewritten** — that single change moves Elevare from vendor to
something much closer to the advertiser of record, and most of §4's comfort disappears with it.

---

## 0. The market, verified against live state data

The market thesis is load-bearing for the risk calculus, so it was verified against the state's
own live data rather than taken from a brief.

**Massachusetts** — pulled from the Cannabis Control Commission's public licence dataset
(`l_licenses_all_details_public.csv`, field `CCCLASTUPDATED` = 2026-08-14, i.e. same-day fresh):

| Measure | Verified value |
|---|---|
| `Marijuana Retailer` licences, status Active | **457** |
| ...of which have commenced operations | **406** |
| Distinct EINs holding an active retail licence | **354** |
| Distinct business names holding an active retail licence | **382** |
| Distinct EINs among *operating* retailers | **312** |
| Max retail licences held by any single EIN | **3** (histogram: 279 EINs hold 1, 47 hold 2, 28 hold 3) |
| Active `Medical Marijuana Treatment Center` licences | **92** |
| EINs holding BOTH an active retail licence AND an active MTC | **45** |
| Active retail licences publishing a business email in the dataset | **457 of 457** |

Source: <https://masscannabiscontrol.com/resource/l_licenses_all_details_public.csv> via
<https://masscannabiscontrol.com/open-data/data-catalog/>

Three things follow, and two of them are compliance findings, not marketing ones:

1. **The three-licence ceiling is real and observable.** No EIN in the file holds more than three
   retail licences. This is a market of independents by operation of law, which supports the
   commercial thesis — but it also means **almost every client will be a small operator with no
   in-house compliance counsel**, and will therefore lean on Elevare's judgement far more than a
   multi-state operator would. That is a liability amplifier, not a comfort. Price and contract
   accordingly.
2. **The realistically addressable count is 312 operators (406 open doors), not 457 licences.**
   Quote the operating figure in any internal forecast; a provisional licence is not a customer.
3. **45 Massachusetts operators hold both an adult-use retail licence and a Medical Marijuana
   Treatment Center licence.** This is the Massachusetts analogue of Connecticut's hybrid-retailer
   problem, and it is *proportionally larger* than the market has been assuming. For roughly one in
   seven MA retail operators, a naive "just send us your POS export" request will sweep in **medical
   patient transactions**. §2.6 makes excluding them a hard intake gate, not a preference.

**Rhode Island** and **Connecticut** counts were supplied by the coordinator and are **not
independently verified in this document** — RI "8 compassion centers, 6 locally owned" and CT
"~16 realistically-addressable organizations" are marked `[NEEDS VERIFY]`. Connecticut's licensee
list is queryable at <https://www.elicense.ct.gov/> and
<https://data.ct.gov/dataset/Cannabis-Establishments/u8mw-sv7k>. That CT open-data endpoint was
queried directly on 2026-08-14 and **returned zero rows** (a 116-byte empty response), so it is not
currently a usable source; the CT counts must be confirmed through eLicense before they appear in
any forecast or pitch.

One CT figure from the original brief is **contradicted** by what could be verified and must not be
repeated until confirmed: the brief stated 44 of 75 CT locations are Hybrid Retailers; the sources
reachable on 2026-08-14 indicated 75 dispensing locations statewide but a hybrid count in the
mid-30s. Treat the hybrid share as unknown. The *design* consequence is unchanged either way —
see §2.6.

---

## 1. DATA — how each state treats cannabis purchase data

### 1.0 The one-paragraph answer

The three states are **structurally different**, and the difference is not one of degree.
Massachusetts has **no comprehensive consumer privacy law at all**, but it does have a cannabis
regulation that limits what a retailer may **collect in the first place**, a security regulation
that binds a **vendor directly**, and a consumer-protection statute with **mandatory multiple damages
between businesses**. Rhode Island and Connecticut both have comprehensive privacy acts with
near-identical de-identification standards that impose **contractual commitments directly on
Elevare as a recipient**. So the correct design is: **build to the Connecticut/Rhode Island
standard everywhere**, because it is the strictest and it is cheap to apply, and then satisfy
Massachusetts's *different* obligations on top of it rather than instead of it.

| | **Massachusetts** | **Rhode Island** | **Connecticut** |
|---|---|---|---|
| Comprehensive privacy act | **None in force** (2026-08-14) | RIGL 6-48.1, eff. **1 Jan 2026** | CTDPA, as amended by **PA 25-113**, eff. **1 Jul 2026** |
| Applies to a single-store dispensary? | n/a | § 6-48.1-3 yes (no threshold); § 6-48.1-4 only at 35,000 customers | **Yes — any volume**, if it processes sensitive data at all |
| Cannabis purchase data = sensitive/health? | n/a | Medical: yes. Adult-use: **INCONCLUSIVE** | Medical: yes. Adult-use: **arguable and unsettled** |
| Statutory de-identification standard | **None** | § 6-48.1-2 / -7 | § 42-515(16) / § 42-523 |
| Obligations on Elevare as recipient | 201 CMR 17.00 **directly**, if PI received | By contract, per § 6-48.1-7 | By contract, per § 42-515(16)(C) |
| Sharpest exposure | **c. 93A § 11** (double damages + fees) | AG enforcement, deceptive trade practice | AG enforcement; CUTPA via the ad statute |

---

### 1.1 MASSACHUSETTS — primary market

**There is no Massachusetts consumer privacy act, and that was verified negatively, not assumed.**
Neither the Acts of 2025 (<https://malegislature.gov/Laws/SessionLaws/Acts/2025>) nor the Acts of
2026 (<https://malegislature.gov/Laws/SessionLaws/Acts/2026>) contain one. The leading vehicle is
**S.2608, "An Act establishing the Massachusetts data privacy act"**
(<https://malegislature.gov/Bills/194/S2608>), which advanced through the Senate in late 2025 but is
**not enacted**; its precise current posture is INCONCLUSIVE because the legislature's bill-history
pagination could not be retrieved. Other live vehicles include H.78, H.80/S.33 and S.2619.

**Practical consequence:** there is no MA "controller/processor", no sale-of-data opt-out, no
mandated DPA contents, no consumer rights regime — **and no statutory de-identification safe
harbour to point at.** That last absence is why §2's allowlist must be enforced technically. In
Connecticut and Rhode Island, de-identified status is a defined legal category you can occupy. In
Massachusetts it is just a factual claim about your own pipeline, and the only thing that makes it
true is the pipeline.

**1.1.1 The provision that actually governs — 935 CMR 500.140(2)(c).** This is the sharpest rule in
the whole document and it operates **upstream of Elevare entirely**:

> *"A Marijuana Retailer may not acquire or record Consumer personal information other than
> information typically required in a retail transaction, which can include information to determine
> the Consumer's age. A Marijuana Retailer may not record or retain any additional personal
> information from Consumer without the Consumer's voluntary written permission."*
> — <https://www.law.cornell.edu/regulations/massachusetts/935-CMR-500-140>

Read with 500.140(2)(a)–(b), which require an agent to **inspect** ID on entry and at point of sale:
**inspect, do not record.** The statutory backstop is **M.G.L. c. 94G § 4(c)(3)**, which forbids the
Commission from *requiring* a retailer to acquire consumer information beyond age verification —
that is a limit on the regulator's rulemaking power, not a direct prohibition on the licensee, so
cite the regulation and the statute together and do not overstate § 4(c)(3) on its own.
(<https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXV/Chapter94G/Section4>)

**Why this matters more than anything else in the MA analysis:** the most attractive-sounding version
of this product — loyalty-linked customer journeys, repeat-visit cohorts, lifetime value — depends
on data a Massachusetts retailer **may not lawfully hold** unless it obtained *voluntary written
permission* from each consumer. Many will believe they have it and will not. So the intake
conversation must start with *"show me the written permission"* rather than *"send us the customer
table"*, and the safe product is the one §2 describes: **basket-level, no customer key.** That is not
a limitation Elevare is imposing out of caution; it is the shape the Massachusetts regulation leaves.

There is no general prohibition in c. 94G or 935 CMR 500 on a retailer **sharing** lawfully held data
with a service provider, and no requirement located that a data-sharing arrangement be disclosed to
the Commission. The restriction is entirely on the front end.

**1.1.2 M.G.L. c. 93H — breach notification, and the vendor's own duty.**
"Personal information" is defined narrowly and **conjunctively**: a resident's *"first name and last
name or first initial and last name in combination with"* (a) SSN, (b) driver's licence or state ID
number, or (c) financial account or card number.
(<https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXV/Chapter93H/Section1>)

Email address, phone number, date of birth, ZIP code, loyalty ID and purchase history are **not**
enumerated elements. **So a properly-constructed basket feed is outside c. 93H entirely.**

But note **§ 3(a)**: a person who *"maintains or stores, but does not own or license"* personal
information must notify **the owner** as soon as practicable on knowing of a breach. If identifiable
data ever leaks into the feed, Elevare acquires its own statutory duty — to the client, not to the
AG. § 6 routes AG enforcement of c. 93H through c. 93A.

**1.1.3 201 CMR 17.00 — the WISP rule, and it binds Elevare DIRECTLY.**
This is the point most often missed. 17.01(2) applies the regulation to *"all persons that own or
license personal information about a resident of the Commonwealth"*, and 17.02 defines "owns or
licenses" as *"receives, stores, maintains, processes, or otherwise has access to personal
information in connection with the provision of goods or services"*.
(<https://www.law.cornell.edu/regulations/massachusetts/201-CMR-17-02>)

**A vendor that receives MA personal information is itself directly regulated** and must maintain its
own comprehensive **Written Information Security Program** (17.03(1)), with the technical minimums at
17.04 — secure authentication, access control, **encryption of personal information transmitted
across public networks and stored on portable devices**, monitoring, firewalls, patching, malware
protection, and training.

And the clause the client's lawyer will insist on, **17.03(2)(f)**: the program must include
*"Taking reasonable steps to select and retain third-party service providers that are capable of
maintaining appropriate security measures"* and *"Requiring such third-party service providers by
contract to implement and maintain such appropriate security measures for personal information."*
The pre-2010 contract grandfather expired in 2012.

**Elevare's posture:** maintain a WISP and meet 17.04 unconditionally, whether or not personal
information is expected. It costs little, it is what §8's contract warrants, and it is the only thing
standing between "we received a stray column" and a regulated failure.

**1.1.4 M.G.L. c. 93A — the biggest single exposure in this business.**
§ 2(a) makes unfair or deceptive acts unlawful, and § 2(b) directs courts to be guided by FTC
interpretations of § 5 of the FTC Act — so **FTC deception and substantiation doctrine is imported
into Massachusetts law**. An objective performance claim needs substantiation at the time it is
made; a privacy promise contradicted by the actual data flow is a deceptive act.

**§ 11 is the business-to-business route**, and it is why this is the top contract risk: the client
can sue Elevare for *"actual damages; or up to three, but not less than two, times such amount"* on
a willful or knowing violation, plus **mandatory attorney's fees** to a prevailing petitioner, with
**no 30-day demand-letter prerequisite** (that is § 9, the consumer route).
(<https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXV/Chapter93A/Section11>)
Mitigation is in §8: accurate capability representations, no absolute security guarantees, a
negotiated liability cap, and the § 11 tender-of-settlement mechanism.

**1.1.5 Re-verification — done, and here is the result.** **St. 2026, c. 65, "An Act Modernizing the
Commonwealth's Cannabis Laws," an emergency law approved 19 April 2026**, restructured the Commission
and amended M.G.L. c. 94G § 4. The Commission responded with **emergency regulations effective
06/18/2026**, and **every 935 CMR 500 citation in this document has been re-read against that official
text** (see §5.1.6). Two consequences worth carrying: c. 65 § 65 gives the Commission until roughly
**19 April 2027** to conform its regulations, so **further amendments are expected within the year**;
and third-party regulation mirrors are unreliable here — Cornell LII's copy is stale by two years.
Re-confirm against the Commission's own PDF before any citation enters a client deliverable.

---

### 1.2 RHODE ISLAND — secondary market

**RIGL chapter 6-48.1, the Data Transparency and Privacy Protection Act, took effect 1 January 2026.**
Two scopes, and the distinction matters for small dispensaries:
- **§ 6-48.1-3** applies to *"any commercial website or internet service provider conducting business
  in Rhode Island or with customers in Rhode Island"* — **no numeric threshold**.
- **§ 6-48.1-4** applies only above a threshold: **35,000 customers**, or 10,000 customers plus >20%
  of gross revenue from selling personal data.

Most single-location RI dispensaries fall under § 6-48.1-3 but **below** § 6-48.1-4.

**The distinctive RI obligation — § 6-48.1-3(a)(2)** requires a controller to *"Identify all third
parties to whom the controller has sold or may sell customers' personally identifiable
information"* — a **named list**, not categories. **Elevare should expect to be named on Rhode
Island clients' privacy pages**, which is a good reason for the §2.7 pre-flight and a good reason to
be comfortable with the description used.

**Sensitive data** (§ 6-48.1-2) includes *"data revealing racial or ethnic origin, religious beliefs,
mental or physical health condition or diagnosis…"*, and § 6-48.1-4 requires **opt-in consent** to
process it. Medical/compassion-centre patient data is almost certainly sensitive; **whether adult-use
purchase data is sensitive is INCONCLUSIVE** — the "data revealing" formulation is inference-friendly
and there is no RI guidance. **Treat it as sensitive by default.**

**De-identification** (§ 6-48.1-2, § 6-48.1-7) matches Connecticut's: data that *"cannot reasonably
be used to infer information about, or otherwise be linked to, an identified or identifiable
individual, or a device linked to such individual"*, with duties to prevent re-association,
**publicly commit** not to re-identify, and **contractually bind recipients**. **That contractual
binding is Elevare.**

**Processor contract contents** (§ 6-48.1-7) mirror Connecticut's — instructions, nature and purpose,
data type, duration, rights and obligations, confidentiality duty, deletion or return, information
to demonstrate compliance, subcontractor flow-down, assessments. §8.2 satisfies both at once.

**Enforcement** (§ 6-48.1-8): a violation is a deceptive trade practice under RIGL ch. 6-13.1; the
**Attorney General has sole enforcement authority**; intentional-disclosure penalties of $100–$500
per disclosure; and *"Nothing in this section shall be construed to authorize any private right of
action."* No cure period appears in the text.

**Cannabis-specific patient confidentiality is strong.** 560-RICR-10-10-2 § 2.14(D)(2) provides that
compassion-centre and hybrid-retailer records pertaining to patients, caregivers and authorized
purchasers are *"Considered confidential health care information under applicable Rhode Island law"*
and *"Protected as health care information in accordance with"* HIPAA. RIGL § 21-28.6-12(c)(3)(vii)
says the same for dispensing records. **By contrast there is no general prohibition in the CCC rules
on sharing adult-use consumer data with third parties** — that falls to 6-48.1.

**An unresolved tension worth counsel's time:** RIGL § 6-48.1-3 exempts HIPAA covered entities, and
the CCC rules require dispensaries to protect patient records *"in accordance with"* HIPAA. Being
*required by state rule to behave like* a covered entity does not *make* one a covered entity, so
the exemption probably does not apply — but it is arguable, and it is Q4 in §10.

---

### 1.3 CONNECTICUT — third market, and still the strictest standard to build to

**The CTDPA was substantially amended by Public Act 25-113 (SB 1295), effective 1 July 2026**, with
the profiling-impact-assessment duty from 1 August 2026. The amendments matter enormously for this
product:

- **Applicability now has no meaningful floor for this vertical.** The threshold dropped from
  100,000 to **35,000 consumers**, and — decisively — the Act now applies to any entity that
  *controlled or processed **sensitive data, regardless of volume***, or offered personal data for
  sale, regardless of volume. The old "25% of revenue from data sales" threshold is gone.
  **A single-store Connecticut dispensary that processes any sensitive data is in scope.**
- **"Sensitive data" now expressly includes "consumer health data"**, along with data revealing
  mental or physical health condition or diagnosis, neural data, precise geolocation, government
  identifiers, financial account numbers, and data from known children.
- **"Consumer health data"** is defined as personal data a controller uses to identify a consumer's
  physical or mental health condition or diagnosis.
- **Processing sensitive data now requires both a reasonably necessary basis AND consent**, and the
  **sale** of sensitive data without consent is expressly prohibited.

Sources: <https://www.cga.ct.gov/current/pub/chap_743jj.htm>;
<https://www.foley.com/insights/publications/2026/07/connecticut-dramatically-expands-its-data-privacy-act-what-businesses-need-to-know-now/>;
<https://www.wiley.law/alert-Major-Changes-to-Connecticut-Consumer-Privacy-Law-Will-Take-Effect-July-1-2026>

**Is a cannabis purchase "sensitive data" requiring opt-in consent?**

- **Medical marijuana patient data: yes, unambiguously.** It reveals a physical or mental health
  condition and is consumer health data on any reading. Connecticut separately makes medical
  registry information confidential and FOIA-exempt under **CGS § 21a-408d(d)**, with narrow
  enumerated disclosures (law enforcement, treating clinicians and pharmacists, licensed
  dispensaries for statutory compliance, research/educational entities **provided no individually
  identifiable health information is disclosed**, and the patient).
  (<https://codes.findlaw.com/ct/title-21a-consumer-protection/ct-gen-st-sect-21a-408d/>)
  Note that the research/education pathway is expressly conditioned on de-identification — a useful
  signal about how Connecticut thinks about this data.
- **Adult-use purchase data: arguable, unsettled, and the answer should be "treat it as sensitive".**
  The statutory hook is "consumer health data" — personal data *used to identify* a health condition.
  A purchase record alone does not identify a diagnosis. But cannabis is consumed overwhelmingly for
  effect, product categories map to claimed effects, and a regulator applying the FTC's recent
  health-data posture would not struggle to characterise a cannabis purchase history as health data.
  **No Connecticut guidance or enforcement action on this point was located.** This is Q1 in §10 and
  it is the single most consequential open legal question in the document — if adult-use purchase
  data is sensitive data, then every Connecticut dispensary is in CTDPA scope at any volume, and the
  data may not be processed without opt-in consent.

  **The design answer is the same either way**: if Elevare holds only de-identified data, the
  question never has to be answered, because the Act does not apply to de-identified data. **That is
  the strongest argument for §2's design and it should be how the service is sold.**

**The de-identification standard, and what it demands of Elevare — CGS § 42-515(16).**
De-identified data is data that *"cannot reasonably be used to infer information about, or otherwise
be linked to, an identified or identifiable individual, or a device linked to such individual"*,
where the controller:

> **(A)** takes reasonable measures to ensure that such data cannot be associated with an individual;
> **(B)** **publicly commits** to process such data only in a de-identified fashion and not attempt to
> re-identify such data; and
> **(C)** **contractually obligates any recipients** of such data to satisfy the criteria in (A) and (B).

Plus **§ 42-523**, under which a controller disclosing de-identified data must *"exercise reasonable
oversight to monitor compliance with any contractual commitments"* and *"take appropriate steps to
address any breaches"*.

**Three operational consequences, and they are the whole reason this section exists:**

1. **Elevare is the recipient in (C).** The obligation is contractual and it is real. §8.2 clause 11.
2. **The "public commitment" in (B) must actually be public.** The dispensary must publish it. And
   because Elevare is contractually bound to the same criteria, **Elevare should publish its own
   commitment too** — dated, versioned, on the Elevare site. A commitment that lives only in a signed
   PDF is not a public commitment.
3. **The client must exercise oversight of Elevare.** Expect, and welcome, an annual questionnaire or
   attestation. Build the artifact once and reuse it.

**Processor contract contents — CGS § 42-521(b)**: instructions, nature and purpose, type of data,
duration, rights and obligations, confidentiality duty, deletion or return at the controller's
direction, information to demonstrate compliance, subcontractor written contracts, and assessments
against control standards with reports on request. §8.2 is drafted to this.

**Entity and data exemptions — CGS § 42-517**: entity-level exemptions cover state agencies,
nonprofits, higher education, GLBA financial institutions, **HIPAA covered entities and business
associates**, tribal governments and air carriers; data-level exemptions cover protected health
information and HIPAA de-identified data, among others. **A dispensary is not a HIPAA covered
entity (§1.4), so it gets neither exemption** — a point that surprises clients who assume their
medical programme puts them under HIPAA and therefore outside CTDPA. It does the opposite: it leaves
them fully inside CTDPA holding data that is unambiguously sensitive.

---

### 1.4 Does HIPAA reach any of this? Almost certainly not — and the reason matters

**No, on the current facts — but the reasoning is what protects you, not the conclusion.**

Under **45 CFR 160.103**, a **covered entity** is a health plan, a health care clearinghouse, or
*"A health care provider who transmits any health information in electronic form in connection with
a transaction covered by this subchapter."* (<https://www.law.cornell.edu/cfr/text/45/160.103>)

- A dispensary arguably **is** a "health care provider" — the definition reaches *"any other person or
  organization who furnishes, bills, or is paid for health care in the normal course of business"*,
  and "health care" expressly includes *"Sale or dispensing of a drug, device, equipment, or other
  item in accordance with a prescription."*
- **But provider status alone is not enough.** The provider must transmit health information
  electronically **in connection with a HIPAA standard transaction** — claims, eligibility,
  authorisation, remittance. Cannabis is not billed to insurance, so dispensaries do not conduct
  standard transactions, and therefore **are not covered entities.** Elevare is consequently not a
  business associate.

**Two things could change that, and one of them is live:**

1. **The April 2026 rescheduling of state-medical-licensed marijuana to Schedule III** (§7.1) creates,
   for the first time, a federal registration pathway under **21 CFR 1301.13(k)** for medical
   dispensing on a practitioner certification. That does not by itself create standard transactions —
   but it is the first step on the road that ends in insurance billing, and if any payer ever
   reimburses, the analysis flips.
2. A dispensary that operates an **affiliated clinic or certification service** may have a covered
   entity inside the group.

**Practical rules:** (a) never tell a client "HIPAA doesn't apply to you" as a flat statement — say
that it appears not to on the current facts, and that their counsel should confirm; (b) treat medical
patient data as if HIPAA applied regardless, because Rhode Island's rules already require
HIPAA-standard protection by regulation and Connecticut's registry statute is nearly as strict; and
(c) note the perverse effect — **not being a covered entity is what puts dispensaries squarely inside
CTDPA and RIGL 6-48.1**, since both exempt HIPAA-covered entities.

Finally, even without HIPAA, the **FTC's** § 5 authority reaches health-adjacent data practices, and
c. 93A § 2(b) imports FTC doctrine into Massachusetts law directly. The absence of HIPAA is not the
absence of a regulator.

---

## 2. The intake spec — how Elevare never holds identifiable consumer data

This is the single most important control in the document. Everything in §1 becomes easy if Elevare
genuinely never receives personal data, and everything becomes hard if it does. The design goal is
not "we handle personal data carefully". It is **"there is no personal data in the building."**

### 2.1 The architectural rule

> Elevare receives **basket-level transaction lines with no customer key and no free text**, plus
> **batch-level COA data**. It receives nothing else, ever, from any client, in any format, through
> any channel.

Two consequences that people get wrong:

- **A hashed customer ID is still a customer key.** If the dispensary sends `customer_id_sha256`,
  Elevare can count visits per person, and the data is pseudonymous personal data, not de-identified
  data. It fails the Connecticut definition ("cannot reasonably be used to infer information about,
  or otherwise be linked to, an identified or identifiable individual") and the identical Rhode
  Island definition. **Repeat-visit analysis is therefore out of scope for v1**, and the sales deck
  must not promise it. If a client wants cohort/retention analysis, the dispensary computes it on
  its own side and sends Elevare the aggregate.
- **De-identified is a status the dispensary must be able to defend, and it comes with obligations
  that run to Elevare by contract.** Under CTDPA § 42-515(16) and RIGL § 6-48.1-2/-7, the controller
  must take reasonable measures, **publicly commit** not to re-identify, and **contractually
  obligate recipients** to the same. That contractual obligation is §7's DPA. Elevare is the
  recipient; the commitments are Elevare's to keep.

### 2.2 Field-level ALLOWLIST — the only fields Elevare may receive

Anything not on this list is denied by default. Adding a field is a change request that goes
through compliance-counsel, not a Slack message to the analyst.

**A. Transaction line file** (one row per line item)

| Field | Type | Rule |
|---|---|---|
| `store_code` | string | Elevare-assigned code (e.g. `MA-014`). Never the POS store key. |
| `basket_ref` | string | Surrogate issued by the DISPENSARY per basket, from a **rotating salt that changes every export**, so the same basket in two files is not the same token. Never a receipt number, never sequential. |
| `line_seq` | int | Position within the basket. |
| `txn_date` | date | Calendar date only. |
| `txn_hour` | int 0-23 | **Hour band only. Never a second- or minute-level timestamp** — an exact timestamp plus a store is a quasi-identifier and will re-identify a customer against a receipt or a door camera. |
| `day_of_week` | enum | Derived; convenient, harmless. |
| `channel` | enum | `in_store` / `pickup` / `delivery`. The flag only. |
| `product_category` | enum | flower / pre-roll / vape / concentrate / edible / beverage / topical / tincture / accessory. |
| `product_subcategory` | string | Free-choice from a controlled vocabulary agreed up front, not typed per row. |
| `brand_name` | string | The product brand. A business, not a person. |
| `product_name` / `sku_name` | string | Product identity. |
| `strain_name` | string | Optional. |
| `unit_size_g` / `unit_count` | number | Quantity. |
| `unit_price` | decimal | |
| `line_discount_amount` | decimal | The amount only — never the promo code, which is often a customer or campaign identifier. |
| `line_net_amount` | decimal | |
| `basket_net_total` | decimal | Repeated on each line, or supplied in a basket header file. |
| `basket_line_count` | int | |
| `staff_role` | enum | `budtender` / `manager` / `kiosk` / `online`. **Role only. Never a name, employee number, or state agent-registration number** — staff are data subjects too, and in MA an agent registration number is a state-issued identifier. |

**B. COA / lab file** (one row per analyte per batch)

| Field | Type | Rule |
|---|---|---|
| `batch_code` | string | The licensee's own batch identifier, joinable to the product rows. |
| `product_name` / `brand_name` | string | Matches the transaction file. |
| `matrix` | enum | raw plant material / concentrate / edible / etc. **Required** — see §6.3 on why mixing matrices ruins a benchmark. |
| `analyte` | string | e.g. `THC (%)`, `THCA (%)`, `Total Yeast and Mold (CFU/g)`, terpene names. |
| `result_value` | number | |
| `result_unit` | string | |
| `pass_fail` | bool | |
| `test_month` | YYYY-MM | Month, not exact date. |
| `lab_name` | string | The testing laboratory. A business. |

### 2.3 Field-level DENYLIST — never, in any field, file, tab, screenshot, or email

The intake gate rejects the whole file if any of these appear, by column name **or** by content
pattern. It fails closed: a rejected file is not partially loaded.

**Direct identifiers**
- name, first name, last name, initials, nickname, salutation
- email address, phone number, any messaging handle
- postal address, street, unit, **full ZIP or ZIP+4** (see §2.4 for what geography is allowed)
- date of birth, exact age, "21st birthday" flags
- driver's licence / state ID / passport number, or any image of one
- signature image, ID scan, photograph, biometric template
- social security number, tax ID

**Cannabis-specific identifiers — the ones a generic PII scrubber will miss**
- medical marijuana **patient registration number**, patient ID, certification number
- **caregiver** ID or name, authorized-purchaser ID
- practitioner / certifying physician name, NPI, or licence number
- qualifying condition, diagnosis, symptom, dosing instruction, any clinical note
- METRC tag or package ID **that has been associated with a named purchaser**
- loyalty account ID, membership number, rewards ID, POS customer key, `customer_id`, and **any
  hash, token, or encoding of any of the above** — including `customer_id_sha256`

**Payment and device**
- card PAN, last four, expiry, cardholder name, payment token, ACH/bank details
- IP address, device ID, MAC, advertising ID (MAID/IDFA), cookie ID, session ID
- precise geolocation, delivery address, driver GPS trace, delivery notes

**Structural leaks**
- **any free-text field of any kind** — notes, comments, memo, description-as-typed, complaint,
  return reason, "other". This is a hard deny with no exception. Free text is where the phone
  number, the name, and the diagnosis actually live, and no scrubber catches all of them.
- exact timestamps below hour granularity; receipt numbers; sequential order numbers; queue numbers
- the raw POS export "just to see the shape of it" — there is no such thing as a one-off look

### 2.4 Geography, small cells, and the medical flag

- **Geography:** store-level only. No customer geography of any kind, not even a 3-digit ZIP
  prefix, in v1. If regional analysis is later wanted, it is computed by the dispensary and sent as
  an aggregate.
- **Minimum cell size:** Elevare publishes no figure — in a report, a chart, a menu-board callout,
  or a shelf talker — derived from fewer than **11 baskets**. Eleven is a convention borrowed from
  US health-data practice, not a statutory requirement in any of the three states; it is a policy
  floor the studio sets for itself, and it should be stated as such rather than dressed up as law.
  Cells below the floor are suppressed, and **complementary suppression** is applied so a
  suppressed cell cannot be recovered by subtraction from a published total.
- **The medical flag is DENIED at row level.** A per-transaction `is_medical` boolean, joined with
  store and hour, is an attribute about an individual's health status. In Connecticut it is
  squarely "consumer health data" and therefore **sensitive data requiring opt-in consent** after
  the July 2026 amendments; in Rhode Island medical dispensing records are **confidential
  healthcare information** by statute and rule; in Massachusetts, patient records sit under the
  medical-programme rules. There is no version of this that is worth the risk for a marketing
  report.

  **The gate:** the dispensary excludes medical transactions from the feed **before export**, on its
  own side, and attests in writing that it has done so. Elevare does not filter them out on receipt
  — by then it has already held them.

  This is not a corner case. **45 of Massachusetts's retail operators also hold a Medical Marijuana
  Treatment Center licence** (§0), and Connecticut's hybrid retailers have the same shape. For those
  clients the export filter is the first thing built and the first thing tested.

### 2.5 Transport, storage, retention, deletion

- **Transport:** client-initiated upload to a per-client isolated bucket, or SFTP with per-client
  credentials. **Never email attachments, never a shared Drive folder, never a link in a ticket.**
- **Isolation:** one client's data must never be reachable from another client's system or from a
  shared processing pipe. This is the studio's existing hard rule and it applies with extra force
  here; logs are a data store and shared pipes fan out.
- **Encryption:** in transit and at rest. Massachusetts's 201 CMR 17.00 makes encryption of personal
  information in transit and on portable devices an express requirement where personal information
  is involved; the studio applies it unconditionally so the question never has to be litigated.
- **Retention — real numbers, not "as long as necessary":**
  - raw transaction feed: deleted **45 days** after successful load of the derived aggregates
  - derived aggregates and report outputs: retained for the engagement term **+ 12 months**
  - COA/batch data: retained for the term + 12 months
  - backups: purged on the same schedule, maximum **35 days** of backup lag
  - on termination: full deletion within **30 days** and a signed **certificate of destruction**
    naming the systems and the backup generations covered
- **Access:** named individuals only, MFA, least privilege, access list reviewed quarterly and on
  every staff change. No client data on personal devices.

### 2.6 The gates that make this real (each has a named owner)

A control with no owning check is a wish. These are assigned:

| # | Gate | Owner | What it asserts |
|---|---|---|---|
| G1 | **Schema gate** rejects any inbound file containing a denylisted column name, or content matching identifier patterns (email, phone, SSN, 9+ digit runs, 64-hex where not expected), or any column not on the allowlist. **Fails closed.** | `backend-engineer` | No denied field is ever loaded |
| G2 | **Negative-control test suite**: seeded files each containing exactly one denylisted field (including `customer_id_sha256`, a free-text notes column, an exact timestamp, a patient registration number) must each be REJECTED **by name**; a clean file must be ACCEPTED. | `test-engineer` | The gate is not always-true and not always-false |
| G3 | **Medical-exclusion attestation** signed by the licensee before the first transfer, plus a load-time assertion that no `is_medical`-shaped column is present. | `compliance-counsel` + `backend-engineer` | Patient data never enters |
| G4 | **Small-cell suppression test**: a report generated from a seeded dataset with a 7-basket cell must suppress it, and must also suppress the complement. | `test-engineer` | No rank-1 disclosure |
| G5 | **Retention job named-survivor test**: seed known-age records, run the purge, assert **by name** which survive and which are gone — never just a count. | `test-engineer` | Deletion deletes the right rows |
| G6 | **Client privacy-policy pre-flight** (see §2.7) verified on the **deployed** client page, not in a repo, before the first transfer. | `compliance-counsel` | The disclosure is live before the collection |

For G2 and G5 the studio's standing rule applies: **watch each test go red before trusting it
green.** Break the gate, confirm the named tests fail, restore.

### 2.7 The pre-flight nobody remembers: the client's OWN privacy policy

**The disclosure must be live before the collection it discloses.** Before the first byte moves,
compliance-counsel fetches the client's **deployed** privacy policy and its e-commerce/menu pages
and checks:

1. Does the posted policy say anything like "we do not share your information with third parties"?
   Dispensary sites say this constantly, usually inherited from a template. If it does, **the feed
   cannot start** until the policy is corrected and the corrected version is live. Shipping data
   against a contradicting live policy is the cleanest possible unfair-or-deceptive-practice claim
   in all three states, and in Massachusetts it is a **c. 93A** exposure with multiple damages and
   fees attached.
2. Does the policy disclose an analytics/marketing service provider category? In Connecticut the
   controller must disclose categories of third parties and, post-amendment, respond to a consumer
   request for a **list of third parties**. In Rhode Island § 6-48.1-3(a)(2) is stricter still — it
   requires identifying **all third parties** to whom PII is or may be sold, by name. Elevare should
   expect to be **named** on Rhode Island clients' sites.
3. Are there ad pixels, session-replay scripts, or a chat widget on the checkout/menu pages that
   would capture what the policy says is not shared? This is out of Elevare's contractual scope but
   it is exactly the kind of thing the studio finds and hands to the client — see the risk register at §9.
4. Is the policy **versioned and dated**? An undated policy silently claims to have always said
   whatever it says now.

Findings go to the client in writing. Elevare does not silently fix a client's legal page, and does
not proceed on a verbal "yeah that's fine".

---

## 3. Email and SMS templates — the deliverable that carries federal law with it

Elevare produces **email templates**. The client sends them. That does not remove the problem, it
relocates it: a template missing the required elements guarantees the client sends a non-compliant
message every time they use it. **Compliance has to be built into the template, not attached to it
as advice.**

**CAN-SPAM, per the FTC's own compliance guide**
(<https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business>):

- Header information — *"From," "To," "Reply-To,"* and routing information — must be accurate and
  identify the sender.
- **No deceptive subject lines.** *"The subject line must accurately reflect the content of the
  message."*
- **Identify the message as an ad**, clearly and conspicuously.
- **A valid physical postal address** must appear in the message.
- **A clear and conspicuous opt-out**, easy for an ordinary person to recognise and use, offering a
  return email address or a single web page. The mechanism must work for **at least 30 days** after
  sending, and opt-outs must be honoured **within 10 business days**. No fee, no extra personal
  information, no multi-step hoops.
- Once someone opts out, their address may not be sold or transferred.
- **Liability is shared, and this is the line that matters here:** *"even if you hire another company
  to handle your email marketing, you can't contract away your legal responsibility to comply…
  Both the company whose product is promoted in the message and the company that actually sends the
  message may be held legally responsible."*

**Therefore every email template Elevare ships must contain, as live template structure and not as a
note in the handover doc:**

- [ ] A `{{business_physical_address}}` field in the footer, **required, non-removable**, pre-filled
      with the client's real address at handover
- [ ] A working unsubscribe link/`{{unsubscribe_url}}` in the footer of every marketing template
- [ ] Accurate `From` / `Reply-To` defaults set to the client's real sending identity
- [ ] Ad identification where the message is promotional
- [ ] The state's required cannabis warning (§5), in the target state's wording
- [ ] 21+ language and, for Rhode Island, the universal symbol, licence number and 21+ tagline
- [ ] **No health, therapeutic, wellness or safety claim** in the subject line — subject lines are
      where they always appear, because they are the shortest thing anyone writes
- [ ] A note in the handover that the client's list must be **opted-in**, and that Elevare has not
      verified list provenance

**SMS is a different and harsher regime.** The TCPA requires prior express written consent for
marketing texts and carries statutory damages per message with an active plaintiff's bar. Elevare
should **decline to produce SMS marketing templates for cannabis clients in v1**, or produce them
only after the client confirms in writing that its list is TCPA-compliant and that its platform
handles consent and STOP handling. This is a deliberate scope decision, not an oversight.

**Also note the interaction with §2:** a marketing email list is consumer personal data. Elevare
designs the template; **Elevare does not receive, hold, upload, or segment the list.** The client's
ESP holds it. If a client asks Elevare to "just load this CSV", the answer is no — that CSV is
exactly the identifiable data §2 exists to keep out of the building.

---

## 4. Trigger map — what else this product pulls in

Named so nobody has to rediscover it. Each row is a fact about the product that drags a regime with
it.

| If the product… | …then this applies | Where |
|---|---|---|
| Takes payment from a cannabis licensee | Stripe restricted-business rules; FinCEN FIN-2014-G001 banking posture; card-network rules | §7.4, §7.5 |
| Produces email templates the client sends | CAN-SPAM (shared liability) | §3 |
| Produces SMS templates | TCPA — statutory damages per message | §3 |
| Receives any consumer personal data from a MA client | **M.G.L. c. 93H** + **201 CMR 17.00 binding Elevare directly** | §1.1.2, §1.1.3 |
| Receives any personal data from a CT or RI client | CTDPA / RIGL 6-48.1 processor duties + DPA contents | §1.2, §1.3, §8.2 |
| Touches medical/patient transactions | CT § 21a-408d registry confidentiality; RI § 2.14(D)(2) HIPAA-standard protection; MA Protected Patient Records | §2.4 |
| Makes any claim about a product's effect | Health-claim bans in all three states; MA c. 93A substantiation | §5 |
| Makes a comparative or numeric claim | FTC substantiation doctrine via c. 93A § 2(b) | §5.4, §6.4 |
| Cites state open data in client marketing | Implied-endorsement and accuracy risk; CCC disclaimer | §6.4 |
| Is paid a share of client revenue | RI interest-holder disclosure; CT backer analysis; MA control disclosure; Stripe | §7.2 |
| Is sold as an "audit" | Accountancy title restrictions in all three states | §7.8 |
| Compares one client against others | Purpose limitation + **antitrust information exchange** | §8.3 |
| Ships any client-facing web surface | **WCAG 2.2 AA** as the ADA compliance target | §9 |
| Ever publishes or places media on a client's behalf | **This entire document is void; rewrite required** | §11 |

**Not triggered, and worth stating so nobody spends money on it:** GDPR and the UK GDPR (no EU/UK
users contemplated — and a cannabis retailer targeting EU consumers would have far larger problems);
CCPA/CPRA (no California operations); COPPA (a 21+ business must not have under-13 users at all, and
if it does, that is a licence problem before it is a privacy one). Revisit the moment the client
list crosses a state or national line.

---

## 5. ADVERTISING — what may and may not be produced

Elevare produces the file; the licensee publishes it. That boundary determines *who gets penalised*
(§7.3), but it does **not** determine what may be produced — a studio that hands a client an unlawful
asset has done the client real harm regardless of who the regulator writes to. So the rules below are
production rules, enforced at the studio's own review gate, not warnings to pass along.

Four things to hold in mind before the state-by-state detail:

1. **"Massachusetts is looser than Connecticut" is FALSE where it matters.** It is true on the
   audience threshold (85% vs 90%) and on staff speech. It is **false on the entire promotional
   playbook**: Massachusetts prohibits advertising price, discounts, coupons, giveaways, points-based
   rewards and customer loyalty programmes; Connecticut permits discounts in-store, through delivery,
   and on the licensee's own ordering site. **Massachusetts also imposes by far the heaviest mandatory
   warning burden of the three.** Any commercial plan that assumed MA was the permissive market needs
   revising before it reaches a client. §5.1
2. **The differences between states are structural, not stylistic.** An asset whose entire premise is
   a price promotion is unlawful in Massachusetts, unlawful in Connecticut outside three named
   channels, and unregulated in Rhode Island. The same file cannot serve all three. §5.5
3. **The health-claim ban is the common core.** All three prohibit therapeutic, curative or medical
   claims, and Massachusetts and Connecticut both extend it to **safety** claims. It is the rule the
   category breaks constantly, because "helps you sleep" is how everyone in cannabis has been taught
   to sell. §5.4 is the working answer.
4. **Warnings are a layout element, not a footer.** Massachusetts requires "Please Consume
   Responsibly" plus at least two full warnings on the face of the ad, *plus* a ~100-word statutory
   block on all advertising; Rhode Island requires the universal symbol in colour, the licence number
   and a 21+ tagline; Connecticut requires its own two-sentence warning. **Design around them from
   the first composition.**

---

### 5.1 MASSACHUSETTS advertising rules — primary market

Governing regulation: **935 CMR 500.105(4)**, "Advertising Requirements". Quotations below are taken
from the **Commission's own PDF, 935 CMR 500.000, Emergency Regulations, effective 06/18/2026**
(<https://masscannabiscontrol.com/regulations/>), read in full on 2026-08-14. Medical analogue:
935 CMR 501.105(4). Statutory basis: M.G.L. c. 94G § 4, as amended by **St. 2026, c. 65** (approved
19 April 2026).

> **Do not cite Cornell LII for Massachusetts cannabis regulation.** Its copy of 500.105 is current
> only through Mass Register Issue 1535, **eff. 11/22/2024**, and shows no 2026 amendments. An earlier
> draft of this section was written from it. See §5.1.6.

> **CORRECTION TO A WIDELY-HELD BELIEF, AND IT REVERSES A PLANNING ASSUMPTION.**
> Massachusetts is commonly described as "looser than Connecticut" on cannabis advertising. **On the
> commercial questions that matter to this service, that is wrong.** Massachusetts **prohibits price
> advertising** outside three narrow channels, and **prohibits ADVERTISING discounts, coupons,
> giveaways, points-based reward systems and customer loyalty programmes in every channel, including
> in-store.** Connecticut, by contrast, expressly *permits* discount and promotional offers in-store,
> through delivery, and on the licensee's own ordering website. **On promotions, Massachusetts is the
> stricter state.** Every plan built on "we can be more aggressive in MA" needs rewriting.
>
> **Read §5.1.6 before saying any of this to a client.** The prohibition runs to the *advertising*, not
> to operating the programme, and a 2026 statute has authorised the Commission to relax it — a change
> it has not yet made. Getting that nuance wrong in either direction is the most damaging mistake
> available in this vertical.

#### 5.1.1 PERMITTED — 935 CMR 500.105(4)(a)

- **(a)1 Brand Name.** A licensee may develop a Brand Name for labelling, signage and other
  materials, *"provided however, that use of medical symbols, images of Marijuana or Marijuana
  Products or related Paraphernalia images that are appealing to persons younger than 21 years old,
  and colloquial references to Marijuana and Cannabis are prohibited from use in the Brand Name."*
  **Three brand constraints in one sentence:** no medical symbols (no green crosses, no caducei), no
  youth-appealing plant/paraphernalia imagery, and **no colloquial cannabis slang in the name**
  ("Sticky", "Dank", "Loud" and the rest of that naming family).
- **(a)2–(a)4 Sponsorship.** Brand Name sponsorship of a charitable, sporting or similar event is
  permitted where **sponsorship is limited to the Brand Name**, any advertising at the event is
  targeted to a 21+ audience per *"reliable, current audience composition data"* with safeguards, and
  the licensee **retains the audience data for one year**. A municipally-organised event route exists
  at (a)3, tied to the licensee's Positive Impact Plan.
- **(a)5** Product samples may be displayed in **secure, locked cases**, which may be transparent; an
  agent may hand a sample out for **inspection only**.
- **(a)6 — the price channel, and it is narrow.** *"The Marijuana Establishment may post prices in the
  store and may respond to questions about pricing. The Marijuana Establishment shall provide a
  catalogue or a printed list of the prices and strains of Marijuana available at the Marijuana
  Establishment to Consumers and may post the same catalogue or printed list on its website and in
  the retail store."* So: **in-store price posting, a catalogue/price list, and that same catalogue
  on the licensee's own website.** Nothing else.
- **(a)9** Employee discount programmes, run under the diversion-prevention policy at
  500.101(1)(c)8.b, are expressly **not** a prohibited practice.

#### 5.1.2 THE TWO MANDATORY WARNING BLOCKS — the biggest layout constraint in any of the three states

This is the item most likely to blow up a design that was signed off on aesthetics.

- **(a)7** — any advertising created for viewing by the public *"shall include the statement 'Please
  Consume Responsibly', in a conspicuous manner on the face of the advertisement and shall include a
  minimum of two of the following warnings **in their entirety** in a conspicuous manner on the face
  of the advertisement"*:
  a. *"This product may cause impairment and may be habit forming."*
  b. *"Marijuana can impair concentration, coordination and judgment. Do not operate a vehicle or
     machinery under the influence of this drug."*
  c. *"There may be health risks associated with consumption of this product."*
  d. *"For use only by adults 21 years of age or older. Keep out of the reach of children."*
  e. *"Marijuana should not be used by women who are pregnant or breastfeeding."*
- **(a)8** — *"All Advertising produced by or on behalf of a Marijuana Establishment for Marijuana or
  Marijuana Products shall include the following warning, including capitalization,"* per
  M.G.L. c. 94G § 4(a½)(xxvi) — the full block beginning *"This product has not been analyzed or
  approved by the Food and Drug Administration (FDA)…"* and running through the poison-control
  number and *"This product may be illegal outside of MA."*

**Note the words "produced by or on behalf of".** That phrasing reaches **Elevare's output directly**
— an asset Elevare produces for a licensee is advertising produced on behalf of a Marijuana
Establishment. This is the clearest textual hook in any of the three states connecting a production
vendor's work product to a regulatory requirement, and it is why the warning blocks are a **studio
gate, not a client reminder**.

**Design consequence, stated plainly:** a Massachusetts cannabis advertisement carries roughly
100+ words of mandatory warning copy, at conspicuous size, on the face of the ad. That is not a
footer afterthought — **it is a primary layout element and must be in the first composition, not
added at the end.** A 1080x1080 social tile and a shelf talker must both be designed around it.
Any concept that only works without the warning block is not a concept; it is a mock-up.

#### 5.1.3 PROHIBITED — 935 CMR 500.105(4)(b), the full list

| # | Prohibition (quoting the operative words) |
|---|---|
| 1 | Advertising *"deceptive, misleading, false or fraudulent, or that tends to deceive or create a misleading impression, **whether directly or by omission or ambiguity**"* |
| 2 | Broadcast/internet/social/billboard/outdoor/print advertising *"unless at least 85% of the audience is reasonably expected to be 21 years of age or older as determined by reliable and current audience composition data"* |
| 3 | *"statements, designs, representations, pictures or illustrations that portray anyone younger than 21 years old"* |
| 4 | Advertising *"including… mascots, cartoons, and celebrity endorsements, that is deemed to appeal to a person younger than 21"* |
| 5 | Brand sponsorship with mascots, cartoons or celebrity endorsements appealing to under-21s |
| 6 | **Statements about OTHER licensees** that are *"deceptive, misleading, false or fraudulent, or that tends to deceive"* — competitor comparison is expressly policed |
| 7 | Asserting products *"are safe, or represent that its products have curative or therapeutic effects"*, other than required labelling, *"unless supported by substantial evidence or substantial clinical data with reasonable scientific rigor as determined by the Commission"* |
| 8 | Billboards or *"any other public signage, which fails to comply with all state and local ordinances and requirements"* |
| 9 | **"Use of any illuminated or external signage beyond the period of 30 minutes before sundown until closing"** |
| 10 | Vehicles equipped with radio or loudspeakers for advertising |
| 11 | Radio or loudspeaker equipment inside the establishment for advertising |
| 12 | Brand Name sponsorship without 21+ audience data |
| 13 | *"Operation of any website… that fails to verify that the entrant is 21 years of age or older"* |
| 14 | Advertising *"of an improper or objectionable nature… language or images offensive or disparaging to certain groups"* |
| 15 | **Branded goods**: advertising *"solely for the promotion of Marijuana… on Marijuana Establishment Branded Goods including… clothing, cups, drink holders, apparel accessories, electronic equipment or accessories, sporting equipment, novelty items and similar portable promotional items"* |
| 16 | **Transit and vehicle advertising**: *"on or in public or private vehicles and at bus stops, taxi stands, transportation waiting areas, train stations, airports… including… vinyl-wrapped vehicles or signs or logos on transportation vehicles not owned by the Marijuana Establishment"* |
| 17 | **Exterior signage**: *"The display of signs or other printed material Advertising any brand or any kind of Marijuana or Marijuana Products that are displayed on the exterior of any licensed Premises"* |
| 18 | **PRICE ADVERTISING**: *"Advertising of the price of Marijuana or Marijuana Products, except as permitted above pursuant to 935 CMR 500.105(4)(a)6."* |
| 19 | *"Display of Marijuana or Marijuana Products so as to be clearly visible to a person from the exterior"* |
| 20 | **PROMOTIONS**: *"Advertising through the marketing of free promotional items including, but not limited to, gifts, giveaways, discounts, points-based reward systems, customer loyalty programs, coupons, and 'free' or 'donated' Marijuana"* — except employee discounts under (a)9, and except *"Brand Name take-away bags… after a retail purchase is completed"* |

#### 5.1.4 What this actually means for the studio

- **No discount campaign creative. No loyalty/rewards creative. No coupon creative.** Item 20 names
  them individually. A "double points weekend" graphic is not a grey area in Massachusetts; it is an
  enumerated prohibited *advertising* practice. **This removes a large share of the obvious retail-
  marketing playbook and should be said on the first call, not discovered after the first invoice.**
  It does **not** mean the client's underlying programme is unlawful — see §5.1.6, and never tell a
  licensee their loyalty programme is illegal.
- **Price only in three places:** posted in the store, in the catalogue/printed price list, and that
  same catalogue on the licensee's own website. **Not on social, not in email, not on a billboard,
  not on a poster in the window.**
- **Exterior signage is brand-only.** Item 17 prohibits exterior signs advertising *any brand or kind
  of marijuana*; item 19 prohibits product being visible from outside; item 9 shuts illuminated and
  external signage down outside the window from 30 minutes before sundown to closing. Item 8 defers
  to **local ordinances**, which in practice are the binding constraint — **get the town's sign
  by-law before designing a storefront.**
- **No branded merch as advertising.** Item 15 rules out the hoodie/lighter/sticker/tote programme
  that every retail brand wants — **except** Brand Name take-away bags handed over *after* the
  purchase is completed, which item 20 expressly preserves. That single exception is the one branded
  physical item Elevare can design.
- **No transit, no vehicle wraps.** Item 16.
- **Comparative claims about competitors are separately policed** by item 6, over and above the
  general deception rule. Rules out the entire "better than the shop down the road" register.
- **Implied government endorsement** is not separately enumerated, but item 1 reaches it: implying
  Commission approval *"tends to… create a misleading impression."* Note also that item 1 covers
  misleading impressions created *"by omission or ambiguity"* — which is precisely the §6.3 THC-column
  problem. **Treat state-endorsement framing as prohibited.** (§6.4)
- **Dual-licence operators must apply the stricter rule.** 500.105(4)(c): a co-located
  medical/adult-use operator *"may develop a single marketing campaign; provided, however, it shall
  apply the most restrictive requirements applicable under either license."* **This matters for the
  45 Massachusetts operators holding both a retail and an MTC licence** (§0) — one campaign, most
  restrictive rule wins. It is also a neat statement of the discipline §5.5 applies across states.

#### 5.1.5 Still open on Massachusetts

- **Whether a non-licensee vendor can be penalised directly** under 935 CMR 500 — **INCONCLUSIVE**.
  The realistic MA exposure remains c. 93A § 11 from the client (§1.1.4, §7.3). But note that (a)8's
  *"produced by or on behalf of"* language is the strongest textual hook against a vendor found in
  any of the three states, and counsel should be asked about it specifically (§10, Q4).
- **Vendor disclosure.** 935 CMR 500.050(1)(b) requires an applicant to submit *"any contractual,
  management, or other written document that explicitly or implicitly conveys direct or indirect
  control over the Marijuana Establishment"*, and a **"Close Associate"** — holding a *"relevant
  managerial, operational or financial interest"* able to *"exercise significant influence over
  corporate governance"* — is deemed a Person or Entity Having Direct or Indirect Control and is
  disclosable. A fixed-fee production vendor with no management authority sits outside that; **a
  revenue share is exactly the "financial interest" that starts the argument.** Third independent
  reason for the fixed-fee rule (§7.2). Confirmation is **INCONCLUSIVE pending MA counsel** (Q5).
- **Re-verification: done.** All 935 CMR 500 quotations above were read from the Commission's own
  06/18/2026 emergency-regulation PDF on 2026-08-14 (§5.1.6). **But c. 65 § 65 obliges the Commission
  to conform its regulations by roughly 19 April 2027**, so this section has a known expiry — re-read
  the official text before each engagement (§1.1.5).

---

#### 5.1.6 THE LOYALTY / DISCOUNT QUESTION — RESOLVED, and it is not what either side assumed

This clause was contested from two directions: a strict reading (the discount *mechanic* is banned)
and a claim that St. 2026, c. 65 *"legalised discount, loyalty and opt-in email promotion in April
2026."* **Both are wrong as stated.** Resolved below against primary text only.

**Source discipline first, because it nearly went wrong.** The earlier draft of this section was
read from Cornell LII, whose copy of 935 CMR 500.105 is current only through **Mass Register Issue
1535, eff. 11/22/2024** — it does not reflect anything from 2026. The text below is read from the
**Commission's own PDF of 935 CMR 500.000, Emergency Regulations, effective 06/18/2026**
(163 pages), obtained from <https://masscannabiscontrol.com/regulations/>. **Cornell is not an
acceptable source for a current-state claim about Massachusetts cannabis regulation.**

##### The three answers

| Question | Answer | Confidence |
|---|---|---|
| Does 500.105(4)(b)20 ban the **mechanic** or the **advertising of it**? | **The advertising.** Operating a loyalty programme is not itself "Advertising"; promoting one is. | **High** — the text, the defined term, the statute's framing, and the 2026 amendment all point the same way. Not certain: the carve-outs are worded operationally. |
| Did April 2026 **legalise** discounts / loyalty / promotional email? | **No.** c. 65 § 21 only **authorises the Commission to permit** them, in two narrow channels. The Commission **has not yet done so.** | **Very high** — confirmed against the official regulation promulgated *after* the act. |
| Is the prohibition binding **today**, 14 Aug 2026? | **Yes.** | **Very high** |

##### Reading 1 — the mechanic is banned (the strict reading)

Arguments for it, and they are not trivial:
- The two carve-outs are **operational, not communicative**. 500.105(4)(a)9 says *"**Institution** of an
  employee discount program … shall not be considered a prohibited practice under 935 CMR
  500.105(4)(b)"* — *instituting*, not advertising. And (b)20 excepts *"the **provision** of Brand Name
  take-away bags … after a retail purchase is completed"* — handing over a bag is conduct. You do not
  normally carve conduct out of a speech prohibition.
- Field evidence: the owner of Indica LLC (Adams, MA) publicly told the regulator on **2026-06-11**,
  *"We are not allowed to have sales."*

##### Reading 2 — only the advertising is banned

Arguments for it, which are stronger:

1. **The chapeau uses the defined term.** 500.105(4)(b) reads *"The following **Advertising**
   activities are prohibited."* And 935 CMR 500.002 defines **Advertising** as *"a form of marketing
   **communication** that employs a sponsored, non-personal message to sell or promote a Marijuana
   Establishment's Brand Name, Marijuana Establishment Branded Good, service, product or idea."*
   A customer loyalty programme is not a marketing communication. Advertising one is.
2. **Item 20's own verb is "Advertising."** *"**Advertising through the marketing of** free
   promotional items including, but not limited to, gifts, giveaways, discounts, points-based reward
   systems, customer loyalty programs, coupons…"* The enumerated list is the **medium**, not the
   prohibited act.
3. **The words appear nowhere else in the regulation.** `discount`, `free`, `loyalty`, `reward`,
   `coupon`, `gift`, `promotion` and `giveaway` are **all absent from 935 CMR 500.140** — the
   retailer-operations rule, which is where an operational sales prohibition would live. They occur
   only in the advertising section.
4. **The enabling statute frames it as speech.** M.G.L. c. 94G § 4(a½)(6) directs the Commission to
   promulgate *"a prohibition on **advertising, marketing and branding through** certain identified
   promotional items as determined by the commission, including giveaways, coupons or 'free' or
   'donated' marijuana."* Note the statute itself never mentions discounts or loyalty — **the
   Commission added those** under its "as determined by the commission" discretion.
5. **The 2026 amendment is the clincher.** St. 2026, c. 65 § 21 permits the Commission to allow
   *"**advertising, marketing and branding OF** sales, discounts and customer loyalty programs within
   a marijuana establishment, or through an opt-in email list."* The Legislature described the thing
   to be unlocked as *advertising of* those programmes, in *specified channels*. That framing only
   makes sense if what was blocked was the **communication**, not the programme.

**Which the text better supports: Reading 2.** The operational carve-outs are best explained as
belt-and-braces drafting — removing doubt about two edge cases (a staff discount policy that exists
for diversion-prevention reasons, and handing a customer a branded bag) rather than implying a
conduct ban the chapeau cannot carry.

**And Reading 2 explains the Indica tweet rather than conflicting with it.** Under the unamended
regulation a licensee may not advertise a discount **in any channel — including in-store signage**,
which is itself Advertising. A sale nobody may be told about is not a sale. *"We are not allowed to
have sales"* is an accurate operator's shorthand for that, not evidence of a conduct ban. It is one
operator's characterisation on social media, it is not a regulatory statement, and it should be
weighted as corroboration of the *practical* position only.

##### What St. 2026, c. 65 actually did — and the deadline it started

- **c. 65, "An Act Modernizing the Commonwealth's Cannabis Laws," is an emergency law, approved
  19 April 2026** (only § 37 is deferred, to 1 Jan 2028).
  <https://malegislature.gov/Laws/SessionLaws/Acts/2026/Chapter65>
- **§ 21** amends c. 94G § 4 to add: *"provided, however, that **the commission may permit**
  advertising, marketing and branding of sales, discounts and customer loyalty programs **within a
  marijuana establishment, or through an opt-in email list**."*
  This is **permissive, not self-executing.** It confers discretion. It legalises nothing by itself,
  and it is limited to two channels — in-store and opt-in email. It does **not** reach social media,
  billboards, or the public web.
- **§ 65** gives the Commission **one year from the effective date** — i.e. until roughly
  **19 April 2027** — to *"promulgate or amend regulations as necessary to be consistent with this
  act."*
- **The Commission has not exercised the discretion.** The **06/18/2026 emergency regulations —
  promulgated two months *after* the act — leave 500.105(4)(b)20 verbatim unchanged**, still listing
  *"gifts, giveaways, discounts, points-based reward systems, customer loyalty programs, coupons, and
  'free' or 'donated' Marijuana."* The Commission demonstrably had this subsection open in that
  revision (it edited the adjacent (4)(a)9 to read *"prevention of Diversion **or Inversion**"*) and
  still did not conform item 20.

> **THEREFORE, AS OF 14 AUGUST 2026: advertising a discount, sale, coupon, giveaway, points-based
> reward system or customer loyalty programme remains PROHIBITED for a Massachusetts licensee, in
> every channel, including in-store.** A statutory door has opened; the Commission has not walked
> through it; licensees remain bound by the regulation until it does.

**This is a dated, known, forthcoming change — and that is commercially valuable.** There is a
regulatory amendment the Commission is obliged to consider before ~19 April 2027 that would open
in-store and opt-in-email promotion. Elevare can be ready for it. **What Elevare must not do is act
as though it has already happened.**

##### The field evidence, checked directly rather than assumed

Four MA retailers' live sites were fetched and read on 2026-08-14.

- **Wonderland Cannabis Co. (Millbury)** — AlpineIQ present. Its `/loyalty-sign-up/` page's actual
  consent copy reads: *"I consent to enroll in the **member list**, understanding that I will receive
  Wonderland marketing communications, including, but not limited to, advertisements, through text
  messages, emails and other outreach channels."* That is **opt-in marketing-list enrolment, not
  point accrual.** The site's own footer labels the same URL **"Email Sign Up."**
- **Major Bloom (Worcester)** — AlpineIQ present. Its navigation labels the **same** `/loyalty-sign-up/`
  URL as both **"Membership"** and **"eNewsletter Sign-Up."**
- **A correction against myself:** the string `points` appears ~6 times in these pages' source, but in
  every case checked it is **Elementor CSS breakpoint configuration**, not reward points. It is not
  evidence of accrual and must not be cited as such. Anyone auditing this should check the string's
  context, not its count.

**So the hypothesis largely holds: the visible MA "loyalty" deployments look like CRM / opt-in
messaging, not points accrual.** That reconciles widespread AlpineIQ use with a live prohibition.

**But two real exposures were found, and they are copy, not architecture:**

1. **Wonderland's `/loyalty-sign-up/` page metadata** — the `<meta name="description">`, `og:description`
   and `twitter:description` all read: *"Join Wonderland Cannabis Co.'s **Loyalty Program**! Sign up to
   **earn rewards**, access **exclusive deals**, and enjoy member-only benefits."* That is
   public-facing advertising copy, served to search engines and social scrapers, promoting a loyalty
   programme and deals. **Under Reading 2 that metadata is the exposure — the email list is not.**
2. **Major Bloom's `/specials/` page** carries multiple **"% off"** strings, and Wonderland/Enlite run
   "Specials"/"Bundles"/"Deals" pages. There is a genuine argument these are permitted price posting
   under 500.105(4)(a)6 (the catalogue/price list, which *may* be posted on the licensee's own
   website) rather than prohibited discount advertising under (b)20 — **a price is not a "free
   promotional item."** But framing a price as *"% off"*, *"Deals"* or *"Exclusives"* moves it from
   posting a price toward advertising a discount. **This is a genuine grey zone and must be presented
   as one, never as a violation.**

Also noted, and worth telling that operator privately as a goodwill gesture: Wonderland's consent
form names its data recipient as *"its technology provider **TBD**"* — an unreplaced template
placeholder on a live marketing-consent form, which is a real defect in the consent itself.

##### HOW A REVIEW MUST RAISE THIS — exact wording

**Never write or say:** "You are running a prohibited loyalty program", "this is illegal", "you are in
violation", "you could be fined $50,000 a day." Being wrong is unrecoverable on a first contact, and
an assertion that a named business is breaking the law — in writing, to a third party — is the kind of
statement that invites a defamation claim. **Elevare is not qualified to render that verdict and must
not imply that it is.**

**Safe wording — use this, close to verbatim:**

> "One item worth checking with your own counsel. Massachusetts regulates how loyalty and discount
> programmes may be *advertised*, separately from how they operate. 935 CMR 500.105(4)(b)20 lists
> 'discounts, points-based reward systems, customer loyalty programs' among the things a licensee may
> not advertise, and 500.105(4)(b)18 limits where a price may be shown. Separately, the 2026 cannabis
> act (St. 2026, c. 65, § 21) authorised the Commission to permit in-store and opt-in-email promotion
> of exactly these — but as of the Commission's 06/18/2026 regulations that permission has not been
> issued, so the older restriction still reads as current.
>
> We are not lawyers and we are not telling you your programme is non-compliant — plenty of operators
> run opt-in messaging lists that look nothing like the thing the rule targets. What we can tell you is
> where your public-facing *copy* sits relative to the rule, which is a design question we can fix.
> On your site, the page description that search engines and social previews display reads 'earn
> rewards, access exclusive deals.' If you'd like, we can rewrite that metadata so it describes the
> list rather than the rewards, which costs nothing and removes the question entirely."

**Why that wording is safe:** it cites the regulation rather than characterising the client; it
names the countervailing statute so the client is not misled into thinking the rule is settled; it
explicitly disclaims a compliance verdict; it distinguishes the *mechanic* (theirs, not ours to judge)
from the *copy* (ours to fix); and it converts a scary finding into a small, concrete, purchasable
fix. It is also honest — which is the only version that survives the client forwarding it to their
lawyer.

**Standing rule for reviews:** loyalty and discount practice may be raised **only** in the terms
above, and **only** about published copy Elevare has actually read. Never about a programme's internal
mechanics, which Elevare cannot see. If a reviewer wants to go further than this wording, that is a
question for counsel first (§10, Q12).

### 5.2 RHODE ISLAND advertising rules

**The rule set changed regulator and citation in 2025 — do not cite the old DBR rules.** The former
Office of Cannabis Regulation rules at **230-RICR-80-05 are REPEALED as of 15 September 2025**;
authority transferred to the **RI Cannabis Control Commission**, whose rules *"became final and
effective on May 1, 2025."* (<https://rules.sos.ri.gov/regulations/Part/230-80-05-1>)

The current advertising rule is **560-RICR-10-10-2 § 2.8** (Operational Requirements), authority
RIGL §§ 21-28.11-5, 21-28.6-12, 21-28.6-16.
<https://rules.sos.ri.gov/regulations/Part/560-10-10-2>

**What Rhode Island requires**

- **Audience: 85%.** § 2.8(C): *"Cannabis establishments must take reasonable measures to ensure that
  the selected advertising medium targets an audience of which eighty-five (85%) percent of the
  population is reasonably expected to be twenty-one (21) years of age or older… Cannabis
  establishments must provide reliable, verifiable, and current audience composition data if
  requested by the Commission."* Producible on request; no pre-filing.
- **Three mandatory elements on every ad — § 2.8(B)(3):** *"(a) The required universal symbol in
  color; (b) The cannabis establishment license number; (c) 'For Ages 21+ and medical cannabis
  patients'."* **The licence number is mandatory on every advertisement.** This is a hard layout
  constraint and it is the single most commonly missed item when an asset is adapted from another
  state.
- **No curative claims — § 2.8(B)(4)(a):** advertising shall not *"Suggest or imply that cannabis has
  curative or unproven therapeutic effects."* **There is no medical-patient carve-out** — § 2.8
  applies to all cannabis establishment licensees, compassion centres included.
- **Prohibited content — § 2.8(B)(4):** targeting under-21s (b); *"images, symbols, wording or fonts
  that could be attractive to children, including… animal characters, toys, cartoon characters,
  cartoon writing or similar images"* (c); **"florescent or neon colors"** (d); images of children or
  minors (e); *"the consumption, use, or transfer of cannabis"* (f); persons *"in conditions under
  the influence,"* including driving, operating machinery, or pregnant/breastfeeding (j); combining
  with alcohol/nicotine/other controlled-substance content (h); trademark violation (k); and
  *"material that encourages excessive consumption"* (g).
- **The neon/fluorescent ban at § 2.8(B)(4)(d) is a genuine design constraint** and it is unusual
  enough that it will not be on a designer's radar. It rules out a whole palette family that reads as
  contemporary in this category.
- **Distance rule is on the AD, not the sign — § 2.8(B)(4)(i):** advertising shall not *"Be displayed
  or disseminated within five hundred (500) feet of a pre-existing public or private K-12 school."*
  **Playgrounds are not mentioned.** A separate siting rule (§ 1.3.1(A)(5)(c)(1)) governs the premises.
- **Billboards are expressly permitted** — § 2.8(B)(2)(d) lists *"Outdoor media, including billboards
  and street furniture"* — subject to the 500 ft rule and the 85% test.
- **Exterior signage is NOT regulated by the CCC ad rules.** "sign", "signage" and "window" do not
  appear in the rule set; there is no number, size or content limit. **Municipal zoning and sign
  ordinances apply independently** (RIGL §§ 21-28.11-15, -16) and were not researched — treat local
  sign approval as a client responsibility.
- **Discounts, coupons, promotions, loyalty: NOT REGULATED.** An exhaustive term search of
  560-RICR-10-10-2 and -10-10-1 found *discount*, *coupon*, *promotion/promotional*, *giveaway*,
  *loyalty*, *reward* and *free* **all absent**. There is no express ban on consumer discounts and no
  ban on advertising a discount externally. Price parity across channels is required
  (§ 2.17(C)(4) delivery, § 2.18(A)(10) curbside). **Treat this as permissive-but-unsettled, not a
  safe harbour** — § 2.8(B)(4)(g)'s ban on encouraging excessive consumption is the realistic limit
  on aggressive price promotion, and "buy more, save more" framing runs straight at it.
- **Digital: website age-gating is absolute.** § 2.8(B)(2)(a)(i): *"Cannabis establishment websites
  and online media advertisements shall only be accessible to those twenty-one (21) years of age or
  older."* Social media is expressly permitted (§ 2.8(B)(2)(a)). Email/SMS are not addressed by the
  cannabis rules (federal CAN-SPAM/TCPA still apply). Third-party menu platforms are not addressed.
- **No pre-publication approval.** But note the application-stage hook: § 1.3.1(A)(4)(h) requires a
  **"Marketing and advertising plan"** inside the licensee's Operations Manual, and § 1.3.3(A)(4)(l)
  requires a **variance request** for changes to the Operations Manual. A wholesale strategy overhaul
  therefore *may* need a variance filing. This is an inference from two provisions, not an express
  rule — **flag it to the client rather than assuming either way.**
- **The clause that matters most to an agency — § 2.8(B)(5):** where a third party has used a
  licensee's brand or distinguishing characteristics in a non-compliant advertisement, *"the cannabis
  establishment must immediately notify the Commission and issue a cease-and-desist notice to such
  third party."* Two readings, both useful: the regulator's remedy runs **through the licensee**
  (good for Elevare's liability position), and **Elevare could be the recipient of a cease-and-desist
  from its own client** if an asset is non-compliant. Build the review gate accordingly.
- **Penalties — 560-RICR-10-05-1 § 1.18:** up to **$5,000 per violation per day**; up to **$100,000
  per violation per day** for an immediate public health/safety threat or for **unlicensed
  activities**. RIGL § 21-28.11-27 adds criminal exposure for unlicensed activity and for fraud on
  filings.

### 5.3 CONNECTICUT advertising rules — the strictest of the three

Governing statute: **CGS § 21a-421bb**.
<https://codes.findlaw.com/ct/title-21a-consumer-protection/ct-gen-st-sect-21a-421bb/>
Background: OLR report 2023-R-0167, <https://cga.ct.gov/2023/rpt/pdf/2023-R-0167.pdf>

- **Who it binds — and this is unusual.** § 21a-421bb(a): *"No person, other than the holder of a
  cannabis establishment license issued pursuant to this chapter or a person who provides
  professional services related to the purchase, sale or use of cannabis, shall advertise any
  cannabis or services related to cannabis in this state."* The prohibition reaches **any person**,
  not only licensees. See §7.2 and Q3 — Elevare's own Connecticut marketing depends on the
  professional-services carve-out.
- **Audience: 90%** — the strictest of the three states. Cannabis establishments shall not advertise
  by *"television, radio, Internet, mobile application, social media or other electronic
  communication, billboard or other outdoor signage, or print publication unless the cannabis
  establishment has reliable evidence that at least ninety per cent of the audience for the
  advertisement is reasonably expected to be twenty-one years of age or older."*
- **Health, therapeutic and wellness claims are banned, and the ban reaches STAFF SPEECH.** The
  statute prohibits advertising cannabis *"in a manner claiming or implying… that such products have
  curative or therapeutic effects, or that any other medical claim is true,"* and — the part that
  gets missed — *"or allow any employee to promote cannabis for a wellness purpose."* **A budtender
  script, a staff training deck, or a "staff picks" shelf talker written by Elevare is squarely
  inside this.** Treat internal-facing copy as regulated copy in Connecticut.
- **Youth appeal:** no advertising *"In ways that target or are designed to appeal to individuals
  under twenty-one years of age, including… spokespersons or celebrities who appeal to individuals
  under the legal age to purchase cannabis, depictions of a person under twenty-five years of age
  consuming cannabis, or the inclusion of objects, such as toys, characters or cartoon characters."*
  **Note the under-25 rule for consumption imagery** — stricter than the 21 threshold everywhere
  else, and a real casting constraint.
- **DISCOUNTS AND PROMOTIONS ARE BANNED IN ADVERTISING — with a narrow, decisive exception.** A
  discounted price or promotional offering may be offered as an inducement to purchase **only**
  *"(A) within a dispensary facility, retailer or hybrid retailer, (B) through a delivery service, or
  (C) on an Internet web site maintained by or for a dispensary facility, retailer or hybrid retailer
  where cannabis or cannabis products may be lawfully ordered."*

  **Read that carefully, because it is the whole game for a designer:** an in-store shelf talker
  announcing a discount is fine. The same discount on a billboard, an Instagram post, an email blast,
  a radio spot, or a print ad is **not**. The permitted channels are the physical store, the delivery
  channel, and the licensee's own ordering website — nothing else.
- **Required warning on every advertisement:** *"Do not use cannabis if you are under twenty-one
  years of age. Keep cannabis out of the reach of children."*
- **Distance rules — two different numbers:**
  - **Billboards:** not within **1,500 feet** of *"an elementary or secondary school ground or a house
    of worship, recreation center or facility, child care center, playground, public park or
    library."*
  - **Physical advertising visible to the public:** not within **500 feet** of the same list (house of
    worship not enumerated in the 500 ft rule).
- **Exterior signage has an express carve-out** — outdoor signage that meets the criteria (name/logo
  only, **no cannabis plant imagery**, **no more than three colours**, located on the premises or on
  commercial property) is **exempt** from the audience, distance and warning requirements. This is
  the practical route to a compliant storefront sign, and the three-colour limit is a hard brand
  constraint that must be designed to, not discovered at fabrication.
- **Sponsorships:** a cannabis establishment may not sponsor *"charitable, sports, musical, artistic,
  cultural, social or other similar events"* unless there is reliable evidence that not more than
  **10%** of the in-person and viewing audience will be under the legal age.
- **Websites must age-verify:** no operating *"any web site advertising or depicting cannabis…
  unless such web site verifies that the entrants or users are twenty-one years of age or older."*
- **Brand names are registered with DCP**, and DCP will refuse a brand name that is identical or
  confusingly similar to an existing non-cannabis product, is obscene, or is customarily associated
  with minors. **A naming or rebrand project for a CT client has a regulatory approval step in it** —
  scope and price accordingly.
- **Penalties:** a violation of subsections (a) to (c) *"shall be deemed to be an unfair or deceptive
  trade practice"* — i.e. **CUTPA**, which carries actual and punitive damages, attorney's fees, and
  AG enforcement, and which is **not limited to licensees**. Plus DCP licence action against the
  licensee.

---

### 5.4 The DO / DON'T list — for a designer and a copywriter, no lawyer required

This is the working reference. It is deliberately conservative: where the three states differ, it
follows the strictest rule unless the asset is explicitly single-state.

#### The one principle behind all of it

> **You may describe what the product IS and what the lab MEASURED. You may not describe what it
> DOES to a person.**

Every safe phrase below is an objective, measured attribute. Every unsafe phrase is an effect,
benefit, or outcome. Once a copywriter internalises that line, ninety per cent of the rules follow
without looking anything up.

#### Language patterns — SAFE

| Safe | Why it is safe |
|---|---|
| "This batch tested at **2.1% myrcene**." | Measured attribute of the product. No claim about the person. |
| "**26.4% total THC** (THC + 0.877 x THCA), per the certificate of analysis." | Measured, sourced, and the formula is stated. |
| "Terpene profile: myrcene, limonene, caryophyllene." | Composition. |
| "Indica-dominant hybrid. Lineage: X x Y." | Product taxonomy the industry uses descriptively. |
| "Tested by an independent Massachusetts-licensed laboratory. Full COA in store." | Verifiable process statement. |
| "**Ask our staff** about the terpene profiles in this batch." | Directs to a conversation without making a claim. |
| "New this week." · "Back in stock." · "Small-batch, grown in Western Mass." | Merchandising facts. |
| "Statewide median for flower tested Jan–Nov 2025 was 23.2% total THC. Source: Massachusetts Cannabis Control Commission open data." | Cited, period-bounded, like-for-like. §6.4 |
| "Available for pickup." · "Order online, collect in store." | Operational. |
| "21+. Please bring a valid government-issued ID." | Required and unobjectionable. |

#### Language patterns — UNSAFE, never ship

| Unsafe | The problem |
|---|---|
| "**Helps you sleep**." · "Great for anxiety." · "Relieves pain." · "Eases nausea." | Therapeutic/medical claim. Banned in all three states. This is the single most likely failure. |
| "Relax." · "Unwind." · "Calm." · "Focus." · "Energy." — **used as a product benefit or a category header** | Effect claims wearing marketing clothes. A shelf category literally named "SLEEP" is a health claim on a sign. |
| "**Wellness**." · "Therapeutic." · "Medicinal." · "Healing." · "Remedy." | CT bans promoting cannabis *for a wellness purpose* outright, including by employees. |
| "Safe." · "Non-toxic." · "Clean." · "Pure." · "Chemical-free." | Safety claim. MA bans representing products as safe *"unless supported by substantial evidence."* |
| "Cleaner than average." · "Fewer contaminants than most." | Comparative safety claim; unsubstantiable and reaches competitors. |
| "**Doctor recommended**." · "Pharmacist formulated." · "Clinically proven." | Medical claim plus implied professional endorsement. |
| "**State-approved**." · "CCC-certified." · "Commission-approved." · "Meets state standards." | Implied government endorsement. §6.4 |
| "Strongest in the state." · "#1 dispensary." · "Top-rated." | Unsubstantiated superiority; and the state testing data cannot support a product-level rank because it has no product names. |
| "**Buy one get one**" · "50% off" · "Happy hour" · "**Double points**" · "Join our rewards programme" · any coupon | **Enumerated prohibited ADVERTISING practice in Massachusetts** (935 CMR 500.105(4)(b)20), in every channel including in-store — though a 2026 statute may soon reopen in-store and opt-in email (§5.1.6). **Unlawful in Connecticut** outside the store, delivery, or the licensee's own ordering site. Unregulated in RI. §5.1, §5.1.6, §5.3 |
| **Any price**, on social / email / billboard / poster / print | **Prohibited in Massachusetts** (500.105(4)(b)18). Price may appear only posted in store, in the catalogue/price list, and that same catalogue on the licensee's own website (500.105(4)(a)6). |
| A branded hoodie, lighter, sticker, tote or novelty item as a promo giveaway | **Prohibited in Massachusetts** (500.105(4)(b)15). The one exception is a Brand Name take-away bag handed over *after* the purchase completes (b)20. |
| A vehicle wrap, bus-stop poster, or airport/station placement | **Prohibited in Massachusetts** (500.105(4)(b)16). |
| "Better than the dispensary down the road" | **Separately prohibited in Massachusetts** (500.105(4)(b)6 — statements about other licensees). |
| Cartoons, mascots, animal characters, toys, candy styling, anything a child would reach for | Banned in all three. |
| Any person who looks under 21 — **under 25 if they are shown consuming, in Connecticut** | CT's consumption-imagery threshold is 25, not 21. |
| **Anyone consuming, smoking, vaping, or inhaling** | RI bans depiction of consumption outright (§ 2.8(B)(4)(f)). Just do not shoot it. |
| Anyone appearing intoxicated; anyone driving, boating, or operating machinery; anyone pregnant or breastfeeding | RI § 2.8(B)(4)(j), and unwise everywhere. |
| **Fluorescent or neon colours** | **Banned in Rhode Island** (§ 2.8(B)(4)(d)). Easy to trip; not intuitive. |
| Alcohol, nicotine, or other controlled substances in the same creative | RI § 2.8(B)(4)(h). |
| Celebrity or influencer talent with an under-21 following | CT names spokespersons/celebrities who appeal to under-21s explicitly. |
| A cannabis leaf on an exterior sign in Connecticut | Defeats the CT § 21a-421bb signage carve-out (name/logo only, no plant imagery, max three colours). |

#### The rewrite table — how to say the thing they actually want to say

| They want to say | Ship this instead |
|---|---|
| "Perfect for winding down after work" | "Indica-dominant. Myrcene-forward at 2.1%." |
| "Our most relaxing strain" | "Our highest-myrcene batch this month." |
| "Great for a creative afternoon" | "Sativa-dominant. Limonene 0.9%." |
| "Pain relief without the high" | "High-CBD, low-THC: 14.2% CBD / 0.6% total THC." |
| "The cleanest flower in Massachusetts" | "Passed all required contaminant testing. COA available." |
| "Doctors love it" | *(nothing — delete the line)* |
| "50% off all edibles this weekend!" *(on Instagram, CT client)* | "New edibles in stock this weekend." *(and put the offer in-store / on the ordering site only)* |
| "Feel better" | "21+. Ask our staff." |

#### Layout and asset checklist — before any file leaves the studio

- [ ] **Jurisdiction is stamped** on the file name, the artboard, and the delivery note. One asset,
      one state. (§5.5)
- [ ] **Required warnings present, in the target state's exact wording**, legible at the real
      viewing distance — not 6pt in a corner.
      - **MA:** "Please Consume Responsibly" **plus at least two** of the five 500.105(4)(a)7
        warnings **in their entirety**, **plus** the full c. 94G § 4(a1/2)(xxvi) statutory block
        (~100 words, capitalisation preserved) on *all* advertising. Budget the space first.
      - **RI:** universal symbol **in colour** + **licence number** + "For Ages 21+ and medical
        cannabis patients".
      - **CT:** "Do not use cannabis if you are under twenty-one years of age. Keep cannabis out of
        the reach of children."
- [ ] **MA only:** no price anywhere except the in-store posting / catalogue / own-website
      catalogue; no discount, coupon, loyalty or points content at all; no branded merch except a
      post-purchase take-away bag; no exterior sign advertising a brand or kind of marijuana; no
      product visible from outside.
- [ ] **CT only:** discount/promo content appears only on in-store, delivery, or the licensee's own
      ordering site; exterior signage is name/logo, no plant imagery, **max three colours**.
- [ ] **No person appearing under 21** (under 25 if consuming, CT); no consumption imagery at all
      (RI); no cartoons, mascots, toys.
- [ ] **RI: no fluorescent or neon colours.**
- [ ] **No effect, benefit, health, wellness, therapeutic or safety word** anywhere, including
      category headers, shelf-section names, and staff-facing scripts.
- [ ] Every factual and comparative claim traced to a **COA or a cited dataset**, with the period and
      the metric definition stated.
- [ ] **Digital destination age-gates** (all three states require 21+ verification on the licensee's
      site).
- [ ] Contrast and minimum type size checked at the real viewing distance for menu boards — a warning
      nobody can read is not a warning, and it is an accessibility failure as well as a compliance one.
- [ ] Client's **written approval** on file before publication (§8.4 cl. 3).

### 5.5 THE CROSS-BORDER TRAP — read this before reusing any asset

**This is the most likely way Elevare hurts a client, and it will happen through ordinary studio
efficiency: someone reuses a good asset in the next state.**

The states are not variations on a theme. They differ on the numbers, on the required elements, on
the palette, and — decisively — on whether the whole *premise* of the asset is lawful.

| | **Massachusetts** | **Rhode Island** | **Connecticut** |
|---|---|---|---|
| Audience threshold | **85%** | **85%** | **90%** |
| **Advertising** a discount / coupon / loyalty / points | **PROHIBITED in every channel, incl. in-store** (500.105(4)(b)20). Operating the programme is a separate question — §5.1.6 | Not regulated | **PROHIBITED** outside store / delivery / own ordering site |
| Advertising a **price** | **PROHIBITED** except in-store, catalogue, own-website catalogue (b)18 / (a)6 | Not regulated | Permitted in the same three channels as discounts |
| Licence number on the ad | Not required | **REQUIRED** | Not required |
| Universal symbol on the ad | Not required | **REQUIRED, in colour** | Not required |
| "For Ages 21+ and medical cannabis patients" tagline | Not required | **REQUIRED** | Not required |
| Required warning wording | **"Please Consume Responsibly" + 2 of 5 full warnings + the ~100-word c. 94G statutory block** | — | *"Do not use cannabis if you are under twenty-one years of age. Keep cannabis out of the reach of children."* |
| Fluorescent / neon colours | Not addressed in advertising (banned on *packaging*) | **BANNED** | Not addressed |
| Consumption imagery | Not addressed as such | **BANNED outright** | Banned if person appears **under 25** |
| Exterior sign content limit | **No sign advertising a brand or kind of marijuana** (b)17; no illuminated/external signage outside 30-min-before-sundown-to-closing (b)9; local by-law governs | Not regulated by CCC (municipal only) | Name/logo only, **no plant imagery, max 3 colours** |
| Ad distance from school | Not a state distance rule; billboards/public signage must satisfy **all local ordinances** (b)8 | **500 ft**, K-12 only | **1,500 ft** billboards / **500 ft** other physical ads, wider facility list |

**The four assets that will cause the problem:**

1. **A promotional / discount / loyalty asset built for Rhode Island, reused in Massachusetts.**
   Unregulated in RI, an **enumerated prohibited practice** in MA, and restricted to three named
   channels in CT. It is also the *most commercially attractive* asset type, so it is the one most
   likely to be reused. This alone justifies clause 4 of the engagement letter.
2. **Any non-Massachusetts asset reused in Massachusetts**, missing "Please Consume Responsibly", the
   two full warnings, and the ~100-word statutory block. This is the dangerous direction of travel:
   the other two states require far less, so an RI or CT asset dropped into MA is *always* deficient,
   and the deficiency is invisible to anyone who has not read 935 CMR 500.105(4)(a)7–8.
3. **A Massachusetts or Connecticut asset reused in Rhode Island**, missing the licence number, the
   colour universal symbol and the 21+ tagline — three required elements that simply do not exist in
   the other two states' rules, so nobody notices their absence.
4. **A lifestyle photograph** of someone enjoying a product. Constrained in MA (nobody who reads
   under 21), banned outright in RI (no consumption imagery at all), and banned in CT if the subject
   reads under 25.

**The operational control:** there is no "regional" asset. Every deliverable is produced for one
named jurisdiction, the jurisdiction is in the filename and on the artboard, and adapting to a second
state is a **new job with a new compliance review**, not an export. `art-director` owns this at the
taste gate; `design-auditor` checks the stamp is present before delivery.

---

## 6. The Massachusetts public testing dataset

Elevare intends to use the Cannabis Control Commission's published testing results as a **statewide
aggregate benchmark** — e.g. *"this batch tested above the 2025 Massachusetts median for THC."*
The dataset was downloaded and profiled in full on 2026-08-14 rather than taken on description,
and the profiling changed the answer materially.

### 6.1 What the file actually is — verified, not assumed

`https://masscannabiscontrol.com/resource/CCC_Testing_Results_2025.csv`, linked from
<https://masscannabiscontrol.com/open-data/data-catalog/>

| Property | Verified value |
|---|---|
| Rows | **354,562** (matches the brief) |
| Columns | `DATE`, `METRC ID`, `METRC SOURCE TAG`, `ANALYTE/TEST ID`, `RESULT`, `TESTPASSED`, `LAB PERFORMING THE TEST`, `NOTES/COMMENTS` |
| Date range | **2025-01-01 to 2025-11-30** — *not* a full calendar year |
| Distinct `METRC ID` values | **50,423** |
| Distinct analytes | **7**, and all seven are labelled **"Raw Plant Material"** |
| Analytes | THC (%), THCA (%), Arsenic, Cadmium, Lead, Mercury, Total Yeast and Mold |
| Labs | **13**, pseudonymised as `Lab_A` … `Lab_O` |
| `TESTPASSED` | 351,346 True / 3,216 False at row level |
| Batches with ≥1 failed test | **3,187 of 50,423 = 6.32%** |

`METRC ID` and `METRC SOURCE TAG` are 64-character hex — SHA-256-shaped. **The coordinator's
assertion that identifiers and lab names are hashed/anonymised is independently confirmed.** There
is no brand, product name, strain, cultivator, or store column. The dataset genuinely cannot be
joined to a named product or a named business as published.

### 6.2 Terms of use — permissive, but the disclaimer is the story

The catalogue page carries the Commission's own disclaimer, quoted verbatim:

> *"All information shared via the Open Data Platform is self-reported by licensees. The Cannabis
> Control Commission (Commission) does not guarantee completeness, accuracy, timeliness, or the
> results obtained from the use of this information, or offers a warranty of any kind, express or
> implied, including, but not limited to warranties of performance, merchantability, and fitness for
> a particular purpose… because data are self-reported by licensees, they might contain
> typographical errors, sales or product errors, or other inaccuracies."*

And, specifically for testing:

> *"Please note that the Commission releases testing data after a six-month lag period to prevent
> any potential interference with ongoing investigations."*

There is **no licence restricting reuse and no stated attribution format.** Massachusetts public
records published for download by a state agency may be used commercially. So: **the use is
permissible.** The risk is not permission. The risk is **accuracy and implied endorsement**, and
both are manageable with wording.

### 6.3 The finding that reshapes the product: do not cite the THC column

The naive benchmark is wrong, and wrong in a way that would be embarrassing on a shelf talker.

| Metric (raw plant material, n = 50,416 batches) | p10 | **median** | p90 | max |
|---|---|---|---|---|
| `THC (%)` — the column literally named THC | 0.19 | **0.50** | 1.33 | 15.86 |
| `THCA (%)` | 18.95 | **25.70** | 31.67 | 51.79 |
| **Total THC** = THC + 0.877 × THCA | 17.28 | **23.19** | 28.51 | 47.02 |

In unheated flower almost all of the cannabinoid is present as the acid form, THCA; the `THC (%)`
column is the small residual delta-9 fraction. **A "2025 Massachusetts median THC of 0.50%" is a
number essentially every batch on the market beats**, so a claim built on it would be
simultaneously true, meaningless, and misleading — the worst combination, and precisely the kind of
technically-accurate-but-deceptive impression that 935 CMR 500.105(4) and M.G.L. c. 93A both reach.

**Three rules follow:**

1. **Benchmark on Total THC (THC + 0.877 × THCA), and say so in the footnote.** Publish the formula.
2. **The benchmark is valid only for RAW PLANT MATERIAL / flower.** Every analyte in this file is
   raw plant material. There is **no basis in this dataset for a concentrate, vape, or edible
   benchmark** — do not extrapolate, do not let a designer reuse the flower figure on a vape shelf
   talker.
3. **The denominator is Jan–Nov 2025, not calendar 2025.** Say "January–November 2025". Calling it
   "2025" is a small inaccuracy that a competitor or a regulator can characterise as a bigger one.

### 6.4 Endorsement risk, and the exact safe phrasing

Two distinct hazards:

- **Implied state endorsement.** Citing a regulator's data next to a product can read as the
  regulator vouching for the product. Massachusetts does not enumerate government-endorsement claims
  separately, but **935 CMR 500.105(4)(b)1 reaches them**: advertising that *"tends to deceive or
  create a misleading impression, whether directly or by omission or ambiguity"*. Note the words
  **"by omission or ambiguity"** — that is exactly the §6.3 wrong-column problem, and it means a
  technically-true-but-misleading benchmark is prohibited on the face of the regulation, not merely
  unwise. **Treat state-endorsement framing as prohibited.**
- **Comparative/superiority claims.** "Above the state median" is a comparative performance claim
  about a product, and under c. 93A § 2(b) Massachusetts imports FTC substantiation doctrine — an
  objective performance claim needs substantiation **at the time it is made**. The substantiation
  here is the client's own COA plus the published dataset, which is adequate **only if the
  comparison is like-for-like** (§6.3) and the COA is the one for the batch actually on the shelf.

**SAFE — use these patterns:**

- "Lab-tested at **26.4% total THC** (THC + 0.877 x THCA). Statewide median for flower tested
  January–November 2025 was **23.2%**. Source: Massachusetts Cannabis Control Commission open data;
  results are self-reported by licensees and published on a six-month lag."
- "This batch: 26.4% total THC. Massachusetts flower median, Jan–Nov 2025: 23.2%."
- "Terpene profile for this batch: myrcene 2.1%, limonene 0.8%. See the COA."
- "Tested by an independent Massachusetts-licensed laboratory. Full certificate of analysis
  available in store / at [link]."

**UNSAFE — never ship these:**

- "Above the state average" with no figure, no period, and no source.
- "State-verified potency", "Commission-approved", "CCC-certified", "meets Massachusetts standards"
  — all imply government endorsement of the product.
- "The strongest flower in Massachusetts", "top 10% in the state" — superlatives and rank claims
  that the dataset cannot support for a *named product*, because the dataset has no product names.
- Any benchmark applied to a concentrate, vape, edible, or beverage.
- Any benchmark used as a proxy for quality, safety, or effect ("cleaner than average" → this is a
  safety claim; see §5's health-claim rules).
- Any use of the CCC's seal, logo, or wordmark. Cite the source in text only.

### 6.5 A non-obvious risk worth naming: the dataset is pseudonymised, not anonymous

`METRC ID` is a hash of a real METRC package tag, and METRC tags are structured and largely
sequential. That means **anyone holding a real tag can test whether that batch is in the file** by
hashing it — membership disclosure — and a determined party with a known tag prefix could plausibly
enumerate a range. This is not a consumer-privacy problem (these are business records, not personal
data), and it does not affect the aggregate benchmark use at all.

It matters for one reason: **it makes "match my own batches to the state file" technically
feasible, and Elevare must not build that feature.** Doing so would (a) require the client's real
METRC tags, which pulls regulated operational identifiers into Elevare's systems for no marketing
benefit, and (b) risk being characterised as defeating the Commission's own de-identification of a
published dataset. Aggregate benchmark only. **This constraint goes in the product spec, not just
this document.**

### 6.6 The 6.32% failure statistic — do not use it in client marketing

3,187 of 50,423 batches had at least one failed test. That is an interesting *internal* market
statistic. It is **not** usable in a client-facing asset, because any framing of it ("we passed when
6% didn't") is a comparative safety claim about competitors, sourced from data that cannot identify
the competitors. Keep it in the strategy deck; keep it off the shelf talker.

---

## 7. Elevare's own exposure

### 7.1 Federal status — verified live, and it is NOT what most 2026 commentary says

This was checked against the Federal Register and the current Code of Federal Regulations on
2026-08-13/14, because secondary sources are actively wrong about it and one of them nearly went
into this document.

**What actually happened on 28 April 2026** — three separate documents published the same day:

1. **Final rule, effective 2026-04-28** — *Schedules of Controlled Substances: Rescheduling of Food
   and Drug Administration Approved Products Containing Marijuana From Schedule I to Schedule III*.
   <https://www.federalregister.gov/documents/2026/04/28/2026-08176/>
   It places in **Schedule III** marijuana, marijuana extract, and naturally derived delta-9 THC
   **"in a U.S. Food and Drug Administration approved product or subject to a state medical
   marijuana license"** — now codified at **21 CFR 1308.13(g)(2)–(4)**, confirmed present in the
   live CFR as of 2026-08-13 via the eCFR versioner API.
   It also adds **21 CFR 1300.01** definition of *"State medical marijuana license"* and an
   **expedited DEA registration process at 21 CFR 1301.13(k)** for state-medical-licensed
   manufacturers, distributors and dispensers.
2. **Proposed rule / notice of hearing** — *Rescheduling of Marijuana*, hearing beginning
   **29 June 2026**. <https://www.federalregister.gov/documents/2026/04/28/2026-08177/>
3. **Withdrawal** of the 2024 notice of hearing.
   <https://www.federalregister.gov/documents/2026/04/28/2026-08178/>

**So, precisely:**

- **Adult-use marijuana remains Schedule I.** This is explicit, not inferred:
  **21 CFR 1301.13(k)(1)(iv)** — *"Registrations under this subpart do not authorize the
  manufacture, distribution, dispensing, or use of marijuana or products containing marijuana for
  non-medical purposes."*
- **Marijuana under a state MEDICAL licence is Schedule III** as of 28 April 2026.
- **General rescheduling of all marijuana is still only PROPOSED.** A DEA search of all DEA
  documents published since 2026-04-01 returned no final rule rescheduling marijuana generally.

**Why this matters commercially, and it matters a lot:**

- Any claim in a pitch, deck, or client email that "cannabis is Schedule III now" is **false for the
  adult-use business that is 100% of the Massachusetts retail opportunity**. Do not say it. The
  studio's stale-state rule applies: this was verified against the running system, and anyone
  repeating it later must re-verify rather than cite this paragraph.
- It sharpens the medical/adult-use split that §2.4 already treats as a hard boundary. A
  Massachusetts operator holding both a retail licence and an MTC licence (45 of them) is now
  potentially operating on **two different federal schedules on two sides of the same building.**
- **§ 280E** of the Internal Revenue Code disallows ordinary business deductions for a trade or
  business trafficking in Schedule I or II substances. It does **not** reach Elevare — Elevare does
  not traffic in a controlled substance — but it is why dispensary clients are cash-poor relative to
  revenue and will push hard on price and payment terms. Price with that in mind. Whether the
  medical-side Schedule III move changes a hybrid client's 280E position is **a question for their
  tax counsel, not for Elevare, and Elevare must not opine on it.**

### 7.2 Does Elevare need a cannabis licence or registration?

**Connecticut — no licence, but read the advertising statute carefully.**
CGS § 21a-421bb(a) begins: *"No person, other than the holder of a cannabis establishment license
issued pursuant to this chapter **or a person who provides professional services related to the
purchase, sale or use of cannabis**, shall advertise any cannabis or services related to cannabis in
this state."*
(<https://codes.findlaw.com/ct/title-21a-consumer-protection/ct-gen-st-sect-21a-421bb/>)
Two readings follow, and both are useful:
- The prohibition **reaches non-licensees** — it says "no person", not "no cannabis establishment".
  Most of the operative restrictions in subsection (b) are addressed to cannabis establishments, but
  subsection (a) is not.
- The **professional-services carve-out** is almost certainly what lets an agency, law firm,
  accountant or consultant advertise its own cannabis-sector services in Connecticut. Elevare
  marketing *itself* to dispensaries should sit inside that carve-out. **This is an attorney
  question, not a settled one** (§10, Q3) — the phrase is undefined in the statute and no DCP
  guidance interpreting it was located.

**Connecticut — the real trap is "backer", not "licence".**
CT DCP defines a Backer as *"an individual with a financial interest in a cannabis establishment,
and either (1) owns 5 percent or more… or (2) participates directly or indirectly in the control,
management or operation of the cannabis establishment."*
(<https://portal.ct.gov/cannabis/knowledge-base/articles/backer>). Backers must be **licensed**
(CGS § 21a-421a), and transactions producing a material change — including *adding a backer* — must
be **filed with the Office of the Attorney General** under CGS § 21a-422k
(<https://portal.ct.gov/ag/sections/antitrust/cannabis-notices-of-material-change-filing>).
A fixed-fee production vendor with no ownership and no operational control is outside that. A
**revenue-share arrangement is a compensation-based financial interest and moves toward it.**

**Rhode Island — no vendor registration for a fixed-fee vendor; a revenue share changes the answer.**
Per the RI research: the "Interest holder / Key person" definition at 560-RICR-10-10-1 § 1.2(A)(12)
captures anyone with *"any financial interest… whether they have ownership interest or not"*, and
§ 1.2(A)(13)(c) defines material financial interest to include *"an opportunity to gain profit from
the operation"*. A percentage-of-sales fee therefore plausibly makes Elevare a disclosable interest
holder on the **licensee's** application, with a continuing-disclosure duty under § 1.3.2 and
revocation exposure **for the client** if undisclosed. A fixed fee keeps Elevare outside the
perimeter entirely. The licensee must retain the contract for five years and it is inspectable
(§ 2.14(D)(1)).

**Massachusetts — no vendor licence or CCC registration for a fixed-fee vendor; see §5.1.5 for the
control-disclosure analysis and why a revenue share changes it.**

> ### THE PRICING RULE THAT FALLS OUT OF ALL THREE STATES
>
> **Elevare bills cannabis clients on a FIXED FEE. Never a percentage of sales, never a share of
> revenue, never a performance fee tied to the client's takings, never equity.**
>
> This is a direct conflict with the studio's house Stripe Connect application-fee model, and the
> house model **must not be used for this vertical**. A revenue share is the single cheapest way to
> convert Elevare from an invisible vendor into a disclosable financial-interest holder in a
> licensed cannabis business in at least two of the three states — with the licence risk landing on
> the client, which is worse than it landing on Elevare.

### 7.3 Can a regulator penalise Elevare directly?

The honest answer across all three states is **probably not directly, but the question has no clean
answer and the client's exposure is the real risk.**

- **Rhode Island: INCONCLUSIVE, leaning no.** § 2.8 is addressed to *"cannabis establishments"*.
  The strongest textual signal is § 2.8(B)(5), which handles a non-compliant **third-party** ad by
  obligating the *licensee* to notify the Commission and serve a cease-and-desist on the third
  party — i.e. the remedy runs **through** the licensee. Counterweight: "Person" is defined broadly
  and 560-RICR-10-05-1 § 1.18 carries up to **$100,000 per violation per day for unlicensed
  activities**. No case law located.
- **Connecticut:** a violation of CGS § 21a-421bb(a)–(c) *"shall be deemed to be an unfair or
  deceptive trade practice"* — i.e. **CUTPA**. CUTPA is not limited to licensees, and subsection (a)
  is addressed to "no person". That is a genuine, if untested, direct hook.
- **Massachusetts:** the sharper exposure is not the cannabis regulator at all — it is
  **M.G.L. c. 93A § 11**, the business-to-business unfair-practices claim, under which the
  *client* can sue Elevare, with **not less than double and up to treble damages** for a willful or
  knowing violation and **mandatory attorney's fees** to a prevailing petitioner. There is no 30-day
  demand-letter prerequisite under § 11 (that is § 9, the consumer route). An overstated deliverable,
  a data mishandling, or a capability misrepresentation is the trigger.

**The practical conclusion is the same in all three:** Elevare's realistic legal exposure is
**contractual and commercial, not regulatory** — being sued or dropped by a client whose licence was
put at risk, not being fined by a cannabis commission. Which is precisely why §8's engagement
letter, not a compliance certificate, is the actual control.

### 7.4 Payments — will Stripe process this?

**Stripe's own restricted-business list is unambiguous about cannabis.**
<https://stripe.com/legal/restricted-businesses> lists as **prohibited**: *"Cannabis products"*;
*"Cannabis dispensaries and related businesses"*; *"CBD products with THC levels greater than the
applicable local jurisdiction's legal limit, including CBD edibles"*; *"Hydroponic equipment and
other cultivation or production equipment marketed for growing marijuana"*; and *"Courses and
information on cultivating marijuana."*

Read that against what Elevare actually does:

- **Elevare's own business is creative production and analytics, not cannabis.** Elevare is the
  merchant of record; the product sold is design and reporting services. That is not, on its face, a
  prohibited business.
- **But "cannabis dispensaries and related businesses" is broad, undefined, and Stripe interprets
  its own list.** A studio whose stated customer base is licensed dispensaries is a plausible
  "related business". This is a **risk-acceptance decision, not a compliance conclusion** — and the
  downside is not a declined charge, it is **account termination and a funds hold across every other
  Elevare client on the same Stripe account.** That is a fleet-wide blast radius from a
  single-vertical decision.

**The hard rules, in priority order:**

1. **Never onboard a dispensary onto Elevare's Stripe Connect platform.** Do not create a connected
   account for a cannabis licensee, do not settle their consumer sales, do not take an application
   fee on their takings. That is unambiguously prohibited, it is the house model, and the house
   model does not apply here. (It is also the §7.2 revenue-share problem wearing a different hat.)
2. **Never misdescribe the business to Stripe.** Stripe's prohibited-uses section covers *"Use of
   Stripe products to facilitate transactions on behalf of another undisclosed merchant or for
   products or services that weren't disclosed."* Mis-coding cannabis-sector work to keep an account
   open converts a commercial risk into a misrepresentation. Do not do it, and do not let a
   well-meaning ops decision do it by omission.
3. **Do not put this vertical on the shared Elevare Stripe account at all until a decision is made
   deliberately.** The recommended posture for pilot clients is **invoice + ACH/ ACH-debit or
   cheque, outside the card networks**, which sidesteps the card-brand rules entirely and is normal
   and unremarkable to a dispensary CFO.
4. If card acceptance is genuinely required at scale, the path is a **separate legal entity with its
   own processor relationship**, disclosed accurately, or a processor that knowingly serves
   cannabis-ancillary businesses. That is a business decision for the owner, with counsel.

**Ask Stripe in writing before scaling.** A written answer to "we sell design and analytics services
to licensed cannabis retailers, billed as fixed-fee professional services; is that acceptable on our
account?" is cheap and converts an unknown into a known.

### 7.5 Banking

Elevare's own bank may classify it as an **indirect marijuana-related business**. The governing
framework is FinCEN's **FIN-2014-G001, *BSA Expectations Regarding Marijuana-Related Businesses***,
14 February 2014 —
<https://www.fincen.gov/resources/statutes-regulations/guidance/bsa-expectations-regarding-marijuana-related-businesses>
— which sets out suspicious-activity-report expectations for financial institutions serving
marijuana-related businesses. Banks apply it conservatively and de-risk by closing accounts.

Practical guardrails: tell the bank the truth up front rather than being discovered; keep cannabis
receivables identifiable in the books; do not commingle this line of business with the studio's
consumer-facing product revenue in a way that would take down the whole banking relationship if the
bank objects; and have a second banking relationship established **before** it is needed.
**[NEEDS OWNER DECISION]** — whether to route this vertical through a separate entity and a
separate bank account is a business call the owner must make, not a compliance conclusion.

### 7.6 Insurance

Elevare should not sign a cannabis-sector client until it has **written confirmation from its broker
that its existing policies do not exclude cannabis-industry work.** Media/advertising liability and
professional liability policies commonly carry controlled-substance or cannabis exclusions, and the
exclusion is usually discovered at claim time.

Cover to confirm in writing, naming the policy and the endorsement:
- **Professional liability / errors & omissions**, expressly covering work for cannabis-licensed
  clients — this is the policy that responds to "your shelf talker made a health claim and our
  client got a licence action".
- **Media / advertising liability**, covering claims arising from content Elevare produced —
  including trade dress, trademark, and right-of-publicity claims from imagery and copy.
- **Cyber / data breach**, expressly covering a client-data incident, with the Massachusetts
  93H notification obligations in mind.
- **General liability** with no cannabis exclusion.

This is **[NEEDS BROKER CONFIRMATION]**, not a legal question, and it is a hard gate: no signed
client before the broker's written answer. An E&O policy that excludes the only vertical you are
selling into is the same failure mode as a dead button — it exists, it just cannot succeed.

### 7.7 Contract enforceability and the federal overhang

Because adult-use marijuana remains federally Schedule I (§7.1), a contract with an adult-use
licensee carries a **residual illegality-of-object risk**: a party could argue the agreement is
unenforceable as contrary to federal public policy. Courts have generally been unwilling to let
cannabis businesses escape their own contracts on that basis, but the doctrine exists and it is
**Q6 in §10 for counsel**. Practical mitigations that cost nothing: keep Elevare's obligations
purely as services (design, analysis) rather than anything touching the plant; take payment for work
already delivered on short terms rather than extending credit; and include a severability and
choice-of-law clause the attorney selects.

Also flag: Elevare should **not** accept payment in cash for these engagements. A design studio
taking large cash payments from a cannabis retailer creates structuring and BSA questions nobody
wants.

### 7.8 "Audit" is a restricted term of art — do not name the product a "Dispensary Performance Audit"

All three states restrict accountancy titles, and the restrictions are close enough that one naming
rule works everywhere. The answer is **not** "the word audit is banned" — it is narrower and more
interesting than that, which is exactly why people get it wrong.

**Massachusetts — M.G.L. c. 112 § 87D.** The controlling sentence:

> *"No person or firm not holding a valid license issued under section eighty-seven B or eighty-seven
> B1/2 shall assume or use any title or designation that includes the words 'accountant', 'auditor',
> or 'accounting', in connection with any other language… which implies that such person or firm
> holds such a license or has special competence as an accountant or auditor."*
> — <https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXVI/Chapter112/Section87D>

§ 87D also bars an unlicensed person from issuing a **"report"**, defined at § 87A as *"An opinion,
report or other form of language used with reference to any attest or compilation service that
states or implies assurance as to the reliability of the attested information or compiled financial
statements."* There is an express safe harbour for *"other services involving the use of accounting
skills… and the preparation of financial statements without the issuance of reports thereon."*
Penalty: misdemeanour, up to $1,000 and/or one year, plus injunctive relief under § 87D½. (§ 87C was
repealed in 2010 — do not cite it.)

**Connecticut — CGS § 20-281g.** Materially the same: an unlicensed person or firm *"shall not
assume or use any title or designation that includes the words 'accountant', 'auditor' or
'accounting' in connection with any other language, including the language of a report, that implies
that such person or firm holds such a permit or has special competence as an accountant or
auditor"*, and shall not issue a report on financial statements or render attest or compilation
services.
(<https://codes.findlaw.com/ct/title-20-professional-and-occupational-licensing-certification-title-protection-and-registration-examining-boards/ct-gen-st-sect-20-281g/>)

**Rhode Island — RIGL § 5-3.1-16(g):** *"No person or entity not holding a permit… shall hold
himself, herself, or itself out to the public as an 'accountant' or 'auditor'… on any sign, card, or
letterhead, or in any advertisement or directory."* § 5-3.1-16(f) and § 5-3.1-18(f) bar preparing or
signing attest or compilation reports or anything *"having the appearance or import of any attest or
compilation report"*. Penalty under § 5-3.1-20: misdemeanour, up to $1,000 for an individual and
$5,000 for an entity; § 5-3.1-19/21 make a single act sufficient for an injunction and make an
advertisement bearing a protected designation prima facie evidence.
(<http://webserver.rilegislature.gov/Statutes/TITLE5/5-3.1/5-3.1-16.HTM>)

**The precise line:** what is restricted is (i) **holding yourself out** under the titles
*accountant / auditor / accounting* or a confusable variant, and (ii) **issuing a report that states
or implies assurance** about financial information. The standalone noun "audit" naming a service is
not itself enumerated in any of the three statutes.

**But the recommendation is still: don't.** A firm selling a paid, written "Audit" of a business's
transactional and financial performance is squarely inside the implication the statutes target, the
"in connection with any other language… which implies… special competence" test is open-textured, and
Rhode Island adds a separate "misleading firm name" standard at § 5-3.1-16(h). The upside of the word
is a slightly punchier product name. The downside is a misdemeanour and an injunction in three
states. **Rename it.**

| **Unsafe** | **Safe** |
|---|---|
| Dispensary Performance **Audit** | Dispensary Performance **Review** |
| Revenue Audit · Financial Audit · Marketing Audit | Performance Assessment · Sales Diagnostic |
| "our **auditors**" · "we **audit** your POS data" | "our analysts" · "we analyse your POS data" |
| "**audited** results" | "reviewed results" · "analysed results" |
| Any use of *accountant / accounting / auditor* in the firm or service name | Consumer Behaviour Analysis · Retail Analytics Report · Category Performance Study · Merchandising Review |
| Language implying assurance: "fairly presents", "in accordance with standards", "we examined" | "based on the data supplied by the client", "descriptive analysis", "no assurance is expressed" |

**Standing disclaimer on every report deliverable** (also §8.4 clause 6):

> This is a marketing and merchandising analysis prepared from data supplied by the client. It is not
> an audit, attest, review, compilation, examination, or assurance engagement. No opinion or
> assurance is expressed regarding any financial statement or financial information. Elevare Studio
> is not a licensed public accounting firm.

---

## 8. The contract

Two documents, deliberately separate: an **engagement letter / MSA** that defines the service and
where responsibility sits, and a **data processing addendum** that governs the feed. Both are drafted
here as a starting template for counsel — **neither should be signed as written.**

### 8.1 What the agreement must contain

| # | Clause | Why, and which state drives it |
|---|---|---|
| 1 | **Scope: production only.** Elevare produces files and reports. Elevare does not publish, post, place, buy media, or transmit anything to a consumer. | The entire liability model in §7.3 rests on this. |
| 2 | **Licensee is the publisher and the responsible party.** Client reviews, approves, and publishes; approval is in writing before publication; client confirms compliance with its own state's cannabis advertising rules. | RI 560-RICR-10-10-2 § 2.8 and CT § 21a-421bb address the *establishment*; MA 935 CMR 500.105(4) likewise. The regulator's counterparty is the licensee. |
| 3 | **Data processing addendum** (§8.2), incorporated by reference. | CTDPA § 42-521(b); RIGL § 6-48.1-7; MA 201 CMR 17.03(2)(f). |
| 4 | **Purpose limitation.** Client data may be used solely to produce that client's deliverables. No product development, no model training, no aggregation across clients, no internal benchmarking, no case studies without separate written consent. | CTDPA/RIGL de-identification commitments; MA 93A. |
| 5 | **No resale, no onward transfer.** Elevare will not sell, licence, rent, or otherwise disclose client data to any third party except named subprocessors under flow-down terms. | RIGL § 6-48.1-3(a)(2) makes third-party recipients nameable; MA 201 CMR 17.03(2)(f) flow-down. |
| 6 | **No re-identification.** Elevare will not attempt to re-identify any individual, will not combine the feed with any other dataset for that purpose, and will notify the client immediately if re-identification occurs inadvertently. | CTDPA § 42-515(16)(B)/(C); RIGL § 6-48.1-7. This is the recipient commitment the statute requires. |
| 7 | **Retention and deletion**, with the real numbers from §2.5, plus a certificate of destruction. | "As long as necessary" is a placeholder, not a policy. |
| 8 | **Security commitments** naming the actual controls: encryption in transit and at rest, MFA, least privilege, per-client isolation, named-individual access, annual review, employee training, documented incident response. Elevare warrants it maintains a **written information security program**. | MA 201 CMR 17.03 / 17.04 bind a vendor **directly** once any MA personal information is received; maintaining the WISP unconditionally removes the argument. |
| 9 | **Breach notification.** Elevare notifies the client **without unreasonable delay and in any event within 24 hours** of becoming aware, with the facts the client needs for its own regulatory notices, and cooperates in them. | M.G.L. c. 93H § 3(a) obliges a vendor that maintains but does not own the data to notify the owner; the 24-hour clock is contractual, tighter than the statute, and is what makes the client's own "as soon as practicable" duty achievable. |
| 10 | **Client warranties**: it has the right to provide the data; it has excluded all medical/patient transactions; its published privacy policy is accurate and discloses this processing; it has obtained any consent required. | §2.4, §2.7. This is the clause that puts the collection-side risk where it belongs. |
| 11 | **Compliance review is the client's.** Elevare's compliance input is informational and is not legal advice; the client is responsible for obtaining its own legal review before publication. | §7.3 — the whole point. |
| 12 | **No health, therapeutic, medical, or safety claims** in any asset; Elevare will refuse to produce copy that makes one, and a client instruction to include one is a permitted ground to refuse and to terminate. | Every state, see §5. Make refusal a contractual right, not an argument. |
| 13 | **Substantiation.** Any factual/comparative claim supplied by the client is warranted by the client as substantiated; Elevare may require the COA or source before producing the asset. | MA c. 93A § 2(b) imports FTC substantiation doctrine. |
| 14 | **Fixed fee.** No revenue share, no percentage of sales, no equity, no performance fee tied to client takings. | §7.2 — this is a licensing/disclosure control, not a pricing preference. |
| 15 | **No control, no management.** Elevare has no authority over the client's operations, personnel, pricing, or product, and is not an agent of the client. | RI § 1.2(A)(12)(c)/(e); CT "backer"; MA control disclosure. |
| 16 | **Liability cap and mutual indemnity**, with the client indemnifying Elevare for consequences of what the client publishes, and Elevare indemnifying for its own data handling. Cap sized against the 93A risk. | MA c. 93A § 11 carries **minimum double damages and mandatory fees** — an uncapped B2B exposure here is not acceptable. |
| 17 | **Termination**: either party on notice; immediate for a compliance refusal under clause 12; deletion obligations survive. | |
| 18 | **Choice of law and venue**, selected by counsel per state. | |
| 19 | **Change control**: any new data field, new use, or new asset type is a written change request through compliance review. | Stops the allowlist eroding one Slack message at a time. |

### 8.2 Data processing addendum — required contents

Connecticut's CTDPA § 42-521(b) and Rhode Island's RIGL § 6-48.1-7 both specify what a
controller-processor contract must contain, in near-identical terms. Massachusetts specifies
nothing, because it has no comprehensive privacy act — so **draft to the CT/RI standard and apply it
to MA clients too.** It costs nothing and it is the cure if identifiable data ever leaks into the
pipe.

Mandatory contents (satisfying both statutes):
1. **Instructions for processing** — what Elevare may do, and nothing else.
2. **Nature and purpose** of the processing.
3. **Type of data** subject to processing — attach the §2.2 allowlist as a schedule, so the
   allowlist is a contractual term rather than an internal preference.
4. **Duration** of processing.
5. **Rights and obligations of both parties.**
6. **Duty of confidentiality** binding each person who processes the data.
7. **Deletion or return** of all data at the client's direction at the end of services.
8. **Information sufficient to demonstrate compliance**, made available on request.
9. **Subcontractor flow-down** by written contract on the same obligations, with subprocessors named
   and a right to object to new ones.
10. **Assessment/audit rights**, including a right to a report from an assessment against a
    recognised control standard.

Plus, specific to this vertical and not in either statute:
11. **The de-identification commitments** — Elevare's public commitment not to re-identify and its
    contractual obligation to keep the data de-identified, mirroring the controller's own statutory
    commitment. **Elevare must actually publish that commitment**, not merely sign it: a "public
    commitment" that exists only in a countersigned PDF is not public. It goes on the Elevare site,
    dated and versioned.
12. **The medical-exclusion attestation** (§2.4, gate G3).
13. **The minimum-cell-size policy** (§2.4) as a contractual output constraint.

### 8.3 Cross-client benchmarking — NOT PERMITTED, and here is the line

The obvious next product is *"how does my store compare to other dispensaries?"* It is the most
commercially valuable thing in the roadmap and it is **not permitted under the contracts and posture
described above.** Saying so plainly now is cheaper than unwinding it later.

Why it fails today:
- **Purpose limitation** (clause 4) and **no onward transfer** (clause 5) forbid using Client A's
  data to produce anything for Client B. A benchmark is exactly that.
- Even "aggregated" output leaks. With 312 operating Massachusetts operators, a benchmark cohort
  built from a handful of clients in one region is **re-identifiable by subtraction** — a client who
  knows its own numbers and the cohort mean can often solve for a competitor's. That is not
  aggregation, it is a thin disguise.
- It creates an **antitrust** question that has nothing to do with privacy: a third party
  systematically circulating competitively sensitive pricing and sales data among horizontal
  competitors is the classic information-exchange fact pattern. **This is Q7 for counsel in §10 and
  it is the one most likely to be underestimated**, because it does not look like a privacy problem
  and no privacy control fixes it.

What would be required before it could ship:
1. **Separate, specific, written consent** from every contributing client — an opt-in describing
   exactly what is contributed and what is published, not a line in the MSA.
2. **True aggregation with a defensible floor**: a minimum number of *contributing businesses* per
   published cell (not baskets), suppression of any cell where one contributor exceeds a dominance
   threshold, and complementary suppression.
3. **No competitively sensitive dimensions** — no current pricing, no per-competitor anything, and
   ideally a reporting lag that renders the data historic rather than actionable.
4. **Antitrust counsel sign-off**, separate from privacy counsel.
5. A public methodology statement.

Until all five exist: **the roadmap may say "under review". The sales deck may not mention it, and
no client may be told it is coming.** A claim-reality mismatch on an unbuilt feature is the same
defect class as a false capability bullet.

### 8.4 Draft engagement-letter language

**Not legal advice; template only; counsel must review and adapt per state.**

> **1. Services.** Elevare Studio ("Elevare") provides (a) periodic consumer-behaviour analysis
> derived from data supplied by the Client, and (b) production of marketing asset files
> ("Deliverables"). Elevare's engagement is limited to the creation and delivery of files and
> reports to the Client.
>
> **2. Client is the publisher.** Elevare does not publish, post, display, distribute, transmit,
> broadcast, or place any Deliverable, and does not purchase, place, or manage advertising or media
> on the Client's behalf. The Client alone determines whether, when, where, and in what form any
> Deliverable is published or displayed. **The Client is solely responsible for all content it
> publishes, including any Deliverable, and for that content's compliance with all applicable laws
> and regulations**, including without limitation the cannabis advertising, marketing, labelling and
> signage requirements of each jurisdiction in which the Client operates, and the terms of the
> Client's licence.
>
> **3. Review and approval.** No Deliverable is published until the Client has reviewed it and given
> written approval. The Client acknowledges that it is the holder of the applicable cannabis
> licence, that it is the party regulated by the applicable cannabis authority, and that it will
> obtain its own legal and regulatory review of each Deliverable prior to publication.
>
> **4. Jurisdiction of use.** Each Deliverable is produced for use in the jurisdiction(s) identified
> in the applicable statement of work. **Deliverables are not interchangeable between jurisdictions.**
> The Client will not publish a Deliverable in any jurisdiction other than the one identified without
> first requesting a jurisdiction-specific version from Elevare, and Elevare accepts no
> responsibility for a Deliverable published outside its stated jurisdiction.
>
> **5. No legal advice.** Elevare is not a law firm and does not provide legal advice. Any
> compliance-related observation, checklist, or guideline provided by Elevare is informational, is
> not a legal opinion, and does not certify compliance with any law or regulation. The Client is
> responsible for obtaining advice from its own counsel.
>
> **6. No accounting or assurance services.** Elevare is not a licensed public accounting firm. No
> Deliverable constitutes an audit, attest, review, compilation, examination, or assurance
> engagement, and no Deliverable expresses any opinion or assurance regarding any financial
> statement or financial information.
>
> **7. Prohibited content.** Elevare will not produce any Deliverable that states or implies a
> health, medical, therapeutic, curative, wellness, or safety benefit of cannabis, that targets or
> is likely to appeal to persons under 21, or that Elevare reasonably believes would violate an
> applicable cannabis advertising rule. A Client instruction to produce such content is grounds for
> Elevare to refuse the instruction and, at Elevare's option, to terminate this agreement without
> penalty.
>
> **8. Client-supplied claims.** Where a Deliverable includes a factual, comparative, or performance
> claim supplied or directed by the Client, the Client represents and warrants that the claim is
> truthful, not misleading, and substantiated at the time it is made, and will provide
> substantiation on request. Elevare may decline to produce a Deliverable containing an
> unsubstantiated claim.
>
> **9. Data.** The Client's provision of data to Elevare is governed by the Data Processing
> Addendum. The Client represents and warrants that (a) it has the right to provide the data; (b)
> the data contains no personal information and no medical or patient-linked transaction data; (c)
> its published privacy notice accurately describes the disclosure of data to Elevare and was
> published prior to the first transfer; and (d) it has obtained any consent required by applicable
> law.
>
> **10. Independent contractor; no control.** Elevare is an independent contractor. Nothing in this
> agreement grants Elevare any ownership interest in, or any authority over the control, management
> or operation of, the Client or its licensed business. Elevare's compensation is a fixed fee and is
> **not** based on, or a share of, the Client's revenue, sales, or profits.
>
> **11. Publicity.** Neither party will identify the other in marketing materials, case studies, or
> public statements without prior written consent.

**Note on clause 4:** it exists because of §5's cross-border trap and it is the clause most likely to
be cut for brevity. It should not be. A Massachusetts asset published in Connecticut is the most
predictable way this business hurts a client.

---

## 9. Risk register — what is wrong or missing right now

Ordered by expected damage, not by likelihood. Technical items are assigned to the engineer who owns
them; nothing here is "someone should look at this".

| # | Risk | Severity | Owner | Fix |
|---|---|---|---|---|
| R1 | **The house Stripe Connect revenue-share model applied to a cannabis client.** Converts Elevare into a disclosable financial-interest holder in RI (and toward "backer" in CT), and puts the *client's licence* at risk for non-disclosure. Also squarely prohibited by Stripe. | **Critical** | `delivery-lead` + owner | Fixed-fee only. Write the exception into the pricing model and the Connect onboarding checklist so nobody reaches for the default. §7.2 |
| R2 | **Cross-border asset reuse.** A promotional asset that is unregulated in RI is an **enumerated prohibited practice in MA** and restricted to three channels in CT; MA's mandatory warning blocks do not exist in the other two; RI's licence-number and colour-symbol requirements do not exist in the other two. Nothing transfers cleanly except the 90%-audience over-satisfaction. | **Critical** | `art-director` + `conversion-copywriter` | Jurisdiction stamped in the filename, the artboard, and the delivery note; §8.4 clause 4 in every contract. §5.5 |
| R3 | **A stray identifier in the feed.** One `customer_id`, one notes column, one exact timestamp and the de-identified status collapses — taking with it the CTDPA/RIGL safe harbour and pulling Elevare directly under MA 201 CMR 17.00. | **Critical** | `backend-engineer` | Allowlist gate G1, fails closed; negative-control suite G2. §2.6 |
| R4 | **Medical/patient transactions in an export from a hybrid operator.** 45 MA operators and an unknown share of CT hybrids can produce this by accident on the first export. | **Critical** | `backend-engineer` + `compliance-counsel` | Client-side exclusion + written attestation + load-time assertion. Gate G3. §2.4 |
| R5 | **Client's live privacy policy contradicts the data flow** ("we never share your information"). Cleanest possible c. 93A / CUTPA / RIGL 6-13.1 claim, and it is the client who gets sued. | **High** | `compliance-counsel` | Pre-flight on the deployed page before the first transfer. Gate G6. §2.7 |
| R6 | **A health/therapeutic claim reaches a shelf talker.** The most likely single compliance failure in the whole service, because "helps you sleep" is how the entire category talks. | **High** | `conversion-copywriter` + `design-auditor` | The §5.4 DO/DON'T list as a hard review gate on every asset; contractual right to refuse (§8.4 cl. 7). |
| R6b | **A Massachusetts asset ships without the mandatory warning blocks**, or with a layout that cannot fit them. 935 CMR 500.105(4)(a)8 reaches advertising *"produced by or on behalf of"* a licensee — i.e. Elevare's own output. | **High** | `art-director` + `design-auditor` | Warning copy blocked out in the FIRST composition, not added at the end; §5.1.2 checklist item is a hard gate. |
| R6d | **Telling a licensee their loyalty programme is illegal.** Unrecoverable on first contact, outside Elevare's competence, and an assertion that a named business is breaking the law. The visible MA deployments checked are opt-in messaging lists, not point accrual. | **Critical** | `compliance-counsel` + `sales-closer` | Only the §5.1.6 script may be used, only about published copy actually read. Never a verdict on the programme. |
| R6e | **Telling a licensee promotions are now legal** because "the April 2026 act legalised it." It did not — it authorised the Commission to permit, and the Commission has not. | **Critical** | `compliance-counsel` | §5.1.6. The 06/18/2026 emergency regulation is the operative text. |
| R6f | **This section going stale on a known date.** St. 2026 c. 65 § 65 obliges the Commission to conform regulations by ~19 April 2027; in-store and opt-in-email promotion may become permitted. | Medium (rising) | `compliance-counsel` | Re-read the CCC regulations page quarterly; §12 trigger list. |
| R6c | **The commercial plan was built on "Massachusetts is the looser market."** It is not, on promotions, price or warnings. Pricing, scope and the pitch all assumed a playbook that MA prohibits. | **High** | `business-strategist` + `marketing-strategist` | Re-scope the MA offer around merchandising, education and brand rather than promotions. §5.1 |
| R7 | **The THC benchmark computed from the wrong column.** Median "THC" of 0.50% vs Total THC of 23.19% — a claim that is true, meaningless and misleading at once. | **High** | `analytics-engineer` | Total THC formula fixed in the pipeline, matrix restricted to flower, denominator stated as Jan–Nov 2025. §6.3 |
| R8 | **c. 93A § 11 exposure to the client** — minimum double damages and mandatory fees, no demand-letter prerequisite. | **High** | owner + counsel | Liability cap, accurate capability representations, no absolute security guarantees. §8.1 cl. 16 |
| R9 | **Stripe account termination cascading across every other Elevare client** on the shared account. | **High** | owner | Keep this vertical off the shared account; invoice/ACH for pilots; written question to Stripe before scaling. §7.4 |
| R10 | **E&O / media liability policy excludes cannabis work**, discovered at claim time. | **High** | owner | Broker confirmation in writing before the first signature. §7.6 |
| R11 | **"Dispensary Performance Audit" as a product name** — restricted-title exposure in three states. | Medium | `brand-strategist` | Rename before any collateral exists. §7.8 |
| R12 | **Cross-client benchmarking shipped or sold before it is permitted** — purpose-limitation breach plus an antitrust information-exchange problem no privacy control fixes. | Medium (now) / Critical (if shipped) | `product-strategist` | Not in the deck, not promised to clients, "under review" at most. §8.3 |
| R13 | **Stale 935 CMR citations.** Acts of 2026 c. 65 restructured the MA Commission and amended c. 94G § 4; the regulations may be mid-revision. | Medium | `compliance-counsel` | Re-verify every 935 CMR cite against the promulgated text before it enters a client deliverable. §1.1.5 |
| R14 | **Repeating "cannabis is Schedule III now."** False for adult-use, which is the entire MA opportunity. | Medium | everyone | §7.1. Adult-use remains Schedule I; only state-medical-licensed and FDA-approved products moved. |
| R15 | **Free-text fields treated as scrubbable.** They are not; they are where the phone number and the diagnosis live. | Medium | `backend-engineer` | Hard deny, no exceptions, enforced by G1. §2.3 |
| R16 | **An unverified market number in a pitch.** The CT hybrid-retailer share in the original brief could not be confirmed and appears to be wrong. | Low | `business-strategist` | Use only the §0 verified figures; mark the rest `[NEEDS VERIFY]`. |

**Accessibility is also legal exposure here, not craft.** Any client-facing surface Elevare builds
(a dashboard, a report portal, an online menu) is subject to the same **WCAG 2.2 AA** target the
studio holds everywhere, and an inaccessible ordering or age-gate flow is an ADA risk for the client.
Hand the specifics to `design-auditor`. In-store digital menu boards are worth a specific look: text
contrast and minimum type size on a screen read from three metres is both an accessibility issue and
a "can the customer read the required warning" compliance issue.

---

## 10. Open questions that genuinely need a licensed attorney

These are not rhetorical. Each one changes the product if answered the wrong way, and none can be
resolved from published sources.

| Q | Question | Why it matters | Who |
|---|---|---|---|
| **Q1** | **Is adult-use cannabis purchase data "consumer health data" / "sensitive data" under CTDPA § 42-515 and RIGL § 6-48.1-2?** | If yes, every CT dispensary is in CTDPA scope at any volume and opt-in consent is required to process it. No guidance or enforcement action located in either state. | CT + RI privacy counsel |
| **Q2** | **Does Elevare's de-identified feed genuinely satisfy CGS § 42-515(16) and RIGL § 6-48.1-2?** Specifically: is a per-export rotating-salt basket surrogate enough, and is hour-level timestamping enough, given store-level granularity? | This is the load-bearing assumption of the entire design. | CT + RI privacy counsel |
| **Q3** | **Does CGS § 21a-421bb(a)'s carve-out for "a person who provides professional services related to the purchase, sale or use of cannabis" cover Elevare marketing its own services in Connecticut?** | If not, Elevare's own CT marketing is unlawful advertising by a non-licensee, with CUTPA consequences. The phrase is undefined and no DCP guidance was found. | CT cannabis counsel |
| **Q4** | **Can a non-licensee production vendor be directly penalised** under the MA, RI or CT cannabis advertising rules for a file the licensee published? | Determines whether the §8 contract is sufficient protection or whether Elevare needs a different structure. RI research says INCONCLUSIVE, leaning no; CT's CUTPA hook says maybe. | Cannabis counsel in each state |
| **Q5** | **Does a revenue-share fee make Elevare a disclosable interest holder** (RI § 1.2(A)(13)(c)) or a "backer" (CT), and does it trigger a MA control disclosure? | Confirms or removes the fixed-fee rule in §7.2. The rule stands until an attorney says otherwise. | Cannabis counsel in each state |
| **Q6** | **Is a services contract with an adult-use (Schedule I) licensee enforceable**, and does the April 2026 medical-side Schedule III change alter the analysis for a hybrid client? | Collection risk and contract design. | Commercial counsel |
| **Q7** | **Antitrust: what would a cross-client benchmark have to look like** to avoid an unlawful information exchange among horizontal competitors? | The highest-value roadmap item is gated on this, and it is not a privacy question. | Antitrust counsel |
| **Q8** | **Does Massachusetts's 935 CMR 500.140(2)(c) restrict what a retailer may *transfer* to a vendor**, or only what it may *acquire and record*? | Determines whether an MA client's lawfully-held loyalty data may ever be used. Reading the text, it is a collection rule — but the client will ask. | MA cannabis counsel |
| **Q9** | **Confirm the current promulgated text of 935 CMR 500/501** after Acts of 2026 c. 65. | Every MA regulatory citation here depends on it. | MA cannabis counsel |
| **Q12** | **Does 935 CMR 500.105(4)(b)20 prohibit OPERATING a discount/loyalty programme, or only ADVERTISING one?** §5.1.6 concludes "only advertising" on the text, the defined term and the 2026 amendment's framing — but the carve-outs are worded operationally and no CCC guidance or enforcement action was located. | Determines whether a review may ever raise a client's programme mechanics at all. Until answered, only the §5.1.6 script is permitted. | MA cannabis counsel |
| **Q13** | **Is a "2 for $30" bundle or a "% off" tile on a licensee's own website a permitted price posting under 500.105(4)(a)6, or prohibited discount advertising under (b)20?** Live MA sites do both openly. | The most common real-world pattern Elevare will be asked to design. | MA cannabis counsel |
| **Q14** | **Has the Commission signalled how it will exercise the c. 65 § 21 discretion**, and on what timetable before ~19 April 2027? | A dated, known channel opening Elevare could be first to build for. | MA cannabis counsel / CCC public meetings |
| **Q10** | **Insurance**: confirm in writing that E&O, media/advertising liability and cyber cover cannabis-sector work with no exclusion. | Not a legal question but a hard gate. | Broker |
| **Q11** | **Stripe / banking**: written confirmation of acceptability, or a decision to route this vertical through a separate entity and processor. | Fleet-wide blast radius. | Owner + counsel |

---

## 11. Recommendation: CONDITIONAL GO

**Go — for Massachusetts, with a narrow first product, and only after five gates close.**

The business is viable and the compliance shape is workable, for one structural reason: **Elevare
produces files and the licensee publishes them.** That boundary is what keeps the regulatory
counterparty as the client and leaves Elevare with a contractual rather than a regulatory risk
profile. Everything in this document is downstream of protecting that boundary.

Massachusetts is the right primary market on the commercial merits — **457 active retail licences
across 354 EINs with a hard three-licence cap** is a genuine market of independents — and on the data
side it is the *easiest* of the three, because it has no comprehensive privacy act and its
"personal information" definition is narrow and conjunctive.

**But it is NOT the easiest on advertising, and the plan must be re-scoped for that.** Massachusetts
prohibits advertising price, discounts, coupons, giveaways, points-based rewards and loyalty
programmes outright, prohibits branded merchandise and transit advertising, restricts exterior
signage to non-product content, and imposes the heaviest mandatory warning burden of the three states
(§5.1). **The viable Massachusetts offer is therefore merchandising, education, brand and in-store
experience — not promotions.** That is still a real offer: menu boards, shelf talkers that describe
measured attributes, category/terpene education, brand systems, take-away bags, and the in-store
catalogue that is one of only three lawful places a price may appear. It is simply not the offer most
people assume when they hear "dispensary marketing", and the deck must be built accordingly.

**The five gates that must close before the first client signature:**

1. **Counsel review.** A cannabis-licensee attorney admitted in Massachusetts reviews §5, §7 and §8,
   and answers Q1, Q3, Q4, Q5, Q8 and Q9. RI and CT counsel before entering those markets.
2. **Insurance confirmed in writing** (Q10). E&O, media/advertising liability, cyber — no cannabis
   exclusion.
3. **Payments decided** (Q11). Invoice/ACH for pilots; the shared Stripe account is not used for this
   vertical until a deliberate decision with counsel.
4. **The intake gate built and proven red** — G1 through G6 in §2.6, with each test watched failing
   before it is trusted passing.
5. **The pricing model changed to fixed-fee** for this vertical, with the Connect application-fee
   default explicitly disabled.

**Ship first (v1):** basket-level behaviour reports with no customer key, plus asset production, for
**Massachusetts adult-use-only retailers** — deliberately not hybrids, for the first two or three
clients, so the medical-exclusion path is proven on easy cases before it matters.

**Do not ship in v1:** repeat-visit or lifetime-value analysis (needs a customer key); cross-client
benchmarking (§8.3); anything touching medical/patient data; any concentrate/edible potency
benchmark (§6.3); **any discount, coupon, loyalty or points creative for a Massachusetts client**
(§5.1.3 item 20); SMS templates (§3); Connecticut clients (do it third).

**No-go conditions — if any of these is true, stop:**
- Insurance excludes cannabis work and cannot be endorsed.
- Counsel advises that a non-licensee vendor carries direct advertising liability in the target
  state and it cannot be contracted around.
- A client insists on revenue-share pricing.
- A client insists on sending identifiable or medical data.
- Elevare is asked to publish, post, or place media on a client's behalf. That is a different
  business with a different risk profile, and this document does not cover it.

---

## 12. Document control

**Version 1.0 — 14 August 2026.** First issue. No previous version.

**Sections written against superseded text and since corrected:** §5.1 and §5.1.3 were first drafted
from Cornell LII's copy of 935 CMR 500.105, which is current only through **11/22/2024**. They have
been re-read against the Commission's official **06/18/2026 emergency-regulation PDF** and corrected;
§5.1.6 records the result. No other section depended on that source.

Verified live during preparation (rather than cited from memory or secondary summary):
21 CFR 1308.13(g) via the eCFR versioner API (2026-08-13 issue); the three DEA Federal Register
documents of 2026-04-28; the CCC licence dataset (`CCCLASTUPDATED` 2026-08-14); the CCC 2025 testing
dataset in full (354,562 rows); the CCC open-data disclaimer text; Stripe's published restricted-
business list; FinCEN FIN-2014-G001; the Commission's official 935 CMR 500.000 PDF effective
06/18/2026 (163 pp.); St. 2026, c. 65 in full; M.G.L. c. 94G § 4 as published; and the live pages of
four Massachusetts retailers.

**Re-verify this document immediately on any of these events:**
- **any CCC amendment to 935 CMR 500.105(4) — expected before ~19 April 2027 under St. 2026, c. 65
  § 65, and specifically any exercise of the § 21 discretion to permit in-store or opt-in-email
  promotion of sales, discounts and loyalty programmes. This is the highest-value scheduled change in
  the document.**
- enactment of a Massachusetts comprehensive privacy act (S.2608 or successor)
- any DEA final rule rescheduling marijuana generally (the proposed rule's hearing opened 2026-06-29)
- any RI Cannabis Control Commission advertising rulemaking
- any CTDPA amendment or Attorney General guidance on consumer health data
- any change to Stripe's restricted-business list
- **any change to the service model** — in particular, Elevare publishing or placing anything on a
  client's behalf, which voids §7 entirely

**Reminder, because it is the most important line in the document:** I am not a licensed attorney,
this is not legal advice, and nothing here certifies compliance. Get a lawyer before the first
client signs.
