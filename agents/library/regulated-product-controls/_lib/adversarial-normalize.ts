/**
 * **Adversarial text normalization for any keyword/lexicon control.**
 *
 * ELEVARE STUDIO PATTERN LIBRARY — generic, drop-in, no dependencies.
 * See `../adversarial-text-normalization.md` for when to reach for it and what
 * it does NOT do. Origin: a regulated-advice guardrail on a live product.
 *
 * THE PROBLEM IT SOLVES. Almost every hand-written content control — a
 * fair-housing classifier, a profanity filter, a prompt-injection detector, a
 * banned-claims lint, a moderation lexicon — normalises with `toLowerCase()`,
 * some quote folding and a whitespace collapse, then runs `.test()`. That is
 * **raw-ASCII substring matching**, and it is defeated by one invisible
 * character. Reproduced empirically against a shipping classifier:
 *
 * ```
 * ASCII "demographics"       -> refuse
 * + ZWSP U+200B              -> allow      <-- one character, control gone
 * + Cyrillic o (U+043E)      -> allow
 * ```
 *
 * The code compiled, the tests passed, and the control was absent.
 *
 * ── THE SHAPE OF THE FIX ──
 * A single message is expanded into several **derived forms**, and every pattern
 * table is run against **all of them**. Matching one is matching.
 *
 *   1. `canonical`  — invisibles stripped, NFKC, confusables folded, NFD with
 *                     combining marks dropped, lower-cased, whitespace collapsed.
 *   2. `deLeet`     — canonical with leetspeak reversed (`g00d` → `good`).
 *   3. `collapsed`  — canonical with letter-spacing runs glued back together
 *                     (`d-e-m-o-g-r-a-p-h-i-c-s` → `demographics`), which
 *                     preserves word boundaries so the existing `\b`-anchored
 *                     tables keep working.
 *   4. `deLeet(collapsed)` — the layered attack.
 *
 * Plus one form matched differently:
 *
 *   5. `squeezed`   — every non-alphanumeric removed. Word boundaries are gone
 *                     here, so a `\b`-anchored table would silently match
 *                     nothing. It is matched **only** against an explicit list of
 *                     terms that are safe as bare substrings (your caller owns
 *                     that list; keep every term ≥6 chars and prove against a
 *                     corpus of legitimate prose that none is a fragment of a
 *                     word you must keep allowing). This is what catches
 *                     `n i c e   a r e a`, where gluing produces one word and no
 *                     `\b` survives.
 *
 * ── WHY NO `\p{Cf}` / `\p{Mn}` ──
 * Unicode property escapes are ES2018. On an **ES2017** `tsconfig` target
 * `tsc --noEmit` rejects them, so the categories are expressed as explicit code
 * point ranges and walked by code point (`for…of` over a string iterates code
 * points, so astral-plane format characters are handled too). On ES2018+ these
 * can be replaced — they are not wrong, only verbose. Keeping the ranges makes
 * the module portable to any target, which is why they are kept here.
 *
 * PURE. No I/O, no network, no clock. Idempotent by construction — assert that.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Invisible and format characters
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Unicode general category **Cf** (format), plus the variation selectors and the
 * handful of separators that render as nothing. Ranges, not a `\p{Cf}` escape —
 * see the header.
 *
 * `[low, high]` inclusive, sorted, non-overlapping.
 */
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00ad, 0x00ad], // SOFT HYPHEN
  [0x0600, 0x0605], // ARABIC NUMBER SIGN … ARABIC NUMBER MARK ABOVE
  [0x061c, 0x061c], // ARABIC LETTER MARK
  [0x06dd, 0x06dd], // ARABIC END OF AYAH
  [0x070f, 0x070f], // SYRIAC ABBREVIATION MARK
  [0x0890, 0x0891], // ARABIC POUND/PIASTRE MARK ABOVE
  [0x08e2, 0x08e2], // ARABIC DISPUTED END OF AYAH
  [0x180e, 0x180f], // MONGOLIAN VOWEL SEPARATOR / FVS4
  [0x200b, 0x200f], // ZWSP, ZWNJ, ZWJ, LRM, RLM
  [0x202a, 0x202e], // bidi embedding / override
  [0x2060, 0x2064], // WORD JOINER … INVISIBLE PLUS
  [0x2066, 0x206f], // bidi isolates and deprecated format characters
  [0xfe00, 0xfe0f], // VARIATION SELECTOR-1 … 16
  [0xfeff, 0xfeff], // ZERO WIDTH NO-BREAK SPACE / BOM
  [0xfff9, 0xfffb], // interlinear annotation
  [0x110bd, 0x110bd], // KAITHI NUMBER SIGN
  [0x110cd, 0x110cd], // KAITHI NUMBER SIGN ABOVE
  [0x13430, 0x1343f], // Egyptian hieroglyph format controls
  [0x1bca0, 0x1bca3], // shorthand format controls
  [0x1d173, 0x1d17a], // musical symbol beams and slurs
  [0xe0000, 0xe01ef], // tag characters and variation selectors supplement
];

