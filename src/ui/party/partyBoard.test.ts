import { describe, it, expect } from 'vitest'
import { reduce } from '../../engine/store'
import { heroCp } from '../../engine/scout'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import {
  NO_FILTER,
  addHero,
  boardHeroes,
  cleanDraft,
  heroStatus,
  lineSummary,
  placeHero,
  removeAt,
  swapSlots,
  type Draft,
} from './partyBoard'

/** A fresh account after the free tutorial ten-pull: eleven heroes to sort. */
function account(): GameState {
  const s = reduce(null, { type: 'NEW_ACCOUNT', seed: 31337, now: 0 })
  return reduce(s, { type: 'SUMMON', pool: 'normal', count: 10 })
}

function patch(s: GameState, id: HeroId, p: Partial<OwnedHero>): GameState {
  return { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, ...p } } }
}

const A = 'h_a' as HeroId
const B = 'h_b' as HeroId
const C = 'h_c' as HeroId

describe('heroStatus', () => {
  it('reads captivity, expeditions, promotions, drills and Sanity in that order', () => {
    const s = account()
    const h = Object.values(s.heroes)[0]!
    expect(heroStatus({ ...h, sanity: 100 })).toBe('ready')
    expect(heroStatus({ ...h, sanity: 20 })).toBe('weary')
    expect(heroStatus({ ...h, sanity: 0 })).toBe('broken')
    expect(heroStatus({ ...h, training: {} as OwnedHero['training'] })).toBe('training')
    expect(heroStatus({ ...h, promotion: { completesAtWorld: 9 } })).toBe('promoting')
    expect(heroStatus({ ...h, expedition: { completesAtWorld: 9 } })).toBe('away')
    expect(heroStatus({ ...h, captiveOf: {} as OwnedHero['captiveOf'], expedition: { completesAtWorld: 9 } })).toBe('captive')
  })
})

describe('boardHeroes', () => {
  it('lists the living, strongest first by default, with a stable tiebreak', () => {
    const s = account()
    const list = boardHeroes(s, 'cp', NO_FILTER)
    expect(list.length).toBe(Object.keys(s.heroes).length)
    const cps = list.map(heroCp)
    expect(cps).toEqual([...cps].sort((a, b) => b - a))
    const weakest = boardHeroes(s, 'cp', NO_FILTER, { flip: true }).map(heroCp)
    expect(weakest).toEqual([...cps].sort((a, b) => a - b))
    // Same inputs, same order.
    expect(boardHeroes(s, 'cp', NO_FILTER).map((h) => h.id)).toEqual(list.map((h) => h.id))
  })

  it('sorts names A→Z (accent-folded) and flips on request', () => {
    const s = account()
    const names = boardHeroes(s, 'name', NO_FILTER).map((h) => h.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())
    expect(names).toEqual([...names].sort())
    const flipped = boardHeroes(s, 'name', NO_FILTER, { flip: true }).map((h) => h.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())
    expect(flipped).toEqual([...names].sort().reverse())
  })

  it('hides the fallen and filters by name, element, class, stars and availability', () => {
    let s = account()
    const all = boardHeroes(s, 'cp', NO_FILTER)
    const [first, second] = all
    s = patch(s, first!.id, { alive: false })
    s = patch(s, second!.id, { training: {} as OwnedHero['training'] })
    expect(boardHeroes(s, 'cp', NO_FILTER).map((h) => h.id)).not.toContain(first!.id)
    expect(boardHeroes(s, 'cp', { ...NO_FILTER, hideUnavailable: true }).map((h) => h.id)).not.toContain(second!.id)

    const target = all[3]!
    const q = target.name.slice(1, 4).toUpperCase()
    expect(boardHeroes(s, 'cp', { ...NO_FILTER, query: q }).map((h) => h.id)).toContain(target.id)

    const byEl = boardHeroes(s, 'cp', { ...NO_FILTER, element: target.element })
    expect(byEl.length).toBeGreaterThan(0)
    expect(byEl.every((h) => h.element === target.element)).toBe(true)

    const cls = target.heroClass ?? 'none'
    expect(boardHeroes(s, 'cp', { ...NO_FILTER, heroClass: cls }).every((h) => (h.heroClass ?? 'none') === cls)).toBe(true)

    expect(boardHeroes(s, 'cp', { ...NO_FILTER, minStar: 3 }).every((h) => h.star >= 3)).toBe(true)
    expect(boardHeroes(s, 'cp', { ...NO_FILTER, minStar: 7 })).toEqual([])
  })
})

describe('slot moves', () => {
  const draft: Draft = [A, null, B, null, null]

  it('addHero fills the first empty slot, once', () => {
    expect(addHero(draft, C)).toEqual([A, C, B, null, null])
    expect(addHero(draft, A)).toBe(draft)
    expect(addHero([A, B, C, A, B], 'h_z' as HeroId)).toEqual([A, B, C, A, B])
  })

  it('placeHero drops onto a slot, replacing whoever stood there', () => {
    expect(placeHero(draft, C, 0)).toEqual([C, null, B, null, null])
    expect(placeHero(draft, C, 4)).toEqual([A, null, B, null, C])
  })

  it('placeHero from another slot swaps the two', () => {
    expect(placeHero(draft, A, 2)).toEqual([B, null, A, null, null])
    expect(placeHero(draft, A, 3)).toEqual([null, null, B, A, null])
    expect(placeHero(draft, A, 0)).toBe(draft)
    expect(placeHero(draft, A, 9)).toBe(draft)
  })

  it('swapSlots and removeAt', () => {
    expect(swapSlots(draft, 0, 4)).toEqual([null, null, B, null, A])
    expect(swapSlots(draft, 1, 1)).toBe(draft)
    expect(removeAt(draft, 2)).toEqual([A, null, null, null, null])
    expect(removeAt(draft, 1)).toBe(draft)
  })
})

describe('lineSummary / cleanDraft', () => {
  it('counts living heroes and CP per line', () => {
    const s = account()
    const ids = boardHeroes(s, 'cp', NO_FILTER).map((h) => h.id)
    const d: Draft = [ids[0]!, null, ids[1]!, ids[2]!, ids[3]!]
    const sum = lineSummary(s, d, ['front', 'front', 'mid', 'back', 'back'])
    expect(sum.map((l) => [l.line, l.count])).toEqual([
      ['front', 1],
      ['mid', 1],
      ['back', 2],
    ])
    expect(sum[2]!.cp).toBe(heroCp(s.heroes[ids[2]!]!) + heroCp(s.heroes[ids[3]!]!))

    const dead = patch(s, ids[0]!, { alive: false })
    expect(lineSummary(dead, d, ['front', 'front', 'mid', 'back', 'back'])[0]!.count).toBe(0)
    expect(cleanDraft(dead, d)).toEqual([null, null, ids[1]!, ids[2]!, ids[3]!])
  })
})
