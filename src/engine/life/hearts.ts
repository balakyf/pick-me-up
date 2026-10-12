/**
 * Quanton Life — hearts: the Master's hand in the lobby's inner life (lore §4).
 *
 * - CONSOLE_HERO: talk a traumatized hero round. Once per hero per world-day; the chance
 *   is a base plus their favor, so a hero who trusts the Master listens. A burnt-out hero
 *   can instead be offered a staff role as an instructor — the Roderick path — which
 *   always lands when a seat is free, and makes them a veteran who teaches harder.
 * - TRYOUT: a hero outside the party duels a party member for their seat with real
 *   weapons (canon: Edith vs Usher). Nobody dies; the loser's pride does, and a rivalry
 *   starts. One duel per hero per world-day.
 * PURE and deterministic (seeded by the hero and day, or the duel counter).
 */
import { TUNING } from '../tuning'
import { floatStream, hash } from '../rng'
import { SKILLS } from '../content'
import { buildCombatUnit } from '../unit'
import { runBattle } from '../combat'
import { withFavor } from '../favor'
import type { CombatLog, CombatUnit, GameState, HeroId, OwnedHero } from '../types'
import { addMemory, dayOfSlot, lifeOf, relationKey, slotOf } from './life'
import { jobHolders, jobOpen, jobSeats } from './jobs'

const TR = TUNING.life.trauma
const TY = TUNING.life.tryout

function today(state: GameState, nowWorld: number): number {
  return dayOfSlot(slotOf(Math.max(nowWorld, state.meta.lastSeenAtWorld)))
}

function chronicled(state: GameState, e: GameState['life']['chronicle'][number]): GameState['life']['chronicle'] {
  return [...state.life.chronicle, e].slice(-TUNING.life.chronicleMax)
}

/** Why the Master cannot talk to this hero right now, or null. */
export function consoleRefusal(state: GameState, heroId: HeroId, nowWorld: number, offer?: 'instructor'): string | null {
  const hero = state.heroes[heroId]
  if (!hero || !hero.alive) return 'no such living hero'
  const t = lifeOf(hero).trauma
  if (!t) return 'they are not troubled'
  if (offer === 'instructor') {
    if (t.kind !== 'burnout') return 'only the burnt-out are offered a staff role'
    if (!jobOpen(state, 'instructor')) return 'the Training Center is not built'
    const seated = jobHolders(state, 'instructor').filter((h) => h.id !== heroId).length
    if (seated >= jobSeats(state, 'instructor')) return 'every instructor seat is taken'
    return null
  }
  if (t.consoledDay === today(state, nowWorld)) return 'you already talked today'
  return null
}

/** The chance the Master's talk brings this hero back. */
export function consoleChance(hero: OwnedHero): number {
  return Math.min(0.95, TR.consoleBase + hero.favor / 100)
}

