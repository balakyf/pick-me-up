/**
 * Camp incidents (lane L · pillar 2 and 5): small things the life sim makes happen in the
 * waiting room, seen on the campus, written in the chronicle and the Gazette.
 *
 *   brawl         two rivals come to blows where they meet         — the Master's word
 *   sworn         close friends swear to watch each other's backs  — happens
 *   nightTraining a driven hero sneaks out to the yard at night    — the Master's word
 *   kitchenFire   a pot left on: half the pantry burns             — happens
 *   homesick      a newcomer (or a lonely soul) misses home        — the Master's word
 *   trait         a born trait shows: a rousing word, a found purse, a hand that tends,
 *                 a raided pantry, a shared night watch, a drill    — happens
 *
 * The ones that wait on the Master sit in `life.incidents` until RESOLVE_INCIDENT answers
 * them (intervene / let it be) or their time runs out and they settle themselves ('let').
 *
 * PURE and deterministic. One roll per life slot, `floatStream(seed, 'incident', slot)`
 * (the life sim's form of rngFor), on the absolute slot clock — so a long advance equals
 * many short ones. A brawl left alone rolls `rngFor(seed, 'incident-let', id)`, the same
 * draw whether the Master lets it be or the clock does.
 */
import { chance, floatStream, rngFor } from '../rng'
import { applyXp, xpToNext } from '../stats'
import { traitOf } from '../content/traits'
import { TUNING } from '../tuning'
import type { CampIncident, ChronicleEntry, GameState, HeroId, HeroLife, IncidentKind, Memory, OwnedHero, Relation, XpProgress } from '../types'
import { personalityOf } from './personality'
import { INCIDENT as I } from './moraleTuning'

const R = TUNING.life.relation

/** The incidents waiting on the Master (none on older saves). */
export function incidentsOf(state: GameState): CampIncident[] {
  return state.life.incidents ?? []
}

/** The pending incident a hero is caught up in, if any. */
export function incidentFor(state: GameState, heroId: HeroId): CampIncident | null {
  return incidentsOf(state).find((i) => i.heroIds.includes(heroId)) ?? null
}

/** Kinds that wait on the Master's word. */
export const CHOICE_KINDS: readonly IncidentKind[] = ['brawl', 'nightTraining', 'homesick']

/** The part of a hero an incident may touch (the life sim's Working, or a reducer copy). */
export interface IncidentHero {
  hero: OwnedHero
  life: HeroLife
  sanity: number
  xp: XpProgress
}

/** Everything an incident reads and writes, for one slot (or one command). */
export interface IncidentWorld {
  seed: GameState['seed']
  slot: number
  day: number
  /** World-time (for the chronicle). */
  at: number
  /** Is it this hero's own night? */
  isNight: (h: IncidentHero) => boolean
  get: (id: HeroId) => IncidentHero | null
  /** Every living hero, in a stable order. */
  living: IncidentHero[]
  relations: Record<string, Relation>
  chronicle: ChronicleEntry[]
  purse: { gold: number; pantry: number }
  partyIds: readonly (HeroId | null)[]
  highestCleared: number
  kitchenLevel: number
  addMemory: (life: HeroLife, m: Memory) => void
}

const HOME_OFF = new Set(['away', 'captive', 'promoting', 'drilling'])
const atHome = (h: IncidentHero) => !HOME_OFF.has(h.life.doing.kind)
const awake = (h: IncidentHero) => atHome(h) && h.life.doing.kind !== 'sleep'
const clamp = (v: number, lo = 0, hi = 100) => (v < lo ? lo : v > hi ? hi : v)
const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function affinity(w: IncidentWorld, a: HeroId, b: HeroId): number {
  return w.relations[key(a, b)]?.affinity ?? 0
}
function shiftAffinity(w: IncidentWorld, a: HeroId, b: HeroId, by: number): void {
  const k = key(a, b)
  const r = w.relations[k] ?? { affinity: 0, shared: 0 }
  w.relations[k] = { ...r, affinity: clamp(Math.round((r.affinity + by) * 10) / 10, -100, 100) }
}
function remember(w: IncidentWorld, h: IncidentHero, detail: string, other?: HeroId, weight = 30): void {
  w.addMemory(h.life, { kind: 'incident', day: w.day, detail, weight, ...(other ? { other } : {}) })
}
function news(w: IncidentWorld, heroIds: HeroId[], detail: string): void {
  w.chronicle.push({ at: w.at, kind: 'incident', heroIds, detail })
  if (w.chronicle.length > TUNING.life.chronicleMax) w.chronicle.splice(0, w.chronicle.length - TUNING.life.chronicleMax)
}

// ─────────────────────────────────────────────────────────────────────────────
// Who could be part of what, right now
// ─────────────────────────────────────────────────────────────────────────────

