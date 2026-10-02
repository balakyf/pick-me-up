/**
 * Replay on reload (B14). The Tower dispatches a floor attempt BEFORE its replay plays (the
 * deterministic engine has already decided it; replaying later would let a reload undo a
 * death). So the replay itself is kept UI-side, in localStorage, until the Master has seen
 * the results: a reload or a closed tab mid-battle shows the fight, its death moments and
 * the results again before the lobby — permadeath is never applied in silence.
 *
 * The record names the account and the tower position the attempt left behind; anything
 * that no longer matches (a New game, an import, an older save) is discarded unseen.
 */
import type { CombatLog, FloorResult, GameState } from '../../engine/types'

export const PENDING_KEY = 'pmu.pendingReplay'

export interface PendingReplay {
  v: 1
  accountId: string
  floor: number
  savedAt: number
  log: CombatLog
  /** The attempt's result, its battle log carried once (in `log`). */
  result: Omit<FloorResult, 'result'> & { result: Omit<FloorResult['result'], 'log'> }
  /** The tower as the attempt left it (the save must agree). */
  expect: { currentFloor: number; attemptIndex: number; highestCleared: number }
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** The record for an attempt: `after` is the state the attempt produced. */
export function pendingRecord(after: GameState, result: FloorResult, now: number): PendingReplay {
  const { log, ...battle } = result.result
  return {
    v: 1,
    accountId: after.accountId,
    floor: result.floor,
    savedAt: now,
    log,
    result: { ...result, result: battle },
    expect: { currentFloor: after.tower.currentFloor, attemptIndex: after.tower.attemptIndex, highestCleared: after.tower.highestCleared },
  }
}

/** Keep the attempt's replay until its results are dismissed (a full disk only loses the replay). */
export function savePendingReplay(after: GameState, result: FloorResult, now = Date.now()): void {
  try {
    storage()?.setItem(PENDING_KEY, JSON.stringify(pendingRecord(after, result, now)))
  } catch {
    /* storage full or refused: the attempt still stands; only the reload replay is lost */
  }
}

export function clearPendingReplay(): void {
  try {
    storage()?.removeItem(PENDING_KEY)
  } catch {
    /* nothing to clear */
  }
}

/** Does a record belong to this account, at the position its attempt left the tower? */
export function pendingMatches(p: PendingReplay, state: GameState | null): boolean {
  if (!state || p.v !== 1 || p.accountId !== state.accountId) return false
  const tw = state.tower
  return tw.currentFloor === p.expect.currentFloor && tw.attemptIndex === p.expect.attemptIndex && tw.highestCleared === p.expect.highestCleared
}

/** The replay waiting for this account, as the log and the FloorResult to show; null if none
 *  (a stale or foreign record is cleared). */
export function loadPendingReplay(state: GameState | null): { log: CombatLog; result: FloorResult } | null {
  const raw = (() => {
    try {
      return storage()?.getItem(PENDING_KEY) ?? null
    } catch {
      return null
    }
  })()
  if (raw === null) return null
  let p: PendingReplay
  try {
    p = JSON.parse(raw) as PendingReplay
  } catch {
    clearPendingReplay()
    return null
  }
  if (!p || typeof p !== 'object' || !p.log || !p.result || !pendingMatches(p, state)) {
    clearPendingReplay()
    return null
  }
  return { log: p.log, result: { ...p.result, result: { ...p.result.result, log: p.log } } as FloorResult }
}