/**
 * Combining marks (general category **Mn**), restricted to the blocks that can
 * actually be stacked onto Latin text to defeat a substring match. A full Mn
 * table is not needed and would be worse: it would strip meaning from scripts
 * this classifier never reasons about.
 */
const COMBINING_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f], // COMBINING DIACRITICAL MARKS
  [0x0483, 0x0489], // Cyrillic combining
  [0x0591, 0x05c7], // Hebrew points
  [0x0610, 0x061a], // Arabic marks
  [0x064b, 0x065f], // Arabic diacritics
  [0x0670, 0x0670], // ARABIC LETTER SUPERSCRIPT ALEF
  [0x06d6, 0x06ed], // Arabic small high marks
  [0x0711, 0x0711], // SYRIAC LETTER SUPERSCRIPT ALAPH
  [0x1ab0, 0x1aff], // COMBINING DIACRITICAL MARKS EXTENDED
  [0x1dc0, 0x1dff], // COMBINING DIACRITICAL MARKS SUPPLEMENT
  [0x20d0, 0x20f0], // COMBINING DIACRITICAL MARKS FOR SYMBOLS
  [0xfe20, 0xfe2f], // COMBINING HALF MARKS
];

function inRanges(codePoint: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  /* Binary search: the tables are sorted and this runs once per code point on
     every user message and every model response. */
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end] = ranges[mid];
    if (codePoint < start) high = mid - 1;
    else if (codePoint > end) low = mid + 1;
    else return true;
  }
  return false;
}

/** Remove every zero-width / format / variation-selector code point. */
export function stripInvisibleCharacters(text: string): string {
  let out = "";
  for (const char of text) {
    if (!inRanges(char.codePointAt(0) ?? 0, INVISIBLE_RANGES)) out += char;
  }
  return out;
}

