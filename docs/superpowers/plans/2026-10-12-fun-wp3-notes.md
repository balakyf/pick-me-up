# WP3: Climb engine, implementation notes

> **Status:** Done. Ready for the lead's review and integration. · **Date:** 2026-10-13 · **Branch:** `fun/wp3-climb` (on top of WP0 `3b2ce0a`)
> **Spec:** `docs/superpowers/specs/2026-10-12-fun-and-return-design.md` §4.4 (S12 engine, S13, S14, S15, S19, S20, S22 injection, S23 lessons read, S24 consumption)
> **Gates:** `npm run typecheck`, `npm test` (56 files, 969 tests) and `npm run build` all pass (after the review below).

## What the player gets

- **Doors (S13).**
  - From F3, every clear offers two Doors for the next floor. The first is always a fight the party was going to have anyway: Path, or a Breather right after a boss.
  - The second Door is usually the **Skull** (Elite: about 1.45× the Path, double gold, a guaranteed Promotion Stone and a Boon choice). Before a boss it can be a **Rest stop** (50%): no fight, +30 Sanity for the party and a cooked meal. Otherwise it can be a **Cache** (15%): no fight, gold and a stone.
  - Rest and Cache resolve on `CHOOSE_DOOR`. They advance the floor and set `highestCleared`, so the climb cannot softlock. They pay only their own reward: no Master XP, PI or floor gold.
  - Pressing Enter without choosing fights `doors[0]`, so bots, tests and old flows never block.
  - A lost floor offers the same Doors again (same RNG stream), so a Skull that beat you can be swapped for the Path.
- **A sawtooth climb with a mercy director (S13).**
  - Path floors are lifted over the old curve early on, and each Path floor asks at most +12% more than the one before.
  - Bosses (every 5th floor, plus F41/F42) are now scaled to their budget at every depth, both up and down. Each enemy keeps its authored waves, count, level and keywords. The scaler clamps at 30 elite steps down.
  - The director only ever lowers a budget: `min(static, rosterCp × mercyBand)`. A weak or shrunken roster gets relief automatically. A strong roster sees the static curve, and its higher-risk option is the Skull door.
  - F1-F2 are unchanged.
- **An honest scout (S12).**
  - The ratio is the party's real battle units (Sanity, favour, gear, passives, Last Stand, the Memorial and the Sortie's Boons) over the CP of the encounter actually built for this attempt: the kind, the chosen Door, the mercy cap and any Nemesis. Looming units are left out.
  - The report names one or two threats, each with a reason and an estimated opening blow on the front line. Examples: "Bone Choir ×3 / heals itself with every blow"; "Versace / very fast: acts far more often than its strength suggests".
  - It also shows the floor Kind, the rout threshold (`null` when the party is too small to rout, so it can still be wiped), Last Stand %, whether the director capped the floor, and any waiting Nemesis.
- **Rout (S19).** On tower floors the survivors flee once N heroes have fallen and the fight is being lost, meaning the party's HP is below that of the living, non-looming enemies in the current wave. N is 2 on Path and Elite, 1 on a Breather and 3 on a Boss. The battle log shows "The line breaks! The party retreats." The outcome is `retreat`, nothing is won, and `FloorResult.routed` is set. Dailies, PvP and hand-built fights never rout.
- **Last Stand (S20).** With 3, 2 or 1 heroes still standing on the roster (alive, not captive, not broken; heroes away training or on an expedition still stand, see Review), the party fights with +10%, +15% or +20% to every stat from F3. `FloorResult.lastStandPct` and `ScoutReport.lastStandPct` carry the value.
- **Boons (S14).**
  - After an Elite clear or a Boss clear, the player picks 1 of 3 Boons for the current Sortie (at most 4 held).
  - A Boss's first clear opens its bonus event first, and the Boon choice follows when the bonus is resolved.
  - The twelve Boons:
    - Iron Vow, Hunter's Mark and Second Wind: battle effects, with no RNG draws.
    - Quartermaster: +1 order per battle.
    - War Chest: +25% floor gold. Scholar's Lamp: +25% floor XP.
    - Shieldwall, Volley and Arcane Tide: class stat bonuses.
    - Sanctuary: see Deviations.
    - Underdog: 1-2★ heroes get +12% to every stat.
    - Calm Mind: −40% Sanity drain.
