import { describe, expect, it } from 'vitest'
import { beamSteps, flipAt, lineupOrder, moteCount, nextBestIndex, revealTiming, surgeTimes, tierOf } from './revealPlan'

describe('summon reveal plan', () => {
  it('maps stars to beam tiers, capping 6★/7★ at prismatic', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(tierOf)).toEqual([1, 2, 3, 4, 5, 5, 5])
  })

  it('teases 4★+ as a lower colour that surges up; commoner pulls show the truth at once', () => {
    expect(beamSteps(1, false)).toEqual([1])
    expect(beamSteps(3, false)).toEqual([3])
    expect(beamSteps(4, false)).toEqual([3, 4])
    expect(beamSteps(5, false)).toEqual([3, 4, 5])
    expect(beamSteps(7, false)).toEqual([3, 4, 5])
  })

  it('reduced motion: no tease and a much shorter build-up', () => {
    expect(beamSteps(5, true)).toEqual([5])
    expect(surgeTimes(5, true)).toEqual([])
    expect(flipAt(5, true)).toBeLessThan(500)
    expect(moteCount(5, true)).toBeLessThan(moteCount(5, false))
  })

  it('each surge lands before the flip, and rarer pulls take longer', () => {
    const t = revealTiming(false)
    expect(surgeTimes(5, false)).toEqual([t.charge, t.charge + t.step])
    for (const s of surgeTimes(5, false)) expect(s).toBeLessThan(flipAt(5, false))
    expect(flipAt(5, false)).toBeGreaterThan(flipAt(4, false))
    expect(flipAt(4, false)).toBeGreaterThan(flipAt(3, false))
    expect(flipAt(3, false)).toBe(flipAt(1, false))
  })

  it('bigger bursts for rarer pulls', () => {
    expect(moteCount(4, false)).toBeGreaterThan(moteCount(3, false))
    expect(moteCount(5, false)).toBeGreaterThan(moteCount(4, false))
  })

  it('"Skip to best" stops on the next 4★+, or reports none left', () => {
    const stars = [2, 3, 4, 1, 5, 3]
    expect(nextBestIndex(stars, 0)).toBe(2)
    expect(nextBestIndex(stars, 3)).toBe(4)
    expect(nextBestIndex(stars, 5)).toBe(-1)
    expect(nextBestIndex([1, 2, 3], 0)).toBe(-1)
  })

  it('the lineup sorts by stars, best first, keeping pull order among equals', () => {
    expect(lineupOrder([2, 3, 4, 3, 1])).toEqual([2, 1, 3, 0, 4])
  })
})
