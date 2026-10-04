/**
 * The pickers' refusals match what the engine refuses (review of lane N).
 */
import { describe, it, expect } from 'vitest'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import { busyRefusal, sacrificeRefusal, stationRefusal } from './refusals'

function roster(): { s: GameState; h: OwnedHero } {
  let s: GameState = { ...createAccount(7, { now: 0 }), gold: 10_000_000 }
  s = summonMany(s, 'normal', 3).state
  const id = (Object.keys(s.heroes) as HeroId[])[0]!
  return { s, h: s.heroes[id]! }
}

describe('facility refusals', () => {
  it('a hero mid-drill is no sacrifice and no survivor', () => {
    const { s, h } = roster()
    const drilling = { ...h, training: { drill: 'x' } } as unknown as OwnedHero
    expect(sacrificeRefusal(s, drilling, null)).toBe('In the middle of a drill.')
    expect(busyRefusal(s, drilling)).toBe('In the middle of a drill.')
  })

  it('a hero in the Promotion Chamber cannot be the survivor', () => {
    const { s, h } = roster()
    expect(busyRefusal(s, { ...h, promotion: { until: 1 } } as unknown as OwnedHero)).toBe('In the Promotion Chamber.')
  })

  it('the Transfer Station takes a free hero and refuses the busy and the fallen', () => {
    const { s, h } = roster()
    expect(stationRefusal(s, h)).toBeNull()
    expect(stationRefusal(s, { ...h, training: { drill: 'x' } } as unknown as OwnedHero)).toBe('In the middle of a drill.')
    expect(stationRefusal(s, { ...h, alive: false })).toBe('Has fallen.')
  })
})