- **Sorties (S15).**
  - A Sortie starts with the first floor attempted from campus.
  - Each consecutive clear adds a streak bonus to the Purse: +10% of that floor's gold per floor in the streak, capped at +50%. Base floor gold is still paid at once.
  - `RETURN_TO_CAMPUS` banks the whole Purse and ends the Sortie and its Boons. It also drops an open Boon choice.
  - A rout, a wipe or any other lost fight banks 50% of the Purse and ends the Sortie.
  - A retreat the Master ordered is a choice, not a collapse, so the Sortie carries on.
- **Nemesis injection (S22).** A Nemesis waiting in `life.legacy.nemeses` for this floor (or for an earlier floor the climb got past without killing it, see Review) joins the first wave as a named ×1.25 revenant ("Mira's Bane"), never on an anchor floor. It is skipped when its template is unknown, and its CP comes out of the filler budget. Felling it on a clear pays revenge gold (150 × floor × worldMult) and a stone, sets `status: 'avenged'` under `life` (fresh objects), and fills `FloorResult.nemesisDefeated`. The scout puts it first.
- **Lessons (S23 read).** A family listed in `life.legacy.lessons` shows its weakness in the scout even on an unstudied floor (`ScoutedEnemy.lesson`).
- **Pent-up Interference (S24 consumption).** One rested charge doubles one clear's floor gold, through `consumeRested` in `playFloor`. The bonus is reported as `FloorResult.restedBonus`, and a lost floor spends no charge.
- **Memorial plaques (S23).** `legacyPct(state)` (the WP5 stub, 0 for now) is added to Last Stand and passed to `buildCombatUnit` as `extraPct`, in battle and in the scout.

### The `tower.kind` default (decided)
`tower.kind` is set every time the tower's position changes:
- **When a floor is played** (an advance, a retry, the F40 loop rollback): `playFloor` → `withFloorDoors`. It rolls the Doors for the floor now current and sets `kind = doors[0].kind`, or `floorKindBase(currentFloor)` when no Doors are offered.
- **When a Rest or Cache Door is chosen:** the same `withFloorDoors` call runs for the next floor.
- **When a fight Door is chosen:** `CHOOSE_DOOR` sets `kind` to that Door's kind and clears `doors`.

The kind a floor is actually fought as comes from `kindForFloor(state, f)`. Tutorial floors and anchors are fixed. Only the current floor takes `tower.kind`, and only when it is Path, Elite or Breather; anything else counts as Path. This makes migrated v10 saves (whose `kind` defaults to `'path'`) safe: until their next clear they are offered no Doors and fight their floor's base kind.

## Balance: what I measured and the values I changed

The probe ran the sim bots (casual and engaged, 10 or 20 seeds each, new account to F25), with the scout report taken before each attempt.

| Metric (F1-F25) | Target | Measured: test seeds (20 runs) | Measured: 40 runs |
|---|---|---|---|
| Attempts with deaths on floors scouted Safe | 0 | 0 of 66 | 0 of 127 |
| Fair attempts with a death | ≤ 5% | 3.9% | 3.8% |
| Losses that are full wipes | ≤ 10% | 0 of 2 (both routs) | 0 of 5 |
| First clears from F2 offering 2 Doors (next floor not a boss) | all | all | all |
| Path budget step | ≤ +12% | ≤ +12% by construction (tested at every world grade) | n/a |
| Median Path ratio, F3-F14 | 1.2-1.5 | F3-5 1.43 · F6-9 1.45 · F10-14 1.50 | n/a |
| F1-F2 | unchanged | identical encounters (tested) | n/a |
| Lone Islat Han clears F1 | yes | yes (16 seeds tested) | n/a |

