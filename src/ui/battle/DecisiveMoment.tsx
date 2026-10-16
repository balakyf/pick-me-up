/**
 * The Decisive Moment card (spec 2026-10-12, S16 + S5; WP2). Time stops just before a
 * hero's fatal blow and the Master chooses. Every way out the card offers really changes
 * that hero's fate (BattleScene previews each order before offering it), and each says
 * what it costs: Protect spends an order; Pull back costs the hero's next turns, and they
 * come home shaken (TUNING.combat.withdrawSanityCost Sanity); Retreat costs the floor. A
 * warning names anything worse a choice leads to (another hero falling in their place,
 * the floor lost).
 */
import type { CSSProperties } from 'react'
import { TUNING } from '../../engine/tuning'
import { t } from '../i18n/i18n'
import { iselCoach } from '../world/lines'
import type { Decisive } from './decisive'

export type DecisiveChoice = 'protect' | 'pullback' | 'retreat' | 'fate'

/** "1 order left" / "3 orders left" (the dock and the card share it). */
export function ordersLeftText(n: number): string {
  return n === 1 ? t('1 order left') : t('{n} orders left', { n })
}

/** The card's headline: a death foreseen, or the tutorial's heavy blow (no death in it). */
export function decisiveHeadline(kind: Decisive['kind'], name: string): string {
  return kind === 'death' ? t('{name} is about to fall!', { name }) : t('A heavy blow is coming for {name}!', { name })
}

export function DecisiveMoment({
  decisive,
  heroName,
  heroBust,
  iselBust,
  ordersLeft,
  canProtect = ordersLeft > 0,
  canPullBack = false,
  protectWarn = null,
  pullBackWarn = null,
  tutorial,
  onChoose,
  wide = false,
  style,
}: {
  decisive: Decisive
  heroName: string
  heroBust: string
  iselBust: string
  /** Focus / Protect orders left this battle (Pull back and Retreat cost none). */
  ordersLeft: number
  /** Protect is offered (an order is left, the hero is not already protected, and it saves them). */
  canProtect?: boolean
  /** Pull back is offered (it saves the hero: they sit out a few turns behind the line, and
   *  come home shaken — the card states the Sanity it costs). */
  canPullBack?: boolean
  /** Anything worse Protect / Pull back would lead to (shown under its hint), or null. */
  protectWarn?: string | null
  pullBackWarn?: string | null
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
            {decisiveHeadline(decisive.kind, heroName)}
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
            <span className="decisive-hint">{t('Spends an order: foes avoid them while anyone else stands')}</span>
            {protectWarn && <span className="decisive-warn">⚠ {protectWarn}</span>}
          </button>
        )}
        {canPullBack && (
          <button type="button" className="pbtn decisive-choice pullback" onClick={() => onChoose('pullback')}>
            <span className="decisive-key">B</span>
            <span className="decisive-label">↩ {t('Pull {name} back', { name: heroName })}</span>
            <span className="decisive-hint">{t('No order spent: they sit out a few turns behind the line')}</span>
            <span className="decisive-cost">{t('{name} comes home shaken: −{n} Sanity', { name: heroName, n: TUNING.combat.withdrawSanityCost })}</span>
            {pullBackWarn && <span className="decisive-warn">⚠ {pullBackWarn}</span>}
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
          {decisive.kind === 'death' && <span className="decisive-hint">{t('{name} falls', { name: heroName })}</span>}
        </button>
      </div>
      <div className="decisive-foot muted small">
        {canOrder
          ? ordersLeftText(ordersLeft)
          : canPullBack
            ? t('No orders left this battle.')
            : t('No orders left this battle: only Retreat can change this.')}
      </div>
    </div>
  )
}
