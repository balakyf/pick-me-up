# Balance Pass · Simulation-Driven Tuning

> **Status:** Done (first pass) · **Date:** 2026-09-29 · **Tool:** `src/sim/` (`npm run sim -- <days> <seeds>`)

## Method

Deterministic playtest bots play the real game through `reduce()` over simulated
world-time. Three profiles: **casual** (2 sessions/day), **engaged** (4 sessions/day,
every system) and **whale** ($120/week). They rest wounded heroes, counter-pick against
immune enemies, and retry a floor that beat them only once clearly stronger (or after a
week). Each run logs every floor attempt (party CP ÷ floor budget, result, deaths).

Baseline (same bots, pre-pass engine): **every profile stalls at F9 for 60 days.**
After the pass (60 days × 3 seeds): all profiles reach F79–84; the Wailing Wall (F80)
holds as canon says.

## Lock-ups fixed (bugs)

| Problem | Fix |
|---|---|
| F10: both win conditions required killing the "unkillable" Lv999 | New `looming` keyword: sleeps until its enrage tick, never shields a phased wavemate, not needed to clear its wave, heroes don't chase it. F10 waves 16 → 9 enemies. |
| No living heroes + < 1 pull of gold = softlock | `mercySummonAvailable`: one free Normal pull. |
| Flat 90 XP per clear (heroes ~Lv6 at F60) | `floorXp(f) = xpToNext(f) × xpFloorShare` (0.5); bench heroes earn `benchXpShare` (0.5); every daily win grants XP; dailies fought at the party's level. |
| Physical Attribute Stones had no source; Tue trial locked to one element | Rotation includes physical and advances by week; Rank Materials cover missing Attribute Stones 1:1. |
| Wraiths physically immune across Act VI; mages gacha-only (8%) | Wraiths `resist` physical 75%. Classless heroes take a common class at 3★ (canon class change). |
| Starting gold bought one pull | `startingGold` 15,000 (a party of five). |

## Pacing

- `mobLevelPerFloor` 1.25 → 1.0: star caps line up with acts (2★→F20, 3★→F40, 4★→F60, 5★→F80).
  `inflectionLevelPerFloor` 0.9 → 0.3; canon "explodes at F80" = `wallLevelBonus` +20 from F80.
- `earlyBudgetBoost` 4: early floors budgeted ×(1 + 4·(70−f)/70), tapering to ×1 at F70.
- Floor drops scale with depth (1 + ⌊f/10⌋ stones); daily rewards ×(1 + 0.1·highestCleared).
- F20 anchor trimmed (9 → 5 guards).

## Open

- Whales reach the Wall by day 3 (≈50 Advanced pulls on day one).
- More sessions ≠ faster progress (paced by dailies/promotions).
- Gold accumulates late (~1M unused for casual): needs sinks.
- F85+ exercised only by whales; the bots don't use focus, training, transfer or synthesis.

---

## Balance pass 2 (2026-09-30)

> **Status:** Done · **Branch base:** `claude/busy-einstein-ofq1o3` @ 4fbecbe (construction
> sites, combat depth, tower challenges, estate & life all merged).

### Method

Same deterministic bots (`src/sim/`), **30 days × 6 seeds** (seeds 1000 + 7919·i) per
profile, before (4fbecbe) and after. Days are counted from **day 0** (the first day), as in
the act table. The report now also prints the **median floor by day**, **Advanced pulls by
day**, and **lever usage** per run (`SimResult.levers`). `deaths` now counts heroes lost
in battle (tower and raids) only; heroes given up to synthesis are `SACRIFICED`.

The bots now pull the levers the new systems added (engaged and whale; casual stays at
two sessions a day with the core loop):

