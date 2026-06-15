import { describe, it, expect } from 'vitest'
import { tacticalFocusBonus, tacticalOverlookSlots } from './tactical'
import { TUNING } from '../tuning'

const T = TUNING.lobby.tactical

describe('tacticalFocusBonus', () => {
  it('scales the concentrate-fire bonus with level', () => {
    expect(tacticalFocusBonus(1)).toBeCloseTo(T.focusBonusPerLevel, 6)
    expect(tacticalFocusBonus(3)).toBeCloseTo(T.focusBonusPerLevel * 3, 6)
  })
  it('is 0 for an unbuilt center (level 0)', () => {
    expect(tacticalFocusBonus(0)).toBe(0)
  })
})

describe('tacticalOverlookSlots', () => {
  it('is the base slot count at level 1 (and below)', () => {
    expect(tacticalOverlookSlots(1)).toBe(T.overlookBaseSlots)
  })
  it('gains a slot every two levels (1 + floor(level/2))', () => {
    expect(tacticalOverlookSlots(2)).toBe(T.overlookBaseSlots + 1)
    expect(tacticalOverlookSlots(4)).toBe(T.overlookBaseSlots + 2)
    expect(tacticalOverlookSlots(5)).toBe(T.overlookBaseSlots + 2)
  })
})
