/** WP0 contract (spec 2026-10-12 S24): consumeRested spends one charge on a clear's gold. */
import { describe, it, expect } from 'vitest'
import { consumeRested, accrueRested } from './rested'
import { createAccount } from '../account'
import { TUNING } from '../tuning'
import type { MetaState } from '../types'

function meta(charges: number, carryWorld = 0): MetaState {
  return { ...createAccount(1).meta, rested: { charges, carryWorld } }
}

describe('consumeRested', () => {
  it('with a charge: bonus = gold × (goldMult − 1), one charge spent, carry kept', () => {
    const m = meta(3, 1234)
    const r = consumeRested(m, 1000)
    expect(r.bonus).toBe(Math.round(1000 * (TUNING.return.rested.goldMult - 1)))
    expect(r.bonus).toBe(1000)
    expect(r.meta.rested).toEqual({ charges: 2, carryWorld: 1234 })
    expect(m.rested).toEqual({ charges: 3, carryWorld: 1234 }) // pure
    expect({ ...r.meta, rested: m.rested }).toEqual(m)
  })

  it('rounds the bonus', () => {
    expect(consumeRested(meta(1), 333).bonus).toBe(Math.round(333 * (TUNING.return.rested.goldMult - 1)))
  })

  it('no charge, or no gold: no bonus and nothing spent', () => {
    const none = meta(0)
    expect(consumeRested(none, 1000)).toEqual({ meta: none, bonus: 0 })
    const some = meta(2)
    expect(consumeRested(some, 0)).toEqual({ meta: some, bonus: 0 })
    expect(consumeRested(some, 0).meta.rested.charges).toBe(2)
  })

  it('doubles gold exactly once per charge', () => {
    let m = meta(2)
    const bonuses: number[] = []
    for (let i = 0; i < 4; i++) {
      const r = consumeRested(m, 500)
      bonuses.push(r.bonus)
      m = r.meta
    }
    expect(bonuses).toEqual([500, 500, 0, 0])
    expect(m.rested.charges).toBe(0)
  })

  it('accrueRested is an identity stub for now', () => {
    const m = meta(1)
    expect(accrueRested(m, 10 * 3_600_000)).toBe(m)
  })
})
