import { describe, it, expect } from 'vitest'
import { simulate } from './sim'
import { summarize } from './report'

describe('balance simulator', () => {
  it('is deterministic for a seed', () => {
    const a = simulate('casual', 42, 3)
    const b = simulate('casual', 42, 3)
    expect(a.days).toEqual(b.days)
    expect(a.log).toEqual(b.log)
  })

  it('a new player climbs through the first act within a few days, and nobody softlocks', () => {
    for (const p of ['casual', 'engaged'] as const) {
      const r = simulate(p, 7, 4)
      const last = r.days[r.days.length - 1]!
      expect(last.highestCleared).toBeGreaterThanOrEqual(5)
      expect(last.alive).toBeGreaterThan(0)
    }
  })

  it('the report summarizes each profile', () => {
    const text = summarize([simulate('casual', 1, 2)])
    expect(text).toContain('## casual')
    expect(text).toContain('Act I')
  })
})
