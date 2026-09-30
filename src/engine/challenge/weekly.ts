/**
 * The weekly Crack of Time trial. Every world-week the Crack replays a gauntlet of
 * escalating waves under one fixed rule ("3★ and below", "two heroes", "enemies ×1.5 HP"…),
 * the same for every Master that week.
 *
 * - It happens in a SIMULATION: the Crack fields pristine copies of the heroes (full
 *   Sanity), and nothing that happens there touches the real roster — no permadeath, no
 *   Sanity loss, no XP.
 * - Score = waves cleared. Three attempts a week; the personal best is kept in
 *   state.challenge.weekly. Each week's score thresholds pay gems/materials the first time
 *   they are reached.
 * - Wave w is a filler squad from floor 1 + floorStep × w, drawn from the week's own stream
 *   (rngFor(hash('weekly', week), 'wave', w)).
 *
 * PURE and DETERMINISTIC.
 */
import type { CombatLog, CombatUnit, Element, GameState, HeroId, MaterialId, OwnedHero } from '../types'
import { TUNING } from '../tuning'
import { SKILLS } from '../content'
import { buildCombatUnit } from '../unit'
import { runBattle } from '../combat'
import { buildFillerEncounter } from '../tower'
import { rngFor, hash, makeSeed } from '../rng/rng'
import { CHALLENGE } from './tuning'
import { bindPages, challengeOf, distinct, lineFor } from './challenge'
import { applyPartyBonuses } from './bonds'
import { worldWeekOf } from './raid'

const W = CHALLENGE.weekly

export type WeeklyRuleId = 'lowStar' | 'element' | 'duo' | 'tough' | 'noMages'

export interface WeeklyRule {
  id: WeeklyRuleId
  /** Heroes allowed (duo = 2). */
  maxHeroes: number
  /** 'lowStar': heroes of this star or below. */
  maxStar?: number
  /** 'element': only heroes of this element. */
  element?: Element
  /** Enemy HP multiplier. */
  enemyHpMult: number
}

const RULE_CYCLE: readonly WeeklyRuleId[] = ['lowStar', 'element', 'duo', 'tough', 'noMages']

/** The rule of a world-week (the same for everyone; the element rotates too). */
export function weeklyRule(week: number): WeeklyRule {
  const n = RULE_CYCLE.length
  const id = RULE_CYCLE[((week % n) + n) % n]!
  const size = TUNING.account.partySize
  switch (id) {
    case 'lowStar':
      return { id, maxHeroes: size, maxStar: 3, enemyHpMult: 1 }
    case 'element': {
      const els = W.elements
      const i = Math.floor(week / n)
      return { id, maxHeroes: size, element: els[((i % els.length) + els.length) % els.length]!, enemyHpMult: 1 }
    }
    case 'duo':
      return { id, maxHeroes: 2, enemyHpMult: 1 }
    case 'tough':
      return { id, maxHeroes: size, enemyHpMult: W.toughHpMult }
    case 'noMages':
      return { id, maxHeroes: size, enemyHpMult: 1 }
  }
}

/** Does a hero meet the week's rule? */
export function heroAllowed(rule: WeeklyRule, h: OwnedHero): boolean {
  if (rule.maxStar !== undefined && h.star > rule.maxStar) return false
  if (rule.element !== undefined && h.element !== rule.element) return false
  if (rule.id === 'noMages' && h.heroClass === 'mage') return false
  return true
}

/** The trial's state for the week of `nowWorld` (a new week starts fresh). */
export function weeklyFor(state: GameState, nowWorld: number): { week: number; attempts: number; best: number; claimed: number } {
  const w = challengeOf(state).weekly
  const week = worldWeekOf(nowWorld)
  return w.week === week ? { ...w } : { week, attempts: 0, best: 0, claimed: 0 }
}

export function weeklyAttemptsLeft(state: GameState, nowWorld: number): number {
  return Math.max(0, W.attempts - weeklyFor(state, nowWorld).attempts)
}

export function weeklyUnlocked(state: GameState): boolean {
  return state.tower.highestCleared >= W.unlockFloor
}

/** Can this hero enter the Crack's simulation at all (alive, home, free)? */
export function canEnterTrial(h: OwnedHero | undefined): h is OwnedHero {
  return !!h && h.alive && h.expedition === null && !h.captiveOf
}

