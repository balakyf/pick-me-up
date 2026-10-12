/**
 * "While you were away": the welcome-back ledger (spec 2026-10-12 S26). Owner: WP6.
 *
 * WP0 contract: `summarizeAway` returns an empty summary.
 */
import type { ChronicleKind, FacilityId, GameState, HeroId } from '../types'

/** One line of what happened while the Master was away, ranked by emotional weight. */
export interface AwayVignette {
  kind: ChronicleKind | 'completion' | 'levelUp'
  /** Higher = shown first. */
  weight: number
  heroIds: HeroId[]
  /** World-time ms it happened. */
  at: number
  detail?: string
}

export interface AwaySummary {
  /** World-ms between `before.meta.lastSeenAtWorld` and `after.meta.lastSeenAtWorld`. */
  awayWorld: number
  /** At most `TUNING.return.welcome.maxVignettes`, sorted by weight (highest first). */
  vignettes: AwayVignette[]
  /** Things to collect. */
  collect: { gold: number; restedCharges: number; loginReady: boolean }
  /** Things finished and waiting. */
  ready: {
    promotions: HeroId[]
    drills: HeroId[]
    builds: FacilityId[]
    summonAffordable: boolean
    dailyAttempts: number
  }
}

/** An empty summary (nothing happened). */
export function emptyAwaySummary(): AwaySummary {
  return {
    awayWorld: 0,
    vignettes: [],
    collect: { gold: 0, restedCharges: 0, loginReady: false },
    ready: { promotions: [], drills: [], builds: [], summonAffordable: false, dailyAttempts: 0 },
  }
}

/** Diff the state before the arrival TICK against the state after it. PURE.
 *  WP0 stub: an empty summary. */
export function summarizeAway(before: GameState, after: GameState): AwaySummary {
  return emptyAwaySummary()
}
