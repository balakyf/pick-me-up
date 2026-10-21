/**
 * No permanent loss while the Master is away (spec 2026-10-12 S28). Owner: WP6.
 *
 * The lobby pumps the world clock once a second while the Master is watching, so a gap no
 * longer than `LIVE_GAP_WORLD` is live play; anything longer is time away. Clocks that end
 * in a permanent loss (a captive's synthesis deadline) only run during live play: the
 * away part of a gap is a pause.
 *
 * PURE and DETERMINISTIC.
 */
import { TUNING } from '../tuning'

/** The longest gap (world-ms) still counted as live play: `return.offline.liveGapRealSeconds`
 *  real seconds (30). A hidden tab's throttled timers (about one tick a minute) therefore
 *  count as away. */
export const LIVE_GAP_WORLD = TUNING.return.offline.liveGapRealSeconds * 1000 * TUNING.time.worldTimeFactor

/** The part of a gap (world-ms) during which offline-only clocks are paused. */
export function awayPause(gapWorld: number): number {
  return gapWorld > LIVE_GAP_WORLD ? gapWorld - LIVE_GAP_WORLD : 0
}

/** The fraction of the storeroom a lost invasion may take: capped to a token amount. */
export function storeroomLossPct(): number {
  return Math.min(TUNING.pvp.storeLoss, TUNING.return.offline.theftCapPct)
}
