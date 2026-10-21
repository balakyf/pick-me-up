# WP4: Tower UI and rewards (notes)

> **Status:** Built, gates green, checked against WP3's engine · **Dates:** 2026-10-12, finished 2026-10-13 · **Branch:** `fun/wp4-tower-ui` (based on WP0, `3b2ce0a`)
> **Spec:** `docs/superpowers/specs/2026-10-12-fun-and-return-design.md` §4.5 (S6 Sweep, S11, S12 card, S13/S14/S15 UI, S18, S22 banner)

## What the player gets

**The floor-to-floor rhythm.** A won floor goes VICTORY → results with no click (1.2 s), and the next decision is on the results card itself:

1. **VICTORY auto-advances** to the results after 1.2 s. A defeat keeps its Continue button, because a loss deserves a beat.
2. **Reward cascade (S11).**
   - Gold and XP count up, with coin ticks that rise in pitch.
   - Coins burst from the gold figure and fly into the "Next summon" purse. They use hash-seeded offsets, at most 12 nodes.
   - Rows enter one after another:
     - the Skull door's ×2 gold;
     - Pent-up Interference (`restedBonus`) with charges left;
     - revenge gold;
     - the streak bonus going into the Sortie purse;
     - after a rout, what the purse kept.
   - **Materials won** appear as chips. These were never shown before.
   - **Level-ups**: "▲ Mira Lv 6→7" with the hero's bust and the level-up sting, one row per hero who fought. The bench (shared XP) is folded into a single "26 heroes on the bench grew stronger" line, so a big roster doesn't produce a 30-row card.
   - A **"Toward the next summon" bar** fills from the gold before the floor to the gold after it.
     - When a summon is affordable, it shows a pulsing gold **"Summon now ▸"** button (`onGo('summon')`). During a Sortie the button is labelled "(banks the purse)", and the purse is banked (`RETURN_TO_CAMPUS`) *before* the Tower is left.
     - When a summon is out of reach but the Sortie's purse would cover the rest, it offers **"Bank +600 and summon ▸"**. This joins the two loops: pushing your luck and spending gold.
     - Otherwise it shows "1,240 more gold".
   - A **"Next:" teaser** gives the open loop, e.g. "Next: Floor 9 · ⚔ Path. The guardian floor is right after.", "Next: choose a Boon, then Floor 6.", or the doors on offer.
3. **The next decision, one click away.**
   - When Doors are offered, the results card shows them as its continue buttons. Picking one closes the card with the choice made.
   - During a Sortie with no Doors, it asks **"Press on ▸"** or **"Return to campus (bank +X)"**.
   - With a Boon waiting, the button reads **"Choose a Boon ▸"**.
4. **Sweep (S6).**
   - Fights are passed to BattleScene as `mode='highlights'` when all of these hold:
     - the floor is a Breather or scouted Safe;
     - it was won with nobody lost;
     - `prefs.autoSweep` is on.
   - The results show "⚡ Swept: an easy floor, nobody lost." with a **Watch full replay** link. The replay plays in full, then returns to the results instantly, with no second count-up.
   - The scout card has a toggle, "⚡ Sweep easy floors: on/off", which is saved in `pmu.prefs`.

**On the Tower screen:**
- The **decision zone** is scrolled into view on arrival and whenever the floor or pending choice changes. It holds the Sortie bar, then the Doors or a Boon, then the scout card. The old behaviour centred the floor list, which hid the scout card below the fold.
- **Door picker (S13).**
  - Two or three arched door cards. Each shows the kind icon, title (Path / **Skull** / Breather / Rest / **Cache**), reward icon, a one-line blurb with real TUNING numbers, and a one-line scout preview ("Safe · party ×2.4", or "☠ Mira's Bane").
  - The preview scouts the floor *as if* that door were chosen, as a pure read.
  - Isel explains the Skull door once (`GUIDE_STEP 'doors'`).
  - A note says that with no choice made, the party takes the first door. The floor's Enter still works.
  - Choosing dispatches `CHOOSE_DOOR` with a door sting. A Rest or Cache door shows what it gave, by diffing state ("A cache, unguarded. +720 gold · +1 Promotion Stone").
  - If that door just paid for a summon, the notice carries a **"✦ A summon is ready ▸"** button. That notice stays up for 9 s rather than 3.6 s.
  - Cache gold on the card uses the world-grade multiplier, as the engine does.
