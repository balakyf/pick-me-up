import { describe, it, expect } from 'vitest'
import {
  upgradeCost,
  upgradeDuration,
  canUpgrade,
  startUpgrade,
  skipFacility,
} from './facilities'
import { createAccount } from '../account'
import { TUNING } from '../tuning'
import type { GameState, FacilityId } from '../types'

const F = TUNING.lobby.facilities
const M = TUNING.lobby.master

/** A state with set Master Level, gold, gems, and facility levels/builds. */
function stateWith(opts: {
  masterLevel?: number
  gold?: number
  gems?: number
  facilities?: Partial<Record<FacilityId, { level: number; build?: { toLevel: number; completesAtWorld: number } | null }>>
}): GameState {
  const acct = createAccount(9, { now: 0 })
  const facilities = { ...acct.facilities }
  for (const id of Object.keys(opts.facilities ?? {}) as FacilityId[]) {
    const f = opts.facilities![id]!
    facilities[id] = { level: f.level, build: f.build ?? null }
  }
  return {
    ...acct,
    gold: opts.gold ?? 1_000_000,
    gems: opts.gems ?? 0,
    meta: { ...acct.meta, masterLevel: opts.masterLevel ?? 5 },
    facilities,
  }
}

describe('upgradeCost', () => {
  it('grows geometrically from the per-facility base', () => {
    expect(upgradeCost('kitchen', 0)).toBe(Math.round(F.baseCost.kitchen * F.costGrowth ** 0))
    expect(upgradeCost('kitchen', 3)).toBe(Math.round(F.baseCost.kitchen * F.costGrowth ** 3))
    expect(upgradeCost('tacticalCenter', 2)).toBe(Math.round(F.baseCost.tacticalCenter * F.costGrowth ** 2))
  })
})

describe('upgradeDuration', () => {
  it('scales with the target level', () => {
    expect(upgradeDuration(2)).toBe(F.durationPerLevel * 2)
    expect(upgradeDuration(5)).toBeGreaterThan(upgradeDuration(2))
  })
})

describe('canUpgrade', () => {
  it('is true for a buildable facility below the Master-Level ceiling with gold', () => {
    expect(canUpgrade(stateWith({ masterLevel: 5, facilities: { kitchen: { level: 1 } } }), 'kitchen')).toBe(true)
  })

  it('is false when the facility level has reached the Master Level (level < ML rule)', () => {
    expect(canUpgrade(stateWith({ masterLevel: 3, facilities: { kitchen: { level: 3 } } }), 'kitchen')).toBe(false)
  })

  it('is false at the hard slice max level', () => {
    expect(canUpgrade(stateWith({ masterLevel: 99, facilities: { kitchen: { level: F.maxLevel } } }), 'kitchen')).toBe(false)
  })

  it('is false while a build is already in flight', () => {
    const s = stateWith({ masterLevel: 5, facilities: { kitchen: { level: 1, build: { toLevel: 2, completesAtWorld: 999 } } } })
    expect(canUpgrade(s, 'kitchen')).toBe(false)
  })

  it('is false when gold is insufficient', () => {
    expect(canUpgrade(stateWith({ masterLevel: 5, gold: 0, facilities: { kitchen: { level: 1 } } }), 'kitchen')).toBe(false)
  })

  it('gates the Promotion Chamber build (0→1) behind the unlock Master Level', () => {
    const below = stateWith({ masterLevel: F.chamberUnlockMasterLevel - 1, facilities: { promotionChamber: { level: 0 } } })
    const ok = stateWith({ masterLevel: F.chamberUnlockMasterLevel, facilities: { promotionChamber: { level: 0 } } })
    expect(canUpgrade(below, 'promotionChamber')).toBe(false)
    expect(canUpgrade(ok, 'promotionChamber')).toBe(true)
  })
})

describe('startUpgrade', () => {
  it('charges gold and sets the build timer', () => {
    const s = stateWith({ masterLevel: 5, facilities: { kitchen: { level: 1 } } })
    const next = startUpgrade(s, 'kitchen', 1000)
    expect(next.gold).toBe(s.gold - upgradeCost('kitchen', 1))
    expect(next.facilities.kitchen.build).toEqual({ toLevel: 2, completesAtWorld: 1000 + upgradeDuration(2) })
    expect(next.facilities.kitchen.level).toBe(1) // not raised until the timer completes
  })

  it('throws when the upgrade is gated', () => {
    const maxed = stateWith({ masterLevel: 1, facilities: { kitchen: { level: 1 } } }) // level == ML
    expect(() => startUpgrade(maxed, 'kitchen', 0)).toThrow()
  })

  it('is pure — input state is not mutated', () => {
    const s = stateWith({ masterLevel: 5, facilities: { kitchen: { level: 1 } } })
    startUpgrade(s, 'kitchen', 0)
    expect(s.facilities.kitchen.build).toBeNull()
    expect(s.gold).toBe(1_000_000)
  })
})

describe('skipFacility', () => {
  it('charges gems, completes the build now, and awards Master XP', () => {
    const s = stateWith({
      masterLevel: 5,
      gems: 100,
      facilities: { kitchen: { level: 1, build: { toLevel: 2, completesAtWorld: 9_999_999 } } },
    })
    const next = skipFacility(s, 'kitchen')
    expect(next.gems).toBe(100 - F.skipGemCost)
    expect(next.facilities.kitchen).toEqual({ level: 2, build: null })
    expect(next.meta.masterXp).toBe(s.meta.masterXp + M.xpPerFacilityUpgrade)
  })

  it('throws when there is no build in flight', () => {
    const s = stateWith({ masterLevel: 5, gems: 100, facilities: { kitchen: { level: 1 } } })
    expect(() => skipFacility(s, 'kitchen')).toThrow(/no.*build|in flight/i)
  })

  it('throws when gems are insufficient', () => {
    const s = stateWith({
      masterLevel: 5,
      gems: F.skipGemCost - 1,
      facilities: { kitchen: { level: 1, build: { toLevel: 2, completesAtWorld: 9 } } },
    })
    expect(() => skipFacility(s, 'kitchen')).toThrow(/gem/i)
  })
})
