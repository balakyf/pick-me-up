/**
 * Morale on screen (lane L): five pips wherever a hero is listed (tracker, profile, Party
 * Board, the tower's party strip), and the full "why" in the profile.
 */
import type { GameState, HeroId } from '../../engine/types'
import { moraleOf } from '../../engine/life'
import { t } from '../i18n/i18n'
import { bandColor, bandEffect, bandName, factorText, moraleHelp, moraleTitle } from './moraleText'
import './morale.css'

const PIPS = 5

/** Five pips coloured by the band; the tooltip says why. */
export function MoralePips({ state, heroId, label = false }: { state: GameState; heroId: HeroId; label?: boolean }) {
  const m = moraleOf(state, heroId)
  const color = bandColor(m.band)
  return (
    <span className={`mo-pips mo-${m.band}`} title={moraleTitle(state, m)} aria-label={t('Morale: {band} ({n} of 5)', { band: bandName(m.band), n: m.pips })} role="img">
      {Array.from({ length: PIPS }, (_, i) => (
        <span key={i} className="mo-pip" style={i < m.pips ? { background: color } : undefined} />
      ))}
      {label && <span className="mo-label">{bandName(m.band)}</span>}
    </span>
  )
}

/** The profile's morale panel: the score, every reason, and what would help. */
export function MoraleBreakdown({ state, heroId }: { state: GameState; heroId: HeroId }) {
  const m = moraleOf(state, heroId)
  const help = moraleHelp(m)
  return (
    <div className="mo-breakdown">
      <div className="mo-head">
        <MoralePips state={state} heroId={heroId} label />
        <span className="muted small">
          {t('Morale {n}', { n: m.score })} · {bandEffect(m.band)}
        </span>
      </div>
      <ul className="mo-factors">
        {m.factors.slice(0, 7).map((f, i) => (
          <li key={i} className={f.value > 0 ? 'up' : 'down'}>
            <span className="mo-val">
              {f.value > 0 ? '+' : '−'}
              {Math.abs(Math.round(f.value))}
            </span>{' '}
            {factorText(state, f)}
          </li>
        ))}
      </ul>
      {help.length > 0 && (
        <ul className="mo-help small">
          {help.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
