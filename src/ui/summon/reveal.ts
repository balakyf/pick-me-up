/**
 * Summon Theatre — the pure half (spec 2026-10-12 S2). Everything the reveal sequence
 * decides lives here so it can be tested without a DOM:
 *
 * - the order the cards flip in (ascending shown rarity, best last, stable ties);
 * - how long each face-down card is held before it turns (by shown rarity);
 * - the colour "tell" the circle and the card backs speak in: white → blue → gold →
 *   rainbow. A tell only ever goes UP. When the pull's best card is ≥3★, a deterministic
 *   ~30% of pulls hold the circle one tier low and upgrade it on the first card of the
 *   top tier (the last card, unless the pull has several of them) — the "surprise";
 *   there is never a fake-out downgrade.
 *
 * Presentation randomness is hash-based (`hashString`), never Math.random, so the same
 * pull always stages the same way. Ratings come from `shownStar`, the star the player is
 * shown (the whale-bait display star until Master Lv 25).
 */
import type { OwnedHero, Star } from '../../engine/types'
import { shownStar } from '../../engine/shop'
import { hashString } from '../pixel/rand'

/** The tell ladder: 0 white, 1 blue, 2 gold, 3 rainbow. */
export type TellTier = 0 | 1 | 2 | 3

/** The colour of each tell tier (rainbow's base colour; CSS animates its hue). */
export const TELL_COLOR: Readonly<Record<TellTier, string>> = {
  0: '#fff6e0',
  1: '#4aa3ff',
  2: '#f2c75c',
  3: '#ef5d6b',
}

/** The six bands a rainbow tell cycles through (the 4★+ circle draws its rings in these). */
export const RAINBOW: readonly string[] = ['#ef5d6b', '#f2a65a', '#f2c75c', '#5fd08a', '#4aa3ff', '#b07adb']

/** The tell a shown rarity earns: 1★ white, 2★ blue, 3★ gold, 4★+ rainbow. */
export function tellTier(star: number): TellTier {
  if (star >= 4) return 3
  if (star === 3) return 2
  if (star === 2) return 1
  return 0
}

/**
 * How long a face-down card glows before it turns, in ms (≈250 ms for 1★, 600 ms for
 * 2★, 1.5 s for 3★, 3 s for 4★+). The player can always cut it short.
 */
export const HOLD_MS: Readonly<Record<TellTier, number>> = { 0: 250, 1: 600, 2: 1500, 3: 3000 }

export function holdMs(star: number): number {
  return HOLD_MS[tellTier(star)]
}

/** How long each step of the circle's escalation lasts, in ms (single pulls run quicker). */
export const RITUAL_OPEN_MS = 700
export const RITUAL_STEP_MS = 550
export const RITUAL_STEP_MS_SINGLE = 350
export const RITUAL_SETTLE_MS = 500

/** One card in the theatre. */
export interface RevealCard {
  hero: OwnedHero
  /** The star the player is shown (never the hidden true star). */
  star: Star
  /** Its tell tier. */
  tier: TellTier
  /** The face-down hold, ms. */
  holdMs: number
  /** Its position in the original pull (0-based). */
  pullIndex: number
}

export interface RevealPlan {
  /** Ascending by shown star, best last. */
  cards: RevealCard[]
  /** The best shown star of the pull. */
  bestStar: Star
  /** The tier the pull finally reaches. */
  finalTier: TellTier
  /** True when the circle holds one tier low and upgrades on the first top-tier card. */
  surprise: boolean
  /**
   * The card that springs the surprise: the FIRST card of the final tier (the last card
   * when the pull has a single best card). -1 when there is no surprise. Upgrading on the
   * first top-tier card, not the very last, keeps an earlier top-tier back from glowing
   * above the circle and spoiling it.
   */
  surpriseAt: number
  /** The tiers the circle climbs through before any card turns (starts at white). */
  ritualTells: TellTier[]
  /** The full tell sequence: the circle's climb, then the last card's upgrade if any. */
  tells: TellTier[]
  /** The total time of the circle's climb, ms (click skips it). */
  ritualMs: number
}

