# Adversarial text normalization for a keyword/lexicon control

**Runnable asset:** [`_lib/adversarial-normalize.ts`](_lib/adversarial-normalize.ts) — pure, zero
dependencies, ES2017-safe TypeScript. Drop it in and call `deriveMatchForms()`.

Harvested from a live regulated-advice guardrail (`D:\HausAI\src\lib\ai\guardrails\normalize.ts`).
The module was already domain-agnostic; only the header changed.

---

## What it is

One function, `deriveMatchForms(raw, postProcess?)`, that expands a message into **every string an
attacker's message is equivalent to**, so your existing `\b`-anchored pattern tables get run against
all of them instead of one.

```ts
const { canonical, forms, squeezed } = deriveMatchForms(message, neutraliseMyDomainCollocations);
const hit = firstMatchAcrossForms(BANNED_PATTERNS, forms);           // boundary-preserving
const bare = SQUEEZED_TERMS.some((t) => squeezedIncludes(squeezed, t)); // boundary-free
```

Five derived forms:

| form | undoes |
|---|---|
| `canonical` | invisibles stripped → NFKC → lower → confusables folded → NFD → combining marks dropped → quotes/whitespace normalised |
| `deLeet` | `g00d` → `good`, `hou$e` → `house` (both readings of `1`) |
| `collapsed` | `d-e-m-o-g-r-a-p-h-i-c-s` → `demographics`, **preserving word boundaries** |
| `deLeet(collapsed)` | the layered attack |
| `squeezed` | every non-alphanumeric removed — no `\b` survives, matched only against a vetted bare-substring list |

## When to reach for it

Any control that decides something by matching text against a table of terms, where a motivated
user benefits from evading it:

- A regulated-advice / fair-housing / medical / financial refusal classifier.
- A prompt-injection or jailbreak detector.
- A profanity, moderation, or brand-safety lexicon.
- A banned-claims lint over marketing copy ("first of its kind", "guaranteed").
- An output filter over model responses (run the **same** normalisation on both sides).

**If your control is `text.toLowerCase().includes(term)`, you need this.** That is the shape one
U+200B defeats.

## What it costs

- ~560 lines, pure, no dependencies, no runtime config.
- **The clean-ASCII case is one pass.** The forms set is deduplicated, so ordinary input produces a
  single-element array and matching costs the same as before.
- Worst case: up to 12 derived strings × the size of your pattern table, per message. This runs on
  every user message and every model response; measure if you are in a hot loop, but for a
  request-scoped classifier it is noise next to the model call it prevents.

## The two implementation traps — both nearly invisible, both trade one evasion for another

1. **The letter-run gluer must require a *consistent* separator.** Treating hyphen and space alike
   turns `w-r-i-t-i-n-g a n-o-v-e-l` into `writinganovel`, destroying every word boundary and
   creating a new evasion while closing one. A run must also be **≥3** single-character tokens, or
   `I want a 3 bed` becomes `I want a3bed`. And a *rejected* run advances the cursor by **one**, not
   past the run's end — in `a n-o-v-e-l` the pair `a`+`n` is too short, and skipping past `n` leaves
   `n-ovel`.
2. **Choose the squeezed terms against a corpus, not a length rule.** A squeezed term is matched as
   a bare substring, so the failure mode is a term hiding inside legitimate vocabulary — `area`
   inside `storage area`, `rough` inside `roughly`, `zone` inside `zoning`. A ≥6-character floor is
   only a proxy. Assert the property itself: keep a list of prose your control must keep allowing,
   squeeze it, and fail the build if any term appears in it. Word-boundary sensitivity is also a
   *feature* to use deliberately — `_` is a word character, so `target_demographic` never matches
   `\bdemographics?\b`, which can be exactly the routing you want.

## What it does NOT do

- **It is English/Latin-only.** It folds Cyrillic, Greek, Armenian, Georgian and Cherokee lookalikes
  *onto Latin*. It does not classify, and cannot classify, a message written in another language.
  A control that works in English and silently permits the same request in Spanish is **worse than
  no control** — it produces a clean refusal log while the violation goes through. Pair it with a
  language gate that declines non-English input plainly, or with real per-language coverage. Never
  ship the classifier as the only control while accepting non-English text.
- **It does not do semantics.** Paraphrase, euphemism, coded language, and metaphor all pass. It
  raises the cost of *mechanical* evasion; it is not a model.
- **The confusable table is hand-curated, not the full Unicode confusables set.** It covers the
  lookalikes NFKC leaves alone. A determined attacker with an exotic script can find one that is not
  in it — add it and add a mutator.
- **The combining-mark table is deliberately partial.** Only the blocks that stack onto Latin. A full
  `Mn` table would strip meaning from scripts the control never reasons about.
- **It is not sanitisation.** It produces strings to *match* against. Never persist or render a
  derived form — display and store the original.
- **It has no state.** Deliberately: a stateless classifier cannot be walked anywhere by an
  incremental jailbreak across turns. That is a property to keep, not a gap to fix.

## Assumes / adapt

- TypeScript. Pure functions; trivially portable to JS or another language.
- Your pattern tables are authored **without** `/g`. The matcher resets `lastIndex` defensively
  anyway — a stateful regex reused across forms skips matches and silently opens the control.
- `postProcess` is where your domain's collocation neutralisation goes, and **both layers must pass
  the same one**. Independent *rules* with symmetric *normalisation* is the correct shape; a
  deliberately blinder second layer either over-refuses or re-opens the gap on its own side.

## Related

- [`mutation-eval-suite.md`](mutation-eval-suite.md) — **do not ship this without that.** The
  normalisation is only as good as the suite that proves it, and the suite is how you watch it go red.
- [`two-layer-refusal-control.md`](two-layer-refusal-control.md) — the architecture this sits inside.
