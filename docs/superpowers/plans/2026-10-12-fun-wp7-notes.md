# WP7: Shell, focus and clarity (S3, S4, S5 copy): notes

> **Branch:** `fun/wp7-shell` (based on `3b2ce0a`, the WP0 foundation) · **Spec:** `docs/superpowers/specs/2026-10-12-fun-and-return-design.md` §3 S3/S4/S5, §4.8
> **Gates:** `npm run typecheck` clean · `npm test` 55 files / 949 tests after review (887 at base + 62 new), no unhandled errors · `npm run build` OK (only the existing chunk-size warning)
>
> **History:** started by one session (commit `94b9d15`, cut off by a session limit), finished and reviewed by a second one (the commits after it). The second session's changes are listed under "Finishing pass" below.

## What the player gets

**S3: a progressive campus.**
- The **Menu** is grouped:
  - **Now:** four big tiles (Tower Gate, Mobius Summon, Party, Roster).
  - **Campus:** the facilities already open.
  - **Next unlock:** one dashed tile showing the condition and a progress bar ("Kitchen · Clear Floor 1 · 0/1"), with what opens alongside it on a line underneath ("Also: Memorial, Daily Dungeon").
  - **Later:** a dense, dimmed grid. Each tile shows its short gate ("🔒 Floor 10", "🔒 Master Lv 20"). The full condition ("Clear Floor 5, or when a hero grieves") is in the tooltip, the accessible name and the preview ribbon. The whole Menu, footer included, fits on a 1280×800 screen.
  - Every place is still a `button.menu-item` and still opens its window.
- **Locked places open as a preview.** The window opens with a gold ribbon at the top: "🔒 Preview · Clear Floor 10 (0/10)" (Master Level gates show their progress too), plus a line from Isel. The panel underneath is the real one and still works.
- **The walkable lobby:**
  - Each locked place has a pixel-art boarded sign (planks, a gold padlock, a post). It stands outside the building's door, beside the doorway, or next to an outdoor place's prop.
  - The E-prompt reads "🔒 Kitchen".
- **The "New facility!" fanfare:**
  - When a place opens, a full-screen card appears in the lobby as soon as the Master is free (no window, dialog or letter open in the lobby, and neither the app Menu nor a battle replay over it).
  - The card shows rotating rays, twinkling sparkles placed by a hash of the place name, the building's own prop sprite drawn at 4×, the place name, and one sentence from Isel about what it is for (20 hand-written lines).
  - Places that opened at the same moment are listed under "Also open: …".
  - The `sfx('unlock')` sting plays.
  - **Show me** (gold, focused): the Master walks to the building, and its window opens on arrival. A long walk is cut to the last 12 tiles, about 2 s.
  - **Later** or Esc closes the card.
  - The card dispatches `SEE_UNLOCK` for every place it shows as soon as it opens, so it plays once per place.
  - **The Memorial can open with the first death.** It gets a quiet version instead: "A place to remember", no rays or sparkles, no sting.
  - Reduced motion (OS setting or `prefs.reducedMotion`) turns the animations off.
- **Isel's tip** in the lobby now says "Clear Floor N and I will open the X for you." when a place opens with the next clear. `iselLines(fresh)` is unchanged.

**S4: the goal tracker ("Next up").** It replaces the FirstSteps panel in the lobby HUD. Every line can be clicked to go there.
- **Short:**
  - While onboarding is on a core-loop step (first summon, party, Floor 1): that step, with a 0/6 bar.
  - After Floor 1 the short line is the next floor again, even if side steps remain. The next side step (talk to a hero, give a job, build) rides underneath as its own clickable line, and the full checklist folds out under "First steps n/6". A job request replaces the "give a hero a job" step when there is one.
  - After that: "Floor 7 · a fair fight" (coloured by threat) with a reward line. Examples: "Reward: ◆ gold and Master XP", the boss/bonus room, Elite, Rest, Cache, "Pent-up Interference: ◆ ×2 (3 left)", "Mira's Bane waits here".
  - Special cases: "Set your party", "Your party needs rest", "Summon new heroes", "Floor N: an event awaits", "Floor N: choose your door".