/** CONSOLE_HERO. Throws when refused. */
export function consoleHero(state: GameState, heroId: HeroId, nowWorld: number, offer?: 'instructor'): GameState {
  const refusal = consoleRefusal(state, heroId, nowWorld, offer)
  if (refusal) throw new Error(`consoleHero: ${refusal}`)
  const hero = state.heroes[heroId]!
  const src = lifeOf(hero)
  const life = { ...src, memories: [...src.memories], trauma: src.trauma ? { ...src.trauma } : null }
  const day = today(state, nowWorld)
  const at = Math.max(nowWorld, state.meta.lastSeenAtWorld)
  if (offer === 'instructor') {
    life.trauma = null
    life.veteran = true
    life.job = 'instructor'
    life.doing = { ...life.doing, untilSlot: 0 }
    addMemory(life, { kind: 'turnedInstructor', day, weight: 80 })
    return {
      ...state,
      heroes: { ...state.heroes, [heroId]: { ...hero, life } },
      life: { ...state.life, chronicle: chronicled(state, { at, kind: 'recovered', heroIds: [heroId], detail: 'instructor' }) },
    }
  }
  const won = floatStream(state.seed, 'console', heroId, day)() < consoleChance(hero)
  if (won) {
    life.trauma = null
    addMemory(life, { kind: 'recovered', day, detail: 'master', weight: 65 })
    return {
      ...state,
      heroes: { ...state.heroes, [heroId]: withFavor({ ...hero, life }, hero.favor + TR.consoleFavor) },
      life: { ...state.life, chronicle: chronicled(state, { at, kind: 'recovered', heroIds: [heroId], detail: 'master' }) },
    }
  }
  // Not today — but they noticed the Master came.
  life.trauma = { ...life.trauma!, consoledDay: day }
  return { ...state, heroes: { ...state.heroes, [heroId]: withFavor({ ...hero, life }, hero.favor + TR.consoleFavor) } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tryouts
// ─────────────────────────────────────────────────────────────────────────────

function canDuel(h: OwnedHero | undefined): h is OwnedHero {
  return !!h && h.alive && h.sanity > 0 && h.training === null && h.promotion === null && !h.expedition && !h.captiveOf && !h.life?.trauma
}

/** Why this tryout cannot happen, or null. */
export function tryoutRefusal(state: GameState, challengerId: HeroId, holderId: HeroId, nowWorld: number): string | null {
  if (challengerId === holderId) return 'a hero cannot duel themself'
  const c = state.heroes[challengerId]
  const h = state.heroes[holderId]
  if (!canDuel(c) || !canDuel(h)) return 'both heroes must be home, rested and willing'
  if (state.party.slots.includes(challengerId)) return 'the challenger already holds a seat'
  if (!state.party.slots.includes(holderId)) return 'that hero holds no party seat'
  const day = today(state, nowWorld)
  if (state.life.duels.byHero[challengerId] === day || state.life.duels.byHero[holderId] === day) return 'one duel a day'
  return null
}

export interface TryoutResult {
  winnerId: HeroId
  loserId: HeroId
  /** The challenger won the seat. */
  seatTaken: boolean
  log: CombatLog
}

/** TRYOUT: the duel, the seat, the bruised pride. Throws when refused. */
export function tryout(state: GameState, challengerId: HeroId, holderId: HeroId, nowWorld: number): { state: GameState; result: TryoutResult } {
  const refusal = tryoutRefusal(state, challengerId, holderId, nowWorld)
  if (refusal) throw new Error(`tryout: ${refusal}`)
  const c = state.heroes[challengerId]!
  const h = state.heroes[holderId]!
  const seatIdx = state.party.slots.indexOf(holderId)
  const cu = buildCombatUnit(c, 'front', SKILLS, state.inventory)
  const hu = buildCombatUnit(h, 'front', SKILLS, state.inventory)
  const foe: CombatUnit = { ...hu, id: `duel_${h.id}`, side: 'enemy', sourceHeroId: undefined }
  const res = runBattle(
    [cu],
    {
      floor: 0,
      mission: { type: 'Tournament', objectives: [{ kind: 'annihilate' }], timer: null },
      waves: [{ units: [foe] }],
      encounterContext: 'tower',
      label: 'tryout',
    },
    hash(state.seed, 'tryout', state.life.duels.count),
  )
  const seatTaken = res.outcome === 'win'
  const winner = seatTaken ? c : h
  const loser = seatTaken ? h : c
  const day = today(state, nowWorld)
  const at = Math.max(nowWorld, state.meta.lastSeenAtWorld)

  const lifeCopy = (x: OwnedHero) => {
    const l = lifeOf(x)
    return { ...l, memories: [...l.memories] }
  }
  const wl = lifeCopy(winner)
  const ll = lifeCopy(loser)
  addMemory(wl, { kind: 'wonTryout', day, other: loser.id, weight: 45 })
  addMemory(ll, { kind: 'lostTryout', day, other: winner.id, weight: 50 })
  const key = relationKey(c.id, h.id)
  const rel = state.life.relations[key] ?? { affinity: 0, shared: 0 }
  const slots = [...state.party.slots]
  if (seatTaken) slots[seatIdx] = challengerId
  const loserSanity = Math.max(0, Math.round((loser.sanity - TY.loserSanity) * 100) / 100)

  const next: GameState = {
    ...state,
    party: { ...state.party, slots },
    heroes: {
      ...state.heroes,
      [winner.id]: { ...winner, life: wl },
      [loser.id]: { ...loser, life: ll, sanity: loserSanity },
    },
    life: {
      ...state.life,
      relations: { ...state.life.relations, [key]: { ...rel, affinity: Math.max(-100, rel.affinity - TY.rivalry) } },
      chronicle: chronicled(state, { at, kind: 'tryout', heroIds: [winner.id, loser.id], detail: seatTaken ? 'seat' : 'held' }),
      duels: { count: state.life.duels.count + 1, byHero: { ...state.life.duels.byHero, [c.id]: day, [h.id]: day } },
    },
  }
  return { state: next, result: { winnerId: winner.id, loserId: loser.id, seatTaken, log: res.log } }
}