**Why the lever is an early Path lift, not `tower.earlyBudgetBoost`.** (After the review the lift lives in `CLIMB_TUNE.earlyLift` in `src/engine/climb/tune.ts`, and `climb.kindMult` keeps its WP0 values and meaning; see Review.)
- The spec asked for `earlyBudgetBoost` to be re-tuned so that Path ratios sit at 1.2-1.5. Today's curve gives a median roster 2.2-2.9 on F6-F14, so the early budget needs about ×2.3.
- That is impossible without breaking a hard rule: **an `earlyBudgetBoost` above ~4.2 makes `floorPower` non-monotone near F69**. The condition is 1.06 × boost(f+1) > boost(f), which holds only while b < 70 × 0.06. Raising it would also change F1-F2 and make every Daily harder, because dailies fill to `floorPower`.
- So `earlyBudgetBoost` stays at **4** and `floorPower` is untouched. Instead, `kindMult.path` is now the **Path lift at the foot of the tower**. In `climb/kinds.ts` it fades quadratically to ×1 at `tower.inflectionFloor` (F70), the same window `earlyBudgetBoost` tapers over. The lift is about ×2.3 at F3, ×1.7 at F20, ×1.3 at F40 and ×1 from F70.
- The other kinds ask `kindMult[kind] / kindMult.path` times the Path curve, which keeps the spec's ratios: Elite 1.45×, Breather 0.6×, Boss 1.0×.
- The late tower (F70-F100), tuned by the 2026-09-29 balance pass, is unchanged.
- I rejected a uniform multiplier (the partial work's ×1.85 on every kind). It made F70-F100 1.85× harder for strong late players, put 100% of the bots' F40+ floors under the mercy cap, and broke the summit test.

**Values changed.** The implementation first wrote these into `src/engine/tuning.ts`; the review moved them to `src/engine/climb/tune.ts` (`tuning.ts` is WP0-only) and restored `kindMult` to WP0's values, so the lift is `CLIMB_TUNE.earlyLift = 2.42` and Elite/Breather/Boss are exactly 1.45/0.6/1.0x Path. The table below is the original, equivalent form:

| Key | WP0 | Now | Why |
|---|---|---|---|
| `climb.kindMult.path` | 1.0 | **2.42** | The early Path lift (see above). |
| `climb.kindMult.elite` | 1.45 | **3.5** | Keeps Elite at 1.45× Path. |
| `climb.kindMult.breather` | 0.6 | **1.45** | Keeps Breather at 0.6× Path. |
| `climb.kindMult.boss` | 1.0 | **2.42** | Keeps Boss at 1.0× Path. |
| `climb.kindMult.tutorial` | 1.0 | 1.0 | Unchanged. Tutorial floors take no lift. |
| `climb.mercyBand.path` | 0.8 | **0.72** | Guarantees a Path ratio of at least ~1.39 for a weak roster. At 0.8 (ratio ≥1.25), Fair floors killed in 5.3-6% of attempts. |
| `climb.mercyBand.elite` | 1.0 | **0.9** | A weak roster's Skull is Risky (~1.1), not a coin flip. |
| `climb.mercyBand.boss` | 0.95 | **0.85** | Bosses stay the sawtooth's peak (~1.18, Risky) without a cliff. |
| `tower.earlyBudgetBoost` | 4 | 4 | Unchanged. It cannot rise (monotonicity). |

(The JSDoc rewrite of `climb.kindMult` was reverted with the rest of `tuning.ts`.)

**Pace** (casual and engaged, 6 seeds, 14 days; WP0 → now):
- Casual: F12 → F10 on day 1, F23-24 → F21-22 by day 3. By day 14, F40-55 → F40-81.
- Engaged: F22-32 → F23-26 on day 1. By day 14, F40-71 → F40-85.
- Deaths per profile over the 14 days: casual 58 → 40, engaged 210 → 133.
- 5/5 wipes: casual 9 → 1, engaged 30 → 1.
- The early floors are now a real fight, and losses are routs instead of wipes.

## Files

**Changed (owned):**
- `src/engine/tower/tower.ts`: kinds and budgets in `buildEncounter`; the anchor scaler at every depth with a clamp; the Nemesis revenant; rout and kind on the encounter; Last Stand, plaques and Boons on the units; Elite rewards; rested gold; Doors in step 6; the Sortie and the Boon event in step 6g; `ordersAllowed` with Quartermaster.
- `src/engine/combat/combat.ts`: `BattleMods` (Iron Vow, Hunter's Mark, Second Wind), the rout check in `evaluateState`, `ROUT_NOTE` and `SECOND_WIND_NOTE`.
- `src/engine/scout/scout.ts`: the honest ratio, `namedThreats`, `scoutUnits`, lessons, and the new report fields.
- `src/engine/events/events.ts`: the `boon` event, chained after a Boss's bonus event.
- `src/engine/climb/{kinds,doors,boons,sortie}.ts`.
- `src/sim/sim.ts`: the bots take the Skull door at Path ratio ≥1.6, take the first Boon, go home when average Sanity is below 45, and claim recruit tokens. The attempt hook now passes the scout report, and there is an `untilFloor` option. Bots judge "stronger" by party CP as well as by ratio, because the director holds a weak party's ratio steady.
- `src/ui/i18n/frClimb.ts`: 62 strings covering kinds, Doors, Boons, refusals, battle notes and threat reasons.
- ~~`src/engine/tuning.ts`~~: reverted in review; the values are in `src/engine/climb/tune.ts` (new) until the lead folds them in.

**New:**
- `src/engine/tower/power.ts`: `floorPower` and `mobLevel`, moved out of tower.ts so the climb can read them without an import cycle. `tower.ts` re-exports them.

**Tests:**
- New: `src/engine/climb/{kinds,doors,boons,sortie,climb}.test.ts`, `src/sim/metrics.test.ts` (about 3.7 s).
- Updated: `tower.test.ts` (the filler fits `floorBudget`), `fullClimb.test.ts` (anchor budgets; "a filler first clear opens Doors, not an event"; Boss → bonus → Boon), `act2.test.ts` (F20 statlines use a strong roster so the director stays out), `scout.test.ts` (honest ratio, report fields, fast threats, lessons), `combat.test.ts` (rout), `loop.test.ts` (its event resolver handles a chained Boon).
- Removed: `climb/floorKindBase.test.ts`, folded into `kinds.test.ts`.

**Acceptance coverage:**
- Safe, Fair and wipe metrics; 2 Doors from F3; Path steps ≤12%; F1-F2 unchanged; lone Islat Han: `metrics.test.ts`, `climb.test.ts`.
- Rout on a losing 5-hero floor; `routAfterDeaths` written only by the tower (a source scan): `climb.test.ts`, `combat.test.ts`.
- Boons apply and expire: `boons.test.ts`.
- Purse math and the 50% kept on a rout: `sortie.test.ts`.
- A Nemesis spawns, then is avenged once: `climb.test.ts`.
- A rested charge doubles gold exactly once: `climb.test.ts`.
- Determinism, as `toEqual` over an 18-floor climb with Doors, Boons and Sorties: `climb.test.ts`.
- The `store.test` delegation tests and the smoke tests are untouched and green.

## Deviations from the spec

1. **The early re-tune uses `climb.kindMult` with a fade, not `tower.earlyBudgetBoost`.** The reasons are above: `floorPower` must stay monotone, F1-F2 must not change, and dailies would shift. `kindMult` keeps its key, its type and its relative meaning (Elite 1.45×, Breather 0.6×), but its JSDoc changed.
2. **Sanctuary** is "back-line heroes get +15% max HP", not "healers' heals +15%". The game has no healer class and no healing skills (the only heals are lifesteal and Second Wind), so the spec's wording would do nothing.
3. **Boss scaling is two-way at every depth.** An authored anchor above its budget is scaled down, bounded by a 30-step clamp (about ×0.10). Without this, F15/F20 stay cliffs under the director.
4. **`ScoutReport.budget`** is now the encounter's real CP (looming units excluded), not `floorPower`. `ScoutThreat` adds optional `count` and `hit` (the estimated opening blow) to `{name, why}`.
5. **`rout.tutorial = 2`** (WP0's value) is kept, so a full party losing on F1-F2 routs too. The lone starter is below the threshold.
6. **The `'fast'` threat reason** is not in the spec. The scout calls out an enemy at least 1.5× faster than the party's fastest hero and ranks threats by CP × tempo. CP underprices speed, and F41's Versace was killing parties the ratio rated Fair.

## SHARED-FILE REQUESTS

1. **`src/engine/store/wp0Commands.test.ts`** (WP0's test, already edited on this branch because there was no alternative). The "CHOOSE_DOOR throws 'not built yet'" case now expects `/chooseDoor: No doors are open/`. WP5 will edit the same file for `BEQUEATH_ECHO` and `CLAIM_RECRUIT`. Take both sides at merge.
2. **`src/engine/tuning.ts`** (required at integration): add `climb.earlyLift: 2.42` and set `climb.mercyBand` to `{tutorial: 1, breather: 0.5, path: 0.72, elite: 0.9, rest: 0, cache: 0, boss: 0.85}`; keep `kindMult` as WP0 has it. Then point `pathLift` and `mercyBand` in `climb/kinds.ts` at `TUNING.climb`, delete `climb/tune.ts`, and swap the `CLIMB_TUNE` references in `kinds.test.ts` for `TUNING.climb`. Until then the package runs on `climb/tune.ts`.
3. **`src/engine/daily/daily.ts`** (not owned): no change needed, because dailies still use plain `floorPower`, which is unchanged. If dailies should track the climb's difficulty, pass `floorBudget(state, floor, 'path')` as `buildFillerEncounter`'s `budget` argument.
4. **For WP4:** the Door, Boon, kind and threat strings are in `frClimb.ts`, so reuse them; do not re-key them in `frTower`. Rendering needs `t(DOOR_LABEL[kind])`, `t(DOOR_BLURB[kind])`, `t(BOONS[id].name)`, `t(BOONS[id].description)`, `t(FLOOR_KIND_LABEL[kind])`, `t(threat.why)`, and `cacheGold(state, floor)` for the Cache preview. The Door labels never contain "Enter" or "Treasure", and the Cache is labelled "Cache".

## Known gaps

- **F41 (Versace, a Chase) is still the tower's deadliest floor.** In the 14-day bots it costs 26-46 deaths per 6 seeds, against 44-46 on WP0. He is about 3× faster than a typical party and CP underprices speed, so a "Risky 1.1-1.2" ratio still loses about 3 heroes. Rout holds most losses to 3 of 5. The scout now names him first with "Very fast…". The real fix is tempo-aware CP in the anchor scaler and the scout ratio, or a lighter F41 roster in `anchors.ts`. Both are balance-pass decisions, and the floor is outside the spec's F1-F25 measurement window.
- **A Boon earned on a clear that also triggers a recovery event (3+ deaths) is lost.** The recovery event takes the event slot. This is rare: 3+ deaths on a cleared Elite or Boss. Chaining it would need the cleared floor's kind on the event.
- **The mercy cap binds on most Path floors for a median bot roster** (about 75-88% at F3-F25). That is by design for weak rosters, but it means the static curve mostly matters for above-median rosters. If the playtest finds the Path too samey, lower `CLIMB_TUNE.earlyLift` (to about 2.1) so median rosters face the static curve and see more Safe floors, which invites more Skull picks.
- **Migrated saves** see their first Doors after their next clear: `tower.doors` stays `null` until then.
- **The plaque bonus** (`legacyPct`) is wired but is WP5's stub (0), so its effect is untested here. The Nemesis and lessons paths are tested with hand-built fixtures.
- **No UI in this package.** The Doors, Boon, Sortie and scout cards are WP4's.

## Review (independent review, 2026-10-13)

I reviewed the whole diff from `3b2ce0a` plus every new file against §4.0, §4.4 and S12-S15, S19, S20 and S22-S24, using probe tests that were removed afterwards.

- **Gates after the fixes:** typecheck is clean, `npm test` passes 56 files and 969 tests, and the build is green (chunk-size warning only).
- **Metrics on the test seeds:** 0 of 66 Safe attempts had deaths, and 13 of 337 Fair attempts did (3.9%).

**Issues found and fixed**

1. **`src/engine/tuning.ts` was edited, but it is a WP0-only shared file (§4.0.2).**
   - Reverted it to `3b2ce0a`.
   - The package's numbers now live in a new owned file, `src/engine/climb/tune.ts`: `CLIMB_TUNE.earlyLift = 2.42` and the new mercy bands. `kinds.ts` reads them from there.
   - `kindMult` keeps its WP0 values and meaning, so Elite, Breather and Boss are exactly 1.45×, 0.6× and 1.0× Path. Before, they came from the ratios 3.5/2.42, 1.45/2.42 and 2.42/2.42.
   - This is now SHARED-FILE REQUEST 2. The metrics did not change.
2. **A Nemesis could be lost for good.**
   - It was injected only when `revengeFloor === floor`. Taking a Rest or Cache Door on that floor, or a Survival or Escort clear that outlasted it, left it `waiting` on a floor the player had already passed.
   - Now a waiting Nemesis joins its revenge floor and every later non-anchor floor until it is avenged, and the scout announces it on each.
   - Test added.
3. **Sending heroes away gave the party Last Stand.**
   - Last Stand counted *fightable* heroes. Sending three of five heroes to training or on an expedition gave the other two +15% to every stat, and the "remembers your fallen" message, with nobody fallen.
   - It now counts heroes still standing: alive, not captive, Sanity above 0.
   - Test added.
4. **The scout's opening blow ignored skills.**
   - S12 asks for the opening move to come from the enemy's strongest skill. The scout always used a physical basic strike.
   - It now takes the strongest skill the enemy can cast at full SP, the same way `chooseSkill` picks it. Attack and defence follow the skill's damage type, and the skill's element is used.
   - Today's enemies carry only a basic strike, so the numbers do not change; enemies that carry skills now get an accurate estimate.
   - Test added.
5. **`playFloor` ignored `TUNING.climb.reward.eliteBoon`.** It now reads it.
6. **The wipe metric was weak.** "≤10% of losses are wipes" rested on 2 losses in the bot runs.
   - Added a test in `climb.test.ts`: 20 seeds × 4 kinds of losing full-party tower fights.
   - In probes, 1 of about 230 losses was a wipe; every other loss was a rout.
7. **Cosmetic:** the JSDoc for `elementMult` in `combat.ts` had ended up above `BattleMods`. Moved it back.

**Checked and found fine**

- **Determinism and purity:** only the new `'doors'` and `'boon'` streams draw RNG, and the `pathBudget` memo is a pure cache.
- **Rout:** `routAfterDeaths` is set only by `buildEncounter`. Dailies, PvP, events and the guild are untouched.
- **F1-F2:** the encounters are identical.
- **Special floors:** a god-roster climb taking Rest, Cache and Skull doors passes the F36-40 loop, F41/F42 and the Wailing Wall (which offers no Doors), up to the Wall.
- **Empty or dead rosters:** neither the scout nor `playFloor` throws.
- **CHOOSE_DOOR refusals** behave as intended.
- **French:** every new engine string (Doors, kinds, Boons, threat reasons, battle notes, refusals) has a French entry. Placeholders match (there are none), and the French spacing before `!` and `:` is correct.
- **Smoke-test hygiene:** no UI files changed, so it is untouched.

**Remaining concerns**

- **The Boon lost to a recovery event is still open.** The event does not record the floor's kind, so an Elite's Boon cannot be chained after it without a new `TowerEvent` field in the shared `types.ts`.
- **A chosen fight Door is final.** `doors` becomes `null` until the floor is lost. The UI (WP4) should confirm before it sends CHOOSE_DOOR for the Skull.
- **F41 is still the deadliest floor** (see Known gaps). Tempo-aware CP is a balance-pass decision.
- **The Path ratio may feel flat.** The mercy cap holds the Path ratio near 1.39 for median rosters; the playtest should check this.
- **`wp0Commands.test.ts` stays edited.** It is not owned by this package; SHARED-FILE REQUEST 1 covers it.
