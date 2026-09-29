/**
 * Layer 2 — content/encounter assembly + floor resolution (the tower).
 *
 * This module owns the seam between the persisted GameState and one floor attempt:
 *   - floorPower / mobLevel : the floor's power budget + enemy level scaling
 *   - buildEncounter        : turn (state, floor) into a battle-ready Encounter,
 *                             either from an authored anchor (F5/F10) or by
 *                             power-budget-filling a biome enemy pool
 *   - playFloor             : build the party's CombatUnits, run ONE battle, then
 *                             interpret the result into gold/XP/permadeath and a
 *                             fresh GameState (never mutating the input)
 *
 * Everything is PURE and DETERMINISTIC. All randomness flows through the seeded
 * RNG sub-streams (rngFor / hash); no transcendental math (powerBase^f is a
 * multiply loop, not Math.pow / `**`). Rounding is Math.round (round-half-up for
 * non-negatives), per the engine-wide policy.
 */

import { TUNING } from '../tuning'
import type {
  GameState,
  Encounter,
  EnemyWave,
  Mission,
  CombatUnit,
  FocusDirective,
  FloorResult,
  OwnedHero,
  HeroId,
  Line,
  AnchorDef,
  EnemyTemplate,
  Element,
  MaterialId,
  Seed,
  SkillProgress,
} from '../types'
import { buildCombatUnit, buildEnemyUnit } from '../unit'
import { runBattle } from '../combat'
import { ENEMY_TEMPLATES, ANCHORS, SKILLS } from '../content'
import { applyXp } from '../stats'
import { clampSanity } from '../kitchen'
import { attrStoneId } from '../promotion'
import { tacticalFocusBonus } from '../tactical'
import { addMasterXp } from '../master'
import { foldBattleSkills } from '../skills'
import { hash, rngFor, nextInt, chance, pick, type Rng } from '../rng/rng'

const T = TUNING.tower
const ECON = TUNING.economy
const SAN = TUNING.lobby.sanity
const MD = TUNING.lobby.materialDrops

// ─────────────────────────────────────────────────────────────────────────────
// Floor power budget + enemy level
// ─────────────────────────────────────────────────────────────────────────────

/** powerBase^f via an integer-exponent MULTIPLY LOOP (no Math.pow / `**`). */
function powLoop(base: number, exp: number): number {
  let acc = 1
  for (let i = 0; i < exp; i++) acc *= base
  return acc
}

/**
 * The floor's target combat-power budget (Layer 2 §3):
 *   floorPower(f) = base * powerBase^f * (1 + stepBonus*floor(f/5)) * worldMult.
 * Used ONLY for the filler ±budgetTolerance comparison — never a combat input.
 * Strictly increasing in f (powerBase > 1, stepBonus >= 0, worldMult > 0).
 */
export function floorPower(f: number, worldMult: number): number {
  return T.base * powLoop(T.powerBase, f) * (1 + T.stepBonus * Math.floor(f / 5)) * worldMult
}

/** The enemy level for filler/anchor mobs on a floor: round(f * perFloor * worldMult). */
export function mobLevel(f: number, worldMult: number): number {
  return Math.round(f * T.mobLevelPerFloor * worldMult)
}

/**
 * Sanity lost by each DEPLOYED SURVIVOR on a floor attempt (Layer 3 §3.2):
 *   base + k × (floorPower / partyCP), capped at driftMax, then
 *   + wipePenalty    when the attempt fails (a defeat is hard on morale),
 *   + witnessPenalty when an ally permadied this battle (canon: bad for morale).
 * A non-positive partyCP collapses the ratio term to 0. Returns a rounded, non-negative int.
 * Pure — no state, just the tuning curve.
 */
export function sanityDrain(
  floorPwr: number,
  partyCp: number,
  cleared: boolean,
  anyAllyDeath: boolean,
): number {
  const ratio = partyCp > 0 ? floorPwr / partyCp : 0
  let drain = Math.min(SAN.driftBase + SAN.driftPerPowerRatio * ratio, SAN.driftMax)
  if (!cleared) drain += SAN.wipePenalty
  if (anyAllyDeath) drain += SAN.witnessPenalty
  return Math.round(drain)
}

/**
 * The thin tower material trickle (Layer 3 §3.5/§3.6). On a clear, roll up to one
 * Promotion Stone and one element-matched Attribute Stone, with both chances
 * boosted on a first clear. The Attribute Stone's element is seeded-picked from the
 * DEPLOYED party's elements (no deployed heroes → no Attribute Stone). PURE and
 * deterministic in (accountSeed, floor, attemptIndex, firstClear, deployedElements).
 * Daily Dungeons are the primary, targeted source (Phase 5); this is a faucet trickle.
 */
