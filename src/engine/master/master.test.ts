import { describe, it, expect } from 'vitest'
import { masterXpToNext, masterXpTotal, addMasterXp, floorClearMasterXp } from './master'
import { MASTER_XP_TO_NEXT } from './masterXpTable'
import { TUNING } from '../tuning'
import { createAccount } from '../account'
import type { MetaState } from '../types'

const BASE_META = createAccount(1).meta

const M = TUNING.lobby.master

function meta(masterLevel: number, masterXp: number): MetaState {
  return { ...BASE_META, masterLevel, masterXp, lastSeenAtWorld: 0 }
}

describe('masterXpToNext', () => {
  it('reads the baked integer table (no runtime powers — B21)', () => {
    expect(MASTER_XP_TO_NEXT.length).toBeGreaterThanOrEqual(M.cap - 1)
    for (let l = 1; l < M.cap; l++) {
      expect(masterXpToNext(l)).toBe(MASTER_XP_TO_NEXT[l - 1])
      expect(Number.isInteger(masterXpToNext(l))).toBe(true)
    }
  })
  it('is strictly increasing in level', () => {
    for (let l = 1; l < M.cap - 1; l++) expect(masterXpToNext(l + 1)).toBeGreaterThan(masterXpToNext(l))
  })
  it('masterXpTotal sums the table', () => {
    expect(masterXpTotal(1)).toBe(0)
    expect(masterXpTotal(3)).toBe(masterXpToNext(1) + masterXpToNext(2))
    // Pouring exactly the total into a fresh Master lands on that level with nothing over.
    const at = addMasterXp(meta(1, 0), masterXpTotal(20))
    expect(at.masterLevel).toBe(20)
    expect(at.masterXp).toBe(0)
  })
})

describe('floorClearMasterXp', () => {
  it('a repeat clear pays a little; a first clear more, rising with the floor; anchors most', () => {
    expect(floorClearMasterXp(33, false)).toBe(M.xpPerFloorClear)
    expect(floorClearMasterXp(33, true)).toBe(M.xpPerFloorClear + M.xpPerFirstClear + 33 * M.xpFirstClearPerFloor)
    expect(floorClearMasterXp(34, true)).toBeGreaterThan(floorClearMasterXp(33, true))
    expect(floorClearMasterXp(35, true)).toBe(floorClearMasterXp(35, false) + M.xpPerFirstClear + 35 * (M.xpFirstClearPerFloor + M.xpAnchorFirstClearPerFloor))
  })
})

describe('addMasterXp', () => {
  it('accumulates XP within a level without leveling up', () => {
    const next = addMasterXp(meta(1, 0), masterXpToNext(1) - 1)
    expect(next.masterLevel).toBe(1)
    expect(next.masterXp).toBe(masterXpToNext(1) - 1)
  })

  it('levels up and carries the remainder', () => {
    const need = masterXpToNext(1)
    const next = addMasterXp(meta(1, 0), need + 3)
    expect(next.masterLevel).toBe(2)
    expect(next.masterXp).toBe(3)
  })

  it('handles multiple level-ups from one large award', () => {
    const next = addMasterXp(meta(1, 0), 100_000)
    expect(next.masterLevel).toBeGreaterThan(2)
  })

  it('freezes at the cap — no further level, XP held at 0', () => {
    const atCap = addMasterXp(meta(1, 0), 10_000_000)
    expect(atCap.masterLevel).toBe(M.cap)
    expect(atCap.masterXp).toBe(0)
    // Already capped → another award is a no-op level-wise.
    const again = addMasterXp(atCap, 5000)
    expect(again.masterLevel).toBe(M.cap)
  })

  it('preserves unrelated meta fields (lastSeenAtWorld)', () => {
    const m: MetaState = { ...BASE_META, masterLevel: 1, masterXp: 0, lastSeenAtWorld: 777 }
    expect(addMasterXp(m, 5).lastSeenAtWorld).toBe(777)
  })

  it('is a no-op for a zero award (same values)', () => {
    const m = meta(3, 10)
    const next = addMasterXp(m, 0)
    expect(next.masterLevel).toBe(3)
    expect(next.masterXp).toBe(10)
  })

  it('is pure — input meta is not mutated', () => {
    const m = meta(1, 0)
    addMasterXp(m, masterXpToNext(1) + 5)
    expect(m.masterLevel).toBe(1)
    expect(m.masterXp).toBe(0)
  })
})
