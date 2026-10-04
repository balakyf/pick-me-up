/**
 * Camp incidents waiting on the Master (lane L): one card each, with the two answers.
 * The answer goes through RESOLVE_INCIDENT; what came of it is read back from the
 * chronicle and shown in place.
 */
import { useState } from 'react'
import type { GameState, HeroId } from '../../engine/types'
import type { Store } from '../../engine/store'
import { incidentsOf } from '../../engine/life'
import { PixelWindow } from '../kit'
import { heroBustUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'
import { incidentLine } from './speech'
import { incidentDeadline, incidentPrompt } from './incidentText'
import './morale.css'

export function IncidentCards({ state, store, onFind }: { state: GameState; store: Store; onFind?: (id: string) => void }) {
  const [done, setDone] = useState<{ id: string; line: string }[]>([])
  const [err, setErr] = useState<string | null>(null)
  const pending = incidentsOf(state)
  const answer = (id: string, choice: 'intervene' | 'let') => {
    setErr(null)
    try {
      const ids = new Set<string>(incidentsOf(store.getState() ?? state).find((i) => i.id === id)?.heroIds ?? [])
      const next = store.dispatch({ type: 'RESOLVE_INCIDENT', id, choice }, Date.now())
      // What came of it: the newest incident line about the same heroes.
      const last = [...next.life.chronicle].reverse().find((e) => e.kind === 'incident' && e.heroIds.length === ids.size && e.heroIds.every((h) => ids.has(h)))
      setDone((d) => [...d, { id, line: last ? incidentLine(next, last) : t('Done.') }])
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }
  if (pending.length === 0 && done.length === 0) return <p className="muted">{t('The camp is quiet. Nothing needs you right now.')}</p>
  return (
    <div className="inc-list">
      {done.map((d) => (
        <div key={d.id} className="inc-done">
          ✓ {d.line}
        </div>
      ))}
      {pending.map((inc) => {
        const p = incidentPrompt(state, inc)
        const heroes = inc.heroIds.map((id) => state.heroes[id as HeroId]).filter(Boolean)
        return (
          <div key={inc.id} className="inc-card">
            {heroes.slice(0, 2).map((h) => (
              <button key={h!.id} className="linkish" onClick={() => onFind?.(h!.id)} title={t('Find on the map')} aria-label={h!.name}>
                <img className="px" src={heroBustUrl(h!)} width={32} height={32} alt="" />
              </button>
            ))}
            <div className="inc-body">
              <p>{p.text}</p>
              <div className="inc-actions">
                <button className="pbtn" onClick={() => answer(inc.id, 'intervene')}>
                  {p.intervene}
                </button>
                <button className="pbtn ghost" onClick={() => answer(inc.id, 'let')}>
                  {p.let}
                </button>
              </div>
              {p.hint && <div className="muted small">{p.hint}</div>}
              <div className="inc-when">{incidentDeadline(state, inc)}</div>
            </div>
          </div>
        )
      })}
      {err && <div className="err">{err}</div>}
    </div>
  )
}

/** The camp's waiting incidents in a window of their own (the HUD's ⚑ button, a click on
 *  a hero caught up in one). */
export function IncidentWindow({ state, store, onClose, onFind }: { state: GameState; store: Store; onClose: () => void; onFind?: (id: string) => void }) {
  return (
    <PixelWindow title={t('The camp needs you')} icon="⚑" onClose={onClose}>
      <IncidentCards state={state} store={store} onFind={onFind} />
    </PixelWindow>
  )
}
