# TEMPTATION — Brand-Specific Agent Pod

> ## FROZEN — do not start Temptation work
>
> **The brand is frozen and its infrastructure is deleted. This pod is kept for the brand DNA, not for execution.**
>
> - **The freeze:** `BUSINESS-PLAN.md` **§Phase 6 — Kill and freeze** — *"Freeze: Thames Coast, Temptation. No work until $1,000/month."*
> - **The 2026-09-05 infra deletion:** the Vercel project `temptation` and the Supabase project `lyapzjbwgbjjbkdmyygk` were both deleted that day (backed up first — restore map below). `D:\Temptation` no longer exists.
> - **Re-verified 2026-09-06 against the live system, not memory:** `temptation1717.com` → **404**, `temptationllc.vercel.app` → **404**, `ls D:\Temptation` → no such directory. GitHub `ELEVAREL/temptation` is still there (private, `master` = `0af3c45`, 2026-07-15).
>
> **While the freeze holds:** no pod agent plans a drop, creates a product, re-prices, drafts a caption, schedules a post, or spends anything. If a conductor routed you here, stop and tell the owner the pod is frozen.
>
> **What would have to happen for the pod to be live again — all four:**
> 1. Elevare clears the Phase 6 bar of **$1,000/month**.
> 2. The owner **explicitly lifts the freeze** (this banner comes off in the same edit).
> 3. The infrastructure is **restored from the map below** — a new Supabase project from the dump, a new Vercel project from the source snapshot, and **every credential re-minted**: the vaulted Printful/Printify/Supabase keys point at deleted projects and stale tokens.
> 4. **The payment rail is an unsettled owner decision.** `BUSINESS-PLAN.md` §Phase 6 kills Elevare's Stripe deps and Square is the studio's live rail; the Stripe ACCOUNT still takes direct charges, which is why this is a decision and not a default. The built version self-funded through Stripe Issuing and Square has no Issuing equivalent, so the funding mechanic must be re-designed, not restored. **Do not re-mint or fund either rail until the owner picks one.**
>
> **Decommission residue — an owner decision, not a pod task.** The brand went dark with live money rails still standing: the live Stripe account `acct_REDACTED`, an Issuing virtual card (last4 5412) with **no spending limit set**, and two POD stores (Printful `18457614`, Printify `28217953`) that were never closed. The domain `temptation1717.com` stays registered on auto-renew by owner decision. Nobody owns decommissioning these; surface it, do not act on it.

A dedicated, brand-expert pod for **TEMPTATION** — the founder's memento-mori graphic-apparel house ("beautiful, but dangerous": old-master engravings of beauty and mortality, worn on the body, released as numbered chapters). These agents are experts in their function **and** streetwear/apparel ecommerce **and** the Temptation brand specifically. They bake in the brand DNA so the owner can invoke one name and get an expert, without re-briefing the whole memento-mori system each time.

They are **not** a replacement for the studio — they operate **inside** the Elevare flow: every agent reads `STANDARDS.md`/`CRAFT.md`, follows the `PLAYBOOK.md`, and composes under **delivery-lead** (build) and **marketing-strategist** (marketing). They defer to the universal gates (code-quality, test, design-auditor, security-reviewer, qa-verifier, performance, art-director) and to the shared house rules. The pod adds Temptation *expertise* on top of the general team — it does not fork the process.

## Source of truth — the restore map

`D:\Temptation` is gone. Every pod agent reads from these surviving locations, never from memory.

