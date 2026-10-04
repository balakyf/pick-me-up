/**
 * Morale — a hero's spirit, as a resource (lane L · pillars 1, 2 and 5).
 *
 * Morale is DERIVED, never stored: a 0..100 score read from everything the camp already
 * knows about a hero — their Sanity, their needs, the floors they fought in a row, their
 * grief, whether they have withdrawn or feel overlooked, their friends and feuds, what
 * happened to them lately (a clear, a near death, a gift, a banquet, a camp incident),
 * how they feel about their job, and the trait they were born with. Each piece is a named
 * `factor`, so the UI can say exactly why a hero is low and what would lift them.
 *
 * Five pips, six bands:
 *   inspired (5) · high (4) · steady (3) · low (2) · shaken (1) · broken (0)
 *
 * What it does, small and bounded, and only at the ends (`MORALE` in moraleTuning.ts):
 *   - inspired: every magnitude stat × inspiredStat in the tower and raids;
 *   - shaken:   × shakenStat (not on top of the withdrawn penalty);
 *   - broken:   they will not deploy ('disheartened'), until the camp lifts them.
 * Steady, high and low change nothing, so battles without morale at the ends replay
 * bit-identically.
 *
 * Recovery is something the Master does in the lobby: rest (needs, fatigue), a banquet,
 * the Tavern and friends (company eases grief), the Infirmary (Sanity), the Memorial
 * (grief), a word or a gift (withdrawal, gifts), answering camp incidents.
 *
 * PURE and deterministic: integer-free arithmetic only on stored values, no clocks (the
 * day is the account's own, `meta.lastSeenAtWorld`). Cached per state object.
 */
import { TUNING } from '../tuning'
import type { CombatUnit, DerivedStats, GameState, HeroId, HeroLife, OwnedHero } from '../types'
import { traitOf } from '../content/traits'
import { fatigueAt } from '../estate/trauma'
import { aptitude } from './jobs'
import { MORALE as M } from './moraleTuning'

const R = TUNING.life.relation
const DAY_MS = TUNING.life.slotMs * TUNING.life.slotsPerDay

export type MoraleBand = 'inspired' | 'high' | 'steady' | 'low' | 'shaken' | 'broken'

/** Why a hero feels the way they do. `other` names the friend, rival or fallen involved. */
export type MoraleFactorKey =
  | 'sanity'
  | 'tired'
  | 'hungry'
  | 'lonely'
  | 'bored'
  | 'cared'
  | 'fatigue'
  | 'grief'
  | 'withdrawn'
  | 'jealous'
  | 'friends'
  | 'feud'
  | 'floorCleared'
  | 'floorLost'
  | 'retreated'
  | 'nearDeath'
  | 'comradeDied'
  | 'guilt'
  | 'gift'
  | 'consoled'
  | 'promoted'
  | 'incident'
  | 'banquet'
  | 'job'
  | 'trait'

export interface MoraleFactor {
  key: MoraleFactorKey
  /** Signed points (one decimal). */
  value: number
  other?: HeroId
  /** Free detail (an incident kind, a trait id). */
  detail?: string
}

export interface Morale {
  /** 0..100. */
  score: number
  /** 0..5 lit pips. */
  pips: number
  band: MoraleBand
  /** Strongest first (by size). */
  factors: MoraleFactor[]
}

const BAND_PIPS: Record<MoraleBand, number> = { inspired: 5, high: 4, steady: 3, low: 2, shaken: 1, broken: 0 }

export function bandOf(score: number): MoraleBand {
  const b = M.bands
  if (score >= b.inspired) return 'inspired'
  if (score >= b.high) return 'high'
  if (score >= b.steady) return 'steady'
  if (score >= b.low) return 'low'
  if (score >= b.shaken) return 'shaken'
  return 'broken'
}

export function pipsOf(band: MoraleBand): number {
  return BAND_PIPS[band]
}

const round1 = (v: number) => Math.round(v * 10) / 10

/** The account's world-day (its clock is caught up before every command). */
export function moraleDay(state: GameState): number {
  return Math.floor(state.meta.lastSeenAtWorld / DAY_MS)
}

