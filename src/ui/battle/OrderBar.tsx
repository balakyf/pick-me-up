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
  focusBonus = 0,
  escort = false,
  kbd,
}: {
  aim: Aim
  left: number
  retreatArmed: boolean
  onAim: (which: 'focus' | 'protect') => void
  onRetreat: () => void
  /** The Tactical Center's concentrate-fire bonus a Focus carries (B18), e.g. 0.06. */
  focusBonus?: number
  /** An escort fights on the party's side (Protect can shield them too). */
  escort?: boolean
  kbd: (k: string) => ReactNode
}) {
  const bonus = Math.round(focusBonus * 100)
  return (
    <div className="bctl-row order-bar">
      <button
        className={`pbtn sm ${aim === 'focus' ? 'on' : ''}`}
        disabled={left <= 0}
        onClick={() => onAim('focus')}
        title={
          bonus > 0
            ? t('Every hero attacks the enemy you pick — +{n}% damage to it from the Tactical Center', { n: bonus })
            : t('Every hero attacks the enemy you pick')
        }
      >
        🎯 {t('Focus')}
        {kbd(BATTLE_KEYS.focus)}
      </button>
      <button
        className={`pbtn sm ${aim === 'protect' ? 'on' : ''}`}
        disabled={left <= 0}
        onClick={() => onAim('protect')}
        title={escort ? t('Enemies avoid the hero or escort you pick while anyone else stands') : t('Enemies avoid the hero you pick while anyone else stands')}
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
