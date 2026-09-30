/**
 * The estate (schema v11): what the Master spends gold on once the buildings stand —
 * statues for the fallen, decorations that lift the heroes' days, the bounty board.
 * Pure.
 */
import type { EstateState } from '../types'

export function defaultEstate(): EstateState {
  return { statues: [], decor: {} }
}
