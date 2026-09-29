# Training Center — Vertical-Slice Spec

> **Status:** Design · **Date:** 2026-09-29 · **Owner layers:** Layer 1 §2.4 (the Master's lever
> on auto-learn) + Layer 3 §B2 (facility row "Training Center: skill-refine speed; max trainable
> skill grade").
> **Follows:** the Skills slice (`2026-06-16-skills-design.md`), which shipped auto-learn and
> deferred the Training Center as "the Master's lever to *bias which* skills develop".

## Canon anchors (inviolable)

- **Training ≠ leveling:** training raises no attributes, grants no hero XP, never changes level
  (bible "Leveling & Stats"; Layer 0 §3.4). It only refines/learns *skills*.
- **Trained skills** are a skill source of their own (Layer 1 §2.1 taxonomy: "Trained — Training
  Center — learned/refined over time").
- The facility **levels up** like every other lobby facility; its level sets refine speed and the
  maximum trainable grade (Layer 3 §B2).

## 1. The loop

The Master picks a hero and a skill and starts a **drill** — a world-time timer (like a promotion).

| Drill | Precondition | On completion |
|---|---|---|
| **Refine** an owned skill | grade ≤ max trainable grade; skill below its cap | +`drillXp(level)` use-XP → level-ups → merges |
| **Learn** a trainable skill | `trainable` skill the hero lacks; grade ≤ max trainable grade | skill added at Lv1 → merges |

- Completion runs the **same pure fold** as post-combat learning (`awardSkillXp` → `resolveMerges`),
  so a drill can finish a merge (e.g. train Composure to Lv3 → Exceed).
- **A hero in training is in the yard:** tower and daily runs skip them (like a Sanity-0 hero).
- Gems skip a drill (`SKIP_TIMER kind: 'training'`), matching promotion/facility skips.
- A completed drill feeds a little Master XP (every lobby completion does).

## 2. Facility

- New `FacilityId` **`trainingCenter`**, starts at **level 0 (not built)**; buildable from
  **Master Lv 2**. The Promotion Chamber's hard-coded unlock becomes a per-facility
  `unlockMasterLevel` table, so both gates share one rule.
- Level effects (`TUNING.skills.training`):
  - `maxGrade` thresholds: Lv1 → E, Lv2 → D, Lv4 → C, Lv6 → B (merge results stay merge-only).
  - `drillXp(L) = base + perLevel × (L − 1)`.
  - Drill duration: fixed world-time (`drillDurationMs`).
  - Gold cost by grade (`drillGold[grade]`), ×`learnMult` for a learn drill.

## 3. Data (schema v4 → v5)

```
OwnedHero.training: { skillId: string; mode: 'refine' | 'learn'; completesAtWorld: number } | null
GameState.facilities.trainingCenter: FacilityState   // { level: 0, build: null } on migration
SkillDef.trainable: boolean                            // canon trained list
```
Trainable (first pass): Basic Swordsmanship, Basic Shield, Berserk, Composure, Calmness,
Sword Soul, Ganggyeok. Exceed/Ixid/Pathology/Sword-Shield Technique remain **merge-only**; the
original five stay innate/promotion skills (refinable, not learnable).

## 4. Commands

```
| { type: 'TRAIN_SKILL'; heroId: HeroId; skillId: string }   // mode inferred: owned → refine, else learn
| { type: 'SKIP_TIMER'; kind: 'facility' | 'promotion' | 'training'; id: string }
```
`TRAIN_SKILL` throws when: centre not built · hero dead / promoting / already training · skill
above max grade · refine of a capped skill · learn of a non-trainable or owned skill · not
enough gold.

## 5. Lobby

A **Training Yard** room east of the Great Hall (sand floor, training dummies, a drill board —
the interaction point). The Tower Gate moves to the hall's west wall. Heroes with a drill in
progress stand in the yard. The facility window shows level, max grade, XP per drill, drills in
progress (countdown + gem skip) and a "new drill" picker (hero → skill, with cost/time).

## 6. Testing

- `training.test.ts`: max grade by level, drillXp, eligibility/refusals, start pays gold + sets
  timer, completion refines/learns and resolves merges, skip, no stat/level change.
- time: drills complete in `advanceTime`; facilities: shared unlock table; tower/daily: training
  heroes don't deploy; account: fresh v5 + v4→v5 migration; store: `TRAIN_SKILL` + skip.
- world: the yard and drill board are reachable; smoke: the Training Center window opens and is
  gated by Master Level.