- **Boon picker (S14).** Three big cards with icon, name and description, built on the event-panel pattern. The pick dispatches `RESOLVE_EVENT` with a boon sting and a "Boon gained: Volley. It lasts this sortie." notice. The Boons held this Sortie are shown as icons.
- **Sortie bar (S15).**
  - Shows the floors in the streak, the purse "◆ 640 at risk", and "next clear +40% gold".
  - Shows the held Boons as icons, with names in the tooltips.
  - "⌂ Return to campus (bank +640)" dispatches `RETURN_TO_CAMPUS` and walks the Master home to Isel (`onGo('fairy')`).
  - **Leaving the Tower view with a Sortie running banks it.** The bank is deferred one tick so StrictMode's double mount does not trigger it. The bar says so.
- **Scout card (S12, refactored out of `ScoutPanel`).**
  - Kind badge (💀 Elite, 👑 Boss, 🍃 Breather…).
  - Up to 2 named threats with their reason.
  - Rout threshold ("The party breaks after 2 fall.").
  - Last Stand and mercy notes.
  - A pulsing red **"Mira's Bane waits here."** banner.
  - A primary **"⚔ Fight floor N ▸"** call to action, so the decision and the action sit together.
- **"Because…" (S18).**
  - The MVP: most damage, with kills credited by last hit.
  - The reasons, in a pure `explainFloor(result, orders, state)`. Each reason is one line:
    - Protect: hits taken after the order, or that the hero fell anyway.
    - Focus: whether the target fell before it acted again or before it cast.
    - Retreat: who came home.
    - Skull door: ×2 and the stones.
    - Breather.
    - Rout: after how many fell.
    - Wipe.
    - Last Stand.
    - Revenge.
- **"AVENGED!" banner (S22)** on the results when `nemesisDefeated` is set, with the Bane and hero names from `life.legacy.nemeses` and a success sting.
- New title states: **ROUTED** (with "the line broke, and the survivors fled home"), and the Boon variant of the event line.

All motion is stepped to match the pixel kit, and all of it is off under `prefs.reducedMotion` or `prefers-reduced-motion`: numbers show their final value and the coins are not drawn. Every new string goes through `t()`, and its French is in `frTower.ts`.

## Files

**Changed (owned):**
- `src/ui/TowerScreen.tsx`: fight context (pre-levels, gold before, Sortie before, Sweep mode), orders log, auto-advance, Door/Boon/Sortie flows, the decision zone, notices, the unmount bank, the replay round-trip. The scout panel moved out.
- `src/ui/ResultsScreen.tsx`: the cascade. New **optional** props: `preLevels`, `goldBefore`, `orders`, `preSortie`, `swept`, `instant`, `onGo`, `onReplay`, `onChooseDoor`, `onSeenDoorGuide`, `onReturnToCampus`. With none of them, the card is the old one-button card (the WP0 test stays green).
- `src/ui/results.css`: the cascade, coins, summon bar, "Because…", Avenged, reduced motion.
- `src/ui/i18n/frTower.ts`: about 125 FR strings.

**New:**
- `src/ui/tower/kinds.ts`: icons, labels, blurbs, `currentKind`, Boon display fallbacks.
- `src/ui/tower/explain.ts`: `explainFloor`, `mvpOf`, `killersOf`.
- `src/ui/tower/rewards.ts`: `levelsOf`/`levelUps`, `summonProgress`, `nextTeaser`, `materialLabel`/`materialRows`, `sweepMode`, `streakPct`, `keptOnRout`, `sortieActive`, `doorOutcome`, `avengedNames`.
- `src/ui/tower/useCountUp.ts`: the pure `countUpValue`, plus a rAF hook with a hard-stop timer so it always lands exactly.
- `src/ui/tower/CoinBurst.tsx`
- `src/ui/tower/autoAdvance.ts`: `useVictoryAutoAdvance`, `victoryShown`.
- `src/ui/tower/ScoutCard.tsx`: `ScoutCard`, `KindBadge`, `THREAT_*`.
- `src/ui/tower/DoorPicker.tsx`: `DoorPicker`, `previewDoor`, `DOORS_GUIDE_STEP`.
- `src/ui/tower/BoonPicker.tsx`: `BoonPicker`, `BoonIcons`.
- `src/ui/tower/SortieBar.tsx`
- `src/ui/tower/tower.css`
- `src/ui/tower/fixtures.ts`: test fixtures (hand-built FloorResults and logs, F6 states).
- Tests: `explain.test.ts`, `rewards.test.ts`, `kinds.test.ts`, `useCountUp.test.tsx`, `autoAdvance.test.tsx`, `results.test.tsx`, `pickers.test.tsx`, `towerScreen.test.tsx`, `tower.smoke.test.tsx`.

