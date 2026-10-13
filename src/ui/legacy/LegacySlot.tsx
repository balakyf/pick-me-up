import type { FloorResult, GameState, HeroId } from '../../engine/types'
import type { Store } from '../../engine/store'
import { legacyPct } from '../../engine/legacy'
import { inSentence, t } from '../i18n/i18n'
import { BequestCard, heirOf } from './BequestCard'
import { RecruitBell } from './RecruitBell'
import { baneName, firstName, pctNum } from './legacyText'
import './legacy.css'

export interface LegacySlotProps {
  state: GameState
  /** Optional: ResultsScreen gets a store only when its host passes one. */
  store?: Store
  result: FloorResult
}

/**
 * The legacy of this battle's fallen, on the results card (spec S21-S23): each Echo
 * waiting for an heir, the Bane the killer became, a new face at the bell, and what the
 * Memorial now gives. Renders nothing when nobody fell.
 */
export function LegacySlot({ state, store, result }: LegacySlotProps) {
  const fallen = result.fallenHeroIds.filter((id) => state.heroes[id] && !state.heroes[id]!.alive) as HeroId[]
  if (fallen.length === 0) return null
  // One Echo at a time (a wipe can leave five): the ones passed on, then the next waiting.
  const waiting = state.life.legacy.pending.filter((p) => fallen.includes(p.fallenId))
  const passed = fallen.filter((id) => !waiting.some((p) => p.fallenId === id) && heirOf(state, id) !== null)
  const banes = state.life.legacy.nemeses.filter((n) => fallen.includes(n.heroId) && n.diedFloor === result.floor)
  const pct = legacyPct(state)
  return (
    <div className="legacy-slot">
      <div className="ls-title">{t('What they leave behind')}</div>
      {passed.map((id) => (
        <BequestCard key={id} state={state} store={store} fallenId={id} />
      ))}
      {waiting.length > 0 && <BequestCard key={waiting[0]!.fallenId} state={state} store={store} fallenId={waiting[0]!.fallenId} />}
      {waiting.length > 1 && (
        <div className="ls-more muted small">
          {t('Also waiting for an heir: {names}. One at a time, or later in the Memorial.', {
            names: waiting
              .slice(1)
              .map((p) => firstName(p.fallenName))
              .join(', '),
          })}
        </div>
      )}
      {banes.map((n) => (
        <div key={n.id} className="ls-bane">
          <span className="ls-skull">☠</span>{' '}
          {t('The {enemy} that struck {name} down is marked now: {bane}. It waits on floor {n}.', {
            enemy: t(n.name),
            name: firstName(n.heroName),
            bane: inSentence(baneName(n)),
            n: n.revengeFloor,
          })}
        </div>
      ))}
      <RecruitBell state={state} store={store} />
      {pct > 0 && <div className="ls-remember muted small">{t('The tower remembers: +{pct}% to every stat.', { pct: pctNum(pct) })}</div>}
    </div>
  )
}
