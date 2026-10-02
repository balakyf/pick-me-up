/**
 * Trauma and rivalry beyond grief (spec 2026-09-30-estate-and-life §2, from the lore
 * research's "not built yet"):
 *
 * - **Burnout.** Every floor fought adds fatigue; an hour in the lobby takes one away.
 *   Past `burnAt` floors in a row each further floor risks burnout: the hero refuses to
 *   deploy for a world-day. Having burnt out makes a veteran who teaches well (canon
 *   Roderick, talked into the Training Center instead of retiring).
 * - **Withdrawal.** A close friend's death, or two world-days of despair (Sanity under
 *   the line), can turn a hero inward: they skip company, answer tersely and fight a
 *   little worse, until comforted — the Master's daily talks, a gift, a statue for the
 *   friend they lost, or simply time.
 * - **Favoritism.** The Master's attention (talks, gifts, deployments) is tracked over a
 *   rolling window. When one hero is plainly the favourite, envious heroes who got none
 *   turn jealous: a little favor lost each day, and a cooling towards the favourite.
 * - **Gift meaning drift.** What a gift means shifts with memory: a close friend's
 *   favourite things matter more, and a dead friend's favourite matters most — enough
 *   to override a dislike.
 *
 * PURE and deterministic (rolls via rngFor).
 */
import { chance, rngFor } from '../rng'
import { GIFTS, giftDelta, giftPreferences, giftRepeats, withFavor, type GiftCategory } from '../favor'
import { TUNING } from '../tuning'
import type { AttentionMark, ChronicleEntry, GameState, HeroId, HeroTrauma, OwnedHero } from '../types'
import { FAVORITISM as F, TRAUMA as T } from './constants'
import { personalityOf } from '../life/personality'
import { worldDay } from './weather'

const HOUR = 60 * 60_000
const R = TUNING.life.relation

export function freshTrauma(): HeroTrauma {
  return { fatigue: 0, foughtAt: 0, burnoutUntil: null, veteran: false, withdrawn: null, lowSince: null }
}

export function traumaOf(state: GameState, heroId: HeroId): HeroTrauma {
  return state.estate?.trauma?.[heroId] ?? freshTrauma()
}

/** Fatigue right now (recovering an hour at a time since the last floor). */
export function fatigueAt(t: HeroTrauma, nowWorld: number): number {
  return Math.max(0, t.fatigue - Math.max(0, nowWorld - t.foughtAt) / HOUR * T.fatiguePerHour)
}

export function isBurntOut(state: GameState, heroId: HeroId, nowWorld = state.meta.lastSeenAtWorld): boolean {
  const u = traumaOf(state, heroId).burnoutUntil
  return u !== null && u > nowWorld
}

export function isWithdrawn(state: GameState, heroId: HeroId): boolean {
  return traumaOf(state, heroId).withdrawn !== null
}

/** Chance the next floor burns this hero out (0 below the threshold). */
export function burnoutChance(hero: OwnedHero, fatigue: number): number {
  if (fatigue < T.burnAt) return 0
  const courage = personalityOf(hero).courage
  return Math.min(0.6, (fatigue - T.burnAt + 1) * T.burnChance * (1 - courage * T.burnCourage))
}

/** Chance a close friend's death turns this hero inward. */
export function withdrawChance(hero: OwnedHero): number {
  const p = personalityOf(hero)
  return Math.max(0.05, Math.min(0.9, T.griefBase + p.warmth * T.griefWarmth - p.courage * T.griefCourage))
}

// ─────────────────────────────────────────────────────────────────────────────
// Favoritism
// ─────────────────────────────────────────────────────────────────────────────

/** Attention per hero over the rolling window ending `today`. */
export function attentionScores(marks: readonly AttentionMark[], today: number): Map<HeroId, number> {
  const out = new Map<HeroId, number>()
  for (const m of marks) if (today - m.day < F.windowDays) out.set(m.heroId, (out.get(m.heroId) ?? 0) + m.weight)
  return out
}

/** The Master's plain favourite (most attention, at least `favouredAt`), or null. */
export function favouriteOf(state: GameState, today: number): HeroId | null {
  let best: HeroId | null = null
  let score = F.favouredAt - 1e-9
  for (const [id, v] of attentionScores(state.estate?.attention ?? [], today)) {
    if (!state.heroes[id]?.alive) continue
    if (v > score || (v === score && best !== null && id < best)) {
      best = id
      score = v
    }
  }
  return best
}

export function envyOf(hero: OwnedHero): number {
  const p = personalityOf(hero)
  return p.temper * 0.6 + p.sociability * 0.4
}

