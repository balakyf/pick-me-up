# Combat Depth · bonds, formation, floor modifiers, the Enemy Codex

> **Status:** Built (first pass) · **Date:** 2026-09-30 · Builds on the Living Lobby (same date) and schema v11.

## Goal

Battles resolved as a pure stat check: who a hero lived with, where they stood and what the
floor was like changed nothing. This slice makes four levers matter without adding a
single new screen to learn: the **relationships** Quanton Life already grows, the
**front / mid / back lines** the party board already has, **floor conditions** from F40,
and an **Enemy Codex** that remembers every monster the Master has met.

Everything stays in the pure engine. Combat reads its new inputs from the `Encounter`
(`bonds`, `modifiers`) built at battle start, so `runBattle` remains a function of its
arguments. Every new roll is **gated on a positive chance**: a battle with no bonds and no
modifiers draws exactly the same RNG stream as before (the golden snapshot and every old
replay are untouched). Formation draws nothing.

Numbers live in `src/engine/depth/depthTuning.ts` (`DEPTH`), not in the shared `TUNING`.

## 1. Bonds in battle (`depth/synergy.ts`, `depth/combatDepth.ts`)

`partyBonds(state, deployedIds)` reads `state.life.relations` and the life thresholds
(`bondOf`: friend ≥ 30, close friend ≥ 60, rival ≤ −30, grudge ≤ −60). The tower and the
daily attach them as `Encounter.bonds` (`withBonds`). PvP, tournaments and the guild raid
fight without them (for now).

| Bond | Effect |
|---|---|
| **Close friend** | **Cover** — when a blow would kill a hero, a close friend on the same or a neighbouring line who would survive it may take it instead. Chance 25% at affinity 60, +0.6% per point above, max 50%; once per pair per battle. Also follows up (below) at 18%. |
| **Friend** | **Follow-up** — when a friend strikes (single target, or the front-most foe still standing after a sweep), the other may add a strike at ×0.5 of their free basic attack: 10% (18% for close friends). One follow-up per action; follow-ups never chain. |
| **Rival** | +8% damage while the rival stands (competing for kills); 20% chance per action to ignore a Focus order and chase another target. |
| **Grudge** | as Rival, plus a 5% miss chance while fighting beside them. |

New `CombatEvent`s: `cover` (unitId, allyId, actorId — the next `hit` lands on the
coverer), `followup` (unitId, allyId, targetId — the next `hit` is the strike), `rivalry`
(unitId, rivalId, targetId — precedes the rival's `act`). A grudge miss reuses `miss`.
BattleScene captions them through `src/ui/battle/synergyCaptions.ts`.

## 2. Formation (`depth/formation.ts`)

Only heroes hold lines (units with a `sourceHeroId`; monsters and mission NPCs ignore
formation, so enemy statlines and all tower budgets are unchanged).

| Damage dealt | front | mid | back |
|---|---|---|---|
| warrior, spearman | 100% | 95% | 85% |
| thief | 100% | 100% | 90% |
| archer, mage | 85% | 100% | 108% |
| classless | 100% | 100% | 100% |

- **Back-line cover:** a back-line hero takes ×0.88 while any front-line ally stands.
- **Mid-line support:** a front-line hero takes ×0.95 while a mid-line ally stands; a
  mid-line hero's healing (lifesteal) is ×1.2.

The pre-battle **Bonds & formation** panel (`src/ui/tower/SynergyPanel.tsx`, under the
scouting report) lists each bonded pair with its effect (rivalries first, top five) and
each hero's line effect, with a hint when a hero stands on a bad line for their class.

## 3. Floor modifiers (`depth/floorMods.ts`)

`floorModifiers(seed, floor)` — its own stream `rngFor(seed, 'floormods', floor)`. None below
F40 and never on an anchor floor. From F40: 45% of floors carry one; from F60, 12% of
those carry two (≈5% of deep floors), never the same twice. The Wailing Wall (F80–89) uses
the wall seed, so its conditions are the same for every Master, like its enemies.
`buildEncounter` attaches them as `Encounter.modifiers`; combat announces them with a
`floor-mods` event right after `battle-start`.

| Modifier | Effect (both sides unless noted) |
|---|---|
| 🌫 Fog | +10% miss chance on every blow |
| 🌕 Blood Moon | enemies deal +15%; enrage timers (and looming wake-ups) fire at ×0.75 |
| ✚ Holy Ground | light ×1.3, dark ×0.7 |
| ☠ Miasma | healing ×0.5 |
| 🌪 Gale | action gauges fill ×1.25 |
| ❄ Frost | fire ×0.75, water ×1.25 |

Shown in the scouting report (with the rule) and as an icon badge on the floor list for the
current floor and every floor below it.

## 4. The Enemy Codex (`codex/codex.ts`, `state.codex`)

`CombatUnit.templateId` / `CombatUnitInit.templateId` carry the enemy template into the
log. `recordBattle(codex, log, { studied })` is the one seam, called by the tower
(`playFloor`), the daily, tournament rounds and the guild raid:

- **seen** +1 per battle the template actually appeared in (a wave that never spawned was
  not met); **defeated** +1 per death; **floors** — distinct floors met (max 12).
- **studied** when the battle's floor had been scouted (`meta.peekedFloors`: a scholar's
  research or a Devoted hero's peek), or after **3** kills.

`CodexEntry` gained `floors: number[]` (the slice default is still `{ entries: {} }`, so
v11 saves need no migration).

UI: `src/ui/codex/CodexWindow.tsx`, opened from the Tower screen and the Library's panel.
A grid of every template in act order (filter by act) with its generated sprite; unmet
enemies are dark silhouettes named "???"; met ones show name, family and kills; the
detail pane adds battles, floors, and — once studied — element, weak elements (wheel
counter + `vulnerable`), immunities, resistances and traits. The scouting report marks
studied enemies 📖 and prints what beats them inline.

## 5. Balance (playtest bots, `npm run sim -- 30 2`)

| Profile | Before (floor · dead) | After |
|---|---|---|
| casual | F76, F75 · 47, 40 | F78, F79 · 32, 16 |
| engaged | F41, F78 · 63, 62 | F69, F69 · 71, 27 |
| whale | F79, F79 · 56, 10 | F79, F79 · 30, 10 |

On 4 seeds against a control with every depth effect zeroed, median floors are unchanged
(casual 79 vs 76, engaged 69 vs 69, whale 79 vs 79) and nobody clears the F80 Wall; the net
effect is fewer deaths (cover and back-line shelter), casual median 20 vs 24, whale 17 vs 30.
The sim's climb is very sensitive to any RNG perturbation, so single-seed swings are noise.

## Deferred

- Bots don't rearrange lines for formation or pick parties for bonds.
- Bonds in PvP / tournament / guild fights; heal-type skills (only lifesteal heals today).
- Codex rewards (a bounty for completing an act's page), and studying from the Codex itself.
- The battle scene has no special animation for a cover (the caption and the hit on the
  coverer carry it).
