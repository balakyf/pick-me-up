/**
 * The shared hero picker's pure half (lane N): how heroes are searched, filtered and
 * sorted wherever the Master picks one — every facility, the Party Board's list and its
 * swap. No React here, so every rule is unit-tested. The Party Board's `boardHeroes`
 * delegates to this, so the two can never drift.
 */
import type { Element, GameState, HeroClass, OwnedHero } from '../../engine/types'
import { heroCp } from '../../engine/scout'
import { shownStar } from '../../engine/shop'
import { moraleOf } from '../../engine/life/morale'

export type PickSort = 'cp' | 'stars' | 'level' | 'morale' | 'class' | 'name' | 'element'
/** The sorts the picker offers, in menu order. */
export const PICK_SORTS: PickSort[] = ['cp', 'stars', 'level', 'morale', 'class', 'name', 'element']

export interface PickFilter {
  query: string
  element: Element | 'all'
  /** 'none' is the classless heroes (the untrained, some cameos). */
  heroClass: HeroClass | 'none' | 'all'
  /** Minimum shown star; 0 is any. */
  minStar: number
  /** Only heroes the place can take right now (the caller says what "available" means). */
  availableOnly: boolean
  /** The living, the fallen, or both. */
  alive: 'living' | 'fallen' | 'all'
}

export const PICK_ALL: PickFilter = { query: '', element: 'all', heroClass: 'all', minStar: 0, availableOnly: false, alive: 'living' }

const ELEMENT_ORDER: Element[] = ['fire', 'water', 'wind', 'earth', 'light', 'dark', 'physical']
const CLASS_ORDER: (HeroClass | null)[] = ['warrior', 'spearman', 'thief', 'archer', 'mage', null]

/** Fold accents and case so "elo" finds "Élodie". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Does a hero pass the filter? `available` says whether the place can take them now. */
export function passes(state: GameState, h: OwnedHero, filter: PickFilter, available: (h: OwnedHero) => boolean): boolean {
  if (filter.alive === 'living' && !h.alive) return false
  if (filter.alive === 'fallen' && h.alive) return false
  const q = fold(filter.query.trim())
  if (q && !fold(h.name).includes(q)) return false
  if (filter.element !== 'all' && h.element !== filter.element) return false
  if (filter.heroClass !== 'all' && (h.heroClass ?? 'none') !== filter.heroClass) return false
  if (filter.minStar > 0 && shownStar(h, state.meta.masterLevel) < filter.minStar) return false
  if (filter.availableOnly && !available(h)) return false
  return true
}

/**
 * Sort heroes for a picker. Numbers sort high → low, words A → Z; `flip` reverses that.
 * Ties fall back to CP (strongest first), then id, so the order is stable. Stars are the
 * SHOWN stars (the whale-bait lie holds here too); morale is lane L's score (the fallen 0).
 */
export function sortHeroes(state: GameState, list: readonly OwnedHero[], sort: PickSort, flip = false): OwnedHero[] {
  const ml = state.meta.masterLevel
  const cp = new Map(list.map((h) => [h.id, heroCp(h, state)]))
  const morale = sort === 'morale' ? new Map(list.map((h) => [h.id, h.alive ? moraleOf(state, h.id).score : -1])) : null
  const key = (h: OwnedHero): number | string => {
    switch (sort) {
      case 'cp':
        return -cp.get(h.id)!
      case 'level':
        return -h.xp.level
      case 'stars':
        return -shownStar(h, ml)
      case 'morale':
        return -morale!.get(h.id)!
      case 'name':
        return fold(h.name)
      case 'element':
        return ELEMENT_ORDER.indexOf(h.element)
      case 'class':
        return CLASS_ORDER.indexOf(h.heroClass)
    }
  }
  const sign = flip ? -1 : 1
  return [...list].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (ka !== kb) return (ka < kb ? -1 : 1) * sign
    const d = cp.get(b.id)! - cp.get(a.id)!
    if (d !== 0) return d
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/** Filter, then sort: what a picker lists. `pool` defaults to every hero of the account. */
export function pickHeroes(
  state: GameState,
  opts: { sort: PickSort; flip?: boolean; filter: PickFilter; pool?: readonly OwnedHero[]; available?: (h: OwnedHero) => boolean },
): OwnedHero[] {
  const pool = opts.pool ?? (Object.values(state.heroes) as OwnedHero[])
  const available = opts.available ?? (() => true)
  return sortHeroes(
    state,
    pool.filter((h) => passes(state, h, opts.filter, available)),
    opts.sort,
    opts.flip,
  )
}

/** True when the filter differs from the picker's starting one (shows "Reset filters"). */
export function filtered(filter: PickFilter, base: PickFilter = PICK_ALL): boolean {
  return (Object.keys(base) as (keyof PickFilter)[]).some((k) => filter[k] !== base[k])
}
