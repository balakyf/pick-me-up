/**
 * The summon reveal's choreography as pure data: which colour the pillar of light
 * takes (and "upgrades" through, for a tease), how long each beat lasts, where
 * "Skip to best" lands, and how the closing lineup is ordered.
 *
 * Reveal 2.0 (lane J): a ten-pull opens on ten orbs tinted by tier (a rare one teased a
 * colour humbler); 1–2★ flip fast and 3★+ get the full beat; the card's second beat stamps
 * what the hero brought (engraving, Oath-weapon, skills, trait, best grade, the quality
 * floor); the lineup gathers bond members under their group.
 *
 * Purely cosmetic — the heroes are already rolled and saved before the first beam.
 */
import type { GrowthGrades, OwnedHero } from '../../engine/types'
import { gradeValueToLetter } from '../../engine/stats'
import { TUNING } from '../../engine/tuning'

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

/** 1–2★ flip fast: a ten-pull of commoners is not ten slow ceremonies. 3★+ get the full beat. */
export function isFastBeat(star: number): boolean {
  return star <= 2
}

export function revealTiming(reducedMotion: boolean, fast = false): RevealTiming {
  if (reducedMotion) return { charge: 260, step: 0, burst: 120 }
  return fast ? { charge: 380, step: 0, burst: 160 } : { charge: 950, step: 800, burst: 360 }
}

/** When each tease surge fires (ms after the reveal starts), one per extra beam step. */
export function surgeTimes(star: number, reducedMotion: boolean, rareAt = 4): number[] {
  const t = revealTiming(reducedMotion, isFastBeat(star))
  return beamSteps(star, reducedMotion, rareAt)
    .slice(1)
    .map((_, i) => t.charge + i * t.step)
}

/** ms from the start of a hero's reveal until its card flips. */
export function flipAt(star: number, reducedMotion: boolean, rareAt = 4): number {
  const t = revealTiming(reducedMotion, isFastBeat(star))
  return t.charge + (beamSteps(star, reducedMotion, rareAt).length - 1) * t.step + t.burst
}

/** ms after the flip until the card's second beat stamps its seals (at once when fast). */
export function stampDelay(star: number, reducedMotion: boolean): number {
  if (reducedMotion) return 150
  return isFastBeat(star) ? 200 : 900
}

/** ms between two stamps landing. */
export function stampStagger(reducedMotion: boolean): number {
  return reducedMotion ? 0 : 170
}

/** How long a ten-pull's overview of orbs holds before the first beam (a click skips it). */
export function overviewHold(reducedMotion: boolean): number {
  return reducedMotion ? 700 : 2000
}

/** One orb of the ten-pull overview: its opening colour, and whether it is hiding something. */
export interface OverviewOrb {
  tier: Tier
  tease: boolean
}

/** The ten orbs: each in its beam's opening colour, the rare ones teased (they shimmer). */
export function overviewOrbs(stars: readonly number[], reducedMotion: boolean, rareAt = 4): OverviewOrb[] {
  return stars.map((s) => {
    const steps = beamSteps(s, reducedMotion, rareAt)
    return { tier: steps[0]!, tease: steps.length > 1 }
  })
}

/** An orb in the progress strip: the truth once its hero is out, its opening colour before. */
export function orbTier(star: number, revealed: boolean, reducedMotion: boolean, rareAt = 4): Tier {
  return revealed ? tierOf(star) : beamSteps(star, reducedMotion, rareAt)[0]!
}

export type GradeAttr = 'STR' | 'AGI' | 'VIT' | 'INT' | 'WIL'
const GRADE_ATTRS: [keyof GrowthGrades, GradeAttr][] = [
  ['str', 'STR'],
  ['agi', 'AGI'],
  ['vit', 'VIT'],
  ['int', 'INT'],
  ['wil', 'WIL'],
]

/** The hero's best growth grade (the first, on a tie, in STR·AGI·VIT·INT·WIL order). */
export function bestGrade(g: GrowthGrades): { attr: GradeAttr; value: number; letter: string } {
  let best = GRADE_ATTRS[0]!
  for (const pair of GRADE_ATTRS) if (g[pair[0]] > g[best[0]]) best = pair
  return { attr: best[1], value: g[best[0]], letter: gradeValueToLetter(g[best[0]]) }
}

/** Is the best grade worth shouting about ('S-grade STR!')? A and up. */
export function gradeShout(best: { letter: string }): boolean {
  return best.letter === 'A' || best.letter === 'S' || best.letter === 'SS'
}

/** What the card's second beat stamps, in order. */
export type Stamp =
  | { kind: 'engraving' }
  | { kind: 'weapon' }
  | { kind: 'skill'; id: string }
  | { kind: 'trait' }
  | { kind: 'grade' }
  | { kind: 'floor' }

/** The stamps for one hero: engraving, Oath-weapon, skills, trait, best grade, and the quality
 *  floor when it was the floor that lifted them. */
export function cardStamps(hero: Pick<OwnedHero, 'engraving' | 'equipment' | 'skills'>, floorHit = false): Stamp[] {
  const out: Stamp[] = []
  if (hero.engraving) out.push({ kind: 'engraving' })
  if (hero.equipment.weapon) out.push({ kind: 'weapon' })
  for (const s of hero.skills) out.push({ kind: 'skill', id: s.id })
  out.push({ kind: 'trait' }, { kind: 'grade' })
  if (floorHit) out.push({ kind: 'floor' })
  return out
}

/** Which pulls of a batch the Rising Quality Floor lifted (or guaranteed), from the pity
 *  counters as they stood before the batch. Mirrors the gacha's own counting. */
export function floorHits(pool: 'normal' | 'advanced', before: { pity: number; advPity4: number; advPity5: number }, stars: readonly number[]): boolean[] {
  const G = TUNING.gacha
  if (pool === 'normal') {
    let p = before.pity
    return stars.map((s) => {
      const hit = p + 1 >= G.normalPityFloor3At && s >= 3
      p = s >= 3 ? 0 : p + 1
      return hit
    })
  }
  let p4 = before.advPity4
  let p5 = before.advPity5
  return stars.map((s) => {
    const hit = (p4 + 1 >= G.advanced.pityFloor4At && s >= 4) || (p5 + 1 >= G.advanced.pityFloor5At && s >= 5)
    p4 = s >= 4 ? 0 : p4 + 1
    p5 = s >= 5 ? 0 : p5 + 1
    return hit
  })
}

/** The lineup in groups: each bond group the batch formed (two or more of its members here),
 *  best group first, then everyone else — every group best-first, ties in pull order. */
export function lineupGroups(heroes: readonly Pick<OwnedHero, 'bondGroup'>[], stars: readonly number[]): { group: string | null; order: number[] }[] {
  const order = lineupOrder(stars)
  const byGroup = new Map<string, number[]>()
  for (const i of order) {
    const g = heroes[i]!.bondGroup
    if (g) byGroup.set(g, [...(byGroup.get(g) ?? []), i])
  }
  const groups: { group: string | null; order: number[] }[] = []
  for (const [g, members] of byGroup) if (members.length >= 2) groups.push({ group: g, order: members })
  const grouped = new Set(groups.flatMap((x) => x.order))
  const rest = order.filter((i) => !grouped.has(i))
  if (rest.length > 0) groups.push({ group: null, order: rest })
  return groups
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