type Candidate = { kind: IncidentKind; heroIds: HeroId[]; detail?: string }

function brawlers(w: IncidentWorld, busy: Set<HeroId>): Candidate | null {
  let best: Candidate | null = null
  let worst = R.rival + 1e-9
  const free = w.living.filter((h) => awake(h) && !busy.has(h.hero.id))
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const a = free[i]!
      const b = free[j]!
      if (a.life.doing.place !== b.life.doing.place) continue
      const aff = affinity(w, a.hero.id, b.hero.id)
      if (aff < worst) {
        worst = aff
        best = { kind: 'brawl', heroIds: [a.hero.id, b.hero.id], detail: a.life.doing.place }
      }
    }
  }
  return best
}

function sworn(w: IncidentWorld): Candidate | null {
  for (const a of w.living) {
    const other = a.life.doing.with
    if (!other || a.life.doing.kind !== 'socialize' || other < a.hero.id) continue
    const b = w.get(other)
    if (!b || b.life.doing.with !== a.hero.id) continue
    if (affinity(w, a.hero.id, other) < I.sworn.affinityAt) continue
    if (a.life.memories.some((m) => m.kind === 'incident' && m.other === other && m.detail?.startsWith('sworn'))) continue
    return { kind: 'sworn', heroIds: [a.hero.id, other] }
  }
  return null
}

function nightOwls(w: IncidentWorld, busy: Set<HeroId>): Candidate | null {
  for (const h of w.living) {
    if (!atHome(h) || busy.has(h.hero.id) || h.xp.atCap || !w.isNight(h)) continue
    if (h.life.needs.energy < I.night.energyAt) continue
    const driven = personalityOf(h.hero).diligence >= I.night.diligenceAt || traitOf(h.hero).family === 'night'
    if (driven) return { kind: 'nightTraining', heroIds: [h.hero.id] }
  }
  return null
}

function fire(w: IncidentWorld): Candidate | null {
  if (w.kitchenLevel < 1 || w.purse.pantry < I.fire.pantryAt) return null
  const there = w.living.filter((h) => awake(h) && h.life.doing.place === 'kitchen')
  if (there.length === 0) return null
  const cook = there.find((h) => h.life.job === 'cook') ?? there[0]!
  return { kind: 'kitchenFire', heroIds: [cook.hero.id] }
}

function homesick(w: IncidentWorld, busy: Set<HeroId>): Candidate | null {
  for (const h of w.living) {
    if (!awake(h) || busy.has(h.hero.id) || h.life.grief >= 20) continue
    const fresh = w.day - h.life.arrivedDay <= I.homesick.arrivedDays
    if (fresh && h.life.needs.social < I.homesick.socialBelow) return { kind: 'homesick', heroIds: [h.hero.id] }
  }
  return null
}

const TRAIT_MOMENTS = new Set(['courage', 'leader', 'luck', 'healer', 'stomach', 'night'])

function traitMoment(w: IncidentWorld, rnd: () => number): Candidate | null {
  const able = w.living.filter((h) => {
    if (!awake(h)) return false
    const fam = traitOf(h.hero).family
    if (!TRAIT_MOMENTS.has(fam)) return false
    if (fam === 'night') return w.isNight(h)
    if (fam === 'stomach') return w.purse.pantry >= I.trait.eat
    return true
  })
  if (able.length === 0) return null
  const h = able[Math.floor(rnd() * able.length)]!
  return { kind: 'trait', heroIds: [h.hero.id], detail: traitOf(h.hero).id }
}

// ─────────────────────────────────────────────────────────────────────────────
// One slot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Perhaps something happens this slot. An incident that just happens is applied and
 * chronicled; one that waits on the Master is returned (the caller keeps it pending).
 */
export function rollIncident(w: IncidentWorld, pending: readonly CampIncident[]): CampIncident | null {
  const rnd = floatStream(w.seed, 'incident', w.slot)
  if (rnd() >= I.perSlot) return null
  const busy = new Set<HeroId>()
  for (const p of pending) for (const id of p.heroIds) busy.add(id)
  const canWait = pending.length < I.maxPending
  const options: Candidate[] = []
  const add = (c: Candidate | null) => {
    if (c) options.push(c)
  }
  if (canWait) add(brawlers(w, busy))
  add(sworn(w))
  if (canWait) add(nightOwls(w, busy))
  if (rnd() < I.fire.catchChance) add(fire(w))
  if (canWait) add(homesick(w, busy))
  add(traitMoment(w, rnd))
  if (options.length === 0) return null
  const pick = options[Math.floor(rnd() * options.length)]!
  return begin(w, pick)
}

