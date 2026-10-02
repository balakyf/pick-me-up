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
 *
 * SKILLS & ROLES (lane F): a skill may carry effects — heal, regeneration, absorb shield,
 * buff/debuff of a stat, DoT (bleed/poison/burn), stun (a pushed-back action gauge), taunt,
 * SP restore/drain — and strike several times (each hit its own rolls and 'hit' event), or
 * land on the caster's own side ('self', 'ally-lowest', 'ally-threatened', 'all-allies') or
 * a formation shape ('front-row', 'cleave'). Statuses live on MutUnit.statuses (one per key)
 * and tick in the main loop before anyone acts; their events are 'status', 'status-end',
 * 'dot', 'shield', 'sp' and skill 'heal's. SP comes back each action and with each wound.
 * The brain prices every effect in the coin damage is scored in (HP). Every new roll (a
 * status's chance) is drawn only when 0 < chance < 100, so a battle without such a status
 * keeps its exact draw order. A stalemate guard ends a fight whose foes stop wearing down.
 *
 * ENEMY KITS, TELEGRAPHS, PHASES, ORDERS 2.0 (lane G): a skill may carry a `cooldown` (the
 * caster's own turns) and a `charge`: the caster spends its turn winding up — a 'telegraph'
 * event names the move, the tick it fires and whom it threatens — its gauge stops, and the
 * move fires on that tick on its own ('act' with `charged`). A stun or its death cancels it
 * ('telegraph-end'); the Master's Guard (the party braces: less damage, no attacks until it
 * lands) and Protect (a protected hero takes it softened) answer it; a retreat escapes it. A
 * `phase` keyword turns a boss at an HP threshold (a blow never carries it past one): new
 * keywords and skills, a speed change, a cleanse, reserves called onto the field ('phase',
 * 'summon'). A `summon` effect calls reserves too (the Egg's brood). The Master's new orders:
 * Unleash (a hero's gauge fills and it casts its best skill now), Guard, Hold (SP is kept for
 * a crowd or the boss) and Swap (two heroes trade places); a Focus also makes a sweep land on
 * the mark at fuller force. None of it draws RNG.
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
  BuffStat,
  DotKind,
  ResolvedEffect,
  StatusKey,
  PhaseKeyword,
  KeywordTag,
  EnemyFamily,
  BattleOrder,
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
import { resolveSkillEffect } from '../skills'
import { SKILLS } from '../content'
import { BOSS, ORDERS } from './bossTuning'

const C = TUNING.combat
const R = TUNING.roles
const BRAIN = TUNING.roles.brain
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
  /** Statuses it carries (lane F): at most one per key, ticking down in the main loop. */
  statuses: Status[]
  /** Skill heals (and regenerations) it has taken this battle: each closes less (fatigue). */
  healsTaken: number
  /** Wound-to-SP remainder (HP × spPerBarTaken not yet worth a whole SP). */
  spBank: number
  /** Skills on cooldown: actions left before each can be cast again (lane G). */
  cooldowns: Record<string, number>
  /** A move it is winding up (lane G), or null. */
  charge: Charge | null
  /** Its boss phases, highest threshold first, and how many it has passed. */
  phases: PhaseKeyword[]
  phasesDone: number
}

/** A wound-up move (lane G): it fires at `firesAt` unless a stun or a death cancels it. */
interface Charge {
  skill: SkillEffect
  firesAt: number
  /** Whom it threatened as it wound up (a single blow still aims there if it can). */
  targets: MutUnit[]
}

/** A status on a unit (lane F). */
interface Status {
  key: StatusKey
  /** Ticks left (a stun: until its bearer acts). */
  left: number
  /** A buff/debuff's % (crit: points), a shield's pool, a DoT's or regeneration's HP per pulse. */
  value: number
  /** Ticks between pulses (DoT / regeneration), else 0. */
  every: number
  /** Ticks to the next pulse. */
  nextPulse: number
  /** Pulses still to come (a DoT or regeneration pulses exactly its `turns`, however the
   *  ticks divide), else 0. */
  pulses: number
  sourceId: string
}

/** A stun lasts until its bearer next acts. */
const UNTIL_ACTS = Number.MAX_SAFE_INTEGER

function copyUnit(u: CombatUnit, spawnIndex: number, wave: number): MutUnit {
  let aegis = 0
  for (const k of u.keywords) if (k.kind === 'aegis') aegis += k.charges
  const phases = u.keywords.filter((k): k is PhaseKeyword => k.kind === 'phase').sort((a, b) => b.atHpPct - a.atHpPct)
  return {
    actions: 0,
    aegis,
    statuses: [],
    healsTaken: 0,
    spBank: 0,
    cooldowns: {},
    charge: null,
    phases,
    phasesDone: 0,
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

/** Does this skill strike (a blow), or only tend and bend (a support skill, baseMult 0)? */
export function strikes(s: SkillEffect): boolean {
  return s.skillMult > 0
}

/** Does this skill land on the caster's own side (a heal, a shield, a war cry)? */
export function tendsAllies(s: SkillEffect): boolean {
  return s.target === 'self' || s.target === 'ally-lowest' || s.target === 'ally-threatened' || s.target === 'all-allies'
}

/** The DoT an elemental skill inflicts: fire and light burn, earth, water and dark poison,
 *  wind and plain steel cut (bleed). */
export function dotKindFor(el: Element): DotKind {
  if (el === 'fire' || el === 'light') return 'burn'
  if (el === 'earth' || el === 'water' || el === 'dark') return 'poison'
  return 'bleed'
}

/** The status key a buff (up) or debuff (down) of `stat` sets. */
export function statKey(stat: BuffStat, up: boolean): StatusKey {
  return `${stat}-${up ? 'up' : 'down'}` as StatusKey
}

/** Does this status hurt its bearer (a debuff, a DoT, a daze)? — what a phase's cleanse drops. */
function isBane(key: StatusKey): boolean {
  return key.endsWith('-down') || key === 'bleed' || key === 'poison' || key === 'burn' || key === 'stun'
}

/** The net % (crit: points) the unit's buffs and debuffs bend `stat` by. 0 with none. */
function statMod(statuses: readonly Status[], stat: BuffStat): number {
  let v = 0
  for (const st of statuses) {
    if (st.key === `${stat}-up`) v += st.value
    else if (st.key === `${stat}-down`) v -= st.value
  }
  return v
}

/** v bent by a signed percent (never below a tenth). Exactly v when pct is 0. */
function bend(v: number, pct: number): number {
  if (pct === 0) return v
  return (v * Math.max(10, 100 + pct)) / 100
}

/** Does a `guard` keyword's source cover this blow? (ranged: archers and mages; melee:
 *  everyone else — a dragon in the air; an element: blows of it.) */
function guardCovers(vs: KeywordTag & { kind: 'guard' }, ranged: boolean, el: Element): boolean {
  if (vs.vs === undefined) return true
  if (vs.vs === 'ranged') return ranged
  if (vs.vs === 'melee') return !ranged
  return vs.vs === el
}

/** The family a `bane` keyword reads: an enemy's own; a hero is human (lane G: the Order's
 *  Inquisitors hunt them). */
function familyOf(u: CombatUnit): EnemyFamily | undefined {
  return u.family ?? (u.side === 'hero' ? 'humanoid' : undefined)
}

/** The brace a guarding hero spends its turn on (lane G): no blow, no cost. */
export const BRACE_ID = 'brace'

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
  // Lane G: units a phase or a summoning skill may call onto the field (the replay knows them).
  for (const group of Object.values(encounter.reserves ?? {})) for (const e of group) snapshot(e)

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
  // ORDERS 2.0 (lane G): the party braces until this tick (Guard); a standing Guard waits for
  // the first wind-up; Hold keeps SP for a crowd or the boss; Unleashed heroes cast now.
  let guardUntil = 0
  let guardArmed = false
  let holdSp = false
  const unleashed = new Set<string>()
  /** Reserve units not yet called, by group (in their authored order). */
  const reserveLeft = new Map<string, CombatUnit[]>(Object.entries(encounter.reserves ?? {}).map(([g, us]) => [g, [...us]]))
  /** A charged move firing now (its blows on a protected hero land softened). */
  let firing = false

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
   * The damage `actor`'s `skill` can be expected to deal to `target` (uncapped — chooseSkill
   * caps each blow at the target's current HP, so overkill is wasted): attack × skill
   * × element × mitigation × the expected crit, the actor's keyword multipliers, the
   * target's immunity / resistances / vulnerabilities / guards, the line and floor
   * multipliers, and a sweep's falloff over `spread` foes. An aegis charge negates the next
   * blow, so it scores 0.
   */
  const estimateBlow = (actor: MutUnit, skill: SkillEffect, target: MutUnit, spread: number, all: readonly MutUnit[]): number => {
    if (target.aegis > 0 || immuneTo(target.ref, skill)) return 0
    const aStats = actor.ref.stats
    const tStats = target.ref.stats
    const physical = skill.damageType === 'physical'
    const atk = Math.max(0, Math.floor(bend(physical ? aStats.pAtk : aStats.mAtk, statMod(actor.statuses, 'atk'))))
    const def = Math.max(0, Math.floor(bend(physical ? tStats.pDef : tStats.mDef, statMod(target.statuses, 'def'))))
    const el: Element = skill.element ?? actor.ref.element

    let est = scale(atk, permille(skill.skillMult * C.damageScale))
    est = scale(est, permille(elementMult(el, target.ref.element)))
    const k = C.defenseKFlat + C.defenseKPerLevel * actor.ref.level
    est = Math.floor((est * k) / (k + def))
    // The expected crit: chance × (critMult − 1) on top of the plain blow.
    const critChancePm = Math.max(0, Math.min(1000, Math.round((aStats.critPct + statMod(actor.statuses, 'crit')) * 10)))
    est = scale(est, 1000 + scale(critChancePm, permille(C.critMult) - 1000))
    if (actor.side === 'hero' && encounter.focusBonus !== undefined && focusEnemyId === target.id) {
      est = scale(est, permille(1 + encounter.focusBonus))
    }
    for (const kw of actor.ref.keywords) {
      if (kw.kind === 'enrage' && tick >= modEnrageTick(depth.mods, kw.afterTick)) est = scale(est, permille(kw.multiplier))
      else if (kw.kind === 'frenzy' && actor.currentHP * 100 < actor.ref.stats.maxHP * kw.belowHpPct) est = scale(est, permille(kw.multiplier))
      else if (kw.kind === 'opener' && actor.actions === 0) est = scale(est, permille(kw.multiplier))
      else if (kw.kind === 'bane' && familyOf(target.ref) === kw.family) est = scale(est, permille(kw.multiplier))
    }
    let guardPm = 1000
    const ranged = actor.ref.unitClass === 'archer' || actor.ref.unitClass === 'mage'
    for (const kw of target.ref.keywords) {
      if (kw.kind === 'resist' && kw.damageType === skill.damageType && tick >= (kw.fromTick ?? 0)) {
        guardPm = scale(guardPm, 1000 - permille(kw.reduction))
      } else if (kw.kind === 'vulnerable' && kw.element === el) {
        est = scale(est, permille(C.vulnerableMult))
      } else if (kw.kind === 'guard' && guardCovers(kw, ranged, el)) {
        guardPm = scale(guardPm, 1000 - permille(kw.reduction))
      }
    }
    // A guard status (up: takes less; down — a Mark: takes more) bends the guard as armour.
    const guardStatus = statMod(target.statuses, 'guard')
    if (guardStatus !== 0) guardPm = scale(guardPm, Math.max(0, 1000 - guardStatus * 10))
    est = scale(est, Math.max(permille(MIN_GUARD_MULT), guardPm))
    est = scale(est, permille(depthDamageMult(depth, actor, target, el, all)))
    est = scale(est, sweepSharePm(actor, target, spread))
    return Math.max(0, est) * (skill.hits ?? 1)
  }

  /** A sweep's share of its force on one of `spread` foes (per-mille): the falloff — but the
   *  Master's mark takes a sweep at no less than focusSweepFloorPct (lane G). */
  const sweepSharePm = (actor: MutUnit, target: MutUnit, spread: number): number => {
    const pm = aoeSpreadPermille(spread)
    if (spread > 1 && actor.side === 'hero' && focusEnemyId === target.id) return Math.max(pm, ORDERS.focusSweepFloorPct * 10)
    return pm
  }

  // ── Wounds, shields, SP and statuses (lane F) ─────────────────────────────
  /** A unit just lost HP: it falls at 0 (Defeat / Capture tags recorded), or the escort's
   *  wounds are announced. */
  const afterDamage = (target: MutUnit): void => {
    if (target.currentHP <= 0 && target.alive) {
      target.alive = false
      emit({ kind: 'death', unitId: target.id })
      // A move it was winding up dies with it.
      if (target.charge !== null) {
        emit({ kind: 'telegraph-end', unitId: target.id, skillId: target.charge.skill.id, reason: 'fell' })
        target.charge = null
      }
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
      if (target.alive) maybePhase(target)
    }
  }

  // ── Boss phases and summons (lane G) ──────────────────────────────────────
  /** The next phase `u` has not reached, if any. */
  const nextPhase = (u: MutUnit): PhaseKeyword | undefined => u.phases[u.phasesDone]
  /** The HP a phase's threshold stands at. */
  const phaseHp = (u: MutUnit, ph: PhaseKeyword): number => Math.floor((u.ref.stats.maxHP * ph.atHpPct) / 100)
  /** A blow never carries a boss past a phase it has not reached: what `amount` may take. */
  const capForPhase = (u: MutUnit, amount: number): number => {
    const ph = nextPhase(u)
    if (ph === undefined || amount <= 0) return amount
    const floor = phaseHp(u, ph)
    return u.currentHP > floor ? Math.min(amount, u.currentHP - floor) : amount
  }

  /** Call up to `count` units of a reserve group onto the field beside `summoner`. */
  const summonReserve = (summoner: MutUnit, group: string, count: number): number => {
    const left = reserveLeft.get(group) ?? []
    const called = left.splice(0, Math.max(0, count))
    if (called.length === 0) return 0
    const spawned = called.map((u) => copyUnit(u, spawnCounter++, summoner.wave))
    for (const sp of spawned) enemies.push(sp)
    emit({ kind: 'summon', unitId: summoner.id, enemyIds: spawned.map((x) => x.id), wave: summoner.wave })
    // New foes on the field: the stalemate watch starts over, and a phased boss may be
    // shielded again by its brood.
    foeHpLow = Number.MAX_SAFE_INTEGER
    stallActs = 0
    watchShields()
    return spawned.length
  }

  /** `u` reached its next phase's threshold: it turns (once per phase, in order). */
  const maybePhase = (u: MutUnit): void => {
    const ph = nextPhase(u)
    if (ph === undefined || u.currentHP * 100 > ph.atHpPct * u.ref.stats.maxHP) return
    u.phasesDone++
    const added = ph.addKeywords ?? []
    for (const k of added) if (k.kind === 'aegis') u.aegis += k.charges
    const learned = (ph.skills ?? [])
      .map((id) => resolveSkillEffect({ id, level: 1, xp: 0 }, SKILLS))
      .filter((x): x is SkillEffect => x !== null && !u.ref.skills.some((o) => o.id === x.id))
    const spd = ph.spdPct !== undefined && ph.spdPct !== 0 ? Math.max(1, Math.floor((u.ref.stats.spd * (100 + ph.spdPct)) / 100)) : null
    u.ref = {
      ...u.ref,
      keywords: [...u.ref.keywords, ...added],
      skills: [...u.ref.skills, ...learned],
      ...(spd !== null ? { stats: { ...u.ref.stats, spd } } : {}),
    }
    emit({
      kind: 'phase',
      unitId: u.id,
      phase: u.phasesDone,
      phases: u.phases.length,
      ...(ph.title !== undefined ? { title: ph.title } : {}),
      ...(ph.line !== undefined ? { line: ph.line } : {}),
      ...(spd !== null ? { spd } : {}),
    })
    // It shakes off what the party left on it.
    if (ph.cleanse) for (const st of [...u.statuses]) if (isBane(st.key)) dropStatus(u, st, 'expired')
    if (ph.summonWave !== undefined) summonReserve(u, ph.summonWave, Number.MAX_SAFE_INTEGER)
  }

  const statusOf = (u: MutUnit, key: StatusKey): Status | undefined => u.statuses.find((st) => st.key === key)
  const dropStatus = (u: MutUnit, st: Status, reason: 'expired' | 'broken' | 'acted'): void => {
    u.statuses = u.statuses.filter((x) => x !== st)
    emit({ kind: 'status-end', unitId: u.id, status: st.key, reason })
  }

  /** A shield soaks up to `amount` of a blow or a DoT (announced); returns what it soaked. */
  const absorb = (u: MutUnit, amount: number, fromId: string): number => {
    if (amount <= 0) return 0
    const sh = statusOf(u, 'shield')
    if (sh === undefined) return 0
    const soaked = Math.min(sh.value, amount)
    sh.value -= soaked
    emit({ kind: 'shield', unitId: u.id, actorId: fromId, absorbed: soaked, left: sh.value })
    if (sh.value <= 0) dropStatus(u, sh, 'broken')
    return soaked
  }

  /** Taking damage feeds the SP pool: spPerBarTaken for a whole bar of max HP (pro rata). */
  const gainSpOnHit = (u: MutUnit, amount: number): void => {
    if (amount <= 0 || R.spPerBarTaken <= 0 || u.currentHP <= 0) return
    // Banked so small cuts add up (integer: HP × rate, a whole SP per max HP).
    const max = Math.max(1, u.ref.stats.maxHP)
    u.spBank += amount * R.spPerBarTaken
    const gain = Math.floor(u.spBank / max)
    if (gain <= 0) return
    u.spBank -= gain * max
    u.currentSP = Math.min(u.ref.maxSP, u.currentSP + gain)
  }

  /** HEAL FATIGUE: each skill heal a unit has taken this battle closes less (a wound bound
   *  twice closes less): the percent the next one restores. */
  const fatiguePct = (u: MutUnit): number => Math.max(R.healFatigueFloorPct, 100 - R.healFatiguePct * u.healsTaken - wearinessPct())
  /** WEARINESS: the longer a fight runs, the less any heal or shield holds (a long siege
   *  wears everyone down): this many % off, growing with the ticks elapsed. */
  const wearinessPct = (): number => Math.floor((tick * R.wearPctPer100Ticks) / 100)

  /** The unit's speed this tick: the floor's conditions, then its spd buffs / debuffs. */
  const speedOf = (u: MutUnit): number => {
    const base = modSpeed(depth.mods, u.ref.stats.spd)
    const pct = statMod(u.statuses, 'spd')
    return pct === 0 ? base : Math.floor(bend(base, pct))
  }

  /** `turns` of `caster`'s own actions, in ticks (a status's clock). */
  const turnsToTicks = (caster: MutUnit, turns: number): number =>
    Math.max(R.minStatusTicks, Math.ceil((turns * C.actionGaugeMax) / Math.max(1, speedOf(caster))))

  /** How many actions `u` takes in `ticks` (at least 1; the estimate's horizon is capped). */
  const turnsIn = (u: MutUnit, ticks: number): number =>
    Math.max(1, Math.min(BRAIN.maxTurnsCounted, Math.floor((ticks * Math.max(1, speedOf(u))) / C.actionGaugeMax)))

  /** HP a heal-type effect restores (or a shield holds): % of the caster's mAtk or pDef, or
   *  of the recipient's max HP. */
  const healAmount = (caster: MutUnit, to: MutUnit, from: 'mAtk' | 'maxHP' | 'def', pct: number): number => {
    const base =
      from === 'mAtk' ? bend(caster.ref.stats.mAtk, statMod(caster.statuses, 'atk')) : from === 'def' ? caster.ref.stats.pDef : to.ref.stats.maxHP
    return Math.max(1, Math.floor((base * pct) / 100))
  }

  /** HP a DoT pulse deals: % of the caster's attack (its stronger kind, at the fight's pace),
   *  or of the bearer's max HP. */
  const dotAmount = (caster: MutUnit, to: MutUnit, from: 'atk' | 'maxHP', pct: number): number => {
    const atk = Math.max(caster.ref.stats.pAtk, caster.ref.stats.mAtk)
    const base = from === 'atk' ? bend(atk, statMod(caster.statuses, 'atk')) * C.damageScale : to.ref.stats.maxHP
    return Math.max(1, Math.floor((base * pct) / 100))
  }

  /** Put (or refresh) a status: one per key — the stronger value and the longer clock win. */
  const putStatus = (u: MutUnit, key: StatusKey, sourceId: string, ticks: number, value: number, every = 0, nth = 0, pulses = 0): void => {
    const had = statusOf(u, key)
    if (had !== undefined) {
      had.left = Math.max(had.left, ticks)
      had.value = Math.max(had.value, value)
      had.sourceId = sourceId
      if (every > 0) had.every = every
      had.pulses = Math.max(had.pulses, pulses)
    } else {
      u.statuses.push({ key, left: ticks, value, every, nextPulse: every, pulses, sourceId })
    }
    emit({ kind: 'status', unitId: u.id, status: key, sourceId, ticks: ticks === UNTIL_ACTS ? 0 : ticks, value, ...(nth > 0 ? { nth } : {}) })
  }

  /** Restore HP to `u` (capped at max), announced as a heal from `sourceId`. */
  const restore = (u: MutUnit, amount: number, sourceId: string, regen = false): void => {
    if (!u.alive) return
    const heal = Math.min(Math.floor(amount * healMult(depth, u)), u.ref.stats.maxHP - u.currentHP)
    if (heal <= 0) return
    u.currentHP += heal
    emit({ kind: 'heal', unitId: u.id, amount: heal, hpAfter: u.currentHP, sourceId, ...(regen ? { status: 'regen' as const } : {}) })
  }

  /** A chance-based status's odds (percent) on `u`: allies always accept; a foe's statusRes
   *  shaves the chance. */
  const holdChance = (caster: MutUnit, u: MutUnit, chancePct: number | undefined): number => {
    const base = chancePct ?? 100
    if (u.side === caster.side) return 100
    const res = Math.max(0, u.ref.stats.statusRes)
    return res > 0 ? Math.floor((base * 100) / (100 + Math.floor((res * R.statusResWeight) / 100))) : base
  }

  /** Does a chance-based status take hold of `u`? The roll is drawn only when
   *  0 < chance < 100, so a battle without such a status keeps its exact draw order. */
  const takesHold = (caster: MutUnit, u: MutUnit, chancePct: number | undefined): boolean => {
    const pct = holdChance(caster, u, chancePct)
    if (pct <= 0) return false
    if (pct >= 100) return true
    const d = chance(rng, pct / 100)
    rng = d.rng
    rngDraws++
    return d.value
  }

  /** Apply one effect of `skill`, cast by `caster`, to `u`. */
  const applyEffect = (caster: MutUnit, skill: SkillEffect, e: ResolvedEffect, u: MutUnit, nth = 0): void => {
    if (!u.alive) return
    switch (e.kind) {
      case 'heal': {
        const amount = Math.floor((healAmount(caster, u, e.from, e.pct) * fatiguePct(u)) / 100)
        u.healsTaken++
        restore(u, Math.max(1, amount), caster.id)
        return
      }
      case 'regen': {
        const ticks = turnsToTicks(caster, e.turns)
        const per = Math.max(1, Math.floor((healAmount(caster, u, e.from, e.pct) * fatiguePct(u)) / 100))
        u.healsTaken++
        putStatus(u, 'regen', caster.id, ticks, per, Math.max(1, Math.floor(ticks / Math.max(1, e.turns))), nth, Math.max(1, e.turns))
        return
      }
      case 'shield': {
        const pool = Math.floor((healAmount(caster, u, e.from, e.pct) * Math.max(R.healFatigueFloorPct, 100 - wearinessPct())) / 100)
        putStatus(u, 'shield', caster.id, turnsToTicks(caster, e.turns), Math.max(1, pool), 0, nth)
        return
      }
      case 'buff':
        // A mission NPC never acts: a war cry passes it by.
        if (u.ref.isNpc) return
        putStatus(u, statKey(e.stat, true), caster.id, turnsToTicks(caster, e.turns), Math.min(R.maxStatPct, e.pct), 0, nth)
        return
      case 'debuff':
        if (!takesHold(caster, u, e.chance)) return
        putStatus(u, statKey(e.stat, false), caster.id, turnsToTicks(caster, e.turns), Math.min(R.maxStatPct, e.pct), 0, nth)
        return
      case 'dot': {
        // A foe immune to the blow's kind shrugs off its poison too.
        if (u.side !== caster.side && immuneTo(u.ref, skill)) return
        if (!takesHold(caster, u, e.chance)) return
        const ticks = turnsToTicks(caster, e.turns)
        const kind = e.dot === 'element' ? dotKindFor(skill.element ?? caster.ref.element) : e.dot
        putStatus(u, kind, caster.id, ticks, dotAmount(caster, u, e.from, e.pct), Math.max(1, Math.floor(ticks / Math.max(1, e.turns))), nth, Math.max(1, e.turns))
        return
      }
      case 'stun': {
        // Dazed already: no stun-lock.
        if (statusOf(u, 'stun') !== undefined) return
        if (!takesHold(caster, u, e.chance)) return
        const floor = -Math.floor((C.actionGaugeMax * R.stunFloorPm) / 1000)
        u.actionGauge = Math.max(floor, u.actionGauge - Math.floor((C.actionGaugeMax * e.push) / 100))
        putStatus(u, 'stun', caster.id, UNTIL_ACTS, e.push, 0, nth)
        // A daze breaks a wind-up: the move dies in its throat (lane G).
        if (u.charge !== null) {
          emit({ kind: 'telegraph-end', unitId: u.id, skillId: u.charge.skill.id, reason: 'stunned' })
          u.charge = null
        }
        return
      }
      case 'summon':
        summonReserve(caster, e.group, e.count)
        return
      case 'taunt':
        putStatus(u, 'taunt', caster.id, turnsToTicks(caster, e.turns), 0, 0, nth)
        return
      case 'sp': {
        const before = u.currentSP
        u.currentSP = Math.max(0, Math.min(u.ref.maxSP, u.currentSP + e.amount))
        const moved = u.currentSP - before
        if (moved !== 0) emit({ kind: 'sp', unitId: u.id, amount: moved, spAfter: u.currentSP, sourceId: caster.id })
        return
      }
    }
  }

  /**
   * The statuses' clock, once a tick before anyone acts (stable order by id): timed statuses
   * count down and wear off; a DoT or a regeneration pulses on its beat. A DoT's pulse is
   * soaked by a shield first and may kill (the mission is re-checked then). No RNG.
   */
  const tickStatuses = (): void => {
    let died = false
    const bearers = [...heroes, ...enemies].filter((u) => u.alive && u.statuses.length > 0).sort(byId)
    for (const u of bearers) {
      for (const st of [...u.statuses]) {
        if (!u.alive) break
        if (st.left === UNTIL_ACTS) continue
        st.left--
        if (st.every > 0 && st.pulses > 0 && --st.nextPulse <= 0) {
          st.nextPulse = st.every
          st.pulses--
          if (st.key === 'regen') restore(u, st.value, st.sourceId, true)
          else if (st.key === 'bleed' || st.key === 'poison' || st.key === 'burn') {
            const raw = capForPhase(u, st.value - absorb(u, st.value, st.sourceId))
            // A frenzy's own bleed (Berserk) wears its bearer down but never kills them: like an
            // HP-cost ultimate, a hero's own skill never takes their life — only a foe does.
            const amount = st.sourceId === u.id ? Math.min(raw, u.currentHP - 1) : raw
            if (amount > 0) {
              u.currentHP -= amount
              emit({ kind: 'dot', unitId: u.id, status: st.key, amount, hpAfter: u.currentHP, sourceId: st.sourceId })
              afterDamage(u)
              if (!u.alive) died = true
            }
          }
        }
        if (u.alive && st.left <= 0 && u.statuses.includes(st)) dropStatus(u, st, 'expired')
      }
    }
    if (died) {
      maybeAdvanceWave()
      watchShields()
      evaluateState()
    }
  }

  // ── Damage resolution against ONE target (pins crit→variance draw order) ──
  /**
   * `spread`: how many foes a sweep strikes at once (its falloff); 1 for a single blow.
   * `followUp`: a friend pressing an ally's attack — not the striker's own action, so it
   * neither uses nor spends their `opener`.
   */
  /**
   * `sharePct`: the share of the blow this target takes (a cleave's neighbour); 100 otherwise.
   * Returns the unit the blow struck (a close friend may have covered), or null when it
   * missed or an aegis turned it — the blow's riders (statuses) land only on a struck unit.
   */
  const resolveHit = (actor: MutUnit, skill: SkillEffect, target: MutUnit, spread = 1, followUp = false, sharePct = 100): MutUnit | null => {
    const aStats = actor.ref.stats
    const tStats = target.ref.stats
    const physical: boolean = skill.damageType === 'physical'
    // Buffs and debuffs bend attack and defence (exactly the snapshot when there are none).
    const atk = bend(physical ? aStats.pAtk : aStats.mAtk, statMod(actor.statuses, 'atk'))
    const def = bend(physical ? tStats.pDef : tStats.mDef, statMod(target.statuses, 'def'))
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
        return null
      }
    }

    // (1) crit roll (a crit buff adds points; the draw is the same one either way)
    const critMod = statMod(actor.statuses, 'crit')
    const critDraw = chance(rng, (critMod !== 0 ? aStats.critPct + critMod : aStats.critPct) / 100)
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
      } else if (kw.kind === 'bane' && familyOf(target.ref) === kw.family) {
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
      } else if (kw.kind === 'guard' && guardCovers(kw, ranged, el)) {
        guardMult *= 1 - kw.reduction
      }
    }
    // A guard status: up, the target takes less (a raised shield); down, more (a Mark).
    const guardStatus = statMod(target.statuses, 'guard')
    if (guardStatus !== 0) guardMult *= Math.max(0, 100 - guardStatus) / 100
    damage *= Math.max(MIN_GUARD_MULT, guardMult)
    // Formation, rivalry and the floor's conditions (all 1 in a plain battle).
    damage *= depthDamageMult(depth, actor, target, el, everyone())
    // AoE FALLOFF: a sweep spreads its force over every foe it strikes (the Master's mark
    // takes it at fuller force — lane G).
    if (spread > 1) {
      const share = 100 / (100 + C.aoeFalloffK * (spread - 1))
      damage *= actor.side === 'hero' && focusEnemyId === target.id ? Math.max(share, ORDERS.focusSweepFloorPct / 100) : share
    }
    // PROTECT answers a charged move: the protected take it softened (lane G).
    if (firing && overlooked.includes(target.id)) damage = (damage * (100 - ORDERS.protectChargeCutPct)) / 100
    // CLEAVE: the neighbour takes a share of the blow.
    if (sharePct !== 100) damage = (damage * sharePct) / 100
    const eff: HitEffect | undefined = immune ? 'immune' : affinity > 1 ? 'weak' : affinity < 1 ? 'resist' : undefined

    // AEGIS: a charge negates the whole hit (the draws above are already spent, so the
    // stream stays identical to an un-guarded replay).
    if (target.aegis > 0) {
      target.aegis--
      emit({ kind: 'guard', actorId: actor.id, targetId: target.id })
      return null
    }

    let amount = Math.round(damage)
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
    // SHIELD: an absorb pool soaks the blow first; a blow it swallows whole lands as no hit.
    const soaked = absorb(target, amount, actor.id)
    amount -= soaked
    if (soaked > 0 && amount === 0) return target
    // A boss never falls past a phase it has not reached (lane G).
    amount = capForPhase(target, amount)
    target.currentHP -= amount
    gainSpOnHit(target, amount)
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

    afterDamage(target)
    return target
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

  /** TAUNT: while a foe taunts, a single blow must go to a taunter (the Master's focus
   *  still wins: the order is explicit). */
  const tauntScreen = (cands: MutUnit[]): MutUnit[] => {
    const taunters = cands.filter((c) => statusOf(c, 'taunt') !== undefined)
    return taunters.length > 0 ? taunters : cands
  }

  /** The foe with the most HP left (ties: front-most) — a debuff goes on the boss. */
  const toughest = (cands: MutUnit[]): MutUnit =>
    cands.reduce((best, c) => (c.currentHP > best.currentHP || (c.currentHP === best.currentHP && c.spawnIndex < best.spawnIndex) ? c : best))

  /** Does this skill's point lie in what it leaves on the foe (a Mark, a curse)? */
  const marks = (skill: SkillEffect): boolean => skill.effects?.some((e) => e.kind === 'debuff' && (e.to ?? 'targets') === 'targets') === true

  /** The rule that picks a single blow's foe once focus is settled: taunts first, a Mark on
   *  the toughest, else the class rule. */
  const ruleFor = (actor: MutUnit, skill: SkillEffect, cands: MutUnit[]): MutUnit => {
    const pool = tauntScreen(cands)
    return marks(skill) ? toughest(pool) : classPick(actor, pool)
  }

  /** Where `skill` would land as a single blow, as the AI previews it (no rivalry roll). */
  const previewTarget = (actor: MutUnit, skill: SkillEffect, foes: MutUnit[]): MutUnit | null => {
    if (foes.length === 0) return null
    const cands = hurtable(foes, skill)
    return focusFor(actor, cands) ?? ruleFor(actor, skill, cands)
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
    return ruleFor(actor, skill, cands)
  }

  // ── Formation shapes and the caster's own side (lane F) ───────────────────
  /** Foes on the front-most line still standing (a spear's reach). */
  const frontRow = (foes: MutUnit[]): MutUnit[] => {
    for (const line of ['front', 'mid', 'back'] as const) {
      const row = foes.filter((f) => f.ref.line === line)
      if (row.length > 0) return row
    }
    return foes
  }
  /** The foe standing nearest `primary` (spawn order; ties to the front) — a cleave's second victim. */
  const neighbourOf = (primary: MutUnit, foes: MutUnit[]): MutUnit | null => {
    let best: MutUnit | null = null
    for (const f of foes) {
      if (f === primary) continue
      const d = Math.abs(f.spawnIndex - primary.spawnIndex)
      const bd = best === null ? Infinity : Math.abs(best.spawnIndex - primary.spawnIndex)
      if (d < bd || (d === bd && best !== null && f.spawnIndex < best.spawnIndex)) best = f
    }
    return best
  }
  /** Everyone alive on the caster's side (an escort included: it can be healed). */
  const alliesOf = (actor: MutUnit): MutUnit[] => (actor.side === 'hero' ? livingHeroSide() : livingEnemies())
  /** The caster's most wounded ally by share of max HP (ties: front-most). */
  const lowestAlly = (actor: MutUnit): MutUnit => {
    const pool = alliesOf(actor)
    return pool.reduce((best, c) => {
      const a = c.currentHP * best.ref.stats.maxHP
      const b = best.currentHP * c.ref.stats.maxHP
      return a < b || (a === b && c.spawnIndex < best.spawnIndex) ? c : best
    }, pool[0] ?? actor)
  }
  /** The blows the foes are lined up to deal each of `actor`'s friends next (unit id → HP). */
  const linedUpOn = (actor: MutUnit): Map<string, number> => {
    const all = everyone()
    const lined = new Map<string, number>()
    for (const f of targetableFoes(actor)) {
      if (f.ref.isNpc || (isLooming(f) && !awake.has(f.id))) continue
      const t = previewTarget(f, f.ref.skills[0] ?? BASIC_ATTACK, targetableFoes(f))
      if (t !== null) lined.set(t.id, (lined.get(t.id) ?? 0) + blowOf(f, t, all))
    }
    return lined
  }
  /** The friend the foes are lined up on (most blows coming; ties: the most wounded). */
  const threatenedAlly = (actor: MutUnit, lined: Map<string, number>): MutUnit => {
    const low = lowestAlly(actor)
    let best = low
    let most = lined.get(low.id) ?? 0
    for (const c of alliesOf(actor)) {
      const v = lined.get(c.id) ?? 0
      if (v > most) {
        best = c
        most = v
      }
    }
    return best
  }
  /** The allies a support skill tends. */
  const tendedBy = (actor: MutUnit, skill: SkillEffect, lined?: Map<string, number>): MutUnit[] =>
    skill.target === 'self'
      ? [actor]
      : skill.target === 'ally-lowest'
        ? [lowestAlly(actor)]
        : skill.target === 'ally-threatened'
          ? [threatenedAlly(actor, lined ?? linedUpOn(actor))]
          : alliesOf(actor)
  /** Who one of a skill's effects lands on. */
  const recipientsOf = (actor: MutUnit, skill: SkillEffect, e: ResolvedEffect, struck: readonly MutUnit[], tended: readonly MutUnit[]): readonly MutUnit[] => {
    switch (e.to ?? 'targets') {
      case 'self':
        return [actor]
      case 'allies':
        return alliesOf(actor)
      case 'ally-lowest':
        return [lowestAlly(actor)]
      case 'targets':
        return tendsAllies(skill) ? tended : struck
    }
  }

  // ── Skill selection: the most expected value (the "Quantum AI") ───────────
  // Castable = enough SP, and an HP cost leaves at least hpCostFloorPct of max HP.
  // Each castable skill is scored by the damage it can be expected to deal, summed over
  // the foes it would strike and capped at each foe's HP (overkill and immunity count;
  // a sweep's falloff counts), so a single-target skill wins on a lone boss and a sweep
  // wins on a crowd. Lane F adds what its effects are worth in the same coin (HP): a heal
  // the HP it restores to an ally who is low (overheal is waste), a shield the blows it
  // will soak on the most threatened ally, a taunt the damage it pulls off a squishier
  // friend, a buff the damage it adds over its turns (never one already up), a debuff the
  // damage it takes away — a Mark goes on the boss. Ties (both kill, or both do nothing)
  // never pay HP for nothing, then go to the bigger uncapped blow (a hero practises its
  // skills), then to the cheaper SP, then to list order. No RNG is drawn.
  const castable = (actor: MutUnit, s: SkillEffect): boolean =>
    (actor.cooldowns[s.id] ?? 0) <= 0 && canCast(actor.currentSP, actor.currentHP, actor.ref.stats.maxHP, s)
  /** Equal expected value (both kill, both do nothing): never pay HP for nothing; else
   *  the bigger blow — a hero practises the skill it knows (skills level by use) — else
   *  the cheaper one. */
  const tieGoesTo = (s: SkillEffect, raw: number, best: SkillEffect, bestRaw: number): boolean => {
    const hp = s.hpCost ?? 0
    const bestHp = best.hpCost ?? 0
    if (hp !== bestHp) return hp < bestHp
    if (raw !== bestRaw) return raw > bestRaw
    return s.spCost < best.spCost
  }
  /** Does the skill close wounds (a heal, a regeneration, a shield)? */
  const tendsWounds = (s: SkillEffect): boolean => s.effects?.some((e) => e.kind === 'heal' || e.kind === 'regen' || e.kind === 'shield') === true
  /** Does the skill bleed its own caster (Berserk's frenzy)? */
  const drainsSelf = (s: SkillEffect): boolean => s.effects?.some((e) => e.kind === 'dot' && e.to === 'self') === true

  /** A unit's plain blow at `target`, as the AI previews it. */
  const blowOf = (u: MutUnit, target: MutUnit, all: readonly MutUnit[]): number =>
    estimateBlow(u, u.ref.skills[0] ?? BASIC_ATTACK, target, 1, all)

  /** One decision's view of the field, memoised (the brain asks the same things many times). */
  interface Sight {
    all: readonly MutUnit[]
    /** Where `u`'s plain blow would land, and how hard (null: nothing to strike). */
    aim: (u: MutUnit) => { t: MutUnit; blow: number } | null
    /** `u`'s plain blow at `t`. */
    blow: (u: MutUnit, t: MutUnit) => number
    /** The blows the foes are lined up to deal `u` next. */
    incoming: (u: MutUnit) => number
    /** What the foes still have to give (unspawned waves too): an attack buff's ceiling. */
    foeHpLeft: number
  }
  const sightFor = (actor: MutUnit, foes: readonly MutUnit[]): Sight => {
    const all = everyone()
    const aims = new Map<MutUnit, { t: MutUnit; blow: number } | null>()
    const blows = new Map<number, number>()
    const blow = (u: MutUnit, t: MutUnit): number => {
      const key = u.spawnIndex * 65536 + t.spawnIndex
      let v = blows.get(key)
      if (v === undefined) {
        v = blowOf(u, t, all)
        blows.set(key, v)
      }
      return v
    }
    const aim = (u: MutUnit): { t: MutUnit; blow: number } | null => {
      if (aims.has(u)) return aims.get(u)!
      const t = previewTarget(u, u.ref.skills[0] ?? BASIC_ATTACK, targetableFoes(u))
      const a = t === null ? null : { t, blow: blow(u, t) }
      aims.set(u, a)
      return a
    }
    let lined: Map<string, number> | null = null
    const incoming = (u: MutUnit): number => {
      if (lined === null) {
        lined = new Map()
        for (const f of foes) {
          if (f.ref.isNpc || (isLooming(f) && !awake.has(f.id))) continue
          const a = aim(f)
          if (a !== null) lined.set(a.t.id, (lined.get(a.t.id) ?? 0) + a.blow)
        }
      }
      return lined.get(u.id) ?? 0
    }
    let foeHpLeft = 0
    for (const f of foes) foeHpLeft += Math.max(0, f.currentHP)
    for (let w = currentWave + 1; w < encounter.waves.length; w++) for (const u of encounter.waves[w]!.units) foeHpLeft += u.stats.maxHP
    return { all, aim, blow, incoming, foeHpLeft }
  }

  /**
   * What `actor`'s `skill`'s effects are worth, in HP (the coin damage is scored in).
   * `struck`: the foes its blow would hit; `tended`: the allies it would tend.
   * `incoming(u)`: the blows the foes are lined up to deal `u` next.
   */
  /** The foes a taunt by `r` would draw off a squishier friend: each one's blow at the
   *  taunter, the friend it spares, and how many of its turns the taunt covers (≤ 2). */
  const drawnBy = (r: MutUnit, ticks: number, sight: Sight): { blow: number; t: MutUnit; turns: number }[] => {
    const out: { blow: number; t: MutUnit; turns: number }[] = []
    for (const f of targetableFoes(r)) {
      if (isLooming(f) || f.ref.isNpc) continue
      const a = sight.aim(f)
      if (a === null || a.t === r || a.t.currentHP >= r.currentHP) continue
      out.push({ blow: sight.blow(f, r), t: a.t, turns: Math.min(turnsIn(f, ticks), 2) })
    }
    return out
  }

  const effectsValue = (actor: MutUnit, skill: SkillEffect, struck: readonly MutUnit[], tended: readonly MutUnit[], sight: Sight): number => {
    const { incoming, foeHpLeft, aim, blow } = sight
    let total = 0
    const w = (v: number, pm: number) => scale(Math.max(0, v), pm)
    for (const e of skill.effects ?? []) {
      const recips = recipientsOf(actor, skill, e, struck, tended).filter((u) => u.alive)
      switch (e.kind) {
        case 'heal':
        case 'regen': {
          const below = e.kind === 'heal' ? BRAIN.healBelowPct : BRAIN.regenBelowPct
          for (const r of recips) {
            const max = r.ref.stats.maxHP
            if (r.currentHP * 100 >= below * max) continue
            if (e.kind === 'regen' && (statusOf(r, 'regen')?.left ?? 0) * 2 > turnsToTicks(actor, e.turns)) continue
            const per = Math.floor((healAmount(actor, r, e.from, e.pct) * fatiguePct(r)) / 100)
            const amt = Math.min(e.kind === 'heal' ? per : per * Math.min(e.turns, BRAIN.maxTurnsCounted), max - r.currentHP)
            // A friend the next blows would fell: a heal now is worth double; a regeneration
            // (it pays out over turns) comes too late to count.
            const doomed = incoming(r) >= r.currentHP
            if (doomed && e.kind === 'regen') continue
            total += w(amt * (doomed ? BRAIN.lethalHealMult : 1), BRAIN.healWeightPm)
          }
          break
        }
        case 'shield':
          for (const r of recips) {
            const inc = incoming(r)
            if (inc <= 0) continue
            const pool = Math.floor((healAmount(actor, r, e.from, e.pct) * Math.max(R.healFatigueFloorPct, 100 - wearinessPct())) / 100)
            const soak = Math.min(pool, inc * Math.min(e.turns, BRAIN.maxTurnsCounted)) - (statusOf(r, 'shield')?.value ?? 0)
            total += w(soak, BRAIN.shieldWeightPm)
          }
          break
        case 'buff': {
          const ticks = turnsToTicks(actor, e.turns)
          let add = 0
          for (const r of recips) {
            if (r.ref.isNpc) continue
            // Never stack a buff that is already up (half its clock or more left).
            if ((statusOf(r, statKey(e.stat, true))?.left ?? 0) * 2 > ticks) continue
            const turns = turnsIn(r, ticks)
            if (e.stat === 'def' || e.stat === 'guard') {
              // A taunter braces for the blows its roar will draw, too.
              let drawn = 0
              if (r === actor && skill.effects?.some((x) => x.kind === 'taunt')) for (const d of drawnBy(r, ticks, sight)) drawn += d.blow
              add += Math.floor(((incoming(r) + drawn) * e.pct * turns) / (e.stat === 'def' ? 200 : 100))
              continue
            }
            const a = aim(r)
            if (a === null) continue
            const crit = e.stat === 'crit' ? permille(C.critMult) - 1000 : 1000
            add += scale(Math.floor((a.blow * e.pct * turns) / 100), crit)
          }
          // An attack buff can add at most its share of what the foes still have (a buff
          // pays before a big wave, not on the last goblin).
          if (e.stat === 'atk' || e.stat === 'crit' || e.stat === 'spd') add = Math.min(add, Math.floor((foeHpLeft * e.pct) / 100))
          total += w(add, BRAIN.buffWeightPm)
          break
        }
        case 'debuff': {
          const ticks = turnsToTicks(actor, e.turns)
          for (const r of recips) {
            if (r.side === actor.side) continue
            if ((statusOf(r, statKey(e.stat, false))?.left ?? 0) * 2 > ticks) continue
            const odds = holdChance(actor, r, e.chance)
            let v = 0
            if (e.stat === 'guard' || e.stat === 'def') {
              // A Mark: the party's blows on this foe land harder for a while.
              let party = 0
              for (const m of alliesOf(actor)) if (!m.ref.isNpc) party += blow(m, r) * turnsIn(m, ticks)
              v = Math.floor((Math.min(party, r.currentHP) * e.pct) / (e.stat === 'def' ? 200 : 100))
            } else {
              const a = aim(r)
              if (a !== null) v = Math.floor((a.blow * e.pct * turnsIn(r, ticks)) / 100)
            }
            total += w(Math.floor((v * odds) / 100), BRAIN.buffWeightPm)
          }
          break
        }
        case 'dot':
          for (const r of recips) {
            const pulses = Math.min(e.turns, BRAIN.maxTurnsCounted)
            if (r === actor || r.side === actor.side) {
              // Berserk's frenzy: the caster's own blood is a price.
              total -= w(dotAmount(actor, r, e.from, e.pct) * pulses, BRAIN.selfDrainWeightPm)
              continue
            }
            if (immuneTo(r.ref, skill)) continue
            const kind = e.dot === 'element' ? dotKindFor(skill.element ?? actor.ref.element) : e.dot
            if ((statusOf(r, kind)?.left ?? 0) * 2 > turnsToTicks(actor, e.turns)) continue
            const amt = Math.min(dotAmount(actor, r, e.from, e.pct) * pulses, Math.max(0, r.currentHP - blow(actor, r)))
            total += Math.floor((amt * holdChance(actor, r, e.chance)) / 100)
          }
          break
        case 'stun':
          for (const r of recips) {
            if (r.side === actor.side || statusOf(r, 'stun') !== undefined) continue
            const a = aim(r)
            // A daze breaks a wind-up (lane G): the whole move it would have landed.
            const cancel = r.charge !== null ? scale(chargeHarm(r), BOSS.cancelValuePm) : 0
            if (a === null && cancel === 0) continue
            const v = Math.floor(((a?.blow ?? 0) * e.push) / 100) + cancel
            total += w(Math.floor((v * holdChance(actor, r, e.chance)) / 100), BRAIN.buffWeightPm)
          }
          break
        case 'taunt':
          for (const r of recips) {
            if (r.side !== actor.side || overlooked.includes(r.id)) continue
            const ticks = turnsToTicks(actor, e.turns)
            if ((statusOf(r, 'taunt')?.left ?? 0) * 2 > ticks) continue
            // Taunt when a squishier friend is the one the foes are lined up on: a blow moved
            // off a friend with less life left is worth the share of life it spares them
            // (a blow on a 300-HP mage is worth far more to the party than on a 3000-HP knight).
            let pulled = 0
            for (const d of drawnBy(r, ticks, sight)) pulled += Math.floor((d.blow * (r.currentHP - d.t.currentHP)) / Math.max(1, r.currentHP)) * d.turns
            total += w(pulled, BRAIN.tauntWeightPm)
          }
          break
        case 'sp':
          for (const r of recips) {
            if (e.amount > 0) {
              if (r.side !== actor.side || r.ref.isNpc) continue
              const room = Math.min(e.amount, r.ref.maxSP - r.currentSP)
              const a = aim(r)
              if (room <= 0 || a === null) continue
              total += w(Math.floor((room * a.blow) / 100), BRAIN.spWeightPm)
            } else if (r.side !== actor.side && r.ref.skills.some((s) => s.spCost > 0)) {
              const a = aim(r)
              if (a === null) continue
              total += w(Math.floor((Math.min(-e.amount, r.currentSP) * a.blow) / 100), BRAIN.spWeightPm)
            }
          }
          break
        case 'summon': {
          // What the units it calls would strike over their first turns (never past a crowded field).
          const left = reserveLeft.get(e.group) ?? []
          const standing = alliesOf(actor).length
          const n = Math.min(e.count, left.length, BOSS.summonFieldCap - standing)
          const victim = targetableFoes(actor)[0]
          if (n <= 0 || victim === undefined) break
          for (let i = 0; i < n; i++) {
            const tmp = copyUnit(left[i]!, -1, actor.wave)
            total += estimateBlow(tmp, tmp.ref.skills[0] ?? BASIC_ATTACK, victim, 1, sight.all) * BOSS.summonTurns
          }
          break
        }
      }
    }
    return total
  }

  /** What a wound-up move by `u` is expected to land on the party (capped at each one's HP). */
  const chargeHarm = (u: MutUnit): number => {
    const c = u.charge
    if (c === null) return 0
    const all = everyone()
    const foes = targetableFoes(u)
    const hitList = c.skill.target === 'all-enemies' ? foes : c.skill.target === 'front-row' ? frontRow(foes) : c.targets.filter((x) => x.alive)
    let harm = 0
    for (const t of hitList) harm += Math.min(estimateBlow(u, c.skill, t, hitList.length > 1 && c.skill.target !== 'cleave' ? hitList.length : 1, all), Math.max(0, t.currentHP))
    return harm
  }

  /** A boss, as Hold reads it: an objective's target, a phased boss, or a foe with a charged move. */
  const isBoss = (u: MutUnit): boolean =>
    u.side === 'enemy' &&
    ((u.ref.targetTag !== undefined && (objectiveKind(u.ref.targetTag) === 'defeat' || objectiveKind(u.ref.targetTag) === 'acquire')) ||
      u.phases.length > 0 ||
      u.ref.skills.some((x) => x.charge !== undefined))

  /** Is the party bracing (the Master's Guard)? */
  const guarding = (): boolean => tick < guardUntil

  const chooseSkill = (actor: MutUnit): SkillEffect => {
    const own = actor.ref.skills
    const hero = actor.side === 'hero'
    const unleash = hero && unleashed.has(actor.id)
    // GUARD (lane G): a bracing hero holds its attacks — it may still tend a friend.
    const bracing = hero && !unleash && guarding()
    // One skill (every enemy's lone Strike or Spell): nothing to weigh.
    if (own.length <= 1 && !bracing) return own[0] !== undefined && castable(actor, own[0]) ? own[0] : BASIC_ATTACK
    const foes = targetableFoes(actor)
    const all = everyone()
    const spread = foes.length
    // What the brain sees of the field this decision (memoised; built on first need).
    let seen: Sight | null = null
    const sight = (): Sight => (seen ??= sightFor(actor, foes))
    const mine = actor.currentHP * 100
    // HOLD (lane G): SP is for a crowd or the boss (or a friend's wound).
    const holding = hero && holdSp && !unleash
    let best: SkillEffect | null = null
    let bestScore = -1
    let bestRaw = -1
    /** The chosen skill's own blow (before what its effects are worth). */
    let bestBlow = 0
    /** UNLEASH: the best skill that costs something (the big one), whatever a free swing scores. */
    let paid: SkillEffect | null = null
    let paidScore = -1
    for (const s of own) {
      if (!castable(actor, s)) continue
      if (bracing && !tendsAllies(s)) continue
      // A frenzy that bleeds its caster is never started when already low.
      if (drainsSelf(s) && mine < BRAIN.selfDrainFloorPct * actor.ref.stats.maxHP) continue
      let score = 0
      let raw = 0
      const struck: MutUnit[] = []
      const hit = (t: MutUnit, n: number, share = 100) => {
        let blow = estimateBlow(actor, s, t, n, all)
        if (share !== 100) blow = Math.floor((blow * share) / 100)
        raw += blow
        score += Math.min(blow, Math.max(0, t.currentHP))
        // A KILL also takes the foe's next blow off the board (lane F: so a healer weighs
        // binding a wound against ending the one who keeps opening it) — and a foe winding
        // up a big move takes that move with it (lane G).
        if (blow >= t.currentHP && t.currentHP > 0 && BRAIN.killWeightPm > 0 && !isLooming(t)) {
          const a = sight().aim(t)
          if (a !== null) score += scale(a.blow, BRAIN.killWeightPm)
          if (t.charge !== null) score += scale(chargeHarm(t), BOSS.cancelValuePm)
        }
        struck.push(t)
      }
      let tended: MutUnit[] = []
      if (tendsAllies(s)) {
        tended = tendedBy(actor, s, s.target === 'ally-threatened' ? linedUpOn(actor) : undefined)
      } else if (s.target === 'all-enemies') {
        for (const f of foes) hit(f, spread)
      } else if (s.target === 'front-row') {
        const row = frontRow(foes)
        for (const f of row) hit(f, row.length)
      } else {
        const t = previewTarget(actor, s, foes)
        if (t !== null) {
          hit(t, 1)
          if (s.target === 'cleave') {
            const nb = neighbourOf(t, hurtable(foes, s))
            if (nb !== null) hit(nb, 1, R.cleavePct)
          }
        }
      }
      if (holding && s.spCost > 0 && strikes(s) && !tendsWounds(s)) {
        const sweep = s.target === 'all-enemies' || s.target === 'front-row'
        if (!(sweep && struck.length >= ORDERS.holdSweepTargets) && !struck.some(isBoss)) continue
      }
      const blowScore = score
      if (s.effects !== undefined) score = Math.max(0, score + effectsValue(actor, s, struck, tended, sight()))
      if (bracing && score <= 0) continue
      if (score > bestScore || (score === bestScore && best !== null && tieGoesTo(s, raw, best, bestRaw))) {
        best = s
        bestScore = score
        bestRaw = raw
        bestBlow = blowScore
      }
      if (unleash && (s.spCost > 0 || (s.hpCost ?? 0) > 0) && score > paidScore) {
        paid = s
        paidScore = score
      }
    }
    if (bracing) return best ?? BRACE
    if (unleash && paid !== null && paidScore > 0) return paid
    // SAVING UP: when nothing the hero can afford hurts the foes but a blow it knows would
    // (a mage's burst against the physical-immune Wardens), it keeps its SP for that blow
    // and swings for free meanwhile — only in place of a blow that does nothing (a taunt, a
    // buff or a ward it chose is never swallowed), and never in place of a heal.
    if (best !== null && strikes(best) && best.spCost > 0 && bestBlow === 0 && R.spPerAction > 0 && !tendsWounds(best)) {
      const later = own.some(
        (s) => strikes(s) && s.spCost > actor.currentSP && s.spCost <= actor.ref.maxSP && foes.some((f) => !immuneTo(f.ref, s)),
      )
      if (later) return own[0] !== undefined && own[0].spCost === 0 && castable(actor, own[0]) ? own[0] : BASIC_ATTACK
    }
    // Synthesized basic attack (spCost 0) so skills may be empty.
    return best ?? BASIC_ATTACK
  }

  // Authored-skill casts per hero, for the post-combat auto-learn fold.
  const skillCasts: Record<string, Record<string, number>> = {}
  /** Pay a skill's costs and tally the cast. */
  const payAndTally = (actor: MutUnit, skill: SkillEffect): void => {
    actor.currentSP -= skill.spCost
    if (skill.cooldown !== undefined && skill.cooldown > 0) actor.cooldowns[skill.id] = skill.cooldown
    if (skill.hpCost !== undefined && skill.hpCost > 0) {
      actor.currentHP -= skill.hpCost
      emit({ kind: 'hp-cost', unitId: actor.id, amount: skill.hpCost, hpAfter: actor.currentHP })
    }
    const sid = actor.ref.sourceHeroId
    if (sid !== undefined && skill.id !== 'basic' && skill.id !== BASIC_ATTACK.id && skill.id !== BRACE_ID) {
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
  /** Everything `u` could still strike with: its blows the SP pool can pay for (SP comes
   *  back each action), the basic attack it falls back on, and the strike it presses a
   *  friend's attack with. */
  const strikesOf = (u: MutUnit): SkillEffect[] => {
    // SP comes back (lane F's rhythm), so any blow the pool can ever pay for still counts.
    const open = u.ref.skills.filter((s) => strikes(s) && (R.spPerAction > 0 ? s.spCost <= u.ref.maxSP : castable(u, s)))
    return [...(open.length > 0 ? open : [BASIC_ATTACK]), followUpSkill(u.ref, BASIC_ATTACK)]
  }
  /**
   * FUTILITY: nothing the party still holds can hurt any foe it has to beat — a squad of
   * blades against a lone, physical-immune Fragment Warden. It can only get worse (a foe
   * falls only to a blow or a DoT the immunity also turns), so the party falls back at once instead of
   * swinging IMMUNE until it dies or the clock runs out. Only the party's own heroes count
   * (a mission NPC never strikes), and a phased foe the party could hurt is out of reach
   * while a wavemate it cannot hurt still shields it. The foe the beat names is the
   * front-most one standing.
   */
  const futileFoe = (): MutUnit | null => {
    if (winsWithoutBlows) return null
    const foes = livingEnemies().filter((e) => !isLooming(e))
    if (foes.length === 0) return null
    // Fast path: a foe in reach with no immunity at all can be hurt by anything.
    if (foes.some((f) => !f.ref.keywords.some((k) => k.kind === 'immune') && isTargetable(f))) return null
    const blows = heroes.filter((h) => h.alive && !h.ref.isNpc).flatMap(strikesOf)
    const hurtableFoe = (f: MutUnit): boolean => blows.some((s) => !immuneTo(f.ref, s))
    /** The living, non-phased wavemates whose presence keeps a phased foe untargetable. */
    const shieldsOf = (f: MutUnit): MutUnit[] => foes.filter((o) => o.wave === f.wave && o.id !== f.id && !isPhased(o))
    const reachable = (f: MutUnit): boolean => hurtableFoe(f) && (isTargetable(f) || shieldsOf(f).every(hurtableFoe))
    if (foes.some(reachable)) return null
    return frontMost(foes)
  }

  // STALEMATE (lane F): heals, shields and regeneration can hold a line forever. When the
  // party's own actions stop wearing the foes down (their HP on the field shows no new low)
  // for long enough, the party falls back with the futility beat instead of trading blows
  // with an enemy it cannot finish until the clock runs out.
  /** The lowest the foes' HP on the field has stood since the last wave came. */
  let foeHpLow = Number.MAX_SAFE_INTEGER
  /** Party actions since that low. */
  let stallActs = 0
  const foeHpOnField = (): number => {
    let v = 0
    for (const e of enemies) if (e.alive && !isLooming(e)) v += Math.max(0, e.currentHP)
    return v
  }
  /** The field's foes' max HP (a meaningful step of progress is a share of it). */
  const foeMaxOnField = (): number => {
    let v = 0
    for (const e of enemies) if (e.alive && !isLooming(e)) v += e.ref.stats.maxHP
    return v
  }
  const watchProgress = (actor: MutUnit): void => {
    if (actor.side !== 'hero' || actor.ref.isNpc) return
    const now = foeHpOnField()
    // Progress is a real step down (a sliver of a heal-soaked boss is not).
    const step = Math.floor((foeMaxOnField() * R.stallStepPct) / 100)
    if (foeHpLow === Number.MAX_SAFE_INTEGER || now <= foeHpLow - step || now === 0) {
      foeHpLow = now
      stallActs = 0
    } else stallActs++
  }
  /** The foe the stalemate beat names (the front-most standing), or null while the fight moves. */
  const stalemateFoe = (): MutUnit | null => {
    // A fight with its own clock ends at it anyway — and in a damage race (a raid, the guild
    // boss, a tournament round) every chip until then is the score: the guard stands aside.
    if (winsWithoutBlows || timer !== null || stallActs < Math.max(R.stallMinActs, R.stallActsPerHero * livingHeroes().length)) return null
    const standing = livingEnemies().filter((e) => !isLooming(e))
    return standing.length > 0 ? frontMost(standing) : null
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
    const untouchable = futileFoe() ?? stalemateFoe()
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
        // A fresh wave is fresh ground: the stalemate watch starts over.
        foeHpLow = Number.MAX_SAFE_INTEGER
        stallActs = 0
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

  /** Where a blow lands: its targets, the sweep's spread and a cleave's shares. Null: nothing to strike. */
  interface BlowAim {
    targets: MutUnit[]
    spread: number
    shares: number[] | null
  }
  const aimBlow = (actor: MutUnit, skill: SkillEffect, aimAt?: MutUnit): BlowAim | null => {
    let targets: MutUnit[]
    let shares: number[] | null = null
    let spread = 1
    if (skill.target === 'all-enemies' || skill.target === 'front-row') {
      // No single pick here: a rival's chase from an earlier pick must not be announced.
      chasing = null
      const foes = targetableFoes(actor).slice().sort((a, b) => a.spawnIndex - b.spawnIndex)
      targets = skill.target === 'front-row' ? frontRow(foes) : foes
      spread = targets.length
    } else {
      const primary = aimAt !== undefined && aimAt.alive && isTargetable(aimAt) ? aimAt : pickSingleTarget(actor, skill)
      targets = primary === null ? [] : [primary]
      if (primary !== null && skill.target === 'cleave') {
        const nb = neighbourOf(primary, hurtable(targetableFoes(actor), skill))
        if (nb !== null) {
          targets.push(nb)
          shares = [100, R.cleavePct]
        }
      }
    }
    return targets.length === 0 ? null : { targets, spread, shares }
  }

  /** The blow lands (every hit rolls on its own), then its riders, then a friend may press it. */
  const strike = (actor: MutUnit, skill: SkillEffect, aim: BlowAim): void => {
    const { targets, spread, shares } = aim
    const struck: MutUnit[] = []
    if (strikes(skill)) {
      // MULTI-HIT: each hit rolls and lands on its own (a flurry is three blows).
      const hits = Math.max(1, skill.hits ?? 1)
      for (let h = 0; h < hits; h++) {
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i]!
          if (!t.alive) continue
          const got = resolveHit(actor, skill, t, spread, false, shares?.[i] ?? 100)
          if (got !== null && !struck.includes(got)) struck.push(got)
        }
        if (!actor.alive) break
      }
    } else {
      struck.push(...targets)
    }
    // The blow's riders (a bleed, a Mark, a daze) and any self-effects — unless the blow
    // ended the fight (no frenzy after the last foe falls).
    const over = actor.side === 'hero' ? livingEnemies().length === 0 && !moreWavesToSpawn() : livingHeroSide().length === 0
    if (!over) for (const e of skill.effects ?? []) recipientsOf(actor, skill, e, struck, []).forEach((u, i) => applyEffect(actor, skill, e, u, i))
    // A friend presses the attack on the first target still standing.
    const standing = targets.find((t) => t.alive)
    if (standing !== undefined) followUp(actor, standing)
  }

  /** GUARD (lane G): every living unit on the party's side braces — less damage — and the
   *  heroes hold their attacks until the big blows now wound up have landed (at least one of
   *  an average hero's turns). */
  const raiseGuard = (): void => {
    const party = livingHeroSide()
    if (party.length === 0) return
    let spd = 0
    for (const h of party) spd += Math.max(1, speedOf(h))
    const mean = Math.max(1, Math.floor(spd / party.length))
    let until = tick + Math.max(R.minStatusTicks, Math.ceil((ORDERS.guardMinTurns * C.actionGaugeMax) / mean))
    for (const e of enemies) if (e.alive && e.charge !== null) until = Math.max(until, e.charge.firesAt + 1)
    guardUntil = Math.max(guardUntil, until)
    party.forEach((u, i) => putStatus(u, 'guard-up', u.id, guardUntil - tick, ORDERS.guardPct, 0, i))
  }

  /** The wind-up: costs paid, the move telegraphed, the caster's gauge stopped until it fires. */
  const windUp = (actor: MutUnit, skill: SkillEffect, targets: MutUnit[]): void => {
    const ticks = turnsToTicks(actor, Math.max(1, skill.charge!.turns))
    actor.charge = { skill, firesAt: tick + ticks, targets }
    payAndTally(actor, skill)
    emit({ kind: 'telegraph', unitId: actor.id, skillId: skill.id, firesAtTick: tick + ticks, targets: targets.map((t) => t.id) })
    // A standing Guard braces the party the moment a foe winds up.
    if (guardArmed && actor.side === 'enemy') {
      guardArmed = false
      raiseGuard()
    }
  }

  /** A wound-up move fires on its tick (not a turn of its own: the wind-up was). */
  const fireCharge = (u: MutUnit): void => {
    const c = u.charge
    u.charge = null
    if (c === null || !u.alive || outcome !== null) return
    const aim = aimBlow(u, c.skill, c.targets[0])
    if (aim === null) return
    const answered = aim.targets.some((t) => (guarding() && t.side !== u.side && statusOf(t, 'guard-up') !== undefined))
      ? ('guard' as const)
      : aim.targets.some((t) => overlooked.includes(t.id))
        ? ('protect' as const)
        : undefined
    emit({ kind: 'act', actorId: u.id, skillId: c.skill.id, targetId: aim.targets[0]!.id, spAfter: u.currentSP, charged: true, ...(answered ? { answered } : {}) })
    firing = true
    strike(u, c.skill, aim)
    firing = false
    maybeAdvanceWave()
    watchShields()
    evaluateState()
  }

  // One unit takes its action.
  const act = (actor: MutUnit): void => {
    if (!actor.alive || outcome !== null) return
    // Mission NPCs (escort targets) never act — they only need protecting.
    if (actor.ref.isNpc) return
    // A dazed unit comes to as its turn comes round (the stun cost it the wait).
    const dazed = statusOf(actor, 'stun')
    if (dazed !== undefined) dropStatus(actor, dazed, 'acted')
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
          // An Unleash order is spent on a frozen turn too.
          unleashed.delete(actor.id)
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
    // The Master's Unleash is spent on this turn, whatever it cast.
    unleashed.delete(actor.id)

    if (tendsAllies(skill)) {
      // A support skill: it tends the caster's own side (and may still bend the foes).
      const tended = tendedBy(actor, skill)
      if (tended.length === 0) return
      // The caster casts where it stands: the 'act' names the caster itself, and the heals and
      // statuses that follow name whom it tends (a healer never runs at a friend).
      emit({ kind: 'act', actorId: actor.id, skillId: skill.id, targetId: actor.id, spAfter: actor.currentSP - skill.spCost })
      payAndTally(actor, skill)
      for (const e of skill.effects ?? []) recipientsOf(actor, skill, e, [], tended).forEach((u, i) => applyEffect(actor, skill, e, u, i))
    } else {
      // A blow: one foe, every foe, the front line, or a foe and its neighbour.
      const aim = aimBlow(actor, skill)
      if (aim === null) return // no valid target → action fizzles, SP retained
      if (skill.charge !== undefined) {
        // A CHARGED MOVE (lane G): the turn goes into the wind-up; it fires on its own tick.
        windUp(actor, skill, aim.targets)
      } else {
        if (chasing !== null && aim.spread === 1) emit({ kind: 'rivalry', unitId: actor.id, rivalId: chasing, targetId: aim.targets[0]!.id })
        // 'act' names the first target as a representative of a sweep.
        emit({ kind: 'act', actorId: actor.id, skillId: skill.id, targetId: aim.targets[0]!.id, spAfter: actor.currentSP - skill.spCost })
        payAndTally(actor, skill)
        strike(actor, skill, aim)
      }
    }

    actor.actions++
    // Its skills come off cooldown one action at a time (lane G).
    for (const id of Object.keys(actor.cooldowns)) if (actor.cooldowns[id]! > 0) actor.cooldowns[id]!--
    watchProgress(actor)
    // SP RHYTHM: every action feeds the pool a little (skills come back).
    if (actor.alive && R.spPerAction > 0) actor.currentSP = Math.min(actor.ref.maxSP, actor.currentSP + R.spPerAction)

    // Deaths from this action may clear the wave / break a shield / satisfy the mission.
    maybeAdvanceWave()
    watchShields()
    evaluateState()
  }

  /** The Master's order lands (at the start of its tick, before anyone acts). */
  const applyOrder = (o: BattleOrder): void => {
    switch (o.kind) {
      case 'retreat':
        outcome = 'retreat'
        return
      case 'focus':
        focusEnemyId = o.enemyId
        return
      case 'protect':
        if (!overlooked.includes(o.allyId)) overlooked = [...overlooked, o.allyId]
        return
      case 'unleash': {
        // UNLEASH: the hero's gauge fills at once; it casts its best skill this tick.
        const h = heroes.find((x) => x.id === o.allyId && x.alive && !x.ref.isNpc)
        if (h === undefined) return
        h.actionGauge = Math.max(h.actionGauge, C.actionGaugeMax)
        unleashed.add(h.id)
        return
      }
      case 'guard':
        if (o.onTelegraph) guardArmed = true
        else raiseGuard()
        return
      case 'hold':
        holdSp = true
        return
      case 'swap': {
        // SWAP: two heroes trade places — their lines and their order in the line.
        const a = heroes.find((x) => x.id === o.a && !x.ref.isNpc)
        const b = heroes.find((x) => x.id === o.b && !x.ref.isNpc)
        if (a === undefined || b === undefined || a === b) return
        const lineA = a.ref.line
        a.ref = { ...a.ref, line: b.ref.line }
        b.ref = { ...b.ref, line: lineA }
        const idx = a.spawnIndex
        a.spawnIndex = b.spawnIndex
        b.spawnIndex = idx
        return
      }
    }
  }

  // ── ATB main loop ─────────────────────────────────────────────────────────
  const orders = [...(encounter.orders ?? [])].sort((a, b) => a.tick - b.tick)
  let nextOrder = 0
  for (tick = 1; tick <= C.maxTicks; tick++) {
    // The Master's orders land at the start of their tick (before anyone acts).
    while (nextOrder < orders.length && orders[nextOrder]!.tick <= tick) {
      const o = orders[nextOrder++]!
      emit({ kind: 'order', order: o })
      applyOrder(o)
    }
    if (outcome !== null) break

    // Wound-up moves fire on their tick, before anyone acts (lane G).
    for (const u of [...heroes, ...enemies].filter((x) => x.alive && x.charge !== null && x.charge.firesAt <= tick).sort(byId)) {
      fireCharge(u)
      if (outcome !== null) break
    }
    if (outcome !== null) break

    // The mission's clock: countdown milestones, and whatever wakes on this tick.
    watchCountdown()
    watchLooming()

    // The statuses' clock: buffs wear off, DoTs and regeneration pulse (lane F).
    tickStatuses()
    if (outcome !== null) break

    // Fill action gauges for every living unit (stable order by id).
    // (A unit winding up a move waits: its gauge stands still until the move fires.)
    const all = [...heroes, ...enemies].filter((u) => u.alive && u.charge === null).sort(byId)
    for (const u of all) {
      u.actionGauge += speedOf(u)
    }

    // Everyone whose gauge >= actionGaugeMax acts this tick. Process highest
    // gauge first, ties by id; subtract actionGaugeMax (carry overflow).
    while (outcome === null) {
      const ready = [...heroes, ...enemies].filter((u) => u.alive && u.charge === null && u.actionGauge >= C.actionGaugeMax)
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

/** A bracing hero's turn (the Master's Guard, lane G): no blow, no cost, nobody tended but itself. */
const BRACE: SkillEffect = {
  id: BRACE_ID,
  name: 'Brace',
  skillMult: 0,
  damageType: 'physical',
  element: null,
  target: 'self',
  spCost: 0,
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
