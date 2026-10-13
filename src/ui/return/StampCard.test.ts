/** The stamp card's payout names the hero its free summon brought (spec 2026-10-12 S28). */
import { describe, it, expect } from 'vitest'
import { newcomerName } from './StampCard'
import { createAccount } from '../../engine/account'
import { reduce } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import type { GameState } from '../../engine/types'

const REAL_DAY_WORLD = 24 * 3_600_000 * TUNING.time.worldTimeFactor

describe('newcomerName', () => {
  it('names the hero the completed card summoned, and nobody otherwise', () => {
    const base = createAccount(7)
    // One stamp short of a full card.
    let s: GameState = { ...base, meta: { ...base.meta, stamps: { count: TUNING.return.stamps.perCard - 1, lastRealDay: -1 } } }
    const before = s
    s = reduce(s, { type: 'CLAIM_LOGIN' }, 0)
    expect(s.meta.stamps.count).toBe(TUNING.return.stamps.perCard)
    const name = newcomerName(before, s)
    const fresh = Object.values(s.heroes).find((h) => !(h.id in before.heroes))!
    expect(name).toBe(fresh.name.split(/\s+/)[0])
    // A plain stamp the next real day brings nobody.
    const next = reduce(s, { type: 'CLAIM_LOGIN' }, REAL_DAY_WORLD)
    expect(newcomerName(s, next)).toBeNull()
    expect(newcomerName(null, next)).toBeNull()
  })
})
