/**
 * The Enemy Codex (schema v11): what the Master has learned about each enemy — how
 * often it was met and felled, and whether its weaknesses have been studied (by
 * scouting or by beating it enough). Pure; filled in by the tower and scouting.
 */
import type { CodexState } from '../types'

export function defaultCodex(): CodexState {
  return { entries: {} }
}
