/**
 * The Decisive Moment card (spec 2026-10-12, S16 + S5; WP2). Time stops just before a
 * hero's fatal blow and the Master chooses. The copy never promises survival: Protect
 * only holds "while anyone else stands", and a Focus may not land in time.
 */
import type { CSSProperties } from 'react'
import { t } from '../i18n/i18n'
import { iselCoach } from '../world/lines'
import type { Decisive } from './decisive'

export type DecisiveChoice = 'protect' | 'focus' | 'retreat' | 'fate'

export function DecisiveMoment({
  decisive,
  heroName,
  killerName,
  heroBust,
  iselBust,
  ordersLeft,
  canProtect = ordersLeft > 0,
  canFocus = ordersLeft > 0 && killerName !== null,
  tutorial,
  onChoose,
  wide = false,
  style,
}: {
  decisive: Decisive
  heroName: string
  killerName: string | null
  heroBust: string
  iselBust: string
  /** Focus / Protect orders left this battle (Retreat is always available). */
  ordersLeft: number
  /** Protect is offered (an order is left and the hero is not already protected). */
  canProtect?: boolean
  /** Focus on the killer is offered (an order is left, a killer is known, it stands, and
   *  it is not already the focus). */
  canFocus?: boolean
  /** The scripted first Decisive Moment: Isel coaches (S5). */
  tutorial: boolean
  onChoose: (choice: DecisiveChoice) => void
  /** A wide stage: the card sits over the foes' half (placed by `style`); otherwise it docks at the bottom. */
  wide?: boolean
  style?: CSSProperties
}) {
  const canOrder = ordersLeft > 0
  return (
    <div className={`decisive-card ${decisive.kind} ${wide ? 'wide' : 'docked'}`} style={style} role="dialog" aria-label={t('Decisive moment')}>
      <div className="decisive-head">
        <img className="px decisive-bust" src={heroBust} width={48} height={48} alt="" />
        <div>
          <div className="decisive-title">
            {decisive.kind === 'death' ? t('{name} is about to fall!', { name: heroName }) : t('{name} is in danger!', { name: heroName })}
          </div>
          <div className="decisive-sub">{t('Time stands still. Your order, Master?')}</div>
        </div>
      </div>
      {tutorial && canProtect && (
        <div className="decisive-coach">
          <img className="px" src={iselBust} width={32} height={32} alt="" />
          <span>
            <b>{t('Isel')}</b> {iselCoach('decisive')}
          </span>
        </div>
      )}
      <div className="decisive-choices">
        {canProtect && (
          <button type="button" className={`pbtn decisive-choice protect ${tutorial ? 'coach' : ''}`} onClick={() => onChoose('protect')}>
            <span className="decisive-key">P</span>
            <span className="decisive-label">🛡 {t('Protect {name}', { name: heroName })}</span>
            <span className="decisive-hint">{t('Foes avoid them while anyone else stands')}</span>
          </button>
        )}
        {canFocus && killerName !== null && (
          <button type="button" className="pbtn decisive-choice focus" onClick={() => onChoose('focus')}>
            <span className="decisive-key">F</span>
            <span className="decisive-label">🎯 {t('Focus {name}', { name: killerName })}</span>
            <span className="decisive-hint">{t('Everyone strikes it — it may not fall in time')}</span>
          </button>
        )}
        <button type="button" className="pbtn danger decisive-choice retreat" onClick={() => onChoose('retreat')}>
          <span className="decisive-key">R</span>
          <span className="decisive-label">🏳 {t('Retreat')}</span>
          <span className="decisive-hint">{t('End the fight now: the living come home, nothing is won')}</span>
        </button>
        <button type="button" className="pbtn ghost decisive-choice fate" onClick={() => onChoose('fate')}>
          <span className="decisive-key">␣</span>
          <span className="decisive-label">{t('Let fate decide')}</span>
        </button>
      </div>
      <div className="decisive-foot muted small">
        {canOrder ? t('{n} orders', { n: ordersLeft }) : t('No orders left this battle: only Retreat can change this.')}
      </div>
    </div>
  )
}
