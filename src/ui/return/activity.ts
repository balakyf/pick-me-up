/**
 * The Master's real activity, per browser (presentation only; never part of the save).
 *
 * The engine's `meta.lastSeenAtWorld` moves only on dispatches that carry the real clock —
 * in practice the lobby's 1 s TICK. A long Tower, Summon, Party or Roster session leaves it
 * where the lobby did, so a reload after two hours of play would read as an absence. The
 * return layer therefore notes the last time the Master was really here (a click or key, a
 * command, the tab shown again) and judges an arrival from the later of the two.
 */
import type { GameState } from '../../engine/types'
import { accountKey } from './arrival'

export const LAST_ACTIVE_KEY = 'pmu.lastActive'
/** Writes are throttled to one per this many ms (a 2-hour threshold needs no finer grain). */
export const ACTIVE_WRITE_EVERY_MS = 10_000

interface Stamp {
  account: string
  at: number
}

/** When this account was last active in this browser (real epoch-ms), or null. */
export function readLastActive(state: GameState | null): number | null {
  if (!state) return null
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVE_KEY)
    if (raw === null) return null
    const s = JSON.parse(raw) as Partial<Stamp>
    return s.account === accountKey(state) && typeof s.at === 'number' && Number.isFinite(s.at) ? s.at : null
  } catch {
    return null
  }
}

/** Note that the Master is active now. */
export function noteActive(state: GameState | null, nowReal: number): void {
  if (!state) return
  try {
    window.localStorage.setItem(LAST_ACTIVE_KEY, JSON.stringify({ account: accountKey(state), at: nowReal } satisfies Stamp))
  } catch {
    /* storage may be unavailable */
  }
}
