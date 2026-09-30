/**
 * The summon reveal's choreography as pure data: which colour the pillar of light
 * takes (and "upgrades" through, for a tease), how long each beat lasts, where
 * "Skip to best" lands, and how the closing lineup is ordered.
 *
 * Purely cosmetic — the heroes are already rolled and saved before the first beam.
 */

/** Beam tiers: 1★ white, 2★ green, 3★ blue, 4★ gold, 5★+ prismatic. */
export type Tier = 1 | 2 | 3 | 4 | 5

/** Solid tint per tier (tier 5 is drawn as a rainbow; this is its fallback/particle colour). */
export const TIER_TINT: Record<Tier, string> = {
  1: '#f4f0ff',
  2: '#5fd08a',
  3: '#4aa3ff',
  4: '#f2c75c',
  5: '#ff9ae0',
}

export function tierOf(star: number): Tier {
  return Math.max(1, Math.min(5, Math.floor(star))) as Tier
}

/**
 * The colours the beam passes through. A 4★+ starts as a humble 3★ blue and surges
 * up a tier at a time — the classic gacha tease. Reduced motion shows the truth at once.
 */
export function beamSteps(star: number, reducedMotion: boolean): Tier[] {
  const top = tierOf(star)
  if (reducedMotion || top < 4) return [top]
  return top === 4 ? [3, 4] : [3, 4, 5]
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
export function surgeTimes(star: number, reducedMotion: boolean): number[] {
  const t = revealTiming(reducedMotion)
  return beamSteps(star, reducedMotion)
    .slice(1)
    .map((_, i) => t.charge + i * t.step)
}

/** ms from the start of a hero's reveal until its card flips. */
export function flipAt(star: number, reducedMotion: boolean): number {
  const t = revealTiming(reducedMotion)
  return t.charge + (beamSteps(star, reducedMotion).length - 1) * t.step + t.burst
}

/** Rising motes around the pillar: more (and bigger, in CSS) for rarer pulls. */
export function moteCount(tier: Tier, reducedMotion: boolean): number {
  const n = [0, 6, 8, 12, 22, 34][tier]!
  return reducedMotion ? Math.ceil(n / 3) : n
}

/** "Skip to best": the first 4★+ reveal at or after `from`, or -1 when none remain. */
export function nextBestIndex(stars: readonly number[], from: number): number {
  for (let i = Math.max(0, from); i < stars.length; i++) if (stars[i]! >= 4) return i
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
