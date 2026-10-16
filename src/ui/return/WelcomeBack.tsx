import { useState } from 'react'
import type { GameState, HeroId } from '../../engine/types'
import type { Store } from '../../engine/store'
import type { AwaySummary } from '../../engine/return'
import { TUNING } from '../../engine/tuning'
import { PixelWindow } from '../kit'
import { heroBustUrl, iselBustUrl } from '../pixel/sprites'
import { hashString } from '../pixel/rand'
import { PLACE_LABEL, type PlaceId } from '../world/lobbyMap'
import { shortName } from '../life/speech'
import { sfx } from '../audio/sound'
import { t, fmt } from '../i18n/i18n'
import { StampCard, newcomerName } from './StampCard'
import { facilityPlace } from './lightsOut'
import { VIGNETTE_ICON, vignettePlace, vignetteText } from './vignettes'
import { awayPhrase } from './format'
import type { HeroLetter } from './heroLetters'
import './return.css'

/** Everything the ledger needs, computed once at arrival (before → after the TICK). */
export interface Arrival {
  summary: AwaySummary
  letter: HeroLetter | null
  awayRealMs: number
  /** Away long enough for the grey Re-interference ceremony. */
  grey: boolean
  /** The save it belongs to (`accountKey`: a new or imported account closes the ledger). */
  accountId: string
  /** Seed for the greeting choice. */
  at: number
}

const GREETINGS = [
  'Welcome back, Master. I kept your seat warm.',
  'There you are! Everyone will be glad.',
  'Welcome home, Master. Let me tell you what happened.',
]

function names(state: GameState, ids: HeroId[]): string {
  return ids.map((id) => shortName(state, id)).join(', ')
}

/** One tappable line of the ledger: it travels to the place it is about. */
function Line({ icon, text, place, onGo }: { icon: string; text: string; place?: PlaceId; onGo: (p: PlaceId) => void }) {
  if (!place) {
    return (
      <div className="wb-line static">
        <span className="wb-icon">{icon}</span>
        <span className="wb-text">{text}</span>
      </div>
    )
  }
  return (
    <button className="wb-line" onClick={() => onGo(place)} title={t('Go to {place}', { place: t(PLACE_LABEL[place]) })}>
      <span className="wb-icon">{icon}</span>
      <span className="wb-text">{text}</span>
      <span className="wb-go" aria-hidden="true">›</span>
    </button>
  )
}

/**
 * "While you were away" (spec 2026-10-12 S26): up to five vignettes from the heroes' real
 * simulated lives, what is waiting to be collected, what is ready, and one hero's letter.
 * Every line travels. Nothing is claimed for the Master: the login gift is one tap.
 */