- **Medium:** picked on a goal gradient, in this order:
  1. a New Arrival token or an Echo waiting for an heir (both go to the Memorial);
  2. a facility 2 floors away or less ("Promotion Chamber opens at Floor 7", bar 5/7);
  3. a boss 2 floors away or less;
  4. "Next summon 2,100/3,000" when the Master cannot afford a summon;
  5. the next unlock at any distance;
  6. the soonest timer ("Kael's drill ends in 1h30");
  7. the next boss.
- **Long:** "Act I — The Prairie" with a bar of floors cleared in the act, and "Collection n/42".
  - The collection is the class × element pairs the Master has met, fallen heroes included. The first pull counts, which gives endowed progress.
- **CTA:** a gold **Summon now!** chip in the tracker header whenever a Normal summon is affordable, with "You can afford 5 heroes". This is the fix for gold left unspent. It waits until the free first summon is taken (or the guide is dismissed), so it never says "you can afford 5" next to "Take your first summon".
- **Hero request:** one line, chosen in this order:
  - a hero at the level cap: "Kael: “Promote me!”";
  - grief of 40 or more: "Mira is grieving: visit the Memorial";
  - an idle hero who likes an open job that has a free seat, at a place the campus has opened: "Assign Talen to the Kitchen". This one opens the hero's profile.
- Folding the tracker remembers the choice per viewer (`localStorage`, wrapped in try/catch). Phones start folded down to the short line plus the CTA. On phones the tracker sits under the Master's card, clear of the action bar and the E-prompt.
- **Scene bar:**
  - The tower, summon, party and roster scenes carry one or two compact chips after the Menu button: the CTA, then the short or medium goal.
  - Goals that point at the scene already shown are skipped.
  - A chip only navigates. It never dispatches, so it is safe over the Tower view's `revise`.

**S5: coaching copy.** `lines.ts` exports `ISEL_COACH` and `iselCoach('decisive' | 'doors')`, with French:
- decisive: "Your orders change fate. Try Protect.";
- doors: the skull-door explanation.

**Shell:**
- **Backup:** the Menu footer has a **💾 Backup…** button. It closes the Menu and dispatches `window.dispatchEvent(new CustomEvent('pmu:backup'))`, which WP6's ReturnLayer listens for.
- **Broken save:** `App` uses a new `continuableSave()`. It returns false when the stored save is byte-identical to the copy `useGame` set aside under `pmu.save.v1.broken`. A save that fails to load therefore boots to a title screen with **Begin** and no dead **Continue**. A new game overwrites the main key, and the broken copy stays where it is.

## Files

**Changed (all owned by WP7):**
- `src/ui/App.tsx`: grouped GameMenu with MenuTile; Backup…; the Scene-bar tracker; `continuableSave()`; passes `paused` (Menu or replay open) to the lobby.
- `src/ui/world/LobbyWorld.tsx`: GoalTracker replaces FirstSteps; the fanfare queue and `SEE_UNLOCK`; `showPlace` and `followGoal`; lock signs; the 🔒 E-prompt; `MENU_PLACES` now comes from `shell/unlocks`; new optional prop `paused` holds the fanfare.
- `src/ui/world/lines.ts`: the unlock tip, `ISEL_COACH` and `iselCoach`.
- `src/ui/life/FirstSteps.tsx`: each step gets a `target`; the old `FirstSteps` panel becomes `FirstStepsList`, embedded in the tracker.
- `src/ui/facilityPanels.tsx`: `PlacePanel` mounts `<PlacePreview>` (one import, one line).
- `src/ui/i18n/frShell.ts`: about 105 French strings.

