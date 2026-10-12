import type { GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { t } from '../i18n/i18n'
import { UpgradeControl } from '../facilityPanels'
import { HereNow } from '../life/lifePanels'
import { accountDay, lastWords, shortName } from '../life/speech'

/**
 * The Memorial place body (moved verbatim from facilityPanels, WP0), with its grave list
 * (moved verbatim from life/lifePanels). WP5 owns this file: plaques, lessons, Echo
 * assignment, the recruit claim and the Nemesis list land here.
 *
 * Note: facilityPanels imports this module and this module imports UpgradeControl from
 * facilityPanels. The cycle is safe because each side only uses the other at render time.
 */
export function MemorialPanel({ state, store, onProfile }: { state: GameState; store: Store; onProfile?: (id: string) => void }) {
  return (
    <>
      <UpgradeControl state={state} store={store} facility="memorial" />
      <h4 className="panel-sub">{t('Visiting now')}</h4>
      <HereNow state={state} place="memorial" onProfile={onProfile} empty="No one is visiting." />
      <GraveList state={state} />
    </>
  )
}

/** The Memorial: every grave, with the words each hero left behind. */
export function GraveList({ state }: { state: GameState }) {
  const graves = [...state.life.memorial].reverse()
  if (graves.length === 0) return <div className="lr-empty">{t('The lawn is empty. Keep it that way, Master.')}</div>
  const cause = (c: string, floor: number) =>
    c === 'synthesis' ? t('lost to the Synthesis Chamber') : c === 'captor' ? t('never ransomed') : t('fell on floor {n}', { n: floor })
  return (
    <div className="memorial">
      <p className="muted">{t('{n} names on the obelisk.', { n: graves.length })}</p>
      {graves.map((g) => (
        <div key={g.heroId} className="grave-row">
          <div className="grave-name">
            <b>{g.name}</b> <span className="muted small">{g.star}★ Lv{g.level}</span>
          </div>
          <div className="muted small">
            {cause(g.cause, g.floor)} · {t('day {n}', { n: accountDay(state, g.day) })} · {t('served {n} days', { n: g.daysServed })}
            {g.mourners.length > 0 && ` · ${t('mourned by {names}', { names: g.mourners.map((m) => shortName(state, m)).join(', ') })}`}
          </div>
          <div className="last-words">“{lastWords(state, g)}”</div>
        </div>
      ))}
    </div>
  )
}