/** Each hero's living friends and feuds, indexed once per relation map. */
const bondIndex = new WeakMap<GameState['life']['relations'], Map<string, [HeroId, number][]>>()
function bondsFor(state: GameState, heroId: HeroId): [HeroId, number][] {
  let idx = bondIndex.get(state.life.relations)
  if (!idx) {
    idx = new Map()
    for (const [k, r] of Object.entries(state.life.relations)) {
      if (r.affinity > R.rival && r.affinity < R.friend) continue
      const [a, b] = k.split('|') as [HeroId, HeroId]
      if (!idx.has(a)) idx.set(a, [])
      if (!idx.has(b)) idx.set(b, [])
      idx.get(a)!.push([b, r.affinity])
      idx.get(b)!.push([a, r.affinity])
    }
    bondIndex.set(state.life.relations, idx)
  }
  return idx.get(heroId) ?? []
}

function lifeFor(hero: OwnedHero): HeroLife | null {
  return hero.life ?? null
}

/** The factors, unsorted (pure; no cache). */
function factorsOf(state: GameState, hero: OwnedHero): MoraleFactor[] {
  const out: MoraleFactor[] = []
  const push = (key: MoraleFactorKey, value: number, other?: HeroId, detail?: string) => {
    const v = round1(value)
    if (v !== 0) out.push(other || detail ? { key, value: v, ...(other ? { other } : {}), ...(detail ? { detail } : {}) } : { key, value: v })
  }
  push('sanity', (hero.sanity - M.sanityPivot) * M.sanityPerPoint)

  const life = lifeFor(hero)
  if (life) {
    const n = life.needs
    if (n.energy < M.needLow) push('tired', M.needs.energy)
    if (n.hunger < M.needLow) push('hungry', M.needs.hunger)
    if (n.social < M.needLow) push('lonely', M.needs.social)
    if (n.fun < M.needLow) push('bored', M.needs.fun)
    if (n.energy >= M.caredAbove && n.hunger >= M.caredAbove && n.social >= M.caredAbove && n.fun >= M.caredAbove) push('cared', M.cared)
    if (life.grief > 0) {
      const lost = [...life.memories].reverse().find((m) => m.kind === 'friendDied' || m.kind === 'guilt' || m.kind === 'anniversary')
      push('grief', Math.max(M.griefCap, -life.grief * M.griefPer), lost?.other)
    }
  }

  const t = state.estate?.trauma?.[hero.id]
  if (t) {
    const f = fatigueAt(t, state.meta.lastSeenAtWorld)
    if (f >= M.fatigueFrom) push('fatigue', Math.max(M.fatigueCap, M.fatiguePer * (Math.floor(f) - M.fatigueFrom + 1)))
    if (t.withdrawn) push('withdrawn', M.withdrawn, t.withdrawn.cause ?? undefined)
  }
  const envied = state.estate?.jealous?.[hero.id]
  if (envied) push('jealous', M.jealous, envied)

  // Friends lift, feuds weigh (the living only).
  let lift = 0
  let weigh = 0
  let bestFriend: HeroId | undefined
  let bestAff = 0
  let worstRival: HeroId | undefined
  let worstAff = 0
  for (const [o, aff] of bondsFor(state, hero.id)) {
    if (!state.heroes[o]?.alive) continue
    if (aff >= R.closeFriend) lift += M.closeFriend
    else if (aff >= R.friend) lift += M.friend
    else if (aff <= R.grudge) weigh += M.grudge
    else if (aff <= R.rival) weigh += M.rival
    if (aff > bestAff) {
      bestAff = aff
      bestFriend = o
    }
    if (aff < worstAff) {
      worstAff = aff
      worstRival = o
    }
  }
  if (lift > 0) push('friends', Math.min(M.friendsCap, lift), bestFriend)
  if (weigh < 0) push('feud', Math.max(M.feudCap, weigh), worstRival)

  // What happened lately (the latest of each kind).
  const today = moraleDay(state)
  if (life) {
    const seen = new Set<string>()
    for (let i = life.memories.length - 1; i >= 0; i--) {
      const m = life.memories[i]!
      if (seen.has(m.kind)) continue
      const rule = M.recent[m.kind]
      if (rule) {
        seen.add(m.kind)
        if (today - m.day <= rule.days && today >= m.day) push(m.kind as MoraleFactorKey, rule.value, m.other)
      } else if (m.kind === 'incident') {
        seen.add(m.kind)
        if (today - m.day <= 1 && today >= m.day) {
          const [kind, sign] = (m.detail ?? ':').split(':')
          if (sign === '+' || sign === '-') push('incident', sign === '+' ? M.incident : -M.incident, m.other, kind)
        }
      }
    }
    if (life.job) {
      const apt = aptitude(hero, life.job)
      if (apt >= TUNING.life.jobs.likeAt) push('job', M.jobLikes, undefined, life.job)
      else if (apt < TUNING.life.jobs.dislikeAt) push('job', M.jobDislikes, undefined, life.job)
    }
  }
  const bq = state.meta.banquetDay
  if (bq !== undefined) {
    if (bq === today) push('banquet', M.banquetToday)
    else if (bq === today - 1) push('banquet', M.banquetYesterday)
  }
  const trait = traitOf(hero)
  const tv = M.trait[trait.family]
  if (tv) push('trait', tv, undefined, trait.id)
  return out
}

