# Act II — The Ruins (Floors 11–20) · Vertical-Slice Spec

> **Status:** Design · **Date:** 2026-09-29 · **Owner layer:** Layer 2 (content & encounters)
> **Source:** Layer 2 §2.1 band table ("11–19 Ruins/City — skeletons, soldiers, mages — F15
> escort/guard, F20 Halgiraf"), §3 enemy scaling, §4 missions; bible Townia/Taoni floor logs.
> **Why now:** the tower stopped at F10 — a run ended after ten floors.

## 1. Scope

| Floors | Content |
|---|---|
| 11–14, 16–19 | **Ruins filler** — per-account seeded, power-budgeted (existing generator), drawn from the Ruins pool; Survival missions mixed in |
| **15** | **Escort** anchor — protect Princess Priasis from an assassination (canon Taoni F15: "escort Princess Priasis — 15-min limit before assassination"; Townia F15 Guard: "soldiers, assassins, mage, knight") |
| **20** | **Subjugation** anchor — the half black dragon **Halgiraf** (canon F20 boss) |

The climbable slice becomes **F1–F20** (`TUNING.tower.sliceTopFloor`).

## 2. Engine

### 2.1 Band-aware filler
`fillerPoolForFloor(f)`: F1–9 Prairie (unchanged), F11–19 Ruins = skeleton, soldier,
dark disciple, **assassin**, **knight**. For Ruins floors the seeded generator also picks the
mission (band weighting, Layer 2 §4.4): mostly Subjugation, some **Survival** (outlast N ticks).
Prairie floors keep their exact draws (no new RNG consumed below F11).

### 2.2 New templates
- **Assassin** (dark, fast, crits; `unitClass: 'archer'` targeting → strikes the lowest-HP
  foe — the escort target).
- **Knight** (physical elite tank).
- **Halgiraf** (boss; dark; huge VIT; `vulnerable: light` — canon "holy power on weapons";
  `enrage` after a set tick — the fight is a race, not a slog).
- `EnemyTemplate.unitClass?` lets a template choose its targeting profile.

### 2.3 NPC allies + the Protect objective
- `Encounter.allies?: CombatUnit[]` — hero-side NPC units flagged `isNpc` (Priasis). They spawn
  with the party, **can be targeted**, **never act**, grant no XP and are never permadeath.
- A party **wipe** counts player heroes only; an NPC alone does not keep a run alive.
- New objective `{ kind: 'protect'; targetTag }` — met while the tagged ally lives; if it
  falls the battle ends with the new outcome **`failed`** (mission failed; not a win).
- `CombatUnitInit.isNpc?` lets the UI draw the ally.

### 2.4 Anchors
- **F15 Escort:** allies = [Priasis, back line]; objectives = survive `f15SurviveTicks` +
  protect(priasis); waves: soldiers + assassins, then assassins + a knight + a dark disciple.
- **F20 Subjugation:** objectives = defeat(halgiraf); wave 1 soldiers + skeletons; wave 2
  Halgiraf (level bonus, light-vulnerable, enrage) + two dark disciples.

## 3. UI
- Tower screen: floors 1–20 grouped **Act I — The Prairie** / **Act II — The Ruins**; slice
  goal = F20.
- Battle: Priasis drawn beside the party (and in the party window as "escort"); Ruins and
  Dragon's-Lair backdrops; sprites for assassin, knight, Halgiraf (a big dragon) and Priasis;
  a **MISSION FAILED** banner.
- Lobby HUD shows floors up to 20.

## 4. Testing
Filler pools by band; Ruins missions include Survival across seeds; Prairie floors unchanged
(golden encounters); F15 builds allies + protect objective; combat: an NPC is targetable, never
acts, doesn't prevent a wipe, and its death ends the battle as `failed`; tower treats `failed`
as not cleared; F20 carries Halgiraf with light vulnerability + enrage; art exists for every new
template.

## Deferred
Bonus/event floors after anchors (Layer 2 §5.1), multi-party raid anchors (canon 3-party F20),
the ballista/altar scale-break puzzle, Act III (F21–30 Swamp).
