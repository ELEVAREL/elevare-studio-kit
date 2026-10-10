/**
 * Adversarial **mutators** for a content-control eval suite.
 *
 * ELEVARE STUDIO PATTERN LIBRARY — generic, drop-in, no dependencies.
 * See `../mutation-eval-suite.md` for how to wire them.
 *
 * A hand-written eval suite is written in clean ASCII, which is exactly why it
 * stays green while the control it guards is open to a one-character bypass:
 *
 * > "the code compiles, the tests pass, and the control is absent."
 *
 * Every function here takes a prompt and returns a **visually equivalent**
 * string that a real user could paste from a browser, a word processor, or any
 * of the dozens of "invisible character" generators on the open web. If the
 * control's answer changes under any of them, the control is decorative.
 *
 * NOTHING HERE IS A FIXTURE. These are generators applied to every case in your
 * suite, so a case added to the suite is mutated for free — N cases × 17
 * mutators, and the coverage grows with the suite instead of behind it.
 *
 * PURE. No I/O.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * The alphabets an attacker actually uses
 * ──────────────────────────────────────────────────────────────────────────── */

export const ZERO_WIDTH_SPACE = "​";
export const ZERO_WIDTH_NON_JOINER = "‌";
export const ZERO_WIDTH_JOINER = "‍";
export const SOFT_HYPHEN = "­";
export const WORD_JOINER = "⁠";
export const LEFT_TO_RIGHT_MARK = "‎";
export const COMBINING_ACUTE = "́";

/** Cyrillic and Greek characters that render as Latin letters in every UI font. */
const HOMOGLYPH_BY_LATIN: Readonly<Record<string, string>> = {
  a: "а", // CYRILLIC SMALL LETTER A
  c: "с", // CYRILLIC SMALL LETTER ES
  e: "е", // CYRILLIC SMALL LETTER IE
  i: "і", // CYRILLIC SMALL LETTER BYELORUSSIAN-UKRAINIAN I
  j: "ј", // CYRILLIC SMALL LETTER JE
  o: "о", // CYRILLIC SMALL LETTER O
  p: "р", // CYRILLIC SMALL LETTER ER
  s: "ѕ", // CYRILLIC SMALL LETTER DZE
  x: "х", // CYRILLIC SMALL LETTER HA
  y: "у", // CYRILLIC SMALL LETTER U
  v: "ν", // GREEK SMALL LETTER NU
};

/** The substitutions every leetspeak generator makes. */
const LEET_BY_LATIN: Readonly<Record<string, string>> = {
  o: "0",
  l: "1",
  e: "3",
  a: "4",
  s: "$",
  t: "7",
  i: "!",
};

/* ────────────────────────────────────────────────────────────────────────────
 * Word-level helpers
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Apply `transform` to each maximal run of ASCII letters at least `minLength`
 * long. Short words are left alone so the mutant still reads as English and the
 * test is not quietly measuring "did we destroy the sentence".
 */
function mapWords(text: string, minLength: number, transform: (word: string) => string): string {
  return text.replace(/[A-Za-z]+/g, (word) => (word.length >= minLength ? transform(word) : word));
}

/* ────────────────────────────────────────────────────────────────────────────
 * The mutators
 * ──────────────────────────────────────────────────────────────────────────── */

export interface Mutator {
  /** Stable id, printed in the failure message so a red run names the attack. */
  id: string;
  /** One line a human can read in a report. */
  description: string;
  apply: (text: string) => string;
}

/** Drop an invisible character into the middle of every reasonably long word. */
const invisibleInjector = (id: string, description: string, char: string): Mutator => ({
  id,
  description,
  apply: (text) => mapWords(text, 6, (word) => `${word.slice(0, 3)}${char}${word.slice(3)}`),
});

