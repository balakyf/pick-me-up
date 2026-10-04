/** Lane Q: PvP's words (the engine writes its log notes in English; render them here). */
import { t } from '../i18n/i18n'
import { worldTimeWords } from './pvpModel'

/** The engine writes invasion-log notes in English; render them through the dictionary. */
export const NOTE_PATTERNS: [RegExp, string][] = [
  [/^raided them and took (.+) captive$/, 'raided them and took {name} captive'],
  [/^raided you and carried off (.+)$/, 'raided you and carried off {name}'],
  [/^synthesized (.+)$/, 'synthesized {name}'],
  [/^stormed their lobby and freed (.+)$/, 'stormed their lobby and freed {name}'],
  [/^failed to free (.+)$/, 'failed to free {name}'],
]

export function logNote(note: string): string {
  for (const [re, key] of NOTE_PATTERNS) {
    const m = re.exec(note)
    if (m) return t(key, { name: m[1]! })
  }
  return t(note)
}

/** "2 world-days", "5 world-h", "any moment". */
export function timeLeftText(ms: number): string {
  const w = worldTimeWords(ms)
  return w.n === undefined ? t(w.key) : t(w.key, { n: w.n })
}
