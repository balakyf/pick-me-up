import type { CombatEvent } from '../../engine/types'
import { t } from '../i18n/i18n'
import { popupOffsets } from './choreo'

type PopupEvent = Extract<CombatEvent, { kind: 'hit' | 'miss' | 'guard' | 'heal' }>

/** The events that throw a number (or a word) over a unit. */
export function popupEvents(events: readonly CombatEvent[]): PopupEvent[] {
  return events.filter((e): e is PopupEvent => e.kind === 'hit' || e.kind === 'miss' || e.kind === 'guard' || e.kind === 'heal')
}

/** Damage numbers, MISS/GUARD and heals over their units; each animates once on mount. */
export function DamagePopups({
  events,
  pos,
  headOf,
}: {
  events: readonly PopupEvent[]
  pos: Record<string, { x: number; y: number }>
  /** Sprite height of a unit (the number floats over its head). */
  headOf: (id: string) => number
}) {
  const stack = popupOffsets(events.map((e) => ({ target: e.kind === 'heal' ? e.unitId : e.targetId })))
  return (
    <>
      {events.map((e, i) => {
        const who = e.kind === 'heal' ? e.unitId : e.targetId
        const p = pos[who]
        if (!p) return null
        const head = headOf(who)
        const text =
          e.kind === 'miss' ? t('MISS') : e.kind === 'guard' ? t('GUARD') : e.kind === 'heal' ? `+${e.amount}` : String(e.amount)
        const kill = e.kind === 'hit' && e.hpAfter <= 0
        const cls =
          e.kind === 'miss' || e.kind === 'guard' ? 'miss' : e.kind === 'heal' ? 'heal' : e.crit ? 'crit' : kill ? 'kill' : ''
        return (
          <div
            key={e.seq}
            className={`dmg ${cls}`}
            style={{ left: p.x + (stack[i]! % 2 ? 7 : 0), top: p.y - Math.min(head, 60) - 16 - stack[i]! * 11, zIndex: 999 }}
          >
            {e.kind === 'hit' && e.crit && <span className="dmg-tag">{t('CRITICAL!')}</span>}
            {text}
          </div>
        )
      })}
    </>
  )
}