export function rollMaterialDrops(
  accountSeed: Seed,
  floor: number,
  attemptIndex: number,
  firstClear: boolean,
  deployedElements: Element[],
): Record<MaterialId, number> {
  const drops: Record<MaterialId, number> = {}
  const mult = firstClear ? MD.firstClearMult : 1
  let r = rngFor(accountSeed, 'loot', floor, attemptIndex)

  const stone = chance(r, Math.min(1, MD.promotionStoneChance * mult))
  r = stone.rng
  if (stone.value) drops.promotionStone = 1

  const attr = chance(r, Math.min(1, MD.attrStoneChance * mult))
  r = attr.rng
  if (attr.value && deployedElements.length > 0) {
    const el = pick(r, deployedElements)
    r = el.rng
    drops[attrStoneId(el.value)] = 1
  }

  return drops
}

/** worldMult for a state's worldGrade. */
function worldMultFor(state: GameState): number {
  return T.worldMult[state.worldGrade]
}

// ─────────────────────────────────────────────────────────────────────────────
// Biome enemy pools (Layer 2 §3.1)
// ─────────────────────────────────────────────────────────────────────────────

/** Prairie band (F1-9): the slice's filler pool for floors 1-10. */
const PRAIRIE_POOL: readonly string[] = ['goblin', 'wolf', 'harpy']

/** Select the filler enemy pool for a floor by act band. The slice covers F1-10,
 *  which all fall in the Prairie band (F11+ Ruins come later). */
function fillerPoolForFloor(_floor: number): EnemyTemplate[] {
  return PRAIRIE_POOL.map((id) => ENEMY_TEMPLATES[id]!)
}

// ─────────────────────────────────────────────────────────────────────────────
// Anchor encounter assembly (F5, F10)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an Encounter from an authored AnchorDef. Each AnchorWaveSpec group becomes
 * `count` enemies at mobLevel(floor) + (levelBonus ?? 0), carrying the spec's
 * keywords/targetTag. Instance ids are stable: `e${floor}_w${w}_${i}`.
 *
 * The authored core (wave structure, counts, boss keywords, mission) is FIXED;
 * the seed is reserved for minor trim only (none in the slice), so anchors are
 * fully reproducible from their AnchorDef alone.
 */
