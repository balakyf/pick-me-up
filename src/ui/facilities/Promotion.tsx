import { useState } from 'react'
import type { GameState, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { canPromote, canAfford, promotionCost, promotionPayment, promotionTargetStar } from '../../engine/promotion'
import { toWorldTime } from '../../engine/time'
import { t } from '../i18n/i18n'
import { matLabel, timeLeft } from './shared'
import { HeroTag, pickerName } from '../hero/heroLabel'

const SKIP_GEMS = TUNING.lobby.promotion.skipGemCost

/** The Promotion Chamber's actions: promote at-cap heroes, or skip a running timer. */
export function PromotionAction({ state, store }: { state: GameState; store: Store }) {
  const [err, setErr] = useState<string | null>(null)
  const nowWorld = toWorldTime(Date.now())
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const promoting = living.filter((h) => h.promotion !== null)
  const ready = living.filter(canPromote)

  function dispatch(cmd: Parameters<Store['dispatch']>[0]) {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
    } catch (e) {
      setErr(t(e instanceof Error ? e.message : 'Action failed'))
    }
  }

  if (promoting.length === 0 && ready.length === 0) {
    return <div className="lr-action-note">{t('No heroes are at their star cap yet — keep climbing.')}</div>
  }

  return (
    <div className="lr-action promo-action">
      {promoting.map((h) => (
        <div key={h.id} className="promo-row">
          <span className="promo-name">
            {pickerName(state, h)} <HeroTag hero={h} /> → {promotionTargetStar(h)}★
          </span>
          <span className="muted">{timeLeft(h.promotion!.completesAtWorld - nowWorld)}</span>
          <button
            className="btn gem sm"
            onClick={() => dispatch({ type: 'SKIP_TIMER', kind: 'promotion', id: h.id })}
            disabled={state.gems < SKIP_GEMS}
            title={t('Finish now for {n} gems', { n: SKIP_GEMS })}
          >
            ⏩ {SKIP_GEMS} 💎
          </button>
        </div>
      ))}
      {ready.map((h) => {
        const cost = promotionCost(h)
        const affordable = canAfford(state, h)
        const rankCover = promotionPayment(state, h)?.rankMaterial ?? 0
        return (
          <div key={h.id} className="promo-row">
            <span className="promo-name">
              {pickerName(state, h)} <HeroTag hero={h} /> → {promotionTargetStar(h)}★
            </span>
            <span className="muted">
              {Object.entries(cost)
                .map(([k, v]) => `${v} ${matLabel(k)}`)
                .join(' · ')}
              {rankCover > 0 && ` · ${t('{n} Rank Mat cover the missing stones', { n: rankCover })}`}
            </span>
            <button
              className="btn sm"
              onClick={() => dispatch({ type: 'PROMOTE_HERO', heroId: h.id })}
              disabled={!affordable}
              title={affordable ? t('Begin promotion') : t('Not enough materials')}
            >
              {t('⬆ Promote')}
            </button>
          </div>
        )
      })}
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}
