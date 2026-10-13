import { useState } from 'react'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { classLabel, Stars } from '../bits'
import { heroBustUrl } from '../pixel/sprites'
import { sfx } from '../audio/sound'
import { t } from '../i18n/i18n'
import './legacy.css'

/**
 * New Arrivals (spec S23): a thinned roster hears a new face at the bell. Each token is a
 * free Normal summon of at least 2★; answering dispatches CLAIM_RECRUIT and introduces
 * the newcomer here. Renders nothing when no one waits and nobody just arrived.
 */
export function RecruitBell({ state, store }: { state: GameState; store?: Store }) {
  const [arrived, setArrived] = useState<HeroId | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const tokens = state.life.legacy.recruitTokens
  const hero: OwnedHero | undefined = arrived ? state.heroes[arrived] : undefined
  if (tokens <= 0 && !hero) return null

  const answer = () => {
    if (!store) return
    setErr(null)
    try {
      const before = new Set(Object.keys(store.getState()?.heroes ?? state.heroes))
      const next = store.dispatch({ type: 'CLAIM_RECRUIT' }, Date.now())
      const id = (Object.keys(next.heroes) as HeroId[]).find((k) => !before.has(k)) ?? null
      setArrived(id)
      if (id) sfx('reveal', { star: next.heroes[id]!.displayStar ?? next.heroes[id]!.star })
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }

  return (
    <div className="recruit-bell">
      {hero && (
        <div className="rb-arrival">
          <img className="px" src={heroBustUrl(hero)} width={40} height={40} alt="" />
          <div>
            <div className="rb-name">{t('{name} answers the bell.', { name: hero.name })}</div>
            <div className="muted small">
              <Stars star={hero.displayStar ?? hero.star} /> {classLabel(hero.heroClass)}
            </div>
          </div>
        </div>
      )}
      {tokens > 0 && (
        <div className="rb-wait">
          <div>
            <span className="rb-glyph">🔔</span> {tokens === 1 ? t('A new face answers the bell.') : t('{n} new faces wait at the bell.', { n: tokens })}
          </div>
          <div className="muted small">{t('A free summon, {star}★ or better.', { star: TUNING.legacy.recruit.minStar })}</div>
          {store && (
            <button className="pbtn primary sm rb-btn" onClick={answer}>
              {t('Open the door')}
            </button>
          )}
        </div>
      )}
      {err && <div className="bq-err">{err}</div>}
    </div>
  )
}
