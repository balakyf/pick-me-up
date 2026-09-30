/**
 * Tower challenges beyond the plain climb (schema v11): bond groups summoned together,
 * event floors, multi-party raids and the weekly Crack of Time trial. Pure.
 */
import type { ChallengeState } from '../types'

export function defaultChallenge(): ChallengeState {
  return { bondGroups: {}, weekly: { week: -1, attempts: 0, best: 0 } }
}