/** Who feels neglected today, and whom they envy. */
export function jealousyMap(state: GameState, today: number): Record<HeroId, HeroId> {
  const fav = favouriteOf(state, today)
  if (!fav) return {}
  const scores = attentionScores(state.estate?.attention ?? [], today)
  const out: Record<HeroId, HeroId> = {}
  for (const h of Object.values(state.heroes) as OwnedHero[]) {
    if (!h.alive || h.id === fav || h.captiveOf) continue
    if ((scores.get(h.id) ?? 0) > 0) continue
    const arrived = h.life?.arrivedDay ?? 0
    if (today - arrived < F.settleDays) continue
    if (envyOf(h) >= F.envyAt) out[h.id] = fav
  }
  return out
}

/** Record attention paid to a hero (pruned to the window and the cap). */
export function markAttention(marks: readonly AttentionMark[], heroId: HeroId, day: number, weight: number): AttentionMark[] {
  const kept = marks.filter((m) => day - m.day < F.windowDays)
  kept.push({ day, heroId, weight })
  return kept.length > F.logMax ? kept.slice(-F.logMax) : kept
}

// ─────────────────────────────────────────────────────────────────────────────
// Gift meaning drift
// ─────────────────────────────────────────────────────────────────────────────

export interface GiftMeaning {
  category: GiftCategory
  /** The friend whose favourite it was. */
  because: HeroId
  /** 2 = in memory of a dead friend, 1 = a living close friend's favourite. */
  weight: 1 | 2
}

/** Gift categories that have come to mean something to this hero (at most three). */
export function giftMeanings(state: GameState, heroId: HeroId): GiftMeaning[] {
  const hero = state.heroes[heroId]
  if (!hero) return []
  const out = new Map<GiftCategory, GiftMeaning>()
  for (const m of hero.life?.memories ?? []) {
    if (m.kind !== 'friendDied' || !m.other) continue
    const cat = giftPreferences(m.other).liked
    out.set(cat, { category: cat, because: m.other, weight: 2 })
  }
  for (const [k, r] of Object.entries(state.life.relations)) {
    if (r.affinity < R.closeFriend) continue
    const [a, b] = k.split('|') as [HeroId, HeroId]
    const other = a === heroId ? b : b === heroId ? a : null
    if (!other || !state.heroes[other]?.alive) continue
    const cat = giftPreferences(other).liked
    if (!out.has(cat)) out.set(cat, { category: cat, because: other, weight: 1 })
  }
  return [...out.values()].sort((x, y) => y.weight - x.weight || (x.category < y.category ? -1 : 1)).slice(0, 3)
}

/** Extra favor a gift earns because of what it has come to mean (0 when nothing). */
export function giftMeaningBonus(state: GameState, hero: OwnedHero, giftId: string): number {
  const gift = GIFTS[giftId]
  if (!gift) return 0
  const m = giftMeanings(state, hero.id).find((x) => x.category === gift.category)
  if (!m) return 0
  const soured = giftRepeats(hero, giftId) >= TUNING.favor.repeatSour
  if (soured) return 0
  const base = giftDelta(hero, giftId)
  // A dead friend's favourite overrides a dislike: it is not the thing, it is the person.
  if (base < 0) return Math.round(gift.favor * 0.5 * m.weight) - base
  return Math.max(1, Math.round(base * 0.3 * m.weight))
}

// ─────────────────────────────────────────────────────────────────────────────
// Transitions
// ─────────────────────────────────────────────────────────────────────────────

/** Mutable working copy of the trauma map for one reducer pass. */
export class TraumaBook {
  readonly map: Record<HeroId, HeroTrauma>
  changed = false
  constructor(src: Record<HeroId, HeroTrauma> | undefined) {
    this.map = { ...(src ?? {}) }
  }
  get(id: HeroId): HeroTrauma {
    return this.map[id] ?? freshTrauma()
  }
  set(id: HeroId, t: HeroTrauma): void {
    this.map[id] = t
    this.changed = true
  }
}

/** A floor fought: fatigue, and perhaps burnout. */
export function afterFloor(state: GameState, book: TraumaBook, heroId: HeroId, attempt: number, nowWorld: number, chronicle: ChronicleEntry[]): void {
  const hero = state.heroes[heroId]
  if (!hero || !hero.alive) return
  const t = book.get(heroId)
  const fatigue = fatigueAt(t, nowWorld) + 1
  let next: HeroTrauma = { ...t, fatigue, foughtAt: nowWorld }
  const p = burnoutChance(hero, fatigue)
  if (p > 0 && (t.burnoutUntil === null || t.burnoutUntil <= nowWorld) && chance(rngFor(state.seed, 'burnout', heroId, attempt), p).value) {
    next = { ...next, burnoutUntil: nowWorld + T.burnoutMs, veteran: true, fatigue: 0 }
    chronicle.push({ at: nowWorld, kind: 'burnout', heroIds: [heroId] })
  }
  book.set(heroId, next)
}

