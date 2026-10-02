import type { CombatEvent } from '../../engine/types'
import { t } from '../i18n/i18n'
import { phaseTitle } from './bossCaptions'
import './bossBattle.css'

/**
 * A boss changing phase (lane G): the screen flashes, a title card slams down — the boss's
 * name, "PHASE 2 / 3 · TAKES FLIGHT" — and its line under it. Screen-space (crisp at any
 * zoom), mounted with the phase event's seq as its key so it plays once per phase. Under
 * reduced motion there is no flash and the card simply fades.
 */
export function PhaseCinematic({ e, name, calm }: { e: Extract<CombatEvent, { kind: 'phase' }>; name: string; calm: boolean }) {
  return (
    <div className={`phase-cine ${calm ? 'calm' : ''}`} role="status" aria-live="polite">
      {!calm && <div className="phase-flash" aria-hidden="true" />}
      <div className="phase-card">
        <div className="phase-name">{name}</div>
        <div className="phase-title">
          <span className="phase-count">{t('Phase {n} of {m}', { n: e.phase + 1, m: e.phases + 1 })}</span>
          <span className="phase-dot"> · </span>
          <span className="phase-what">{phaseTitle(e)}</span>
        </div>
        {e.line !== undefined && <div className="phase-line">“{t(e.line)}”</div>}
      </div>
    </div>
  )
}
