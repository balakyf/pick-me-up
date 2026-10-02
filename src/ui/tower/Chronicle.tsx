/**
 * The Chronicle: the tower's truths (hidden objectives) found, with their lore — and, so
 * the good ending is never lost in silence (B20), the rule they serve, how many the Master
 * holds, which are still ahead and which were missed on floors already behind them.
 */
import type { GameState } from '../../engine/types'
import { HIDDEN_OBJECTIVES } from '../../engine/content'
import { TUNING } from '../../engine/tuning'
import { t } from '../i18n/i18n'
import { tn } from '../text'
import { truthStanding } from './warRoomText'

const EV = TUNING.events

export function Chronicle({ state }: { state: GameState }) {
  const masterSight = state.meta.masterLevel >= EV.hiddenHintMasterLevel
  const revealed = new Set(state.meta.revealedHidden)
  const found = new Set(state.tower.hiddenFound)
  const s = truthStanding(state)
  const done = state.tower.worldEnded || state.tower.worldSaved
  return (
    <div className="pframe chronicle">
      <div className="event-head">
        <span className="event-kind">{t('Chronicle')}</span>
        <span className="muted">{t('{n} / {m} truths', { n: s.found, m: s.total })}</span>
      </div>
      {!done && (
        <div className={`chron-rule ${s.qualified ? 'good' : s.reachable ? '' : 'bad'}`}>
          {t('A Master who knows {k} of the tower’s truths before the ninetieth floor may refuse what it asks.', { k: s.need })}{' '}
          {s.qualified
            ? t('You know enough.')
            : s.reachable
              ? tn(s.need - s.found, '1 more truth is needed.', '{n} more truths are needed.')
              : t('Too many truths lie on floors behind you: that refusal is out of reach.')}
        </div>
      )}
      <div className="muted small chron-tally">
        {t('found {a} · still ahead {b} · missed {c}', { a: s.found, b: s.ahead, c: s.missed })}
      </div>
      {HIDDEN_OBJECTIVES.map((h) => {
        const isFound = found.has(h.id)
        const missed = !isFound && h.floor <= state.tower.highestCleared
        return (
          <div key={h.id} className={`chron-row ${isFound ? 'found' : missed ? 'missed' : ''}`}>
            <span className="chron-floor">F{h.floor}</span>
            {isFound ? (
              <span>
                <b>{t(h.name)}</b> — <i>{t(h.lore)}</i>
              </span>
            ) : missed ? (
              <span className="muted">{t('??? — missed: the floor is behind you.')}</span>
            ) : (
              <span className="muted">{masterSight || revealed.has(h.id) ? `??? — ${t(h.hint)}` : t('??? (a hidden objective)')}</span>
            )}
          </div>
        )
      })}
      {!masterSight && (
        <div className="muted" style={{ fontSize: 13 }}>
          {t('From Master Lv {n} you sense what the floors are hiding — or a Devoted hero can reveal one.', { n: EV.hiddenHintMasterLevel })}
        </div>
      )}
    </div>
  )
}
