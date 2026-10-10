# Elevare Studio — Skills Map (count the directory; this doc never carries a total)

**★ 2026-09-10 — THIS FILE IS NO LONGER THE ONLY WIRING.** Every agent definition now ends in a generated `SKILLS:BEGIN/END` block naming the skills it owns, and the 68 agents cover all 207 installed skills between them (0 unowned, 0 dangling, verified by parsing the blocks). This file is still the source of truth for **who owns what** — the blocks are generated FROM it — so edit the routing lines here and re-run `python D:\.claude\agents\wire-agent-skills.py`, then copy the `.md` files to `C:`. Do not hand-edit a block; the next regeneration overwrites it. What this file is now read FOR: choosing which agent to spawn, and finding a skill that sits **outside** the owning agent's block.

Index of every skill installed at `%USERPROFILE%\.claude\skills`, grouped by domain and routed to the agent that owns it. Agents read `%USERPROFILE%\.claude\skills\<name>\SKILL.md` directly. **Skills are AUTHORED at `%USERPROFILE%\.claude\skills`, but `C:` is the copy that loads — a skill present only on `D:` has never been installed and no session can invoke it.** Conductors consult this map to route niche/vertical work so the **whole** library is in play — not just the skills named in each agent file. `+plugin` = also available via the Skill tool (anthropic-skills), not a folder here.

## Product & strategy
`product-lens`, `blueprint`, `architecture-decision-records`, `market-research`, `deep-research`, `exa-search`, `search-first` → **product-strategist, business-strategist, design-researcher, delivery-lead**
`investor-materials`, `investor-outreach` → **business-strategist**

## Executive layer (studio C-suite — company-level, weekly board memo + on demand)
> **★ The `operations:*`, `finance:*`, `engineering:*` and `legal:*` plugin packs are NOT INSTALLED on this machine** and every call to them fails silently. `installed_plugins.json` lists exactly four plugins: `atomic-agents`, `claude-md-management`, `vercel-plugin`, `vercel`. Those 23 dead routes were removed 2026-09-06 — do not re-add them without installing the pack first and confirming the skill appears in a session's own available-skills list.

