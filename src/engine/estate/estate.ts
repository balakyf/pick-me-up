/**
 * The estate (schema v11): what the Master spends gold on once the buildings stand —
 * statues for the fallen, decorations that lift the heroes' days, the bounty board,
 * tryout duels and paid drill refocus — plus the trauma and favoritism the waiting room
 * carries (spec 2026-09-30-estate-and-life).
 *
 * Entry points: the commands (buyDecor, raiseStatue, postBounty, refocusDrill, hostDuel,
 * talkToHero), `resolveEstate` (run by advanceTime: bounties come home, trauma moves on)
 * and `estateReact` (run by the reducer after a command: floors fought, friends lost,
 * gifts given). PURE.
 */
import type { Command, EstateState, FallenRecord, FloorResult, GameState, HeroId, ChronicleEntry } from '../types'
import { TUNING } from '../tuning'
import { withFavor } from '../favor'
import { addMasterXp } from '../master'
import { drillCost, trainingMode, trainingRefusal } from '../training'
import { addMemory, dayOfSlot, lifeOf, relationKey, slotOf } from '../life/life'
import { DECOR, DECOR_CURVE, DECOR_MAX_LEVEL, FAVORITISM, REFOCUS, STATUE, TRAUMA } from './constants'
import { resolveBounties } from './bounty'
import { TraumaBook, afterFloor, afterLoss, comfort, giftMeaningBonus, markAttention, stepTrauma } from './trauma'
import { worldDay } from './weather'

const R = TUNING.life.relation

export function defaultEstate(): EstateState {
  return {
    statues: [],
    decor: {},
    bounties: [],
    bountyLog: [],
    bountySeq: 1,
    trauma: {},
    attention: [],
    jealous: {},
    duels: { day: -1, today: 0, total: 0, last: null },
    clock: 0,
  }
}

/** The estate slice with every field present (an early v11 save only had statues + decor). */
export function estateOf(state: GameState): EstateState {
  return { ...defaultEstate(), ...(state.estate ?? {}) }
}

/** A state whose estate slice is complete. */
export function withEstate(state: GameState): GameState {
  const e = state.estate
  if (e && 'clock' in e && 'duels' in e && 'bounties' in e && 'trauma' in e && 'attention' in e && 'jealous' in e && 'bountyLog' in e) return state
  return { ...state, estate: estateOf(state) }
}

