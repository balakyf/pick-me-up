import { useState } from 'react'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { bestEchoStat, echoesOf, heirOptions } from '../../engine/legacy'
import { TUNING } from '../../engine/tuning'
import { heroBustUrl } from '../pixel/sprites'
import { sfx } from '../audio/sound'
import { shortName } from '../life/speech'
import { t } from '../i18n/i18n'
import { echoGift, firstName, giftFor, heirBond, STAT_LABEL } from './legacyText'
import './legacy.css'

/** The hero now carrying `fallenId`'s Echo, if it has been passed on. */
export function heirOf(state: GameState, fallenId: HeroId): OwnedHero | null {
  for (const h of Object.values(state.heroes)) if (echoesOf(h).some((e) => e.fromHeroId === fallenId)) return h
  return null
}

/**
 * "Pass on Mira's resolve → choose an heir" (spec S21). Shows the fallen hero's Echo and
 * up to three heirs (closest friends first), each with what they would receive; choosing
 * one dispatches BEQUEATH_ECHO. Once passed on, the card becomes the heir's vow.
 * Renders nothing when the fallen left no Echo. `inMemorial` drops the "it waits in the
 * Memorial" reminder (the card is already there).
 */
export function BequestCard({ state, store, fallenId, inMemorial = false }: { state: GameState; store?: Store; fallenId: HeroId; inMemorial?: boolean }) {
  const [err, setErr] = useState<string | null>(null)
  const pending = state.life.legacy.pending.find((p) => p.fallenId === fallenId)
  if (!pending) {
    const heir = heirOf(state, fallenId)
    const fallen = state.heroes[fallenId]
    if (!heir || !fallen) return null
    return (
      <div className="bequest-card done">
        <div className="bq-head">
          <span className="bq-glyph">✦</span> {t('{heir} now carries the echo of {fallen}.', { heir: shortName(state, heir.id), fallen: firstName(fallen.name) })}
        </div>
        <div className="bq-vow">“{t('I carry {fallen} with me.', { fallen: firstName(fallen.name) })}”</div>
      </div>
    )
  }

  const name = firstName(pending.fallenName)
  const options = heirOptions(state, pending)
  const give = (heirId: HeroId) => {
    if (!store) return
    setErr(null)
    try {
      store.dispatch({ type: 'BEQUEATH_ECHO', fallenId, heirId }, Date.now())
      sfx('boon')
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }
  return (
    <div className="bequest-card">
      <div className="bq-head">
        <span className="bq-glyph">✦</span> {t('Pass on {name}’s resolve', { name })}
      </div>
      <div className="bq-gift">
        {t('Echo of {name}', { name })} · {echoGift(pending)}
      </div>
      {options.length === 0 ? (
        <div className="muted small">{t('No one can carry it yet. It will wait in the Memorial for a new face.')}</div>
      ) : (
        <>
          <div className="muted small">{store ? t('Choose an heir:') : t('Choose an heir in the Memorial.')}</div>
          <div className="bq-heirs">
            {options.map((id) => {
              const h = state.heroes[id]!
              const fits = bestEchoStat(h) === pending.stat
              return (
                <button key={id} className="bq-heir" disabled={!store} onClick={() => give(id)} title={t('Pass the echo to {name}', { name: h.name })}>
                  <img className="px" src={heroBustUrl(h)} width={32} height={32} alt="" />
                  <span className="bq-who">
                    <b>{shortName(state, id)}</b>
                    <span className="bq-bond">{heirBond(state, fallenId, id)}</span>
                  </span>
                  <span className="bq-what">
                    {giftFor(h, pending)}
                    {fits && <span className="bq-fit" title={t('{stat} is this hero’s strength too', { stat: t(STAT_LABEL[pending.stat]) })}> ★</span>}
                    <span className="bq-count">{t('{n}/{max} echoes', { n: echoesOf(h).length, max: TUNING.legacy.echoMaxPerHeir })}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
      {!inMemorial && <div className="bq-foot muted small">{t('An unclaimed echo waits in the Memorial. It never fades.')}</div>}
      {err && <div className="bq-err">{err}</div>}
    </div>
  )
}
