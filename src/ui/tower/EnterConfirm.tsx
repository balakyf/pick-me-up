/**
 * The Enter sheet (O2): before a permadeath floor, the war room names every hero who will
 * not fight and why, the shaky, and the crystal's odds — and asks. A healthy party on a
 * safe floor never sees it. The ninetieth floor always asks: clearing it ends the world,
 * and the sheet says so, with the truth rule and the way to refuse (B20).
 */
import { useEffect, useRef } from 'react'
import type { GameState } from '../../engine/types'
import type { EnterConcern, Forecast } from '../../engine/scout/forecast'
import { t } from '../i18n/i18n'
import { tn } from '../text'
import { useRegisterWindow } from '../qol/windowRegistry'
import { concernLines, truthStanding } from './warRoomText'

export function EnterConfirm({
  state,
  forecast,
  concerns,
  worldEnd,
  onBack,
  onEnter,
  onSubvert,
}: {
  state: GameState
  forecast: Forecast | null
  concerns: EnterConcern | null
  /** This is the ninetieth floor, and clearing it would end the world. */
  worldEnd: boolean
  onBack: () => void
  onEnter: () => void
  /** Offered at F90 when the Master knows enough truths. */
  onSubvert?: () => void
}) {
  useRegisterWindow()
  const back = useRef<HTMLButtonElement>(null)
  // The safe answer has the focus; Escape steps back.
  useEffect(() => {
    back.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onBack()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onBack])

  const lines = forecast && concerns ? concernLines(state, forecast, concerns) : []
  const truths = truthStanding(state)
  return (
    <div className="overlay enter-sheet-wrap">
      <div className={`pframe enter-sheet ${worldEnd ? 'world' : ''}`} role="dialog" aria-modal="true" aria-label={worldEnd ? t('The ninetieth floor') : t('Before you climb')}>
        <div className="event-head">
          <span className="event-kind">{worldEnd ? t('The ninetieth floor') : t('Before you climb')}</span>
          <span className="muted">{t('Floor {n}', { n: state.tower.currentFloor })}</span>
        </div>

        {worldEnd && (
          <div className="enter-world">
            <p className="enter-world-warn">
              {t('Clearing this floor ends the world beneath the tower. Everyone on its surface dies, and it does not come back.')}
            </p>
            <p className="muted">
              {t('You know {n} of the tower’s {m} truths.', { n: truths.found, m: truths.total })}{' '}
              {truths.qualified
                ? t('That is enough: you can refuse the win condition — Subvert strips the Herald’s aegis, and the clear spares the world.')
                : truths.reachable
                  ? t('With {k} you could refuse the win condition instead. {more}', {
                      k: truths.need,
                      more: tn(truths.need - truths.found, '1 more is needed.', '{n} more are needed.'),
                    })
                  : t('With {k} you could have refused the win condition. Too many of them lie on floors behind you.', { k: truths.need })}
            </p>
          </div>
        )}

        {lines.length > 0 && (
          <ul className="enter-lines">
            {lines.map((l, i) => (
              <li key={i} className={`enter-line ${l.tone}`}>
                <span>{l.text}</span>
                {l.fix && <span className="muted small"> {l.fix}</span>}
              </li>
            ))}
          </ul>
        )}

        <div className="enter-actions">
          <button ref={back} className="pbtn" onClick={onBack}>
            ◀ {t('Back')}
          </button>
          {worldEnd && onSubvert && (
            <button className="btn gem" onClick={onSubvert}>
              {t('Subvert ✦')}
            </button>
          )}
          <button className="pbtn danger" onClick={onEnter}>
            {worldEnd ? t('Clear it — end the world') : t('Enter anyway ▸')}
          </button>
        </div>
      </div>
    </div>
  )
}