| Lever | Bot rule |
|---|---|
| Jobs (`ASSIGN_JOB`) | Every open seat gets the bench hero (outside the top 8) with the best aptitude, never one who would resent it; healer → cook → instructor → scholar → merchant → gardener → guard (the forge is left out: it eats stones). Workplaces are built to Lv3 from surplus (≥ 60k gold). |
| Drills (`TRAIN_SKILL`) | At the end of each session, up to 5 of the 8 strongest start the drill with the biggest skill-CP gain (else a refine), keeping 15k gold. |
| Synthesis | At most once a day: with the roster full, salvage 3–5 surplus 1–2★ (outside the top 15 and the party), rescuing onto a rested top hero; a payer also feeds one spare 3★ with ≥ 2 better growth grades into its strongest (`transfer`). |
| Skill transfer (`TRANSFER_SKILL`) | Up to 2 a session: a surplus donor's skill onto a party hero who lacks it, if it raises their skill CP. |
| Retreat (battle order) | On a floor attempt that is lost with deaths, re-resolve with `retreat` the beat after the first hero drops below ⅓ HP (the battle screen's `store.revise`); kept if fewer die. |
| Raids (`TOWER_RAID`) | Once a day, the lowest cleared raid anchor whose weekly chest is still waiting, only if each of three parties (the 15 strongest rested heroes) has ≥ 1.5× the anchor's budget; crew = archers / light / mages. |
| Weekly trial (`WEEKLY_TRIAL`) | Once a day while attempts remain, the strongest heroes the week's rule allows. |
| Duels (`HOST_DUEL`) | One a day between the next two heroes up (ranks 6–13), from spare gold. |
| Advanced pulls | Singles with whatever charge is left (the old bot only ten-pulled, so a charge below 10 stopped a whale entirely); a free player saves to 1,350 gems, then spends the stash. |

### Findings

1. **Paid power is 3★ in bulk, not 5★.** The whale's day-3 Wall came from its first
   crystal charge: ten Advanced pulls are eight 3★ on day 0, i.e. a whole party past the
   F41 "no 3★" wall that holds free players for ~12 days. Metering pulls barely helped
   while the first charge was full: at 10 a real day F79 fell around day 4, and at 3 a real
   day with a full starting charge around day 4–5. With 3 pulls in the starting crystal it
   fell around day 5; starting from an empty crystal it moved to ~day 10 (8 seeds each).
   Gold packages matter far less (a whale with no package gold and 2 pulls/day still made
   F48 by day 1).
2. **The levers broke the Wall.** With retreat the bots keep their best heroes alive at
   F80 instead of feeding a party to it every week, and they get a little stronger each
   try; engaged and whale runs walked through F80 between days 15 and 29. Encounters are
   filled to the **CP budget**, so the Wall's +20 levels mostly trade enemy count for
   level. The bite has to be in the budget.
3. The single ablations are noisy (one lever on its own swings a seed by ±10 floors), but
   retreat, synthesis (the whale's grade transfers) and raids each pushed some runs past F80.
4. **Casual + jobs** made no difference over 16 seeds: finals 59–79 either way (mean 69.8
   vs 69.6), a little slower in mid-run on some seeds. The casual profile keeps jobs off.

### Tuning changes

| Knob | Before | After | Why |
|---|---|---|---|
| Mobius crystal (Advanced pulls) | 10 per world-day, reset each world-day (30 per real day) | holds 10 (`dailyCharge`), **recharges 1 per world-day** (`rechargePerDay`, 3 per real day), a ten-pull needs a full crystal | Meters a payer. A free player earns ~1 pull of gems a day, so the crystal is always full when they have saved up for a ten-pull. |
| New Master's crystal | full | **empty** (`startCharge` 0) | The first charge was the whale's whole head start (finding 1). Free players first reach 1,350 gems around day 10, when the crystal has long been full. |
| `tower.wallPowerMult` (new) | — | **1.8**: F80's anchor (the Wailing Wall itself) is raised to 1.8 × its anchor budget | The gate holds against a party that no longer dies there. Only the gate: F81+ keep their curve, so "a maxed party reaches the summit" (fullClimb tests) and the F90 subversion still hold. When the whole late tower was multiplied, ×1.3 let 6/6 whales through, ×1.6 2/6 and ×1.8 0/6, and it broke the summit contract. |

The summon screen now reads *Crystal charge: n/10 · +1 each world-day*. The crystal state
keeps its shape (`{ day, advancedPulls }` now means pulls not yet recharged as of the last
pull), so there is no schema bump. A save migrated from v9 keeps a full crystal. Tests
that pull Advanced from a brand-new account give it a full crystal. `gacha.test` covers
the recharge.

### Before → after (30 days × 6 seeds, medians)

Highest floor cleared by the end of day *d*:

| Profile | d0 | d1 | d2 | d3 | d5 | d7 | d10 | d14 | d20 | d29 |
|---|---|---|---|---|---|---|---|---|---|---|
| casual before | 6 | 12 | 18 | 24 | 36 | 40 | 40 | 59 | 69 | 79 |
| casual after | 6 | 12 | 18 | 24 | 36 | 40 | 40 | 59 | 69 | 79 |
| engaged before | 14 | 22 | 38 | 40 | 40 | 40 | 40 | 59 | 75 | 79 |
| engaged after | 16 | 32 | 39 | 40 | 48 | 58 | 59 | 79 | 79 | 79 |
| whale before | 25 | 50 | 75 | 79 | 79 | 79 | 79 | 79 | 79 | 79 |
| whale after | 25 | 50 | 59 | 68 | 69 | 77 | 79 | 79 | 79 | 79 |

| Profile | Finals (6 seeds) | Day F79 fell | Past F80 | Battle deaths (median) | Idle gold (median) | Gems left |
|---|---|---|---|---|---|---|
| casual before | 69, 69, 79, 79, 80, 69 | —, —, 19, 27, 23, — | 1/6 | 44 | 156k | 980 |
| casual after | 69, 69, 79, 79, 79, 69 | —, —, 19, 27, 23, — | 0/6 | 44 | 156k | 980 |
| engaged before | 79, 79, 79, 59, 79, 64 | 18, 21, 17, —, 27, — | 0/6 | 57 | 204k | 1,040 |
| engaged after | 77, 79, 79, 79, 79, 79 | —, 22, 11, 12, 16, 10 | 0/6 | 28 | 50k | 692 |
| whale before | 79, 79, 79, 79, 79, 84 | 3, 3, 3, 3, 4, 3 | 1/6 | 28 | 307k | 5.5k |
| whale after | 79 × 6 | 10, 10, 6, 12, 11, 15 | 0/6 | 29 | 304k | 50k |

Act V (F41–60) was cleared on day 17 → 17 (casual), 19 (4/6) → 11 (6/6) (engaged), and
2 → 5 (whale). Act VI was cleared on day 23 → 23 (casual 3/6), 21 (4/6) → 12 (5/6)
(engaged), and 3 → 11 (whale). Whales now make ~89 Advanced pulls in 30 days (2 by the end of day 0,
11 by day 3, 32 by day 10). Before it was ~400 and a roster of ~420; now it is ~90 heroes.

### Lever usage (median per 30-day run)

| Lever | engaged | whale |
|---|---|---|
| Jobs assigned | 71 | 89 |
| Drills started | 467 | 723 |
| Salvage syntheses (heroes sacrificed) | 18 (90) | 14 (70) |
| Transfer syntheses | — | 1 |
| Skill transfers | 28 | 42 |
| Retreats (heroes brought home) | 17 (75) | 16 (72) |
| Raids (cleared / heroes lost) | 18 (18 / 0) | 24 (24 / 1) |
| Weekly trials (best score) | 30 (28 waves) | 30 (29 waves) |
| Duels | 25 | 30 |
| Advanced pulls | 42 | 89 |
| Facility upgrades | 67 | 67 |

Casual: 20 Advanced pulls, 19 upgrades, 18 decorations, 47 bounties, 1 statue.

### Still open

- **Whales hoard ~50k gems.** The crystal meters their pulls, but the bot still buys
  $120 a week. A real payer would stop buying, or want other sinks (timer skips, daily
  retries). The shop could warn when the crystal is empty.
- **The F41 wall is the free game's longest wait:** 3★ come from promotions or the 5 %
  Normal rate. The engaged median now gets past it between days 3 and 5 (was between days
  10 and 14), with retreat keeping its 3★ alive and salvage turning surplus into stones.
  The casual median still sits at F40 from about day 6 until day 10–14.
- **Past the Wall the curve drops:** F81 is far easier than the raised F80 gate. That is
  fine while nobody passes the Wall in 30 days, but it needs a look once post-Wall
  content is paced.
- **Raids at a 1.5× margin never fail**, and the **weekly trial is maxed every week**
  (28–29 of 30 waves; every reward threshold reached). Both reward loops are probably
  too generous for bots that use them. Tune the thresholds, or let bots take riskier
  raids, in the next pass.
- **The engaged bot sacrifices ~90 surplus heroes a month.** The Sanity and favour cost
  to the witnesses is paid once a day at most, but a Master's graveyard fills fast.
- The bots still don't use focus/protect orders, formation lines for bonds, gem timer
  skips, the forge job or captive synthesis.
