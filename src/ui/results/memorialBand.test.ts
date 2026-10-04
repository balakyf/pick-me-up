import { describe, expect, it } from 'vitest'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import { attemptFloorWithResult } from '../../engine/store'
import { relationKey } from '../../engine/life'
import type { FloorResult, GameState, HeroId } from '../../engine/types'
import { lastWords, lastWordsTogether } from '../life/speech'
import { fallenInOrder, iselClose, iselFor, memorialBands, nameList, resultMood } from './memorialBand'
import { EULOGY_CLOSE } from '../story/eulogy'

/** A fresh party of five sent to a floor far above it: some fall. A friend waits at home. */
function lostBattle(): { pre: GameState; state: GameState; result: FloorResult; friend: HeroId } {
  let s = { ...createAccount(4242, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  const ids = Object.keys(s.heroes) as HeroId[]
  const party = ids.slice(0, 5)
  const friend = ids[6]!
  // Everyone in the party is close to the friend who stayed home.
  const relations = { ...s.life.relations }
  for (const id of party) relations[relationKey(id, friend)] = { affinity: 70, shared: 3 }
  s = {
    ...s,
    life: { ...s.life, relations },
    party: { slots: party, lines: ['front', 'front', 'mid', 'back', 'back'] },
    tower: { ...s.tower, currentFloor: 24, highestCleared: 23 },
  }
  const r = attemptFloorWithResult(s)
  return { pre: s, state: r.state, result: r.result, friend }
}

describe('memorialBands', () => {
  const { state, result, friend } = lostBattle()

  it('the scenario loses heroes (and the grave rows exist)', () => {
    expect(result.fallenHeroIds.length).toBeGreaterThan(0)
    for (const id of result.fallenHeroIds) expect(state.life.memorial.some((g) => g.heroId === id)).toBe(true)
  })

  it('one band per fallen hero, in the order they fell, with the grave’s numbers', () => {
    const bands = memorialBands(state, result)
    expect(bands.map((b) => b.heroId).sort()).toEqual([...result.fallenHeroIds].sort())
    const deathOrder = result.result.log.events.flatMap((e) => (e.kind === 'death' && result.fallenHeroIds.includes(e.unitId as HeroId) ? [e.unitId] : []))
    expect(bands.map((b) => b.heroId)).toEqual(deathOrder)
    for (const b of bands) {
      const grave = state.life.memorial.find((g) => g.heroId === b.heroId)!
      expect(b.name).toBe(grave.name)
      expect(b.floorsClimbed).toBe(Math.max(grave.bestFloor, grave.floor))
      expect(b.daysServed).toBe(grave.daysServed)
      expect(b.look.id).toBe(b.heroId)
    }
  })

  it('the last words are the battle’s and the Memorial’s (one source, never shared in a row)', () => {
    const bands = memorialBands(state, result)
    const battle = lastWordsTogether(state, fallenInOrder(result.result.log, result.fallenHeroIds))
    for (const b of bands) {
      expect(b.lastWords).toBe(battle.get(b.heroId))
      // The Memorial's own call (no `taken`) agrees through the grave row.
      expect(b.lastWords).toBe(lastWords(state, { heroId: b.heroId as HeroId, name: b.name }))
    }
    if (bands.length > 1) expect(new Set(bands.map((b) => b.lastWords)).size).toBe(bands.length)
  })

  it('names who mourns them (the friend at home), and Isel speaks of it', () => {
    const bands = memorialBands(state, result)
    const friendName = state.heroes[friend]!.name.split(' ')[0]!
    for (const b of bands) {
      expect(b.mourners).toContain(friendName)
      expect(b.isel).toContain(friendName)
      expect(b.isel.length).toBeGreaterThan(10)
    }
  })

  it('Isel never repeats herself over one battle’s dead (a whole party fits in her lines)', () => {
    const bands = memorialBands(state, result)
    expect(new Set(bands.map((b) => b.isel)).size).toBe(bands.length)
    const taken = new Set<string>()
    const five = ['A', 'B', 'C', 'D', 'E'].map((n) => iselFor(n, { heroId: 'same' as HeroId, bestFloor: 9, floor: 9, daysServed: 3 }, ['Zed'], taken))
    expect(new Set(five.map((l) => l.replace(/\b[A-E]\b/, '·'))).size).toBe(5)
  })

  it('no fallen, no band', () => {
    expect(memorialBands(state, { ...result, fallenHeroIds: [] })).toEqual([])
  })
})

describe('the mood and Isel', () => {
  const base = { fallenHeroIds: [] as HeroId[], result: { outcome: 'win' } } as unknown as FloorResult
  const r = (cleared: boolean, fell: number, outcome: string) => ({ ...base, cleared, fallenHeroIds: Array.from({ length: fell }, (_, i) => `h${i}` as HeroId), result: { outcome } }) as unknown as FloorResult
  it('reads a clear, an anchor triumph, a bittersweet victory, a mourning defeat, a retreat', () => {
    expect(resultMood(r(true, 0, 'win'))).toBe('cleared')
    expect(resultMood(r(true, 0, 'win'), true)).toBe('triumph')
    expect(resultMood(r(true, 1, 'win'), true)).toBe('bittersweet')
    expect(resultMood(r(false, 2, 'wipe'))).toBe('mourning')
    expect(resultMood(r(false, 0, 'retreat'))).toBe('retreat')
    expect(resultMood(r(false, 0, 'failed'))).toBe('failed')
    expect(resultMood(r(false, 0, 'wipe'))).toBe('defeat')
  })

  it('Isel: mourners named, a newcomer remembered, a stranger not forgotten; the same words each time', () => {
    const grave = { heroId: 'h1' as HeroId, bestFloor: 12, floor: 12, daysServed: 4 }
    const mourned = iselFor('Ana', grave, ['Bo', 'Cy'])
    expect(mourned).toContain('Bo and Cy')
    expect(mourned).toContain('Ana')
    expect(iselFor('Ana', grave, ['Bo', 'Cy'])).toBe(mourned)
    // (A grave without an identity: lane M's eulogy speaks the name, then the closing line.)
    expect(iselFor('Ana', { ...grave, daysServed: 0 }, [])).toBe(`Ana. ${EULOGY_CLOSE.brief[0]}`)
    const alone = iselFor('Ana', grave, [])
    expect(EULOGY_CLOSE.alone.map((l) => `Ana. ${l.replace('{floor}', '12')}`)).toContain(alone)
  })

  it('closes the band only when someone fell, in the mood’s words', () => {
    expect(iselClose('cleared', [])).toBeNull()
    expect(iselClose('bittersweet', ['a'])).toMatch(/paid|lightly/)
    expect(iselClose('mourning', ['a'])).toMatch(/home|fire/)
  })

  it('lists names in plain English', () => {
    expect(nameList([])).toBe('')
    expect(nameList(['Ana'])).toBe('Ana')
    expect(nameList(['Ana', 'Bo'])).toBe('Ana and Bo')
    expect(nameList(['Ana', 'Bo', 'Cy'])).toBe('Ana, Bo and Cy')
  })
})
