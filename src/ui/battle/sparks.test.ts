import { describe, expect, it } from 'vitest'
import { MAX_SPARKS, SPARKS_PER_CRIT, SPARKS_PER_HIT, sparkCount, sparkSpecs } from './Sparks'

describe('sparkSpecs', () => {
  it('throws about 6 sparks per hit and 14 per crit', () => {
    expect(sparkCount('hit')).toBe(SPARKS_PER_HIT)
    expect(sparkCount('crit')).toBe(SPARKS_PER_CRIT)
    expect(SPARKS_PER_HIT).toBe(6)
    expect(SPARKS_PER_CRIT).toBe(14)
    expect(sparkSpecs(3, sparkCount('crit'), '#fff')).toHaveLength(14)
  })

  it('is seeded by the event seq: the same burst twice, a different one for another seq', () => {
    expect(sparkSpecs(42, 6, '#f00')).toEqual(sparkSpecs(42, 6, '#f00'))
    expect(sparkSpecs(42, 6, '#f00')).not.toEqual(sparkSpecs(43, 6, '#f00'))
  })

  it('stays small: capped node count, short flights, unique keys, accent colour on a third', () => {
    const s = sparkSpecs(7, 999, '#0f0', '#ff0')
    expect(s).toHaveLength(MAX_SPARKS)
    expect(MAX_SPARKS).toBeLessThanOrEqual(40)
    expect(new Set(s.map((x) => x.key)).size).toBe(s.length)
    for (const x of s) {
      expect(Math.hypot(x.dx, x.dy + 4)).toBeLessThanOrEqual(22)
      expect([1, 2]).toContain(x.size)
      expect(x.delay).toBeGreaterThanOrEqual(0)
    }
    expect(s.filter((x) => x.color === '#ff0').length).toBe(Math.ceil(MAX_SPARKS / 3))
    expect(sparkSpecs(1, -3, '#fff')).toEqual([])
  })
})
