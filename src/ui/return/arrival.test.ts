import { describe, it, expect } from 'vitest'
import { awayRealMs, isArrival, isFreshMaster, isGreyArrival, isLongHide, REAL_CLOCK_EPOCH, seenOnRealClock } from './arrival'
import { createAccount } from '../../engine/account'
import { TUNING } from '../../engine/tuning'
import type { GameState } from '../../engine/types'

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 9, 12, 20)

/** A returning Master (not fresh) last seen `hoursAgo` real hours before NOW. */
function returning(hoursAgo: number): GameState {
  const s = createAccount(5, { now: NOW - hoursAgo * HOUR })
  return { ...s, life: { ...s.life, guide: { ...s.life.guide, done: ['welcome'] } } }
}

describe('arrival gating', () => {
  it('a Master away 10 real hours is arriving; 1 hour is not', () => {
    expect(isArrival(returning(10), NOW)).toBe(true)
    expect(isArrival(returning(1), NOW)).toBe(false)
    expect(isArrival(returning(TUNING.return.welcome.minAwayRealHours), NOW)).toBe(true)
    expect(awayRealMs(returning(10), NOW)).toBe(10 * HOUR)
  })

  it('never for a fresh Master, a now:0 account, or a deleted one', () => {
    const fresh = createAccount(5, { now: NOW - 10 * HOUR })
    expect(isFreshMaster(fresh)).toBe(true)
    expect(isArrival(fresh, NOW)).toBe(false)
    const epoch = { ...returning(0), meta: { ...returning(0).meta, lastSeenAtWorld: 0 } }
    expect(seenOnRealClock(epoch)).toBe(false)
    expect(isArrival(epoch, NOW)).toBe(false)
    const gone = returning(10)
    expect(isArrival({ ...gone, meta: { ...gone.meta, deleted: true } }, NOW)).toBe(false)
    expect(REAL_CLOCK_EPOCH).toBeLessThan(NOW)
  })

  it('30+ real days away is a grey arrival (cosmetic)', () => {
    expect(isGreyArrival(returning(24 * TUNING.return.welcome.greyAfterRealDays), NOW)).toBe(true)
    expect(isGreyArrival(returning(24 * 29), NOW)).toBe(false)
  })

  it('a long-hidden tab counts like an arrival', () => {
    expect(isLongHide(3 * HOUR)).toBe(true)
    expect(isLongHide(10 * 60_000)).toBe(false)
  })
})
