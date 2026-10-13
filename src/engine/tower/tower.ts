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
import { runBattle, ROUT_NOTE } from '../combat'
import { ENEMY_TEMPLATES, ALLY_TEMPLATES, ANCHORS, SKILLS, HIDDEN_OBJECTIVES, actForFloor } from '../content'
import { applyXp, xpToNext } from '../stats'
import { clampSanity } from '../kitchen'
import { attrStoneId } from '../promotion'
import { tacticalFocusBonus } from '../tactical'
import { addMasterXp } from '../master'
import { foldBattleSkills } from '../skills'
import { rebellionChance, withFavor } from '../favor'
import { addPi } from '../interference'
import { practice, woundBoss } from '../minigames'
import { hash, rngFor, nextInt, nextFloat, chance, pick, makeSeed, type Rng } from '../rng/rng'
import type { HiddenObjective, LoopState, TowerEvent, TowerState, BattleResult, FloorKind, Nemesis } from '../types'
import { floorPower, mobLevel } from './power'
import {
  kindForFloor,
  floorBudget,
  climbExtraPct,
  lastStandPct,
  withFloorDoors,
  applyBoonsToUnits,
  boonBattleMods,
  boonOrders,
  boonGoldMult,
  boonXpMult,
  boonDrainMult,
  boonOffer,
  sortieBoons,
  sortieAfterFloor,
} from '../climb'
import { consumeRested } from '../return'

const T = TUNING.tower
const ECON = TUNING.economy
const SAN = TUNING.lobby.sanity
const MD = TUNING.lobby.materialDrops

// ─────────────────────────────────────────────────────────────────────────────
// Floor power budget + enemy level
// ─────────────────────────────────────────────────────────────────────────────

/** XP each surviving hero earns for clearing a floor (see TUNING.economy.xpFloorShare). */
export function floorXp(floor: number): number {
  const lvl = Math.max(1, Math.min(floor, TUNING.xp.maxLevel))
  return Math.max(ECON.xpPerFloor, Math.round(xpToNext(lvl) * ECON.xpFloorShare))
}

// floorPower / mobLevel live in ./power (so the climb director can read them without an
// import cycle) and are re-exported here unchanged.
export { floorPower, mobLevel } from './power'

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
 * An anchor scaled to its budget (spec 2026-10-12 S13): the authored roster keeps its
 * waves, counts, levels and keywords, and only its attributes move — by whole
 * `elitePowerStep` steps — to the smallest multiplier whose total CP reaches `target`.
 * An anchor short of its budget grows elite (as before above F20); one above it now
 * shrinks too, at every depth, bounded below by `ANCHOR_MIN_STEPS` steps (the clamp) so a
 * tiny mercy budget never reduces a boss to nothing. Deterministic; bounded.
 */
function buildScaledAnchor(
  anchor: AnchorDef,
  floor: number,
  worldMult: number,
  extraLevels: number,
  target: number,
): { waves: EnemyWave[]; mission: Mission; allies: CombatUnit[] } {
  const cpOf = (b: { waves: EnemyWave[] }) => b.waves.reduce((n, w) => n + w.units.reduce((m, u) => m + (isLoomingUnit(u) ? 0 : u.cp), 0), 0)
  let built = buildAnchorEncounter(anchor, floor, worldMult, extraLevels)
  if (!(target > 0)) return built
  let mult = 1
  if (cpOf(built) < target) {
    for (let i = 0; i < 400 && cpOf(built) < target; i++) {
      mult *= T.elitePowerStep
      built = buildAnchorEncounter(anchor, floor, worldMult, extraLevels, mult)
    }
    return built
  }
  for (let i = 0; i < ANCHOR_MIN_STEPS; i++) {
    const lower = buildAnchorEncounter(anchor, floor, worldMult, extraLevels, mult / T.elitePowerStep)
    if (cpOf(lower) < target) break
    mult /= T.elitePowerStep
    built = lower
  }
  return built
}

/** The anchor clamp: at most this many `elitePowerStep` steps down (1.08^-30 ≈ ×0.10). */
const ANCHOR_MIN_STEPS = 30

/** A looming unit is outlasted, not fought: it never counts toward a floor's CP. */
function isLoomingUnit(u: CombatUnit): boolean {
  return u.keywords.some((k) => k.kind === 'looming')
}

