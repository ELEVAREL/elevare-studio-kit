/**
 * UNFALSIFIABLE-CLAIM GATE.
 *
 * The dash gate catches a typographic violation. This one catches the defect
 * that actually ends the product: a sentence that cannot be checked, stated in
 * the register of something that was measured.
 *
 * The first run produced four of them, and they are worth naming because they
 * show the shape:
 *   "better structured data than most handyman sites we audit"  (no corpus: we
 *      have audited exactly one handyman site, this one)
 *   "fully secure"                                              (no security scan was run)
 *   "full security headers in place"                            (content-security-policy is absent)
 *   "the hosting is correctly configured"                       (maps to no probe)
 * Every one is unfalsifiable IN OUR FAVOUR, which is the precise shape of claim
 * this product exists not to make. A buyer cannot check any of them, and the
 * one thing he is paying for is that he does not have to.
 *
 * SCOPE, and it is the reason this gate does not produce false reds: it runs
 * ONLY over model-authored prose. Receipts are authored by code and quote real
 * probes, so a receipt legitimately contains "strict-transport-security" and
 * must never be flagged for containing the letters "secur". A gate wider than
 * the real invariant fails on correct content, and the repair it invites is to
 * corrupt a receipt.
 */

/**
 * Each rule names the claim class and why the sentence cannot be checked.
 * Comparatives are targeted at comparisons to OTHER SITES, an average or an
 * industry. A bare "most" is deliberately NOT banned: "most customers in this
 * trade will not fill out a form" is a reasoned claim about the vertical that
 * the report is entitled to make under money_confidence "reasoned". Banning it
 * would be a false red on correct copy.
 */
const RULES = [
  {
    kind: "comparative against an unmeasured corpus",
    why: "We audited one site. There is no corpus, no baseline and no measurement behind a comparison to other sites.",
    re: /\b(better|worse|stronger|weaker|cleaner|faster|ahead of|more \w+)\s+than\s+(most|many|other|average|the average|typical|industry)\b/gi,
  },
  {
    kind: "comparative against an unmeasured corpus",
    why: "Names a population of other businesses or sites that no probe looked at.",
    re: /\b(most|many|few|half of)\s+(handyman|handymen|contractor|contractors|trades?|competitors?|local businesses?|small businesses?|sites?|websites?)\b/gi,
  },
  {
    kind: "comparative against an unmeasured corpus",
    why: "Asserts a corpus of audits that does not exist.",
    re: /\b(sites?|websites?)\s+we\s+(audit|see|review)/gi,
  },
  {
    kind: "comparative against an unmeasured corpus",
    why: "Quantifies a population of other businesses. The first version of this gate listed only site-nouns and trade-nouns, so 'many businesses in this trade hide their prices' walked straight through it.",
    re: /\b(most|many|few|half of|plenty of|lots of)\s+(businesses|competitors|companies|firms|operators|shops|outfits)\b/gi,
  },
  {
    kind: "comparative against an unmeasured corpus",
    why: "Asserts what a competitor does. We looked at no competitor. A customer CALLING a competitor is a reasoned behavioural claim and is fine; a competitor who publishes or hides something is a claim about a site nobody opened.",
    re: /\b(competitors?|businesses|companies|firms)\s+(who|that)\s+(publish|publishes|hide|hides|do|does|offer|offers|charge|charges|show|shows)\b/gi,
  },
  {
    kind: "comparative against an unmeasured corpus",
    why: "A direct 'better than a competitor' comparison with no competitor measured.",
    re: /\bthan\s+(a|the|most|many)\s+(competitor|competitors|business|businesses|company|companies|rival|rivals)\b/gi,
  },
  {
    kind: "comparative against an unmeasured corpus",
    why: "Unlike-most and industry-standard both assert a baseline nothing measured.",
    re: /\b(unlike\s+most|industry[\s-]standard|best[\s-]practice|above\s+average|below\s+average)\b/gi,
  },
  {
    kind: "security claim with no security scan behind it",
    why: "No security scan was run on this site. content-security-policy is measurably absent, and probe P13 states in its own LIMIT field that it tested the client-rendered layer only, not the API and not row-level security.",
    re: /\b(secure|insecure|hardened|locked down|bulletproof|airtight)\b/gi,
  },
  {
    kind: "totalising word over a set that was not fully enumerated",
    why: 'A totalising set claim must name what was looked FOR, including what came back absent, or it is a tautology over whatever happened to be present.',
    // NARROWED after a false red. The first version banned bare "complete",
    // which rejected correct copy: "a complete written estimate" is the
    // client's own documented promise, not a claim about our coverage. A gate
    // wider than the real invariant fails on correct content and the repair it
    // invites is to damage the report. Adverbs stay banned outright; "complete"
    // and "full" are banned only where they quantify a SET, which is the actual
    // defect ("full set of security headers" over a list of five chosen because
    // they were present).
    re: /(\b(fully|completely|comprehensive|exhaustive)\b|\b(complete|full)\s+(set|list|suite|coverage|picture|range)\b)/gi,
  },
  {
    kind: "totalising word over a set that was not fully enumerated",
    why: 'The security header set is five of six: content-security-policy is absent. "Full headers" is measurably false.',
    re: /\bfull\s+(set\s+of\s+)?(security\s+)?headers?\b/gi,
  },
  {
    kind: "unfalsifiable filler that maps to no probe",
    why: "There is no probe for correctness of configuration, and the phrase would survive any state of the world.",
    re: /\b(correctly|properly|well)\s+(configured|set up|architected|built)\b/gi,
  },
  {
    kind: "absolute quantifier over customers nobody counted",
    why: 'No probe measured customer behaviour. "Every customer leaves" and "losing every emergency job" are unfalsifiable in our favour. Say "a customer" or "most customers in this trade" and let money_confidence carry the uncertainty.',
    // Deliberately narrow. "every job" is excluded because "take photos at the
    // end of every job" is an instruction to the owner, not a claim about
    // people, and banning it would be a false red on correct copy. Only
    // people-nouns and emergency outcomes are quantified here.
    re: /\b(every|all)\s+(customer|customers|caller|callers|homeowner|homeowners|visitor|visitors|lead|leads|emergency\s+\w+)\b/gi,
  },
  {
    kind: "absolute that no probe can support",
    why: "Perfection and totality claims cannot be established by sampling.",
    // "100%" cannot take a trailing \b: "%" is a non-word character, so \b
    // after it only matches when a word character follows immediately, and
    // "100% ready" silently never fired. The committed fixture caught it. It is
    // therefore split out of the \b-delimited group rather than patched inside
    // it, because the same trap applies to any token ending in punctuation.
    re: /(\b(perfect|perfectly|flawless|every single|no issues? (at all|whatsoever)|nothing wrong)\b|100\s?%)/gi,
  },
];

