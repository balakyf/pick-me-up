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

---

## Combat brain retune (2026-10-02, lane D)

> **Status:** Done · **Base:** 0e7a09b (wave 1 merged) · **Branch:** lane D worktree.
> Lane notes: `docs/superpowers/specs/2026-10-02-lane-d.md`.

### Why the budgets moved

Lane D changed how a fight plays, so a floor's CP now buys a different amount of danger:

- **Skill choice by expected damage** and an **AoE falloff** (a sweep over n foes lands
  ×100 / (100 + 60(n − 1)) on each): from F41 sweeps dealt 87 % of the party's damage, now 46 %.
- **`combat.damageScale` 0.58**: every blow lands at 58 % of the formula, so a late fight lasts
  ~3 rounds a side instead of one alpha strike. HP, CP and budgets are untouched by it.
- **Enemy casters** (an explicit `caster` flag on 11 INT-built templates) hit with mAtk vs mDef.
- Raid boss pools follow the pace: `CHALLENGE.raids.hpMult` 4 → 2.4, so each party still
  carves the same share in its `partyTicks`.

Longer fights in which the enemy acts are deadlier per CP, so the budgets were trimmed:

| Knob | Before | After | Why |
|---|---|---|---|
| `tower.base` | 60 | **38** | Every filler budget ×0.63; with the boost below, ×0.73 at F10 easing to ×0.66 by F70. |
| `tower.earlyBudgetBoost` | 4 | **4.8** | The trim is gentlest early, where fights were already long, deepest late, where the AoE monopoly ended. |
| `tower.latePowerBase` | 1.04 | **1.045** | Past F70 the lower base made Act VI too soft. (1.05 was tried: no gain for whales, engaged Act VI 6 days slower.) |
| `tower.anchorBudgetMult` | 1.1 | **1.4** | The set pieces keep their weight over the fillers. |
| `tower.wallPowerMult` | 1.8 | **2.3** | The Wall stands at about its old CP and holds: 0/6 whales through in 30 days (2.2: 2/6 to F84; 2.4: 0/6; before: 1/6 to F89). |

### Before → after

Same bots, seeds 1000 + 7919·i, 30 days.

**Combat feel from F41** (`npx vite-node src/sim/combatMetrics.ts 30 6`, every floor attempt):

| | AoE share | Median rounds | Enemies act | Deaths / attempt | Median replay 1× (p10–p90) | Win | Overkill |
|---|---|---|---|---|---|---|---|
| before, 6 seeds | 87.1 % | 1.2 | 76.4 % | 0.604 | 25.8 s (9–54) | 74.2 % | 15.6 % |
| after, 6 seeds | **46.0 %** | **3.2** | **99.4 %** | **0.569** | **53.7 s** (14–95) | 76.1 % | 8.3 % |
| before, 3 seeds | 86.7 % | 1.2 | 77.1 % | 0.569 | 25.4 s (9–55) | 74.5 % | 15.6 % |
| after, 3 seeds | 48.1 % | 3.3 | 100 % | 0.649 | 54.6 s (13–101) | 73.1 % | 8.1 % |

Deaths per attempt by profile (6 seeds): casual 0.691 → 0.775, engaged 0.607 → 0.598, whale
0.547 → 0.384. The 3-seed sample reads worse (0.569 → 0.649) because engaged seeds 0 and 2
lose more heroes in Act V–VI (23 → 58 and 29 → 58 dead); seeds 3–5 go the other way (76 → 17,
40 → 27, 16 → 19).

**Progression** (`npm run sim -- 30 6`, medians; highest floor cleared by the end of day *d*):

