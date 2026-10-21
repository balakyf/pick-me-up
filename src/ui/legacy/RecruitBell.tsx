import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { classLabel, Stars } from '../bits'
import { heroBustUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'
import { RevealSequence } from '../summon/RevealSequence'
import './legacy.css'

/**
 * New Arrivals (spec S23): a thinned roster hears a new face at the bell. Each token is a
 * free Normal summon of at least 2★; answering dispatches CLAIM_RECRUIT and meets the
 * newcomer through the Summon Theatre (one card: the ritual, the glow, the person), then
 * keeps a line for them here. Renders nothing when no one waits and nobody just arrived.
 */
export function RecruitBell({ state, store }: { state: GameState; store?: Store }) {
  const [arrived, setArrived] = useState<HeroId | null>(null)
  const [err, setErr] = useState<string | null>(null)
  /** The newcomer on stage in the theatre (a one-card pull), until the player moves on. */
  const [ritual, setRitual] = useState<OwnedHero[] | null>(null)
  // The theatre takes focus while it plays; when it closes, give it back to the bell (the
  // next "Open the door", or the newcomer's line) so a keyboard Master is not left nowhere.
  const doorRef = useRef<HTMLButtonElement>(null)
  const arrivalRef = useRef<HTMLDivElement>(null)
  const staged = useRef(false)
  useEffect(() => {
    if (ritual) staged.current = true
    else if (staged.current) {
      staged.current = false
      ;(doorRef.current ?? arrivalRef.current)?.focus()
    }
  }, [ritual])
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
      if (id) setRitual([next.heroes[id]!])
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }

  return (
    <div className="recruit-bell">
      {hero && (
        <div className="rb-arrival" ref={arrivalRef} tabIndex={-1}>
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
            <button ref={doorRef} className="pbtn primary sm rb-btn" onClick={answer}>
              {t('Open the door')}
            </button>
          )}
        </div>
      )}
      {err && <div className="bq-err">{err}</div>}
      {ritual &&
        createPortal(
          // A portal still bubbles React events to the bell's ancestors (a window's
          // backdrop, a results card): the theatre's clicks stop here.
          <div onClick={(e) => e.stopPropagation()}>
            <RevealSequence heroes={ritual} masterLevel={state.meta.masterLevel} onDone={() => setRitual(null)} />
          </div>,
          document.body,
        )}
    </div>
  )
}
