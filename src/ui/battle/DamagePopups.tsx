import { HITSTOP_MS } from './battleFrames'
import { planPopups, type PopupInput } from './popupStyle'
import './hitEffect.css'

export { isPopupEvent, popupLook, type PopupEvent } from './popupStyle'

/**
 * Damage numbers, heals, MISS / GUARD / IMMUNE and HP costs over their units; each
 * animates once on mount. The plan (popupStyle.ts) sizes each number by the share of HP
 * it took, colours it by element, staggers a sweep's numbers and lifts them into lanes.
 */
export function DamagePopups({
  items,
  pos,
  headOf,
  zoom,
  speed,
  bounds,
}: {
  items: readonly PopupInput[]
  pos: Record<string, { x: number; y: number }>
  /** Sprite height of a unit (the number floats over its head). */
  headOf: (id: string) => number
  /** The stage's scale (keeps the numbers readable on a phone). */
  zoom: number
  speed: number
  /** The visible stretch of the canon (numbers stay on it). */
  bounds?: { left: number; right: number }
}) {
  const plan = planPopups(items, pos, headOf, zoom, bounds)
  return (
    <>
      {plan.map((p) => (
        <div
          key={p.key}
          className={`dmg ${p.look.cls}`}
          style={{
            left: p.x,
            top: p.y,
            zIndex: 999,
            fontSize: `${p.fs}px`,
            lineHeight: `${p.fs}px`,
            color: p.color,
            ['--dmg-color' as string]: p.color,
            animationDelay: `${Math.round(p.delayMs / speed + (p.look.cls === 'crit' ? HITSTOP_MS : 0))}ms`,
          }}
        >
          {p.look.tags.length > 0 && (
            <span className="dmg-tags" style={{ fontSize: `${p.tagFs}px`, lineHeight: `${p.tagFs + 1}px` }}>
              {p.look.tags.map((tg) => (
                <span key={tg.cls} className={`dmg-tag ${tg.cls}`}>
                  {tg.text}
                </span>
              ))}
            </span>
          )}
          {p.look.text}
        </div>
      ))}
    </>
  )
}
