---
name: email-deliverability-preflight
description: You are about to send email from a domain — a cold outreach sequence, an invoice or dunning email, a newsletter, a client's contact form, a transactional send from a new app — or mail is already landing in spam or Promotions and nobody knows why. Run this FIRST. Covers SPF, DKIM, DMARC, BIMI, sending-domain and IP reputation, blocklists, inbox placement, spam-content and link scanning, bounce and complaint rates, and the separate-sending-domain rule that keeps cold outreach from burning the primary domain. Use before the first send from any new domain or subdomain, before scaling volume, when someone says "we're going to spam", "not delivering", "landing in Promotions", "DMARC", "SPF", "DKIM", "sender reputation", "warm up the domain", "bounce rate", "spam complaints", and before wiring any app to send mail. A green send report, a delivered webhook, and a test email that reached YOUR inbox all pass while mail is being filtered for everyone else.
origin: Elevare Studio 2026-09 — technical substance adapted from the `deliverability-qa` checklist in aaron-he-zhu/aaron-marketing-skills (Apache-2.0), rewritten standalone; the upstream is a member of a 120-skill framework and its cross-skill scoring, plugin scripts and memory writes are deliberately not carried over.
owners: cold-email-specialist, email-marketer, backend-engineer, devops-engineer
---

# Email deliverability pre-flight — prove the domain can send before you send

## The rule

**No first send, and no volume increase, from a domain whose SPF, DKIM and DMARC you
have not read this session.** Not "we set that up" — read the actual DNS records.

And: **a missing check is `NEEDS_INPUT`, never a pass.** If you could not run the
seed-list test, inbox placement is unknown. Unknown is not green. Pass-by-default on
a deliverability item is how a domain gets burned across an entire sending program,
and unlike a bug it is not reversible in an afternoon — reputation recovers over weeks.

## Why your own test email proves nothing

The single most common false green here: someone sends a test to their own Gmail, it
arrives, and the program is declared healthy.

| What passed | Why it passed on a domain that is being filtered |
|---|---|
| Test email reached my inbox | Your own address, prior engagement, and same-org allowlisting all bypass filtering |
| ESP dashboard says "Delivered" | *Delivered* means accepted by the receiving server — the spam folder is delivered |
| Webhook fired `delivered` | Same. There is no `landed_in_spam` webhook |
| SPF record exists | Exists ≠ passes. Over 10 DNS lookups and SPF **permerrors** — silently |
| DKIM is "set up in the ESP" | The ESP signs with *its* domain; without alignment to your From domain DMARC still fails |
| DMARC record exists | `p=none` means "observe and do nothing". It is a monitoring record, not enforcement |
| It worked last month | Reputation is a moving average. A single bad list or volume spike moves it |

Inbox placement is only knowable from a seed-list test or real recipient reports.
Everything else is a proxy.

## 1. Authentication — read the records, do not trust the setup docs

```bash
# substitute the real domain and the ESP's DKIM selector
dig +short TXT example.com                       # SPF lives on the root TXT
dig +short TXT _dmarc.example.com                # DMARC
dig +short TXT selector._domainkey.example.com   # DKIM (selector is ESP-specific)
dig +short TXT default._bimi.example.com         # BIMI, optional
```

| Record | Pass | Partial | Fail |
|---|---|---|---|
| **SPF** | present, **≤10 DNS lookups**, sending IPs covered, ends `-all` or `~all` | ends `?all`, or soft/loose config | missing, or ends `+all` |
| **DKIM** | signing on **your** domain, key **≥2048-bit**, `d=` **aligns** with the From domain | 1024-bit key, third-party `d=` only, or unaligned | not signing, or failing |
| **DMARC** | present, aligned, `p=quarantine` or `p=reject` | `p=none` **with SPF+DKIM aligned and passing** — young program, flag it | **no DMARC record at all** — stop |
| **BIMI** | VMC or CMC certificate + logo (needs DMARC at enforcement to display) | record without a mark certificate | never a blocker |

Three specific traps:

- **The 10-lookup SPF limit.** Every `include:` costs lookups and they nest. Exceed 10
  and the whole record `permerror`s — SPF fails for every message, and nothing warns you.
  Count them. Google Workspace + one ESP + one CRM is often already at the edge.