**New:**
- `src/ui/shell/unlocks.ts`: `placeAccess`, `unlockCondition`, `shortCondition`, `lockedPlaces`, `nextUnlock`, `unseenUnlocks`, `menuGroups`, `unlockLine`, `CORE_PLACES`, `MENU_ORDER`. It wraps WP0's frozen `engine/unlocks.ts`.
- `src/ui/shell/goals.ts`: `nextGoals(state, nowWorld)`, `heroRequest`, `collectionCount`, `formatEta`, `placeOfFacility`.
- `src/ui/shell/GoalTracker.tsx`, `UnlockBanner.tsx`, `PlacePreview.tsx`.
- `src/ui/shell/lockSign.ts`: the sign bitmap and its placement.
- `src/ui/shell/shell.css`.
- Tests: `src/ui/shell/unlocks.test.ts` (14), `goals.test.ts` (24), `shell.test.ts` (6), `shell.smoke.test.tsx` (16).

**Test hygiene (owned file):**
- `app.smoke.test.tsx`: one `afterEach` that unmounts each test's App. **No test body changed**; all 20 tests pass.
  - Why: the file never unmounted, so a lobby left mounted kept Isel's typewriter timer (`DialogBox`, `kit.tsx`) running past jsdom teardown. Under load (e.g. running beside `shell.smoke.test.tsx`), a timer firing after teardown fails the whole `vitest run` with an unhandled "window is not defined", although every test passes. It reproduced in about 1 run in 3; with the hook, 0 in 10.
- `world.test.ts` is unedited and passes. No engine file changed.

## Tests added (60)

- **`placeAccess`:**
  - matches `TUNING.unlocks` and `isPlaceOpen` for every place at F0–F21;
  - covers conditions, progress, and events opening places early;
  - menu groups list every place exactly once at every stage;
  - `nextUnlock` ordering: floor gates first, then the Master Level gate, then null;
  - `SEE_UNLOCK` makes the fanfare fire once per place;
  - the arrival and backfill cases;
  - Isel has a distinct line for every place;
  - `shortCondition` gives the main gate alone for every scheduled place.
- **`nextGoals`:**
  - fresh, F6 and F21 fixtures for short, medium and long;
  - boss and skull lines, events and doors, no party / rest / no heroes, rested charges;
  - "Summon now!" exactly when gold ≥ cost, and not before the free first summon is taken (or the guide dismissed);
  - onboarding leads only through the core loop, and side steps never hide the next floor;
  - a job request stands in for the "give a hero a job" step;
  - no job request for a place the campus has not opened;
  - the summon progress bar;
  - legacy tokens and echoes;
  - timers and `formatEta`;
  - all three hero requests;
  - the collection, fallen heroes included;
  - purity (deep-frozen input) and determinism;
  - no goal text contains a string the smoke tests click by, in EN or FR;
  - the French output.
- **Lock sign and other static checks:**
  - sign sprite size and silhouette;
  - every sign stays on the map, off doors, outside its building and near its door;
  - sparkle positions are deterministic;
  - every literal `t()` key in the shell, App and FirstSteps, and every translated table, has a French entry;
  - `iselCoach` returns the right line in both languages.
- **Smoke tests** (real App in jsdom):
  - every menu item names its own place and no other (EN and FR, five stages);
  - a broken save boots to a title with no Continue;
  - `continuableSave` cases;
  - a fresh Menu shows 4 "Now" items, the Kitchen as the next unlock with 0/1, 19 Later tiles and 24 menu items;
  - a locked place shows the preview ribbon over the real panel;
  - the Campus group lists open places, which have no ribbon;
  - Backup fires `pmu:backup` and closes the Menu;
  - the French Menu groups;
  - no fanfare for a fresh account;
  - a real `ATTEMPT_FLOOR` on F1 shows the Kitchen fanfare once, with "Also open", records `life.unlocks`, and does not show it again after a TICK;
  - the quiet Memorial card;
  - Show me closes the card;
  - the fanfare waits for Isel's greeting to close;
  - the tracker content in the lobby (no "Summon now!" until the free pull, then it lights), and clicking a goal travels there;
  - the scene-bar chips come after Menu, contain no "Enter", skip the current scene, and travel without dispatching.

