import type { CombatUnitInit } from '../../engine/types'
import { t } from '../i18n/i18n'
import type { Snap } from './battleFrames'
import { HpBar } from './HpBar'
import type { ObjectiveView } from './objectives'
import { ObjectiveMark } from './ObjectiveMark'

/**
 * The mission at the top of the stage, in plain words (Defeat every foe, Survive until the
 * bell, Escape, Keep Priasis alive, Defeat the Black Priest): the survival's clock, the road
 * to the exit, the escort's HP and the wave count. When a survival's horde runs out it says
 * so. `docked`: a phone in portrait shows it as a strip above the stage instead.
 */
export function ObjectiveHud({
  view,
  snap,
  byId,
  nameOf,
  bustOf,
  docked = false,
}: {
  view: ObjectiveView
  snap: Snap
  byId: Record<string, CombatUnitInit>
  nameOf: (id: string) => string
  bustOf: (u: CombatUnitInit) => string
  docked?: boolean
}) {
  const pct = (x: number) => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`
  return (
    <div className={`obj-hud pframe ${docked ? 'docked' : ''}`} role="status" aria-label={t('Mission')}>
      <div className="obj-head">
        <span className="obj-label">{view.label}</span>
        {view.wave && (
          <span className="obj-wave">
            {t('Wave {n}/{total}', { n: view.wave.n, total: view.wave.total })}
          </span>
        )}
      </div>
      <ul className="obj-lines">
        {view.lines.map((l, i) => (
          <li key={i} className={`obj-line ${l.state}`}>
            <span className="obj-tick" aria-hidden="true">
              {l.state === 'done' ? '✔' : l.state === 'failed' ? '✖' : '▸'}
            </span>
            {l.text}
          </li>
        ))}
      </ul>
      {view.clock && (
        <div className={`obj-meter clock ${view.hordeSpent ? 'spent' : ''}`} title={view.clock.survive ? t('Until the bell') : t('The deadline')}>
          <span className="obj-meter-icon" aria-hidden="true">
            {view.clock.survive ? '⏳' : '⌛'}
          </span>
          <span className="obj-meter-bar">
            <span style={{ width: pct(view.clock.share) }} />
          </span>
          <span className="obj-meter-num">{view.hordeSpent ? t('The horde is spent') : pct(view.clock.share)}</span>
        </div>
      )}
      {view.road && (
        <div className="obj-meter road" title={t('{steps} of {distance} steps to the exit', { steps: view.road.steps, distance: view.road.distance })}>
          <span className="obj-meter-icon" aria-hidden="true">
            🚪
          </span>
          <span className="obj-meter-bar">
            <span style={{ width: pct(view.road.share) }} />
          </span>
          <span className="obj-meter-num">{pct(view.road.share)}</span>
        </div>
      )}
      {view.escorts.map((id) => {
        const u = byId[id]
        if (!u) return null
        const hp = Math.max(0, snap.hp[id] ?? u.maxHP)
        const down = !!snap.dead[id]
        return (
          <div key={id} className={`obj-escort ${down ? 'down' : ''}`}>
            <img className="px" src={bustOf(u)} width={20} height={20} alt="" />
            <ObjectiveMark kind="escort" />
            <span className="obj-escort-name">{nameOf(id)}</span>
            <HpBar pct={(hp / u.maxHP) * 100} className="obj-escort-hp" />
          </div>
        )
      })}
    </div>
  )
}
