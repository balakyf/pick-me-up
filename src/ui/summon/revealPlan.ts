/**
 * The summon reveal's choreography as pure data: which colour the pillar of light
 * takes (and "upgrades" through, for a tease), how long each beat lasts, where
 * "Skip to best" lands, and how the closing lineup is ordered.
 *
 * Purely cosmetic — the heroes are already rolled and saved before the first beam.
 */

/** Beam tiers, in the rarity colours the cards and stars use (bits.tsx STAR_COLOR):
 *  1★ white, 2★ green, 3★ blue, 4★ purple, 5★+ gold. */
export type Tier = 1 | 2 | 3 | 4 | 5

/** Solid tint per tier: the beam, the circle, the flash and the motes. */
export const TIER_TINT: Record<Tier, string> = {
  1: '#f4f0ff',
  2: '#5fd08a',
  3: '#4aa3ff',
  4: '#b07adb',
  5: '#f2c75c',
}

/**
 * Where a pool's "rare" begins: the stars that get the tease, a word, and a stop for
 * "Skip to best". The Normal pool tops out at 3★, so its 3★ is its jackpot; the Advanced
 * pool (3–5★) keeps the 4★ line.
 */
export function rareAtFor(pool: 'normal' | 'advanced'): number {
  return pool === 'normal' ? 3 : 4
}

export function tierOf(star: number): Tier {
  return Math.max(1, Math.min(5, Math.floor(star))) as Tier
}

/**
 * The colours the beam passes through. A rare pull (4★+ on the Advanced pool, the 3★
 * jackpot on the Normal one) starts one tier humbler and surges up a tier at a time —
 * the classic gacha tease. Reduced motion shows the truth at once.
 */
export function beamSteps(star: number, reducedMotion: boolean, rareAt = 4): Tier[] {
  const top = tierOf(star)
  if (reducedMotion || star < rareAt) return [top]
  const out: Tier[] = []
  for (let k = tierOf(rareAt - 1); k <= top; k++) out.push(k as Tier)
  return out
}

/** The word over a rare card ('Rare!', 'Legendary!'), or null for a common pull. */
export function rarityWordKey(star: number, rareAt = 4): 'Legendary!' | 'Rare!' | null {
  if (star >= 5) return 'Legendary!'
  if (star >= rareAt) return 'Rare!'
  return null
}

export interface RevealTiming {
  /** the beam rises in its first colour */
  charge: number
  /** each tease surge */
  step: number
  /** the burst before the card flips */
  burst: number
}

export function revealTiming(reducedMotion: boolean): RevealTiming {
  return reducedMotion ? { charge: 260, step: 0, burst: 120 } : { charge: 950, step: 800, burst: 360 }
}

/** When each tease surge fires (ms after the reveal starts), one per extra beam step. */
export function surgeTimes(star: number, reducedMotion: boolean, rareAt = 4): number[] {
  const t = revealTiming(reducedMotion)
  return beamSteps(star, reducedMotion, rareAt)
    .slice(1)
    .map((_, i) => t.charge + i * t.step)
}

/** ms from the start of a hero's reveal until its card flips. */
export function flipAt(star: number, reducedMotion: boolean, rareAt = 4): number {
  const t = revealTiming(reducedMotion)
  return t.charge + (beamSteps(star, reducedMotion, rareAt).length - 1) * t.step + t.burst
}

/** Rising motes around the pillar: more (and bigger, in CSS) for rarer pulls. */
export function moteCount(tier: Tier, reducedMotion: boolean): number {
  const n = [0, 6, 8, 12, 22, 34][tier]!
  return reducedMotion ? Math.ceil(n / 3) : n
}

/** "Skip to best": the first rare reveal (`rareAt`+) at or after `from`, or -1 when none remain. */
export function nextBestIndex(stars: readonly number[], from: number, rareAt = 4): number {
  for (let i = Math.max(0, from); i < stars.length; i++) if (stars[i]! >= rareAt) return i
  return -1
}

/** Lineup order (indices into the pull): highest star first, ties keep pull order. */
export function lineupOrder(stars: readonly number[]): number[] {
  return stars.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i)
}

/** Deterministic mote placement (percent across the pillar, delay in s, drift in px). */
export function motePlacement(i: number): { left: number; delay: number; drift: number } {
  return { left: (i * 37 + 11) % 100, delay: ((i * 53) % 90) / 100, drift: ((i * 29) % 41) - 20 }
}
