/**
 * Where a replay picks up after a mid-battle order (B16), pure.
 *
 * An order given at tick T lands at the start of tick T+1, and combat is deterministic, so
 * the re-resolved log repeats the old one event for event through the end of tick T. The
 * replay therefore keeps playing from the frame on screen: the rest of tick T (the AoE's
 * other hits, a kill, a hero's death moment and last words) still plays, then the order.
 * (The old code jumped to the first event of tick T+1 and skipped them.) Should the two
 * logs ever part earlier, the replay resumes where they part, never past it.
 *
 * `cursor` is the frame index (frame i follows event i − 1).
 */
import type { CombatEvent, CombatLog } from '../../engine/types'

function same(a: CombatEvent | undefined, b: CombatEvent | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b))
}

export function resumeCursor(prev: CombatLog, next: CombatLog, cursor: number): number {
  const n = Math.max(0, Math.min(cursor, prev.events.length, next.events.length))
  for (let i = 0; i < n; i++) if (!same(prev.events[i], next.events[i])) return i
  return n
}