## Tests added (93 new tests, 9 files; 101 in 10 files after the review)

- **`explain.test.ts` (17).**
  - Protect: untouched, fell anyway, a single hit.
  - Focus: fell before acting, held out.
  - Each order named once; Retreat counts who came home.
  - Skull door and its stones; Breather.
  - Rout counts, and a rout with nobody lost ("the line broke", never "after 0 fell"); a wipe that was not a rout.
  - Last Stand and revenge names.
  - Empty for a plain clear.
  - MVP and killers.
- **`rewards.test.ts` (21).**
  - Level-up diff, including that fallen heroes are excluded.
  - Summon progress and its clamps.
  - Teasers: doors, Boon, event, guardian countdown, anchor, kind, past the top.
  - Material labels and ordering.
  - **Sweep rules:** Safe or Breather sweeps; never with a death, a loss, the preference off, a tutorial floor, a boss or anchor, or a revenge.
  - Streak, rout keep, and the Door-outcome text.
- **`kinds.test.ts` (7).**
  - `currentKind` refines the 'path' default.
  - Skull and Cache labels.
  - **No door title or blurb contains a smoke trigger word** (Enter, Treasure, Menu…).
  - Cache price; Boon icons and name fallbacks.
- **`useCountUp.test.tsx` (4).**
  - The pure easing is monotone, integer, never overshoots, and lands exactly.
  - The hook **reaches the exact value**.
  - Reduced motion shows the final value.
- **`autoAdvance.test.tsx` (4).** Fires once, 1.2 s after VICTORY; never on a defeat; never while inactive.
- **`results.test.tsx` (17).**
  - **Materials and a level-up row from `preLevels`.**
  - **The count-up reaches the exact paid amount.**
  - The instant mode.
  - Skull, Pent-up Interference and streak lines, plus "Because…" and MVP.
  - "Summon now ▸" calls `onGo('summon')`; the "more gold" text when it can't.
  - "Bank +X and summon" appears when the purse covers the gap, and not when it falls short.
  - Revenge gold is priced by the world grade.
  - The teaser; the Sweep chip and replay; the AVENGED banner.
  - Doors on the card (no Enter or Treasure; chooses by index).
  - Press on / Return to campus; Choose a Boon.
  - Rout with the purse kept.
  - A plain card has one button.
- **`pickers.test.tsx` (9).**
  - DoorPicker previews and chooses; Isel's explanation shows once; no-fight doors; `previewDoor` is pure; renders nothing without doors.
  - BoonPicker picks, and ignores other events.
  - SortieBar.
  - ScoutCard: threats capped at 2, rout, Last Stand, mercy, Nemesis, Sweep toggle.
- **`towerScreen.test.tsx` (12).** The real TowerScreen and the real engine, with a stand-in BattleScene that shows its banner at once. Like the smoke test, it stands in a minimal `chooseDoor` only while the real one throws "not built yet".
  - **VICTORY auto-advance, and the count-up equals the real gold delta.**
  - **A Safe floor won clean is swept, and the full replay round-trips.** Sweep off means a full replay.
  - "Summon now ▸" goes to the summon screen. During a Sortie, `RETURN_TO_CAMPUS` is dispatched before `onGo` is called.
  - A Cache door says what it paid and offers the summon it paid for. It offers nothing more when a summon is still out of reach.
  - The Door picker replaces the scout card and dispatches `CHOOSE_DOOR` with Enter still enabled.
  - The Boon picker blocks Enter and dispatches `RESOLVE_EVENT`.
  - Return to campus dispatches and walks to Isel.
  - **The unmount banks the Sortie (deferred).**
  - **No dispatch between `ATTEMPT_FLOOR` and the end of the battle** (the `revise` rule).
- **`tower.smoke.test.tsx` (2).**
  - The real App: **a save on F6 with Doors pending → Tower Gate → take the Skull door → the scout card shows "Elite"**, and `GUIDE_STEP 'doors'` is recorded.
  - An open Boon event still disables the first Enter.

`app.smoke.test.tsx` is untouched and green.

## Deviations from the spec, and why

