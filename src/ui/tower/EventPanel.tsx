/**
 * Event floors in the war room: the open one (pick an option — the climb waits on it), the
 * ones queued behind it (B19: a recovery first, then the tournament or an anchor's bonus),
 * and the card that shows what a choice just did.
 */
import type { Ref } from 'react'
import type { CombatLog, GameState, TowerEvent } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { EVENT_OPTION_LABEL, merchantPrice, treasureGold, type EventOutcome } from '../../engine/events'
import { HeroCard } from '../HeroCard'
import { t } from '../i18n/i18n'
import { eventWhere } from './towerText'

const EV = TUNING.events

/** One-line description of an event option (what the Master is choosing). */
export function optionBlurb(option: string, floor: number, kind?: TowerEvent['kind']): string {
  // At a camp after a heavy loss, the choices are part of the story (lane K).
  if (kind === 'recovery' && option === 'rest') return t('Tend the wounded by the fire: every living hero recovers {n} Sanity.', { n: EV.restSanity })
  if (kind === 'recovery' && option === 'reinforcement') return t('A stranger at the camp asks to join: a free Normal summon.')
  switch (option) {
    case 'rest':
      return t('Every living hero recovers {n} Sanity.', { n: EV.restSanity })
    case 'treasure':
      return t('A cache: {g} gold and {s} stones.', { g: treasureGold(floor).toLocaleString(), s: EV.treasureStones })
    case 'merchant':
      return t('Buy {n} Promotion Stones for {g} gold.', { n: EV.merchantStones, g: merchantPrice().toLocaleString() })
    case 'gamble':
      return t('A sealed door. {p}%: a vault worth ×{m} treasure. Otherwise the party loses {s} Sanity.', { p: Math.round(EV.gambleChance * 100), m: EV.gambleWinMult, s: EV.gambleSanity })
    case 'reinforcement':
      return t('A free Normal summon joins the roster.')
    case 'battle_royale':
      return t('Your party against three rival squads, back to back.')
    case 'party_raid':
      return t('Your party against a raid colossus, against the clock.')
    case 'team':
      return t('Three 5-on-5 rounds against rising rivals.')
    case 'pair':
      return t('Your two strongest heroes, three rounds.')
    case 'deathmatch':
      return t('Your single strongest hero, three duels.')
    default:
      return ''
  }
}

export const EVENT_TITLE = { bonus: 'Event Floor', recovery: 'Camp', tournament: 'Tournament' } as const

/** What waits behind the open event (the queue lane B keeps). */
export function queuedLine(queue: readonly TowerEvent[] | undefined): string | null {
  if (!queue || queue.length === 0) return null
  return t('Then: {events}', { events: queue.map((e) => t(EVENT_TITLE[e.kind])).join(', ') })
}

/** The open event floor: pick one option (the climb waits on it). */
export function EventPanel({
  state,
  onResolve,
  panelRef,
}: {
  state: GameState
  onResolve: (option: string) => void
  panelRef?: Ref<HTMLDivElement>
}) {
  const ev = state.tower.event!
  const then = queuedLine(state.tower.eventQueue)
  return (
    <div className="pframe event-panel" ref={panelRef}>
      <div className="event-head">
        <span className="event-kind">{t(EVENT_TITLE[ev.kind])}</span>
        <span className="muted">{eventWhere(ev, state.tower.currentFloor)}</span>
      </div>
      <p className="muted" style={{ margin: '4px 0 10px' }}>
        {ev.kind === 'tournament'
          ? t('Masters from other worlds gather between the floors. Pick a format — no one dies here.')
          : ev.kind === 'recovery'
            ? t('The party has made camp on the stair. Tend the wounded, or take in a stranger, before the next floor.')
            : t('A quiet floor between the fights. Choose how to spend it.')}
      </p>
      <div className="event-options">
        {ev.options.map((o) => (
          <button key={o} className="event-option" onClick={() => onResolve(o)} disabled={o === 'merchant' && state.gold < merchantPrice()}>
            <span className="eo-name">{t(EVENT_OPTION_LABEL[o] ?? o)}</span>
            <span className="eo-blurb">{optionBlurb(o, ev.floor, ev.kind)}</span>
          </button>
        ))}
      </div>
      {then && <div className="muted small event-queue">⏭ {then}</div>}
    </div>
  )
}

/** What an event just did. */
export function EventOutcomeCard({
  outcome,
  onReplay,
  onClose,
}: {
  outcome: EventOutcome
  onReplay: (log: CombatLog) => void
  onClose: () => void
}) {
  const mats = Object.entries(outcome.materials)
  return (
    <div className="overlay">
      <div className="result-card">
        <div className={`big-outcome ${outcome.won === false || (outcome.wins !== undefined && outcome.wins === 0) ? 'lose' : 'win'}`}>
          {t(EVENT_OPTION_LABEL[outcome.option] ?? outcome.option)}
        </div>
        <div className="muted">{/^Placed \d/.test(outcome.note) ? t('Placed {n} of 8.', { n: outcome.placing ?? 8 }) : t(outcome.note)}</div>
        {outcome.rounds && (
          <div className="tourney-rounds">
            {outcome.rounds.map((r, i) => (
              <button key={i} className={`tr-round ${r.won ? 'won' : 'lost'}`} onClick={() => onReplay(r.log)} title={t('Watch this round')}>
                {t('Round {n}', { n: i + 1 })} · {r.won ? t('won') : t('lost')} · {t('rival CP')} {r.rivalCp.toLocaleString()} ▸
              </button>
            ))}
            <div className="tr-placing">{t('Placing: {n} / 8', { n: outcome.placing ?? 8 })}</div>
          </div>
        )}
        <div className="reward-row">
          {outcome.gold !== 0 && (
            <div className="r">
              <div className="n" style={{ color: 'var(--gold)' }}>
                {outcome.gold > 0 ? '+' : ''}
                {outcome.gold.toLocaleString()}
              </div>
              <div className="l">{t('Gold')}</div>
            </div>
          )}
          {outcome.gems > 0 && (
            <div className="r">
              <div className="n" style={{ color: 'var(--gem)' }}>+{outcome.gems}</div>
              <div className="l">{t('Gems')}</div>
            </div>
          )}
          {mats.map(([k, v]) => (
            <div className="r" key={k}>
              <div className="n">+{v}</div>
              <div className="l">{k === 'promotionStone' ? t('Stones') : k}</div>
            </div>
          ))}
          {outcome.sanity !== 0 && (
            <div className="r">
              <div className="n" style={{ color: outcome.sanity > 0 ? 'var(--good)' : 'var(--bad)' }}>
                {outcome.sanity > 0 ? '+' : ''}
                {outcome.sanity}
              </div>
              <div className="l">{t('Sanity')}</div>
            </div>
          )}
        </div>
        {outcome.recruit && (
          <div className="reveal" style={{ margin: '0 auto 12px' }}>
            <HeroCard hero={outcome.recruit} />
          </div>
        )}
        <button className="btn primary big" onClick={onClose}>
          {t('Onward ▸')}
        </button>
      </div>
    </div>
  )
}