function begin(w: IncidentWorld, c: Candidate): CampIncident | null {
  const hs = c.heroIds.map((id) => w.get(id)!)
  switch (c.kind) {
    case 'brawl': {
      const [a, b] = hs as [IncidentHero, IncidentHero]
      a.sanity -= I.brawl.hurt
      b.sanity -= I.brawl.hurt
      remember(w, a, 'brawl:-', b.hero.id)
      remember(w, b, 'brawl:-', a.hero.id)
      return pendingOf(w, c)
    }
    case 'sworn': {
      const [a, b] = hs as [IncidentHero, IncidentHero]
      shiftAffinity(w, a.hero.id, b.hero.id, I.sworn.affinity)
      remember(w, a, 'sworn:+', b.hero.id, 60)
      remember(w, b, 'sworn:+', a.hero.id, 60)
      news(w, c.heroIds, 'sworn')
      return null
    }
    case 'nightTraining':
      return pendingOf(w, c)
    case 'kitchenFire': {
      w.purse.pantry = Math.floor(w.purse.pantry * I.fire.pantryKept)
      remember(w, hs[0]!, 'fire:-')
      news(w, c.heroIds, 'fire')
      return null
    }
    case 'homesick':
      remember(w, hs[0]!, 'homesick:-')
      return pendingOf(w, c)
    case 'trait':
      traitEffect(w, hs[0]!, c.detail ?? '')
      return null
  }
}

function pendingOf(w: IncidentWorld, c: Candidate): CampIncident {
  return {
    id: `i${w.slot}`,
    kind: c.kind,
    heroIds: c.heroIds,
    at: w.at,
    untilSlot: w.slot + (I.wait[c.kind] ?? 6),
    ...(c.detail ? { detail: c.detail } : {}),
  }
}

