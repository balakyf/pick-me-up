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