// ─────────────────────────────────────────────────────────────────────────────
// Filler encounter assembly (power-budget fill)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a single-wave filler encounter by power-budget filling:
 *   budget = floorPower(floor) by default; the tower passes the climb's
 *   `floorBudget(state, floor, kind)` (dailies keep the plain curve)
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
  budget: number = floorPower(floor, worldMult),
): { waves: EnemyWave[]; mission: Mission } {
  const pool = fillerPoolForFloor(floor)
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
 * Authored anchors (every 5th floor, F41/F42) keep their rosters, scaled to the floor's
 * Boss budget; everything else is a power-budget-filled mission against the floor's biome
 * pool, filled to `floorBudget(state, floor, kind)` — the kind the floor is fought as (the
 * chosen Door), capped by the mercy director (spec 2026-10-12 S13). A Nemesis waiting on
 * this (non-anchor) floor joins the wave as a named revenant and takes its share of the
 * budget (S22). The encounter carries its kind and the rout threshold (S19). The optional
 * focus directive is attached so combat can honor it.
 */
export function buildEncounter(state: GameState, floor: number, focus?: FocusDirective): Encounter {
  const worldMult = worldMultFor(state)
  // The Wailing Wall overrides the account seed: the same Fragment Series for everyone.
  const seed = isWallFloor(floor) ? makeSeed(T.wallSeed) : state.seed
  const rng = rngFor(seed, 'floor', floor)
  const scar = loopScarLevels(floor, state.tower.loop)
  const kind = kindForFloor(state, floor)
  const budget = floorBudget(state, floor, kind)

  const anchor = ANCHORS[floor]
  let built: { waves: EnemyWave[]; mission: Mission; allies?: CombatUnit[] }
  if (anchor !== undefined) {
    built = buildScaledAnchor(anchor, floor, worldMult, scar, budget)
  } else {
    const revenants = nemesisUnits(state, floor, mobLevel(floor, worldMult) + scar)
    const theirCp = revenants.reduce((n, u) => n + u.cp, 0)
    built = buildFillerEncounter(floor, worldMult, rng, scar, Math.max(0, budget - theirCp))
    if (revenants.length > 0) {
      const [first, ...rest] = built.waves
      built = { ...built, waves: [{ units: [...first!.units, ...revenants] }, ...rest] }
    }
  }

  const enc: Encounter = {
    floor,
    mission: built.mission,
    waves: built.waves,
    encounterContext: 'tower',
    kind,
  }
  const rout = TUNING.climb.rout[kind]
  if (rout !== undefined && rout > 0) enc.routAfterDeaths = rout
  if (built.allies !== undefined && built.allies.length > 0) enc.allies = built.allies
  if (focus !== undefined) {
    enc.focus = focus
    // Tactical Center amplifies the focus lever: a concentrate-fire bonus by level.
    enc.focusBonus = tacticalFocusBonus(state.facilities.tacticalCenter.level)
  }
  return enc
}

/** The unit id a Nemesis fights under. */
export function nemesisUnitId(n: Nemesis): string {
  return `nem_${n.id}`
}

/** The Nemeses waiting on `floor` (never an anchor floor): each waits on its revenge
 *  floor, and one the climb got past without killing it (a Rest or Cache Door taken on
 *  that floor, an anchor, a Survival clear that outlasted it) follows the party to every
 *  later non-anchor floor until it is avenged. */
export function nemesesOnFloor(state: GameState, floor: number): Nemesis[] {
  if (ANCHORS[floor] !== undefined) return []
  return (state.life.legacy?.nemeses ?? []).filter(
    (n) => n.status === 'waiting' && n.revengeFloor <= floor && ENEMY_TEMPLATES[n.templateId] !== undefined,
  )
}

/** The revenants waiting on `floor`: the killer's template at the floor's level, ×powerMult,
 *  under the Nemesis's name ("Mira's Bane"). Unknown templates are skipped. */
function nemesisUnits(state: GameState, floor: number, level: number): CombatUnit[] {
  return nemesesOnFloor(state, floor).map((n) => ({
    ...buildEnemyUnit(ENEMY_TEMPLATES[n.templateId]!, level, nemesisUnitId(n), { powerMult: TUNING.legacy.nemesis.powerMult }),
    name: n.name,
    element: n.element,
  }))
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
 *  two Tactical Center levels, plus the Quartermaster Boon. Retreat is always possible. */
export function ordersAllowed(state: GameState): number {
  return 1 + Math.floor(state.facilities.tacticalCenter.level / 2) + boonOrders(sortieBoons(state))
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

  // ── 1. Build deployed hero units (skip empty slots, dead, and Sanity-0). ────
  // Every deployed hero carries the climb's all-stat aids (Last Stand, the Memorial's
  // plaques), then the Sortie's stat Boons (spec 2026-10-12 S14, S20, S23).
  const kind = kindForFloor(state, floor)
  const boons = sortieBoons(state)
  const extraPct = climbExtraPct(state, floor)
  let heroUnits: CombatUnit[] = []
  const deployedIds: HeroId[] = []
  const refusedHeroIds: HeroId[] = []
  const { slots, lines } = state.party
  for (let s = 0; s < slots.length; s++) {
    const heroId = slots[s]
    if (heroId === null || heroId === undefined) continue
    const hero = state.heroes[heroId]
    // Skip empty slots, the dead, and the broken-down (Sanity 0 = cannot deploy).
    // A hero in a Training Center drill is in the yard, one in the Ruins is away.
    if (hero === undefined || !hero.alive || hero.sanity <= 0 || hero.training !== null || hero.expedition !== null || hero.captiveOf) continue
    // REBELLION (Layer 3 §C1): a Wary, broken hero may refuse the order. The draw is
    // gated on a positive chance, so everyone else's replays are untouched.
    const rebel = rebellionChance(hero)
    if (rebel > 0 && chance(rngFor(state.seed, 'rebel', floor, state.tower.attemptIndex, heroId), rebel).value) {
      refusedHeroIds.push(heroId)
      continue
    }
    const line: Line = lines[s] ?? 'front'
    heroUnits.push(buildCombatUnit(hero, line, SKILLS, state.inventory, extraPct))
    deployedIds.push(heroId)
  }
  heroUnits = applyBoonsToUnits(state, heroUnits, boons)

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
  const res = runBattle(heroUnits, enc, combatSeed, boonBattleMods(boons))

  // ── 4. Interpret. ───────────────────────────────────────────────────────────
  const cleared = res.outcome === 'win'
  const firstClear = cleared && floor > state.tower.highestCleared
  const routed = res.outcome === 'retreat' && res.log.events.some((e) => e.kind === 'mission' && e.note === ROUT_NOTE)
  const CL = TUNING.climb
  // Floor gold: the floor's pay (×firstClearMult on a first clear), doubled on a Skull
  // floor, lifted by War Chest. The base formula is unchanged for a plain Path floor.
  const floorGold = cleared
    ? Math.round(
        Math.round(ECON.goldPerFloor * floor * worldMult) *
          (firstClear ? ECON.firstClearMult : 1) *
          (kind === 'elite' ? CL.reward.eliteGoldMult : 1) *
          boonGoldMult(boons),
      )
    : 0
  // A Nemesis felled on a clear is avenged: revenge gold and a stone (spec S22).
  const avenged = cleared
    ? nemesesOnFloor(state, floor).filter((n) => res.log.events.some((e) => e.kind === 'death' && e.unitId === nemesisUnitId(n)))
    : []
  const NM = TUNING.legacy.nemesis
  const goldAwarded = floorGold + avenged.length * Math.round(NM.rewardGoldPerFloor * floor * worldMult)
  const xpAwarded = cleared ? Math.round(floorXp(floor) * boonXpMult(boons)) : 0

  // ── 5. Build the next heroes map (permadeath + XP + Sanity), never mutating inputs. ──
  const fallenSet = new Set<string>(res.fallenHeroIds as string[])
  const survivorSet = new Set<string>(res.survivorHeroIds as string[])

  // Sanity drain hits only DEPLOYED SURVIVORS (heroes left in the lobby don't fight). It
  // reads the floor's real budget (kind and mercy included); Calm Mind softens it.
  const partyCp = heroUnits.reduce((sum, u) => sum + u.cp, 0)
  const baseDrain = sanityDrain(floorBudget(state, floor, kind), partyCp, cleared, fallenSet.size > 0)
  const drain = Math.round(baseDrain * boonDrainMult(boons))

  const highestAfter = cleared ? Math.max(state.tower.highestCleared, floor) : state.tower.highestCleared
  const nextHeroes: Record<HeroId, OwnedHero> = {}
  const skillProgress: SkillProgress[] = []
  for (const key of Object.keys(state.heroes) as HeroId[]) {
    const hero = state.heroes[key]!
    if (fallenSet.has(key as string)) {
      // PERMADEATH: a hero that fell this battle is gone.
      nextHeroes[key] = { ...hero, alive: false, blessed: false }
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
  // A Skull floor guarantees Promotion Stones; avenging a Nemesis pays one too.
  const bonusStones = (cleared && kind === 'elite' ? CL.reward.eliteStones : 0) + avenged.length * NM.rewardStones
  if (bonusStones > 0) materialsAwarded.promotionStone = (materialsAwarded.promotionStone ?? 0) + bonusStones
  const nextMaterials: Record<MaterialId, number> = { ...state.materials }
  for (const id of Object.keys(materialsAwarded)) {
    nextMaterials[id] = (nextMaterials[id] ?? 0) + materialsAwarded[id]!
  }

  // ── 6. Advance tower position (the F40 loop gate is the one rollback), then set the
  //       new floor's kind and roll its Doors (spec S13). A failed floor re-offers its
  //       Doors, so a beaten Skull can be swapped for the Path. ────────────────────
  const tower = nextTowerState(state.tower, floor, cleared)
  const nextTower: TowerState = withFloorDoors(state, tower.state)

  // ── 6b. Hidden objectives found on this attempt pay out once (Layer 2 §5.3). ───
  const found = cleared ? hiddenObjectivesMet(floor, res, state.tower.hiddenFound) : []
  // Pent-up Interference (spec S24): one charge doubles this clear's floor gold.
  const rested = cleared ? consumeRested(meta, floorGold) : { meta, bonus: 0 }
  meta = rested.meta
  let gold = state.gold + goldAwarded + rested.bonus
  let gems = state.gems
  for (const h of found) {
    gold += h.reward.gold ?? 0
    gems += h.reward.gems ?? 0
    for (const [id, n] of Object.entries(h.reward.materials ?? {})) nextMaterials[id] = (nextMaterials[id] ?? 0) + n
  }
  if (found.length > 0) nextTower.hiddenFound = [...nextTower.hiddenFound, ...found.map((h) => h.id)].sort()

  // ── 6c. Event floors: a bonus after an anchor's first clear, the tournament after
  //        F41, a recovery event after a battle that cost the main team (§5.1). A Boon
  //        choice (S14) follows an Elite or Boss clear — see 6g. ─────────────────────
  let event: TowerEvent | null = null
  const E = TUNING.events
  if (fallenSet.size >= E.recoveryDeaths) event = { kind: 'recovery', floor, options: ['reinforcement', 'rest'] }
  else if (firstClear && floor === 41) event = { kind: 'tournament', floor, options: [...TOURNAMENT_FORMATS] }
  else if (firstClear && floor % 5 === 0 && floor < T.sliceTopFloor) {
    event = { kind: 'bonus', floor, options: ['rest', 'treasure', 'merchant', 'gamble'] }
  }
  nextTower.event = event

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

  // ── 6f. Avenged Nemeses (S22) are marked under `life` (fresh objects). ─────────
  let life = state.life
  if (avenged.length > 0) {
    const ids = new Set(avenged.map((n) => n.id))
    life = {
      ...life,
      legacy: {
        ...life.legacy,
        nemeses: life.legacy.nemeses.map((n) => (ids.has(n.id) ? { ...n, status: 'avenged' as const } : n)),
      },
    }
  }

  let nextState: GameState = {
    ...state,
    gold,
    gems,
    materials: nextMaterials,
    heroes: nextHeroes,
    tower: nextTower,
    meta: nextMeta,
    life,
  }

  let result: FloorResult = {
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
    result: res,
    kind,
    routed,
    lastStandPct: lastStandPct(state, floor),
    restedBonus: rested.bonus,
    nemesisDefeated: avenged.map((n) => n.id),
    doors: nextTower.doors,
  }

  // ── 6g. The Sortie (S15): start it, grow its Purse, or break it. Then a Boon choice
  //        after an Elite clear, or a Boss clear that opened no other event (a Boss's
  //        first clear chains it after the bonus event — see events.resolveEvent). ──
  ;({ state: nextState, result } = sortieAfterFloor(nextState, result))
  if (cleared && event === null && floor < T.sliceTopFloor && ((kind === 'elite' && CL.reward.eliteBoon) || kind === 'boss')) {
    const offer = boonOffer(nextState, floor)
    if (offer.length > 0) {
      const boonEvent: TowerEvent = { kind: 'boon', floor, options: offer }
      nextState = { ...nextState, tower: { ...nextState.tower, event: boonEvent } }
      result = { ...result, event: boonEvent }
    }
  }

  return { state: nextState, result }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tower position, the loop, and hidden objectives
// ─────────────────────────────────────────────────────────────────────────────

/** The five canon tournament formats (F41/42). */
export const TOURNAMENT_FORMATS = ['battle_royale', 'party_raid', 'team', 'pair', 'deathmatch'] as const

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