/** Why this team can't run the trial now, or null. */
export function weeklyRefusal(state: GameState, heroIds: readonly HeroId[], nowWorld: number): string | null {
  if (!weeklyUnlocked(state)) return `The trial opens once F${W.unlockFloor} is cleared.`
  if (weeklyAttemptsLeft(state, nowWorld) <= 0) return 'No attempts left this week.'
  const rule = weeklyRule(worldWeekOf(nowWorld))
  if (heroIds.length === 0) return 'Pick at least one hero.'
  if (heroIds.length > rule.maxHeroes) return `This week allows ${rule.maxHeroes} heroes.`
  if (distinct(heroIds).length !== heroIds.length) return 'A hero can only enter once.'
  for (const id of heroIds) {
    const h = state.heroes[id]
    if (!canEnterTrial(h)) return 'Everyone must be alive and at home.'
    if (!heroAllowed(rule, h)) return "Someone doesn't meet this week's rule."
  }
  return null
}

/** The week's gauntlet (fixed for every Master that week, scaled by the world grade). */
export function weeklyWaves(state: GameState, week: number): CombatUnit[][] {
  const rule = weeklyRule(week)
  const worldMult = TUNING.tower.worldMult[state.worldGrade]
  const seed = makeSeed(hash('weekly', week))
  const waves: CombatUnit[][] = []
  for (let w = 0; w < W.waves; w++) {
    const floor = Math.min(TUNING.tower.sliceTopFloor, 1 + W.floorStep * w)
    const built = buildFillerEncounter(floor, worldMult, rngFor(seed, 'wave', w))
    waves.push(
      built.waves[0]!.units.map((u, i) => {
        const maxHP = Math.round(u.stats.maxHP * rule.enemyHpMult)
        return { ...u, id: `wk${w}_${i}`, targetTag: undefined, stats: { ...u.stats, maxHP }, currentHP: maxHP }
      }),
    )
  }
  return waves
}

export interface WeeklyOutcome {
  week: number
  rule: WeeklyRule
  score: number
  best: number
  newBest: boolean
  gems: number
  materials: Record<MaterialId, number>
  /** Thresholds newly reached this attempt (waves). */
  reached: number[]
  log: CombatLog
}

/**
 * One attempt at this week's trial. The real roster is untouched (the simulation fields
 * copies at full Sanity); only the weekly record, gems and materials change. PURE.
 */
export function runWeeklyTrial(state: GameState, heroIds: readonly HeroId[], nowWorld: number): { state: GameState; outcome: WeeklyOutcome } {
  const refusal = weeklyRefusal(state, heroIds, nowWorld)
  if (refusal !== null) throw new Error(`weeklyTrial: ${refusal}`)
  const cur = weeklyFor(state, nowWorld)
  const rule = weeklyRule(cur.week)
  const units = applyPartyBonuses(
    heroIds.map((id) => {
      const copy: OwnedHero = { ...state.heroes[id]!, sanity: TUNING.lobby.sanityMax }
      return buildCombatUnit(copy, lineFor(copy), SKILLS, state.inventory)
    }),
    state,
    { blessing: false },
  )
  const res = runBattle(
    units,
    {
      floor: 15,
      mission: { type: 'Trial', objectives: [{ kind: 'annihilate' }], timer: null },
      waves: weeklyWaves(state, cur.week).map((u) => ({ units: u })),
      encounterContext: 'tower',
      label: 'weekly',
    },
    hash(state.seed, 'weekly', cur.week, cur.attempts),
  )
  const score = res.wavesCleared
  const reached: number[] = []
  let gems = 0
  const materials: Record<MaterialId, number> = {}
  let claimed = cur.claimed
  while (claimed < W.thresholds.length && score >= W.thresholds[claimed]!.waves) {
    const th = W.thresholds[claimed]!
    reached.push(th.waves)
    gems += th.gems
    for (const [k, n] of Object.entries(th.materials)) materials[k] = (materials[k] ?? 0) + n
    claimed++
  }
  const pooled = { ...state.materials }
  for (const [k, n] of Object.entries(materials)) pooled[k] = (pooled[k] ?? 0) + n
  const nextMaterials = bindPages(pooled, CHALLENGE.raids.pagesPerBook).materials
  const best = Math.max(cur.best, score)
  const ch = challengeOf(state)
  return {
    state: {
      ...state,
      gems: state.gems + gems,
      materials: nextMaterials,
      challenge: { ...ch, weekly: { week: cur.week, attempts: cur.attempts + 1, best, claimed } },
    },
    outcome: { week: cur.week, rule, score, best, newBest: score > cur.best, gems, materials, reached, log: res.log },
  }
}
