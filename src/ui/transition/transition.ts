/**
 * Scene transitions (lane K), the pure half: which transition plays between two scenes,
 * how long it runs, and when each block of the pixel curtain drops away. The component
 * (SceneTransition.tsx) only renders what this says.
 *
 * The curtain is a grid of blocks that covers the screen the instant the scene changes
 * (the new scene is never seen uncovered) and opens onto it: a diagonal **wipe** between
 * the lobby and its rooms, an **iris** from the centre into a battle, the results and the
 * summoning circle. Under reduced motion it is a short **fade**; between identical scenes,
 * or on the first scene of a session, nothing plays.
 */
import { hashString } from '../pixel/rand'

export type Scene = 'title' | 'lobby' | 'tower' | 'summon' | 'party' | 'roster' | 'battle' | 'results'
export type TransitionStyle = 'wipe' | 'iris' | 'fade' | 'none'

export interface TransitionPlan {
  style: TransitionStyle
  /** The whole transition, ms (0 for none). */
  ms: number
}

/** Base lengths (ms) at full motion. */
export const TRANSITION_MS = { wipe: 420, iris: 520, fade: 180 } as const

/** Scenes that open with an iris (a moment, not a room). */
const IRIS: ReadonlySet<Scene> = new Set<Scene>(['battle', 'results', 'summon'])

/** The transition from one scene to the next. */
export function transitionFor(from: Scene | null, to: Scene, reduced: boolean): TransitionPlan {
  if (from === null || from === to) return { style: 'none', ms: 0 }
  if (reduced) return { style: 'fade', ms: TRANSITION_MS.fade }
  if (IRIS.has(to)) return { style: 'iris', ms: TRANSITION_MS.iris }
  return { style: 'wipe', ms: TRANSITION_MS.wipe }
}

/** The curtain's grid for a viewport (square-ish blocks, 10–20 across). */
export function curtainGrid(width: number, height: number): { cols: number; rows: number } {
  const cols = Math.max(10, Math.min(20, Math.round(width / 64)))
  const block = Math.max(1, width) / cols
  const rows = Math.max(6, Math.ceil(Math.max(1, height) / block))
  return { cols, rows }
}

/** How long one block takes to shrink away once its turn comes (ms; a share of the whole). */
export function blockMs(plan: TransitionPlan): number {
  return Math.round(plan.ms * 0.3)
}

/**
 * When each block (row-major) starts to drop away, ms from the start. A wipe runs
 * corner to corner with a little seeded jitter (pixel-ragged, the same every time); an
 * iris opens from the centre outward. Every delay fits inside `ms - blockMs`.
 */
export function curtainDelays(plan: TransitionPlan, cols: number, rows: number): number[] {
  const n = cols * rows
  if (plan.style !== 'wipe' && plan.style !== 'iris') return new Array<number>(n).fill(0)
  const span = Math.max(0, plan.ms - blockMs(plan))
  const out: number[] = []
  const cx = (cols - 1) / 2
  const cy = (rows - 1) / 2
  const maxR = Math.sqrt(cx * cx + cy * cy) || 1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let f: number
      if (plan.style === 'iris') {
        f = Math.sqrt((c - cx) * (c - cx) + (r - cy) * (r - cy)) / maxR
      } else {
        const diag = (c + r) / Math.max(1, cols + rows - 2)
        const jitter = ((hashString(`wipe|${c}|${r}`) % 7) - 3) / 40
        f = Math.max(0, Math.min(1, diag + jitter))
      }
      out.push(Math.round(f * span))
    }
  }
  return out
}