/**
 * Order a pull for the theatre: ascending shown star; among equals, the hero with fewer
 * skills first (so a tutorial 3★ that knows its signature skill turns last), then the
 * original pull order. Stable and total, so the same pull always deals the same way.
 */
export function revealOrder(heroes: readonly OwnedHero[], masterLevel: number): RevealCard[] {
  return heroes
    .map((hero, pullIndex) => {
      const star = shownStar(hero, masterLevel) as Star
      return { hero, star, tier: tellTier(star), holdMs: holdMs(star), pullIndex }
    })
    .sort((a, b) => a.star - b.star || a.hero.skills.length - b.hero.skills.length || a.pullIndex - b.pullIndex)
}

/**
 * Should this pull hold its tell one tier low until the last card? Only when the best
 * card is ≥3★, and for a deterministic ~30% of pulls (by the heroes' ids).
 */
export function isSurprise(heroes: readonly OwnedHero[], bestStar: number): boolean {
  if (bestStar < 3) return false
  return hashString(heroes.map((h) => h.id).join('|')) % 10 < 3
}

/** Plan the whole theatre for one pull. PURE. */
export function revealPlan(heroes: readonly OwnedHero[], masterLevel: number): RevealPlan {
  const cards = revealOrder(heroes, masterLevel)
  const bestStar = (cards.length > 0 ? cards[cards.length - 1]!.star : 1) as Star
  const finalTier = tellTier(bestStar)
  const surprise = isSurprise(heroes, bestStar)
  const peak = (surprise ? finalTier - 1 : finalTier) as TellTier
  const ritualTells: TellTier[] = []
  for (let k = 0; k <= peak; k++) ritualTells.push(k as TellTier)
  const tells = surprise ? [...ritualTells, finalTier] : [...ritualTells]
  const step = cards.length > 1 ? RITUAL_STEP_MS : RITUAL_STEP_MS_SINGLE
  const ritualMs = RITUAL_OPEN_MS + step * peak + RITUAL_SETTLE_MS
  const surpriseAt = surprise ? cards.findIndex((c) => c.tier === finalTier) : -1
  return { cards, bestStar, finalTier, surprise, surpriseAt, ritualTells, tells, ritualMs }
}

/** When (ms after the theatre opens) the circle reaches the k-th tell of its climb. */
export function ritualStepAt(plan: Pick<RevealPlan, 'cards'>, k: number): number {
  if (k <= 0) return 0
  const step = plan.cards.length > 1 ? RITUAL_STEP_MS : RITUAL_STEP_MS_SINGLE
  return RITUAL_OPEN_MS + step * (k - 1)
}

/**
 * The tell the circle shows while card `index` is up: the ritual's peak until the
 * surprise card has upgraded (`upgraded`, i.e. halfway through its hold or once it is
 * turned), the final tier from then on. Never decreases along the theatre's steps.
 */
export function circleTellAt(plan: RevealPlan, index: number, upgraded = true): TellTier {
  const peak = plan.ritualTells[plan.ritualTells.length - 1] ?? 0
  if (!plan.surprise || plan.surpriseAt < 0) return peak
  if (index > plan.surpriseAt || (index === plan.surpriseAt && upgraded)) return plan.finalTier
  return peak
}

/** Is card `index` the one that springs the surprise? */
export function isSurpriseCard(plan: RevealPlan, index: number): boolean {
  return plan.surprise && index === plan.surpriseAt
}

/**
 * What a face-down card's back shows during its hold. The surprise card first shows the
 * circle's (lower) tell, then upgrades to its own; every other card shows its own.
 */
export function backTell(plan: RevealPlan, index: number, upgraded: boolean): TellTier {
  const card = plan.cards[index]
  if (!card) return 0
  if (isSurpriseCard(plan, index) && !upgraded) return (card.tier - 1) as TellTier
  return card.tier
}
