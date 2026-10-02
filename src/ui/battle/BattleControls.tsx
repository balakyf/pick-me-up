import type { ReactNode } from 'react'
import { t } from '../i18n/i18n'
import { BATTLE_KEYS } from './battleFx'
import { SPEEDS } from './battleFrames'
import { OrderBar, type Aim } from './OrderBar'

/** Play/pause, speed, skip and the Master's orders; Continue once the replay ends. */
export function BattleControls({
  atEnd,
  playing,
  speed,
  onTogglePlay,
  onSpeed,
  onSkip,
  onDone,
  orders,
  kbd,
}: {
  atEnd: boolean
  playing: boolean
  speed: number
  onTogglePlay: () => void
  onSpeed: (s: number) => void
  onSkip: () => void
  onDone: () => void
  /** Present when the Master can give orders in this fight. */
  orders: {
    aim: Aim
    left: number
    retreatArmed: boolean
    onAim: (which: 'focus' | 'protect') => void
    onRetreat: () => void
    /** The Tactical Center's bonus a Focus carries (0 = none). */
    focusBonus?: number
    /** A mission NPC (an escort) stands on the party's side and can be protected. */
    escort?: boolean
  } | null
  kbd: (k: string) => ReactNode
}) {
  return (
    <div className="battle-controls">
      {!atEnd ? (
        <>
          <div className="bctl-row">
            <button className="pbtn" onClick={onTogglePlay}>
              {playing ? t('❚❚ Pause') : t('▶ Play')}
              {kbd(BATTLE_KEYS.pause)}
            </button>
            {SPEEDS.map((s, i) => (
              <button key={s} className={`pbtn ghost ${speed === s ? 'on' : ''}`} onClick={() => onSpeed(s)}>
                {s}×{kbd(String(i + 1))}
              </button>
            ))}
            <button className="pbtn ghost" onClick={onSkip}>
              {t('Skip ▸▸')}
              {kbd(BATTLE_KEYS.skip)}
            </button>
          </div>
          {orders && (
            <OrderBar
              aim={orders.aim}
              left={orders.left}
              retreatArmed={orders.retreatArmed}
              onAim={orders.onAim}
              onRetreat={orders.onRetreat}
              focusBonus={orders.focusBonus ?? 0}
              escort={!!orders.escort}
              kbd={kbd}
            />
          )}
          {orders?.aim && (
            <span className="aim-hint">
              {orders.aim === 'focus' ? t('Click an enemy…') : orders.escort ? t('Click a hero or the escort…') : t('Click a hero…')}
              {kbd(BATTLE_KEYS.close)}
            </span>
          )}
          {orders?.retreatArmed && <span className="aim-hint">{t('Click Retreat or press R again to sound it (Esc to cancel)')}</span>}
        </>
      ) : (
        <button className="pbtn primary big" onClick={onDone}>
          {t('Continue ▸')}
          {kbd('Enter')}
        </button>
      )}
    </div>
  )
}