export function WelcomeBack({
  arrival,
  state,
  store,
  onGo,
  onClose,
  onOpenLetter,
}: {
  arrival: Arrival
  state: GameState
  store: Store
  onGo: (place: PlaceId) => void
  onClose: () => void
  /** Open Isel's full letter (null hides the button). */
  onOpenLetter: (() => void) | null
}) {
  const { summary, letter } = arrival
  const [stamped, setStamped] = useState<{ fresh: boolean; completed: boolean; newcomer: string | null } | null>(null)
  const [claimErr, setClaimErr] = useState<string | null>(null)
  const go = (p: PlaceId) => {
    onClose()
    onGo(p)
  }
  const greeting = arrival.grey
    ? t('You came back. The towers remembered you.')
    : t(GREETINGS[hashString(`${arrival.accountId}|${arrival.at}`) % GREETINGS.length]!)

  function claim() {
    setClaimErr(null)
    const prev = store.getState()
    const before = prev?.meta.stamps.count ?? 0
    try {
      const next = store.dispatch({ type: 'CLAIM_LOGIN' }, Date.now())
      const after = next.meta.stamps.count
      const stamp = after > before
      const completed = stamp && after % TUNING.return.stamps.perCard === 0
      setStamped({ fresh: stamp, completed, newcomer: completed ? newcomerName(prev, next) : null })
      sfx(stamp ? 'stamp' : 'coin')
    } catch (e) {
      setClaimErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }

  const r = summary.ready
  const c = summary.collect
  const b = summary.busy
  const readyLines: { icon: string; text: string; place: PlaceId }[] = []
  if (r.promotions.length > 0) readyLines.push({ icon: '★', text: t('{names}: promotion complete.', { names: names(state, r.promotions) }), place: 'promotionChamber' })
  if (r.drills.length > 0) readyLines.push({ icon: '⚔', text: t('{names}: drill finished.', { names: names(state, r.drills) }), place: 'trainingCenter' })
  for (const fid of r.builds) readyLines.push({ icon: '⌂', text: t('The {place} upgrade is finished.', { place: t(PLACE_LABEL[facilityPlace(fid)]) }), place: facilityPlace(fid) })
  if (r.summonAffordable) readyLines.push({ icon: '✧', text: t('You have the gold for a summon.'), place: 'summon' })
  if (r.dailyAttempts > 0) readyLines.push({ icon: '⚑', text: r.dailyAttempts === 1 ? t('The Daily Dungeon has an attempt waiting.') : t('The Daily Dungeon has {n} attempts waiting.', { n: r.dailyAttempts }), place: 'daily' })

  const loginOpen = c.loginReady && stamped === null
  const hasCollect = c.restedCharges > 0 || c.gold > 0 || c.loginReady
  const charges = state.meta.rested?.charges ?? 0
  const writer = letter ? state.heroes[letter.heroId] : undefined
  const quiet = summary.vignettes.length === 0 && readyLines.length === 0 && !hasCollect && !Object.values(b).some((n) => n > 0)

  return (
    <PixelWindow title={t('While you were away')} icon="☀" onClose={onClose} wide>
      <div className="wb">
        <div className="wb-isel">
          <img className="px" src={iselBustUrl()} width={40} height={40} alt="" />
          <div>
            <p className="wb-greeting">“{greeting}”</p>
            <p className="muted">{t('You were away {time}. The waiting room kept living.', { time: awayPhrase(arrival.awayRealMs) })}</p>
          </div>
        </div>

        {summary.vignettes.length > 0 && (
          <div className="wb-section">
            {summary.vignettes.map((v, i) => (
              <Line key={i} icon={VIGNETTE_ICON[v.kind]} text={vignetteText(state, v)} place={vignettePlace(v)} onGo={go} />
            ))}
          </div>
        )}

        {Object.values(b).some((n) => n > 0) && (
          <div className="letter-tally">
            {b.meals > 0 && <span className="chip">🍲 {t('{n} meals served', { n: b.meals })}</span>}
            {b.forged > 0 && <span className="chip">⚒ {t('{n} items forged', { n: b.forged })}</span>}
            {b.trainXp > 0 && <span className="chip">⚔ {t('{n} XP trained', { n: fmt(b.trainXp) })}</span>}
            {b.research > 0 && <span className="chip">📚 {t('{n} floors studied', { n: b.research })}</span>}
            {b.healed > 0 && <span className="chip">✚ {t('{n} sanity mended', { n: b.healed })}</span>}
          </div>
        )}

        {letter && writer && (
          <div className="wb-hero-letter">
            <img className="px" src={heroBustUrl(writer)} width={40} height={40} alt="" />
            <div>
              <p className="wb-dear">{t('Dear Master,')}</p>
              {letter.lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
              <p className="wb-sign">{letter.signoff}</p>
            </div>
          </div>
        )}

        {quiet && <p className="wb-quiet">{t('A quiet spell. Everyone is simply glad you are back.')}</p>}

        {hasCollect && (
          <div className="wb-section">
            <h4 className="panel-sub">{t('Waiting for you')}</h4>
            {c.restedCharges > 0 && charges > 0 && (
              <Line
                icon="⟡"
                text={
                  charges === 1
                    ? t('Pent-up Interference: your next floor clear pays double gold.')
                    : t('Pent-up Interference: your next {n} floor clears pay double gold.', { n: charges })
                }
                place="tower"
                onGo={go}
              />
            )}
            {c.gold > 0 && <Line icon="◆" text={t('+{n} gold from the heroes’ work — already in your purse.', { n: fmt(c.gold) })} onGo={go} />}
            {loginOpen && (
              <div className="wb-claim">
                <button className="pbtn gem" onClick={claim}>
                  🎁 {t('Today’s gift')} · +{TUNING.shop.loginGems} ♦{c.stampReady ? ` · ✦ ${t('stamp')}` : ''}
                </button>
                <span className="muted">{t('One tap, whenever you like.')}</span>
              </div>
            )}
            {stamped && (
              <div className="wb-claimed">
                ✓ {t('+{n} ♦ — thank you for coming by.', { n: TUNING.shop.loginGems })}
                {stamped.fresh && ` ${t('Stamped!')}`}
              </div>
            )}
            {(loginOpen || stamped) && c.stampReady && <StampCard state={state} fresh={stamped?.fresh ?? false} justCompleted={stamped?.completed ?? false} newcomer={stamped?.newcomer ?? null} />}
            {claimErr && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{claimErr}</div>}
          </div>
        )}

        {readyLines.length > 0 && (
          <div className="wb-section">
            <h4 className="panel-sub">{t('Ready')}</h4>
            {readyLines.map((l, i) => (
              <Line key={i} icon={l.icon} text={l.text} place={l.place} onGo={go} />
            ))}
          </div>
        )}

        <div className="wb-foot">
          {onOpenLetter && (
            <button className="pbtn" onClick={onOpenLetter}>
              ✉ {t('Isel’s full letter')}
            </button>
          )}
          <button className="btn primary" onClick={onClose}>
            {t('Back to the waiting room')}
          </button>
        </div>
      </div>
    </PixelWindow>
  )
}
