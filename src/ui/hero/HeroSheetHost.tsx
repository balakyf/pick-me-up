/**
 * The App's host for the hero sheet and the promotion planner window (lane N): whatever
 * called `openHeroSheet` / `openPromotionPlanner` (sheetBus) is shown here, over any scene.
 */
import { useState } from 'react'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { canAfford, promotionCost, promotionPayment, promotionTargetStar } from '../../engine/promotion'
import { PixelWindow } from '../kit'
import { PromotionPlanner } from '../promotion/PromotionPlanner'
import { matLabel } from '../facilities/shared'
import { t } from '../i18n/i18n'
import { HeroSheet } from './HeroSheet'
import { closeHeroSheet, closePromotionPlanner, useSheetBus } from './sheetBus'
import { promoteRefusal } from './refusals'

export function HeroSheetHost({ state, store }: { state: GameState; store: Store }) {
  const bus = useSheetBus()
  const sheetHero = bus.sheet ? state.heroes[bus.sheet.heroId as HeroId] : undefined
  const planHero = bus.planner ? state.heroes[bus.planner as HeroId] : undefined
  return (
    <>
      {bus.sheet && sheetHero && (
        <HeroSheet key={bus.sheet.nonce} state={state} store={store} heroId={sheetHero.id} tab={bus.sheet.tab} onClose={closeHeroSheet} onFind={bus.finder ?? undefined} />
      )}
      {planHero && <PromotionWindow state={state} store={store} hero={planHero} onClose={closePromotionPlanner} />}
    </>
  )
}

/** The promotion planner in a window of its own: what it costs, what it will do, the choices. */
export function PromotionWindow({ state, store, hero, onClose }: { state: GameState; store: Store; hero: OwnedHero; onClose: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  const why = promoteRefusal(state, hero)
  const blocked = why !== null && why !== 'Not enough materials to promote.'
  const cost = promotionCost(hero)
  const rankCover = promotionPayment(state, hero)?.rankMaterial ?? 0
  return (
    <PixelWindow title={t('Promote {name}', { name: hero.name })} icon="⬆" onClose={onClose} wide>
      <div className="promo-window">
        <div className="muted">
          {hero.star}★ → {promotionTargetStar(hero)}★ ·{' '}
          {Object.entries(cost)
            .map(([k, v]) => `${v} ${matLabel(k)}`)
            .join(' · ')}
          {rankCover > 0 && ` · ${t('{n} Rank Mat cover the missing stones', { n: rankCover })}`}
        </div>
        {blocked ? (
          <div className="lr-action-note">{t(why!)}</div>
        ) : (
          <PromotionPlanner
            state={state}
            hero={hero}
            affordable={canAfford(state, hero)}
            onPromote={(choice) => {
              setErr(null)
              try {
                store.dispatch({ type: 'PROMOTE_HERO', heroId: hero.id, ...choice }, Date.now())
                onClose()
              } catch (e) {
                setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'Action failed'))
              }
            }}
          />
        )}
        {err && <div className="err">{err}</div>}
      </div>
    </PixelWindow>
  )
}
