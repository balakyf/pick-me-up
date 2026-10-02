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
  BattleOrder,
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
import { buildCombatUnit, buildEnemyUnit, buildAllyUnit } from '../unit'
import { runBattle } from '../combat'
import { ENEMY_TEMPLATES, ALLY_TEMPLATES, ANCHORS, SKILLS, HIDDEN_OBJECTIVES, actForFloor } from '../content'
import { applyXp, xpToNext } from '../stats'
import { clampSanity } from '../kitchen'
import { releaseGear } from '../equipment'
import { attrStoneId } from '../promotion'
import { tacticalFocusBonus } from '../tactical'
import { addMasterXp } from '../master'
import { foldBattleSkills } from '../skills'
import { withFavor } from '../favor'
import { moraleAdjust } from '../estate/deploy'
import { deployParty, REFUSAL_REASONS } from './deploy'
import { addPi } from '../interference'
import { practice, woundBoss } from '../minigames'
import { floorModifiersFor, withBonds } from '../depth'
import { recordBattle } from '../codex'
import { applyPartyBonuses } from '../challenge/bonds'
import { hash, rngFor, nextInt, nextFloat, chance, pick, makeSeed, type Rng } from '../rng/rng'
import type { HiddenObjective, LoopState, TowerEvent, TowerState, BattleResult } from '../types'

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

/** XP each surviving hero earns for clearing a floor (see TUNING.economy.xpFloorShare). */
export function floorXp(floor: number): number {
  const lvl = Math.max(1, Math.min(floor, TUNING.xp.maxLevel))
  return Math.max(ECON.xpPerFloor, Math.round(xpToNext(lvl) * ECON.xpFloorShare))
}

/**
 * The floor's target combat-power budget (Layer 2 §3):
 *   floorPower(f) = base * powerBase^f * (1 + stepBonus*floor(f/5)) * worldMult.
 * Used ONLY for the filler ±budgetTolerance comparison — never a combat input.
 * Strictly increasing in f (powerBase > 1, stepBonus >= 0, worldMult > 0).
 */
export function floorPower(f: number, worldMult: number): number {
  const early = Math.min(f, T.inflectionFloor)
  const late = Math.max(0, f - T.inflectionFloor)
  // The early climb is budgeted up (tapering to nothing at the inflection), so the first
  // acts ask for a real party instead of falling in an afternoon.
  const boost = 1 + (T.earlyBudgetBoost * Math.max(0, T.inflectionFloor - f)) / T.inflectionFloor
  return (
    T.base *
    powLoop(T.powerBase, early) *
    powLoop(T.latePowerBase, late) *
    (1 + T.stepBonus * Math.floor(f / 5)) *
    boost *
    worldMult
  )
}

/**
 * The enemy level for filler/anchor mobs on a floor: round(f × perFloor × worldMult),
 * plus `inflectionLevelPerFloor` per floor past the F70 inflection (the curve steepens).
 */