/** Remove combining marks. Run **after** NFD so `é` has become `e` + U+0301. */
export function stripCombiningMarks(text: string): string {
  let out = "";
  for (const char of text) {
    if (!inRanges(char.codePointAt(0) ?? 0, COMBINING_RANGES)) out += char;
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Confusables / homoglyphs
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Non-Latin code points that render as Latin letters.
 *
 * NFKC already handles fullwidth forms, mathematical alphanumerics, circled and
 * parenthesised letters, and the ligatures — it does **not** touch Cyrillic or
 * Greek, which is where the `neighbоrhood` bypass came from. Everything here is
 * lower-cased first, so only the lower-case twins need an entry.
 */
const CONFUSABLE_TO_LATIN: Readonly<Record<string, string>> = {
  /* Cyrillic */
  а: "a",
  б: "b",
  в: "b",
  г: "r",
  ԁ: "d",
  е: "e",
  ѐ: "e",
  ё: "e",
  ѕ: "s",
  і: "i",
  ї: "i",
  ј: "j",
  к: "k",
  ӏ: "l",
  м: "m",
  н: "h",
  о: "o",
  ө: "o",
  ӧ: "o",
  п: "n",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  ү: "y",
  ф: "o",
  х: "x",
  ъ: "b",
  ь: "b",
  һ: "h",
  ԛ: "q",
  ԝ: "w",
  ѡ: "w",
  /* Greek */
  α: "a",
  β: "b",
  γ: "y",
  ε: "e",
  ζ: "z",
  η: "n",
  ι: "i",
  κ: "k",
  μ: "u",
  ν: "v",
  ο: "o",
  ρ: "p",
  σ: "o",
  τ: "t",
  υ: "u",
  χ: "x",
  ω: "w",
  /* Latin lookalikes NFKC leaves alone */
  ı: "i",
  ȷ: "j",
  ł: "l",
  ø: "o",
  đ: "d",
  ħ: "h",
  ŧ: "t",
  ƅ: "b",
  ɑ: "a",
  ɡ: "g",
  ɩ: "i",
  ɪ: "i",
  ʏ: "y",
  ʙ: "b",
  ʜ: "h",
  ʟ: "l",
  ʀ: "r",
  /* Armenian / Georgian / Cherokee lookalikes */
  օ: "o",
  ո: "n",
  ս: "u",
  գ: "q",
  ք: "p",
  Ꭺ: "a",
  Ꮯ: "c",
  Ꭼ: "e",
  Ꮋ: "h",
  Ꮶ: "k",
  Ꮮ: "l",
  Ꮇ: "m",
  Ꮲ: "p",
  Ꮪ: "s",
  Ꭲ: "i",
  /* Symbols that read as letters */
  "０": "0",
};

/** Fold every confusable code point onto its Latin twin. */
export function foldConfusables(text: string): string {
  let out = "";
  for (const char of text) {
    out += CONFUSABLE_TO_LATIN[char] ?? char;
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. Leetspeak
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `1` is genuinely ambiguous between `l` and `i` (`n1ce` vs `bu1ld`), so
 * {@link deLeet} is generated **twice**, once for each reading, and both forms
 * are matched. Cheap, and it removes the guess.
 */
const LEET_BASE: Readonly<Record<string, string>> = {
  "0": "o",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  $: "s",
  "@": "a",
  "!": "i",
  "|": "l",
  "£": "l",
  "€": "e",
  "+": "t",
};

/**
 * Symbols that stand in for letters. Unlike the digits, **none of these has a
 * legitimate mid-word reading**, so they are folded unconditionally in
 * {@link deLeetSymbols} — which is what breaks `D-3-$-!-g-n`, where every digit
 * is fenced off from any letter by hyphens and the adjacency rule below can
 * never get started.
 */
const LEET_SYMBOLS: Readonly<Record<string, string>> = {
  $: "s",
  "@": "a",
  "!": "i",
  "|": "l",
  "£": "l",
  "€": "e",
};

const ASCII_LETTER = /[a-z]/;

/** Fold the symbol leet characters wherever they appear. */
export function deLeetSymbols(text: string): string {
  let out = "";
  for (const char of text) out += LEET_SYMBOLS[char] ?? char;
  return out;
}

/**
 * Reverse leetspeak, but **only where the substitution sits against a letter**.
 *
 * That guard is what keeps your domain's own numeric vocabulary intact: `4 bed`,
 * `2,400 sq ft`, `$450k` and `2500` are all untouched because their digits have
 * no adjacent letter, while `g00d`, `dem0graphics`, `hou$e` and `n1ce` all fold
 * back. Without it, this pass would rewrite every number in every price, SKU,
 * dimension and date you handle.
 *
 * ── WHY IT RUNS TO A FIXPOINT ──
 * A heavily leeted string is a **chain**: in `$3c7!0n`, only `c` is a letter to
 * begin with, so a single left-to-right pass with a lookahead at the raw input
 * resolves one character and stops. Each pass restores more letters, which gives
 * the next pass more anchors — `$3c7!0n` → `$ection` → `section`. Four passes is
 * far more than any real string needs and the loop exits as soon as it is
 * stable, so the clean-ASCII case costs exactly one pass and one comparison.
 */
export function deLeet(text: string, oneMapsTo: "l" | "i" = "l"): string {
  const table: Record<string, string> = { ...LEET_BASE, "1": oneMapsTo };
  let current = text;

  for (let pass = 0; pass < 4; pass += 1) {
    const chars = [...current];
    const out: string[] = [];

    for (let i = 0; i < chars.length; i += 1) {
      const char = chars[i];
      const replacement = table[char];
      if (!replacement) {
        out.push(char);
        continue;
      }
      /* Look BACK at what this pass already produced, not at the raw input:
         that is what lets one pass resolve a left-to-right chain. */
      const before = out.length > 0 ? out[out.length - 1] : "";
      const after = i + 1 < chars.length ? chars[i + 1] : "";
      const touchesLetter = ASCII_LETTER.test(before) || ASCII_LETTER.test(after);
      out.push(touchesLetter ? replacement : char);
    }

    const next = out.join("");
    if (next === current) return current;
    current = next;
  }

  return current;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Letter-spacing
 * ──────────────────────────────────────────────────────────────────────────── */

/** Single characters an attacker uses to break a word into letters. */
const RUN_SEPARATORS: ReadonlySet<string> = new Set([
  " ",
  "-",
  ".",
  "_",
  "*",
  "|",
  "/",
  "+",
  "~",
  ",",
  ":",
  ";",
  "'",
  "‐",
  "‑",
  "‒",
  "–",
  "—",
]);

/**
 * Glue `d-e-m-o-g-r-a-p-h-i-c-s` and `d e m o` back into words.
 *
 * **Word boundaries are preserved**, which is the whole reason this exists
 * alongside {@link squeeze}: the pattern tables are `\b`-anchored, so a form
 * that dissolves every boundary matches almost nothing.
 *
 * A run must be at least **three** single-character tokens, and **every
 * separator inside it must be the same character**. Both constraints are load
 * bearing:
 *
 *  • *Three*, because two would rewrite `I want a 3 bed` into `I want a3bed`.
 *  • *Same separator*, because the common attack spaces the letters of a word
 *    with a hyphen and still separates the words with a space
 *    (`w-r-i-t-i-n-g a n-o-v-e-l`). A gluer that treats both alike swallows the
 *    word gap and produces `writinganovel`, which destroys every `\b` the
 *    pattern tables anchor on — trading one evasion for another.
 */
export function collapseLetterRuns(text: string): string {
  const parts = text.split(/([a-z0-9]+)/i);
  /* `split` with one capture group yields [sep, word, sep, word, …, sep]. */
  const wordSlots: number[] = [];
  for (let i = 1; i < parts.length; i += 2) wordSlots.push(i);

  const out = [...parts];
  let cursor = 0;

  while (cursor < wordSlots.length) {
    if (parts[wordSlots[cursor]].length !== 1) {
      cursor += 1;
      continue;
    }

    const separator = parts[wordSlots[cursor] + 1] ?? "";
    let end = cursor;
    if (RUN_SEPARATORS.has(separator)) {
      while (
        end + 1 < wordSlots.length &&
        parts[wordSlots[end + 1]].length === 1 &&
        (parts[wordSlots[end] + 1] ?? "") === separator
      ) {
        end += 1;
      }
    }

    if (end - cursor + 1 >= 3) {
      for (let slot = cursor; slot < end; slot += 1) out[wordSlots[slot] + 1] = "";
      cursor = end + 1;
      continue;
    }

    /*
     * A rejected run advances by ONE, never past `end`. Skipping to `end + 1`
     * loses the run that starts one token later: in `a n-o-v-e-l`, the pair
     * `a`+`n` is rejected as too short, and jumping past `n` leaves `n-ovel`.
     */
    cursor += 1;
  }

  return out.join("");
}

/** Every non-alphanumeric removed. See the header for how this form is matched. */
export function squeeze(text: string): string {
  return text.replace(/[^a-z0-9]+/gi, "");
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. The canonical form, and the derived set
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The single canonical string every other form is derived from.
 *
 * Order is load-bearing:
 *   invisibles → NFKC → lower-case → confusables → NFD → combining marks →
 *   smart quotes → whitespace.
 *
 * Invisibles come first so NFKC cannot see a word broken in half; the confusable
 * fold runs after `toLowerCase()` so the table only needs lower-case entries;
 * NFD runs after the fold so a Cyrillic letter carrying a diacritic loses both.
 *
 * Idempotent by construction — assert that in your own suite
 * (`canonicalize(canonicalize(x)) === canonicalize(x)` over a fuzz corpus).
 */
export function canonicalize(text: string): string {
  const withoutInvisibles = stripInvisibleCharacters(text);
  const compatible = withoutInvisibles.normalize("NFKC").toLowerCase();
  const folded = foldConfusables(compatible);
  const bare = stripCombiningMarks(folded.normalize("NFD"));
  return bare
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every boundary-preserving form a pattern table should be tested against.
 *
 * Deduplicated, so the common case (clean ASCII, nothing to undo) is a
 * single-element array and costs one pass, not five.
 */
export function boundaryForms(canonical: string): string[] {
  const forms = new Set<string>();

  /*
   * Two roots, because the two evasions interfere with each other: letter
   * spacing fences every digit off from every letter, which disables the
   * adjacency rule de-leeting depends on. Folding the symbol leet characters
   * first gives `collapseLetterRuns` a run of single alphanumerics to glue.
   */
  for (const root of [canonical, deLeetSymbols(canonical)]) {
    for (const variant of [root, collapseLetterRuns(root)]) {
      forms.add(variant);
      forms.add(deLeet(variant, "l"));
      forms.add(deLeet(variant, "i"));
    }
  }

  return [...forms];
}

/** The full derived set: boundary-preserving forms plus the squeezed variants. */
export interface MatchForms {
  /** The canonical form. Use this when one string is needed for reporting. */
  canonical: string;
  /** Forms that keep word boundaries — match `\b`-anchored patterns against all. */
  forms: string[];
  /** Boundary-free forms. Match ONLY bare-substring-safe terms against these. */
  squeezed: string[];
}

/**
 * Derive every matching form of a raw string.
 *
 * `postProcess` runs on the canonical form before the others are derived. Use it
 * for **domain collocation neutralisation**: rewrites that stop your own product
 * vocabulary tripping the pattern tables (e.g. a house-design product rewriting
 * "living area"/"storage area" → "living zone"/"storage zone" so only "nice
 * area"/"good area" can reach the place patterns). Applying it here means the
 * rewrite is inherited by EVERY derived form rather than one of them — and both
 * the input and the output layer must pass the SAME `postProcess`, or the output
 * layer re-opens on its own side the gap the input layer closed.
 */
export function deriveMatchForms(raw: string, postProcess?: (canonical: string) => string): MatchForms {
  const canonical = postProcess ? postProcess(canonicalize(raw)) : canonicalize(raw);
  const forms = boundaryForms(canonical);

  /*
   * De-leet AFTER squeezing as well: separators are what stop the adjacency rule
   * from firing, and squeezing removes all of them. `d-3-$-!-g-n` squeezes to
   * `d3$!gn`, which de-leets cleanly.
   */
  const squeezedSet = new Set<string>();
  for (const form of forms) {
    const bare = squeeze(form);
    if (bare.length === 0) continue;
    squeezedSet.add(bare);
    squeezedSet.add(deLeet(bare, "l"));
    squeezedSet.add(deLeet(bare, "i"));
  }

  return { canonical, forms, squeezed: [...squeezedSet] };
}

/**
 * Index of the first pattern that matches **any** form, or `-1`.
 *
 * Mirrors the `firstMatch` the tables were written against, so a rule's meaning
 * is unchanged — only the number of strings it is tested against.
 */
export function firstMatchAcrossForms(patterns: ReadonlyArray<RegExp>, forms: ReadonlyArray<string>): number {
  for (let i = 0; i < patterns.length; i += 1) {
    const pattern = patterns[i];
    for (const form of forms) {
      /* Tables are authored without /g, but reset defensively: a stateful regex
         reused across forms would skip matches and silently open the control. */
      pattern.lastIndex = 0;
      if (pattern.test(form)) return i;
    }
  }
  return -1;
}

/** True when any squeezed form contains `term`. `term` must already be squeezed. */
export function squeezedIncludes(forms: ReadonlyArray<string>, term: string): boolean {
  return forms.some((form) => form.includes(term));
}
