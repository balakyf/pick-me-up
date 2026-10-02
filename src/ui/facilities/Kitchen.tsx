import { useState } from 'react'
import type { GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { banquetWouldHelp } from '../../engine/kitchen'
import { t } from '../i18n/i18n'
import { withToasts } from '../qol/toastStore'

const BANQUET = TUNING.lobby.banquet

/** The Kitchen's interactive Banquet action: spend gold → roster-wide Sanity. */
export function BanquetAction({ state, store }: { state: GameState; store: Store }) {
  const [err, setErr] = useState<string | null>(null)
  const canAfford = state.gold >= BANQUET.gold
  const helps = banquetWouldHelp(state)
  const disabled = !canAfford || !helps

  function hold() {
    setErr(null)
    try {
      withToasts(store).dispatch({ type: 'BANQUET' }, Date.now())
    } catch (e) {
      setErr(t(e instanceof Error ? e.message : 'Banquet failed'))
    }
  }

  return (
    <div className="lr-action">
      <button className="btn gold sm" onClick={hold} disabled={disabled}>
        {t('🍴 Banquet · {gold} ◆', { gold: BANQUET.gold.toLocaleString() })}
      </button>
      <div className="lr-action-note">
        {!canAfford
          ? t('Not enough gold.')
          : !helps
            ? t('Everyone is at full morale.')
            : t('+{n} Sanity to all living heroes.', { n: BANQUET.restore })}
      </div>
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}