## Finishing pass (second session)

Found by playing the build in a real browser (Playwright + Chromium, desktop 1280×800 and phone 390×844, EN and FR) and by printing the goal stack across a simulated climb:
- **Onboarding hid the tower.** After Floor 1 the short line said "Talk to one of your heroes" for the rest of onboarding, so "what next?" stopped saying "climb". Now only the core-loop steps take the short line; side steps get their own line underneath.
- **"Summon now! · You can afford 5 heroes"** sat next to "Take your first summon" (which is free). The CTA now waits for that pull.
- **"Assign Ivo to the Kitchen" before the Kitchen opened.** Job requests now require the place to be open.
- **"and 2 more"** said nothing; it now names the places ("Also: Memorial, Daily Dungeon").
- **The Menu pushed its own footer off screen** once a Campus group appeared (Sound, Language, Backup, New game needed a scroll at 1280×800). Later is now a dense grid with short gates.
- **A real smoke regression, caught before commit:** an "Also: …" line inside the Next tile made `openPlace('Daily Dungeon')` click the Kitchen tile (the smoke helper takes the first menu-item whose text includes the name). The line now sits outside the button, and a new guard test checks that no menu item names another place, in EN and FR, at five stages.
- **The fanfare could pop over the app Menu** (an event unlock such as first grief, during a TICK). LobbyWorld now takes `paused` from App.
- **On phones** the tracker sat on top of the E-prompt; it now sits under the Master's card.
- **Master Level progress** now shows on the Crack of Time preview ribbon.
- **Deflaked `npm test`** (see Test hygiene above).

## Deviations from the spec, and why

- **The Menu has a "Campus" group.** The spec lists Now, Next and Later only, and leaves out where facilities go once they open. Now stays the four core doors, and open facilities go under Campus.
- **"Summon now!" is a chip in the tracker header, not the medium line.** If it occupied the medium line, any Master with spare gold would never see the gradient goals (next unlock, boss). As a chip, both are visible at a glance.
- **The fanfare is recorded as seen when it opens, not when it is dismissed.** This guarantees it plays once even if the tab closes mid-card. It only triggers in the lobby, never in the Tower view.
- **Several places opening at once share one card** (the first is featured, the rest are "Also open"). Three back-to-back cards after F1 would be a chore.
- **The Memorial gets a quiet card.** Its opening event is the first death; confetti there would be wrong.
- **"Show me" shortens long walks.** The Master appears 12 tiles out and walks in, so the player sees the way without a 6 s wait.
- **Lobby darkness is unchanged.** Unbuilt rooms are still darkened as before. Schedule-locked places only get the sign: the life sim still uses the Kitchen, the yard and the Memorial before they open, and the party board sits inside the Tactical Center.
- **The hero grief request uses a threshold.** It fires at `GRIEF_REQUEST_AT = 40` and points at the Memorial, as S4 says. 40 is a UI choice, not a TUNING key.
- **The collection** is "class × element pairs met, 6 × 7 = 42". The spec's "Collection 14/40" had no definition, and this is the closest honest, state-derived reading.
- **Onboarding owns the short line only for the core loop.** S4 says FirstSteps "keeps running inside" the tracker until onboarding is complete. It still does (side line plus fold-out checklist), but "talk to a hero" or "build something" no longer replaces the next floor as the one thing to do.
- **Later tiles show the short gate** ("🔒 Floor 7") rather than the full condition, so 19 locked places plus the footer fit on one screen. The full condition is one hover or one click away (tooltip, accessible name, preview ribbon).
- **`app.smoke.test.tsx` gained an `afterEach` unmount** (no test body touched) to remove an intermittent unhandled-error failure of `npm test`. See Test hygiene.
- **The tower's threat words** use goal-specific keys ("Floor {n} · a fair fight") rather than bare `'Safe'`/`'Fair'`. This avoids colliding with the FR keys WP4 is likely to add for the Tower's own threat labels.

