/**
 * Deterministic seeded PRNG (mulberry32 over a splitmix-mixed seed) with a purely
 * functional API: every draw returns { value, rng } and never mutates its input.
 *
 * Determinism rules this module enforces for the whole engine:
 *   - integer-only math + one /2^32 division (IEEE-754 exact across JS engines)
 *   - no Math.random / Date.now / transcendental functions
 *   - the entire serializable RNG state is ONE integer (RngState.cursor)
 *   - independent named sub-streams via rngFor(seed, ...parts) so advancing one
 *     stream never disturbs another.
 */

import type { Seed } from '../types'

export interface RngState {
  /** The 32-bit mulberry32 accumulator. The whole persistable RNG state. */
  cursor: number
}

export interface Rng {
  readonly state: RngState
}

export interface Draw<T> {
  value: T
  rng: Rng
}

/** Coerce any number to a valid 32-bit unsigned Seed. The only Seed constructor. */
export function makeSeed(raw: number): Seed {
  return (raw >>> 0) as Seed
}

/** splitmix32 avalanche — fixes mulberry32's weak low-bit seeding so adjacent
 *  seeds (e.g. hash(seed,'floor',7) vs ',8') yield well-separated streams. */
function mix32(x: number): number {
  let h = x | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = h ^ (h >>> 16)
  return h >>> 0
}

export function createRng(seed: Seed | number): Rng {
  return { state: { cursor: mix32(seed >>> 0) } }
}

/** Rehydrate an Rng from a persisted cursor so a stream resumes exactly. */
export function rngFromState(state: RngState): Rng {
  return { state: { cursor: state.cursor >>> 0 } }
}

/** One mulberry32 step: pure (cursor in → float + next cursor out). */
function step(cursor: number): { value: number; cursor: number } {
  let a = cursor | 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { value, cursor: a }
}

/** Draw a float in [0, 1). */
export function nextFloat(rng: Rng): Draw<number> {
  const { value, cursor } = step(rng.state.cursor)
  return { value, rng: { state: { cursor } } }
}

/** Draw an integer uniformly in [minInclusive, maxInclusive]. */
export function nextInt(rng: Rng, minInclusive: number, maxInclusive: number): Draw<number> {
  if (maxInclusive < minInclusive) throw new Error(`nextInt: max < min (${maxInclusive} < ${minInclusive})`)
  const { value, rng: r } = nextFloat(rng)
  const span = maxInclusive - minInclusive + 1
  return { value: minInclusive + Math.floor(value * span), rng: r }
}

/** Uniformly pick one element. Throws on empty array (programmer error). */
export function pick<T>(rng: Rng, arr: readonly T[]): Draw<T> {
  if (arr.length === 0) throw new Error('pick: empty array')
  const { value: idx, rng: r } = nextInt(rng, 0, arr.length - 1)
  return { value: arr[idx] as T, rng: r }
}

/** Pick one entry with probability proportional to weight. */
export function weightedPick<T>(rng: Rng, entries: readonly { item: T; weight: number }[]): Draw<T> {
  if (entries.length === 0) throw new Error('weightedPick: empty entries')
  let total = 0
  for (const e of entries) {
    if (e.weight < 0) throw new Error('weightedPick: negative weight')
    total += e.weight
  }
  if (total <= 0) throw new Error('weightedPick: total weight is zero')
  const { value, rng: r } = nextFloat(rng)
  let threshold = value * total
  for (const e of entries) {
    threshold -= e.weight
    if (threshold < 0) return { value: e.item, rng: r }
  }
  // Floating-point fallthrough: return the last entry.
  return { value: entries[entries.length - 1]!.item, rng: r }
}

/** Return true with probability p (0..1). */
export function chance(rng: Rng, p: number): Draw<boolean> {
  const { value, rng: r } = nextFloat(rng)
  return { value: value < p, rng: r }
}

/** Fisher-Yates shuffle into a NEW array; the input is never mutated. */
export function shuffle<T>(rng: Rng, arr: readonly T[]): Draw<T[]> {
  const out = arr.slice()
  let r = rng
  for (let i = out.length - 1; i > 0; i--) {
    const d = nextInt(r, 0, i)
    r = d.rng
    const j = d.value
    const tmp = out[i] as T
    out[i] = out[j] as T
    out[j] = tmp
  }
  return { value: out, rng: r }
}

/** Stable 32-bit FNV-1a hash over normalized parts. Platform-independent:
 *  hash(accountSeed, 'floor', f) is the floor-content determinism key. */
export function hash(...parts: (string | number)[]): number {
  let h = 0x811c9dc5
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p]!
    const s = typeof part === 'number' ? numToStr(part) : part
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    // Separator so ('a','b') and ('ab') hash differently.
    h ^= 0x1f
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function numToStr(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`hash: non-finite number part (${n})`)
  return String(n)
}

/** Derive an independent named sub-stream that is a PURE FUNCTION of the account
 *  seed + parts. e.g. rngFor(seed,'floor',7), rngFor(seed,'gacha',pullCount),
 *  rngFor(seed,'combat',floor,attemptIndex). Mutually independent streams. */
export function rngFor(accountSeed: Seed, ...parts: (string | number)[]): Rng {
  return createRng(makeSeed(hash(accountSeed, ...parts)))
}

/**
 * A mutable float stream for hot simulation loops (Quanton Life steps hundreds of heroes
 * per slot): the same mulberry32 generator, seeded like `rngFor`, but advanced in place
 * instead of threading immutable Draws. Deterministic in (accountSeed, parts).
 */
export function floatStream(accountSeed: Seed | number, ...parts: (string | number)[]): () => number {
  let cursor = mix32((hash(accountSeed >>> 0, ...parts) ^ (accountSeed >>> 0)) >>> 0)
  return () => {
    const s = step(cursor)
    cursor = s.cursor
    return s.value
  }
}