| Profile | d0 | d1 | d2 | d3 | d5 | d7 | d10 | d14 | d20 | d29 |
|---|---|---|---|---|---|---|---|---|---|---|
| casual before | 6 | 12 | 18 | 24 | 36 | 40 | 40 | 52 | 69 | 79 |
| casual after | 6 | 12 | 18 | 24 | 36 | 40 | 40 | 52 | 75 | 79 |
| engaged before | 16 | 32 | 39 | 41 | 49 | 51 | 70 | 76 | 79 | 79 |
| engaged after | 16 | 32 | 39 | 40 | 45 | 48 | 72 | 79 | 79 | 79 |
| whale before | 25 | 50 | 59 | 67 | 69 | 79 | 79 | 79 | 79 | 79 |
| whale after | 25 | 49 | 67 | 69 | 79 | 79 | 79 | 79 | 79 | 79 |

| Profile | Finals (6 seeds) | Battle deaths (median) | Act V cleared | Act VI cleared |
|---|---|---|---|---|
| casual before | 69, 79, 79, 79, 59, 77 | 26.5 | day 17 (5/6) | day 19 (3/6) |
| casual after | 79, 76, 79, 77, 69, 79 | 30.5 | day 20 (6/6) | day 20 (3/6) |
| engaged before | 79 × 6 | 34.5 | day 11 | day 19 |
| engaged after | 79 × 6 | 39.5 | day 10 | day 16 |
| whale before | 89, 79 × 5 | 24.5 | day 4 | day 12 |
| whale after | 79 × 6 | 25.5 | day 4 | day 8 |

