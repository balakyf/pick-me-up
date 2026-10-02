/**
 * Layer 0 §2 — deterministic ATB battle simulator.
 *
 * `runBattle` is a pure function of (heroUnits, encounter, seed). It resolves a
 * whole fight once, producing a CombatLog the UI replays. The sim treats heroes
 * and enemies identically (both are CombatUnit) and NEVER recomputes a unit's
 * stats — `CombatUnit.stats` is a frozen snapshot built upstream by the `unit`
 * module. All randomness flows through the seeded Rng built here; the RNG draw
 * order is pinned (crit roll, then variance, per target in stable order) so a
 * replay is bit-identical.
 *
 * THE COMBAT BRAIN (lane D): a unit picks the castable skill with the most expected
 * damage — estimated per target in integer math (element, resistances, immunity, the
 * target's guards and its current HP, so overkill and immunity count) — and never draws
 * RNG to decide. Sweeps spread their force (AoE falloff), single-target picks pass over
 * foes immune to the blow, an HP-cost ultimate keeps its caster above a floor, and the
 * mission's beats (waves cleared, countdowns, escape steps, objectives, the escort's
 * wounds, shields breaking, a looming thing waking) are logged as 'mission' events.
 */

import type {
  CombatUnit,
  Encounter,
  BattleResult,
  CombatLog,
  CombatEvent,
  CombatUnitInit,
  CombatOutcome,
  SkillEffect,
  Objective,
  Element,
  HeroId,
  HitEffect,
  LogObjective,
  MissionCode,
  MissionParams,
} from '../types'
import { TUNING, ELEMENT_ADVANTAGE } from '../tuning'
import { createRng, makeSeed, nextFloat, chance, type Rng } from '../rng'
import { panicChance } from '../kitchen'
import {
  coverFor,
  depthDamageMult,
  followUpCandidates,
  followUpSkill,
  healMult,
  missChance,
  pairKey,
  rivalOf,
  type DepthContext,
} from '../depth/combatDepth'
import { modEnrageTick, modSpeed } from '../depth/floorMods'
import { DEPTH } from '../depth/depthTuning'

const C = TUNING.combat
const DEPTH_RIVAL_IGNORE = DEPTH.bonds.rivalIgnoreFocus

/** `Omit` that distributes over a union (the built-in collapses `CombatEvent`'s
 *  variant union because seq/tick sit in an intersection over it). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** A CombatEvent body with seq/tick stripped — the shape `emit` accepts. */
type CombatEventBody = DistributiveOmit<CombatEvent, 'seq' | 'tick'>

/** Mutable battle copy of a CombatUnit. Identity/stat fields stay by reference
 *  (never mutated); only the per-battle counters live as own properties. */
interface MutUnit {
  ref: CombatUnit
  id: string
  side: CombatUnit['side']
  /** Spawn index within the whole battle — defines "front-most" order. */
  spawnIndex: number
  /** Which wave this unit belongs to (heroes are wave -1). */
  wave: number
  currentHP: number
  currentSP: number
  actionGauge: number
  alive: boolean
  /** Actions taken so far (the `opener` keyword boosts the first). */
  actions: number
  /** Remaining `aegis` charges (hits this unit will negate). */
  aegis: number
}

function copyUnit(u: CombatUnit, spawnIndex: number, wave: number): MutUnit {
  let aegis = 0
  for (const k of u.keywords) if (k.kind === 'aegis') aegis += k.charges
  return {
    actions: 0,
    aegis,
    ref: u,
    id: u.id,
    side: u.side,
    spawnIndex,
    wave,
    currentHP: u.currentHP,
    currentSP: u.currentSP,
    actionGauge: u.actionGauge,
    alive: u.alive && u.currentHP > 0,
  }
}

/** Stable order by id (string compare). */
function byId(a: MutUnit, b: MutUnit): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Guard reductions only ever shave off this much in total (never full immunity). */
const MIN_GUARD_MULT = 0.25

/** elementMult per Layer 0 §2.5. */
function elementMult(attackEl: Element, defEl: Element): number {
  if (ELEMENT_ADVANTAGE[attackEl] === defEl) return C.elementAdvantage
  if (ELEMENT_ADVANTAGE[defEl] === attackEl) return C.elementDisadvantage
  return 1
}

/** A multiplier in per-mille (the AI's estimates are integer math). */
function permille(x: number): number {
  return Math.round(x * 1000)
}

/** v × pm / 1000, floored (integer scaling for the estimates). */
function scale(v: number, pm: number): number {
  return Math.floor((v * pm) / 1000)
}

/** The share of its force an all-enemies skill lands on each of `n` foes, as a per-mille
 *  (×100 / (100 + k(n − 1)); 1000 for a single foe). */
export function aoeSpreadPermille(n: number): number {
  if (n <= 1) return 1000
  return Math.floor(100_000 / (100 + C.aoeFalloffK * (n - 1)))
}

/** Can `actor` pay for `s` now? Enough SP, and an HP cost leaves at least
 *  hpCostFloorPct of max HP (so an ultimate never leaves its caster at death's door). */
export function canCast(currentSP: number, currentHP: number, maxHP: number, s: SkillEffect): boolean {
  if (s.spCost > currentSP) return false
  if (s.hpCost === undefined || s.hpCost <= 0) return true
  const after = currentHP - s.hpCost
  return after > 0 && after * 100 >= C.hpCostFloorPct * maxHP
}

/** Does `target` shrug off this kind of damage entirely? */
function immuneTo(target: CombatUnit, skill: SkillEffect): boolean {
  return target.keywords.some((k) => k.kind === 'immune' && k.damageType === skill.damageType)
}

/** Milestones (% of a timer or a distance) the mission announces. */
const MILESTONES = [25, 50, 75] as const
/** Escort HP thresholds (%) the mission announces, most severe last. */
const ESCORT_MARKS = [50, 25] as const

