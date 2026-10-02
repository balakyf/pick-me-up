import type { CombatEvent } from '../../engine/types'
import { t } from '../i18n/i18n'
import { popupLanes, type PopupBox } from './choreo'

type PopupEvent = Extract<CombatEvent, { kind: 'hit' | 'miss' | 'guard' | 'heal' }>

/** The events that throw a number (or a word) over a unit. */
export function popupEvents(events: readonly CombatEvent[]): PopupEvent[] {
  return events.filter((e): e is PopupEvent => e.kind === 'hit' || e.kind === 'miss' || e.kind === 'guard' || e.kind === 'heal')
}

/** Font size (stage px) of each kind of number (battle.css `.dmg.*`). */
const FONT_PX: Record<string, number> = { crit: 19, kill: 15, heal: 11, miss: 10, '': 12 }
/** The 'CRITICAL!' tag over a crit is about this wide. */
const CRIT_TAG_W = 46

function popupLook(e: PopupEvent): { text: string; cls: string } {
  const text = e.kind === 'miss' ? t('MISS') : e.kind === 'guard' ? t('GUARD') : e.kind === 'heal' ? `+${e.amount}` : String(e.amount)
  const kill = e.kind === 'hit' && e.hpAfter <= 0
  const cls = e.kind === 'miss' || e.kind === 'guard' ? 'miss' : e.kind === 'heal' ? 'heal' : e.crit ? 'crit' : kill ? 'kill' : ''
  return { text, cls }
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
  const shown = events
    .map((e) => {
      const who = e.kind === 'heal' ? e.unitId : e.targetId
      const p = pos[who]
      if (!p) return null
      const look = popupLook(e)
      const px = FONT_PX[look.cls] ?? 12
      const box: PopupBox = {
        x: p.x,
        y: p.y - Math.min(headOf(who), 60) - 16,
        w: Math.max(Math.ceil(look.text.length * px * 0.72) + 4, look.cls === 'crit' ? CRIT_TAG_W : 0),
        h: px + (look.cls === 'crit' ? 8 : 2),
      }
      return { e, look, box }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
  // Lanes: numbers on one unit stack, and numbers on neighbours never merge.
  const lifts = popupLanes(shown.map((s) => s.box))
  return (
    <>
      {shown.map(({ e, look, box }, i) => (
        <div key={e.seq} className={`dmg ${look.cls}`} style={{ left: box.x, top: box.y - lifts[i]!, zIndex: 999 }}>
          {e.kind === 'hit' && e.crit && <span className="dmg-tag">{t('CRITICAL!')}</span>}
          {look.text}
        </div>
      ))}
    </>
  )
}
