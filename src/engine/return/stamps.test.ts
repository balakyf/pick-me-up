/** The login stamp card (spec 2026-10-12 S28): one stamp per real day, never resets. */
import { describe, it, expect } from 'vitest'
import { realDayIndex, stampCard, stampOnLogin, stampReady } from './stamps'
import { claimLogin, loginClaimed } from '../shop'
import { createAccount } from '../account'
import { reduce } from '../store'
import { toWorldTime } from '../time'
import { TUNING } from '../tuning'
import type { GameState } from '../types'

const ST = TUNING.return.stamps
const REAL_DAY = 24 * 3_600_000
const WORLD_DAY = 24 * 3_600_000
/** World time at real day `d` (plus `h` real hours). */
const at = (d: number, h = 0) => toWorldTime(d * REAL_DAY + h * 3_600_000)

function lifetimeCount(s: GameState): number {
  return s.meta.stamps.count
}

describe('the stamp card', () => {
  it('starts pre-stamped (endowed progress)', () => {
    const s = createAccount(1)
    expect(s.meta.stamps).toEqual({ count: ST.endowed, lastRealDay: -1 })
    expect(stampCard(s)).toMatchObject({ onCard: ST.endowed, perCard: ST.perCard, toNext: ST.perCard - ST.endowed, cardsDone: 0 })
  })

  it('a claim on a new real day adds one stamp; a second claim the same real day adds none', () => {
    let s = createAccount(1)
    s = claimLogin(s, at(3))
    expect(lifetimeCount(s)).toBe(ST.endowed + 1)
    expect(s.meta.stamps.lastRealDay).toBe(3)
    // The next world-day (8 real hours later) still pays the login gems, but not a stamp.
    expect(loginClaimed(s, at(3, 8))).toBe(false)
    expect(stampReady(s, at(3, 8))).toBe(false)
    const again = claimLogin(s, at(3, 8))
    expect(again.gems).toBe(s.gems + TUNING.shop.loginGems)
    expect(lifetimeCount(again)).toBe(lifetimeCount(s))
    // Stamping directly on the same day is refused (no change, same reference).
    expect(stampOnLogin(s, at(3, 20))).toBe(s)
    expect(lifetimeCount(claimLogin(again, at(4)))).toBe(ST.endowed + 2)
  })

  it('missed days never take a stamp away', () => {
    let s = createAccount(1)
    s = claimLogin(s, at(1))
    const before = lifetimeCount(s)
    s = claimLogin(s, at(40))
    expect(lifetimeCount(s)).toBe(before + 1)
  })

  it('the stamp that completes a card pays the gems and a free Normal pull; nothing ever decreases', () => {
    let s = createAccount(7)
    const heroes0 = Object.keys(s.heroes).length
    const gold0 = s.gold
    const counts: number[] = []
    let paid = 0
    for (let d = 0; d < ST.perCard - ST.endowed; d++) {
      const gems = s.gems
      s = claimLogin(s, at(d))
      counts.push(lifetimeCount(s))
      if (lifetimeCount(s) % ST.perCard === 0) paid = s.gems - gems
    }
    expect(lifetimeCount(s)).toBe(ST.perCard)
    expect(paid).toBe(TUNING.shop.loginGems + ST.cardGems)
    expect(Object.keys(s.heroes).length).toBe(heroes0 + ST.cardPulls)
    expect(s.gold).toBe(gold0) // the pull is free
    expect(stampCard(s)).toMatchObject({ onCard: 0, toNext: ST.perCard, cardsDone: 1 })
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeGreaterThan(counts[i - 1]!)
  })

  it('goes through the reducer (CLAIM_LOGIN) and is deterministic', () => {
    const s = createAccount(5)
    const a = reduce(s, { type: 'CLAIM_LOGIN' }, at(2))
    const b = reduce(s, { type: 'CLAIM_LOGIN' }, at(2))
    expect(a).toEqual(b)
    expect(a.gems).toBe(s.gems + TUNING.shop.loginGems)
    expect(lifetimeCount(a)).toBe(ST.endowed + 1)
  })

  it('realDayIndex: one real day is worldTimeFactor world-days', () => {
    expect(realDayIndex(0)).toBe(0)
    expect(realDayIndex(TUNING.time.worldTimeFactor * WORLD_DAY - 1)).toBe(0)
    expect(realDayIndex(TUNING.time.worldTimeFactor * WORLD_DAY)).toBe(1)
  })
})