/** Fields the model authors. Receipts are excluded: code writes those. */
export function modelAuthoredStrings(report) {
  const out = [];
  const push = (path, v) => {
    if (typeof v === "string" && v.trim()) out.push({ path, text: v });
  };
  push("report.headline", report.report.headline);
  push("report.verdict", report.report.verdict);
  (report.report.what_is_already_right || []).forEach((s, i) =>
    push(`report.what_is_already_right[${i}]`, s)
  );
  (report.findings || []).forEach((f, i) => {
    for (const k of ["title", "money", "evidence", "fix"]) push(`findings[${i}].${k}`, f[k]);
  });
  push("decision.rebuild_would_change", report.decision?.rebuild_would_change);
  return out;
}

export function findOverclaims(report) {
  const hits = [];
  for (const { path, text } of modelAuthoredStrings(report)) {
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text)) !== null) {
        hits.push({
          path,
          kind: rule.kind,
          why: rule.why,
          matched: m[0],
          context: text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60),
        });
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// CALIBRATION. Committed fixtures, dirty and clean. The clean set is the more
// important half: it is what proves the gate is not wide enough to reject
// correct copy.
// ---------------------------------------------------------------------------
const wrap = (s) => ({
  report: { headline: s, verdict: "", what_is_already_right: [] },
  findings: [],
  decision: {},
});

export const FIXTURES = {
  dirty: [
    "better structured data than most handyman sites we audit",
    "Most handyman sites in this market publish no number at all.",
    "This site is fast, fully secure, and correctly built.",
    "You are invisible to phone calls and you are losing every emergency job because of it.",
    "Every customer who needs a same-day callback is leaving for a competitor.",
    "All eight routes are served with full security headers in place.",
    "The hosting is correctly configured.",
    "Your admin area is secure.",
    "This is an industry-standard setup.",
    "The site is 100% ready for search.",
    "You get a complete set of security headers on every response.",
    "This is a comprehensive audit of your site.",
    // Both of these reached a finished report and were caught only on review.
    // They are committed here so they can never reach one again.
    "You publish real starting prices that many businesses in this trade hide.",
    "That gives a customer more certainty than a competitor who publishes no number at all.",
  ],
  clean: [
    "There is no phone number anywhere on your website.",
    "Most customers in this trade will not fill out a form when they need help today.",
    "Every page loads in under 92 milliseconds.",
    "Five of six standard security headers are present on every response, and content-security-policy is absent.",
    "You publish real starting prices of $40, $150 and $350 and a written-estimate promise.",
    "The admin page shows a sign-in wall and renders no owner data to a signed-out browser.",
    "A homeowner standing in a driveway will call the next name on the list.",
    "Take two or three photos at the end of every job from now on.",
    "Most customers in this trade want to call, not fill in a form.",
    // The false red that this narrowing exists to prevent. The client's own
    // documented promise uses this word and the report is entitled to quote it.
    "You promise a complete written estimate before any work begins.",
    // Must stay clean: a customer calling a competitor is a reasoned claim
    // about customer behaviour, not a claim about a competitor's website.
    "They will call a competitor instead.",
    "A homeowner with a leak calls the next name on the list.",
  ],
};

export function runCalibration() {
  const results = { dirty: [], clean: [], ok: true };
  for (const text of FIXTURES.dirty) {
    const hits = findOverclaims(wrap(text));
    if (hits.length === 0) results.ok = false;
    results.dirty.push({ text, fired: hits.length > 0, kinds: [...new Set(hits.map((h) => h.kind))] });
  }
  for (const text of FIXTURES.clean) {
    const hits = findOverclaims(wrap(text));
    if (hits.length > 0) results.ok = false;
    results.clean.push({ text, clean: hits.length === 0, matched: hits.map((h) => h.matched) });
  }
  return results;
}

if (process.argv[1] && process.argv[1].endsWith("overclaim.mjs")) {
  const r = runCalibration();
  console.log(JSON.stringify(r, null, 2));
  console.log(
    r.ok
      ? "CALIBRATION PASSED. Every dirty fixture fired and every clean fixture stayed silent, so the gate is neither blind nor wider than the invariant."
      : "CALIBRATION FAILED. Do not trust this gate."
  );
  process.exit(r.ok ? 0 : 1);
}