/**
 * Run a single deterministic battle.
 *
 * @param heroUnits already-built hero CombatUnits (read-only; never mutated)
 * @param encounter the wave/mission/focus definition
 * @param seed combat seed (folded into the Rng via createRng(makeSeed(seed)))
 */
export function runBattle(heroUnits: CombatUnit[], encounter: Encounter, seed: number): BattleResult {
  let rng: Rng = createRng(makeSeed(seed))
  let rngDraws = 0

  // ── Event log plumbing ────────────────────────────────────────────────────
  const events: CombatEvent[] = []
  let seq = 0
  let tick = 0
  const emit = (e: CombatEventBody): void => {
    events.push({ seq: seq++, tick, ...e } as CombatEvent)
  }
  /** A structured mission beat (no RNG, no state: only the log learns of it). */
  const missionBeat = (code: MissionCode, params: MissionParams, note: string): void => {
    emit({ kind: 'mission', note, code, params })
  }

  // ── The mission, as data the replay can show ──────────────────────────────
  const objectives = encounter.mission.objectives
  /** Tags a Defeat / Capture / Protect objective names (objective units carry them). */
  const objectiveTags = new Set<string>()
  for (const o of objectives) if (o.kind === 'defeat' || o.kind === 'acquire' || o.kind === 'protect') objectiveTags.add(o.targetTag)
  const objectiveKind = (tag: string): Objective['kind'] | undefined =>
    objectives.find((o) => (o.kind === 'defeat' || o.kind === 'acquire' || o.kind === 'protect') && o.targetTag === tag)?.kind

  // ── unitsInit snapshot: every hero + every enemy across all waves ─────────
  const unitsInit: CombatUnitInit[] = []
  const snapshot = (u: CombatUnit): void => {
    unitsInit.push({
      id: u.id,
      name: u.name,
      side: u.side,
      line: u.line,
      unitClass: u.unitClass,
      element: u.element,
      level: u.level,
      maxHP: u.stats.maxHP,
      maxSP: u.maxSP,
      cp: u.cp,
      spd: u.stats.spd,
      ...(u.isNpc ? { isNpc: true } : {}),
      ...(u.templateId !== undefined ? { templateId: u.templateId } : {}),
      ...(u.currentHP < u.stats.maxHP ? { startHP: u.currentHP } : {}),
      ...(u.targetTag !== undefined && objectiveTags.has(u.targetTag) ? { targetTag: u.targetTag } : {}),
    })
  }
  const allyUnits = encounter.allies ?? []
  for (const h of heroUnits) snapshot(h)
  for (const a of allyUnits) snapshot(a)
  for (const w of encounter.waves) for (const e of w.units) snapshot(e)

  // ── Spawn heroes (wave -1) + wave 0 ───────────────────────────────────────
  let spawnCounter = 0
  // Mission NPC allies spawn after the party on the hero side (targetable, never act).
  const heroes: MutUnit[] = [...heroUnits, ...allyUnits].map((u) => copyUnit(u, spawnCounter++, -1))
  const enemies: MutUnit[] = []
  let currentWave = 0

  const spawnWave = (waveIndex: number): MutUnit[] => {
    const spawned = encounter.waves[waveIndex]!.units.map((u) => copyUnit(u, spawnCounter++, waveIndex))
    for (const s of spawned) enemies.push(s)
    return spawned
  }

  const wave0 = spawnWave(0)
  emit({
    kind: 'battle-start',
    heroIds: heroes.map((h) => h.id),
    enemyIds: wave0.map((e) => e.id),
  })

  // COMBAT DEPTH: the party's bonds and the floor's conditions (announced up front).
  const depth: DepthContext = { bonds: encounter.bonds ?? [], mods: encounter.modifiers ?? [] }
  if (depth.mods.length > 0) emit({ kind: 'floor-mods', modifiers: [...depth.mods] })
  const everyone = (): MutUnit[] => [...heroes, ...enemies]
  /** Close-friend pairs that already spent their cover this battle. */
  const coversUsed = new Set<string>()

  let wavesCleared = 0
  const defeatedTargetTags: string[] = []
  // Reach(distance): steps the party has covered (every hero action is one step).
  const reachObjective = objectives.find((o): o is Extract<Objective, { kind: 'reach' }> => o.kind === 'reach')
  const hasReach = reachObjective !== undefined
  let reachProgress = 0
  let outcome: CombatOutcome | null = null
  // Focus / overlook start from the pre-battle directive; mid-battle orders may change them.
  let focusEnemyId: string | undefined = encounter.focus?.focusEnemyId
  let overlooked: string[] = encounter.focus?.overlookedAllyIds ?? []

  // ── Helpers over the live rosters ─────────────────────────────────────────
  /** Everyone alive on the hero side, NPC allies included (what enemies can target). */
  const livingHeroSide = (): MutUnit[] => heroes.filter((h) => h.alive)
  /** The player's living heroes only — a wipe/survival is about the party, not NPCs. */
  const livingHeroes = (): MutUnit[] => heroes.filter((h) => h.alive && !h.ref.isNpc)
  /** Protect(target): is the tagged NPC ally still standing? */
  const allyAlive = (tag: string): boolean => heroes.some((h) => h.ref.targetTag === tag && h.alive)
  const livingEnemiesInWave = (w: number): MutUnit[] => enemies.filter((e) => e.alive && e.wave === w)
  const livingEnemies = (): MutUnit[] => enemies.filter((e) => e.alive)
  const isLooming = (e: MutUnit): boolean => e.ref.keywords.some((k) => k.kind === 'looming')
  const isPhased = (e: MutUnit): boolean => e.ref.keywords.some((k) => k.kind === 'phased')
  const moreWavesToSpawn = (): boolean => currentWave < encounter.waves.length - 1
  /** Survival: nothing is left to fight and nothing more is coming. */
  const hordeSpent = (): boolean => livingEnemies().length === 0 && !moreWavesToSpawn()

  /** A unit with a 'phased' keyword is untargetable while any non-phased unit in
   *  its wave is still alive. (Heroes have no phased keyword, so this is a no-op
   *  for hero targets.) */
  const isTargetable = (e: MutUnit): boolean => {
    if (!isPhased(e)) return true
    const wavemates = enemies.filter((o) => o.alive && o.wave === e.wave && o.id !== e.id)
    const anyNonPhasedAlive = wavemates.some((o) => !isLooming(o) && !isPhased(o))
    return !anyNonPhasedAlive
  }

  /** Living, targetable units on the side OPPOSITE the actor. */
  const targetableFoes = (actor: MutUnit): MutUnit[] => {
    const foes = actor.side === 'hero' ? livingEnemies() : livingHeroSide()
    return foes.filter(isTargetable)
  }

  // ── Mission beats that watch the field ────────────────────────────────────
  /** Phased units seen shielded (their shield breaking is announced once). */
  const shielded = new Set<string>()
  /** Looming units already announced awake. */
  const awake = new Set<string>()
  /** The lowest escort threshold already announced, per NPC. */
  const escortMark = new Map<string, number>()
  const surviveObjective = objectives.find((o): o is Extract<Objective, { kind: 'survive' }> => o.kind === 'survive')
  const timer = encounter.mission.timer
  /** The countdown the beats follow: the survival's own ticks, else the mission timer. */
  const countdown = surviveObjective?.ticks ?? timer
  let countdownMark = 0
  let reachMark = 0

  const watchShields = (): void => {
    for (const e of enemies) {
      if (!e.alive || !isPhased(e)) continue
      if (!isTargetable(e)) shielded.add(e.id)
      else if (shielded.delete(e.id)) {
        missionBeat('shield-down', { unitId: e.id }, `${e.ref.name}'s shield breaks!`)
      }
    }
  }
  watchShields()

  const watchCountdown = (): void => {
    if (countdown === null || countdown <= 0) return
    while (countdownMark < MILESTONES.length) {
      const pct = MILESTONES[countdownMark]!
      const at = Math.floor((countdown * pct) / 100)
      if (tick < at || tick >= countdown) return
      countdownMark++
      const left = countdown - tick
      if (surviveObjective !== undefined) missionBeat('hold', { pct, left }, `Hold on: ${pct}% of the way there.`)
      else missionBeat('deadline', { pct, left }, `${100 - pct}% of the time is left.`)
    }
  }

  const watchLooming = (): void => {
    for (const e of enemies) {
      if (!e.alive || awake.has(e.id) || !isLooming(e)) continue
      const wake = e.ref.keywords.find((k) => k.kind === 'enrage')
      if (wake === undefined || wake.kind !== 'enrage' || tick < modEnrageTick(depth.mods, wake.afterTick)) continue
      awake.add(e.id)
      missionBeat('wakes', { unitId: e.id }, `${e.ref.name} wakes…`)
    }
  }

  const watchReach = (): void => {
    if (reachObjective === undefined || reachObjective.distance <= 0) return
    const distance = reachObjective.distance
    while (reachMark < MILESTONES.length) {
      const pct = MILESTONES[reachMark]!
      if (reachProgress < Math.floor((distance * pct) / 100) || reachProgress >= distance) return
      reachMark++
      missionBeat('escape', { pct, steps: reachProgress, distance }, `${pct}% of the way to the exit.`)
    }
  }

  /** The escort took a blow: announce the first time it drops below each threshold. */
  const watchEscort = (u: MutUnit): void => {
    const tag = u.ref.targetTag
    if (!u.ref.isNpc || !u.alive || tag === undefined || objectiveKind(tag) !== 'protect') return
    const pctNow = Math.floor((Math.max(0, u.currentHP) * 100) / u.ref.stats.maxHP)
    const last = escortMark.get(u.id) ?? 100
    let crossed: number | null = null
    for (const m of ESCORT_MARKS) if (pctNow < m && m < last) crossed = m
    if (crossed === null) return
    escortMark.set(u.id, crossed)
    missionBeat('escort-low', { unitId: u.id, pct: crossed, tag }, `${u.ref.name} is below ${crossed}% HP!`)
  }

  // ── Damage estimate (the AI's integer-math preview; draws no RNG) ─────────
  /**
   * The damage `actor`'s `skill` can be expected to deal to `target`: attack × skill
   * × element × mitigation × the expected crit, the actor's keyword multipliers, the
   * target's immunity / resistances / vulnerabilities / guards, the line and floor
   * multipliers, and a sweep's falloff over `spread` foes — capped at the target's HP
   * (overkill is wasted). An aegis charge negates the next blow, so it scores 0.
   */
  const estimateHit = (actor: MutUnit, skill: SkillEffect, target: MutUnit, spread: number, all: readonly MutUnit[]): number =>
    Math.min(estimateBlow(actor, skill, target, spread, all), Math.max(0, target.currentHP))
  /** The uncapped expected blow (estimateHit before the target's HP caps it). */
  const estimateBlow = (actor: MutUnit, skill: SkillEffect, target: MutUnit, spread: number, all: readonly MutUnit[]): number => {
    if (target.aegis > 0 || immuneTo(target.ref, skill)) return 0
    const aStats = actor.ref.stats
    const tStats = target.ref.stats
    const physical = skill.damageType === 'physical'
    const atk = Math.max(0, Math.floor(physical ? aStats.pAtk : aStats.mAtk))
    const def = Math.max(0, Math.floor(physical ? tStats.pDef : tStats.mDef))
    const el: Element = skill.element ?? actor.ref.element

    let est = scale(atk, permille(skill.skillMult * C.damageScale))
    est = scale(est, permille(elementMult(el, target.ref.element)))
    const k = C.defenseKFlat + C.defenseKPerLevel * actor.ref.level
    est = Math.floor((est * k) / (k + def))
    // The expected crit: chance × (critMult − 1) on top of the plain blow.
    const critChancePm = Math.max(0, Math.min(1000, Math.round(aStats.critPct * 10)))
    est = scale(est, 1000 + scale(critChancePm, permille(C.critMult) - 1000))
    if (actor.side === 'hero' && encounter.focusBonus !== undefined && focusEnemyId === target.id) {
      est = scale(est, permille(1 + encounter.focusBonus))
    }
    for (const kw of actor.ref.keywords) {
      if (kw.kind === 'enrage' && tick >= modEnrageTick(depth.mods, kw.afterTick)) est = scale(est, permille(kw.multiplier))
      else if (kw.kind === 'frenzy' && actor.currentHP * 100 < actor.ref.stats.maxHP * kw.belowHpPct) est = scale(est, permille(kw.multiplier))
      else if (kw.kind === 'opener' && actor.actions === 0) est = scale(est, permille(kw.multiplier))
      else if (kw.kind === 'bane' && target.ref.family === kw.family) est = scale(est, permille(kw.multiplier))
    }
    let guardPm = 1000
    const ranged = actor.ref.unitClass === 'archer' || actor.ref.unitClass === 'mage'
    for (const kw of target.ref.keywords) {
      if (kw.kind === 'resist' && kw.damageType === skill.damageType && tick >= (kw.fromTick ?? 0)) {
        guardPm = scale(guardPm, 1000 - permille(kw.reduction))
      } else if (kw.kind === 'vulnerable' && kw.element === el) {
        est = scale(est, permille(C.vulnerableMult))
      } else if (kw.kind === 'guard' && (kw.vs === undefined || (kw.vs === 'ranged' ? ranged : kw.vs === el))) {
        guardPm = scale(guardPm, 1000 - permille(kw.reduction))
      }
    }
    est = scale(est, Math.max(permille(MIN_GUARD_MULT), guardPm))
    est = scale(est, permille(depthDamageMult(depth, actor, target, el, all)))
    est = scale(est, aoeSpreadPermille(spread))
    return Math.max(0, est)
  }

  // ── Damage resolution against ONE target (pins crit→variance draw order) ──
  /**
   * `spread`: how many foes a sweep strikes at once (its falloff); 1 for a single blow.
   * `followUp`: a friend pressing an ally's attack — not the striker's own action, so it
   * neither uses nor spends their `opener`.
   */
  const resolveHit = (actor: MutUnit, skill: SkillEffect, target: MutUnit, spread = 1, followUp = false): void => {
    const aStats = actor.ref.stats
    const tStats = target.ref.stats
    const physical: boolean = skill.damageType === 'physical'
    const atk = physical ? aStats.pAtk : aStats.mAtk
    const def = physical ? tStats.pDef : tStats.mDef
    const el: Element = skill.element ?? actor.ref.element

    // (0) MISS (fog, a grudge at the actor's side): the roll is gated on a positive chance,
    //     so a battle without them keeps its exact draw order.
    const pMiss = depth.bonds.length > 0 || depth.mods.length > 0 ? missChance(depth, actor, everyone()) : 0
    if (pMiss > 0) {
      const m = chance(rng, pMiss)
      rng = m.rng
      rngDraws++
      if (m.value) {
        emit({ kind: 'miss', actorId: actor.id, targetId: target.id })
        return
      }
    }

    // (1) crit roll
    const critDraw = chance(rng, aStats.critPct / 100)
    rng = critDraw.rng
    rngDraws++
    const crit = critDraw.value
    const critMult = crit ? C.critMult : 1

    // (2) variance draw
    const vDraw = nextFloat(rng)
    rng = vDraw.rng
    rngDraws++
    const variance = C.varianceMin + vDraw.value * (C.varianceMax - C.varianceMin)

    const eMult = elementMult(el, target.ref.element)
    const k = C.defenseKFlat + C.defenseKPerLevel * actor.ref.level
    const mitig = k / (k + def)

    let damage = atk * skill.skillMult * eMult * critMult * mitig * variance * C.damageScale

    // TACTICAL CENTER focus: a hero concentrating fire on the marked enemy deals
    // a level-scaled damage bonus (the strength rides on the Encounter; no RNG).
    if (
      actor.side === 'hero' &&
      encounter.focusBonus !== undefined &&
      focusEnemyId === target.id
    ) {
      damage *= 1 + encounter.focusBonus
    }

    // Actor keywords: ENRAGE past its timer, FRENZY while low, OPENER on the first
    // action, BANE against a family. None draws RNG.
    for (const kw of actor.ref.keywords) {
      if (kw.kind === 'enrage' && tick >= modEnrageTick(depth.mods, kw.afterTick)) {
        damage *= kw.multiplier
      } else if (kw.kind === 'frenzy' && actor.currentHP * 100 < actor.ref.stats.maxHP * kw.belowHpPct) {
        damage *= kw.multiplier
      } else if (kw.kind === 'opener' && actor.actions === 0 && !followUp) {
        damage *= kw.multiplier
      } else if (kw.kind === 'bane' && target.ref.family === kw.family) {
        damage *= kw.multiplier
      }
    }

    // Target keywords: IMMUNE to a damage type, VULNERABLE to an element, GUARD
    // reductions (floored so stacked guards never reach immunity).
    // How the blow meets the target's defences (WEAK! / RESIST / IMMUNE on screen):
    // the element wheel, vulnerabilities and resistances — guards are armour, not this.
    let affinity = eMult
    let immune = false
    let guardMult = 1
    const ranged = actor.ref.unitClass === 'archer' || actor.ref.unitClass === 'mage'
    for (const kw of target.ref.keywords) {
      if (kw.kind === 'immune' && kw.damageType === skill.damageType) {
        damage = 0
        immune = true
      } else if (kw.kind === 'resist' && kw.damageType === skill.damageType && tick >= (kw.fromTick ?? 0)) {
        guardMult *= 1 - kw.reduction
        affinity *= 1 - kw.reduction
      } else if (kw.kind === 'vulnerable' && kw.element === el) {
        damage *= C.vulnerableMult
        affinity *= C.vulnerableMult
      } else if (kw.kind === 'guard' && (kw.vs === undefined || (kw.vs === 'ranged' ? ranged : kw.vs === el))) {
        guardMult *= 1 - kw.reduction
      }
    }
    damage *= Math.max(MIN_GUARD_MULT, guardMult)
    // Formation, rivalry and the floor's conditions (all 1 in a plain battle).
    damage *= depthDamageMult(depth, actor, target, el, everyone())
    // AoE FALLOFF: a sweep spreads its force over every foe it strikes.
    if (spread > 1) damage = (damage * 100) / (100 + C.aoeFalloffK * (spread - 1))
    const eff: HitEffect | undefined = immune ? 'immune' : affinity > 1 ? 'weak' : affinity < 1 ? 'resist' : undefined

    // AEGIS: a charge negates the whole hit (the draws above are already spent, so the
    // stream stays identical to an un-guarded replay).
    if (target.aegis > 0) {
      target.aegis--
      emit({ kind: 'guard', actorId: actor.id, targetId: target.id })
      return
    }

    const amount = Math.round(damage)
    // COVER: a close friend on a neighbouring line may take a killing blow in their
    // friend's place (once per pair a battle; rolled only when the chance exists).
    let covered = false
    const cover = coverFor(depth, target, amount, everyone(), coversUsed)
    if (cover !== null) {
      const c = chance(rng, cover.chance)
      rng = c.rng
      rngDraws++
      if (c.value) {
        coversUsed.add(pairKey(cover.unit.id, target.id))
        emit({ kind: 'cover', unitId: cover.unit.id, allyId: target.id, actorId: actor.id })
        target = cover.unit as MutUnit
        covered = true
      }
    }
    target.currentHP -= amount
    emit({
      kind: 'hit',
      actorId: actor.id,
      targetId: target.id,
      amount,
      // A blow the target is immune to is no critical one (the roll is still spent, so
      // the stream is unchanged): no hit-stop, no CRITICAL! over an IMMUNE.
      crit: crit && !immune,
      hpAfter: target.currentHP,
      // (A friend who stepped in front took a blow meant for someone else.)
      ...(eff !== undefined && !covered ? { eff } : {}),
    })

    // LIFESTEAL: the actor recovers a share of what it dealt (capped at max HP).
    if (actor.alive && amount > 0) {
      for (const kw of actor.ref.keywords) {
        if (kw.kind !== 'lifesteal') continue
        const heal = Math.min(Math.round(amount * kw.fraction * healMult(depth, actor)), actor.ref.stats.maxHP - actor.currentHP)
        if (heal > 0) {
          actor.currentHP += heal
          emit({ kind: 'heal', unitId: actor.id, amount: heal, hpAfter: actor.currentHP })
        }
      }
    }

    if (target.currentHP <= 0 && target.alive) {
      target.alive = false
      emit({ kind: 'death', unitId: target.id })
      // Record Defeat(target) tags as tagged enemies fall.
      const tag = target.ref.targetTag
      if (tag !== undefined && !defeatedTargetTags.includes(tag)) {
        defeatedTargetTags.push(tag)
        const kind = target.side === 'enemy' ? objectiveKind(tag) : undefined
        if (kind === 'acquire') missionBeat('taken', { unitId: target.id, tag }, `${target.ref.name} falls — the prize is taken!`)
        else if (kind === 'defeat') missionBeat('defeated', { unitId: target.id, tag }, `${target.ref.name} is defeated!`)
      }
    } else {
      watchEscort(target)
    }
  }

  // ── Target selection by actor class (+ focus) ─────────────────────────────
  const frontMost = (cands: MutUnit[]): MutUnit =>
    cands.reduce((best, c) => (c.spawnIndex < best.spawnIndex ? c : best))

  /** The class rule (and the screens around it) over a candidate pool; no RNG. */
  const classPick = (actor: MutUnit, pool: MutUnit[]): MutUnit => {
    let cands = pool
    // Heroes don't chase a looming unit while anything else can be hit.
    if (actor.side === 'hero') {
      const lesser = cands.filter((c) => !isLooming(c))
      if (lesser.length > 0) cands = lesser
    }

    // OVERLOOK (Tactical Center): enemy targeting is steered off marked allies while
    // any non-overlooked ally lives (deterministic; no RNG). Falls back to the full
    // pool if every candidate is overlooked.
    if (actor.side === 'enemy') {
      if (overlooked.length > 0) {
        const visible = cands.filter((c) => !overlooked.includes(c.id))
        if (visible.length > 0) cands = visible
      }
    }

    const cls = actor.ref.unitClass
    if (cls === 'archer' || cls === 'mage') {
      // lowest currentHP; ties by spawn order (front-most).
      return cands.reduce((best, c) =>
        c.currentHP < best.currentHP || (c.currentHP === best.currentHP && c.spawnIndex < best.spawnIndex)
          ? c
          : best,
      )
    }
    if (cls === 'thief') {
      // highest cp; ties by spawn order (front-most).
      return cands.reduce((best, c) =>
        c.ref.cp > best.ref.cp || (c.ref.cp === best.ref.cp && c.spawnIndex < best.spawnIndex) ? c : best,
      )
    }
    // warrior / spearman / null → front-most.
    return frontMost(cands)
  }

  /** Foes `skill` can actually hurt — or every foe, when none can (nothing to choose). */
  const hurtable = (cands: MutUnit[], skill: SkillEffect): MutUnit[] => {
    const open = cands.filter((c) => !immuneTo(c.ref, skill))
    return open.length > 0 ? open : cands
  }

  /** Does this hero obey the Master's focus (a Wary, defiant hero picks their own)? */
  const focusFor = (actor: MutUnit, cands: MutUnit[]): MutUnit | undefined =>
    actor.side === 'hero' && actor.ref.defiant !== true && focusEnemyId !== undefined
      ? cands.find((e) => e.id === focusEnemyId)
      : undefined

  /** Where `skill` would land as a single blow, as the AI previews it (no rivalry roll). */
  const previewTarget = (actor: MutUnit, skill: SkillEffect, foes: MutUnit[]): MutUnit | null => {
    if (foes.length === 0) return null
    const cands = hurtable(foes, skill)
    return focusFor(actor, cands) ?? classPick(actor, cands)
  }

  /** Set when the last target pick was a rival chasing their own kill (the rival's id). */
  let chasing: string | null = null
  const pickSingleTarget = (actor: MutUnit, skill: SkillEffect): MutUnit | null => {
    chasing = null
    const foes = targetableFoes(actor)
    if (foes.length === 0) return null
    // IMMUNITY: nobody swings at a foe the blow cannot hurt while another can be hurt
    // (at the Wall, a mage stops casting into a magic-immune Fragment Knight).
    let cands = hurtable(foes, skill)

    // FOCUS: hero attackers force-prioritize a living, targetable focus enemy (a Wary,
    // defiant hero ignores the Master and picks its own target).
    const focused = focusFor(actor, cands)
    if (focused !== undefined) {
      // RIVALRY: a hero whose rival fights beside them may chase a kill of their own.
      const rival = cands.length > 1 ? rivalOf(depth, actor, everyone()) : null
      if (rival === null) return focused
      const d = chance(rng, DEPTH_RIVAL_IGNORE)
      rng = d.rng
      rngDraws++
      if (!d.value) return focused
      chasing = rival.id
      cands = cands.filter((c) => c.id !== focused.id)
    }
    return classPick(actor, cands)
  }

  // ── Skill selection: the most expected damage (the "Quantum AI") ──────────
  // Castable = enough SP, and an HP cost leaves at least hpCostFloorPct of max HP.
  // Each castable skill is scored by the damage it can be expected to deal, summed over
  // the foes it would strike and capped at each foe's HP (overkill and immunity count;
  // a sweep's falloff counts), so a single-target skill wins on a lone boss and a sweep
  // wins on a crowd. Ties go to the cheaper skill (SP, then HP), then to list order, so
  // the free basic attack is kept when nothing beats it. No RNG is drawn.
  const castable = (actor: MutUnit, s: SkillEffect): boolean => canCast(actor.currentSP, actor.currentHP, actor.ref.stats.maxHP, s)
  /** Equal expected damage (both kill, both do nothing): never pay HP for nothing; else
   *  the bigger blow — a hero practises the skill it knows (skills level by use) — else
   *  the cheaper one. */
  const tieGoesTo = (s: SkillEffect, raw: number, best: SkillEffect, bestRaw: number): boolean => {
    const hp = s.hpCost ?? 0
    const bestHp = best.hpCost ?? 0
    if (hp !== bestHp) return hp < bestHp
    if (raw !== bestRaw) return raw > bestRaw
    return s.spCost < best.spCost
  }
  const chooseSkill = (actor: MutUnit): SkillEffect => {
    const own = actor.ref.skills
    // One skill (every enemy's lone Strike or Spell): nothing to weigh.
    if (own.length <= 1) return own[0] !== undefined && castable(actor, own[0]) ? own[0] : BASIC_ATTACK
    const foes = targetableFoes(actor)
    const all = everyone()
    const spread = foes.length
    let best: SkillEffect | null = null
    let bestScore = -1
    let bestRaw = -1
    for (const s of actor.ref.skills) {
      if (!castable(actor, s)) continue
      let score = 0
      let raw = 0
      const hit = (t: MutUnit, n: number) => {
        const blow = estimateBlow(actor, s, t, n, all)
        raw += blow
        score += Math.min(blow, Math.max(0, t.currentHP))
      }
      if (s.target === 'all-enemies') {
        for (const f of foes) hit(f, spread)
      } else {
        const t = previewTarget(actor, s, foes)
        if (t !== null) hit(t, 1)
      }
      if (score > bestScore || (score === bestScore && best !== null && tieGoesTo(s, raw, best, bestRaw))) {
        best = s
        bestScore = score
        bestRaw = raw
      }
    }
    // Synthesized basic attack (spCost 0) so skills may be empty.
    return best ?? BASIC_ATTACK
  }

  // Authored-skill casts per hero, for the post-combat auto-learn fold.
  const skillCasts: Record<string, Record<string, number>> = {}
  /** Pay a skill's costs and tally the cast. */
  const payAndTally = (actor: MutUnit, skill: SkillEffect): void => {
    actor.currentSP -= skill.spCost
    if (skill.hpCost !== undefined && skill.hpCost > 0) {
      actor.currentHP -= skill.hpCost
      emit({ kind: 'hp-cost', unitId: actor.id, amount: skill.hpCost, hpAfter: actor.currentHP })
    }
    const sid = actor.ref.sourceHeroId
    if (sid !== undefined && skill.id !== 'basic' && skill.id !== BASIC_ATTACK.id) {
      const tally = (skillCasts[sid] ??= {})
      tally[skill.id] = (tally[skill.id] ?? 0) + 1
    }
  }

  // ── Mission evaluation (after each action) ────────────────────────────────
  const objectiveMet = (obj: Objective): boolean => {
    switch (obj.kind) {
      case 'annihilate':
        return livingEnemies().length === 0 && !moreWavesToSpawn()
      case 'defend':
        return wavesCleared >= obj.waves
      case 'survive':
        // Outlast the timer — or the horde itself: with every wave spent and no foe
        // standing, the floor is held at once (no idling to the bell).
        return (tick >= obj.ticks || hordeSpent()) && livingHeroes().length > 0
      case 'defeat':
        return defeatedTargetTags.includes(obj.targetTag)
      case 'protect':
        return allyAlive(obj.targetTag)
      case 'reach':
        return reachProgress >= obj.distance
      case 'acquire':
        return defeatedTargetTags.includes(obj.targetTag)
    }
  }
  /** A protect objective whose NPC has fallen loses the mission outright. */
  const protectFailed = (): boolean =>
    objectives.some((o) => o.kind === 'protect' && !allyAlive(o.targetTag))
  const missionWon = (): boolean =>
    objectives.length > 0 && objectives.every(objectiveMet)

  /** Waiting or walking can win this mission (a survival, an escape): never futile. */
  const winsWithoutBlows = objectives.some((o) => o.kind === 'survive' || o.kind === 'reach')
  /** Everything `u` could still strike with: its castable skills (SP never refills), the
   *  basic attack it falls back on, and the strike it presses a friend's attack with. */
  const strikesOf = (u: MutUnit): SkillEffect[] => {
    const open = u.ref.skills.filter((s) => castable(u, s))
    return [...(open.length > 0 ? open : [BASIC_ATTACK]), followUpSkill(u.ref, BASIC_ATTACK)]
  }
  /**
   * FUTILITY: nothing the party still holds can hurt any foe it has to beat — a squad of
   * blades against a lone, physical-immune Fragment Warden. It can only get worse (SP
   * never refills, a foe falls only to a blow), so the party falls back at once instead of
   * swinging IMMUNE until it dies or the clock runs out. The foe the beat names is the
   * front-most one standing.
   */
  const futileFoe = (): MutUnit | null => {
    if (winsWithoutBlows) return null
    const foes = livingEnemies().filter((e) => !isLooming(e))
    if (foes.length === 0) return null
    const strikes = heroes.filter((h) => h.alive).flatMap(strikesOf)
    if (foes.some((f) => strikes.some((s) => !immuneTo(f.ref, s)))) return null
    return frontMost(foes)
  }

  const evaluateState = (): void => {
    if (outcome !== null) return
    if (livingHeroes().length === 0) {
      outcome = 'wipe'
      return
    }
    if (protectFailed()) {
      outcome = 'failed'
      return
    }
    if (missionWon()) {
      if (surviveObjective !== undefined && tick < surviveObjective.ticks) {
        missionBeat('horde-spent', { left: surviveObjective.ticks - tick }, 'The horde is spent — the floor is held!')
      }
      outcome = 'win'
      return
    }
    const untouchable = futileFoe()
    if (untouchable !== null) {
      missionBeat('futile', { unitId: untouchable.id }, `Nothing can touch ${untouchable.ref.name} — fall back!`)
      outcome = 'retreat'
    }
  }

  /** After the current wave is fully dead, advance/spawn the next wave. */
  const maybeAdvanceWave = (): void => {
    if (outcome !== null) return
    // A wave is cleared once: a looming unit left standing in the last wave must not
    // count it again on every later action.
    if (wavesCleared > currentWave) return
    // A looming unit is outlasted, not killed: the wave counts as cleared without it.
    if (livingEnemiesInWave(currentWave).filter((e) => !isLooming(e)).length === 0) {
      wavesCleared++
      const waves = encounter.waves.length
      if (waves > 1) missionBeat('wave-cleared', { wave: wavesCleared, waves }, `Wave ${wavesCleared} of ${waves} cleared!`)
      if (moreWavesToSpawn()) {
        currentWave++
        const spawned = spawnWave(currentWave)
        emit({ kind: 'wave-spawn', wave: currentWave, enemyIds: spawned.map((e) => e.id) })
      }
    }
  }

  /** FOLLOW-UP: after `actor` strikes, one friend may press the attack on `target`
   *  (never chains; rolled only for a hero with friends in the party, and only by a
   *  friend whose strike can hurt the target). */
  const followUp = (actor: MutUnit, target: MutUnit): void => {
    if (!target.alive || !actor.alive) return
    for (const f of followUpCandidates(depth, actor, everyone())) {
      const strike = followUpSkill(f.unit.ref, BASIC_ATTACK)
      if (immuneTo(target.ref, strike)) continue
      const d = chance(rng, f.chance)
      rng = d.rng
      rngDraws++
      if (!d.value) continue
      emit({ kind: 'followup', unitId: f.unit.id, allyId: actor.id, targetId: target.id })
      // The friend's strike is not their own action: it neither uses nor spends their opener.
      resolveHit(f.unit as MutUnit, strike, target, 1, true)
      return
    }
  }

  // One unit takes its action.
  const act = (actor: MutUnit): void => {
    if (!actor.alive || outcome !== null) return
    // Mission NPCs (escort targets) never act — they only need protecting.
    if (actor.ref.isNpc) return
    // A looming unit sleeps until its enrage tick: it wakes, and then it is too late.
    if (isLooming(actor)) {
      const wake = actor.ref.keywords.find((k) => k.kind === 'enrage')
      if (wake !== undefined && wake.kind === 'enrage' && tick < modEnrageTick(depth.mods, wake.afterTick)) return
    }

    // PANIC (low Sanity): a hero below the panic threshold may lose its turn. The
    // draw is GATED on a positive chance, so a healthy hero never touches the rng —
    // existing full-Sanity replays keep their exact draw order. The action gauge was
    // already spent by the caller, so a panic naturally costs the whole turn; SP is
    // retained since no skill is chosen.
    // Any unit carrying Sanity can panic — heroes always do; a whale Master's brittle
    // PvP roster does too (enemies normally carry none, so their replays are unchanged).
    if (actor.ref.sanity !== undefined) {
      const p = panicChance(actor.ref.sanity, actor.ref.stats.statusRes)
      if (p > 0) {
        const draw = chance(rng, p)
        rng = draw.rng
        rngDraws++
        if (draw.value) {
          emit({ kind: 'panic', unitId: actor.id })
          return
        }
      }
    }

    // REACH: a hero's turn also presses the party one step toward the exit (even with
    // nothing left to strike). Only reach missions count, so other replays are untouched.
    if (hasReach && actor.side === 'hero') {
      reachProgress++
      watchReach()
      evaluateState()
      if (outcome !== null) return
    }

    const skill = chooseSkill(actor)

    if (skill.target === 'all-enemies') {
      const targets = targetableFoes(actor).slice().sort((a, b) => a.spawnIndex - b.spawnIndex)
      if (targets.length === 0) return // no valid target → action fizzles, SP retained
      // 'act' event uses the first target as a representative.
      emit({ kind: 'act', actorId: actor.id, skillId: skill.id, targetId: targets[0]!.id })
      payAndTally(actor, skill)
      for (const t of targets) {
        if (!t.alive) continue
        resolveHit(actor, skill, t, targets.length)
      }
      // A sweep is pressed on the front-most foe still standing.
      const standing = targets.find((t) => t.alive)
      if (standing !== undefined) followUp(actor, standing)
    } else {
      const target = pickSingleTarget(actor, skill)
      if (target === null) return // no valid target → action fizzles, SP retained
      if (chasing !== null) emit({ kind: 'rivalry', unitId: actor.id, rivalId: chasing, targetId: target.id })
      emit({ kind: 'act', actorId: actor.id, skillId: skill.id, targetId: target.id })
      payAndTally(actor, skill)
      resolveHit(actor, skill, target)
      followUp(actor, target)
    }

    actor.actions++

    // Deaths from this action may clear the wave / break a shield / satisfy the mission.
    maybeAdvanceWave()
    watchShields()
    evaluateState()
  }

  // ── ATB main loop ─────────────────────────────────────────────────────────
  const orders = [...(encounter.orders ?? [])].sort((a, b) => a.tick - b.tick)
  let nextOrder = 0
  for (tick = 1; tick <= C.maxTicks; tick++) {
    // The Master's orders land at the start of their tick (before anyone acts).
    while (nextOrder < orders.length && orders[nextOrder]!.tick <= tick) {
      const o = orders[nextOrder++]!
      emit({ kind: 'order', order: o })
      if (o.kind === 'retreat') outcome = 'retreat'
      else if (o.kind === 'focus') focusEnemyId = o.enemyId
      else if (o.kind === 'protect' && !overlooked.includes(o.allyId)) overlooked = [...overlooked, o.allyId]
    }
    if (outcome !== null) break

    // The mission's clock: countdown milestones, and whatever wakes on this tick.
    watchCountdown()
    watchLooming()

    // Fill action gauges for every living unit (stable order by id).
    const all = [...heroes, ...enemies].filter((u) => u.alive).sort(byId)
    for (const u of all) {
      u.actionGauge += modSpeed(depth.mods, u.ref.stats.spd)
    }

    // Everyone whose gauge >= actionGaugeMax acts this tick. Process highest
    // gauge first, ties by id; subtract actionGaugeMax (carry overflow).
    while (outcome === null) {
      const ready = [...heroes, ...enemies].filter((u) => u.alive && u.actionGauge >= C.actionGaugeMax)
      if (ready.length === 0) break
      ready.sort((a, b) => (b.actionGauge !== a.actionGauge ? b.actionGauge - a.actionGauge : byId(a, b)))
      const actor = ready[0]!
      actor.actionGauge -= C.actionGaugeMax
      act(actor)
    }

    if (outcome !== null) break

    // TIMEOUT: at the timer, re-evaluate (a survive objective is met at its tick).
    if (timer !== null && tick >= timer) {
      // survive/defend/etc. may now be satisfied at the boundary.
      if (missionWon()) {
        outcome = 'win'
      } else if (livingHeroes().length === 0) {
        outcome = 'wipe'
      } else {
        outcome = 'timeout'
      }
      break
    }
  }

  // Undecided at maxTicks → timeout.
  if (outcome === null) {
    outcome = livingHeroes().length === 0 ? 'wipe' : 'timeout'
  }

  emit({ kind: 'end', outcome })

  const ticksElapsed = tick > C.maxTicks ? C.maxTicks : tick

  // ── Build result + log ────────────────────────────────────────────────────
  const survivorHeroIds: HeroId[] = []
  const fallenHeroIds: HeroId[] = []
  for (const h of heroes) {
    const sid = h.ref.sourceHeroId
    if (sid === undefined) continue
    if (h.alive) survivorHeroIds.push(sid)
    else fallenHeroIds.push(sid)
  }

  const allyHpPct: Record<string, number> = {}
  for (const h of heroes) {
    const tag = h.ref.targetTag
    if (h.ref.isNpc && tag !== undefined) {
      allyHpPct[tag] = Math.round((Math.max(0, h.currentHP) / h.ref.stats.maxHP) * 100)
    }
  }

  // The mission as the replay shows it: each objective with the units that carry its tag.
  const logObjectives: LogObjective[] = objectives.map((o) => {
    if (o.kind !== 'defeat' && o.kind !== 'acquire' && o.kind !== 'protect') return { ...o }
    const unitIds = unitsInit.filter((u) => u.targetTag === o.targetTag).map((u) => u.id)
    return unitIds.length > 0 ? { ...o, unitIds } : { ...o }
  })

  const log: CombatLog = {
    seed,
    floor: encounter.floor,
    encounterContext: 'tower',
    unitsInit,
    events,
    outcome,
    rngDraws,
    mission: {
      type: encounter.mission.type,
      objectives: logObjectives,
      ...(timer !== null ? { timerTicks: timer } : {}),
      waves: encounter.waves.length,
    },
  }

  return {
    outcome,
    ticksElapsed,
    wavesCleared,
    defeatedTargetTags,
    reachProgress,
    allyHpPct,
    survivorHeroIds,
    fallenHeroIds,
    skillCasts,
    log,
  }
}

/** The implicit basic attack synthesized for every unit (spCost 0, always
 *  available). element null → inherit the unit's element. */
const BASIC_ATTACK: SkillEffect = {
  id: 'basic-attack',
  name: 'Basic Attack',
  skillMult: 1,
  damageType: 'physical',
  element: null,
  target: 'single',
  spCost: 0,
}
