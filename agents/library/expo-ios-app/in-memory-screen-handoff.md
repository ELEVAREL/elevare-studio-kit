# Hand a fact to the next screen in memory, never in a route param

**Harvested 2026-09-29** from `D:\elevare-app` (Expo Router, React Native, iOS + web export), wave 5,
merged to `main` at `ef19800`. Sources: `src/lib/reset-handoff.ts` (commit `6ceb7cb`),
`src/lib/deletion-handoff.ts` (commit `921f649`), the reader in `src/app/sign-in.tsx`, and the proof
`tests/screens/seam-sign-in-deleted-param.test.mjs`. Verified green at harvest: that file plus the
other seven harvested suites, 147 tests, 147 pass, run on the clean `ef19800` checkout.

## When to reach for it

Screen A has to tell screen B something, and the thing is either:

- **personal data** (an email the person typed, a phone number, a name) that B should pre-fill, or
- **a claim B will show in the product's own voice** ("your account has been deleted", "your
  payment went through", "your session expired", "you were signed out"),

and the obvious tool is `router.push({ pathname: '/b', params: { ... } })`. Stop there.

**The tell:** a screen reads `useLocalSearchParams()` and renders what it finds as a notice, an
alert or a pre-filled field.

## Why a route param is the wrong carrier, two separate defects

1. **It is a URL, so it leaks.** On the web export, expo-router serialises params into the query
   string. An email handed from sign-in to reset landed in the address bar, the browser history and
   every server and CDN log. Personal data never goes in a URL (STANDARDS privacy rule), and on a
   native-only build it still becomes a URL the moment you add web.
2. **It is a deep-link injection vector.** An app that registers a URL scheme (`scheme` in
   `app.json`, here `elevare://`) or universal links lets ANY link on the internet open any route
   with any params. `elevare://sign-in?deleted=deleted` made the app announce, above the password
   field, in the brand's voice, that the reader's account had been deleted. **A false destructive
   fact on a trusted login screen is exactly what a phishing page needs.** The first fix (allowlist
   the param to two codes) fixed the WORDS and left the CLAIM chosen by the link's author, which is
   the actual defect. The only full fix is that the destination stops reading the param at all.

## The recipe

One tiny module per fact. Module scope is reachable only from the app's own JavaScript: no link,
no other app and no web page can write to it.

```ts
// src/lib/<fact>-handoff.ts
import type { NoticeCode } from './<domain>';   // a closed union, never free text

let handedOff: NoticeCode | null = null;

/** The ONLY writer. Setting and navigating are one call, and there is no way to do only the first. */
export function leaveFor<Destination>(
  router: { replace: (href: '/<destination>') => void },
  code: NoticeCode,
): void {
  handedOff = code;
  router.replace('/<destination>');
}

export function read<Fact>(): NoticeCode | null { return handedOff; }
export function clear<Fact>(): void { handedOff = null; }
```

The reader, on the destination screen:

```tsx
// Read ONCE in a state initialiser: a render React runs twice sees the same value.
const [notice] = useState(() => noticeFor(read<Fact>()));
// Clear AFTER mount, in an effect, so a later visit to this screen says nothing.
useEffect(() => { clear<Fact>(); }, []);
// And never read the old route param again. Not "validate it": ignore it.
```

For personal data (the reset-email case) the writer does not need to navigate itself; keep
`handOff(email)` next to the `router.push` and trim on write. The weld below matters for CLAIMS.

## The part people miss: weld the write to the navigation

A handoff value has no expiry. If the code can be set on a path that then does NOT navigate (a
cleanup that throws, a sign-out that fails, a user id that does not match), it sits in memory until
the NEXT time the destination mounts, which can be much later and for a different person, and that
screen announces the stale claim. So the writer takes the router and does both in one call, and the
only call sites are the paths where the claim is true at that instant (here: the server answered
AND the phone really signed out).

## Tests that hold it (all present in the source repo)

- **The vector is real:** assert `app.json` registers the scheme, so the test fails loudly if the
  premise ever stops holding rather than passing vacuously.
- **Hostile params render nothing:** mount the destination with the old param set to each valid
  code, a hostile string, and an array. Nothing renders.
- **Real flow still works:** drive the source screen's success path, assert the notice shows,
  remount the destination, assert it is gone.
- **Every non-navigating exit leaves nothing:** drive each exit that stays on the source screen,
  then mount the destination; nothing renders.
- **Structural:** grep the source screen; it may not import the raw setter (there is none) and may
  call the writer only at the named sites.
- **Controls (mutation):** re-reading the route param goes red; handing off early apart from the
  navigation goes red; never clearing goes red. Use
  [`../verification/mutation-control-harness.md`](../verification/mutation-control-harness.md) so a
  control whose marker drifted cannot pass on unmodified code.

## Assumes / adapt

- Expo Router (any version with `useLocalSearchParams`); the idea is framework-free and applies to
  React Navigation, Next.js `searchParams`, and any SPA router. On the web the equivalent vector is
  any `?notice=` query param a marketing link can set.
- The value is lost on a cold start. That is correct for a notice (a notice about a moment is not a
  fact to persist) and acceptable for a pre-fill (the field stays editable). If the fact must survive
  a process death, it is not a handoff; store it server-side and key it to the user.
- Never widen this into a general "message bus" module. One fact per file, a closed union type, one
  writer. A second file per fact is cheaper than a shared bag nobody can audit.
- Other params the same screen still reads (here an `expired` flag the auth layout sets) deserve the
  same audit: ask who can set it. A param the app sets for itself is still settable by a link.
