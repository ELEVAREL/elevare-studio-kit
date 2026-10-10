# State-class CSS existence check (QA/design recipe)

**When to reach for it:** any pre-ship QA or design audit of a codebase where JS/templates toggle CSS classes to express UI state. The defect class this catches: a view emits a state-carrying class (`active`, `selected`, `open`, `current`, `on`, `checked`, `expanded`, `dragging`, `disabled`…) that **no stylesheet rule targets** — the logic works, the DOM is correct, every test that asserts on classes passes, and the user sees *nothing*. Invisible UI state. The canonical instance: a segmented view switcher set `.active` on the current button, but no `.seg` rules existed in any stylesheet — three identical buttons with no indication of which view was showing. Cheap to run, catches a whole defect class that functional testing structurally misses (tests assert the class is present; only a human or this check asks whether the class *does* anything).

**The recipe:**

1. **Harvest emitted state classes.** Grep JS/templates for conditionally-applied classes — the tells are ternaries and `classList` calls:
   ```
   rg -o "classList\.(add|toggle)\('([a-z-]+)'" --no-filename -r '$2' src/ | sort -u
   rg -o '\?\s*"([a-z-]+)"\s*:\s*""' --no-filename -r '$1' src/ | sort -u
   rg -o "class=\\\\?\"[^\"]*\"" src/    # then eyeball for ternary-injected names
   ```
   Record each as **(container context, class name)** — e.g. `.seg button` + `active`, not just `active`.

2. **Confirm a rule exists for each, in context.** For every harvested pair, grep the stylesheets (all of them — theme layers too) for a selector that actually matches the element in situ:
   ```
   rg "\.seg\b" *.css          # container styled at all?
   rg "\.active\b" *.css       # state styled? and does the matching selector's
                               # specificity/ancestry fit where it's emitted?
   ```
   A bare `.active{...}` in a dead component's section does not count — verify the selector matches *this* element (ancestry + specificity vs. any global element styles, e.g. a global `button{background:...}` that outguns a contextless `.active`).

3. **Confirm the styled state is perceivable and not color-only.** The rule existing isn't enough: the active state should change more than hue (fill + weight, an icon, an underline) for color-blind users, and pass contrast in both states.

4. **File a fix per miss.** Either add the missing rules (see [`segmented-control-css.md`](segmented-control-css.md) for the switcher case) or delete the dead class emission if the state genuinely needs no visual.

**Assumes / adapt:**
- Class-name lists differ per codebase — seed the grep with this project's conventions (check the state names its frameworks emit too: `is-open`, `data-state="open"`, `aria-expanded` styled via attribute selectors all count as state carriers).
- In Tailwind-style codebases the check inverts: state classes are usually inline, so instead grep for *conditional class strings that resolve to the same value in both branches* (a ternary whose two arms are identical is the same bug).
- Pairs with a design-auditor pass: run this first (mechanical), then judge the styled states on craft.
