/**
 * Party Board helpers — the pure half of the Party screen: who is on the board, how
 * the list sorts and filters, and how a hero lands in a slot (drop, swap, reorder).
 * No React here, so every rule is unit-tested; the component only wires events.
 */
import type { Element, GameState, HeroClass, HeroId, Line, OwnedHero, Star } from '../../engine/types'
import { canFight, heroCp } from '../../engine/scout'
import { shownStar } from '../../engine/shop'
import { estateBusy } from '../../engine/estate/deploy'

/** Below this Sanity the scout won't suggest a hero (mirrors suggestParty's default). */
export const WEARY_BELOW = 40

export type HeroStatus = 'ready' | 'weary' | 'broken' | 'training' | 'promoting' | 'away' | 'captive' | 'bounty' | 'burnout'

/** What a hero is up to, as the board shows it. Only 'ready' and 'weary' can fight. */
export function heroStatus(h: OwnedHero, state?: GameState): HeroStatus {
  if (h.captiveOf) return 'captive'
  if (h.expedition !== null) return 'away'
  const estate = state ? estateBusy(state, h.id) : null
  if (estate === 'is out on a bounty') return 'bounty'
  if (estate !== null) return 'burnout'
  if (h.promotion !== null) return 'promoting'
  if (h.training !== null) return 'training'
  if (h.sanity <= 0) return 'broken'
  if (h.sanity < WEARY_BELOW) return 'weary'
  return 'ready'
}

/** Can this hero actually take the field right now? (The deploy rails — the tower's rule.) */
export function deployable(h: OwnedHero, state?: GameState): boolean {
  return canFight(h, state)
}

export type SortKey = 'cp' | 'level' | 'stars' | 'name' | 'element' | 'class'
export const SORT_KEYS: SortKey[] = ['cp', 'level', 'stars', 'name', 'element', 'class']

export interface BoardFilter {
  query: string
  element: Element | 'all'
  /** 'none' is the classless (cameo) heroes. */
  heroClass: HeroClass | 'none' | 'all'
  /** Minimum shown star; 0 is any. */
  minStar: number
  hideUnavailable: boolean
}

export const NO_FILTER: BoardFilter = { query: '', element: 'all', heroClass: 'all', minStar: 0, hideUnavailable: false }

const ELEMENT_ORDER: Element[] = ['fire', 'water', 'wind', 'earth', 'light', 'dark', 'physical']
const CLASS_ORDER: (HeroClass | null)[] = ['warrior', 'spearman', 'thief', 'archer', 'mage', null]

/** Fold accents and case so "elo" finds "Élodie". */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * The living heroes the board lists, filtered and sorted. Numbers sort high → low,
 * words A → Z; `desc` flips that. Ties fall back to CP (strongest first), then id,
 * so the order is stable. Stars are the SHOWN stars (the whale-bait lie holds here too).
 */
export function boardHeroes(
  state: GameState,
  sort: SortKey,
  filter: BoardFilter,
  opts: { flip?: boolean } = {},
): OwnedHero[] {
  const ml = state.meta.masterLevel
  const q = fold(filter.query.trim())
  const list = (Object.values(state.heroes) as OwnedHero[]).filter((h) => {
    if (!h.alive) return false
    if (q && !fold(h.name).includes(q)) return false
    if (filter.element !== 'all' && h.element !== filter.element) return false
    if (filter.heroClass !== 'all' && (h.heroClass ?? 'none') !== filter.heroClass) return false
    if (filter.minStar > 0 && shownStar(h, ml) < filter.minStar) return false
    if (filter.hideUnavailable && !deployable(h, state)) return false
    return true
  })
  const cp = new Map(list.map((h) => [h.id, heroCp(h, state)]))
  const key = (h: OwnedHero): number | string => {
    switch (sort) {
      case 'cp':
        return -cp.get(h.id)!
      case 'level':
        return -h.xp.level
      case 'stars':
        return -shownStar(h, ml)
      case 'name':
        return fold(h.name)
      case 'element':
        return ELEMENT_ORDER.indexOf(h.element)
      case 'class':
        return CLASS_ORDER.indexOf(h.heroClass)
    }
  }
  const sign = opts.flip ? -1 : 1
  return list.sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (ka !== kb) return (ka < kb ? -1 : 1) * sign
    const d = cp.get(b.id)! - cp.get(a.id)!
    if (d !== 0) return d
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export type Draft = (HeroId | null)[]

/**
 * Put a hero into slot `to`. If they already stand in another slot, the two swap
 * (drag between slots); otherwise whoever held `to` steps off the board.
 */
export function placeHero(draft: Draft, id: HeroId, to: number): Draft {
  if (to < 0 || to >= draft.length) return draft
  const next = [...draft]
  const from = next.indexOf(id)
  if (from === to) return draft
  if (from !== -1) next[from] = next[to] ?? null
  next[to] = id
  return next
}

/** Swap two slots (either may be empty). */
export function swapSlots(draft: Draft, a: number, b: number): Draft {
  if (a === b || a < 0 || b < 0 || a >= draft.length || b >= draft.length) return draft
  const next = [...draft]
  ;[next[a], next[b]] = [next[b] ?? null, next[a] ?? null]
  return next
}

/** Click-to-add: the first empty slot. Returns the draft unchanged when full or already in. */
export function addHero(draft: Draft, id: HeroId): Draft {
  if (draft.includes(id)) return draft
  const i = draft.indexOf(null)
  if (i === -1) return draft
  const next = [...draft]
  next[i] = id
  return next
}

export function removeAt(draft: Draft, i: number): Draft {
  if (draft[i] === null || draft[i] === undefined) return draft
  const next = [...draft]
  next[i] = null
  return next
}

export interface LineSummary {
  line: Line
  slots: number[]
  count: number
  cp: number
}

/** Per-line headcount and CP (only living heroes count), in front → mid → back order. */
export function lineSummary(state: GameState, draft: Draft, lines: Line[]): LineSummary[] {
  const order: Line[] = ['front', 'mid', 'back']
  return order
    .map((line) => {
      const slots = lines.flatMap((l, i) => (l === line ? [i] : []))
      let count = 0
      let cp = 0
      for (const i of slots) {
        const h = draft[i] ? state.heroes[draft[i]!] : undefined
        if (h && h.alive) {
          count++
          cp += heroCp(h, state)
        }
      }
      return { line, slots, count, cp }
    })
    .filter((s) => s.slots.length > 0)
}

/** A draft slot pointing at a hero who has since died (or left) reads as empty. */
export function cleanDraft(state: GameState, draft: Draft): Draft {
  return draft.map((id) => (id && state.heroes[id]?.alive ? id : null))
}

export function shownStarOf(h: OwnedHero, state: GameState): Star {
  return shownStar(h, state.meta.masterLevel) as Star
}