export const MUTATORS: readonly Mutator[] = [
  invisibleInjector(
    "zwsp",
    "U+200B ZERO WIDTH SPACE inside every word — the exact bypass reproduced in SECURITY §A1",
    ZERO_WIDTH_SPACE,
  ),
  invisibleInjector("soft-hyphen", "U+00AD SOFT HYPHEN inside every word", SOFT_HYPHEN),
  invisibleInjector("zwnj", "U+200C ZERO WIDTH NON-JOINER inside every word", ZERO_WIDTH_NON_JOINER),
  invisibleInjector("zwj", "U+200D ZERO WIDTH JOINER inside every word", ZERO_WIDTH_JOINER),
  invisibleInjector("word-joiner", "U+2060 WORD JOINER inside every word", WORD_JOINER),
  invisibleInjector("ltr-mark", "U+200E LEFT-TO-RIGHT MARK inside every word", LEFT_TO_RIGHT_MARK),
  {
    id: "homoglyph",
    description: "every Latin letter with a Cyrillic/Greek twin swapped for it",
    apply: (text) =>
      mapWords(text, 4, (word) =>
        [...word]
          .map((char) => {
            const lower = char.toLowerCase();
            const twin = HOMOGLYPH_BY_LATIN[lower];
            if (!twin) return char;
            return char === lower ? twin : twin.toUpperCase();
          })
          .join(""),
      ),
  },
  {
    id: "homoglyph-sparse",
    description: "a single Cyrillic o (U+043E) per word — the minimum-effort variant",
    apply: (text) => mapWords(text, 4, (word) => word.replace(/o/, HOMOGLYPH_BY_LATIN.o)),
  },
  {
    id: "combining-marks",
    description: "a combining acute (U+0301) after every vowel — visually a diacritic, textually a new string",
    apply: (text) => mapWords(text, 4, (word) => word.replace(/[aeiouAEIOU]/g, (v) => `${v}${COMBINING_ACUTE}`)),
  },
  {
    id: "precomposed-diacritics",
    description: "precomposed accented Latin-1 vowels (á é í ó ú) substituted for plain ones",
    apply: (text) =>
      mapWords(text, 4, (word) =>
        word.replace(/[aeiou]/g, (v) => ({ a: "á", e: "é", i: "í", o: "ó", u: "ú" })[v] ?? v),
      ),
  },
  {
    id: "letter-space-hyphen",
    description: "d-e-m-o-g-r-a-p-h-i-c-s — every letter separated by a hyphen",
    apply: (text) => mapWords(text, 5, (word) => [...word].join("-")),
  },
  {
    id: "letter-space-dot",
    description: "d.e.m.o.g.r.a.p.h.i.c.s — every letter separated by a full stop",
    apply: (text) => mapWords(text, 5, (word) => [...word].join(".")),
  },
  {
    id: "letter-space-space",
    description: "d e m o g r a p h i c s — every letter separated by a space",
    apply: (text) => mapWords(text, 5, (word) => [...word].join(" ")),
  },
  {
    id: "leet",
    description: "leetspeak substitutions (o→0, e→3, a→4, s→$, l→1, i→!)",
    apply: (text) =>
      mapWords(text, 4, (word) =>
        [...word].map((char) => LEET_BY_LATIN[char.toLowerCase()] ?? char).join(""),
      ),
  },
  {
    id: "leet-sparse",
    description: "one leet substitution per word — g00d, dem0graphics",
    apply: (text) =>
      mapWords(text, 4, (word) => word.replace(/[oea]/, (char) => LEET_BY_LATIN[char] ?? char)),
  },
  {
    id: "fullwidth",
    description: "fullwidth Latin forms (ｄｅｍｏｇｒａｐｈｉｃｓ)",
    apply: (text) =>
      mapWords(text, 4, (word) =>
        [...word].map((char) => String.fromCodePoint(char.codePointAt(0)! - 0x21 + 0xff01)).join(""),
      ),
  },
  {
    id: "zwsp-plus-homoglyph",
    description: "zero-width space AND a Cyrillic twin — the layered attack",
    apply: (text) =>
      mapWords(text, 5, (word) => {
        const swapped = word.replace(/[aeop]/g, (char) => HOMOGLYPH_BY_LATIN[char] ?? char);
        return `${swapped.slice(0, 2)}${ZERO_WIDTH_SPACE}${swapped.slice(2)}`;
      }),
  },
  {
    id: "letter-space-plus-leet",
    description: "letter-spaced AND leeted — g-0-0-d n-3-i-g-h-b-0-r-h-0-0-d",
    apply: (text) =>
      mapWords(text, 5, (word) =>
        [...word].map((char) => LEET_BY_LATIN[char.toLowerCase()] ?? char).join("-"),
      ),
  },
];

/** Ids only, for a compact report line. */
export const MUTATOR_IDS: readonly string[] = MUTATORS.map((mutator) => mutator.id);
