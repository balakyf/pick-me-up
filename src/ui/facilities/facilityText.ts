/**
 * Readable labels for what the facility engines report in ids: the Synthesis rescue
 * ('skill: power_strike' → 'Power Strike'), grade gains ('str +1' → 'STR +1').
 */
import { SKILLS } from '../../engine/content'
import { t } from '../i18n/i18n'

/** An attribute key as the UI shows it ('str' → 'STR'). */
export function attrLabel(attr: string): string {
  return t(attr.toUpperCase())
}

/** The Synthesis preview's rescue description in words. */
export function rescueLabel(desc: string): string {
  const m = /^(skill|grade):\s*(.+)$/.exec(desc)
  if (!m) return t(desc)
  if (m[1] === 'skill') return t(SKILLS[m[2]!]?.name ?? m[2]!)
  return t('{attr} grade', { attr: attrLabel(m[2]!) })
}

/** "STR +1, AGI +2" for a Transfer's grade gains. */
export function gradeDeltaLine(deltas: Partial<Record<string, number>>): string {
  return Object.entries(deltas)
    .map(([k, v]) => `${attrLabel(k)} +${v}`)
    .join(', ')
}