| What | Where it lives now |
|---|---|
| **Brand docs** — `DIRECTION.md` (visual governing), `IDENTITY.md` + `tokens.css` (buildable system), `MESSAGING.md` (verbal system), `BRAND-INVENTORY.md` (real DNA) | GitHub **`ELEVAREL/temptation`** (private), `brand/` on `master` (`0af3c45`, 2026-07-15). Read a file with `gh api repos/ELEVAREL/temptation/contents/brand/<file> --jq .content \| base64 -d`. |
| **Build + product docs** — `PLAN.md` (architecture/contract), `DROP-01-PRODUCT-SPEC.md`, `DROP-CALENDAR-2026.md`, `PREORDER-SPEC.md`, `CARD-COLLECTION.md`, `PRINTFUL-BRANDING-SETUP.md`, `HIGGSFIELD-PROMPTS.md`, `IMAGE-MANIFEST.md` | Same repo, `docs/`. **Exception:** `TEMPTATION-MARKETING-PLAN.md` and `DROP-01-AD-PLAN.md` still quote dead garment prices on `master` — read those two from branch **`docs/stale-state-sweep-2026-08-12`** (`1b8ce99`, 1 commit ahead, doc-only). **A branch read REQUIRES `?ref=`. Without it `gh api` returns `master` — the stale-price file — silently, with no error, and the wrong prices land in copy, ads and margin math.** The only working form: `gh api "repos/ELEVAREL/temptation/contents/<path>?ref=docs/stale-state-sweep-2026-08-12" --jq .content \| base64 -d` |
| **The web app as it was actually deployed** — newer than `master`, and the only copy of that state | `D:\_sec-backups\vercel-deleted-20260905\temptation\files\src\` (475 files). Print masters: `…\public\print-ready-v2\` (41 files). Marks / wordmark / seal SVG: `…\public\brand\`. Env key *names* (not values): `…\temptation\env-keys.json`. |
| **Catalog, orders, accounts, storage** (the deleted Supabase project) | `D:\_sec-backups\supabase-deleted-20260905\temptation-lyapzjbwgbjjbkdmyygk.sql` (pg_dump 17, schemas `public`+`auth`+`storage`) and `…\temptation-storage\{public-media,relics}\` (184 objects). |
| **Lost — do not go looking for a replacement path** | `brand/assets/engravings-source/` and `brand/assets/print-ready/` were **gitignored** and existed only on `D:\Temptation`. They are gone. The engraving plates are reproducible from the recipe recorded in `web/public/media/engravings/MANIFEST.md` (engine, prompt spine, per-motif job IDs, `_process.py` keying params). |

**Stack as it stood — all of the hosted parts now deleted:** Next.js 16 + Supabase + Stripe (live, direct charges) + a provider-agnostic POD layer (Printful default, Printify breadth) on Vercel, storefront `temptation1717.com`.

## The pod

| Agent | One-line job |
|---|---|
| **temptation-brand-guardian** | The final taste + consistency gate — the single "is this Temptation?" judgment over BOTH the visual system and the verbal voice. Approves / fixes / rejects before anything ships. |
| **temptation-graphic-designer** | Creates NEW engravings, apparel print designs (front lockup + full-back), the collect-the-cards deck, marks — delivered as transparent raster plates (web) + 300-DPI transparent PNGs (POD print). Owns the generate → key → white-ink pipeline. Never hand-authors a mark as SVG path data. |
| **temptation-merchandiser** | Catalog + POD operations — products/variants via the provider-agnostic adapter, blanks/colorways, pricing/margin (≥55%), Supabase catalog seed, the drop + card-collection catalog. |
| **temptation-drop-strategist** | Plans numbered drops as chapters — release calendar, ceremony + honest scarcity, the archive-trophy state, the collect-the-cards loyalty mechanic, and The Order / Custodians community program. |
| **temptation-conversion-copywriter** | Every on-site/email/ad word in the memento-mori voice — PDP plaque+read, drop openings, microcopy, email, ads — plus store CRO. Executes MESSAGING.md. |
| **temptation-growth-marketer** | Demand + acquisition — paid social, growth loops, UGC, Custodian/influencer recruiting, drop launches, funnel/CRO experiments. Drafts only; spend is human-gated. |
| **temptation-social-content** | The always-on organic engine — IG/TikTok cadence, drop-hype build-up, honest trendjacking, native hashtag sets, community. Draft only; human posts. |

## How they compose (under the studio conductors)

**Build / storefront work → conductor `delivery-lead`.** The pod slots onto the build wave in `docs/PLAN.md` §8:
- **temptation-graphic-designer** produces the art (web plate + print PNG) that **temptation-merchandiser** turns into catalog products through the POD adapter; ui-designer / frontend-builder / design-engineer / payments-engineer / backend-engineer build the surfaces around them.
- **temptation-brand-guardian** runs as the brand-specific taste gate **alongside** art-director in the gate wave — art-director judges universal craft, brand-guardian judges "is this Temptation" (visual + verbal). A brand-guardian REWORK is a blocker, same as a failed gate.

**Marketing / drop launches → conductor `marketing-strategist`** (or `content-engine-lead` for the always-on engine):
- **temptation-drop-strategist** architects the chapter (what/when/ceremony/loyalty) → **temptation-conversion-copywriter** writes it → **temptation-growth-marketer** (paid + acquisition + Custodian recruiting) and **temptation-social-content** (organic + hype cadence) amplify it → creative from graphic-asset-designer / motion-ad-director / video-producer → marketing-analyst measures. The studio's social-growth-strategist feeds the pod its real-time hashtag/timing/trend layer.

**Clean seams (no overlap):**
- Guardian *judges*; graphic-designer *makes* the art.
- Merchandiser owns the *operational catalog + POD plumbing + margin*; drop-strategist owns *what releases, when, and the ceremony/loyalty*.
- Conversion-copywriter owns *on-site + email + ad words + CRO*; social-content owns *organic platform content + community*.
- Growth-marketer owns *paid + acquisition + ambassador recruiting*; social-content owns *organic always-on*.

## Standing rules (inherited, non-negotiable)
- **Source of truth is the brand docs in the repo + the backup trees above, never memory.** Read them before acting. There is no live store to check against any more — where the docs and this file disagree with a memory, the docs win, and where a claim can only be settled by a running system, it cannot currently be settled at all: say so instead of asserting. **Every pod agent runs `%USERPROFILE%\.claude\skills\claim-reality-audit\SKILL.md` before acting on any written claim that something is dead, deleted, revoked, unused or safe to skip** — this file, the repo docs and the backup trees all record what was true when someone wrote them, and a brand that has been frozen, deleted and partially decommissioned is exactly where that gap is widest.
- **Human sign-off gates hold:** never deploy to production, flip a POD store to auto-fulfill, take real money, change live prices, publish, send, or spend budget without explicit founder approval. Pod agents draft and stage; the founder approves.
- **Honesty:** no fabricated drop dates, fake scarcity, invented numbers, or AI-tell copy. The ceremony has to be real.
- **This is a PERSONAL / founder project** — attribution and monetization follow that (not a client white-label).

## Invoking
**Frozen — see the banner.** Invoke a pod agent only to answer a question about the brand system, or to prepare the relaunch once the owner lifts the freeze. Ask by name (`temptation-brand-guardian, gate this PDP`) or via the Agent tool with `subagent_type: "temptation-<role>"`. Independent pod agents run in parallel under the conductor.
