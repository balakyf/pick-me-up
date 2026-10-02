import type { CombatEvent } from '../../engine/types'
import { t } from '../i18n/i18n'
import { popupLanes, type PopupBox } from './choreo'
import './hitEffect.css'

type PopupEvent = Extract<CombatEvent, { kind: 'hit' | 'miss' | 'guard' | 'heal' }>

/** The events that throw a number (or a word) over a unit. */
export function popupEvents(events: readonly CombatEvent[]): PopupEvent[] {
  return events.filter((e): e is PopupEvent => e.kind === 'hit' || e.kind === 'miss' || e.kind === 'guard' || e.kind === 'heal')
}

/** Font size (stage px) of each kind of number (battle.css / hitEffect.css `.dmg.*`). */
const FONT_PX: Record<string, number> = { crit: 19, kill: 15, heal: 11, miss: 10, immune: 10, weak: 13, resist: 11, '': 12 }
/** Stage px per character of the small tag over a number ('CRITICAL!' is about 46 wide). */
const TAG_PX_PER_CHAR = 5.1

/**
 * How a popup reads: its text, its class, and the small tag over it — CRITICAL! for a
 * crit, WEAK! / RESIST for a blow that met the foe's weakness or resistance. A blow the
 * foe is immune to reads IMMUNE (never 'CRITICAL! 0').
 */
export function popupLook(e: PopupEvent): { text: string; cls: string; tag: string | null; tagCls: string } {
  if (e.kind === 'miss') return { text: t('MISS'), cls: 'miss', tag: null, tagCls: '' }
  if (e.kind === 'guard') return { text: t('GUARD'), cls: 'miss', tag: null, tagCls: '' }
  if (e.kind === 'heal') return { text: `+${e.amount}`, cls: 'heal', tag: null, tagCls: '' }
  if (e.eff === 'immune') return { text: t('IMMUNE'), cls: 'immune', tag: null, tagCls: '' }
  const kill = e.hpAfter <= 0
  const cls = e.crit ? 'crit' : kill ? 'kill' : e.eff === 'weak' ? 'weak' : e.eff === 'resist' ? 'resist' : ''
  const tags = [e.crit ? t('CRITICAL!') : null, e.eff === 'weak' ? t('WEAK!') : e.eff === 'resist' ? t('RESIST') : null].filter(
    (x): x is string => x !== null,
  )
  return { text: String(e.amount), cls, tag: tags.length > 0 ? tags.join(' ') : null, tagCls: e.eff === 'weak' || e.eff === 'resist' ? e.eff : '' }
}

/** Damage numbers, MISS/GUARD/IMMUNE and heals over their units; each animates once on mount. */
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
        w: Math.max(Math.ceil(look.text.length * px * 0.72) + 4, look.tag !== null ? Math.ceil(look.tag.length * TAG_PX_PER_CHAR) + 4 : 0),
        h: px + (look.tag !== null ? 8 : 2),
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
          {look.tag !== null && <span className={`dmg-tag ${look.tagCls}`}>{look.tag}</span>}
          {look.text}
        </div>
      ))}
    </>
  )
}
