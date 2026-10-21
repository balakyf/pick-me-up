# Fun tension tuning: a sawtooth for the first 25 floors (2026-10-16)

Branch `fun/tension`, from `1ba6103`. Spec: `docs/superpowers/specs/2026-10-12-fun-and-return-design.md` §1 RC2/RC3 and §3 S12, S13, S16, S19, S20.

## The problem

The fun-and-return climb has Doors, boss anchors, a mercy director, rout, Last Stand and the Decisive Moment. Even so, a naive player found it flat. Every `mercyBand` was below 1 (path 0.72, elite 0.9, boss 0.85), so every floor was capped below the roster's own strength.

- Every boss read Safe and killed no one.
- The Skull was 75% Safe.
- The Decisive Moment, the game's key agency feature, almost never fired.

This is the same complaint the original game got ("floors 1–12 all Safe, no decisions").

## How it is measured

`src/sim/feel.ts` is a reusable harness, and `npx vite-node src/sim/feelRun.ts [seeds]` prints the tables. It plays N seeds of the **naive** player from a new account through F1–F25:

- free tutorial ten-pull;
- `suggestParty` every floor;
- always `doors[0]`;
- the first Boon, and the first option of any event;
- no summons, no promotions;
- New Arrival bells are claimed (one tap);
- sessions of 5 attempts, three a day;
- a lost floor is retried up to 4 times, and then the run ends there.

It plays two variants of the same player:

- **naive**: never gives an order.
- **decisive**: in any fight where a hero would die, it takes the Decisive Moment the way the UI does. It calls `findDecisive` on the log, then re-resolves the attempt through the same `orders` path with `{ tick: orderTick, kind: 'protect', allyId }` on the first doomed hero.

On every floor that offers a Skull, the Skull is scouted and fought **once, as a pure counterfactual** on the same state. The naive player never opens it, so this is how the Skull's numbers describe the roster that would have opened it.

The harness reports the following per kind:

- the honest scout's bands (8 trial fights of the real attempt);
- the win rate;
- the share of fights with a would-be death (no orders), for all fights and for first attempts;
- deaths after the Protect policy;
- deaths per 10 floors;
- the share of losses that are routs (≤ 2 dead);
- the share of runs that end with ≥ 5 living heroes.

`src/sim/feel.test.ts` (24 seeds × 2 variants, about 8 s) asserts the targets.

The "before" column is the same harness run on a clean copy of `1ba6103`. The harness had one bug while it was being built: `createAccount` takes *real* ms, and it was given world ms, so no time ever passed. That bug is fixed in both columns. With time not passing, the numbers matched the task's measurement almost exactly; with it fixed, they are slightly kinder.

## What changed

All of the numbers live in `TUNING.climb`. There are two small director-formula additions in `src/engine/climb/kinds.ts`.

| value | old | new | why |
|---|---|---|---|
| `mercyBand.path` | 0.72 | 0.72 | Path stays a little under the roster: mostly Safe, sometimes Fair. |
| `mercyBand.elite` | 0.9 | **1.17** | The Skull is sized *above* the roster, so it is mostly Risky. |
| `mercyBand.boss` | 0.85 | 0.85 | The boss peak now comes from `anchorFeel` (below). |
| `mercyBand.breather` | 0.5 | **0.42** | The Breather after a boss should be ≥ 90% Safe. |
| `kindMult.elite` | 1.45 | **1.6** | The Skull's static curve has to sit above the 1.17 cap for a weak roster. For a strong roster (never capped) it is a real step up. |
| `kindMult.boss` | 1.0 | 1.0 | Unchanged. 1.3 was tried and walled the engaged bots at F41/F42 (those are anchors too). |
| `anchorFeel` (new) | — | **{5: 1.76, 10: 1.34, 15: 1.43, 20: 1.22, 25: 1.55}** | Per-anchor × on the Boss's static budget **and** its mercy cap. Authored bosses hit very differently for their CP: F5's Survive is soft (Safe up to ~1.3× the roster), and Halgiraf on F20 is hard (already Risky at 0.85×). One band cannot make them all peaks. F30+ is untouched. |
| `levelLag` (new) | — | **{grace 3, perLevel 0.04, min 0.5, untilFloor 25}** | The director reads a hero far under the floor's mob level at less than its CP (`levelLagMult`, `directorCp`). See below. |
| `rout.boss` | 3 | **2** | A lost early boss costs a rout, not a third hero. |
| `earlyLift` | 2.42 | 2.42 | Unchanged. 2.65 was tried; it is not needed once the Skull's `kindMult` carries the step. |
| `maxStepPct` | 0.12 | 0.12 | Unchanged. |