1. **The VICTORY auto-advance watches the battle's DOM.** BattleScene (WP2) exposes no "ended" callback, so `useVictoryAutoAdvance` waits for `.battle-banner.win`, or a future `[data-battle-end="win"]`, inside a `display: contents` wrapper. Only victories auto-advance; defeats keep Continue. A cleaner hook is requested below.
2. **Sweep never applies to tutorial floors (F1-F2), boss/anchor floors, or a fight that avenged a Nemesis.** The spec says "Breather or Safe". On today's numbers F1-F12 scout Safe, so a new Master's very first fights would have been 2-second highlights. Guardian floors and revenge fights are the payoff moments.
3. **"Return to campus" walks the Master to Isel (`onGo('fairy')`).** The `onGo` contract only takes a `PlaceId`, and the lobby has none. Isel is the natural "home" landing. Without `onGo`, a notice confirms the bank instead.
4. **Leaving the Tower view banks a running Sortie without asking first.** The "◀ Lobby" button lives in `App.tsx` (WP7). The bank itself is implemented (deferred one tick in the TowerScreen unmount, safe under StrictMode), and the Sortie bar says "Leaving the tower banks it." Banking is the player-friendly outcome, since nothing is lost but the streak. The confirm step is requested below.
5. **Level-ups.**
   - Rows are shown for the heroes who fought.
   - The bench, which gets shared XP and so levels up too, is folded into one line with up to 8 mini busts.
   - Otherwise a 30-hero roster made a 30-row card (seen in a real-browser check).
6. **The scout card gained a "⚔ Fight floor N ▸" button**, and the decision zone is scrolled into view instead of the current floor row. Without this, the Doors and scout sat above the fold while the page centred the floor list. The label avoids "Enter", so the smoke test's first-Enter rule is unaffected. The floor's own Enter button is unchanged.
7. **Held Boons are shown in the Sortie bar**, not in "the party window". That window is BattleScene's or the Party screen's, neither of which WP4 owns.
8. **"Summon now!" sits in the results card** (the "Next summon" bar). The always-on tracker version belongs to WP7's GoalTracker.
9. **Gold count-up.** With `goldBefore`, the number counts up to the *real* gold delta of the attempt, so it includes Pent-up Interference, revenge gold and a rout's banked purse share. The breakdown lines then explain the parts. Without `goldBefore` it shows `goldAwarded`. Whether WP3 folds `restedBonus` into `goldAwarded` doesn't matter: the total is right either way.
10. **The summon strings differ from WP7's.** WP7's `frShell` also defines `'Next summon'` and `'Summon now!'`, which would trip the duplicate-key guard. The card therefore says "Toward the next summon" and "Summon now ▸".

## SHARED-FILE REQUESTS (for the lead)

1. **`src/ui/App.tsx` (WP7): confirm before leaving the Tower during a Sortie.**
   - In `Scene`'s `onBack` and in `go()`, while `view === 'tower' && state.tower.sortie !== null`, show an in-page confirm: "Return to campus and bank +{purse}?" with "Bank it" and "Stay".
   - On confirm, dispatch `RETURN_TO_CAMPUS`, then navigate.
   - TowerScreen's unmount bank then finds no Sortie and does nothing, so the two compose safely.
   - *Why:* spec S15 says "Leaving the Tower view with an active Sortie asks for confirmation", and the back button and menu belong to App.
