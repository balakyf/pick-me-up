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
} from '../types'
import { TUNING, ELEMENT_ADVANTAGE } from '../tuning'
import { createRng, makeSeed, nextFloat, chance, type Rng } from '../rng'
import { panicChance } from '../kitchen'

const C = TUNING.combat

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
      ...(u.isNpc ? { isNpc: true } : {}),
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

  let wavesCleared = 0
  const defeatedTargetTags: string[] = []
  // Reach(distance): steps the party has covered (every hero action is one step).
  const hasReach = encounter.mission.objectives.some((o) => o.kind === 'reach')
  let reachProgress = 0
  let outcome: CombatOutcome | null = null

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
  const moreWavesToSpawn = (): boolean => currentWave < encounter.waves.length - 1

  /** A unit with a 'phased' keyword is untargetable while any non-phased unit in
   *  its wave is still alive. (Heroes have no phased keyword, so this is a no-op
   *  for hero targets.) */
  const isTargetable = (e: MutUnit): boolean => {
    const phased = e.ref.keywords.some((k) => k.kind === 'phased')
    if (!phased) return true
    const wavemates = enemies.filter((o) => o.alive && o.wave === e.wave && o.id !== e.id)
    const anyNonPhasedAlive = wavemates.some((o) => !isLooming(o) && !o.ref.keywords.some((k) => k.kind === 'phased'))
    return !anyNonPhasedAlive
  }

  /** Living, targetable units on the side OPPOSITE the actor. */
  const targetableFoes = (actor: MutUnit): MutUnit[] => {
    const foes = actor.side === 'hero' ? livingEnemies() : livingHeroSide()
    return foes.filter(isTargetable)
  }

  // ── Damage resolution against ONE target (pins crit→variance draw order) ──
  const resolveHit = (actor: MutUnit, skill: SkillEffect, target: MutUnit): void => {
    const aStats = actor.ref.stats
    const tStats = target.ref.stats
    const physical: boolean = skill.damageType === 'physical'
    const atk = physical ? aStats.pAtk : aStats.mAtk
    const def = physical ? tStats.pDef : tStats.mDef
    const el: Element = skill.element ?? actor.ref.element

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

    let damage = atk * skill.skillMult * eMult * critMult * mitig * variance

    // TACTICAL CENTER focus: a hero concentrating fire on the marked enemy deals
    // a level-scaled damage bonus (the strength rides on the Encounter; no RNG).
    if (
      actor.side === 'hero' &&
      encounter.focusBonus !== undefined &&
      encounter.focus?.focusEnemyId === target.id
    ) {
      damage *= 1 + encounter.focusBonus
    }

    // Actor keywords: ENRAGE past its timer, FRENZY while low, OPENER on the first
    // action, BANE against a family. None draws RNG.
    for (const kw of actor.ref.keywords) {
      if (kw.kind === 'enrage' && tick >= kw.afterTick) {
        damage *= kw.multiplier
      } else if (kw.kind === 'frenzy' && actor.currentHP * 100 < actor.ref.stats.maxHP * kw.belowHpPct) {
        damage *= kw.multiplier
      } else if (kw.kind === 'opener' && actor.actions === 0) {
        damage *= kw.multiplier
      } else if (kw.kind === 'bane' && target.ref.family === kw.family) {
        damage *= kw.multiplier
      }
    }

    // Target keywords: IMMUNE to a damage type, VULNERABLE to an element, GUARD
    // reductions (floored so stacked guards never reach immunity).
    let guardMult = 1
    const ranged = actor.ref.unitClass === 'archer' || actor.ref.unitClass === 'mage'
    for (const kw of target.ref.keywords) {
      if (kw.kind === 'immune' && kw.damageType === skill.damageType) {
        damage = 0
      } else if (kw.kind === 'resist' && kw.damageType === skill.damageType) {
        guardMult *= 1 - kw.reduction
      } else if (kw.kind === 'vulnerable' && kw.element === el) {
        damage *= C.vulnerableMult
      } else if (kw.kind === 'guard' && (kw.vs === undefined || (kw.vs === 'ranged' ? ranged : kw.vs === el))) {
        guardMult *= 1 - kw.reduction
      }
    }
    damage *= Math.max(MIN_GUARD_MULT, guardMult)

    // AEGIS: a charge negates the whole hit (the draws above are already spent, so the
    // stream stays identical to an un-guarded replay).
    if (target.aegis > 0) {
      target.aegis--
      emit({ kind: 'guard', actorId: actor.id, targetId: target.id })
      return
    }

    const amount = Math.round(damage)
    target.currentHP -= amount
    emit({
      kind: 'hit',
      actorId: actor.id,
      targetId: target.id,
      amount,
      crit,
      hpAfter: target.currentHP,
    })

    // LIFESTEAL: the actor recovers a share of what it dealt (capped at max HP).
    if (actor.alive && amount > 0) {
      for (const kw of actor.ref.keywords) {
        if (kw.kind !== 'lifesteal') continue
        const heal = Math.min(Math.round(amount * kw.fraction), actor.ref.stats.maxHP - actor.currentHP)
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
      }
    }
  }

  // ── Target selection by actor class (+ focus) ─────────────────────────────
  const frontMost = (cands: MutUnit[]): MutUnit =>
    cands.reduce((best, c) => (c.spawnIndex < best.spawnIndex ? c : best))

  const pickSingleTarget = (actor: MutUnit): MutUnit | null => {
    let cands = targetableFoes(actor)
    if (cands.length === 0) return null

    // FOCUS: hero attackers force-prioritize a living, targetable focus enemy (a Wary,
    // defiant hero ignores the Master and picks its own target).
    if (actor.side === 'hero' && actor.ref.defiant !== true) {
      const focusId = encounter.focus?.focusEnemyId
      if (focusId !== undefined) {
        const focused = cands.find((e) => e.id === focusId)
        if (focused) return focused
      }
    }

    // Heroes don't chase a looming unit while anything else can be hit.
    if (actor.side === 'hero') {
      const lesser = cands.filter((c) => !isLooming(c))
      if (lesser.length > 0) cands = lesser
    }

    // OVERLOOK (Tactical Center): enemy targeting is steered off marked allies while
    // any non-overlooked ally lives (deterministic; no RNG). Falls back to the full
    // pool if every candidate is overlooked.
    if (actor.side === 'enemy') {
      const overlooked = encounter.focus?.overlookedAllyIds
      if (overlooked !== undefined && overlooked.length > 0) {
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

  // ── Skill selection (Layer 1 §2): the strongest castable skill ─────────────
  // Castable = enough SP AND strictly more HP than the skill's HP cost (an HP-cost
  // ultimate never kills its own caster — it gates itself off instead). "Strongest"
  // = leveled skillMult, times the number of foes it would hit for an all-enemies
  // skill (so an AoE isn't dominated by a single-target basic attack). Ties keep
  // array order. The basic attack (mult 1, free) is the floor.
  const castable = (actor: MutUnit, s: SkillEffect): boolean =>
    s.spCost <= actor.currentSP && (s.hpCost === undefined || actor.currentHP > s.hpCost)
  const chooseSkill = (actor: MutUnit): SkillEffect => {
    let best: SkillEffect | null = null
    let bestScore = -Infinity
    for (const s of actor.ref.skills) {
      if (!castable(actor, s)) continue
      const reach = s.target === 'all-enemies' ? Math.max(1, targetableFoes(actor).length) : 1
      const score = s.skillMult * reach
      if (score > bestScore) {
        best = s
        bestScore = score
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
        return tick >= obj.ticks && livingHeroes().length > 0
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
    encounter.mission.objectives.some((o) => o.kind === 'protect' && !allyAlive(o.targetTag))
  const missionWon = (): boolean =>
    encounter.mission.objectives.length > 0 && encounter.mission.objectives.every(objectiveMet)

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
      outcome = 'win'
    }
  }

  /** After the current wave is fully dead, advance/spawn the next wave. */
  const maybeAdvanceWave = (): void => {
    if (outcome !== null) return
    // A looming unit is outlasted, not killed: the wave counts as cleared without it.
    if (livingEnemiesInWave(currentWave).filter((e) => !isLooming(e)).length === 0) {
      wavesCleared++
      if (moreWavesToSpawn()) {
        currentWave++
        const spawned = spawnWave(currentWave)
        emit({ kind: 'wave-spawn', wave: currentWave, enemyIds: spawned.map((e) => e.id) })
      }
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
      if (wake !== undefined && wake.kind === 'enrage' && tick < wake.afterTick) return
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
        resolveHit(actor, skill, t)
      }
    } else {
      const target = pickSingleTarget(actor)
      if (target === null) return // no valid target → action fizzles, SP retained
      emit({ kind: 'act', actorId: actor.id, skillId: skill.id, targetId: target.id })
      payAndTally(actor, skill)
      resolveHit(actor, skill, target)
    }

    actor.actions++

    // Deaths from this action may clear the wave / satisfy the mission.
    maybeAdvanceWave()
    evaluateState()
  }

  // ── ATB main loop ─────────────────────────────────────────────────────────
  const timer = encounter.mission.timer
  for (tick = 1; tick <= C.maxTicks; tick++) {
    // Fill action gauges for every living unit (stable order by id).
    const all = [...heroes, ...enemies].filter((u) => u.alive).sort(byId)
    for (const u of all) {
      u.actionGauge += u.ref.stats.spd
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

  const log: CombatLog = {
    seed,
    floor: encounter.floor,
    encounterContext: 'tower',
    unitsInit,
    events,
    outcome,
    rngDraws,
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
