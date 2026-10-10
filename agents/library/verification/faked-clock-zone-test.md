# Testing zone-dependent UI: take "today" from the screen's own function, fake only Date, and prove the UTC version goes red

**Harvested 2026-10-01** from `D:\elevare-app` `tests/design/home.test.mjs` (commit `3c8a72e`,
wave 6 part 2, build-24 grade finding 8) and `clockIn` in `src/components/format.ts`. Verified at
harvest on an export of `6ff5617`, Node 24.16.0: the file passes 69 of 69, including the
finding-8 test and its control. Calibrated: swapping the finding-8 test's two `homeToday` calls for
`utcToday` turned it red (0 pass, 1 fail); restored byte-identical, green.

## When to reach for it

Any UI that decides something from "today" or "the hour" in a zone that is not UTC: a greeting by
hour, a "this week" card, a reading or report window, a streak, a due date, an "expires today"
badge, a cron-shaped feature shown on a screen.

**The bug class:** the product computes today in the business's zone and the TEST computes today
with `new Date().toISOString().slice(0, 10)`, a UTC date. From 00:00 to 04:00 UTC every night
(for a New York business) the test builds a fixture dated tomorrow, the window function rightly
calls it future, the card hides, and the test goes red on correct code. Every night. People learn
to re-run it, and then a real failure gets re-run too.

**A TZ pin does not fix it.** Setting `TZ=America/New_York` on the test process changes nothing
when neither side reads the process zone: the product passes an explicit zone to `Intl`, and
`toISOString()` is UTC regardless.

## The recipe

1. **The product reads the business zone through one function** that returns both the hour and
   the calendar date, and falls back to the device zone on an invalid one:
   ```ts
   export function clockIn(now: Date, timeZone: string | null | undefined): { hour: number; date: string } {
     const read = (zone: string | undefined) => {
       const parts = new Intl.DateTimeFormat('en-US', {
         timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
       }).formatToParts(now);
       const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
       return { hour: Number(get('hour')) % 24, date: `${get('year')}-${get('month')}-${get('day')}` };
     };
     if (typeof timeZone === 'string' && timeZone.trim().length > 0) {
       try { return read(timeZone.trim()); } catch (err) { if (!(err instanceof RangeError)) throw err; }
     }
     return read(undefined);
   }
   ```
   `hourCycle: 'h23'` plus `% 24` guards against engines that print midnight as `24` (the source
   does not say which engine prompted it; treat the reason as inferred). Only a `RangeError` (an
   invalid zone) falls back; anything else is a real error and throws.
2. **The test computes today with the SAME function and the SAME zone as the screen,** loaded from
   the real module and the fixture's own profile:
   `const homeToday = () => clockIn(new Date(), FIXTURE_PROFILE.timezone).date;`
3. **Fake only `Date`, at the instants that matter,** with `node:test`'s mock timers, and always
   reset:
   ```js
   import { mock } from 'node:test';
   function atClock(iso, fn) {
     mock.timers.enable({ apis: ['Date'], now: new Date(iso) });
     try { return fn(); } finally { mock.timers.reset(); }
   }
   ```
   Only `apis: ['Date']`: the source fakes nothing else, and faking `setTimeout` as well would
   stall anything the render waits on (reasoning, not a measured failure).
4. **Run the real assertion at a boundary instant and at an ordinary one,** and assert the fake
   took before trusting the result:
   ```js
   for (const iso of ['2026-10-01T00:30:00Z', '2026-09-30T15:00:00Z']) {   // 8:30 pm the day before in New York; mid-afternoon
     atClock(iso, () => {
       assert.equal(new Date().toISOString(), new Date(iso).toISOString(), 'the clock is not faked, so this proves nothing');
       assertWeeklyOnHome(homeToday);
     });
   }
   ```
5. **CONTROL: the UTC computation goes red at the boundary,** with a precondition that the two
   dates really differ at that instant (otherwise the control tests nothing):
   ```js
   atClock('2026-10-01T00:30:00Z', () => {
     assert.notEqual(utcToday(), homeToday(), 'at this instant the two dates should differ, or the control tests nothing');
     assert.ok(expectRed(() => assertWeeklyOnHome(utcToday)).red, 'the weekly card test passed on the UTC date');
   });
   ```
   Pass the date function INTO the assertion helper (`assertWeeklyOnHome(todayFn)`) so the real
   test and the control run the identical body with one input changed.
6. **Unit-test the clock function across zones** at one fixed instant, plus the fallback: the same
   instant is hour 9 in New York and hour 22 in Tokyo, and a bogus zone returns the device zone's
   answer instead of throwing.

## Assumes / adapt

- `mock.timers` with `apis: ['Date']` needs a recent Node; verified here on 24.16.0 only. Check
  your runtime before relying on it.
- The boundary instant depends on the fixture zone: pick a UTC time when the fixture zone's date is
  still the previous day (west of UTC) or already the next day (east of UTC).
- Applies equally to Jest/Vitest (`vi.setSystemTime`, `jest.setSystemTime`); the rules that matter
  are the same function and zone as the product, an asserted fake, and a UTC control.
- When you write a mutation for this kind of control by hand, make the marker line-ending
  tolerant: the source file here was CRLF in the export and a literal LF marker matched 0 times.
  A guard that throws on 0 matches is what kept that from reading as a fired control (see
  [`mutation-control-harness.md`](mutation-control-harness.md)).

## Related

[`control-first-check.md`](control-first-check.md), [`false-green-casebook.md`](false-green-casebook.md),
[`mutation-control-harness.md`](mutation-control-harness.md) (`expectRed`).
