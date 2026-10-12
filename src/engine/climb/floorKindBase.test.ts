/** WP0 contract (spec 2026-10-12 S13): floor kinds and the stub budget. */
import { describe, it, expect } from 'vitest'
import { floorKindBase, floorBudget, staticBudget, mercyBand } from './kinds'
import { rollDoors, chooseDoor, boonOffer, applyBoonsToUnits, BOONS, sortieAfterFloor, returnToCampus } from '.'
import { floorPower } from '../tower'
import { createAccount } from '../account'
import { TUNING } from '../tuning'
import type { FloorKind } from '../types'

describe('floorKindBase', () => {
  it('F1-F2 are tutorial floors, every 5th is a boss, the rest are Path', () => {
    expect([1, 2].map(floorKindBase)).toEqual(['tutorial', 'tutorial'])
    for (const f of [5, 10, 15, 20, 25, 40, 90]) expect(floorKindBase(f), `F${f}`).toBe('boss')
    for (const f of [3, 4, 6, 7, 8, 9, 11, 14, 16, 39, 89]) expect(floorKindBase(f), `F${f}`).toBe('path')
  })
})

describe('climb stubs (WP0)', () => {
  const s = createAccount(3, { now: 0 })
  const kinds: FloorKind[] = ['tutorial', 'breather', 'path', 'elite', 'rest', 'cache', 'boss']

  it('floorBudget and staticBudget are today\'s floorPower for every kind', () => {
    for (let f = 1; f <= 30; f++) {
      const want = floorPower(f, TUNING.tower.worldMult[s.worldGrade])
      for (const k of kinds) {
        expect(floorBudget(s, f, k)).toBe(want)
        expect(staticBudget(s, f, k)).toBe(want)
      }
    }
  })

  it('mercyBand reads TUNING.climb.mercyBand', () => {
    for (const k of kinds) expect(mercyBand(k)).toBe(TUNING.climb.mercyBand[k])
  })

  it('doors, boons and sorties are neutral', () => {
    expect(rollDoors(s, 3)).toBeNull()
    expect(() => chooseDoor(s, 0)).toThrow('chooseDoor: not built yet')
    expect(boonOffer(s, 5)).toEqual([])
    expect(BOONS).toEqual({})
    const units: never[] = []
    expect(applyBoonsToUnits(s, units, ['volley'])).toBe(units)
    expect(returnToCampus(s)).toBe(s)
  })

  it('sortieAfterFloor is identity', () => {
    const result = {} as Parameters<typeof sortieAfterFloor>[1]
    const out = sortieAfterFloor(s, result)
    expect(out.state).toBe(s)
    expect(out.result).toBe(result)
  })
})
