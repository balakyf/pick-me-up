import type { ReactNode } from 'react'
import { t } from '../i18n/i18n'
import { tn } from '../text'
import { BATTLE_KEYS } from './battleFx'
import { ORDERS } from '../../engine/combat/bossTuning'
import type { Aim } from './ordersPlan'
import './orderBar.css'

export type { Aim } from './ordersPlan'

/** The orders that wait for a target (a foe, a hero, two heroes). */
export type AimOrder = Exclude<Aim, null>

/**
 * The Master's orders: Focus, Protect, Unleash, Guard, Hold, Swap (orders 2.0), how many are
 * left, and Retreat. Aimed orders arm a click on the stage; Guard and Hold land at once.
 * On a phone the buttons wrap into a grid of thumb-sized tiles.
 */
export function OrderBar({
  aim,
  left,
  retreatArmed,
  onAim,
  onRetreat,
  onGuard,
  onHold,
  focusBonus = 0,
  escort = false,
  bigMove = false,
  holding = false,
  guarding = false,
  swapFirst = null,
  kbd,
}: {
  aim: Aim
  left: number
  retreatArmed: boolean
  onAim: (which: AimOrder) => void
  onRetreat: () => void
  /** Brace now (no target). Absent: the bar shows no Guard (an old caller). */
  onGuard?: () => void
  /** Keep SP for the big one (no target). */
  onHold?: () => void
  /** The Tactical Center's concentrate-fire bonus a Focus carries (B18), e.g. 0.06. */
  focusBonus?: number
  /** An escort fights on the party's side (Protect can shield them too). */
  escort?: boolean
  /** A foe is winding up a big move: Guard is the answer (the button calls for attention). */
  bigMove?: boolean
  /** Hold is already in force. */
  holding?: boolean
  /** The party is bracing already. */
  guarding?: boolean
  /** The first hero picked for a swap. */
  swapFirst?: string | null
  kbd: (k: string) => ReactNode
}) {
  const bonus = Math.round(focusBonus * 100)
  const none = left <= 0
  return (
    <div className="bctl-row order-bar" role="toolbar" aria-label={t('Orders')}>
      <button
        className={`pbtn sm ord ${aim === 'focus' ? 'on' : ''}`}
        disabled={none}
        aria-pressed={aim === 'focus'}
        onClick={() => onAim('focus')}
        title={
          bonus > 0
            ? t('Every hero attacks the enemy you pick — +{n}% damage to it from the Tactical Center', { n: bonus })
            : t('Every hero attacks the enemy you pick')
        }
      >
        <span className="ord-ico">🎯</span> <span className="ord-label">{t('Focus')}</span>
        {kbd(BATTLE_KEYS.focus)}
      </button>
      <button
        className={`pbtn sm ord ${aim === 'protect' ? 'on' : ''}`}
        disabled={none}
        aria-pressed={aim === 'protect'}
        onClick={() => onAim('protect')}
        title={
          escort
            ? t('Enemies avoid the hero or escort you pick while anyone else stands; a big move lands on them softened')
            : t('Enemies avoid the hero you pick while anyone else stands; a big move lands on them softened')
        }
      >
        <span className="ord-ico">🛡</span> <span className="ord-label">{t('Protect')}</span>
        {kbd(BATTLE_KEYS.protect)}
      </button>
      <button
        className={`pbtn sm ord ${aim === 'unleash' ? 'on' : ''}`}
        disabled={none}
        aria-pressed={aim === 'unleash'}
        onClick={() => onAim('unleash')}
        title={t('The hero you pick acts at once with their best skill')}
      >
        <span className="ord-ico">⚡</span> <span className="ord-label">{t('Unleash')}</span>
        {kbd(BATTLE_KEYS.unleash)}
      </button>
      {onGuard && (
        <button
          className={`pbtn sm ord ord-guard ${bigMove && !guarding && !none ? 'urgent' : ''} ${guarding ? 'on' : ''}`}
          disabled={none}
          onClick={onGuard}
          title={t('The party braces: {n}% less damage, and no attacks until the big blow has landed', { n: ORDERS.guardPct })}
        >
          <span className="ord-ico">⛨</span> <span className="ord-label">{t('Guard')}</span>
          {kbd(BATTLE_KEYS.guard)}
        </button>
      )}
      {onHold && (
        <button
          className={`pbtn sm ord ${holding ? 'on' : ''}`}
          disabled={none || holding}
          aria-pressed={holding}
          onClick={onHold}
          title={t('Heroes keep their SP for a sweep over three or more foes, or a blow on the boss')}
        >
          <span className="ord-ico">⏳</span> <span className="ord-label">{t('Hold')}</span>
          {kbd(BATTLE_KEYS.hold)}
        </button>
      )}
      <button
        className={`pbtn sm ord ${aim === 'swap' ? 'on' : ''}`}
        disabled={none}
        aria-pressed={aim === 'swap'}
        onClick={() => onAim('swap')}
        title={swapFirst ? t('Now pick the hero to trade places with') : t('Two heroes you pick trade places (their lines and who is struck first)')}
      >
        <span className="ord-ico">⇄</span> <span className="ord-label">{t('Swap')}</span>
        {kbd(BATTLE_KEYS.swap)}
      </button>
      <span className="muted small ord-left">{tn(Math.max(0, left), '1 order', '{n} orders')}</span>
      <button
        className={`pbtn sm danger ord ${retreatArmed ? 'armed' : ''}`}
        onClick={onRetreat}
        title={t('End the fight now: the living come home, nothing is won')}
      >
        <span className="ord-ico">🏳</span> <span className="ord-label">{retreatArmed ? t('Sound the retreat?') : t('Retreat')}</span>
        {kbd(BATTLE_KEYS.retreat)}
      </button>
    </div>
  )
}