`npm run sim -- 30 3` (the lane's reference run): casual 69/79/79 → 79/76/79, engaged 79 × 3 →
79 × 3, whale 89/79/79 → 79 × 3; dead casual 28/22/20 → 17/44/33, engaged 23/49/29 → 58/52/58,
whale 18/66/26 → 7/38/26.

### Still open

- **Casual dies more** (deaths per attempt 0.69 → 0.78): it never retreats, and fights in
  which the enemy now acts punish a party that stays in to the end. No budget knob separates
  it from the others; a gentler "pull back" rule for casual players belongs to the safety rails
  (war room), not the budgets.
- **Whales clear Act VI sooner** (day 12 → 8) while engaged is close (19 → 16): a single-target
  3★ party gains the most from the brain. The Wall still holds them.
- **Late replays are long at 1×**: F61–79 median 67 s (p90 108 s). Inside the gate, but the
  readability lane should make 2× the comfortable default for long fights, or trim beat timings.

## Skills & roles retune (2026-10-02, lane F)

Lane F gave skills effects (heals, regeneration, shields, buffs and debuffs, DoTs, stuns,
taunts, SP), multi-hit and formation shapes, an SP rhythm, and re-authored the kit so the five
classes play differently (notes: `docs/superpowers/specs/2026-10-02-lane-f.md`). A party with a
healer and a tank lasts longer than one without, so the first runs moved the late game: whales
reached F99 by day 29 and engaged bots broke the Wall, and sustain stretched Wall fights to the
5000-tick clock.

### What moved (and why)

| Knob | Before → after | Why |
|---|---|---|
| `roles.*` (new block) | — | SP rhythm (+4 per action, +12 per bar of HP lost), status clock, cleave share, statusRes weight, the brain's weights (heal ×1.3, lethal ×2, kill value ×1), heal fatigue (−25 % per heal taken, floor 25 %), weariness (−25 % per 100 ticks), the stalemate guard (6 actions per hero, a 3 % step) |
| `tower.wallPowerMult` | 2.3 → 2.6 | at 2.3 engaged bots broke through too |
| `tower.postWallPowerMult` (new) | — → 1.5 | every floor past the Wall: a party that broke the gate walked F81–99 in a day |
| `tower.heraldPowerMult` (new) | — → 1.25 | the anchors from F90 up take this instead (at 1.0 whales walked through the Herald to F93–97; at 1.5 a party of five Lv150 gods could not reach the summit) |

Acts I–VI budgets are unchanged. The golden combat values did not move (Han has no skills; no
new roll is drawn without a chance-based status).

### Before → after (30 days, base 8cf6073)

| | AoE share | Median rounds | Enemies act | Deaths / attempt | Median replay 1× |
|---|---|---|---|---|---|
| before · 6 seeds | 25.4 % | 2.60 | 99.5 % | 0.212 | 44.8 s |
| after · 6 seeds | 18.4 % | 3.00 | 99.4 % | 0.183 | 52.0 s |
| before · 3 seeds | 29.9 % | 2.40 | 99.5 % | 0.199 | 40.2 s |
| after · 3 seeds | 22.0 % | 2.60 | 99.7 % | 0.202 | 48.3 s |

**Progression** (`npm run sim -- 30 6`, medians; highest floor cleared by the end of day *d*):

| Profile | d0 | d1 | d2 | d3 | d5 | d7 | d10 | d14 | d20 | d29 |
|---|---|---|---|---|---|---|---|---|---|---|
| casual before | 6 | 12 | 18 | 24 | 36 | 40 | 40 | 52 | 75 | 79 |
| casual after | 6 | 12 | 18 | 24 | 36 | 40 | 40 | 55 | 79 | 79 |
| engaged before | 16 | 32 | 40 | 40 | 40 | 47 | 78 | 79 | 79 | 79 |
| engaged after | 16 | 32 | 40 | 40 | 59 | 59 | 79 | 79 | 79 | 79 |
| whale before | 25 | 49 | 67 | 78 | 79 | 79 | 79 | 79 | 79 | 84 |
| whale after | 25 | 50 | 72 | 79 | 79 | 79 | 79 | 79 | 84 | 89 |

| Profile | Finals (6 seeds) | Battle deaths (median) |
|---|---|---|
| casual before | 79, 76, 79, 77, 69, 79 | 30.5 |
| casual after | 79, 79, 79, 79, 68, 79 | 16.5 |
| engaged before | 79 × 6 | 8.5 |
| engaged after | 79, 79, 79, 89, 79, 80 | 14 |
| whale before | 84, 84, 79, 79, 86, 89 | 17 |
| whale after | 89, 84, 89, 84, 89, 89 | 8.5 |

`npm run sim -- 30 3`: casual 79/76/79 → 79/79/79, engaged 79 × 3 → 79 × 3, whale 84/84/79 →
89/84/89; dead casual 17/44/33 → 21/29/12, engaged 20/2/9 → 6/17/18, whale 9/18/17 → 5/27/18.

**Roles** (6 seeds, from F41, per fight): heals 4.7, shields 1.3, taunts 2.6, statuses on foes
8.9; healing share 12–14 % in Acts V–VI and 56 % at the Wall.

### Still open

- **Wall fights are long**: F80–100 p90 replay 60 → 201 s at 1× (sustain against sustain).
- **The Wall breaks more often** (whales 4/6 by day 29, one engaged run); the Herald holds.
- **Engaged loses a few more heroes** (median 8.5 → 14 over 30 days) while casual and whales
  lose far fewer; Act V's archers (the Demon's Marksman strikes the weakest) do most of it.

## Enemy kits, telegraphs and phases (2026-10-02, lane G)

Lane G gave every elite and boss its own kit (2–4 abilities, with cooldowns), wound-up big
moves the party can answer, boss phases and summons, and the Master's orders 2.0 (notes:
`docs/superpowers/specs/2026-10-02-lane-g.md`). Base: `365c4ac` (lanes E and F merged).

### What moved (and why)

| Knob | Before → after | Why |
|---|---|---|
| Enemy kits (`content/enemySkills.ts`) | 7 one-skill kits → 75 enemy skills; cooldowns on every boss skill | a boss's SP pool is deep, so its rhythm is set by cooldowns, not SP |
| `e_dragon_breath` | ×0.8 sweep, every turn → ×1.7 sweep, wound up a turn, cooldown 4 | the breath is now an event to answer, not a tax |
| `e_saints_grace` | no cooldown → cooldown 2 | a Saint no longer heals every turn |
| `combat/bossTuning.ts` (new) | — | Guard −30 % for at least a party turn or until the move lands; Protect −50 % on a charged blow; a Focus mark takes a sweep at ≥ 60 %; Hold spends SP on 3+ foes or the boss; one order back per cleared wave |
| Anchor budgets | unchanged | progression stayed within a step of the base (below), so no budget was retuned; reserves (summons) scale with their anchor but are not counted in its budget |

