import { useState } from 'react'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { canPromote, canAfford, promotionCost, promotionPayment, promotionTargetStar } from '../../engine/promotion'
import { toWorldTime } from '../../engine/time'
import { t } from '../i18n/i18n'
import { matLabel, timeLeft } from './shared'
import { HeroTag, pickerName } from '../hero/heroLabel'
import { HeroPicker } from '../hero/HeroPicker'
import { promoteRefusal } from '../hero/refusals'
import { PromotionPlanner } from '../promotion/PromotionPlanner'

const SKIP_GEMS = TUNING.lobby.promotion.skipGemCost

/** The Promotion Chamber's actions: promote at-cap heroes (chosen with the shared hero
 *  picker, then the planner), or skip a running timer. */
export function PromotionAction({ state, store }: { state: GameState; store: Store }) {
  const [err, setErr] = useState<string | null>(null)
  // The hero whose ceremony is being prepared (the planner shows the preview and choices).
  const [open, setOpen] = useState<HeroId | null>(null)
  const nowWorld = toWorldTime(Date.now())
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const promoting = living.filter((h) => h.promotion !== null)
  const ready = living.filter(canPromote)
  const chosen = open && state.heroes[open] && canPromote(state.heroes[open]!) ? state.heroes[open]! : null

  function dispatch(cmd: Parameters<Store['dispatch']>[0]): boolean {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
      return true
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'Action failed'))
      return false
    }
  }

  if (promoting.length === 0 && ready.length === 0) {
    return <div className="lr-action-note">{t('No heroes are at their star cap yet — keep climbing.')}</div>
  }

  const costLine = (h: OwnedHero) => {
    const cost = promotionCost(h)
    const rankCover = promotionPayment(state, h)?.rankMaterial ?? 0
    return (
      Object.entries(cost)
        .map(([k, v]) => `${v} ${matLabel(k)}`)
        .join(' · ') + (rankCover > 0 ? ` · ${t('{n} Rank Mat cover the missing stones', { n: rankCover })}` : '')
    )
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
      {ready.length > 0 && (
        <>
          <h4 className="panel-sub">{t('Waiting at the cap')}</h4>
          <HeroPicker
            state={state}
            heroes={living}
            label={t('Heroes to promote')}
            selected={chosen ? [chosen.id] : []}
            refusal={(h) => promoteRefusal(state, h, false)}
            note={(h) => (canPromote(h) ? (canAfford(state, h) ? `→ ${promotionTargetStar(h)}★` : t('not enough materials')) : null)}
            onPick={(id) => setOpen(open === id ? null : id)}
            filter={{ availableOnly: true }}
          />
        </>
      )}
      {chosen && (
        <div className="promo-row" style={{ flexWrap: 'wrap' }}>
          <span className="promo-name">
            {pickerName(state, chosen)} <HeroTag hero={chosen} /> → {promotionTargetStar(chosen)}★
          </span>
          <span className="muted">{costLine(chosen)}</span>
          <div style={{ flexBasis: '100%' }}>
            <PromotionPlanner
              key={chosen.id}
              state={state}
              hero={chosen}
              affordable={canAfford(state, chosen)}
              onPromote={(choice) => {
                if (dispatch({ type: 'PROMOTE_HERO', heroId: chosen.id, ...choice })) setOpen(null)
              }}
            />
          </div>
        </div>
      )}
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}
