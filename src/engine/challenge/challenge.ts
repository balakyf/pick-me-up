/**
 * Tower challenges beyond the plain climb (schema v11): bond groups summoned together,
 * event floors, multi-party raids and the weekly Crack of Time trial. Pure.
 *
 * This file holds the slice's defaults and the small helpers every part shares; the rules
 * live in bonds.ts, rooms.ts, raid.ts and weekly.ts.
 */
import type { ChallengeState, GameState, HeroClass, HeroId, Line, OwnedHero } from '../types'

export function defaultChallenge(): ChallengeState {
  return {
    bondGroups: {},
    weekly: { week: -1, attempts: 0, best: 0, claimed: 0 },
    room: null,
    blessing: null,
    raids: {},
  }
}

/** The account's challenge slice with every field present (a save written before a field
 *  existed reads it as its default). */
export function challengeOf(state: GameState): ChallengeState {
  const d = defaultChallenge()
  const c = state.challenge ?? d
  return {
    bondGroups: c.bondGroups ?? d.bondGroups,
    weekly: { ...d.weekly, ...(c.weekly ?? {}) },
    room: c.room ?? null,
    blessing: c.blessing ?? null,
    raids: c.raids ?? {},
  }
}

/** Is a hero fit to fight a tower battle right now (as the tower deploys them)? */
export function fitToFight(h: OwnedHero | undefined): h is OwnedHero {
  return !!h && h.alive && h.sanity > 0 && h.training === null && h.expedition === null && !h.captiveOf && h.promotion === null
}

const CLASS_LINE: Record<HeroClass, Line> = {
  warrior: 'front',
  spearman: 'front',
  thief: 'mid',
  archer: 'back',
  mage: 'back',
}

/** The line a hero takes in an auto-formed party: blades in front, thieves in the middle,
 *  bows and staves at the back; the classless hold the middle. */
export function lineFor(h: OwnedHero): Line {
  return h.heroClass ? CLASS_LINE[h.heroClass] : 'mid'
}

/** Loose pages of the Book of Reverse Heaven bind into a Book once there are enough. */
export function bindPages(materials: Record<string, number>, pagesPerBook: number): { materials: Record<string, number>; bound: boolean } {
  const pages = materials.reverseHeavenPage ?? 0
  if (pages < pagesPerBook) return { materials, bound: false }
  return {
    materials: { ...materials, reverseHeavenPage: pages - pagesPerBook, bookOfReverseHeaven: (materials.bookOfReverseHeaven ?? 0) + 1 },
    bound: true,
  }
}

/** Distinct ids, in order. */
export function distinct(ids: readonly HeroId[]): HeroId[] {
  return [...new Set(ids)]
}