- **Alignment, not just presence.** DMARC passes only if SPF *or* DKIM passes **and its
  domain aligns with the visible From domain**. An ESP signing `d=sendgrid.net` while
  you send From `you@example.com` is a DKIM pass and a DMARC fail.
- **`p=none` is not protection.** It is the monitoring stage. It publishes no policy,
  so nothing stops a spoofer, and major mailbox providers increasingly treat bulk senders
  without enforcement as lower-trust. Read the RUA aggregate reports, fix what fails,
  then move to `quarantine` and on to `reject`.

## 2. Reputation and blocklists

- Google Postmaster Tools and Microsoft SNDS, on the sending domain — these are the only
  first-party reputation reads. Bad/Low = fail, Medium = partial, High = pass.
- **Spam-complaint rate**: `< 0.1%` pass · `0.1–0.3%` partial · `> 0.3%` fail. This is the
  hard red line at Gmail and Outlook; above it, filtering is automatic and impersonal.
- **Hard-bounce rate** below the ESP benchmark; a sudden spike is a fail and a signal that
  a list was bought, scraped, or imported without validation.
- Blocklist check (Spamhaus, Barracuda) on the sending domain **and** the sending IP.

## 3. Never send cold outreach from the primary domain

This is the one that costs a business its email, and it is not recoverable by fixing DNS.

- Cold outreach goes from a **separate domain** — `getexample.com`, `example-hq.com` —
  never the domain that carries client mail, invoices, or password resets.
- That domain needs its **own** SPF/DKIM/DMARC and its own warmup. A new domain has no
  reputation, which is not the same as good reputation.
- **Warm up**: start in the low tens per day, roughly double weekly, watch complaint and
  bounce rates at each step, and stop climbing the moment either moves. Weeks, not days.
- Buy the sending domain and let it age before the first send where you can.
- Transactional mail (invoices, receipts, dunning, password resets) belongs on a
  **third** identity — usually a subdomain of the primary. Marketing volume and complaint
  rates must never be able to take down a payment receipt.

## 4. Content, links, render

- Spam-trigger phrasing: ALL-CAPS subjects, `!!!`, "free money", claims you cannot support.
- Not image-only — a real plain-text alternative part must exist.
- Links: none broken, none shortened, none where display text ≠ `href`. The link domain
  should align with the sending domain; a bare shortener in a cold email is a spam signal.
- Renders in Gmail, Outlook and Apple Mail, and in dark mode, without a broken layout.
- One-click unsubscribe (`List-Unsubscribe` and `List-Unsubscribe-Post`) on bulk sends.

## 5. List hygiene and consent

- Bounce suppression is active and recent; suppression lists are honored across every
  sending tool, not just the one that recorded the bounce.
- A sunset path exists for chronically unengaged addresses.
- Consent basis on file per subscriber. **No consent record = `NEEDS_INPUT`**, not a pass.
  Send anyway and the complaint rate — see §2 — makes the decision for you.

## What to hand back

A line per item: **Pass / Partial / Fail / NEEDS_INPUT**, each naming the specific
offender (the record, the number, the URL), then:

1. Whether the domain is clear to send, clear to *scale*, or blocked — and on which item.
2. The blockers in fix order, cheapest first.
3. What you could **not** assess and why. Inbox placement with no seed test is unknown;
   say so rather than implying coverage you do not have.

## Failure modes of this check itself

- **`dig` against a caching resolver returns a stale record** after a DNS change. Query
  authoritatively (`dig @8.8.8.8`, or the domain's own NS) and re-check after TTL.
- **Checking the root domain when mail sends from a subdomain.** DMARC inherits to
  subdomains via `sp=`, but SPF and DKIM do not. Check the exact sending identity.
- **Reading a record and not parsing it.** A present record proves *setup*, not *passing
  mail*. Only the DMARC RUA aggregate report shows what receivers actually did.
- **One domain checked, a fleet assumed.** Several sending identities (primary,
  outreach, transactional) drift apart independently — see `credential-drift` for the
  same shape of failure with keys.
