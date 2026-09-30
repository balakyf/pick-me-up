import { describe, it, expect } from 'vitest'
import { intervene, interventionRefusal, nextUnrevealedHidden, interventionCost } from './intervention'
import { createAccount } from '../account'
import { summon } from '../gacha'
import { buildCombatUnit } from '../unit'
import { SKILLS } from '../content'
import type { GameState, HeroId } from '../types'

function devoted(ip = 10): { state: GameState; id: HeroId } {
  const acct = createAccount(4)
  const id = Object.keys(acct.heroes)[0] as HeroId
  return { id, state: { ...acct, heroes: { [id]: { ...acct.heroes[id]!, favor: 70, bondTier: 3, ip } } } }
}

describe('Intervention Points', () => {
  it('only a Devoted hero with enough IP will intervene', () => {
    const { state, id } = devoted(0)
    expect(interventionRefusal(state, id, 'peek')).toMatch(/Intervention Points/)
    const neutral = { ...state, heroes: { [id]: { ...state.heroes[id]!, favor: 35, ip: 10 } } }
    expect(interventionRefusal(neutral, id, 'peek')).toMatch(/Devoted/)
  })

  it('reveal marks the next hidden objective; peek marks the current floor', () => {
    const { state, id } = devoted()
    const target = nextUnrevealedHidden(state)!
    const r = intervene(state, id, 'reveal')
    expect(r.meta.revealedHidden).toEqual([target])
    expect(r.heroes[id]!.ip).toBe(10 - interventionCost('reveal'))
    expect(nextUnrevealedHidden(r)).not.toBe(target)
    const p = intervene(state, id, 'peek')
    expect(p.meta.peekedFloors).toEqual([state.tower.currentFloor])
    expect(() => intervene(p, id, 'peek')).toThrow(/already/)
  })

  it('nudge makes the next Normal summon roll twice (and is spent)', () => {
    const { state, id } = devoted()
    const nudged = intervene({ ...state, gold: 3000 }, id, 'nudge')
    expect(nudged.meta.nudge).toBe(true)
    const after = summon(nudged)
    expect(after.state.meta.nudge).toBe(false)
    // Across many seeds a nudged pull is never worse than the plain one.
    for (let seed = 1; seed <= 40; seed++) {
      const acct = { ...createAccount(seed), gold: 3000 }
      const plain = summon(acct).hero.star
      const boosted = summon({ ...acct, meta: { ...acct.meta, nudge: true } }).hero.star
      expect(boosted).toBeGreaterThanOrEqual(plain)
    }
  })

  it('guarantee blesses the hero with a first-strike opener', () => {
    const { state, id } = devoted()
    const g = intervene(state, id, 'guarantee')
    expect(g.heroes[id]!.blessed).toBe(true)
    expect(buildCombatUnit(g.heroes[id]!, 'front', SKILLS).keywords).toContainEqual({ kind: 'opener', multiplier: 2 })
  })

  it('no intervention can touch the dead', () => {
    const { state, id } = devoted()
    const dead = { ...state, heroes: { [id]: { ...state.heroes[id]!, alive: false } } }
    for (const a of ['reveal', 'peek', 'nudge', 'guarantee'] as const) expect(interventionRefusal(dead, id, a)).toMatch(/living/)
  })
})
