/**
 * The combo counter (spec 2026-10-12, S8; WP2). Between enemy actions the party lands
 * a median of 5 blows in a row; counting them out loud ("5 HITS!") and stepping the hit
 * sound up a pentatonic scale turns a run of auto-attacks into a streak. Pure.
 */
import type { CombatLog } from '../../engine/types'

/** The counter shows from this many hits in a row. */
export const COMBO_MIN = 3

/**
 * The combo count at every frame (index c = after events[c - 1]; length events + 1).
 * A party hit (heroes and mission allies) adds one; an enemy's action, a new wave and
 * the end of the fight reset it.
 */
export function comboSeries(log: CombatLog): number[] {
  const side = new Map(log.unitsInit.map((u) => [u.id, u.side]))
  const out: number[] = [0]
  let n = 0
  for (const e of log.events) {
    if (e.kind === 'hit' && side.get(e.actorId) === 'hero') n++
    else if (e.kind === 'act' && side.get(e.actorId) === 'enemy') n = 0
    else if (e.kind === 'wave-spawn' || e.kind === 'end' || e.kind === 'battle-start') n = 0
    out.push(n)
  }
  return out
}

/**
 * Semitone offsets that keep a rising combo on the A-minor pentatonic of the battle
 * theme (the hit cue sits on E): E G A C D E G A …
 */
const PENTATONIC_FROM_E = [0, 3, 5, 8, 10, 12, 15, 17] as const

/** Transposition for the n-th hit of a combo (1 = the root). Capped at the top step. */
export function comboSemis(n: number): number {
  if (!Number.isFinite(n) || n <= 1) return 0
  return PENTATONIC_FROM_E[Math.min(PENTATONIC_FROM_E.length - 1, Math.floor(n) - 1)]!
}