### Why the director needed `levelLag`

With bands alone, the targets were a knife-edge. Any boss peak that killed sometimes started a cascade, measured on F11–F19 Path fights at the same band:

| heroes already dead | Path would-be death | Path Safe |
|---|---|---|
| 0 | 2% | 92% |
| 1–2 | 9–11% | 62–68% |
| 3+ | 29% (47% on F21–24) | 51% (35%) |

The cause is the free roster. Its 1★/2★ heroes cap at Lv10/Lv20, and the bench steps in for the dead carries. CP prices those heroes' stats, but combat mitigation is level-scaled (`defenseKFlat + defenseKPerLevel × level`), so a 1★ Lv10 on F22 fights far below its CP. The director therefore over-sized every floor for a roster that had bled. That is exactly the death spiral S20 promises to prevent.

`directorCp` reads the same five heroes as `rosterCp`. Each hero counts at `1 − 0.04 × (mobLevel − level − 3)`, with a floor of 0.5 and only through F25. `rosterCp` itself, the scout and the static curve are unchanged. The director is still a mercy cap only.

The window stops at F25 for three reasons:

- The balance bots' late pacing (the F41 Versace gate and the act gates) was tuned with the plain-CP director, and relief past F30 sent casual bots far past F40.
- At F26–F30, relief turned hopeless Lv1 parties' losses into close fights that cost 3–5 heroes before the rout. The funReturn rout test (≤ 15% bad routs) caught this at 19%; with `untilFloor` 25 it is 6%.
- F1–F25 is the scope of this pass.

## Before / after: the naive player, F1–F25 (24 seeds)

**Before** (`1ba6103`):

| kind | fights (1st) | Safe | Fair | Risky | Deadly | win | would-be death | 1st-try would-be death | deaths/fight | Decisive: death after Protect (would-be) |
|---|---|---|---|---|---|---|---|---|---|---|
| tutorial | 48 (48) | 48 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 100% | 0% | 0% | 0.00 | 0% (0%) of 48 |
| path | 340 (336) | 279 (82%) | 28 (8%) | 29 (9%) | 4 (1%) | 99% | 7% | 7% | 0.10 | 0% (6%) of 336 |
| elite | 319 (319) | 238 (75%) | 22 (7%) | 55 (17%) | 4 (1%) | 98% | 16% | 16% | 0.20 | 2% (13%) of 319 |
| boss | 72 (72) | 72 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 100% | 0% | 0% | 0.00 | 0% (1%) of 72 |
| f20 | 24 (24) | 8 (33%) | 6 (25%) | 10 (42%) | 0 (0%) | 100% | 29% | 29% | 0.29 | 8% (21%) of 24 |
| f25 | 23 (23) | 23 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 100% | 0% | 0% | 0.00 | 0% (4%) of 24 |
| breather | 96 (96) | 88 (92%) | 6 (6%) | 2 (2%) | 0 (0%) | 100% | 1% | 1% | 0.01 | 0% (0%) of 96 |

- naive: 23/24 reach F25 · 0.72 deaths per 10 floors · losses that are routs: 91% · ≥ 5 living at the end: 92%
- decisive: 24/24 reach F25 · 0.03 deaths per 10 floors · routs 100% · ≥ 5 living 100%

**After:**

| kind | fights (1st) | Safe | Fair | Risky | Deadly | win | would-be death | 1st-try would-be death | deaths/fight | Decisive: death after Protect (would-be) |
|---|---|---|---|---|---|---|---|---|---|---|
| tutorial | 48 (48) | 48 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 100% | 0% | 0% | 0.00 | 0% (0%) of 48 |
| path | 337 (336) | 259 (77%) | 41 (12%) | 36 (11%) | 1 (0%) | 100% | 8% | 8% | 0.10 | 0% (4%) of 336 |
| elite | 319 (319) | 84 (26%) | 48 (15%) | 165 (52%) | 22 (7%) | 92% | 53% | 53% | 0.82 | 13% (34%) of 319 |
| boss | 72 (72) | 13 (18%) | 19 (26%) | 40 (56%) | 0 (0%) | 100% | 40% | 40% | 0.46 | 7% (48%) of 75 |
| f20 | 24 (24) | 7 (29%) | 3 (13%) | 14 (58%) | 0 (0%) | 100% | 29% | 29% | 0.38 | 32% (56%) of 25 |
| f25 | 24 (24) | 19 (79%) | 3 (13%) | 2 (8%) | 0 (0%) | 100% | 4% | 4% | 0.04 | 8% (21%) of 24 |
| breather | 96 (96) | 92 (96%) | 3 (3%) | 1 (1%) | 0 (0%) | 100% | 1% | 1% | 0.01 | 0% (0%) of 96 |

