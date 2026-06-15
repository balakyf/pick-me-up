import { describe, it, expect } from 'vitest'
import {
  makeSeed,
  createRng,
  rngFromState,
  nextFloat,
  nextInt,
  pick,
  weightedPick,
  chance,
  shuffle,
  hash,
  rngFor,
} from './rng'
import type { Seed } from '../types'

/** Draw `n` floats from an rng, returning the sequence (threading functionally). */
function sequence(seed: number, n: number): number[] {
  let rng = createRng(makeSeed(seed))
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const d = nextFloat(rng)
    out.push(d.value)
    rng = d.rng
  }
  return out
}

describe('createRng / nextFloat — determinism', () => {
  it('same seed yields an identical sequence', () => {
    expect(sequence(12345, 100)).toEqual(sequence(12345, 100))
  })

  it('different seeds yield different sequences', () => {
    expect(sequence(12345, 50)).not.toEqual(sequence(12346, 50))
  })

  it('all floats are in [0, 1)', () => {
    let rng = createRng(makeSeed(99))
    for (let i = 0; i < 100_000; i++) {
      const d = nextFloat(rng)
      expect(d.value).toBeGreaterThanOrEqual(0)
      expect(d.value).toBeLessThan(1)
      rng = d.rng
    }
  })

  it('does not mutate its input (calling twice on the same rng repeats)', () => {
    const rng = createRng(makeSeed(7))
    const a = nextFloat(rng)
    const b = nextFloat(rng)
    expect(a.value).toBe(b.value)
    expect(a.rng.state.cursor).toBe(b.rng.state.cursor)
  })

  it('rehydrates from a persisted cursor and resumes exactly', () => {
    let rng = createRng(makeSeed(555))
    for (let i = 0; i < 17; i++) rng = nextFloat(rng).rng
    const resumed = rngFromState(rng.state)
    expect(nextFloat(resumed).value).toBe(nextFloat(rng).value)
  })
})

describe('nextInt', () => {
  it('is inclusive of both bounds and never out of range', () => {
    let rng = createRng(makeSeed(1))
    const seen = new Set<number>()
    for (let i = 0; i < 60_000; i++) {
      const d = nextInt(rng, 1, 6)
      expect(d.value).toBeGreaterThanOrEqual(1)
      expect(d.value).toBeLessThanOrEqual(6)
      seen.add(d.value)
      rng = d.rng
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('single-value range always returns that value and still advances', () => {
    const rng = createRng(makeSeed(3))
    const d = nextInt(rng, 5, 5)
    expect(d.value).toBe(5)
    expect(d.rng.state.cursor).not.toBe(rng.state.cursor)
  })

  it('throws when max < min', () => {
    expect(() => nextInt(createRng(makeSeed(1)), 5, 2)).toThrow()
  })
})

describe('weightedPick', () => {
  it('honors the gacha 70/25/5 distribution within ~2%', () => {
    let rng = createRng(makeSeed(42))
    const counts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>
    const N = 200_000
    for (let i = 0; i < N; i++) {
      const d = weightedPick(rng, [
        { item: 1, weight: 70 },
        { item: 2, weight: 25 },
        { item: 3, weight: 5 },
      ])
      counts[d.value]!++
      rng = d.rng
    }
    expect(counts[1]! / N).toBeCloseTo(0.7, 1)
    expect(counts[2]! / N).toBeCloseTo(0.25, 1)
    expect(counts[3]! / N).toBeCloseTo(0.05, 1)
  })

  it('throws on empty / zero-total / negative weights', () => {
    const rng = createRng(makeSeed(1))
    expect(() => weightedPick(rng, [])).toThrow()
    expect(() => weightedPick(rng, [{ item: 'a', weight: 0 }])).toThrow()
    expect(() => weightedPick(rng, [{ item: 'a', weight: -1 }])).toThrow()
  })
})

describe('pick / chance / shuffle', () => {
  it('pick stays in bounds and throws on empty', () => {
    let rng = createRng(makeSeed(8))
    const arr = ['a', 'b', 'c']
    for (let i = 0; i < 1000; i++) {
      const d = pick(rng, arr)
      expect(arr).toContain(d.value)
      rng = d.rng
    }
    expect(() => pick(rng, [])).toThrow()
  })

  it('chance(p) approximates p', () => {
    let rng = createRng(makeSeed(2))
    let hits = 0
    const N = 100_000
    for (let i = 0; i < N; i++) {
      const d = chance(rng, 0.3)
      if (d.value) hits++
      rng = d.rng
    }
    expect(hits / N).toBeCloseTo(0.3, 1)
  })

  it('shuffle is a permutation and leaves the input untouched', () => {
    const input = Array.from({ length: 10 }, (_, i) => i)
    const frozen = input.slice()
    const d = shuffle(createRng(makeSeed(123)), input)
    expect(input).toEqual(frozen) // input unchanged
    expect([...d.value].sort((a, b) => a - b)).toEqual(frozen) // same elements
  })

  it('shuffle is deterministic for the same seed', () => {
    const input = Array.from({ length: 20 }, (_, i) => i)
    const a = shuffle(createRng(makeSeed(9)), input).value
    const b = shuffle(createRng(makeSeed(9)), input).value
    expect(a).toEqual(b)
  })
})

describe('hash', () => {
  it('is stable and returns a uint32', () => {
    const h = hash(makeSeed(123), 'floor', 7)
    expect(h).toBe(hash(makeSeed(123), 'floor', 7))
    expect(Number.isInteger(h)).toBe(true)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
  })

  it('is position- and part-sensitive', () => {
    expect(hash('a', 'b')).not.toBe(hash('ab'))
    expect(hash(123, 'floor', 7)).not.toBe(hash(123, 'floor', 8))
    expect(hash(123, 'floor', 7)).not.toBe(hash(123, 'combat', 7))
  })

  it('treats equal numeric and string parts identically', () => {
    expect(hash(1, 2, 3)).toBe(hash('1', '2', '3'))
  })

  it('throws on non-finite number parts', () => {
    expect(() => hash(NaN)).toThrow()
    expect(() => hash(Infinity)).toThrow()
  })
})

describe('rngFor — independent sub-streams', () => {
  const seed = makeSeed(0xabc123)

  it('sub-streams with different parts diverge', () => {
    const floorSeq = take(rngFor(seed, 'floor', 1), 20)
    const combatSeq = take(rngFor(seed, 'combat', 1), 20)
    expect(floorSeq).not.toEqual(combatSeq)
    expect(take(rngFor(seed, 'floor', 1), 20)).not.toEqual(take(rngFor(seed, 'floor', 2), 20))
  })

  it('is a pure function of inputs regardless of call order', () => {
    const a = take(rngFor(seed, 'floor', 7), 10)
    // create + drain other streams in between
    take(rngFor(seed, 'combat', 3), 50)
    take(rngFor(seed, 'gacha', 9), 50)
    const b = take(rngFor(seed, 'floor', 7), 10)
    expect(a).toEqual(b)
  })
})

function take(rng: ReturnType<typeof createRng>, n: number): number[] {
  let r = rng
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const d = nextFloat(r)
    out.push(d.value)
    r = d.rng
  }
  return out
}

// silence unused Seed import in type-only position
export type _Seed = Seed
