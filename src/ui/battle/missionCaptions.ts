/**
 * Captions and timings for the structured 'mission' beats the engine logs (lane D): a
 * wave cleared, a countdown's quarters, the road to the exit, an objective taken or
 * defeated, the escort's wounds, a shield breaking, a looming thing waking, the horde
 * spent. BattleScene's frames call `missionCaption`; a log saved before the beats had
 * codes falls back to its plain-English note.
 */
import type { CombatEvent, MissionCode } from '../../engine/types'
import { t } from '../i18n/i18n'

type MissionEvent = Extract<CombatEvent, { kind: 'mission' }>

/** How long each beat holds the screen at 1× (an old, code-less beat keeps 900 ms). */
export const MISSION_DURATION: Record<MissionCode, number> = {
  'wave-cleared': 900,
  hold: 1000,
  deadline: 1000,
  escape: 900,
  taken: 1300,
  defeated: 1200,
  'escort-low': 1100,
  'shield-down': 1100,
  wakes: 1400,
  'horde-spent': 1400,
  futile: 1600,
}
const PLAIN_MS = 900

export function missionDuration(e: MissionEvent): number {
  return e.code !== undefined ? MISSION_DURATION[e.code] : PLAIN_MS
}

function quarter(pct: number | undefined, at25: string, at50: string, at75: string, other: string): string {
  if (pct === 25) return t(at25)
  if (pct === 50) return t(at50)
  if (pct === 75) return t(at75)
  return t(other, { pct: pct ?? 0 })
}

/** What the scene says for a mission beat. */
export function missionCaption(e: MissionEvent, nameOf: (id: string) => string): string {
  const p = e.params ?? {}
  const name = p.unitId !== undefined ? nameOf(p.unitId) : ''
  switch (e.code) {
    case 'wave-cleared':
      return t('Wave {n} of {total} cleared!', { n: p.wave ?? 0, total: p.waves ?? 0 })
    case 'hold':
      return quarter(p.pct, 'Hold on — a quarter of the way there!', 'Halfway there — hold the line!', 'Almost there — just a little longer!', 'Hold on — {pct}% of the way there!')
    case 'deadline':
      return quarter(p.pct, 'The clock is running — three quarters of the time left.', 'Half the time is gone!', 'Time is running out!', '{pct}% of the time is gone.')
    case 'escape':
      return quarter(p.pct, 'A quarter of the way to the exit!', 'Halfway to the exit!', 'The exit is in sight!', '{pct}% of the way to the exit!')
    case 'taken':
      return t('{name} falls — the prize is ours!', { name })
    case 'defeated':
      return t('Objective down — {name} is defeated!', { name })
    case 'escort-low':
      return p.pct !== undefined && p.pct <= 25 ? t('{name} is in grave danger!', { name }) : t('{name} is wounded — keep them safe!', { name })
    case 'shield-down':
      return t("{name}'s shield breaks — strike now!", { name })
    case 'wakes':
      return t('{name} wakes…', { name })
    case 'horde-spent':
      return t('The horde is spent — the floor is held!')
    case 'futile':
      return t('Nothing we have can touch {name} — fall back!', { name })
    case undefined:
      return t(e.note)
  }
}
