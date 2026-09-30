/**
 * The predatory layer (Layer 3 §D3) — modeled as the source's SATIRE of gacha
 * monetization. "Money" is simulated: a package records a fictional USD spend in
 * `meta.wallet` and grants gems/gold; nothing here ever takes a real payment.
 *
 *   packages      — gem bundles at price points; the canon Monthly Package pays
 *                   150 gems + 10,000 gold on each claimed day for 30 days
 *   today only    — one package rotates each world-day at a discount (FOMO)
 *   login streak  — daily gems; the 7th day pays a bonus; a missed day resets it
 *   frustration   — after a long dry Advanced streak, a "so close!" bundle appears
 *   whale-bait    — (in gacha) a 3★ may be *shown* as 4★ after a dry streak; the
 *                   goddess's lie is revealed at Master Lv 25 or the hero's true cap
 *
 * PURE and DETERMINISTIC.
 */

import type { GameState, OwnedHero } from '../types'
import { TUNING } from '../tuning'
import { worldDayIndex } from '../daily'
import { addPi } from '../interference'

const S = TUNING.shop

/** The package on today's discount. */
export function todayOffer(dayIndex: number): string {
  return S.todayOnly[((dayIndex % S.todayOnly.length) + S.todayOnly.length) % S.todayOnly.length]!
}

/** Simulated price of a package today (the today-only package is discounted). */
export function packagePrice(id: string, dayIndex: number): number {
  const pkg = S.packages[id]
  if (!pkg) return 0
  const price = id === todayOffer(dayIndex) ? pkg.usd * (1 - S.todayDiscount) : pkg.usd
  return Math.round(price * 100) / 100
}

/** Is the frustration-avoidance "so close!" bundle on offer? */
export function frustrationDeal(state: GameState): boolean {
  return state.gacha.advPity4 >= S.frustrationPity
}

/** Why a package can't be bought now, or null. */
export function packageRefusal(state: GameState, id: string): string | null {
  if (!S.packages[id]) return 'No such package.'
  if (id === 'so_close' && !frustrationDeal(state)) return 'That deal is not on offer right now.'
  if (id === 'monthly' && state.meta.monthly !== null) return 'A Monthly Package is already running.'
  return null
}

/** "Buy" a package with simulated money. Throws when refused. PURE. */
export function buyPackage(state: GameState, id: string, nowWorld: number): GameState {
  const refusal = packageRefusal(state, id)
  if (refusal !== null) throw new Error(`buyPackage: ${refusal}`)
  const pkg = S.packages[id]!
  const usd = packagePrice(id, worldDayIndex(nowWorld))
  const wallet = {
    spentUsd: Math.round((state.meta.wallet.spentUsd + usd) * 100) / 100,
    purchases: { ...state.meta.wallet.purchases, [id]: (state.meta.wallet.purchases[id] ?? 0) + 1 },
  }
  const monthly = id === 'monthly' ? { daysLeft: S.monthlyDays, lastClaimDay: -1 } : state.meta.monthly
  return {
    ...state,
    gems: state.gems + pkg.gems,
    gold: state.gold + pkg.gold,
    meta: { ...state.meta, wallet, monthly },
  }
}

/** Has today's login been claimed? */
export function loginClaimed(state: GameState, nowWorld: number): boolean {
  return state.meta.login.lastDay === worldDayIndex(nowWorld)
}

/** The streak a claim today would reach (resets after a missed day). */
export function nextStreak(state: GameState, nowWorld: number): number {
  const day = worldDayIndex(nowWorld)
  return state.meta.login.lastDay === day - 1 ? state.meta.login.streak + 1 : 1
}

/** Claim today's login: gems (+ the 7th-day bonus) and a little Probability Interference. */
export function claimLogin(state: GameState, nowWorld: number): GameState {
  if (loginClaimed(state, nowWorld)) throw new Error('claimLogin: already claimed today')
  const streak = nextStreak(state, nowWorld)
  const gems = S.loginGems + (streak % 7 === 0 ? S.streakBonusGems : 0)
  const meta = addPi({ ...state.meta, login: { lastDay: worldDayIndex(nowWorld), streak } }, TUNING.interference.perLogin)
  return { ...state, gems: state.gems + gems, meta }
}

/** Claim today's Monthly Package payout (150 gems + 10,000 gold). */
export function claimMonthly(state: GameState, nowWorld: number): GameState {
  const m = state.meta.monthly
  const day = worldDayIndex(nowWorld)
  if (m === null) throw new Error('claimMonthly: no Monthly Package is running')
  if (m.lastClaimDay === day) throw new Error('claimMonthly: already claimed today')
  const daysLeft = m.daysLeft - 1
  return {
    ...state,
    gems: state.gems + S.monthlyGems,
    gold: state.gold + S.monthlyGold,
    meta: { ...state.meta, monthly: daysLeft > 0 ? { daysLeft, lastClaimDay: day } : null },
  }
}

/** Is the whale-bait lie about this hero's star revealed yet? */
export function baitRevealed(hero: OwnedHero, masterLevel: number): boolean {
  return masterLevel >= S.revealMasterLevel || hero.xp.atCap
}

/** The star the UI should show: the bait star until the lie is revealed. */
export function shownStar(hero: OwnedHero, masterLevel: number): number {
  return hero.displayStar !== undefined && !baitRevealed(hero, masterLevel) ? hero.displayStar : hero.star
}