- naive: 24/24 reach F25 · 1.30 deaths per 10 floors · losses that are routs: 96% · ≥ 5 living at the end: 92%
- decisive: 24/24 reach F25 · 0.30 deaths per 10 floors · routs 90% · ≥ 5 living 100%

At 48 seeds the after-numbers are close:

- path: 79% Safe, 7% would-be death;
- elite: 27% Safe, 49% would-be death;
- boss: 24% Safe, 33% would-be death on the first try; with Protect, 4% of 42%;
- F20: 30% Safe, 54% Risky or Deadly;
- breather: 97% Safe;
- routs: 95%;
- ≥ 5 living: 96%.

### Targets (F3–F25, asserted in `src/sim/feel.test.ts`)

| target | after | |
|---|---|---|
| Path mostly Safe/Fair (≈ 60–80% Safe), would-be death ≤ 10% | 77% Safe, 89% Safe+Fair, 8% | ✓ (the test allows ≤ 85% Safe) |
| Breather ≥ 90% Safe | 96% | ✓ |
| Boss F5/F10/F15 ≤ 25% Safe, would-be death 25–50% of first attempts | 18%, 40% | ✓ |
| …with Protect, deaths drop by at least half | 7% of fights with a death (from 48%); deaths per fight at least halved (asserted) | ✓ |
| Skull ≤ 30% Safe, would-be death 30–60% | 26%, 53% | ✓ |
| F20 reads Risky/Deadly honestly | 58% Risky, 29% Safe (and Safe never kills) | ✓ |
| losses are routs (≤ 2 dead) ≥ 90% | 96% (all fights, Skull included) | ✓ |
| ≥ 5 living after F25 in ≥ 80% of seeds | 92% | ✓ |
| the lone Islat Han clears F1; F1–F2 unchanged | metrics.test.ts, untouched | ✓ |
| the scout stays honest (Safe never kills, Fair ≤ 5%) | feel.test, metrics.test, scoutHonesty.test all green | ✓ |

The sawtooth for a naive player who never opens the Skull now reads like this:

- F3–F4: Safe Paths.
- F5: a Risky Boss, where one first attempt in three would cost a hero unless the Decisive Moment is taken.
- F6: a Breather.
- F7–F9: Paths.
- F10: the next Boss peak.
- F12 onward: some Fair and Risky Paths.

Every Door offers a Skull the scout honestly rates Risky.

## The balance bots (`src/sim/run.ts`)

`npx vite-node src/sim/run.ts 14 3`:

| profile | before: floor by day 14 (dead) | after |
|---|---|---|
| casual | F40, F40, F40 (11, 10, 8) | F40, F40, F62 (19, 13, 2) |
| engaged | F40, F85, F82 (18, 16, 14) | F84, F85, F82 (24, 18, 24) |
| whale | F99, F100, F100 (22, 2, 16) | F100, F100, F100 (15, 2, 17) |

The same run with 8 seeds:

| profile | before | after |
|---|---|---|
| casual floors | 40, 40, 40, 83, 40, 60, 40, 80 (median 40) | 40, 40, 62, 41, 40, 75, 40, 74 (median 40.5) |
| casual dead | 11, 10, 8, 10, 12, 7, 10, 6 (Σ 74) | 19, 13, 2, 1, 18, 15, 13, 15 (Σ 96) |
| engaged floors | 40, 85, 82, 87, 40, 87, 85, 84 (median 84.5) | 84, 85, 82, 81, 100, 79, 100, 81 (median 82.5) |
| engaged dead | 18, 16, 14, 50, 19, 34, 20, 15 (Σ 186) | 24, 18, 24, 31, 33, 21, 36, 33 (Σ 220) |
| bot deaths on F1–F30 (casual / engaged, Σ 8 seeds) | 6 / 11 | 59 / 56 |

Progress is as before: casual ≈ F40 by day 14, engaged F79–F100. Deaths are up by about 30% for the casual bot and 18% for the engaged one, and they have moved. The bots now lose heroes on the early bosses (F5, F10, F15, F20, F25) instead of almost none before F30. The bots never give an order and fight every boss whatever the scout says, so this is the intended tension landing on players who ignore the Decisive Moment. It is not a spiral: the worst engaged run lost 36 heroes, against 50 before, and casual still clears Acts I–IV, by day 7 rather than day 5. Engaged clears Act V a day later in the median (day 5 rather than day 4), but 8 of 8 runs clear it, against 6 of 8 before.

