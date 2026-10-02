import type { ReactNode } from 'react'
import { t } from '../i18n/i18n'
import { tn } from '../text'
import { BATTLE_KEYS } from './battleFx'

export type Aim = 'focus' | 'protect' | null

/** The Master's orders: Focus, Protect, how many are left, and Retreat. */
export function OrderBar({
  aim,
  left,
  retreatArmed,
  onAim,
  onRetreat,
  kbd,
}: {
  aim: Aim
  left: number
  retreatArmed: boolean
  onAim: (which: 'focus' | 'protect') => void
  onRetreat: () => void
  kbd: (k: string) => ReactNode
}) {
  return (
    <div className="bctl-row order-bar">
      <button
        className={`pbtn sm ${aim === 'focus' ? 'on' : ''}`}
        disabled={left <= 0}
        onClick={() => onAim('focus')}
        title={t('Every hero attacks the enemy you pick')}
      >
        🎯 {t('Focus')}
        {kbd(BATTLE_KEYS.focus)}
      </button>
      <button
        className={`pbtn sm ${aim === 'protect' ? 'on' : ''}`}
        disabled={left <= 0}
        onClick={() => onAim('protect')}
        title={t('Enemies avoid the hero you pick while anyone else stands')}
      >
        🛡 {t('Protect')}
        {kbd(BATTLE_KEYS.protect)}
      </button>
      <span className="muted small">{tn(Math.max(0, left), '1 order', '{n} orders')}</span>
      <button
        className={`pbtn sm danger ${retreatArmed ? 'armed' : ''}`}
        onClick={onRetreat}
        title={t('End the fight now: the living come home, nothing is won')}
      >
        🏳 {retreatArmed ? t('Sound the retreat?') : t('Retreat')}
        {kbd(BATTLE_KEYS.retreat)}
      </button>
    </div>
  )
}