function traitEffect(w: IncidentWorld, h: IncidentHero, traitId: string): void {
  const fam = traitOf(h.hero).family
  const heroIds: HeroId[] = [h.hero.id]
  switch (fam) {
    case 'courage':
      for (const id of w.partyIds) {
        const p = id ? w.get(id) : null
        if (p && atHome(p)) p.sanity += I.trait.speech
      }
      break
    case 'leader':
      for (const p of w.living) {
        if (!awake(p) || p.life.doing.place !== 'yard') continue
        p.xp = applyXp(p.xp, Math.max(1, Math.round(xpToNext(p.xp.level) * I.trait.drillXp)), p.hero.star)
        if (p !== h) heroIds.push(p.hero.id)
      }
      break
    case 'luck':
      w.purse.gold += I.trait.purseBase + I.trait.purseFloor * w.highestCleared
      break
    case 'healer': {
      const patient = w.living.filter((p) => p !== h && atHome(p)).sort((a, b) => a.sanity - b.sanity || (a.hero.id < b.hero.id ? -1 : 1))[0]
      if (patient) {
        patient.sanity += I.trait.tend
        heroIds.push(patient.hero.id)
      }
      break
    }
    case 'stomach':
      w.purse.pantry = Math.max(0, w.purse.pantry - I.trait.eat)
      h.life.needs.fun = clamp(h.life.needs.fun + 10)
      break
    case 'night': {
      const mate = w.living.find((p) => p !== h && awake(p) && w.isNight(p))
      h.sanity += I.trait.watch
      if (mate) {
        mate.sanity += I.trait.watch
        heroIds.push(mate.hero.id)
      }
      break
    }
  }
  remember(w, h, 'trait:+')
  news(w, heroIds, `trait:${traitId}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Settling
// ─────────────────────────────────────────────────────────────────────────────

/** What the Master's word (or the clock) did, for the UI. */
export type IncidentOutcome = 'separated' | 'cleared' | 'worse' | 'bed' | 'trained' | 'comforted' | 'alone'

/** Settle a pending incident: the Master stepped in, or it was let be. Writes the chronicle. */
export function settleIncident(w: IncidentWorld, inc: CampIncident, choice: 'intervene' | 'let'): IncidentOutcome | null {
  const hs = inc.heroIds.map((id) => w.get(id))
  if (hs.some((h) => !h)) return null
  switch (inc.kind) {
    case 'brawl': {
      const [a, b] = hs as [IncidentHero, IncidentHero]
      if (choice === 'intervene') {
        shiftAffinity(w, a.hero.id, b.hero.id, I.brawl.interveneAffinity)
        a.sanity += I.brawl.interveneSanity
        b.sanity += I.brawl.interveneSanity
        news(w, inc.heroIds, `brawl:separated:${inc.detail ?? ''}`)
        return 'separated'
      }
      if (chance(rngFor(w.seed, 'incident-let', inc.id), I.brawl.clearChance).value) {
        shiftAffinity(w, a.hero.id, b.hero.id, I.brawl.clearAffinity)
        remember(w, a, 'brawl:+', b.hero.id)
        remember(w, b, 'brawl:+', a.hero.id)
        news(w, inc.heroIds, `brawl:cleared:${inc.detail ?? ''}`)
        return 'cleared'
      }
      shiftAffinity(w, a.hero.id, b.hero.id, I.brawl.worseAffinity)
      // The weaker of the two takes the worse of it.
      const loser = a.xp.level < b.xp.level || (a.xp.level === b.xp.level && a.hero.id > b.hero.id) ? a : b
      loser.sanity -= I.brawl.loserSanity
      news(w, [loser === a ? a.hero.id : b.hero.id, loser === a ? b.hero.id : a.hero.id], `brawl:worse:${inc.detail ?? ''}`)
      return 'worse'
    }
    case 'nightTraining': {
      const h = hs[0]!
      if (choice === 'intervene') {
        h.life.needs.energy = clamp(h.life.needs.energy + I.night.bedEnergy)
        news(w, inc.heroIds, 'night:bed')
        return 'bed'
      }
      h.xp = applyXp(h.xp, Math.max(1, Math.round(xpToNext(h.xp.level) * I.night.xpShare)), h.hero.star)
      h.life.needs.energy = clamp(h.life.needs.energy - I.night.energyCost)
      remember(w, h, 'night:+')
      news(w, inc.heroIds, 'night:trained')
      return 'trained'
    }
    case 'homesick': {
      const h = hs[0]!
      if (choice === 'intervene') {
        h.sanity += I.homesick.interveneSanity
        h.life.needs.social = clamp(h.life.needs.social + I.homesick.interveneSocial)
        remember(w, h, 'homesick:+')
        news(w, inc.heroIds, 'homesick:comforted')
        return 'comforted'
      }
      h.sanity += I.homesick.letSanity
      news(w, inc.heroIds, 'homesick:alone')
      return 'alone'
    }
    default:
      return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The Master's word (RESOLVE_INCIDENT)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Answer a pending incident now. Refuses (throws `resolveIncident: …`) an unknown id or
 * choice, or one whose heroes are gone. `addMemory` is the life sim's (passed in to keep
 * this module free of an import cycle).
 */
export function resolveIncident(
  state: GameState,
  id: string,
  choice: 'intervene' | 'let',
  helpers: { addMemory: IncidentWorld['addMemory']; slotOf: (ms: number) => number; dayOfSlot: (s: number) => number },
): { state: GameState; outcome: IncidentOutcome } {
  if (choice !== 'intervene' && choice !== 'let') throw new Error(`resolveIncident: unknown choice ${String(choice)}`)
  const inc = incidentsOf(state).find((i) => i.id === id)
  if (!inc) throw new Error('resolveIncident: no such incident')
  for (const hid of inc.heroIds) if (!state.heroes[hid]?.alive) throw new Error('resolveIncident: a hero involved has fallen')
  const at = state.meta.lastSeenAtWorld
  const slot = helpers.slotOf(at)
  const touched = new Map<HeroId, IncidentHero>()
  const get = (hid: HeroId): IncidentHero | null => {
    let x = touched.get(hid)
    if (x) return x
    const h = state.heroes[hid]
    if (!h || !h.alive || !h.life) return null
    const l = h.life
    x = { hero: h, life: { ...l, needs: { ...l.needs }, jobXp: { ...l.jobXp }, doing: { ...l.doing }, memories: [...l.memories] }, sanity: h.sanity, xp: h.xp }
    touched.set(hid, x)
    return x
  }
  const w: IncidentWorld = {
    seed: state.seed,
    slot,
    day: helpers.dayOfSlot(slot),
    at,
    isNight: () => false,
    get,
    living: [],
    relations: { ...state.life.relations },
    chronicle: [...state.life.chronicle],
    purse: { gold: state.gold, pantry: state.life.pantry },
    partyIds: state.party.slots,
    highestCleared: state.tower.highestCleared,
    kitchenLevel: state.facilities.kitchen.level,
    addMemory: helpers.addMemory,
  }
  const outcome = settleIncident(w, inc, choice)
  if (outcome === null) throw new Error('resolveIncident: a hero involved has fallen')
  const heroes = { ...state.heroes }
  for (const [hid, x] of touched) {
    heroes[hid] = { ...x.hero, life: x.life, xp: x.xp, sanity: Math.round(clamp(x.sanity, 0, TUNING.lobby.sanityMax) * 100) / 100 }
  }
  const left = incidentsOf(state).filter((i) => i.id !== id)
  const { incidents: _answered, ...lifeRest } = state.life
  return {
    state: {
      ...state,
      gold: w.purse.gold,
      heroes,
      life: {
        ...lifeRest,
        relations: w.relations,
        chronicle: w.chronicle,
        pantry: w.purse.pantry,
        ...(left.length > 0 ? { incidents: left } : {}),
      },
    },
    outcome,
  }
}
