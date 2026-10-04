/**
 * Back at camp (lane L): the window that greets the Master home from the tower — who is
 * tired, grieving, low or ready, and the one-click answers (campSummary.ts).
 */
import { useState } from 'react'
import type { GameState, HeroId } from '../../engine/types'
import type { Store } from '../../engine/store'
import { PixelWindow } from '../kit'
import { heroBustUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'
import { fmtInt } from '../text'
import { shortName } from './speech'
import { MoralePips } from './MoralePips'
import { campSummary, type CampAction } from './campSummary'
import './morale.css'

type Place = 'tavern' | 'infirmary' | 'memorial'

const PLACE_ACTION: Record<Place, string> = {
  memorial: 'Visit the Memorial',
  infirmary: 'To the Infirmary',
  tavern: 'To the Tavern',
}

function HeroChips({ state, ids, onProfile }: { state: GameState; ids: HeroId[]; onProfile: (id: string) => void }) {
  return (
    <div className="camp-heroes">
      {ids.map((id) => {
        const h = state.heroes[id]
        if (!h) return null
        return (
          <button key={id} className="camp-hero" onClick={() => onProfile(id)} title={t('Profile')}>
            <img className="px" src={heroBustUrl(h)} width={20} height={20} alt="" />
            {shortName(state, id)} <MoralePips state={state} heroId={id} />
          </button>
        )
      })}
    </div>
  )
}

export function CampSummaryWindow({
  state,
  store,
  onClose,
  onProfile,
  onPlace,
  onGazette,
}: {
  state: GameState
  store: Store
  onClose: () => void
  onProfile: (id: string) => void
  onPlace: (place: Place) => void
  onGazette: () => void
}) {
  const s = campSummary(state)
  const [said, setSaid] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const act = (a: CampAction) => {
    setErr(null)
    try {
      switch (a.kind) {
        case 'rest':
          store.dispatch({ type: 'SET_PARTY', slots: a.slots, lines: a.lines }, Date.now())
          setSaid((x) => [...x, t('{out} rest; {in} take their places.', { out: a.out.map((id) => shortName(state, id)).join(', '), in: a.in.map((id) => shortName(state, id)).join(', ') })])
          break
        case 'banquet':
          store.dispatch({ type: 'BANQUET' }, Date.now())
          setSaid((x) => [...x, t('A banquet in the hall: everyone’s spirits lift.')])
          break
        case 'talk':
          store.dispatch({ type: 'TALK_TO_HERO', heroId: a.heroId }, Date.now())
          setSaid((x) => [...x, t('You sat with {name} a while.', { name: shortName(state, a.heroId) })])
          break
        case 'place':
          onPlace(a.place)
          break
        case 'gazette':
          onGazette()
          break
      }
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }
  const label = (a: CampAction): string => {
    switch (a.kind) {
      case 'rest':
        return t('Rest the tired ({n} swapped)', { n: a.out.length })
      case 'banquet':
        return t('Hold a banquet ({gold} gold)', { gold: fmtInt(a.gold) })
      case 'talk':
        return t('Talk to {name}', { name: shortName(state, a.heroId) })
      case 'place':
        return t(PLACE_ACTION[a.place])
      case 'gazette':
        return t('Read the Gazette')
    }
  }
  const rows: { cls: string; tag: string; ids: HeroId[]; note: string }[] = [
    { cls: 'troubled', tag: t('Low spirits'), ids: s.troubled, note: t('Shaken heroes fight worse; broken ones will not deploy.') },
    { cls: 'grieving', tag: t('Grieving'), ids: s.grieving, note: t('Friends and the Memorial ease grief.') },
    { cls: 'tired', tag: t('Tired'), ids: s.tired, note: t('Low Sanity or too many floors in a row: rest them a day.') },
    { cls: 'ready', tag: t('Ready'), ids: s.ready, note: '' },
  ]
  return (
    <PixelWindow title={t('Back at camp')} icon="⛺" onClose={onClose}>
      <div className="camp">
        {rows
          .filter((r) => r.ids.length > 0)
          .map((r) => (
            <div key={r.cls} className={`camp-row ${r.cls}`}>
              <span className="camp-tag">{r.tag}</span>
              <div>
                <HeroChips state={state} ids={r.ids} onProfile={onProfile} />
                {r.note && <div className="camp-note">{r.note}</div>}
              </div>
            </div>
          ))}
        {s.tired.length + s.grieving.length + s.troubled.length === 0 && <p>{t('Everyone came home in good shape.')}</p>}
        <div className="camp-actions">
          {s.actions.map((a, i) => (
            <button key={i} className={`pbtn ${a.kind === 'rest' || a.kind === 'banquet' ? 'gem' : ''}`} onClick={() => act(a)}>
              {label(a)}
            </button>
          ))}
        </div>
        {said.map((x, i) => (
          <div key={i} className="inc-done">
            ✓ {x}
          </div>
        ))}
        {err && <div className="err">{err}</div>}
        <button className="btn primary" onClick={onClose}>
          {t('Carry on')}
        </button>
      </div>
    </PixelWindow>
  )
}
