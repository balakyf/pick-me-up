import { t } from '../i18n/i18n'
import { chargeProgress, moveName, type BossView } from './bossCaptions'
import './bossBattle.css'

/** A countdown ring (SVG): the arc fills as the wind-up runs out. */
function Ring({ progress }: { progress: number }) {
  const r = 7
  const c = 2 * Math.PI * r
  return (
    <svg className="tg-ring" viewBox="0 0 18 18" aria-hidden="true">
      <circle className="tg-ring-bg" cx="9" cy="9" r={r} />
      <circle className="tg-ring-fill" cx="9" cy="9" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - progress)} transform="rotate(-90 9 9)" />
    </svg>
  )
}

/**
 * The telegraphs on the stage (lane G): over each foe winding up a big move, a '!' inside a
 * countdown ring and the move's name; under each unit it threatens, a red reticle. Drawn in
 * stage coordinates inside `.battle-units` (so they scale with the stage). Presentation only:
 * the engine's 'telegraph' events decide everything (bossCaptions.ts keeps the view).
 */
export function Telegraphs({
  view,
  pos,
  heightOf,
  dead,
  tick,
  atEnd,
}: {
  view: BossView | undefined
  pos: Record<string, { x: number; y: number }>
  heightOf: (id: string) => number
  dead: Record<string, boolean>
  /** The tick the replay stands on (the ring's fill). */
  tick: number
  atEnd: boolean
}) {
  if (atEnd || view === undefined || view.charges.length === 0) return null
  const threatened = new Set<string>()
  for (const c of view.charges) for (const id of c.targets) if (!dead[id]) threatened.add(id)
  return (
    <>
      {[...threatened].map((id) => {
        const p = pos[id]
        if (!p) return null
        return <div key={`th-${id}`} className="tg-reticle" style={{ left: p.x, top: p.y }} aria-hidden="true" />
      })}
      {view.charges.map((c) => {
        const p = pos[c.unitId]
        if (!p || dead[c.unitId]) return null
        const progress = chargeProgress(c, tick)
        const left = Math.max(0, c.firesAtTick - tick)
        return (
          <div
            key={`tg-${c.unitId}`}
            className="tg-mark"
            style={{ left: p.x, top: p.y - heightOf(c.unitId) - 4 }}
            role="img"
            aria-label={t('{move} in {n} ticks', { move: moveName(c.skillId), n: left })}
          >
            <Ring progress={progress} />
            <span className="tg-bang">!</span>
            <span className="tg-move">{moveName(c.skillId)}</span>
          </div>
        )
      })}
    </>
  )
}