The golden combat values did **not** move: the golden Goblin has no kit, and no new roll is
drawn (charges, phases, summons, cooldowns and orders are all deterministic).

### Before → after (30 days, from F41, every attempt)

| | AoE share | Median rounds | Enemies act | Deaths / attempt | Median replay 1× |
|---|---|---|---|---|---|
| before · 6 seeds | 19.0 % | 3.40 | 99.4 % | 0.179 | 46.0 s |
| **after · 6 seeds** | **19.5 %** | **3.40** | **99.1 %** | **0.167** | **48.0 s** |
| before · 3 seeds | 23.0 % | 3.20 | 99.7 % | 0.212 | 43.3 s |
| after · 3 seeds | 20.4 % | 3.40 | 99.0 % | 0.161 | 50.3 s |

Every gate passes at both sample sizes.

**Progression** (`npm run sim -- 30 6`, medians; highest floor cleared by the end of day *d*):

| Profile | d0 | d1 | d2 | d3 | d5 | d7 | d10 | d14 | d20 | d29 |
|---|---|---|---|---|---|---|---|---|---|---|
| casual before | 6 | 12 | 18 | 24 | 36 | 40 | 40 | 55 | 79 | 79 |
| casual after | 6 | 12 | 18 | 24 | 36 | 40 | 40 | 56 | 79 | 79 |
| engaged before | 16 | 32 | 40 | 40 | 59 | 59 | 79 | 79 | 79 | 79 |
| engaged after | 16 | 32 | 39 | 40 | 67 | 79 | 79 | 79 | 79 | 80 |
| whale before | 25 | 50 | 72 | 79 | 79 | 79 | 79 | 79 | 84 | 89 |
| whale after | 25 | 49 | 72 | 79 | 79 | 79 | 79 | 79 | 84 | 89 |

| Profile | Finals (6 seeds) | Dead (median) |
|---|---|---|
| casual before | 79, 79, 79, 79, 64, 79 | 16.5 |
| casual after | 79, 79, 79, 79, 72, 79 | 19 |
| engaged before | 79, 84, 79, 89, 79, 79 | 12 |
| engaged after | 80, 84, 79, 80, 79, 89 | 9 |
| whale before | 84, 89, 89, 84, 89, 89 | 11.5 |
| whale after | 89, 89, 89, 85, 89, 89 | 14 |

`npm run sim -- 30 3`: casual 79/79/79 → 79/79/79, engaged 79/84/79 → 80/84/79, whale
84/89/89 → 89/89/89; dead casual 21/29/12 → 22/30/11, engaged 20/20/14 → 10/12/5, whale
6/20/16 → 11/17/7.

**Boss beats and orders** (6 seeds, per fight): wind-ups 0.24 from F41 (0.38 at the Wall),
47 % of them answered (cancelled by a stun or a kill, braced for, or covered); phases 0.07;
summoned units 0.08 (0.27 in F41–60: the Egg, Valention). The bots give a Guard or an Unleash
in about 1 % of fights (they re-resolve only fights that went badly).

### Still open (for lane R)

- **The Wall breaks a little more** for whales (5/6 reach F89 by day 29, was 4/6); the Herald
  holds every run. Pryos's seals add aegis, but a whale's sweep strips aegis charges quickly.
- **Engaged climbs Act V faster** (d7 F79, was F59) and loses fewer heroes: the kits make
  foes spend turns on taunts, bracing and wind-ups the party can kill through. Act V filler
  could take a small budget step if lane R wants the old pace back.
- Casual deaths per attempt are level (0.506 → 0.522 over 6 seeds): casual never orders.