## SHARED-FILE REQUESTS

1. **`src/ui/ui.css` (WP8):** `.hud-guide`, `.guide-head` and `.guide-hint` are now unused.
   - The tracker uses `.hud-goals` from `shell/shell.css`.
   - `.guide-list` is still used inside the folded-out checklist.
   - WP8 may delete the three dead rules.
2. **WP2 (BattleScene / DecisiveMoment) and WP4 (DoorPicker):**
   - Show Isel's coaching through `iselCoach('decisive')` and `iselCoach('doors')` from `src/ui/world/lines.ts`.
   - **Do not** add `'Your orders change fate. Try Protect.'` or the doors line to `frBattle`/`frTower`: they are already in `frShell`, and the duplicate-key guard would fail.
3. **WP6 (ReturnLayer):**
   - Listen for the `pmu:backup` window event (the contract in §4.8).
   - Ordering note: WelcomeBack is mounted at App level. The unlock card waits for the lobby's own windows and for App's `paused` (Menu open or battle replay), but it cannot see ReturnLayer. If a return ceremony and an unlock can coincide on arrival, the integration pass should OR ReturnLayer's "ceremony open" state into the `paused` prop App passes to `LobbyWorld` (one expression in `App.tsx`, owned by WP7, so no shared file is involved). Until then they would stack, with the unlock card (z-index 75) on top.
4. **WP1 (TitleScreen):** a broken save now arrives with `hasSave=false`.
   - The title can tell the player by checking `localStorage['pmu.save.v1.broken']` (`BROKEN_SAVE_KEY` from `useGame`), e.g. "Your old save could not be read; a copy was kept."
   - No TitleScreen prop change is needed.

## Known gaps

- **No fanfare outside the lobby.** Unlocks earned in the Tower show when the Master returns to the lobby. That is deliberate (no dispatch in the Tower view), but it means a card can appear late, e.g. after the Letter is read.
- **Placeholder rewards.** The short line's reward text reads `tower.kind` and `floorKindBase`. It will pick up WP3's Doors/Elite/Rest/Cache once they are built; until then every non-boss floor reads as gold.
- **Medium-line goals that depend on other packages** (New Arrival, Echo, Nemesis on the short line) only appear once WP5 and WP3 fill the `life.legacy` data and `ScoutReport.nemesis`.
- **Mid-session events and the tracker.** The scene-bar tracker uses a `useMemo` on state. In scenes the state rarely changes, so timer ETAs there can be up to one dispatch stale (no timer chips appear in the bar today).
- **Pre-existing issue, not WP7's:** `?seed=` demo accounts are created with `now: 0` and grey out on the first lobby TICK. WP6's no-deletion change fixes this.
- **Two gates on some previews.** A schedule-locked place whose building also has a Master Level build gate shows both: the ribbon says "Preview · Clear Floor 10" while the panel's existing build row says "Unlocks at Master Lv 5". Both are true (the panel works in preview, as S3 requires). Rewording the build row (e.g. "Build at Master Lv 5") would read better, but `app.smoke.test.tsx` asserts the exact text "Unlocks at Master Lv 3", so it stays until the lead decides to change that assertion.
- **Pre-existing, `ui.css` (WP8):** at 390 px wide the lobby's bottom action bar (`.hud-tr`) is wider than the screen and clips "Daily" on the left.
- **The lock sign is drawn before the y-sorted pass**, so characters walk in front of it. A Great Hall sign is hidden under the hall roof while the Master is outside, as the interior is.

## Review (independent reviewer, 2026-10-13)

**Method:** read the full diff against `3b2ce0a` and every new file; ran `nextGoals`, `menuGroups`, `placeAccess`, `nextUnlock`, `unseenUnlocks` and `iselLines` over 212 real states from the balance sim (casual/engaged/whale, 25 days, up to F79, both locales: no throw, no `undefined`/`NaN`/raw `{placeholder}`); extracted every `t()`/`tr()` key added in the diff and checked it against `FR` (all present; placeholders identical; French spacing before `? ! :` respected); played the build in Chromium at 1280×800 and 390×844 (fresh Menu, Crack of Time preview, an F2 arrival fanfare, a late F22 save in EN and FR, the tower/summon/roster scene bars). Ownership: every edited file is on §4.8's Owned/New list; no engine file changed; no `Math.random`/`Date.now` in the shell outside the tracker's timer clock.

