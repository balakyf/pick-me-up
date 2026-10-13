/**
 * When does opening the game count as "coming back"? (spec 2026-10-12 S25/S26)
 *
 * Pure predicates on the stale, hydrated state and the real clock. They decide whether the
 * welcome-back ledger opens, whether the lobby plays the grey "Re-interference" ceremony,
 * and whether Isel's letter should wait (the ledger replaces it on arrival).
 */
import { TUNING } from '../../engine/tuning'
import type { GameState } from '../../engine/types'

const W = TUNING.return.welcome
const FACTOR = TUNING.time.worldTimeFactor
const REAL_HOUR = 3_600_000

/**
 * Saves made by the real app carry real timestamps. A `lastSeenAtWorld` before this date
 * (1 Jan 2024) means the account was never seen on a real clock — a `now: 0` test account
 * or a hand-made fixture — so there is no meaningful "time away" to celebrate.
 */
export const REAL_CLOCK_EPOCH = Date.UTC(2024, 0, 1)

/**
 * Which save this is. `accountId` alone is the same for every local account (the default
 * id), so a new game or an imported save is told apart by its seed too.
 */
export function accountKey(state: GameState): string {
  return `${state.accountId}|${state.seed}`
}

/** Real ms since the Master was last seen (negative if the clock went backwards). */
export function awayRealMs(state: GameState, nowReal: number): number {
  return nowReal - state.meta.lastSeenAtWorld / FACTOR
}

/** The account was last seen on a real clock (not the epoch). */
export function seenOnRealClock(state: GameState): boolean {
  return state.meta.lastSeenAtWorld / FACTOR >= REAL_CLOCK_EPOCH
}

/** A brand-new Master, whom the lobby greets with Isel's welcome instead (same predicate
 *  as the lobby's first-visit dialog). */
export function isFreshMaster(state: GameState): boolean {
  return !state.life.guide.tutorialPull && !state.life.guide.done.includes('welcome') && state.tower.highestCleared === 0
}

/**
 * Real ms the Master has really been gone: since the engine last saw them, or since the UI
 * last saw them active (`lastActiveReal`, real epoch-ms; null when unknown), whichever is
 * later. Off-lobby scenes (Tower, Summon, Party, Roster) dispatch without the real clock, so
 * `lastSeenAtWorld` alone would call a long session there an absence.
 */
export function idleRealMs(state: GameState, nowReal: number, lastActiveReal: number | null = null): number {
  const seen = awayRealMs(state, nowReal)
  return lastActiveReal === null ? seen : Math.min(seen, nowReal - lastActiveReal)
}

/** Opening the game now is an arrival worth a welcome-back ledger: a real Master, seen on
 *  a real clock, away (and not active anywhere in the game) at least `minAwayRealHours`. */
export function isArrival(state: GameState, nowReal: number, lastActiveReal: number | null = null): boolean {
  if (state.meta.deleted || isFreshMaster(state) || !seenOnRealClock(state)) return false
  return idleRealMs(state, nowReal, lastActiveReal) >= W.minAwayRealHours * REAL_HOUR
}

/** Away so long the lobby opens grey and the colour floods back (cosmetic only, S25). */
export function isGreyArrival(state: GameState, nowReal: number, lastActiveReal: number | null = null): boolean {
  return isArrival(state, nowReal, lastActiveReal) && idleRealMs(state, nowReal, lastActiveReal) >= W.greyAfterRealDays * 24 * REAL_HOUR
}

/** A visibility return (the tab was hidden, not closed) long enough to welcome. */
export function isLongHide(hiddenRealMs: number): boolean {
  return hiddenRealMs >= W.minAwayRealHours * REAL_HOUR
}