`claim-reality-audit`, `fleet-scheduled-failover`, `credential-drift`, `calibrated-check` → **chief-of-staff** (COO lens: cadence, SOP adherence, follow-through — and the laptop's Disabled routine tasks are CORRECT, so `claim-reality-audit` runs before any "X never ran" line)
`market-research`, `product-lens`, `deep-research` → **ceo-advisor** (studio-facing portfolio of bets; business-strategist stays the outward twin for client/venture work)
`claim-reality-audit`, `calibrated-check`, `+MCP: mcp__claude_ai_Square__*` (GET only) → **cfo-controller** (READ-ONLY on money — reporting/reconciliation only, NEVER a payment-rail write. Square is Elevare's own invoicing rail; Elevare has no Stripe platform account. The Stripe-shaped billing skills below are for CLIENT-owned accounts only)
`repo-scan`, `fleet-scheduled-failover`, `credential-drift`, `claim-reality-audit`, `architecture-decision-records` → **cto-portfolio** (fleet risk portfolio; `repo-scan` for a single-repo deep pass. The laptop's Disabled `ElevareRoutine-*` tasks are correct — routines run on three Linux hosts under a lease)
`documentation-lookup`, `claim-reality-audit` → **compliance-counsel** (studio counsel mode: Elevare's own contracts + LLC governance; templates are live at `D:\.claude\agents\legal\`)

## Navy SharePoint portal pod (job-type pod; recipe in PLAYBOOK-navy-sharepoint-portal.md)
`merge-integration-gate`, `claim-reality-audit`, `windows-agent-execution` → **sp-portal-conductor**
`e2e-testing`, `windows-agent-execution` → **sp2016-lab-operator**
`security-review`, `security-scan`, `claims-ledger-sweep` → **navy-approval-officer**
`deep-research`, `untrusted-fetch-quarantine` → **fleet-roster-researcher**
`claim-reality-audit` → **portal-guide-keeper**

## Design & frontend craft
`design-system`, `frontend-patterns`, `liquid-glass-design`, `frontend-slides`, `coding-standards` → **ui-designer, design-engineer, frontend-builder, design-auditor, art-director**
*(the `canvas-design` / `brand-guidelines` / `theme-factory` / `algorithmic-art` / `web-artifacts-builder` / `slack-gif-creator` plugin skills are NOT installed on this machine — do not route to them)* → **art-director, brand-identity-designer, graphic-asset-designer**

### Anti-slop & design-intelligence pack (installed Jul 2026 — the "Claude Code front-end skills" set)
These four raise the frontend taste bar studio-wide. Route them onto every build/audit that touches UI:
`impeccable` (anti-AI-slop design engine: `craft/shape/polish/audit/critique/animate/…` sub-commands + 45 deterministic detector scripts for machine-checkable design tells) → **design-auditor (primary gate), design-engineer, frontend-builder, ui-designer, art-director**
`taste-skill` (High-Agency Frontend: reads the brief → commits a "Design Read" direction → VARIANCE/MOTION/DENSITY dials + anti-repetition rules so landing/portfolio/redesign work never looks templated) → **frontend-builder, design-engineer, ui-designer, art-director, design-auditor**
`ui-ux-pro-max` (design-intelligence database: 161 palettes, 57 font pairings, 50+ styles, 99 UX rules, 25 chart types across 10 stacks + shadcn/ui MCP; its `data/*.csv` is the lookup) → **ui-designer, design-engineer, frontend-builder, design-researcher, brand-identity-designer, graphic-asset-designer**
`huashu-design` (HTML-native design: hi-fi prototypes, 1920×1080 animated decks, timeline animations, print-quality infographics; exports to MP4/GIF, ships bundled BGM/SFX) → **motion-ad-director, presentation-designer, graphic-asset-designer, ui-designer**
*(The carousel's #5, Playwright "let Claude see what it ships," is already covered by the studio's `browser-qa` / `e2e-testing` / `click-path-audit` skills + qa-verifier's real-browser gate via the `run` skill / `browser-qa` / `hydration-assertion` (**the `preview_*` tools do not exist in this harness**).)*

### 3D, WebGL & web-animation pack (installed Jul 2026 — 22 skills from freshtechbro/claudedesignskills)
Fills the studio's WebGL/3D/scroll-animation gap for award-tier animated sites. Route by effect:
- **3D / WebGL engines** → **design-engineer** (primary), motion-ad-director, ui-designer: `threejs-webgl`, `react-three-fiber` (R3F, default in our Next apps), `web3d-integration-patterns` (meta-skill — read first when layering libs), `babylonjs-engine`, `playcanvas-engine`, `pixijs-2d` (GPU 2D particles), `aframe-webxr` (VR/AR), `spline-interactive` (no-code 3D), `lightweight-3d-effects` (Vanta/Tilt/Zdog — cheap depth)
- **Web animation** → **motion-designer** (primary), design-engineer, motion-ad-director, frontend-builder: `gsap-scrolltrigger` (scroll timelines/pinning/parallax), `motion-framer` (React micro-interactions/gestures), `react-spring-physics` (natural spring physics), `animejs` (SVG morph/stagger), `lottie-animations` + `rive-interactive` (designer/state-machine vector motion), `animated-component-libraries` (Magic UI / React Bits), `scroll-reveal-libraries` (AOS), `locomotive-scroll` (smooth-scroll parallax), `barba-js` (page transitions)
- **3D asset pipeline** → **design-engineer, ai-media-producer**: `blender-web-pipeline` (Blender→glTF), `substance-3d-texturing` (PBR textures)
- **Trend reference** → **design-researcher, ui-designer, art-director**: `modern-web-design` (2024–25 trends: scrollytelling, bold minimalism, cursor UX, glass — with pointers to the impl skills above)
Guardrail: every 3D/WebGL build must be budgeted (lazy-load, pause offscreen, `prefers-reduced-motion` fallback) per design-engineer rule 4 + CRAFT motion rules. *(These map to the Vexik "best animation skills" carousel: Three.js, Animation Designer, CSS/UI animation, scroll/parallax, microinteractions.)*
**Deliberately NOT installed** (vetting gate — redundant with existing studio systems): the "must-have plugins" carousel — `superpowers` (the studio's `D:\.claude\agents` + PLAYBOOK *is* a custom superpowers-equivalent; two methodologies would fight), `code-review` (→ /code-review + code-quality-engineer + security-reviewer), `security-guidance` (→ security-reviewer + `security-review`/`security-scan`), `claude-mem` (→ file-based memory + `claude-mem-*` skills), `deep-trilogy`/frontend-design plugin (→ product-strategist + the anti-slop pack above). `context7` MCP (live library docs) is worth adding but is a user-side `claude mcp add` + API key, not a studio skill.

## Frontend runtimes / frameworks
`nextjs-turbopack`, `nuxt4-patterns`, `bun-runtime` → **frontend-builder, design-engineer, backend-engineer**

## Backend & architecture
`backend-patterns`, `api-design`, `hexagonal-architecture`, `mcp-server-patterns`, `nestjs-patterns`, `docker-patterns`, `deployment-patterns` → **backend-engineer, launch-engineer**
`architecture-decision-records`, `blueprint` + [SYSTEMS.md](SYSTEMS.md) (the design bar) → **cto-portfolio, database-architect, product-strategist** — the system-DESIGN pass that precedes the implementation patterns above

## Data & databases
`postgres-patterns`, `database-migrations`, `jpa-patterns`, `clickhouse-io` → **database-architect** (clickhouse also → **marketing-analyst**)

- **`rls-tenant-isolation`** (added 2026-09) → **database-architect, security-reviewer, backend-engineer, test-engineer**. The nine ways Postgres/Supabase RLS fails **open** — `ENABLE` without `FORCE`, `service_role`/`BYPASSRLS`, views that are not `security_invoker`, materialised views, `USING` with no `WITH CHECK` (a user moves their own row to another tenant), `SET` instead of `SET LOCAL` behind a pooler (leaks across *users*, so it never reproduces locally), `RETURNING *` past column grants, and predicates that check authentication rather than tenancy. Ships the persona x operation test matrix whose load-bearing row is **member of tenant B**. Names the false green: *a blocked UPDATE raises no error and affects zero rows*, so a test asserting "no exception" passes against a table with no RLS at all — assert row counts and post-state. Mandatory before shipping any tenant-scoped table, view or RPC.

## Payments
`customer-billing-ops`, `agent-payment-x402`, `+plugin: stripe-best-practices, upgrade-stripe` → **payments-engineer**

## AI / LLM engineering
`claude-api` (read before any Claude code), `agent-decomposition` (tool vs skill vs subagent — read before designing or refactoring ANY agent; also owns eval hill-climbing, routines/async automations, queue reliability guarantees), `agent-harness-construction`, `mcp-server-patterns`, `prompt-optimizer`, `cost-aware-llm-pipeline`, `iterative-retrieval`, `regex-vs-llm-structured-text`, `pytorch-patterns`, `foundation-models-on-device`, `eval-harness`, `agent-eval` → **ai-engineer** (`agent-decomposition` also → **agent-architect, automation-engineer, eval-master, delivery-lead**)

## Agent orchestration & meta (conductor toolkit)
`team-builder`, `project-flow-ops`, `autonomous-loops`, `continuous-agent-loop`, `autonomous-agent-harness`, `claude-devfleet`, `dmux-workflows`, `ralphinho-rfc-pipeline`, `gan-style-harness`, `agentic-engineering`, `ai-first-engineering`, `enterprise-agent-ops`, `strategic-compact`, `context-budget`, `token-budget-advisor`, `safety-guard`, `rules-distill`, `skill-comply`, `skill-stocktake`, `configure-ecc`, `workspace-surface-audit`, `santa-method`, `nanoclaw-repl`, `openclaw-persona-forge` → **delivery-lead** (and studio maintenance)

## Memory & code intelligence
`ck`, `claude-mem-make-plan`, `claude-mem-do`, `claude-mem-mem-search`, `claude-mem-smart-explore`, `claude-mem-timeline-report`, `codebase-onboarding`, `repo-scan`, `content-hash-cache-pattern` → **codebase-navigator, delivery-lead**

## Testing, QA & verification

- **`hydration-assertion`** → **qa-verifier, design-auditor** *(also: frontend-builder, launch-engineer, performance-engineer)*. Proves per route that a deployed React/Next page actually **hydrated**, by counting React fibers — keys ReactDOM writes at hydrate time that cannot exist in server HTML. Runs a **known-dead control** every time and refuses to emit a green if the control also reports hydrated. Built after a CSP shipped a nonce policy three times over: Next 16 nonces only *dynamically rendered* routes, so every prerendered page's inline bootstrap was blocked, React never hydrated, and `/builder` rendered with no composer. **A green build, a clean console, 1,400 passing tests, the right response header, and the element being present in the DOM all pass on a completely dead page.** Enumerate routes from the app dir, not the sitemap — the route that broke was not in the sitemap.
- **`claims-ledger-sweep`** → **code-quality-engineer, security-reviewer** *(also: retrospective, qa-verifier, delivery-lead)*. Nominates **comments that assert a control living somewhere else** — "Pro-gated SERVER-SIDE", "sanitised upstream", "every layout renders `<main>`" — with no `file:line` anyone can follow. The discriminator is **scope, not vocabulary**: a naive verb grep returned 811 hits on one repo; this returns 49. Recall 8/8 on known-bad, 86% precision, and it goes silent where the defect was fixed. It cannot tell a true claim from a false one — only that nothing in the sentence lets you check. **Advisory, never a build-blocker.**
`tdd-workflow`, `e2e-testing`, `browser-qa`, `verification-loop`, `ai-regression-testing`, `click-path-audit`, `canary-watch`, `benchmark`, `eval-harness` → **test-engineer, qa-verifier, performance-engineer** *(`click-path-audit` also: **email-marketer, conversion-copywriter, brand-copywriter** — the hop that leaves the app is the one no suite reaches; PhyscoClosett's order email deep-linked a signed-out recipient into a redirect, 2026-09-06)*
`plankton-code-quality`, `git-workflow` → **code-quality-engineer**
`claims-ledger-sweep` (a COMMENT asserting a control IS a claim: nominates comments that assert a control living in another file — "Pro-gated SERVER-SIDE", "sanitised upstream", "every layout renders `<main>`", "(checked before this was written)" — with no `file:line` to follow; ranked by blast radius; `--changed <ref>` for a per-wave pass) → **code-quality-engineer, security-reviewer** (ship gate), **retrospective** (write-ups), **qa-verifier, delivery-lead** (feeds the PLAYBOOK §4b claims ledger). Every agent writing a file header is subject to it.

## Security
`security-review`, `security-scan`, `safety-guard` → **security-reviewer**
Framework security: `django-security`, `laravel-security`, `springboot-security`, `perl-security` → **security-reviewer / backend-engineer** (stack-specific)

## Marketing, content & brand
`content-engine`, `crosspost`, `brand-voice`, `article-writing` → **content-engine-lead (owns the always-on engine), marketing-strategist, conversion-copywriter, brand-copywriter, social-media-manager, email-marketer, brand-strategist**
`content-engine`, `brand-voice`, `article-writing`, `crosspost`, `x-api`, `market-research`, `connections-optimizer` → **content-engine-lead** (ongoing social/content engine: pillars → batch production → per-platform cadence → scheduler → measure/iterate against reliability/credibility/conversions; conducts the content pod)
`content-engine`, `market-research`, `exa-search`, `deep-research`, `x-api`, `crosspost`, `brand-voice`, `connections-optimizer`, `social-graph-ranker` → **social-growth-strategist** (the "social media master": real-time hashtag science + optimal timing + trend intelligence / honest trendjacking + feature-hinting, tied to conversion; feeds social-media-manager + content-engine-lead)
`lead-intelligence`, `connections-optimizer`, `social-graph-ranker`, `x-api` → **growth-marketer, social-media-manager, social-growth-strategist, paid-ads-specialist, cold-email-specialist**
`data-scraper-agent` → **marketing-analyst, growth-marketer, cold-email-specialist** (data collection / list-building)
- **`email-deliverability-preflight`** (added 2026-09; technical substance adapted from the Apache-2.0 `deliverability-qa` checklist in `aaron-he-zhu/aaron-marketing-skills`, rewritten standalone — the upstream's cross-skill scoring, plugin scripts and memory writes are **not** carried over) → **cold-email-specialist, email-marketer** (also: **backend-engineer, devops-engineer** — invoice, dunning and transactional sends count). SPF (the 10-lookup `permerror`), DKIM (≥ 2048-bit **and aligned to the From domain**), DMARC (`p=none` is monitoring, not protection), BIMI, reputation + blocklists, the warmup ramp, and the **separate-sending-domain rule** that keeps cold outreach off the domain carrying client mail and invoices. Anti-false-green by construction: *a test email that reached your own inbox, an ESP “Delivered” status and a `delivered` webhook are all true while mail is being filtered for everyone else* — there is no `landed_in_spam` webhook. A missing check is `NEEDS_INPUT`, never a pass.
`lead-intelligence`, `market-research`, `deep-research`, `exa-search`, `data-scraper-agent`, `brand-voice`, `content-engine`, `article-writing`, `investor-outreach`, `connections-optimizer` → **cold-email-specialist** (cold acquisition email: target → personalize → sequence → deliverability; hands replies to sales-closer)

## SEO & local-business client sites
- **`local-seo`** (added 2026-09, from `AgriciDaniel/claude-seo` skills/seo-local, MIT — markdown only, scripts/hooks/MCP deliberately not carried over) → **seo-specialist** (primary), **client-partner, launch-engineer, frontend-builder, growth-marketer, conversion-copywriter**. The studio had **no SEO skill at all** before this. Detects business type (brick-and-mortar / **service-area business** / hybrid) and vertical, then scores GBP signals, review health, local on-page, NAP + citations, local schema and local authority. Carries the two things trade clients actually need: the **LocalBusiness subtype per trade** (`GeneralContractor`, `HVACBusiness`, `Plumber`, `HomeAndConstructionBusiness`, `HairSalon`, …) in `references/local-schema-types.md`, and the **doorway-page swap test** — if you can swap the city name and the page still reads fine, it is a doorway page. Also: the 18-day review-velocity rule, and that **review gating is prohibited** (Google fake-engagement policy + FTC). Directly serves the fence company, handyman, salon and seamstress.
  Pair with **[INDUSTRIES.md](INDUSTRIES.md)** — INDUSTRIES owns the money moment / above-the-fold / booking / trust-proof spec per vertical; `local-seo` owns getting the business found.

## Media production
Higgsfield **MCP tools** (`mcp__claude_ai_Higgsfield__generate_image` / `generate_video` / `generate_audio`, plus upscale/reframe/motion-control) — **not a skill folder; there is no `higgsfield-generate` or `higgsfield-soul-id` skill on disk** + `cinematic-ad-higgsfield` (full storyboard→stills→animate→scored-reel ad pipeline) → **ai-media-producer** (primary), **motion-ad-director** (conducts the ad). `higgsfield-soul-id` for face/identity consistency.
`fal-ai-media` → **ai-media-producer** (legacy — prefer Higgsfield)
`remotion-video-creation`, `video-editing`, `videodb`, `manim-video`, `ui-demo` → **video-producer** (remotion / manim / ui-demo also → **motion-ad-director**)
`remotion-video-creation`, `frontend-slides`, `frontend-patterns`, `liquid-glass-design`, `manim-video`, `ui-demo`, `video-editing`, `videodb` (**`algorithmic-art`, `slack-gif-creator` and `canvas-design` are NOT installed — a Skill call to them fails**) → **motion-ad-director** (animated advertisements: kinetic type, seamless loops, product reveals, particle/SVG/WebGL FX)
`+plugin: pptx, canvas-design, pdf, docx, xlsx` → **presentation-designer, graphic-asset-designer, docs-writer, marketing-analyst**

## Docs & workflow
`documentation-lookup`, `+plugin: doc-coauthoring, internal-comms` → **docs-writer**
`google-workspace-ops`, `jira-integration`, `laravel-plugin-discovery`, `opensource-pipeline`, `nutrient-document-processing`, `visa-doc-translate` → pulled on demand by whoever owns the task

## Language / platform stacks (pull to match the project)
- **Python:** `python-patterns`, `python-testing` · **Go:** `golang-patterns`, `golang-testing` · **Rust:** `rust-patterns`, `rust-testing`
- **Kotlin/Android:** `kotlin-patterns`, `kotlin-coroutines-flows`, `kotlin-ktor-patterns`, `kotlin-exposed-patterns`, `kotlin-testing`, `android-clean-architecture`, `compose-multiplatform-patterns`
- **JVM:** `java-coding-standards`, `springboot-patterns`, `springboot-tdd`, `springboot-verification`, `jpa-patterns`
- **Apple:** `swiftui-patterns`, `swift-concurrency-6-2`, `swift-actor-persistence`, `swift-protocol-di-testing`, `foundation-models-on-device`
- **PHP/Laravel:** `laravel-patterns`, `laravel-tdd`, `laravel-verification`, `laravel-plugin-discovery`
- **Python/Django:** `django-patterns`, `django-tdd`, `django-verification`
- **.NET:** `dotnet-patterns`, `csharp-testing` · **C++:** `cpp-coding-standards`, `cpp-testing` · **Dart/Flutter:** `dart-flutter-patterns`, `flutter-dart-code-review` · **Perl:** `perl-patterns`, `perl-testing`
→ owned by **backend-engineer / frontend-builder / test-engineer**, matched to the project's stack.

## Industry verticals (pull for client work in that sector)
> **These are the enterprise-domain skills.** For the sectors the studio actually sells into — restaurant/bar, salon/beauty, fitness/dojo, home services/trades, health practice & senior living, retail/DTC, professional services, local media, events/venue, nonprofit — the playbook is **[INDUSTRIES.md](INDUSTRIES.md)** (money moment · above the fold · required · trust proof · schema · booking/payment · compliance · #1 failure), declared at triage and gated at ship.

`healthcare-emr-patterns`, `healthcare-cdss-patterns`, `healthcare-eval-harness`, `healthcare-phi-compliance` (health) · `carrier-relationship-management`, `logistics-exception-management`, `returns-reverse-logistics`, `customs-trade-compliance`, `inventory-demand-planning`, `production-scheduling`, `quality-nonconformance` (supply-chain/ops/manufacturing) · `energy-procurement` (energy) → whichever agent owns the client task, as domain reference.

## Learning / self-improvement (studio upkeep)
`continuous-learning`, `continuous-learning-v2` → capture reusable patterns from sessions into new skills, keeping the studio compounding over time.

## ★ The studio's own forged skills (the false-green pack)

These eight were written by this studio from its own incidents. **Every one of them sat on `D:`
and was never loadable until 2026-09-06** — five are cited by name in `STANDARDS.md`, so the
standard referenced tools no session could invoke. Route by each skill's own `owners:`
frontmatter, which is canonical; the agents listed after the dash are consumers.

| skill | fires when | owners |
|---|---|---|
| `calibrated-check` | before ANY result becomes the word green / verified / passed / "zero occurrences" | qa-verifier, test-engineer, code-quality-engineer, retrospective, eval-master, database-architect, security-reviewer, design-auditor, social-post-critic, marketing-analyst |
| `claim-reality-audit` | before acting on any written claim that something is dead, unused, disabled or safe to delete | retrospective, memory-curator, devops-engineer, delivery-lead, cto-portfolio, chief-of-staff, codebase-navigator, docs-writer, pattern-librarian, ceo-advisor |
| `outcome-integrity-sweep` | before shipping any write/send/charge/notify, and before any success toast, `sent: true` or `200` | code-quality-engineer, security-reviewer, backend-engineer, qa-verifier, payments-engineer, design-auditor |
| `credential-drift` | one secret living in several stores, or staged on several hosts | devops-engineer, security-reviewer, backend-engineer, automation-engineer, payments-engineer, cto-portfolio, ai-engineer |
| `windows-agent-execution` | writing/running any `.ps1`, a Windows path inside a script, a scheduled task, or an `rg` sweep | automation-engineer, devops-engineer, backend-engineer, qa-verifier, delivery-lead, retrospective, agent-architect, skill-forge, performance-engineer, graphic-asset-designer, motion-ad-director, video-producer |
| `merge-integration-gate` | after ANY merge/rebase/parallel-lane integration, before push, tag, deploy or PR | delivery-lead, code-quality-engineer, launch-engineer, devops-engineer |
| `fleet-scheduled-failover` | the same scheduled job armed on more than one machine | devops-engineer, automation-engineer, delivery-lead, retrospective, cto-portfolio, chief-of-staff |
| `untrusted-fetch-quarantine` | fetching any third-party page — prospect, competitor, directory | security-reviewer, automation-engineer, design-researcher, cold-email-specialist, sales-closer, business-strategist, temptation-growth-marketer |

Also in this class, already routed above: `claims-ledger-sweep`, `hydration-assertion`,
`rls-tenant-isolation`, `email-deliverability-preflight`, `local-seo`, `agent-decomposition`,
`skill-stocktake` (run its **Phase 0 reachability pass first** — an installed-but-unrouted skill
is inert, and Phase 0 checks ROUTING, not install location, so check `C:` separately).

**Not routed, deliberately.** `i-have-adhd` is an always-on output style governed by the global
`CLAUDE.md`; its frontmatter carries `disable-model-invocation: true`, so routing it would make it
model-invocable against its own declaration. `project-guidelines-example` is a template, not a
capability. `stripe-directory` and `stripe-projects` both require an Elevare Stripe account to
transact, which is structurally unavailable — a route would be a liability, not a capability, and
Vercel/Supabase MCP are the studio's provisioning path. Do not re-open these.