## Tests changed (each because the change is intended)

- `src/engine/climb/climb.test.ts`: the rout table is now Boss 2, not 3.
- `src/engine/climb/kinds.test.ts`:
  - a Boss's static budget carries its `anchorFeel`;
  - "every band ≤ 1" becomes "Path and Breather under 1, the Skull above it and ≥ 1.4× the Path";
  - new cases cover `anchorFeel`, `levelLagMult` and `directorCp`.
- `src/engine/tower/fullClimb.test.ts`: anchors F25+ meet `budget × anchorFeel`.
- `src/engine/climb/deployable.test.ts`: the Suggest-only climb to F20 is now bounded. It looped forever when a floor stalled during tuning; the assertions are unchanged.
- `src/ui/battle/intents.test.ts`: the test also samples the F5/F10 bosses and F27/F30. The director now spares Lv1 parties on F12/F15, which left too few big blows to check. The claim is unchanged.
- `src/ui/i18n/frScreens.smoke.test.tsx`: the veteran fixture's first death may come on the Skull behind the Path (on F11–F19).

`src/sim/metrics.test.ts` and `src/sim/scoutHonesty.test.ts` are untouched and green.

## Open points

- ~~Path in Act I (F3–F9) is still all Safe for the naive player.~~ Done on 2026-10-21 with a per-floor `pathFeel` rather than `earlyLift` (see "Rest of the balance" below).
- F25 (`anchorFeel` 1.55) is a mild peak, 79% Safe. At 1.75 it was a second wall for the bots right after F20.
- `anchorFeel` values are per authored anchor. If an anchor's roster changes, its feel should be re-measured with `feelRun.ts`.

## Review pass (independent probe, same day)

An independent probe re-measured the pass on seeds the feel test never sees (2 sets × 40
seeds, F1–F25) with the naive player and a **typical** one: it also summons with spare
gold, takes the Skull when the scout calls it Safe or Fair, and takes the Decisive Moment
(Protect, then Pull back a second doomed hero). The naive targets mostly held (pooled boss
39–43%, Skull 53–61%, Path 11–14% would-be deaths), but the typical player hit cliffs: its
stronger roster meets each boss's static curve, so `anchorFeel` lifted it straight up.

| typical player, first try (2×40 seeds) | anchorFeel as first tuned | as reviewed |
|---|---|---|
| F5 would-be death | 58–60% | 43–50% |
| F10 | 38–45% | 38–45% |
| F15 (escort) | 25–39%; lost 0.45–1.0× per run, half scouted Deadly | 6–14%; lost 0.05–0.3× per run |
| F20 | **78–80%**, Protect saves 34–42% | 48–50%, Protect saves 79–85% (Protect then Pull back: 95%) |
| F25 | 40–50% | 28–35% |

`anchorFeel` 5/10/15/20/25: 1.76/1.34/1.43/1.22/1.55 → **1.72/1.34/1.2/1.1/1.4**. The naive
player keeps its F5/F10 peaks (30–50% / 28–46% would-be deaths); its F15/F20/F25 are bumps
(0–17%), the price of not walling a roster that summons. The values are steep (F5: ~10% at
1.55, ~65% at 1.76), so `feel.test.ts` now also plays the typical player and asserts every
boss F5–F25 is a peak but not a cliff for it (20–60% first-try would-be death, F15 lost at
most once per two runs, ≥75% of boss would-be deaths saved by the Decisive Moment, 0 deaths
on Fair-or-better Skulls), and F5/F10 each a peak for the naive one (the pooled boss Safe
share hid F15 being Safe for it).