function buildAnchorEncounter(
  anchor: AnchorDef,
  floor: number,
  worldMult: number,
): { waves: EnemyWave[]; mission: Mission } {
  const level = mobLevel(floor, worldMult)
  const waves: EnemyWave[] = []

  for (let w = 0; w < anchor.waves.length; w++) {
    const specGroups = anchor.waves[w]!
    const units: CombatUnit[] = []
    let unitIndex = 0
    for (const spec of specGroups) {
      const template = ENEMY_TEMPLATES[spec.templateId]
      if (template === undefined) continue
      for (let c = 0; c < spec.count; c++) {
        const instanceId = `e${floor}_w${w}_${unitIndex}`
        unitIndex++
        units.push(
          buildEnemyUnit(template, level, instanceId, {
            levelBonus: spec.levelBonus,
            keywords: spec.keywords,
            targetTag: spec.targetTag,
          }),
        )
      }
    }
    waves.push({ units })
  }

  const mission: Mission = {
    type: anchor.missionType,
    objectives: anchor.objectives,
    timer: anchor.timer,
  }

  return { waves, mission }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filler encounter assembly (power-budget fill)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a single-wave filler encounter by power-budget filling:
 *   budget = floorPower(floor)
 *
 * Repeatedly pick a biome enemy (deterministically from the floor rng) at
 * mobLevel(floor) and add it, summing CP, until the running total lands within
 * ±budgetTolerance of the budget OR adding one more enemy would move ΣCP STRICTLY
 * FURTHER from the budget than stopping now. At least one enemy is always produced
 * and the result is the closest reachable total to the budget.
 *
 * NOTE: the first-pass tuning makes a single Prairie enemy's CP already exceed the
 * full floorPower budget on the low filler floors (1-9), so the closest reachable
 * total there is exactly one enemy — which sits ABOVE the +10% band. This is a
 * tuning/contract gap between floorPower's scale and combatPower's scale (recorded
 * in the module result `issues`), not a logic bug: the algorithm still produces the
 * best-fit, and on floors whose budget can hold ≥1 enemy within tolerance it lands
 * inside the band.
 */
export function buildFillerEncounter(
  floor: number,
  worldMult: number,
  rng: Rng,
): { waves: EnemyWave[]; mission: Mission } {
  const pool = fillerPoolForFloor(floor)
  const budget = floorPower(floor, worldMult)
  const level = mobLevel(floor, worldMult)
  const lowerBound = budget * (1 - T.budgetTolerance)

  const units: CombatUnit[] = []
  let totalCp = 0
  let r = rng
  let i = 0

  // Bounded loop: each iteration adds >= 1 CP toward a finite budget, so this
  // terminates well within the cap (the cap only guards against degenerate input).
  while (i < 10000) {
    // Deterministically pick a pool template (the floor rng drives the choice).
    const idxDraw = nextInt(r, 0, pool.length - 1)
    r = idxDraw.rng
    const template = pool[idxDraw.value]!
    const candidate = buildEnemyUnit(template, level, `e${floor}_w0_${i}`, {})

    if (units.length > 0) {
      // Already within tolerance → stop (don't risk overshooting the band).
      if (totalCp >= lowerBound) break
      // Stop if adding this enemy moves ΣCP strictly FURTHER from the budget than
      // the current total already is (i.e. we are at the closest reachable point).
      const distNow = Math.abs(budget - totalCp)
      const distAfter = Math.abs(budget - (totalCp + candidate.cp))
      if (distAfter > distNow) break
    }

    units.push(candidate)
    totalCp += candidate.cp
    i++
  }

  const mission: Mission = {
    type: 'Subjugation',
    objectives: [{ kind: 'annihilate' }],
    timer: null,
  }

  return { waves: [{ units }], mission }
}

// ─────────────────────────────────────────────────────────────────────────────
// Encounter (public)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the Encounter for a floor, deterministically from
 * rngFor(state.seed, 'floor', floor) and the account's worldGrade.
 *
 * F5/F10 are authored anchors (ANCHORS[floor]); everything else is a
 * power-budget-filled Subjugation against the floor's biome pool. The optional
 * focus directive is attached so combat can honor it.
 */
export function buildEncounter(state: GameState, floor: number, focus?: FocusDirective): Encounter {
  const worldMult = worldMultFor(state)
  const rng = rngFor(state.seed, 'floor', floor)

  const anchor = ANCHORS[floor]
  const built =
    anchor !== undefined
      ? buildAnchorEncounter(anchor, floor, worldMult)
      : buildFillerEncounter(floor, worldMult, rng)

  const enc: Encounter = {
    floor,
    mission: built.mission,
    waves: built.waves,
    encounterContext: 'tower',
  }
  if (focus !== undefined) {
    enc.focus = focus
    // Tactical Center amplifies the focus lever: a concentrate-fire bonus by level.
    enc.focusBonus = tacticalFocusBonus(state.facilities.tacticalCenter.level)
  }
  return enc
}

// ─────────────────────────────────────────────────────────────────────────────
// Floor resolution (public)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve ONE attempt at state.tower.currentFloor. PURE: never mutates `state`;
 * returns a fresh GameState plus a FloorResult.
 *
 * Flow:
 *   1. Build hero CombatUnits from every non-empty, ALIVE party slot.
 *   2. combatSeed = hash(seed, 'combat', currentFloor, attemptIndex) so each
 *      wipe-retry is independently reproducible.
 *   3. Build the floor Encounter (with focus) and run ONE battle.
 *   4. Interpret: cleared = win; firstClear = floor > highestCleared.
 *   5. Apply gold (floor reward, ×firstClearMult on first clear), grant XP to each
 *      SURVIVING deployed hero, set every fallen hero alive=false (PERMADEATH).
 *   6. Advance position on a clear; else bump attemptIndex (position unchanged).
 */
export function playFloor(
  state: GameState,
  focus?: FocusDirective,
): { state: GameState; result: FloorResult } {
  const floor = state.tower.currentFloor
  const worldMult = worldMultFor(state)

  // ── 1. Build deployed hero units (skip empty slots, dead, and Sanity-0). ────
  const heroUnits: CombatUnit[] = []
  const deployedIds: HeroId[] = []
  const { slots, lines } = state.party
  for (let s = 0; s < slots.length; s++) {
    const heroId = slots[s]
    if (heroId === null || heroId === undefined) continue
    const hero = state.heroes[heroId]
    // Skip empty slots, the dead, and the broken-down (Sanity 0 = cannot deploy).
    if (hero === undefined || !hero.alive || hero.sanity <= 0) continue
    const line: Line = lines[s] ?? 'front'
    heroUnits.push(buildCombatUnit(hero, line, SKILLS, state.inventory))
    deployedIds.push(heroId)
  }

  // ── 2. Combat seed (folds the retry counter). ───────────────────────────────
  const combatSeed = hash(state.seed, 'combat', floor, state.tower.attemptIndex)

  // ── 3. Encounter + battle. ──────────────────────────────────────────────────
  const enc = buildEncounter(state, floor, focus)
  const res = runBattle(heroUnits, enc, combatSeed)

  // ── 4. Interpret. ───────────────────────────────────────────────────────────
  const cleared = res.outcome === 'win'
  const firstClear = cleared && floor > state.tower.highestCleared
  const goldAwarded = cleared
    ? Math.round(ECON.goldPerFloor * floor * worldMult) * (firstClear ? ECON.firstClearMult : 1)
    : 0
  const xpAwarded = cleared ? ECON.xpPerFloor : 0

  // ── 5. Build the next heroes map (permadeath + XP + Sanity), never mutating inputs. ──
  const fallenSet = new Set<string>(res.fallenHeroIds as string[])
  const survivorSet = new Set<string>(res.survivorHeroIds as string[])

  // Sanity drain hits only DEPLOYED SURVIVORS (heroes left in the lobby don't fight).
  const partyCp = heroUnits.reduce((sum, u) => sum + u.cp, 0)
  const drain = sanityDrain(floorPower(floor, worldMult), partyCp, cleared, fallenSet.size > 0)

  const nextHeroes: Record<HeroId, OwnedHero> = {}
  const skillProgress: SkillProgress[] = []
  for (const key of Object.keys(state.heroes) as HeroId[]) {
    const hero = state.heroes[key]!
    if (fallenSet.has(key as string)) {
      // PERMADEATH: a hero that fell this battle is gone.
      nextHeroes[key] = { ...hero, alive: false }
    } else if (survivorSet.has(key as string)) {
      // Deployed survivor: drain Sanity, grant XP on a clear, and auto-learn skills
      // from this battle's casts (level-ups, then merges — Layer 1 §2.4).
      const xp = xpAwarded > 0 ? applyXp(hero.xp, xpAwarded, hero.star) : hero.xp
      const learned = foldBattleSkills(key, hero.skills, res.skillCasts[key as string])
      skillProgress.push(...learned.progress)
      nextHeroes[key] = { ...hero, xp, sanity: clampSanity(hero.sanity - drain), skills: learned.skills }
    } else {
      nextHeroes[key] = hero
    }
  }

  // ── 5b. Material drops (thin trickle, deployed-element-matched, clear-only). ──
  const materialsAwarded: Record<MaterialId, number> = cleared
    ? rollMaterialDrops(
        state.seed,
        floor,
        state.tower.attemptIndex,
        firstClear,
        heroUnits.map((u) => u.element),
      )
    : {}
  const nextMaterials: Record<MaterialId, number> = { ...state.materials }
  for (const id of Object.keys(materialsAwarded)) {
    nextMaterials[id] = (nextMaterials[id] ?? 0) + materialsAwarded[id]!
  }

  // ── 6. Advance tower position. ──────────────────────────────────────────────
  const nextTower = cleared
    ? {
        currentFloor: floor + 1,
        attemptIndex: 0,
        highestCleared: Math.max(state.tower.highestCleared, floor),
      }
    : {
        currentFloor: floor,
        attemptIndex: state.tower.attemptIndex + 1,
        highestCleared: state.tower.highestCleared,
      }

  // ── 6b. Master XP: floor clears feed the Master-Level spine (+first-clear bonus). ──
  const MASTER = TUNING.lobby.master
  const masterXpGain = cleared ? MASTER.xpPerFloorClear + (firstClear ? MASTER.xpPerFirstClear : 0) : 0
  const nextMeta = masterXpGain > 0 ? addMasterXp(state.meta, masterXpGain) : state.meta

  const nextState: GameState = {
    ...state,
    gold: state.gold + goldAwarded,
    materials: nextMaterials,
    heroes: nextHeroes,
    tower: nextTower,
    meta: nextMeta,
  }

  const result: FloorResult = {
    floor,
    cleared,
    firstClear,
    goldAwarded,
    xpAwarded,
    materialsAwarded,
    fallenHeroIds: res.fallenHeroIds,
    skillProgress,
    result: res,
  }

  return { state: nextState, result }
}
