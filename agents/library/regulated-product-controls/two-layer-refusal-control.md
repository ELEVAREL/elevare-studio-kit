# Two-layer refusal control for a regulated-advice surface

Harvested from `D:\HausAI\src\lib\ai\guardrails\` (a fair-housing control on an AI house-planner).
Generic to **any** surface where a model's output could constitute regulated speech or advice.

---

## What it is

**A system prompt is a preference, not a control.** It is one jailbreak away from a statutory
problem, and it leaves no auditable artifact. The shape that is a control:

```
user text ──► LAYER 1: deterministic INPUT CLASSIFIER  (pure fn, no model, no network, no state)
                 │
                 ├─ hard category  ──► canned refusal, returned NOW. ZERO model spend.
                 ├─ premise riding on a legitimate request ──► allow + a RIDER forcing the decline
                 └─ clean ──► model call
                                  │
                                  ▼
              LAYER 2: OUTPUT LEXICON FILTER over the STRUCTURED response
                 ├─ hit ──► block, do not persist, do not render
                 └─ rider requested? ──► VERIFY it was honoured in the response
```

Both layers share the same normalisation (see
[`adversarial-text-normalization.md`](adversarial-text-normalization.md)) and have **independent
rules**. Symmetric normalisation, independent rules — not one layer deliberately blinder than the
other.

## When to reach for it

Any product where the model can say something the law reaches directly:

- Housing / lending / employment / insurance (US: FHA §3604(c) reaches *speech*, not just conduct).
- Medical, legal, tax, or investment advice.
- Age-restricted, health-claim, or regulated-substance copy.
- Any product with a hard "we do not answer X" list that a disclaimer does not cure.

Also reach for it whenever the honest answer to "what stops the model doing this?" is "the prompt".

## The five load-bearing properties

1. **Layer 1 is pure and stateless.** No network, no clock, no conversation history. Statelessness
   *is* the control against an incremental jailbreak: a classifier that sees only the current
   message cannot be walked anywhere over three innocuous turns.
2. **A hard refusal costs zero model spend.** The canned copy is a server-rendered constant. This is
   also why it can never be rate-limited into unavailability — see the release rule below.
3. **The partial-comply seam.** Several real cases pull both ways: *produce the thing* **and**
   *decline the premise attached to it*. Refusing an ordinary lawful request because of a clause
   attached to it is an **over-refusal** — and it trains users to strip context from their prompts,
   which makes the premise *harder* to see, not easier. So when a premise rides on a genuine
   request, return `allow` **with a rider that forces the decline**, not a canned refusal. Never for
   a request wrapped in a jailbreak framing or carrying an instruction override — a wrapped request
   is by definition not the good-faith user the seam exists for, and **the fallback may only tighten,
   never loosen.**
4. **On the rider path, layer 2 is the fail-closed control, not defence in depth.** Everywhere else
   two independent layers must both fail. Here exactly one stands between a model handed a steering
   premise and a published statement. So on that path specifically: the filter scans the
   **structured object**, not just prose (a design *titled* with the violation is itself the
   violation); it **fails closed** when the scan throws or times out; and **the rider is verified in
   the response**, not merely requested — output that silently dropped the decline satisfies half an
   obligation, which reads as agreement and is worse than a refusal.
5. **One field walker, used by both the scan and the strip.** A hand-written list of fields to scan
   *will* miss one (`questions[].unit` and `rooms[].id` were the two that slipped past). Walk the
   object generically and assert the walker reaches the leaf fields by name in a test.

## Supporting rules that turned out to matter

- **Meter before the call, and RELEASE on a layer-1 refusal.** If you meter an abuse ceiling before
  the model call, a classifier trip spends a unit while costing you nothing. Without a release path
  bounded at zero, N refusals lock a user out for a whole period — **a refusal turning into an
  account-wide denial of service, on your highest-liability control.** Any path that meters before an
  outcome needs the same treatment.
- **Refusal copy is a static server-rendered constant.** The model never authors its own
  disclaimer or refusal; any disclaimer-like text it emits is **stripped before persistence**.
- **A refusal-rate dashboard cannot see an over-firing classifier** — it looks identical to a working
  one. Your control's *selection* must be tested, not just its firing.
- **A taxonomy change moves the denominator.** Reclassifying two categories out of "fair-housing
  refusal" puts a step change in the refusal-rate series at that deploy — and a refusal-rate *drop*
  is exactly the signal your monitoring exists to catch as a classifier failing open. Tell analytics
  before the alert fires.
- **Log every refusal** with its category as a free string, even when your typed contract has no
  member for it. A DB enum that degrades unknown → `other` keeps the real taxonomy reaching
  analytics intact while the contract stays frozen. Lossy at the contract layer is honest; raising is not.

## What it costs

- Layer 1: a few hundred lines of pattern tables (**as data, so a reviewer can read the control**)
  plus the normalisation module. Layer 2: a lexicon plus the field walker.
- One extra pure-function pass on every request and every response.
- **The real cost is the eval suite**, which is not optional and is where the time goes. See
  [`mutation-eval-suite.md`](mutation-eval-suite.md).

## What it does NOT do

- **It is not legal review.** It implements a spec someone qualified wrote. `compliance-counsel` is
  not a licensed attorney, and a control implemented perfectly against the wrong refuse-list is a
  perfectly implemented liability. Budget the real review.
- **It is English-only.** See the language-gate rule in `adversarial-text-normalization.md`. Decline
  non-English input plainly and say "right now" so the limit reads as current state, not a verdict.
- **It does not stop semantic evasion**, coded language, or a model that reaches the same conclusion
  in words your lexicon does not hold.
- **A disclaimer is not a licence to answer.** Adding more disclosure relaxes no refusal. Two
  separate controls; do not let one buy the other.
- **Stripping is not a safe alternative to blocking on a structured field.** Deleting an address
  string from a request whose *cost figure was conditioned on it* leaves a lot-specific number now
  presented as a regional one — **strictly worse than the block, because the unauditable part
  survives and the visible tell is gone.** Making that safe is a regeneration, not a strip. If you
  ever add strip-and-continue: prose fields only, always block on a hit in a money or structured
  field, and compose the user notice from a machine-readable per-field diff — a notice that
  understates what was removed is worse than the block.

## Assumes / adapt

- A model call you control server-side, and a structured (schema-validated) response you can walk.
- A written spec of hard-refuse categories, caveat categories, and the copy for each — with an
  explicit character bound if your API contract has one. When the copy and the bound conflict,
  **keep the three-beat structure inside the bound rather than widening a frozen contract.** Watch
  for the trap that bit the origin: four refusal drafts contained a literal banned substring *from
  the very case that tests them*.
- The refuse-list is data. Widening it is a policy change with an owner, not a code change.

## Related

- [`adversarial-text-normalization.md`](adversarial-text-normalization.md) · [`mutation-eval-suite.md`](mutation-eval-suite.md)
- [`legal-version-drift-test.md`](legal-version-drift-test.md) — the same "make the rule a test" move, for documents.
- STANDARDS.md — claim–reality parity; *"a comment that asserts a control IS a claim"*.