const cache = new WeakMap<GameState, Map<HeroId, Morale>>()

/** A hero's morale right now (memoized per state object). The fallen read as broken. */
export function moraleOf(state: GameState, heroId: HeroId): Morale {
  let byHero = cache.get(state)
  if (!byHero) cache.set(state, (byHero = new Map()))
  const hit = byHero.get(heroId)
  if (hit) return hit
  const hero = state.heroes[heroId]
  let m: Morale
  if (!hero || !hero.alive) m = { score: 0, pips: 0, band: 'broken', factors: [] }
  else {
    const factors = factorsOf(state, hero).sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    let sum = M.base
    for (const f of factors) sum += f.value
    const score = Math.max(0, Math.min(100, Math.round(sum)))
    const band = bandOf(score)
    m = { score, pips: pipsOf(band), band, factors }
  }
  byHero.set(heroId, m)
  return m
}

/** Morale broken: the hero will not deploy (the deploy rails' 'disheartened'). */
export function moraleBroken(state: GameState, heroId: HeroId): boolean {
  const h = state.heroes[heroId]
  if (!h || !h.alive) return false
  return moraleOf(state, heroId).band === 'broken'
}

/** The stat multiplier morale gives right now (1 in the neutral bands). A withdrawn hero
 *  already fights dulled (estate), so shaken does not stack on top. */
export function moraleStatMult(state: GameState, heroId: HeroId): number {
  const band = moraleOf(state, heroId).band
  if (band === 'inspired') return M.inspiredStat
  if (band === 'shaken' && !state.estate?.trauma?.[heroId]?.withdrawn) return M.shakenStat
  return 1
}

const SCALED: (keyof DerivedStats)[] = ['maxHP', 'pAtk', 'mAtk', 'pDef', 'mDef', 'spd']

/** A combat unit with its hero's morale applied (the same reference when neutral). */
export function applyMorale(state: GameState, unit: CombatUnit): CombatUnit {
  const id = unit.sourceHeroId
  // A partial CP context (no roster, no life) reads no morale.
  if (!id || !state.heroes?.[id] || !state.life || !state.meta) return unit
  const k = moraleStatMult(state, id)
  if (k === 1) return unit
  const stats = { ...unit.stats }
  for (const s of SCALED) stats[s] = Math.max(1, Math.round(stats[s] * k))
  return { ...unit, stats, currentHP: stats.maxHP, cp: Math.round(unit.cp * k) }
}

export interface CampOutlook {
  counts: Record<MoraleBand, number>
  /** Living heroes at shaken or broken, lowest first. */
  troubled: HeroId[]
  /** Inspired heroes, highest first. */
  inspired: HeroId[]
  /** The mean score of the living (0 when none). */
  mean: number
}

/** The whole camp's spirit at a glance (the Gazette's outlook, the camp summary). */
export function campOutlook(state: GameState): CampOutlook {
  const counts: Record<MoraleBand, number> = { inspired: 0, high: 0, steady: 0, low: 0, shaken: 0, broken: 0 }
  const scored: [HeroId, number, MoraleBand][] = []
  for (const h of Object.values(state.heroes) as OwnedHero[]) {
    if (!h.alive) continue
    const m = moraleOf(state, h.id)
    counts[m.band]++
    scored.push([h.id, m.score, m.band])
  }
  const mean = scored.length ? Math.round(scored.reduce((a, x) => a + x[1], 0) / scored.length) : 0
  const troubled = scored.filter((x) => x[2] === 'shaken' || x[2] === 'broken').sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map((x) => x[0])
  const inspired = scored.filter((x) => x[2] === 'inspired').sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map((x) => x[0])
  return { counts, troubled, inspired, mean }
}
