/**
 * The war room's command panel (O22): everything the Master decides before a floor, in one
 * sticky column beside the tower — the event floor waiting (and what is queued behind it),
 * the forecast and what would change it, the party with its Sanity, the side door and the
 * challenges, the bonds, and Enter.
 */
import type { ReactNode, Ref } from 'react'
import type { BattleOrder, Encounter, FocusDirective, GameState } from '../../engine/types'
import type { ForecastAlternative } from '../../engine/scout/forecast'
import type { ScoutReport } from '../../engine/scout'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { t } from '../i18n/i18n'
import { TowerChallenges } from '../challenge/TowerChallenges'
import { EventPanel } from './EventPanel'
import { ForecastPanel } from './ForecastPanel'
import { PartyStrip } from './PartyStrip'
import { PreBattleOrders } from './PreBattleOrders'
import { SynergyPanel } from './SynergyPanel'
import { enterBlockText, type EnterBlock } from './towerText'
import { truthStanding } from './warRoomText'
import type { ForecastView } from './useForecast'

const MAX_FLOOR = TUNING.tower.sliceTopFloor

export function CommandPanel({
  state,
  store,
  view,
  report,
  names,
  opening,
  block,
  err,
  eventRef,
  onResolve,
  onEnter,
  onSubvert,
  onSuggest,
  onUse,
  onClearOpening,
  onToEvent,
  directive,
  onDirective,
  encounter = null,
  children,
}: {
  state: GameState
  store: Store
  view: ForecastView
  report: ScoutReport | null
  names: Record<string, string>
  opening: BattleOrder[]
  block: EnterBlock
  err: string | null
  eventRef?: Ref<HTMLDivElement>
  onResolve: (option: string) => void
  onEnter: () => void
  onSubvert: () => void
  onSuggest: () => void
  onUse: (a: ForecastAlternative) => void
  onClearOpening: () => void
  onToEvent: () => void
  /** The free pre-battle mark and Protects (lane G), and the floor they are given on. */
  directive?: FocusDirective
  onDirective?: (d: FocusDirective | undefined) => void
  encounter?: Encounter | null
  /** The room's banners (the tower's line, the summit, the loop), shown first. */
  children?: ReactNode
}) {
  const current = state.tower.currentFloor
  const event = state.tower.event
  const climbing = current <= MAX_FLOOR
  const worldEnd = current === TUNING.tower.worldEndFloor && !state.tower.worldEnded && !state.tower.worldSaved
  const truths = truthStanding(state)
  return (
    <aside className="war-command" aria-label={t('Command')}>
      {children}
      {event && <EventPanel state={state} onResolve={onResolve} panelRef={eventRef} />}
      {err && (
        <div className="muted" style={{ color: 'var(--bad)' }} role="alert">
          {err}
        </div>
      )}

      {report && (
        <ForecastPanel
          state={state}
          report={report}
          view={view}
          names={names}
          opening={opening}
          onClearOpening={onClearOpening}
          onUse={onUse}
          onSuggest={onSuggest}
          mark={directive?.focusEnemyId}
          onMark={onDirective ? (id) => onDirective({ ...directive, focusEnemyId: id }) : undefined}
        />
      )}

      {climbing && (
        <div className="pframe war-enter">
          <PartyStrip state={state} />
          {onDirective && <PreBattleOrders state={state} encounter={encounter} directive={directive} onChange={onDirective} />}
          <div className="war-enter-row">
            <span className="enter-wrap" title={block ? enterBlockText(block) : undefined}>
              <button className="btn primary big" onClick={onEnter} disabled={block !== null}>
                {worldEnd ? t('Clear it ▸') : t('Enter ▸')}
              </button>
            </span>
            {worldEnd && truths.qualified && (
              <button
                className="btn gem"
                onClick={onSubvert}
                disabled={block !== null}
                title={t('You know what clearing this floor does. Refuse the win condition.')}
              >
                {t('Subvert ✦')}
              </button>
            )}
            <span className="muted small war-enter-floor">
              {t('Floor {n}', { n: current })}
              {state.tower.attemptIndex > 0 && ` · ${t('attempt {n}', { n: state.tower.attemptIndex + 1 })}`}
            </span>
          </div>
          {block && (
            <div className="enter-why">
              {enterBlockText(block)}{' '}
              {block === 'event' && (
                <button className="linkish" onClick={onToEvent}>
                  {t('Go to the event ↑')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <TowerChallenges state={state} store={store} />
      {report && <SynergyPanel state={state} />}
    </aside>
  )
}
