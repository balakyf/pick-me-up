/** Pent-up Interference accrual (spec 2026-10-12 S24): absence gives instead of taking. */
import { describe, it, expect } from 'vitest'
import { accrueRested, consumeRested, nextRestedChargeIn, restedChargeWorld } from './rested'
import { createAccount } from '../account'
import { advanceTime, toWorldTime } from '../time'
import { reduce } from '../store'
import { TUNING } from '../tuning'
import type { GameState, MetaState } from '../types'

const RS = TUNING.return.rested
const REAL_HOUR = 3_600_000
const realHours = (h: number) => toWorldTime(h * REAL_HOUR)
const T0 = Date.UTC(2026, 9, 1)

function meta(charges = 0, carryWorld = 0): MetaState {
  return { ...createAccount(1).meta, rested: { charges, carryWorld } }
}

/** An account last seen at a real clock time (not the epoch). */
function seenAt(realMs: number, seed = 3): GameState {
  return createAccount(seed, { now: realMs })
}

describe('accrueRested', () => {
  it('a 24 h real gap gives 3 charges', () => {
    expect(restedChargeWorld()).toBe(realHours(RS.perRealHours))
    expect(accrueRested(meta(), realHours(24)).rested).toEqual({ charges: 3, carryWorld: 0 })
  })

  it('caps at maxCharges and drops the carry at the cap', () => {
    expect(accrueRested(meta(), realHours(24 * 30)).rested).toEqual({ charges: RS.maxCharges, carryWorld: 0 })
    expect(accrueRested(meta(5, 1234), realHours(RS.perRealHours * 3)).rested).toEqual({ charges: RS.maxCharges, carryWorld: 0 })
    const full = meta(RS.maxCharges, 0)
    expect(accrueRested(full, realHours(50))).toBe(full)
  })

  it('short gaps add up through the carry', () => {
    let m = meta()
    for (let i = 0; i < 16; i++) m = accrueRested(m, realHours(0.5))
    expect(m.rested).toEqual({ charges: 1, carryWorld: 0 })
    m = accrueRested(m, realHours(3))
    expect(m.rested).toEqual({ charges: 1, carryWorld: realHours(3) })
    expect(nextRestedChargeIn(m)).toBe(realHours(RS.perRealHours - 3))
    expect(nextRestedChargeIn(meta(RS.maxCharges))).toBeNull()
  })

  it('is pure and ignores empty or backwards gaps', () => {
    const m = meta(1, 10)
    const frozen = JSON.parse(JSON.stringify(m))
    accrueRested(m, realHours(9))
    expect(m).toEqual(frozen)
    expect(accrueRested(m, 0)).toBe(m)
    expect(accrueRested(m, -5)).toBe(m)
  })
})

describe('advanceTime builds charges from the gap', () => {
  it('24 real hours away → 3 charges; a clear spends exactly one and doubles its gold', () => {
    const back = advanceTime(seenAt(T0), toWorldTime(T0 + 24 * REAL_HOUR))
    expect(back.meta.rested.charges).toBe(3)
    const r = consumeRested(back.meta, 400)
    expect(r.bonus).toBe(400)
    expect(r.meta.rested.charges).toBe(2)
  })

  it('a week away is capped at maxCharges', () => {
    const back = advanceTime(seenAt(T0), toWorldTime(T0 + 7 * 24 * REAL_HOUR))
    expect(back.meta.rested.charges).toBe(RS.maxCharges)
  })

  it('an account never seen on a real clock (lastSeenAtWorld 0) gets nothing for the epoch gap', () => {
    const s = createAccount(4, { now: 0 })
    expect(advanceTime(s, toWorldTime(T0)).meta.rested).toEqual({ charges: 0, carryWorld: 0 })
  })

  it('is deterministic through the reducer', () => {
    const s = seenAt(T0, 9)
    const a = reduce(s, { type: 'TICK' }, toWorldTime(T0 + 17 * REAL_HOUR))
    const b = reduce(s, { type: 'TICK' }, toWorldTime(T0 + 17 * REAL_HOUR))
    expect(a).toEqual(b)
    expect(a.meta.rested).toEqual({ charges: 2, carryWorld: realHours(1) })
  })
})
