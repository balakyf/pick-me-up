import type { GameState } from '../../engine/types'
import { tacticalFocusBonus, tacticalOverlookSlots } from '../../engine/tactical'
import { t } from '../i18n/i18n'

/** The Tactical Center's current combat levers (read-only; upgrades deferred). */
export function TacticalAction({ state }: { state: GameState }) {
  const level = state.facilities.tacticalCenter.level
  const bonusPct = Math.round(tacticalFocusBonus(level) * 100)
  const slots = tacticalOverlookSlots(level)
  return (
    <div className="lr-action tactical-action">
      <div className="ta-row"><span>{t('🎯 Focus damage')}</span><span className="ta-val">+{bonusPct}%</span></div>
      <div className="ta-row"><span>{t('🛡 Overlook slots')}</span><span className="ta-val">{slots}</span></div>
      <div className="lr-action-note">{t('Mark a target in the Tower to concentrate fire.')}</div>
    </div>
  )
}
