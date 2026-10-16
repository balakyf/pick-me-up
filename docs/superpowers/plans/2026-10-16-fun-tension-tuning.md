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

- Path in Act I (F3–F9) is still all Safe for the naive player. Its static curve (≈ 0.8× the roster) sits below any cap. Making it Fair would need a higher `earlyLift`, which lifts every bot's Path by up to +20% through F35. The tension in Act I comes from the F5/F10 bosses and the Skull on every floor.
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
