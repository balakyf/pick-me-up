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
}

function copyUnit(u: CombatUnit, spawnIndex: number, wave: number): MutUnit {
  return {
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
    })
  }
  for (const h of heroUnits) snapshot(h)
  for (const w of encounter.waves) for (const e of w.units) snapshot(e)

  // ── Spawn heroes (wave -1) + wave 0 ───────────────────────────────────────
  let spawnCounter = 0
  const heroes: MutUnit[] = heroUnits.map((u) => copyUnit(u, spawnCounter++, -1))
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
  let outcome: CombatOutcome | null = null

  // ── Helpers over the live rosters ─────────────────────────────────────────
  const livingHeroes = (): MutUnit[] => heroes.filter((h) => h.alive)
  const livingEnemiesInWave = (w: number): MutUnit[] => enemies.filter((e) => e.alive && e.wave === w)
  const livingEnemies = (): MutUnit[] => enemies.filter((e) => e.alive)
  const moreWavesToSpawn = (): boolean => currentWave < encounter.waves.length - 1

  /** A unit with a 'phased' keyword is untargetable while any non-phased unit in
   *  its wave is still alive. (Heroes have no phased keyword, so this is a no-op
   *  for hero targets.) */
  const isTargetable = (e: MutUnit): boolean => {
    const phased = e.ref.keywords.some((k) => k.kind === 'phased')
    if (!phased) return true
    const wavemates = enemies.filter((o) => o.alive && o.wave === e.wave && o.id !== e.id)
    const anyNonPhasedAlive = wavemates.some((o) => !o.ref.keywords.some((k) => k.kind === 'phased'))
    return !anyNonPhasedAlive
  }

  /** Living, targetable units on the side OPPOSITE the actor. */
  const targetableFoes = (actor: MutUnit): MutUnit[] => {
    const foes = actor.side === 'hero' ? livingEnemies() : livingHeroes()
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

    // ENRAGE: actor stat-spike past its timer.
    for (const kw of actor.ref.keywords) {
      if (kw.kind === 'enrage' && tick >= kw.afterTick) {
        damage *= kw.multiplier
      }
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
    const cands = targetableFoes(actor)
    if (cands.length === 0) return null

    // FOCUS: hero attackers force-prioritize a living, targetable focus enemy.
    if (actor.side === 'hero') {
      const focusId = encounter.focus?.focusEnemyId
      if (focusId !== undefined) {
        const focused = cands.find((e) => e.id === focusId)
        if (focused) return focused
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

  // ── Skill selection: first skill affordable; basic attack always available ─
  const chooseSkill = (actor: MutUnit): SkillEffect => {
    for (const s of actor.ref.skills) {
      if (s.spCost <= actor.currentSP) return s
    }
    // Synthesized basic attack (spCost 0) so skills may be empty.
    return BASIC_ATTACK
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
    }
  }
  const missionWon = (): boolean =>
    encounter.mission.objectives.length > 0 && encounter.mission.objectives.every(objectiveMet)

  const evaluateState = (): void => {
    if (outcome !== null) return
    if (livingHeroes().length === 0) {
      outcome = 'wipe'
      return
    }
    if (missionWon()) {
      outcome = 'win'
    }
  }

  /** After the current wave is fully dead, advance/spawn the next wave. */
  const maybeAdvanceWave = (): void => {
    if (outcome !== null) return
    if (livingEnemiesInWave(currentWave).length === 0) {
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

    // PANIC (low Sanity): a hero below the panic threshold may lose its turn. The
    // draw is GATED on a positive chance, so a healthy hero never touches the rng —
    // existing full-Sanity replays keep their exact draw order. The action gauge was
    // already spent by the caller, so a panic naturally costs the whole turn; SP is
    // retained since no skill is chosen.
    if (actor.side === 'hero' && actor.ref.sanity !== undefined) {
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

    const skill = chooseSkill(actor)

    if (skill.target === 'all-enemies') {
      const targets = targetableFoes(actor).slice().sort((a, b) => a.spawnIndex - b.spawnIndex)
      if (targets.length === 0) return // no valid target → action fizzles, SP retained
      actor.currentSP -= skill.spCost
      // 'act' event uses the first target as a representative.
      emit({ kind: 'act', actorId: actor.id, skillId: skill.id, targetId: targets[0]!.id })
      for (const t of targets) {
        if (!t.alive) continue
        resolveHit(actor, skill, t)
      }
    } else {
      const target = pickSingleTarget(actor)
      if (target === null) return // no valid target → action fizzles, SP retained
      actor.currentSP -= skill.spCost
      emit({ kind: 'act', actorId: actor.id, skillId: skill.id, targetId: target.id })
      resolveHit(actor, skill, target)
    }

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
    survivorHeroIds,
    fallenHeroIds,
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