2. **`src/ui/App.tsx` (WP7): an `onGo('lobby')` route** (or a `'lobby'` PlaceId alias) so "Return to campus" can land in the lobby without opening Isel's dialog. It currently uses `onGo('fairy')`. *Why:* a nicer landing; optional.
3. **`src/ui/battle/BattleScene.tsx` (WP2): an end signal.** Either an optional `onEnd?: (outcome: CombatOutcome) => void` prop, fired once when `atEnd` first becomes true, or `data-battle-end={outcome}` on the banner. *Why:* WP4's auto-advance currently keys on the `.battle-banner.win` class. It already also accepts `[data-battle-end="win"]`, so the attribute alone is enough.
4. **i18n duplicate-key watch (lead, at integration).**
   - `frTower.ts` defines these short keys that another module could also add: `Skull`, `Stones`, `XP`, `Safe`, `Fair fight`, `Risky`, `Deadly`, `'{n} floors'`, `'1 floor'`, `'+{n} gold'`, `'+1 Promotion Stone'`, `'+{n} Promotion Stones'`, `'+{n} Sanity'`, `'+1 meal'`, `'+{n} meals'`.
   - **Re-checked in review (2026-10-13) against every branch as it stands now.** WP3's `frClimb` *had* gained `Tutorial`, `Breather`, `Path`, `Elite`, `Cache`, `Boss` and `'A fair fight. Standard rewards.'`, and the duplicate-key guard failed on the WP3 merge. Those seven are the climb's own words, so `frTower` no longer defines them (WP3's French is used: e.g. Tutorial → "Initiation", Boss → "Boss", Cache → "Cache"). Until WP3 lands they read in English under the French locale; `src/ui/tower/i18n.test.ts` allows exactly those seven to be missing. No collision remains with WP1, WP2, WP3, WP5, WP6 or WP7.
   - The earlier collision with WP7's `'Next summon'` and `'Summon now!'` was removed by renaming WP4's strings (deviation 10).
   - Boon names and descriptions are **not** in `frTower`. The UI reads them from WP3's `BOONS` through `t()`.
5. **`src/ui/App.tsx` (WP7) / lead: a trip to the Party screen ends the Sortie.** Today every exit from the Tower view banks the Sortie (S15 "leaving banks it"), and that includes going to the Party or Roster screen to change the line-up between floors, which also drops the Sortie's Boons. With request 1's confirm in place the player at least sees it coming. The lead may prefer that a trip to `party`/`roster` keeps the Sortie running; if so, the bank in TowerScreen's unmount (`TowerScreen.tsx`, the `liveTowerScreens` effect) is the one place to change, and App would need to tell it where it is going.

## Integration check against WP3 and WP2 (2026-10-13)

The finishing pass merged `fun/wp3-climb` (and then `fun/wp2-battle`) into a throwaway branch on top of this one, with both still in progress. It ran WP4's tests there and walked the real game in headless Chromium at 1280×900 and 390×844, through these flows:
- a Boon choice after the F5 boss;
- Isel's Skull tip;
- a Skull clear into a Boon;
- a Cache door;
- Path → Sweep → the results card with the next Doors on it;
- a multi-level-up clear;
- a rout at F48 with the purse share banked.

The throwaway branch was then deleted; nothing from WP2 or WP3 is on this branch.

- **All of WP4's tests pass on the merged engine** after one fixture fix: results fixtures now pin the climb fields (`sortie`, `doors`, `sortieBonus`…), because the real engine starts a Sortie on the very first floor. The F1 test closes the card with "Press on" or "Onward", whichever is offered.
- WP2's own battle tests fail on that merge, because WP3 changed which fights wipe. That is for the lead to settle at integration; it is not a WP4 issue.
- **WP3's semantics match what the UI assumes:**
  - Boon ids are the camelCase keys.
  - A Sortie starts on the first attempt.
  - Any loss other than an ordered retreat banks `keepOnRout` and ends the Sortie.
  - `RETURN_TO_CAMPUS` drops a pending Boon choice.
  - A failed floor re-offers its Doors.
  - Revenge and Cache gold are scaled by the world grade. The UI now scales them the same way.
- Fixes made from what the walk-through showed:
  - the bank-and-summon nudge (S11 and S15 together);
  - the summon offer on Cache and Rest notices;
  - the explicit bank before leaving for the summon screen;
  - the streak line only on a clear;
  - the zero-fallen rout line;
  - a tighter results card, so the Doors fit above the fold;
  - the phone layout of the summon bar;
  - XP grouped by thousands;
  - no repeated "No fight" on Rest and Cache doors.

## Known gaps

- **The test suite is occasionally flaky, and not because of WP4.** One full `npm test` run (out of four) reported 9 "window is not defined" errors from timers firing after teardown: `LobbyWorld.tsx:415` and `kit.tsx:72`, raised from `app.smoke.test.tsx`. Every test still passed, and the next runs were clean. Those timers belong to WP7 and WP0.
- **The climb engine is still WP0 stubs on this branch.**
  - `rollDoors` returns null, `chooseDoor` throws, and `BOONS` is empty. Doors, Boons, Sorties, `routed`, `restedBonus`, `sortieBonus` and `nemesisDefeated` never occur in live play until WP3 and WP5 land.
  - Every one of these UI paths is covered by fixture tests.
  - The App smoke test stands in a minimal `chooseDoor` **only while** the real one throws "not built yet". It becomes inert once WP3 lands.
- **The Sweep's look is WP2's.** WP4 only decides `mode`; until WP2 builds `'highlights'`, a swept fight still plays in full but shows the Sweep chip in the results.
- **Boon text before WP3.** Until `BOONS` is filled, Boon names fall back to a humanised id ("Iron Vow") with no description. WP3's in-progress `BOONS` uses the camelCase ids the icons expect, and its names and descriptions show through `t()`. Their French belongs in `frClimb` (WP3).
- **"Avenged!" revenge gold.** The line shows `round(rewardGoldPerFloor × floor × worldMult)` for each Bane, which matches WP3's in-progress `playFloor`. If WP3 changes that formula, update `ResultsScreen`'s revenge line to match.
- **Rout banking line.** The "Sortie over: X of the purse was saved" line computes `round(keepOnRout × purse)` from the pre-fight Sortie. This matches WP3's `routBank`.
- **Visual verification.** The UI was checked by hand in headless Chromium, at 1280×900 and 390×844, both on this branch and on the merge with WP3 and WP2 (see above). There is no screenshot test in CI.

## Review (independent reviewer, 2026-10-13)

The review read the whole diff, ran probes against the real engine (every floor F1-F100 rendered in English and French; a 19-floor climb through the real TowerScreen with Doors, Boons, Sweeps and the Sortie, on a merge with WP3), re-ran WP4's tests on throwaway merges with WP3 and with WP2, and walked the merged game in headless Chromium at 1280×900 and 390×844 in both locales. Ownership is clean (only owned and new files changed), `src/engine` is untouched, and no UI code under test reads `Math.random`; `Date.now` remains only where the old event code already used it.

**Issues found and fixed**
1. **The WP3 merge failed the duplicate-key guard** (7 keys, see request 4). Fixed by leaving them to `frClimb`. A new `src/ui/tower/i18n.test.ts` checks that every literal `t()` key and display label in the Tower UI has French.
2. **The in-game reduced-motion preference was ignored by most of the new motion.** Only the OS setting stopped the door and Boon card entrances, the notices, the Nemesis pulse and the pulsing summon button. TowerScreen and the results overlay now carry `motion-off` under `prefs.reducedMotion`, and `tower.css` turns all of those off. Test added.
3. **The Door cards' hover lift never worked**: the entrance animation used `fill-mode: both`, so its end-frame `transform: none` overrode `:hover`. It now uses `backwards`.
4. **The Sweep chip could lie.** It said "nobody lost" from the mode chosen before the fight, even when an order given during the highlight turned it into a retreat. It now also requires the final result to be a clean clear. Test added (an order mid-highlight).
5. **Last Stand said "the tower remembers your fallen" when nobody had fallen.** WP3 grants Last Stand to any roster of 3 or fewer from F3, so a new player saw it on their first floors. The scout and "Because…" lines now say it is for a thin roster.
6. **"1 charges left"** under Pent-up Interference; now "1 charge left" / "no charges left".
7. **The Rest stop's meal was not mentioned** in its notice; now "+1 meal" (from the pantry diff). Test added.
8. **Two fighters with the same first name** (a 100-hero roster has several) showed as two identical "Lio Lv 6→7" rows; colliding names now show in full. Test added.
9. **A waiting Boon was announced twice** on the results card (the event line and the teaser); now once. Test added.
10. Notice keys use a counter instead of `Date.now()`.
11. **The Sweep tests assumed F3 scouts Safe**, which is false on WP3's budgets (3 tests failed on the merge). The fixture now searches for a Safe floor and falls back to the Breather after a guardian.

**Checked and fine**
- The auto-advance still keys on `.battle-banner.win`, which WP2's branch keeps; WP2's highlight reel calls `onDone` itself, and `combatDone` is idempotent, so the two compose.
- WP3's `sortieAfterFloor`, `returnToCampus`, `chooseDoor` and `kindForFloor` match the UI's assumptions (ordered retreats keep the Sortie; any other loss banks `keepOnRout`; `tower.kind` is set to `doors[0]` while Doors are pending, so the Sweep reads the right kind).
- No new button text matches a smoke-test trigger word; the first Enter stays disabled while any event (Boon included) is open; nothing dispatches between the attempt and the end of the battle.
- On the WP3 merge: all 66 test files pass (1,068 tests). On the WP2 merge: all UI tests pass.

**Remaining concerns**
- Leaving the Tower ends the Sortie without a confirm, and that includes a trip to the Party screen (requests 1 and 5).
- Under the French locale, numbers keep the browser's default grouping ("9,600"); the whole game formats numbers that way.
- An Elite floor that scouts Safe is Sweep-eligible (the spec's rule is "Breather or Safe"). The lead may want the Skull fight always played in full.
- Before WP3 lands, the floor-kind names read in English under the French locale (request 4).
- There is still no screenshot test in CI.