export function mobLevel(f: number, worldMult: number): number {
  const inflection = Math.max(0, f - T.inflectionFloor) * T.inflectionLevelPerFloor
  // Canon: the difficulty "explodes" at the Wailing Wall (F80) and never comes back down.
  const wall = f >= T.wallFloor ? T.wallLevelBonus : 0
  return Math.round((f * T.mobLevelPerFloor + inflection + wall) * worldMult)
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
  if (stone.value) drops.promotionStone = 1 + Math.floor(floor / MD.stonesPerTen)

  const attr = chance(r, Math.min(1, MD.attrStoneChance * mult))
  r = attr.rng
  if (attr.value && deployedElements.length > 0) {
    const el = pick(r, deployedElements)
    r = el.rng
    drops[attrStoneId(el.value)] = 1 + Math.floor(floor / MD.attrStonesEvery)
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

/** Is this floor in the Ruins band (Act II)? */
export function isRuinsFloor(floor: number): boolean {
  return floor >= 11 && floor <= 20
}

/** Is this floor part of the Wailing Wall (F80–89, identical for every account)? */
export function isWallFloor(floor: number): boolean {
  return floor >= 80 && floor <= 89
}

/** Select the filler enemy pool for a floor by act band (Layer 2 §2.1). */
export function fillerPoolForFloor(floor: number): EnemyTemplate[] {
  return actForFloor(floor).pool.map((id) => ENEMY_TEMPLATES[id]!)
}

/** Extra enemy levels on the looped F36–40 floors: each scar hardens them. */
export function loopScarLevels(floor: number, loop: LoopState | null): number {
  if (loop === null || floor < T.loop.start || floor > T.loop.gate) return 0
  return loop.scars * T.loop.scarLevels
}

// ─────────────────────────────────────────────────────────────────────────────
// Anchor encounter assembly (every 5th floor)
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
  extraLevels = 0,
  powerMult = 1,
): { waves: EnemyWave[]; mission: Mission; allies: CombatUnit[] } {
  const level = mobLevel(floor, worldMult) + extraLevels
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
            ...(powerMult !== 1 ? { powerMult } : {}),
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

  // Mission NPCs (escort targets) on the hero side — at the floor's base level (an
  // anchor scaled up to its budget doesn't make the escort sturdier).
  const allyLevel = mobLevel(floor, worldMult)
  const allies: CombatUnit[] = []
  for (const [a, spec] of (anchor.allies ?? []).entries()) {
    const template = ALLY_TEMPLATES[spec.templateId]
    if (template === undefined) continue
    allies.push(
      buildAllyUnit(template, allyLevel, `a${floor}_${a}`, {
        line: spec.line,
        targetTag: spec.targetTag,
        levelBonus: spec.levelBonus,
      }),
    )
  }

  return { waves, mission, allies }
}

/**
 * Above F20 an anchor is raised to its floor: while its total CP is below
 * `floorPower × anchorBudgetMult`, every enemy grows elite (attributes ×elitePowerStep a
 * step; levels stay canon). Acts I–II keep their authored statlines exactly.
 * Deterministic; bounded.
 */
function buildScaledAnchor(
  anchor: AnchorDef,
  floor: number,
  worldMult: number,
  extraLevels: number,
): { waves: EnemyWave[]; mission: Mission; allies: CombatUnit[] } {
  let built = buildAnchorEncounter(anchor, floor, worldMult, extraLevels)
  if (floor <= 20) return built
  // The Wailing Wall itself (F80's anchor) stands far above its floor's budget: the gate holds.
  const wall = floor === T.wallFloor ? T.wallPowerMult : 1
  const target = floorPower(floor, worldMult) * T.anchorBudgetMult * wall
  const cpOf = (b: { waves: EnemyWave[] }) => b.waves.reduce((n, w) => n + w.units.reduce((m, u) => m + u.cp, 0), 0)
  let mult = 1
  for (let i = 0; i < 400 && cpOf(built) < target; i++) {
    mult *= T.elitePowerStep
    built = buildAnchorEncounter(anchor, floor, worldMult, extraLevels, mult)
  }
  return built
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
  extraLevels = 0,
): { waves: EnemyWave[]; mission: Mission } {
  const pool = fillerPoolForFloor(floor)
  const budget = floorPower(floor, worldMult)
  const lowerBound = budget * (1 - T.budgetTolerance)

  // Fill one wave; a wave that hits the unit cap still short of budget is refilled with
  // elite enemies (late floors grow stronger, not more crowded). Early floors never
  // reach the cap, so their draws are exactly as before.
  const level = mobLevel(floor, worldMult) + extraLevels
  let mult = 1
  let fill = fillWave(pool, budget, lowerBound, level, floor, rng, mult)
  for (let i = 0; i < 400 && fill.units.length >= T.fillerMaxUnits && fill.totalCp < lowerBound; i++) {
    mult *= T.elitePowerStep
    fill = fillWave(pool, budget, lowerBound, level, floor, rng, mult)
  }
  const units = fill.units
  let r = fill.rng

  // Band-weighted mission (Layer 2 §4.4). Prairie floors are always Subjugation and
  // draw nothing extra, so their encounters stay byte-identical.
  let mission: Mission = {
    type: 'Subjugation',
    objectives: [{ kind: 'annihilate' }],
    timer: null,
  }
  const mix = actForFloor(floor).missions
  if (mix === 'ruins') {
    const roll = chance(r, T.ruinsSurvivalChance)
    r = roll.rng
    if (roll.value) {
      mission = {
        type: 'Survival',
        objectives: [{ kind: 'survive', ticks: T.ruinsSurviveTicks }],
        timer: T.ruinsSurviveTicks,
      }
    }
  } else if (mix === 'late') {
    const roll = nextFloat(r)
    r = roll.rng
    if (roll.value < T.lateSurvivalChance) {
      mission = { type: 'Survival', objectives: [{ kind: 'survive', ticks: T.lateSurviveTicks }], timer: T.lateSurviveTicks }
    } else if (roll.value < T.lateSurvivalChance + T.lateEscapeChance) {
      mission = { type: 'Escape', objectives: [{ kind: 'reach', distance: T.escapeDistance }], timer: null }
    }
  } else if (mix === 'coast') {
    // Seizure: one of the enemies carries the cache; taking it wins the floor.
    const roll = chance(r, 0.4)
    r = roll.rng
    if (roll.value && units.length > 0) {
      units[units.length - 1] = { ...units[units.length - 1]!, targetTag: 'cache_bearer' }
      mission = { type: 'Seizure', objectives: [{ kind: 'acquire', targetTag: 'cache_bearer' }], timer: null }
    }
  } else if (mix === 'wall') {
    mission = { type: 'Conquest', objectives: [{ kind: 'annihilate' }], timer: null }
  }

  return { waves: [{ units }], mission }
}

/**
 * The power-budget fill for one wave: repeatedly pick a pool enemy (the floor rng
 * drives the choice) and add it until ΣCP lands within tolerance, adding one more
 * would move it further from the budget, or the unit cap is reached. Always ≥ 1 unit.
 */
function fillWave(
  pool: EnemyTemplate[],
  budget: number,
  lowerBound: number,
  level: number,
  floor: number,
  rng: Rng,
  powerMult = 1,
): { units: CombatUnit[]; totalCp: number; rng: Rng } {
  const units: CombatUnit[] = []
  let totalCp = 0
  let r = rng
  let i = 0
  while (i < 10000) {
    if (units.length >= T.fillerMaxUnits) break
    const idxDraw = nextInt(r, 0, pool.length - 1)
    r = idxDraw.rng
    const template = pool[idxDraw.value]!
    const candidate = buildEnemyUnit(template, level, `e${floor}_w0_${i}`, powerMult !== 1 ? { powerMult } : {})

    if (units.length > 0) {
      // Already within tolerance → stop (don't risk overshooting the band).
      if (totalCp >= lowerBound) break
      // Stop if adding this enemy moves ΣCP strictly FURTHER from the budget.
      const distNow = Math.abs(budget - totalCp)
      const distAfter = Math.abs(budget - (totalCp + candidate.cp))
      if (distAfter > distNow) break
    }

    units.push(candidate)
    totalCp += candidate.cp
    i++
  }
  return { units, totalCp, rng: r }
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
  // The Wailing Wall overrides the account seed: the same Fragment Series for everyone.
  const seed = isWallFloor(floor) ? makeSeed(T.wallSeed) : state.seed
  const rng = rngFor(seed, 'floor', floor)
  const scar = loopScarLevels(floor, state.tower.loop)

  const anchor = ANCHORS[floor]
  const built: { waves: EnemyWave[]; mission: Mission; allies?: CombatUnit[] } =
    anchor !== undefined
      ? buildScaledAnchor(anchor, floor, worldMult, scar)
      : buildFillerEncounter(floor, worldMult, rng, scar)

  const enc: Encounter = {
    floor,
    mission: built.mission,
    waves: built.waves,
    encounterContext: 'tower',
  }
  if (built.allies !== undefined && built.allies.length > 0) enc.allies = built.allies
  // Combat depth: the floor's conditions (Fog, Blood Moon…) from F40.
  const modifiers = floorModifiersFor(state, floor)
  if (modifiers.length > 0) enc.modifiers = modifiers
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
/** Mid-battle orders (focus / protect) the Master may give per battle: one, plus one per
 *  two Tactical Center levels. Retreat is always possible. */
export function ordersAllowed(state: GameState): number {
  return 1 + Math.floor(state.facilities.tacticalCenter.level / 2)
}

export function playFloor(
  state: GameState,
  focus?: FocusDirective,
  ballista?: number,
  subvert?: boolean,
  orders?: BattleOrder[],
): { state: GameState; result: FloorResult } {
  const floor = state.tower.currentFloor
  const commands = (orders ?? []).filter((o) => o.kind !== 'retreat').length
  if (commands > ordersAllowed(state)) throw new Error(`playFloor: the Tactical Center can relay only ${ordersAllowed(state)} orders a battle`)
  const worldMult = worldMultFor(state)
  if (state.tower.event !== null) {
    throw new Error(`playFloor: an event floor after F${state.tower.event.floor} is waiting to be resolved`)
  }
  if (floor > T.sliceTopFloor) throw new Error('playFloor: the summit has been reached')
  if (subvert && (floor !== T.worldEndFloor || state.tower.hiddenFound.length < TUNING.lifecycle.subvertTruths)) {
    throw new Error(`playFloor: only a Master who knows ${TUNING.lifecycle.subvertTruths} truths can subvert the ninetieth floor`)
  }

  // ── 1. Build deployed hero units through the deploy rails (deploy.ts): the dead, the
  //       away (captive, Ruins, chamber, yard, bounty), the burnt out, the broken (Sanity 0)
  //       and the Wary rebels stay behind — each with the true reason. The rebellion draw
  //       is gated on a positive chance, so everyone else's replays are untouched. ────
  const deployed = deployParty(state, (hero, line) => moraleAdjust(state, buildCombatUnit(hero, line, SKILLS, state.inventory)))
  const heroUnits: CombatUnit[] = deployed.units
  const deployedIds: HeroId[] = deployed.ids
  const refusals = deployed.refusals
  const refusedHeroIds: HeroId[] = refusals.filter((r) => REFUSAL_REASONS.includes(r.reason)).map((r) => r.heroId)
  // Nobody fit to fight: refuse the attempt outright (no loop attempt burned, no wipe of nobody).
  if (heroUnits.length === 0) throw new Error('playFloor: no one is fit to fight')

  // ── 2. Combat seed (folds the retry counter). ───────────────────────────────
  const combatSeed = hash(state.seed, 'combat', floor, state.tower.attemptIndex)

  // ── 3. Encounter + battle. ──────────────────────────────────────────────────
  let enc = buildEncounter(state, floor, focus)
  // BALLISTA (Layer 3 §C2): on anchors that declare it, the boss opens the fight wounded —
  // by the Master's play, or by their tracked skill when the minigame is skipped.
  const anchorDef = ANCHORS[floor]
  let meta = state.meta
  if (anchorDef?.minigame === 'ballista') {
    const perf = ballista ?? state.meta.skill.ballista
    if (ballista !== undefined) meta = practice(meta, 'ballista')
    const bossTag = enc.mission.objectives.find((o) => o.kind === 'defeat' || o.kind === 'acquire') as { targetTag: string } | undefined
    enc = {
      ...enc,
      waves: enc.waves.map((w) => ({
        units: w.units.map((u) => (bossTag !== undefined && u.targetTag === bossTag.targetTag ? woundBoss(u, perf) : u)),
      })),
    }
  }
  // SUBVERSION (Layer 4 §5.3): the truths strip the Herald's aegis — and the clear spares the world.
  if (subvert) {
    enc = {
      ...enc,
      waves: enc.waves.map((w) => ({
        units: w.units.map((u) => (u.targetTag === 'herald_of_end' ? { ...u, keywords: u.keywords.filter((k) => k.kind !== 'aegis') } : u)),
      })),
    }
  }
  if (orders && orders.length > 0) enc = { ...enc, orders }
  // Combat depth: friends and rivals in the party fight as such.
  enc = withBonds(enc, state, deployedIds)
  // Tower challenges: bond set bonuses and the Cursed Shrine's blessing ride on the units.
  const res = runBattle(applyPartyBonuses(heroUnits, state), enc, combatSeed)

  // ── 4. Interpret. ───────────────────────────────────────────────────────────
  const cleared = res.outcome === 'win'
  const firstClear = cleared && floor > state.tower.highestCleared
  const goldAwarded = cleared
    ? Math.round(ECON.goldPerFloor * floor * worldMult) * (firstClear ? ECON.firstClearMult : 1)
    : 0
  const xpAwarded = cleared ? floorXp(floor) : 0

  // ── 5. Build the next heroes map (permadeath + XP + Sanity), never mutating inputs. ──
  const fallenSet = new Set<string>(res.fallenHeroIds as string[])
  const survivorSet = new Set<string>(res.survivorHeroIds as string[])

  // Sanity drain hits only DEPLOYED SURVIVORS (heroes left in the lobby don't fight).
  const partyCp = heroUnits.reduce((sum, u) => sum + u.cp, 0)
  const drain = sanityDrain(floorPower(floor, worldMult), partyCp, cleared, fallenSet.size > 0)

  const highestAfter = cleared ? Math.max(state.tower.highestCleared, floor) : state.tower.highestCleared
  const nextHeroes: Record<HeroId, OwnedHero> = {}
  const skillProgress: SkillProgress[] = []
  for (const key of Object.keys(state.heroes) as HeroId[]) {
    const hero = state.heroes[key]!
    if (fallenSet.has(key as string)) {
      // PERMADEATH: a hero that fell this battle is gone.
      nextHeroes[key] = releaseGear({ ...hero, alive: false, blessed: false })
    } else if (survivorSet.has(key as string)) {
      // Deployed survivor: drain Sanity, grant XP on a clear, and auto-learn skills
      // from this battle's casts (level-ups, then merges — Layer 1 §2.4).
      const xp = xpAwarded > 0 ? applyXp(hero.xp, xpAwarded, hero.star) : hero.xp
      // Conditional unlocks read the post-XP level; achievements need the win.
      const learned = foldBattleSkills(key, hero.skills, res.skillCasts[key as string], {
        heroLevel: xp.level,
        highestCleared: highestAfter,
        won: cleared,
        floor,
        defeatedTargetTags: res.defeatedTargetTags,
      })
      skillProgress.push(...learned.progress)
      // Favor (Layer 3 §C1): a shared victory warms; watching an ally die chills.
      const favorDelta = (cleared ? TUNING.favor.perClear : 0) - (fallenSet.size > 0 ? TUNING.favor.witnessLoss : 0)
      nextHeroes[key] = withFavor(
        { ...hero, xp, sanity: clampSanity(hero.sanity - drain), skills: learned.skills, blessed: false },
        hero.favor + favorDelta,
      )
    } else if (xpAwarded > 0 && hero.alive && !hero.captiveOf) {
      // The bench studies the battle reports: waiting-room heroes earn a share of the
      // clear's XP, so losing a party never leaves a roster of Lv1 recruits.
      const share = Math.round(xpAwarded * ECON.benchXpShare)
      nextHeroes[key] = share > 0 ? { ...hero, xp: applyXp(hero.xp, share, hero.star) } : hero
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
  // Authored first-clear drops (e.g. F20's Book of Reverse Heaven).
  const firstDrops = firstClear ? ANCHORS[floor]?.firstClearDrops : undefined
  if (firstDrops !== undefined) {
    for (const id of Object.keys(firstDrops)) {
      materialsAwarded[id] = (materialsAwarded[id] ?? 0) + firstDrops[id]!
    }
  }
  const nextMaterials: Record<MaterialId, number> = { ...state.materials }
  for (const id of Object.keys(materialsAwarded)) {
    nextMaterials[id] = (nextMaterials[id] ?? 0) + materialsAwarded[id]!
  }

  // ── 6. Advance tower position (the F40 loop gate is the one rollback). ──────
  const tower = nextTowerState(state.tower, floor, cleared)
  const nextTower: TowerState = tower.state

  // ── 6b. Hidden objectives found on this attempt pay out once (Layer 2 §5.3). ───
  const found = cleared ? hiddenObjectivesMet(floor, res, state.tower.hiddenFound) : []
  let gold = state.gold + goldAwarded
  let gems = state.gems
  for (const h of found) {
    gold += h.reward.gold ?? 0
    gems += h.reward.gems ?? 0
    for (const [id, n] of Object.entries(h.reward.materials ?? {})) nextMaterials[id] = (nextMaterials[id] ?? 0) + n
  }
  if (found.length > 0) nextTower.hiddenFound = [...nextTower.hiddenFound, ...found.map((h) => h.id)].sort()

  // ── 6c. Event floors: a bonus after an anchor's first clear, the tournament after
  //        F41, a recovery event after a battle that cost the main team (§5.1). They
  //        queue rather than erase each other (B19): the recovery comes first, then the
  //        tournament or the anchor's bonus. ─────
  const events = eventsAfter(floor, firstClear, fallenSet.size)
  const event: TowerEvent | null = events[0] ?? null
  nextTower.event = event
  if (events.length > 1) nextTower.eventQueue = events.slice(1)
  else delete nextTower.eventQueue

  // ── 6d. The world ends on the first clear of F90 (canon). ────────────────────
  const atEnd = cleared && floor === T.worldEndFloor && !state.tower.worldEnded && !state.tower.worldSaved
  const worldSaved = atEnd && subvert === true
  const worldEnded = atEnd && !worldSaved
  if (worldEnded) nextTower.worldEnded = true
  if (worldSaved) nextTower.worldSaved = true

  // ── 6e. Master XP: floor clears feed the Master-Level spine (+first-clear bonus);
  //        they also strengthen the world's Probability Interference (Layer 3 §D1). ──
  const MASTER = TUNING.lobby.master
  const masterXpGain = cleared ? MASTER.xpPerFloorClear + (firstClear ? MASTER.xpPerFirstClear : 0) : 0
  const PI = TUNING.interference
  let nextMeta = masterXpGain > 0 ? addMasterXp(meta, masterXpGain) : meta
  if (cleared) nextMeta = addPi(nextMeta, PI.perClear + (firstClear ? PI.perFirstClear : 0))

  const nextState: GameState = {
    ...state,
    gold,
    gems,
    materials: nextMaterials,
    heroes: nextHeroes,
    tower: nextTower,
    meta: nextMeta,
    // The Enemy Codex remembers who was met here (a scouted floor's enemies are studied).
    codex: recordBattle(state.codex, res.log, { studied: state.meta.peekedFloors.includes(floor) }),
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
    hiddenFound: found.map((h) => h.id),
    event,
    loopRollback: tower.rollback,
    worldEnded,
    worldSaved,
    refusedHeroIds,
    refusals,
    result: res,
  }

  return { state: nextState, result }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tower position, the loop, and hidden objectives
// ─────────────────────────────────────────────────────────────────────────────

/** The five canon tournament formats (F41/42). */
export const TOURNAMENT_FORMATS = ['battle_royale', 'party_raid', 'team', 'pair', 'deathmatch'] as const

/**
 * The event floors an attempt opens, in the order the Master meets them (B19). A battle
 * that cost the main team opens the recovery first; the F41 tournament or an anchor's
 * bonus waits behind it instead of being lost forever. The first clear of F90 (the world
 * just ended) opens no cheerful "quiet floor". PURE.
 */
export function eventsAfter(floor: number, firstClear: boolean, fallen: number): TowerEvent[] {
  const out: TowerEvent[] = []
  if (fallen >= TUNING.events.recoveryDeaths) out.push({ kind: 'recovery', floor, options: ['reinforcement', 'rest'] })
  if (firstClear && floor === 41) out.push({ kind: 'tournament', floor, options: [...TOURNAMENT_FORMATS] })
  else if (firstClear && floor % 5 === 0 && floor < T.sliceTopFloor && floor !== T.worldEndFloor) {
    out.push({ kind: 'bonus', floor, options: ['rest', 'treasure', 'merchant', 'gamble'] })
  }
  return out
}

/**
 * The tower after one attempt. A clear advances one floor; a failure retries the same
 * floor — except the F40 loop gate, which drops the room back to F31 and spends one of
 * the loop's attempts (at zero the loop gains a scar and refills). Reaching F36 opens
 * the loop; clearing F40 closes it. PURE.
 */
export function nextTowerState(
  tower: TowerState,
  floor: number,
  cleared: boolean,
): { state: TowerState; rollback: boolean } {
  const L = T.loop
  if (cleared) {
    const currentFloor = floor + 1
    let loop = tower.loop
    if (floor === L.gate) loop = null
    else if (currentFloor === L.start && loop === null) loop = { attemptsLeft: L.attempts, scars: 0 }
    return {
      rollback: false,
      state: {
        ...tower,
        currentFloor,
        attemptIndex: 0,
        highestCleared: Math.max(tower.highestCleared, floor),
        loop,
        hiddenFound: [...tower.hiddenFound],
      },
    }
  }
  if (floor === L.gate && tower.loop !== null) {
    const left = tower.loop.attemptsLeft - 1
    const loop: LoopState = left > 0 ? { attemptsLeft: left, scars: tower.loop.scars } : { attemptsLeft: L.attempts, scars: tower.loop.scars + 1 }
    return {
      rollback: true,
      state: { ...tower, currentFloor: L.fallbackTo, attemptIndex: 0, loop, hiddenFound: [...tower.hiddenFound] },
    }
  }
  return {
    rollback: false,
    state: { ...tower, attemptIndex: tower.attemptIndex + 1, hiddenFound: [...tower.hiddenFound] },
  }
}

/** Does a won battle meet a hidden objective's condition? */
export function hiddenConditionMet(h: HiddenObjective, res: BattleResult): boolean {
  const c = h.condition
  switch (c.kind) {
    case 'defeat':
      return res.defeatedTargetTags.includes(c.targetTag)
    case 'flawless':
      return res.fallenHeroIds.length === 0
    case 'swift':
      return res.ticksElapsed <= c.ticks
    case 'escortHp':
      return (res.allyHpPct[c.targetTag] ?? 0) >= c.pct
  }
}

/** The hidden objectives on `floor` this battle found for the first time. */
export function hiddenObjectivesMet(floor: number, res: BattleResult, alreadyFound: readonly string[]): HiddenObjective[] {
  return HIDDEN_OBJECTIVES.filter((h) => h.floor === floor && !alreadyFound.includes(h.id) && hiddenConditionMet(h, res))
}