**Issues found and fixed:**
- **The free ten-pull was invisible to anyone not on the "first summon" step.** `tutorialPullAvailable` stays true for a veteran save (or a dismissed guide) whose six-plus heroes tick the step, so the tracker said "Summon now! · You can afford 5 heroes" (or showed a gold bar toward a summon) while the next ten-pull was free. The chip now reads **"Free summon!" · "The crystal owes you ten heroes"** whenever the free pull is on offer and it is not already the short goal (whatever the gold), and the "Next summon" bar is skipped meanwhile. Tests: the veteran case, and the dismissed-guide case now asserts the free text. The `at(f)` fixture in `goals.test.ts` and one smoke fixture now mark the pull as taken (an F3+ Master has taken it).
- **Scene-bar chips clipped their counter** ("Crack of Time opens at Master Lv 20 1|"): the chip is `inline-flex`, so `text-overflow` never applied. The text is now its own ellipsized span and the counter never shrinks.
- **The CTA glow ignored the in-game reduced-motion preference** (only the OS media query stopped it). It now takes `prefs.reducedMotion` too.
- **"Build something new" always sent the Master to the Tavern**, a schedule-locked preview at F1 and even after the Tavern was built. It now targets the first unbuilt building the campus has opened (Tavern, Garden, Forge → armory, …), falling back to the Tavern before any is open. Test added.
- **Two conditional tests asserted whichever branch the seed happened to take** (job request vs. generic step; idle-hero job request). Seed 21 always takes the meaningful branch, so they now assert it outright, check the hero id, and the "locked place" test proves the engine would seat a cook (so the campus gate is what holds the request back) and that the request appears one floor later.

**Checked, no change needed:** fanfare only on a change in the open set (fresh accounts and the v11 backfill are silent; `SEE_UNLOCK` on open); the card waits for lobby windows, dialogs, the letter, the Menu and the replay; Escape/Enter on the card never leak into the lobby's key handler (modal guard); scene-bar chips never dispatch and never contain "Enter"/"Menu"; `continuableSave`; the `app.smoke` teardown hook (double `unmount` is a no-op in React 18); loop floors (act bar uses `highestCleared`, so a F40→F31 fallback reads 5/5 Act IV), world end, no living heroes, empty or dead party.

**Remaining concerns (for the lead):**
- **Other packages' smoke tests and the arrival fanfare.** A v11 save built with `createAccount` and a raised `highestCleared` has `life.unlocks: []`, so mounting the lobby on it shows the card (by design: "on arrival for saves whose `life.unlocks` is missing an open place"). Its buttons ("Later", "Show me ▸") come last in DOM order, so `clickButton` helpers are safe, but a new smoke test that asserts "no dialog" after loading such a save should seed `life.unlocks: openScheduledPlaces(s)`.
- **"Free summon!" and other packages:** if WP1 retires or changes `tutorialPullAvailable`, the CTA follows it automatically; no shared file involved.
- **`app.smoke.test.tsx` gained an `afterEach`** (no test body changed). §4.8 says the file must pass "unchanged"; the lead should confirm the hook is acceptable (it removes a real ~1-in-3 flake).
- The implementer's known gaps stand (Tower-earned unlocks show on return; placeholder rewards until WP3; two gates on some previews; the sign drawn under walkers; the Crack's "or when the Crack opens" alternative reads circular inside its own panel).

**Gates after review:** `npm run typecheck` clean · `npm test` 55 files / 949 tests passed (947 + the veteran free-pull test and the build-target test), no unhandled errors · `npm run build` OK (existing chunk-size warning only).
