import { describe, it, expect } from 'vitest'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import { heroCp } from '../../engine/scout'
import { moraleOf } from '../../engine/life/morale'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import { PICK_ALL, filtered, fold, pickHeroes, sortHeroes } from './heroPicker'

function roster(): GameState {
  let s: GameState = { ...createAccount(11, { now: 0 }), gold: 10_000_000 }
  s = summonMany(s, 'normal', 10).state
  s = summonMany(s, 'normal', 10).state
  return s
}
const all = (s: GameState) => Object.values(s.heroes) as OwnedHero[]
function patch(s: GameState, id: HeroId, p: Partial<OwnedHero>): GameState {
  return { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, ...p } } }
}

describe('the shared picker: sort', () => {
  const s = roster()

  it('sorts by true CP, strongest first, and flips', () => {
    const list = sortHeroes(s, all(s), 'cp')
    for (let i = 1; i < list.length; i++) expect(heroCp(list[i - 1]!, s)).toBeGreaterThanOrEqual(heroCp(list[i]!, s))
    // Flipped: the weakest first.
    expect(sortHeroes(s, all(s), 'cp', true)[0]!.id).toBe(list[list.length - 1]!.id)
  })

  it('sorts by stars and level high → low', () => {
    const st = sortHeroes(s, all(s), 'stars')
    for (let i = 1; i < st.length; i++) expect(st[i - 1]!.star).toBeGreaterThanOrEqual(st[i]!.star)
    const ids = all(s).map((h) => h.id)
    let t = patch(s, ids[3]!, { xp: { ...s.heroes[ids[3]!]!.xp, level: 40 } })
    t = patch(t, ids[5]!, { xp: { ...s.heroes[ids[5]!]!.xp, level: 30 } })
    const lv = sortHeroes(t, all(t), 'level')
    expect(lv.slice(0, 2).map((h) => h.id)).toEqual([ids[3], ids[5]])
  })

  it('sorts by morale, highest first, the fallen last', () => {
    const ids = all(s).map((h) => h.id)
    const t = patch(s, ids[0]!, { alive: false })
    const list = sortHeroes(t, all(t), 'morale')
    expect(list[list.length - 1]!.id).toBe(ids[0])
    const living = list.filter((h) => h.alive)
    for (let i = 1; i < living.length; i++) expect(moraleOf(t, living[i - 1]!.id).score).toBeGreaterThanOrEqual(moraleOf(t, living[i]!.id).score)
  })

  it('sorts by class in the usual order, the classless last; ties go by CP then id (stable)', () => {
    const list = sortHeroes(s, all(s), 'class')
    const order = ['warrior', 'spearman', 'thief', 'archer', 'mage', null]
    for (let i = 1; i < list.length; i++) expect(order.indexOf(list[i - 1]!.heroClass)).toBeLessThanOrEqual(order.indexOf(list[i]!.heroClass))
    expect(sortHeroes(s, all(s), 'class').map((h) => h.id)).toEqual(list.map((h) => h.id))
  })
})

describe('the shared picker: filter', () => {
  const s = roster()
  const ids = all(s).map((h) => h.id)

  it('searches by name, folding accents and case', () => {
    const t = patch(s, ids[2]!, { name: 'Élodie Brax' })
    expect(fold('Élodie')).toBe('elodie')
    expect(pickHeroes(t, { sort: 'name', filter: { ...PICK_ALL, query: 'ELOD' } }).map((h) => h.id)).toEqual([ids[2]])
  })

  it('filters by class and element', () => {
    const h = s.heroes[ids[0]!]!
    const byEl = pickHeroes(s, { sort: 'cp', filter: { ...PICK_ALL, element: h.element } })
    expect(byEl.length).toBeGreaterThan(0)
    expect(byEl.every((x) => x.element === h.element)).toBe(true)
    const cls = h.heroClass ?? 'none'
    const byCls = pickHeroes(s, { sort: 'cp', filter: { ...PICK_ALL, heroClass: cls } })
    expect(byCls.every((x) => (x.heroClass ?? 'none') === cls)).toBe(true)
  })

  it('"available" asks the place: only the heroes it can take', () => {
    const busy = new Set([ids[0], ids[1]])
    const list = pickHeroes(s, { sort: 'cp', filter: { ...PICK_ALL, availableOnly: true }, available: (h) => !busy.has(h.id) })
    expect(list.some((h) => busy.has(h.id))).toBe(false)
    expect(list.length).toBe(all(s).filter((h) => h.alive).length - 2)
    // Without the switch, everyone is listed (the facility greys out who it refuses).
    expect(pickHeroes(s, { sort: 'cp', filter: PICK_ALL, available: (h) => !busy.has(h.id) }).length).toBe(all(s).length)
  })

  it('lists the living by default; the fallen or everyone on request', () => {
    const t = patch(s, ids[4]!, { alive: false })
    expect(pickHeroes(t, { sort: 'cp', filter: PICK_ALL }).some((h) => h.id === ids[4])).toBe(false)
    expect(pickHeroes(t, { sort: 'cp', filter: { ...PICK_ALL, alive: 'fallen' } }).map((h) => h.id)).toEqual([ids[4]])
    expect(pickHeroes(t, { sort: 'cp', filter: { ...PICK_ALL, alive: 'all' } }).length).toBe(all(t).length)
  })

  it('a pool narrows the candidates (a facility lists only its own)', () => {
    const pool = all(s).slice(0, 3)
    expect(pickHeroes(s, { sort: 'cp', filter: PICK_ALL, pool }).length).toBe(3)
  })

  it('knows when a filter is set', () => {
    expect(filtered(PICK_ALL)).toBe(false)
    expect(filtered({ ...PICK_ALL, query: 'a' })).toBe(true)
    expect(filtered({ ...PICK_ALL, availableOnly: true }, { ...PICK_ALL, availableOnly: true })).toBe(false)
  })
})
