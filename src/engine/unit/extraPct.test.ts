/**
 * WP0 contract (spec 2026-10-12 §4.1): `buildCombatUnit(..., extraPct)` merges an extra
 * relative stat bonus into the unit's percentage map; the default `{}` is byte-identical.
 */
import { describe, it, expect } from 'vitest'
import { buildCombatUnit } from './unit'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { SKILLS } from '../content'
import { TUNING } from '../tuning'
import type { Line, OwnedHero } from '../types'

function roster(seed: number): OwnedHero[] {
  const s = createAccount(seed, { now: 0 })
  const pulled = summonMany({ ...s, gold: TUNING.gacha.normalCostGold * 10 }, 'normal', 8).state
  return Object.values(pulled.heroes) as OwnedHero[]
}

describe('buildCombatUnit — extraPct', () => {
  it('an empty (or omitted) extraPct gives the identical unit', () => {
    for (const seed of [1, 7, 42, 123]) {
      for (const h of roster(seed)) {
        for (const line of ['front', 'mid', 'back'] as Line[]) {
          const plain = buildCombatUnit(h, line, SKILLS, [])
          expect(buildCombatUnit(h, line, SKILLS, [], {})).toEqual(plain)
          expect(JSON.stringify(buildCombatUnit(h, line, SKILLS, [], {}))).toBe(JSON.stringify(plain))
        }
      }
    }
  })

  it('a non-empty extraPct lifts exactly the stats it names', () => {
    const h = roster(7)[0]!
    const plain = buildCombatUnit(h, 'front', SKILLS, [])
    const boosted = buildCombatUnit(h, 'front', SKILLS, [], { pAtk: 0.5, maxHP: 0.5 })
    expect(boosted.stats.pAtk).toBeGreaterThan(plain.stats.pAtk)
    expect(boosted.stats.maxHP).toBeGreaterThan(plain.stats.maxHP)
    expect(boosted.stats.spd).toBe(plain.stats.spd)
    expect(boosted.stats.mDef).toBe(plain.stats.mDef)
  })
})