/** A close friend fell: this hero may withdraw. */
export function afterLoss(state: GameState, book: TraumaBook, heroId: HeroId, deadId: HeroId, nowWorld: number, chronicle: ChronicleEntry[]): void {
  const hero = state.heroes[heroId]
  if (!hero || !hero.alive) return
  const t = book.get(heroId)
  if (t.withdrawn) return
  if (!chance(rngFor(state.seed, 'withdraw', deadId, heroId), withdrawChance(hero)).value) return
  book.set(heroId, { ...t, withdrawn: { since: nowWorld, cause: deadId, comfort: 0, lastTalkDay: -1 } })
  chronicle.push({ at: nowWorld, kind: 'withdrawn', heroIds: [heroId, deadId] })
}

/** Comfort a withdrawn hero; returns true when they came back. */
export function comfort(book: TraumaBook, heroId: HeroId, amount: number, nowWorld: number, chronicle: ChronicleEntry[], talkDay?: number): boolean {
  const t = book.get(heroId)
  if (!t.withdrawn) return false
  const w = { ...t.withdrawn, comfort: t.withdrawn.comfort + amount, lastTalkDay: talkDay ?? t.withdrawn.lastTalkDay }
  if (w.comfort >= T.recoverAt) {
    book.set(heroId, { ...t, withdrawn: null, lowSince: null })
    chronicle.push({ at: nowWorld, kind: 'recovered', heroIds: [heroId] })
    return true
  }
  book.set(heroId, { ...t, withdrawn: w })
  return false
}

/**
 * The estate's clock: despair turns inward, burnout ends, time heals the withdrawn,
 * and — once per world-day — jealousy is weighed. Returns the same reference when
 * nothing changed.
 */
export function stepTrauma(state: GameState, nowWorld: number): GameState {
  const e = state.estate
  const from = e.clock ?? 0
  if (nowWorld <= from) return state
  const book = new TraumaBook(e.trauma)
  const chronicle: ChronicleEntry[] = []
  const days = Math.max(0, worldDay(nowWorld) - worldDay(from))

  // The fallen keep no trauma.
  for (const id of Object.keys(book.map) as HeroId[]) {
    if (!state.heroes[id]?.alive) {
      delete book.map[id]
      book.changed = true
    }
  }
  for (const h of Object.values(state.heroes) as OwnedHero[]) {
    if (!h.alive) continue
    let t = book.get(h.id)
    // Burnout runs its course.
    if (t.burnoutUntil !== null && t.burnoutUntil <= nowWorld) {
      t = { ...t, burnoutUntil: null }
      book.set(h.id, t)
    }
    // Despair: Sanity under the line for long enough turns a hero inward.
    if (h.sanity < T.despairSanity) {
      if (t.lowSince === null) book.set(h.id, (t = { ...t, lowSince: nowWorld }))
      else if (!t.withdrawn && nowWorld - t.lowSince >= T.despairMs) {
        book.set(h.id, (t = { ...t, withdrawn: { since: nowWorld, cause: null, comfort: 0, lastTalkDay: -1 } }))
        chronicle.push({ at: nowWorld, kind: 'withdrawn', heroIds: [h.id] })
      }
    } else if (t.lowSince !== null) book.set(h.id, (t = { ...t, lowSince: null }))
    // Time heals (a little).
    if (days > 0 && t.withdrawn) comfort(book, h.id, T.dailyComfort * days, nowWorld, chronicle)
    // Drop spent records.
    const cur = book.get(h.id)
    if (book.map[h.id] && !cur.withdrawn && !cur.veteran && cur.burnoutUntil === null && cur.lowSince === null && fatigueAt(cur, nowWorld) <= 0) {
      delete book.map[h.id]
      book.changed = true
    }
  }

  // Once a world-day: who feels neglected?
  let heroes = state.heroes
  let relations = state.life.relations
  let jealous = e.jealous ?? {}
  if (days > 0) {
    const today = worldDay(nowWorld)
    const next = jealousyMap(state, today)
    const n = Math.min(3, days)
    for (const [id, fav] of Object.entries(next) as [HeroId, HeroId][]) {
      if (jealous[id] !== fav) chronicle.push({ at: nowWorld, kind: 'jealous', heroIds: [id, fav] })
      const h = heroes[id]!
      if (h.favor > F.favorFloor) {
        if (heroes === state.heroes) heroes = { ...heroes }
        heroes[id] = withFavor(h, Math.max(F.favorFloor, h.favor - F.favorLoss * n))
      }
      const key = id < fav ? `${id}|${fav}` : `${fav}|${id}`
      const r = relations[key] ?? { affinity: 0, shared: 0 }
      if (relations === state.life.relations) relations = { ...relations }
      relations[key] = { ...r, affinity: Math.max(-100, r.affinity - F.affinityLoss * n) }
    }
    jealous = next
  }

  const lifeChanged = chronicle.length > 0 || relations !== state.life.relations
  return {
    ...state,
    heroes,
    life: lifeChanged ? { ...state.life, relations, chronicle: [...state.life.chronicle, ...chronicle].slice(-TUNING.life.chronicleMax) } : state.life,
    estate: { ...e, trauma: book.changed ? book.map : e.trauma, jealous, clock: nowWorld },
  }
}