function chron(state: GameState, entries: ChronicleEntry[]): GameState['life'] {
  if (entries.length === 0) return state.life
  return { ...state.life, chronicle: [...state.life.chronicle, ...entries].slice(-TUNING.life.chronicleMax) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Decorations
// ─────────────────────────────────────────────────────────────────────────────

export function decorLevel(state: GameState, id: string): number {
  return state.estate?.decor?.[id] ?? 0
}

/** Gold for the next level of a decoration (null at the top). */
export function decorCost(id: string, level: number): number | null {
  const def = DECOR[id]
  if (!def || level >= DECOR_MAX_LEVEL) return null
  return Math.round(def.base * DECOR_CURVE[level]!)
}

export function decorRefusal(state: GameState, id: string): string | null {
  const def = DECOR[id]
  if (!def) return 'No such decoration.'
  const level = decorLevel(state, id)
  const cost = decorCost(id, level)
  if (cost === null) return 'Already at its finest.'
  if (def.facility && state.facilities[def.facility].level === 0) return 'Build the place first.'
  if (state.gold < cost) return 'Not enough gold.'
  return null
}

/** Raise a decoration one level. Throws when refused. */
export function buyDecor(state: GameState, id: string): GameState {
  const refusal = decorRefusal(state, id)
  if (refusal) throw new Error(`buyDecor: ${refusal}`)
  const e = state.estate
  const level = decorLevel(state, id)
  return { ...state, gold: state.gold - decorCost(id, level)!, estate: { ...e, decor: { ...e.decor, [id]: level + 1 } } }
}

/** Every decoration with its level, next cost and whether it can be bought now. */
export function decorOptions(state: GameState, place?: string) {
  return Object.values(DECOR)
    .filter((d) => !place || d.place === place)
    .map((d) => {
      const level = decorLevel(state, d.id)
      return { def: d, level, cost: decorCost(d.id, level), refusal: decorRefusal(state, d.id) }
    })
}

/** Gold still to spend to max every decoration. */
export function decorGoldLeft(state: GameState): number {
  let n = 0
  for (const d of Object.values(DECOR)) for (let l = decorLevel(state, d.id); l < DECOR_MAX_LEVEL; l++) n += decorCost(d.id, l)!
  return n
}

// ─────────────────────────────────────────────────────────────────────────────
// Statues
// ─────────────────────────────────────────────────────────────────────────────

export function statueCost(rec: Pick<FallenRecord, 'star' | 'level'>): number {
  return STATUE.base + STATUE.perStar2 * rec.star * rec.star + STATUE.perLevel * rec.level
}

export function hasStatue(state: GameState, heroId: HeroId): boolean {
  return (state.estate?.statues ?? []).includes(heroId)
}

export function statueRefusal(state: GameState, heroId: HeroId): string | null {
  const rec = state.life.memorial.find((r) => r.heroId === heroId)
  if (!rec) return 'Only the fallen are honoured with a statue.'
  if (hasStatue(state, heroId)) return 'That hero already has a statue.'
  if ((state.estate?.statues ?? []).length >= STATUE.max) return 'Every plinth in the Memorial is taken.'
  if (state.gold < statueCost(rec)) return 'Not enough gold.'
  return null
}

/**
 * Raise a statue for a fallen hero: those who mourn them remember it, and anyone who
 * withdrew over that death is comforted enough to come back. Throws when refused.
 */
export function raiseStatue(state: GameState, heroId: HeroId, nowWorld: number): GameState {
  const refusal = statueRefusal(state, heroId)
  if (refusal) throw new Error(`raiseStatue: ${refusal}`)
  const rec = state.life.memorial.find((r) => r.heroId === heroId)!
  const at = Math.max(nowWorld, state.meta.lastSeenAtWorld)
  const day = dayOfSlot(slotOf(at))
  const chronicle: ChronicleEntry[] = [{ at, kind: 'statue', heroIds: [heroId] }]
  const heroes = { ...state.heroes }
  for (const h of Object.values(state.heroes)) {
    if (!h.alive || !h.life?.memories.some((m) => m.kind === 'friendDied' && m.other === heroId)) continue
    const life = { ...lifeOf(h), memories: [...lifeOf(h).memories] }
    addMemory(life, { kind: 'statue', day, other: heroId, weight: 45 })
    heroes[h.id] = { ...h, life }
  }
  const book = new TraumaBook(state.estate.trauma)
  for (const [id, t] of Object.entries(book.map) as [HeroId, NonNullable<(typeof book.map)[HeroId]>][]) {
    if (t.withdrawn?.cause === heroId) comfort(book, id, TRAUMA.recoverAt, at, chronicle)
  }
  const e = state.estate
  return {
    ...state,
    gold: state.gold - statueCost(rec),
    heroes,
    // Honouring the fallen is part of the Master's craft too (B21).
    meta: addMasterXp(state.meta, TUNING.lobby.master.xpPerStatue),
    life: chron(state, chronicle),
    estate: { ...e, statues: [...e.statues, heroId], trauma: book.changed ? book.map : e.trauma },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Paid drill refocus (Training Center)
// ─────────────────────────────────────────────────────────────────────────────

export function refocusCost(skillId: string, mode: 'refine' | 'learn'): number {
  return REFOCUS.flat + Math.round(REFOCUS.share * drillCost(skillId, mode))
}

/** Why this drill can't be redirected to `skillId`, or null. */
export function refocusRefusal(state: GameState, heroId: HeroId, skillId: string): string | null {
  const hero = state.heroes[heroId]
  if (!hero || !hero.alive) return 'That hero has fallen.'
  if (!hero.training) return 'That hero is not drilling.'
  if (hero.training.skillId === skillId) return 'The drill is already on that skill.'
  // Would a fresh drill on that skill be allowed (ignoring the running one and the price)?
  const free = { ...state, gold: Number.MAX_SAFE_INTEGER, heroes: { ...state.heroes, [heroId]: { ...hero, training: null } } }
  const r = trainingRefusal(free, heroId, skillId)
  if (r) return r
  const mode = trainingMode(hero, skillId)!
  if (state.gold < refocusCost(skillId, mode)) return 'Not enough gold.'
  return null
}

/** Redirect a running drill to another skill; the timer keeps running. Throws when refused. */
export function refocusDrill(state: GameState, heroId: HeroId, skillId: string): GameState {
  const refusal = refocusRefusal(state, heroId, skillId)
  if (refusal) throw new Error(`refocusDrill: ${refusal}`)
  const hero = state.heroes[heroId]!
  const mode = trainingMode(hero, skillId)!
  return {
    ...state,
    gold: state.gold - refocusCost(skillId, mode),
    heroes: { ...state.heroes, [heroId]: { ...hero, training: { ...hero.training!, skillId, mode } } },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Talking (attention + comfort)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Master talked to a hero. The first talk of a world-day counts as attention, and
 * comforts a withdrawn hero. Returns the same state when it changes nothing.
 */
export function talkToHero(state: GameState, heroId: HeroId, nowWorld: number): GameState {
  const hero = state.heroes[heroId]
  if (!hero || !hero.alive) return state
  const at = Math.max(nowWorld, state.meta.lastSeenAtWorld)
  const day = worldDay(at)
  const e = state.estate
  const already = (e.attention ?? []).some((m) => m.heroId === heroId && m.day === day && m.weight === FAVORITISM.talk)
  const t = e.trauma?.[heroId]
  const comforts = t?.withdrawn && t.withdrawn.lastTalkDay !== day
  if (already && !comforts) return state
  const chronicle: ChronicleEntry[] = []
  const book = new TraumaBook(e.trauma)
  let heroes = state.heroes
  if (comforts) {
    const back = comfort(book, heroId, TRAUMA.talkComfort, at, chronicle, day)
    if (back) {
      const life = { ...lifeOf(hero), memories: [...lifeOf(hero).memories] }
      addMemory(life, { kind: 'comforted', day, weight: 40 })
      heroes = { ...heroes, [heroId]: { ...hero, life } }
    }
  }
  return {
    ...state,
    heroes,
    life: chron(state, chronicle),
    estate: { ...e, trauma: book.changed ? book.map : e.trauma, attention: already ? e.attention : markAttention(e.attention ?? [], heroId, day, FAVORITISM.talk) },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The clock and the reactions
// ─────────────────────────────────────────────────────────────────────────────

/** Run by advanceTime: bounties come home, trauma moves on. */
export function resolveEstate(state: GameState, nowWorld: number): GameState {
  const s = withEstate(state)
  return stepTrauma(resolveBounties(s, nowWorld), nowWorld)
}

/**
 * Run by the reducer after every command (like lifeReact): a floor fought tires the
 * party and marks the Master's attention; a death may turn a close friend inward; a gift
 * is attention, comfort, and — if it has come to mean something — more.
 */
export function estateReact(before: GameState | null, after: GameState, cmd: Command, nowWorld: number, floor?: FloorResult): GameState {
  if (before === null || cmd.type === 'NEW_ACCOUNT') return after
  const at = Math.max(nowWorld, after.meta.lastSeenAtWorld)
  const day = worldDay(at)
  let state = withEstate(after)
  const e = state.estate
  const book = new TraumaBook(e.trauma)
  const chronicle: ChronicleEntry[] = []
  let attention = e.attention
  let heroes = state.heroes

  // A floor fought: fatigue (and burnout), and the party had the Master's eye.
  if (floor && cmd.type === 'ATTEMPT_FLOOR') {
    const fought = [...floor.result.survivorHeroIds]
    for (const id of fought) {
      afterFloor(state, book, id, before.tower.attemptIndex, at, chronicle)
      attention = markAttention(attention, id, day, FAVORITISM.deploy)
    }
    for (const id of fought) {
      if (book.map[id]?.burnoutUntil && !(e.trauma[id]?.burnoutUntil && e.trauma[id]!.burnoutUntil! > at)) {
        const h = heroes[id]!
        const life = { ...lifeOf(h), memories: [...lifeOf(h).memories] }
        addMemory(life, { kind: 'burnout', day, weight: 50 })
        if (heroes === state.heroes) heroes = { ...heroes }
        heroes[id] = { ...h, life }
      }
    }
  }

  // Deaths: a close friend left behind may withdraw.
  for (const id of Object.keys(before.heroes) as HeroId[]) {
    if (!before.heroes[id]!.alive || state.heroes[id]?.alive !== false) continue
    for (const o of Object.keys(state.heroes) as HeroId[]) {
      if (!state.heroes[o]!.alive) continue
      const aff = before.life.relations[relationKey(id, o)]?.affinity ?? 0
      if (aff >= R.closeFriend) afterLoss(state, book, o, id, at, chronicle)
    }
  }

  // A gift: attention, comfort for the withdrawn, and meaning.
  if (cmd.type === 'GIVE_GIFT' && state.heroes[cmd.heroId]?.alive) {
    attention = markAttention(attention, cmd.heroId, day, FAVORITISM.gift)
    comfort(book, cmd.heroId, TRAUMA.giftComfort, at, chronicle)
    const pre = before.heroes[cmd.heroId]
    const bonus = pre ? giftMeaningBonus(before, pre, cmd.giftId) : 0
    if (bonus !== 0) {
      const h = heroes[cmd.heroId]!
      if (heroes === state.heroes) heroes = { ...heroes }
      heroes[cmd.heroId] = withFavor(h, h.favor + bonus)
    }
  }

  if (!book.changed && attention === e.attention && heroes === state.heroes && chronicle.length === 0) return state
  state = { ...state, heroes }
  return { ...state, life: chron(state, chronicle), estate: { ...e, trauma: book.changed ? book.map : e.trauma, attention } }
}
