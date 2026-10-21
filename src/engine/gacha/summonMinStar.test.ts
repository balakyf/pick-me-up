/**
 * WP0 contract (spec 2026-10-12 §4.1): `summon(state, { minStar })` lifts the SAME star
 * draw the way pity does — no extra draws — and the no-opts path is unchanged.
 */
import { describe, it, expect } from 'vitest'
import { summon } from './gacha'
import { createAccount } from '../account'
import { TUNING } from '../tuning'
import type { GameState, Star } from '../types'

function funded(seed: number, pity = 0): GameState {
  const s = createAccount(seed, { now: 0 })
  return { ...s, gold: TUNING.gacha.normalCostGold * 20, gacha: { ...s.gacha, pity } }
}

describe('summon — minStar', () => {
  it('no opts, empty opts and a no-op minStar are identical', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = funded(seed)
      const plain = summon(s)
      expect(summon(s, {})).toEqual(plain)
      expect(summon(s, undefined)).toEqual(plain)
      expect(summon(s, { minStar: 1 })).toEqual(plain)
      expect(JSON.stringify(summon(s, {}))).toBe(JSON.stringify(plain))
    }
  })

  it('minStar holds over many seeds and never takes an extra draw', () => {
    for (const min of [2, 3] as Star[]) {
      for (let seed = 1; seed <= 200; seed++) {
        const s = funded(seed)
        const plain = summon(s)
        const lifted = summon(s, { minStar: min })
        expect(lifted.hero.star).toBeGreaterThanOrEqual(min)
        // Same stream position afterwards: one pull, one draw.
        expect(lifted.state.gacha.pullCount).toBe(plain.state.gacha.pullCount)
        // When the natural draw already meets minStar, nothing changes at all.
        if (plain.hero.star >= min) expect(lifted).toEqual(plain)
        // Same price as a normal pull.
        expect(lifted.state.gold).toBe(plain.state.gold)
      }
    }
  })

  it('a pull lifted to 3★ pays out pity, exactly as a natural 3★ does', () => {
    let seen = 0
    for (let seed = 1; seed <= 200 && seen < 5; seed++) {
      const s = funded(seed, 4)
      if (summon(s).hero.star >= 3) continue
      seen++
      const lifted = summon(s, { minStar: 3 })
      expect(lifted.hero.star).toBe(3)
      expect(lifted.state.gacha.pity).toBe(0)
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('is pure and deterministic', () => {
    const s = funded(77)
    const snapshot = JSON.stringify(s)
    const a = summon(s, { minStar: 3 })
    const b = summon(s, { minStar: 3 })
    expect(a).toEqual(b)
    expect(JSON.stringify(s)).toBe(snapshot)
  })
})
