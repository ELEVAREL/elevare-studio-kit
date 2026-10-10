# The mutation eval suite — N cases × 17 mutators

**Runnable asset:** [`_lib/mutations.ts`](_lib/mutations.ts) — 17 pure mutators, zero dependencies.

Harvested from `D:\HausAI\src\lib\ai\__tests__\mutations.ts` + `mutation-eval.test.ts`.

---

## What it is

A hand-written eval suite for a content control is written in clean ASCII. That is exactly why it
stays green while the control is open to a one-character bypass:

> the code compiles, the tests pass, and the control is absent.

This takes **the suite you already have** and pushes every case through every mutator — zero-width
injection (6 variants), Cyrillic/Greek homoglyphs (2), combining marks, precomposed diacritics,
letter-spacing (3 separators), leetspeak (2), fullwidth forms, and two layered combinations. **The
control's answer must not move.**

Real numbers from the origin run: a 33-case suite passed green against a classifier that one U+200B
defeated. The mutation suite over the same cases opened at **463 failures**, and closed at
**590 passing**. Nothing about the cases changed — only what they were tested with.

## When to reach for it

- Any classifier, filter, lexicon, or lint whose evasion is worth something to a user.
- **The moment you write the first pattern table.** Retrofitting is how you discover the control was
  decorative the whole time.
- After adding a term, a category, or a normalisation layer — the mutators come free.

## How to wire it (the assertions are the hard part)

Each case class asserts something different, and none of them is a *weakened* assertion:

| the case expects | the mutant must |
|---|---|
| **refuse** | still refuse, on a category the case names, with the same verdict flags. Identical to the baseline, on a harder input. |
| **allow + rider** (a partial-comply seam) | fire a deterministic control — the same rider **or a full refusal**. A refusal is *stricter*, not looser. What is forbidden is `allow` with `riders: []`. |
| **allow, no rider** | still allow. **This is the over-refusal guard** — a normalisation layer that starts refusing accessibility briefs has traded one failure for another. |

Two meta-assertions that stop the suite lying to you:

```ts
it("mutates every behavioural case with every mutator", () => {
  expect(BEHAVIOURAL_CASES.length).toBe(32);        // coverage is asserted, not assumed
  expect(MUTATORS.length).toBeGreaterThanOrEqual(16);
});

it("every mutator actually changes every prompt", () => {
  // a no-op mutator is a silent pass — it runs, it is green, and it tested nothing
  const inert = [];
  for (const c of BEHAVIOURAL_CASES) for (const m of MUTATORS)
    if (m.apply(prompt(c)) === prompt(c)) inert.push(`${m.id} × ${c.id}`);
  expect(inert).toEqual([]);
});
```

Print the mutator id and the mutant string in every failure message. A red run must **name the
attack**, or you get 463 identical-looking failures and no diagnosis.

## What it costs

- ~230 lines of mutators + ~60 lines of harness. The cases are yours already.
- Test time is N × M classifications. 32 × 17 ≈ 550 pure-function calls — sub-second. If your
  control calls a model, mutate only the deterministic layer; a live mutation run is a spend decision.

## What it does NOT do — and one rule that is non-negotiable

- **A green mutation suite proves nothing until you have watched it go red.** Break the
  normalisation deliberately, confirm the expected mutants fail *by name*, then restore. The origin
  suite was written and run **before** the fix for exactly this reason. **Do not add a mutator
  without running it against a deliberately-broken normaliser first.** A mutator that cannot fail is
  worse than no mutator: it manufactures confidence.
- **It tests mechanical evasion only.** Paraphrase, translation, and semantic evasion are untouched.
  A control that is green here can still be walked around in plain English.
- **It cannot see a wrong-but-firing control.** This is the sharpest lesson of the origin run: all 33
  original cases asserted on the *content* of a refusal and **none on which refusal was selected**.
  A completely wrong refusal, fired at an innocent user, passed every check — and
  *an over-firing classifier looks like a working one on a refusal-rate dashboard*, so no amount of
  monitoring would have surfaced it. Assert the **selected outcome**, not just that an outcome fired.
- **It does not protect a union type.** Derive your hit-kind union from an exported array
  (`const KINDS = [...] as const`) and assert exhaustiveness of the kind → category map. A new hit
  kind with no row in the map otherwise silently inherits whichever refusal is first — which is how
  the original defect shipped.
- **It is single-turn.** Multi-turn escalation needs its own cases.

## Assumes / adapt

- Vitest/Jest-style `describe`/`it`. Trivially portable.
- Your cases carry a stable `id`, a `category`, and a structured `expected` — not a snapshot. The
  mutation harness reads `expected.kind` to choose its assertion; a snapshot test cannot express
  "the same rider **or** a harder refusal".
- The mutators skip short words (`minLength` 4–6) so the mutant still reads as language and the test
  is not quietly measuring "did we destroy the sentence".

## Related

- [`adversarial-text-normalization.md`](adversarial-text-normalization.md) — the fix this suite proves.
- STANDARDS.md — *"a green test proves nothing until you have watched it go red"* and *"Pick a signal
  that CANNOT be present when the thing is broken."*