Unchanged and green: `scoutHonesty.test.ts`, `metrics.test.ts`, the scout, combat and
`decisive.ts` (no diff from 1ba6103). Over 40 bot seeds per profile the Fair band costs a
hero in 2.1% of attempts (the test's 10-seed sample sits near its 5% bar: 1–2 of ~35);
Safe never killed (0 of ~1,600). F1–F2 encounters are byte-identical to 1ba6103, and the
probe is deterministic run to run. Past F25 the typical player (24 seeds to F45) sees no new
cliff: F26–F40 Path 4% would-be deaths, bosses F30/F35/F40 ≤4%; Versace (F41) is the same
honest Deadly wall as at 1ba6103.

Bots (`run.ts 14 8`, vs 1ba6103): casual median F49.5 (F40), 65 dead (74); engaged median
F83 (F84.5), 146 dead (186); whale all F88–F100, 83 dead (63, from longer runs).

Still open: `rout.boss` is 2, but spec S19 says 3 on Boss floors (a documented deviation:
it caps a lost peak at two heroes).

## Rest of the balance: F41, Act I Paths, rout leakage (2026-10-21)

Branch `fun/rest-balance`, from `c10bb9f`. This pass covers three items from the spec's §6 "Still open". Every "before" below is the same harness run on a clean copy of `c10bb9f`. The probes that re-judge one set of fights under several rules mutate `TUNING` in place.

### 1. F41 (Versace): the mercy cap now weighs speed

**Root cause.** F41 is always mercy-capped for the bots and the feel players: the roster's CP × 0.85 sits under the 5,232 static budget. The cap compares CP with CP. CP adds speed like any other stat (`cp.weights.spd` 1.5), but an ATB unit acts in proportion to its speed.

- Versace runs at 2.5–3.3× the party's mean speed.
- Every other enemy in the climb is at most ~1.2× (p90 of the fastest enemy per bot attempt, F1–F100).

So the director sized him at roughly a third of his real threat. The level gap made it worse (Lv20 2★ bench heroes against a Lv49 boss), but that gap applies to every floor past F25.

**Fix** (`climb/kinds.ts` `tempoMult`, `directorSpd`; `tower.ts` `buildScaledAnchor`). An authored anchor under the mercy cap is "big enough" once either test passes:

- its plain CP meets the budget; or
- its tempo-weighted CP meets the cap.

The tempo weight works like this. An enemy faster than `climb.tempo.grace` (1.25) × the party's mean speed counts × (spd / (party spd × 1.25)) ^ 0.5. The party's speed is that of the five heroes the director reads. The square root is because speed is offense only.

Without a fast enemy the two tests coincide, so every other anchor is byte-identical (asserted for F5–F20, F40 and F42). The static curve, the scout (still 8 real trial fights) and the fillers are untouched. In practice, Versace comes out one or two `elitePowerStep`s lighter.

`anchorFeel[41]` was tried on top and is not set. At 1.15 (two steps), engaged bots fall back to 11/16 and the typical player walls in 12 of 24 runs. The edge is that steep.

| F41 | before (`c10bb9f`) | after |
|---|---|---|
| engaged bot, 16 seeds × 14 days | 11/16 clear (2 on the 1st try), 43 attempts, 111 dead; failed attempts 2.84 dead each (max 5); scouted Deadly 31 / Risky 11 / Fair 1 | **16/16 clear (10 on the 1st try)**, 23 attempts (none needs more than 3), 31 dead; **failed attempts 2.00 dead each (max 2)**; Risky 16 / Deadly 5 / Fair 2 / **Safe 0** |
| casual bot, 16 seeds × 14 days | 9/16 clear (5 on the 1st try), 31 attempts, 75 dead; 2.77 dead per failed attempt (max 5) | 14/16 clear (9 on the 1st try), 22 attempts, 28 dead; 2.00 per failed attempt (max 2) |
| typical player (feel.ts, 24 seeds to F45, up to 6 tries) | 16/24 clear, **8 walled** (6 losses each), 67 attempts; 1st try Deadly 15 / Risky 9; 2.18 dead per loss (max 5) | **24/24 on the 1st try**, Risky 21 / Deadly 3; 0.38 dead per win (1.71 would-be: the Decisive Moment saves the rest) |
| naive player (13 of 24 runs reach F41) | 12/13 clear, 26 attempts, 2.07 dead per loss (max 5) | 13/13, 16 attempts, 2.00 per loss (max 2) |

The engaged target holds on every seed: 1–3 attempts, ≤ 2 dead per failed attempt, Risky rather than Safe. `src/sim/f41.test.ts` asserts it on 10 engaged seeds.

**Casual: only partly met.** F41 is still the casual bot's biggest wall: more of its attempts go there than to any other floor. 7 of 16 casual seeds lose there and must come back ≥ 10% stronger, through promotions and summons. 2 of 16 are still at F40 on day 14. It is a softer wall than before, though.

The cause is structural. Under the mercy cap, F41 is sized relative to the roster, so it cannot tell a casual roster from an engaged one of the same CP. The casual bot reaches F41 later and with more CP, and does no worse there. As a result, the casual 14-day pace past F41 rises (below). If casual should stay around F40–F60 by day 14, that is now a job for the Act VI+ gates.

### 2. Act I Paths: `climb.pathFeel`

**Root cause.** F3–F9 Paths sat at ~0.75× the roster: the static curve at 0.74–0.87×, the cap at 0.72×. That is under every cap, and comfortable for a roster with no level lag yet. Raising `earlyLift` instead would move every bot's Path up to F35.

**Fix.** `climb.pathFeel` = {3: 1.45, 4: 1.42, 6: 1.2, 7: 1.2, 8: 1.22, 9: 1.25} (retuned in review, below; first shipped as {3: 1.5, 4: 1.5, 6: 1.2, 7: 1.2, 8: 1.22, 9: 1.28}). It multiplies a Path floor's static budget **and** its mercy cap, like `anchorFeel` does on a Boss (`kindFeel`). It sits outside the step-capped Path curve, so nothing carries past F9: `pathBudget(11)` is unchanged. The Skull and the Breather keep their own curves, and F1–F2 are tutorial floors.

The values are steep. F4 alone, naive player over 112 seeds: 1.42 → 1.45 → 1.48 takes its would-be deaths from 3% to 5% to 10% (the typical player's from 8% to 12% to 18%).

The result is a sawtooth: F3 eases in, F4 rises before the F5 boss, F6 is the Breather, and F7–F9 climb to F10.

**Review retune (2026-10-21).** The first values were tuned on the 24 feel.test seeds and did not hold out of sample. The review measured on 112 seeds (the 24 test seeds plus `feelSeed(200…287)`) for F3–F9 and on 64 seeds (the first 64 of those) to F25 for the rest. The "no `pathFeel`" column is this branch with `pathFeel` emptied; `c10bb9f` itself measured the same within a point (F11–F25 11.4%, F3–F25 7.4%):

| | no `pathFeel` (64 seeds) | first values | **shipped values** |
|---|---|---|---|
| naive F3–F9: Safe / Fair / Risky (112 seeds) | 97% / 3% / 0% | 71% / 21% / 8% | **81% / 15% / 4%** |
| naive F3–F9: would-be death (112 seeds) | 0.3% | 5.0% (the brief's bound) | **2.9%** |
| typical F3–F9: Safe / would-be death (112 seeds) | 100% / 0% | 70% / **9.3%** (F3 and F4 19% each) | **80% / 3.3%** |
| naive F11–F25 Path would-be death (64 seeds) | 11.7% | **14.1%** (an Act II regression) | **11.0%** |
| naive F3–F25 Path would-be death (64 seeds; the feel.test bound is 10%) | 7.6% | **10.8%** | **8.2%** |
| naive runs walled / ending with ≥ 5 living (64 seeds) | 1 / 61 | 2 / 60 | **0 / 62** |
| naive deaths per 10 floors (64 seeds) | 0.99 | 1.20 | **0.96** |

On the 24 test seeds the shipped values give: naive F3–F9 81% Safe, 16% Fair, 4.2% would-be death; typical 84% Safe, 1.4%. Per floor (naive, 112 seeds): F3 87% Safe, F4 85%, F7 90%, F8 71%, F9 71%, each with 2–5% would-be deaths.

{3: 1.45, 4: 1.45, …} measured about the same (naive 78% Safe, 3.2%; typical 78%, 4.1%); F4 sits at 1.42 because the typical player's F4 would-be deaths drop from 12% to 8% there.

**A caveat: the impatient climber.** `deployable.test.ts`'s F20 scenario attempts a floor every 3 minutes with whoever Suggest sends, never summoning and never waiting for rest. Over seeds 1–40 it stalls below F20 (a rout, then a tired 2-hero party wiped, then nobody fit to send) on 1 seed with no `pathFeel`, 2 with the first values and 3 with the shipped ones. Seed 2, the test's own seed, is one of the three: its roster loses different heroes in Act I and then meets a fixed F18 matchup it cannot beat, even when it does wait for rest. The test now runs on seed 1, which meets the same F20 trap (four tired heroes benched, the fightable five ~1.5× the party) on every tuning tried, and asserts that the trap is live. The naive feel player, who rests, never walls (above). Act I deaths in won fights are the price of the brief's ≤ 5%; a player who never rests or summons pays it later.

Elsewhere:

- **F1–F2:** encounters unchanged (`metrics.test`); the lone Islat Han still clears F1. 0 losses and 0 would-be deaths in 64 F1–F2 fights per variant (32 fresh seeds).
- **All Paths F3–F25 (naive, 24 seeds, the feel.test row):** Safe 78% → 70%; would-be death 6% → 9% (8.6%; the bound is 10%).

### 3. Rout leakage: rout on the projected loss

**Root cause.** The rout check (`combat.ts`, after every action once `routAfterDeaths` heroes are down) fired only when the party's HP was below the wave's HP. Two kinds of fight bled through:

- A fast single killer the party cannot outpace: Versace, and late-tower elites.
- A foe immune to the party's damage type. For example, an immune F86 elite with 133–1,272 HP against 5,000+ party HP took four heroes, one at a time, over hundreds of ticks.

Several heroes rarely fall to a single blow: in the leaks, the deaths are spread out.

**Fix** (`combat.ts` `projectedLoss`, `TUNING.climb.routProjection.margin` 1.25). Past the threshold, the line also breaks on a projected loss:

- **Test:** the enemies' ticks-to-kill the living heroes is less than 1.25 × the heroes' ticks-to-kill the wave.
- **Ticks-to-kill:** for each defender, its HP divided by the attackers' expected damage per tick against it, summed over the defenders.
- **Expected damage:** mirrors `resolveHit`'s multipliers (attacker-level mitigation, element, expected crit, enrage/frenzy/bane, immune/resist/vulnerable/guard), × spd / actionGaugeMax.
- **Survival missions** count the remaining clock as the win time.

The projection uses no RNG. It only ever adds routs to the HP check, so it never makes a loss bloodier (asserted).

**The probe.** It takes 3,714 fights and resolves each one three ways: with no rout at all, with the HP check only, and with the new rule. The fights are:

- every attempt the naive, Decisive and typical players made or weighed over F1–F25, Skull counterfactuals included (24 seeds);
- every attempt by the casual and engaged bots over 14 days (8 seeds).

| | HP check only (the `c10bb9f` rule) | projected loss, margin 1.0 | **margin 1.25 (shipped)** | margin 1.5 |
|---|---|---|---|---|
| losses costing ≤ 2 heroes | 47% (bots: 4%) | 94% | **97.3%** (bots 98%, Skulls 98%) | 97.5% |
| dead per loss | 2.91 | 2.02 | **2.00** | 1.98 |
| would-be wins (no rout) turned into retreats | 0.2% | 0.5% | **0.7%** | 0.9% |

The would-be wins that now retreat are Pyrrhic: they would have cost 3.3 heroes each, and the retreat costs 2.1.

On `c10bb9f` itself (its own code and its own trajectories), 64% of losses cost ≤ 2 heroes and 0.2% of wins became retreats.

The remaining 3+-dead losses are projection misses:

- a reach mission (F25 Escape);
- a Skull where the party was ahead on pace when its second hero fell.

On the feel test's own sample (921 attempts: the naive player's committed fights and the Skulls it walked past):

| rule | losses costing ≤ 2 heroes | would-be wins that retreat |
|---|---|---|
| HP check only | 90% | 0.7% |
| projected loss | **100%** | **1.4%** (each would have cost 3.23 dead) |

`feel.test.ts` asserts ≥ 97% and ≤ 2%.

### All together

`npx vite-node src/sim/feelRun.ts 24` after all three changes:

- **The naive player:**
  - 24/24 reach F25.
  - 1.05 deaths per 10 floors, up from 0.90 (the new Act I tension; 1.10 with the first `pathFeel`).
  - Losses that are routs: **100%**, up from 88%.
  - ≥ 5 living at the end: 96%, as before.
- **Path F3–F25:** 70% Safe / 18% Fair / 12% Risky, with 9% would-be deaths (the first `pathFeel`: 67% / 20% / 13%).
- **Unchanged within noise:**
  - the Skull: 28% Safe, 52% would-be death;
  - the bosses: F5 46% and F10 42% first-try would-be deaths;
  - the Breather: 96% Safe;
  - the whole typical-player table.

The bots, `run.ts 14 8`, before → after (medians average the middle two):

| profile | floor by day 14 | dead (Σ 8 seeds) | Act V cleared |
|---|---|---|---|
| casual | median 49.5 → **74.5** (40,40,40,77,59,69,60,40 → 40,75,77,77,74,81,69,40) | 65 → **49** | 2/8 (day 13) → 6/8 (day 12) |
| engaged | median 83 → 85 (two seeds stuck at F40 → none) | 146 → 170 | 6/8 (day 10) → **8/8 (day 5)** |
| whale | median 99.5 → 100 (range 88–100 → 80–100) | 83 → **45** | 8/8 (day 2) → 8/8 (day 2) |

Engaged deaths are up because every seed now spends days 6–14 in Act VII: F81–F86 are unchanged and are now the top walls. The old F41 wall had kept two seeds out of Act VII altogether. Act V deaths fell (median 8 → 5).

### Tests added or tightened

- **`src/sim/f41.test.ts` (new).** Engaged bots clear F41 within 3 attempts, with ≤ 2 dead per failed attempt. The first attempt is never Safe and is mostly Risky.
- **`src/sim/feel.test.ts`:**
  - New Act I Path test: naive 60–85% Safe, ≥ 10% Fair, ≤ 5% would-be death; typical ≤ 90% Safe, ≤ 6% (8% before the review).
  - Routs tightened: ≥ 97% of losses (was 85%), and 3+-dead losses ≤ 0.3% of fights (was 1%).
  - New rout A/B over every naive attempt: ≥ 97% cheap losses, ≤ 2% of would-be wins retreat, and never bloodier than the HP check.
- **`src/engine/climb/kinds.test.ts`:**
  - `pathFeel` and `kindFeel`: Act I only, under the Skull, no carry into the curve.
  - The Path cap carries its feel.
  - `tempoMult` and `directorSpd`.
- **`src/engine/climb/climb.test.ts`:**
  - Versace is fitted by tempo: lighter than the plain-CP fit, and ≥ the cap by tempo.
  - Other anchors are byte-identical.
  - A strong roster still meets the static curve.
  - (Review) A roster in the band where only the tempo-weighted cap binds gets a lighter Versace, and the scout's "The tower eases off" note says so (`isTempoEased`).
- **`src/engine/combat/combat.test.ts`:**
  - A fast killer and an immune foe rout at the threshold. With the HP check alone, the first cost 4 heroes and the second wiped the party.
  - A party winning on pace never breaks.
- **`src/engine/climb/deployable.test.ts` (review):** the Suggest-only F20 scenario moves from seed 2 to seed 1 (see the impatient-climber caveat), with a new check that its trap is live.
- **Honesty tests:** untouched and green (`metrics.test.ts`, `scoutHonesty.test.ts`, and feel.test's "Safe never kills, Fair ≤ 5%").

### Review (2026-10-21): re-measured on fresh seeds

Every claim above was re-run on seeds the tuning never saw: bots `5003 + i × 104729`, feel players `feelSeed(200…)`, and a rout probe over the bots' `31337 + i × 7907`.

| F41, fresh seeds | before (`c10bb9f`) | after |
|---|---|---|
| engaged bot, 16 seeds | 10/16 clear (3 on the 1st try); failed attempts 3.13 dead (max 5); 1st attempt Deadly on most seeds | **16/16 within 2 attempts (8 on the 1st)**; failed attempts **2.00 dead (max 2)**; Risky 17 / Deadly 7 / **Safe 0** |
| casual bot, 16 seeds | 5/16 clear (4 on the 1st try); 2.52 dead per failed attempt (max 5) | 12/16 clear (11 on the 1st try); 2.00 (max 2) |
| typical player, 32 seeds to F45 | 23/32 clear, 9 walled; 1st try Deadly 28 / Risky 4 | 31/32 clear (28 on the 1st), 1 walled; Risky 22 / Deadly 10 |

The engaged and typical targets hold out of sample. The casual one does not: on these seeds 11 of 16 casual bots clear F41 on the first try, so for most casual rosters it is no longer a wall that needs promotions or summons. That is the structural point made above (the mercy cap cannot tell a casual roster from an engaged one) and stays open.

| Rout, fresh fights (3,075: naive and typical players with Skull counterfactuals, 32 seeds; casual/engaged/whale bots, 4 seeds × 14 days) | losses costing ≤ 2 heroes | would-be wins that retreat |
|---|---|---|
| HP check only | 64% | 0.4% |
| projected loss | **98.7%** | **0.7%** |

The only would-be wins that retreat in numbers are the Skulls the naive player walks past (20 of 389, 5.1%); the committed fights almost never do (1 of 1,595). No loss is bloodier than under the HP check.

Other review findings:

- **Act I Paths were tuned to the test seeds.** Retuned (section 2): the first values broke the brief's ≤ 5% for the typical player (9.3%) and regressed F11–F25 (11.7% → 14.1% would-be deaths).
- **The scout's "The tower eases off" note missed a tempo-eased Versace.** For a roster whose plain cap sits above the static curve but whose tempo-weighted cap does not (e.g. a Lv70 roster at F41), `isMercyCapped` is false while Versace is built lighter. The scout now reads `isMercyCapped || isTempoEased` (`tower.ts`), with a test.
- **Whale seeds 2 and 6 end on F87/F80 (were F100/F99).** A bot artifact, not a wall: the bot retries a lost floor only once its party is 10% stronger or the scout stops saying Deadly. Under the HP rule the early-Act-VII losses cost more heroes (seed 6: 3 per F81 loss; seed 2: 16 dead by day 3, top-five CP 12.4k → 8.1k), so the rebuilt party was soon "10% stronger" than the one that lost. The 2-dead routs leave a near-capped whale party (top five ≈ 11.3k–12.3k CP, flat) that never gains 10% in the remaining days. The whale median is unchanged (F100).
