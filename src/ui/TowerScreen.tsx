import { useEffect, useRef, useState } from 'react'
import type { GameState, FloorResult, CombatLog, BattleOrder } from '../engine/types'
import { scoutFloor, suggestParty, type ScoutReport } from '../engine/scout'
import { ordersAllowed } from '../engine/tower'
import type { Store } from '../engine/store'
import { attemptFloorWithResult, resolveEventWithResult } from '../engine/store'
import { buildEncounter } from '../engine/tower'
import { ACTS, ANCHORS, HIDDEN_OBJECTIVES, actForFloor } from '../engine/content'
import { TUNING } from '../engine/tuning'
import { EVENT_OPTION_LABEL, merchantPrice, treasureGold, type EventOutcome } from '../engine/events'
import { BattleScene, type BattleOrders } from './battle/BattleScene'
import { ResultsScreen } from './screens'
import { HeroCard } from './HeroCard'
import { TimingGame } from './metaPanels'
import { cachedDataUrl } from './pixel/render'
import { scale } from './pixel/bitmap'
import { drawTowerExterior, TOWER_H, TOWER_W } from './pixel/towerMap'
import { t } from './i18n/i18n'
import { ELEMENT_VIS } from './bits'
import { CodexButton } from './codex/CodexWindow'
import { ScoutCodexNote } from './codex/ScoutCodexNote'
import { SynergyPanel } from './tower/SynergyPanel'
import { FloorModBadge, FloorModsLine } from './tower/FloorMods'

const MAX_FLOOR = TUNING.tower.sliceTopFloor
const EV = TUNING.events

/** One-line description of an event option (what the Master is choosing). */
function optionBlurb(option: string, floor: number): string {
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

const EVENT_TITLE = { bonus: 'Event Floor', recovery: 'Recovery', tournament: 'Tournament' } as const

/** The open event floor: pick one option (the climb waits on it). */
function EventPanel({ state, onResolve }: { state: GameState; onResolve: (option: string) => void }) {
  const ev = state.tower.event!
  return (
    <div className="pframe event-panel">
      <div className="event-head">
        <span className="event-kind">{t(EVENT_TITLE[ev.kind])}</span>
        <span className="muted">{t('between F{a} and F{b}', { a: ev.floor, b: ev.floor + 1 })}</span>
      </div>
      <p className="muted" style={{ margin: '4px 0 10px' }}>
        {ev.kind === 'tournament'
          ? t('Masters from other worlds gather between the floors. Pick a format — no one dies here.')
          : ev.kind === 'recovery'
            ? t('The main team is gone. The tower offers a breather before the next floor.')
            : t('A quiet floor between the fights. Choose how to spend it.')}
      </p>
      <div className="event-options">
        {ev.options.map((o) => (
          <button
            key={o}
            className="event-option"
            onClick={() => onResolve(o)}
            disabled={o === 'merchant' && state.gold < merchantPrice()}
          >
            <span className="eo-name">{t(EVENT_OPTION_LABEL[o] ?? o)}</span>
            <span className="eo-blurb">{optionBlurb(o, ev.floor)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** What an event just did. */
function EventOutcomeCard({
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
        <div className="muted">
          {/^Placed \d/.test(outcome.note) ? t('Placed {n} of 8.', { n: outcome.placing ?? 8 }) : t(outcome.note)}
        </div>
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
              <div className="l">{k === 'promotionStone' ? 'Stones' : k}</div>
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

/** The Chronicle: hidden objectives found (with their lore), and what is still unknown. */
function Chronicle({ state }: { state: GameState }) {
  const masterSight = state.meta.masterLevel >= EV.hiddenHintMasterLevel
  const revealed = new Set(state.meta.revealedHidden)
  const found = new Set(state.tower.hiddenFound)
  return (
    <div className="pframe chronicle">
      <div className="event-head">
        <span className="event-kind">{t('Chronicle')}</span>
        <span className="muted">
          {t('{n} / {m} truths', { n: found.size, m: HIDDEN_OBJECTIVES.length })}
        </span>
      </div>
      {HIDDEN_OBJECTIVES.map((h) => (
        <div key={h.id} className={`chron-row ${found.has(h.id) ? 'found' : ''}`}>
          <span className="chron-floor">F{h.floor}</span>
          {found.has(h.id) ? (
            <span>
              <b>{t(h.name)}</b> — <i>{t(h.lore)}</i>
            </span>
          ) : (
            <span className="muted">{masterSight || revealed.has(h.id) ? `??? — ${t(h.hint)}` : t('??? (a hidden objective)')}</span>
          )}
        </div>
      ))}
      {!masterSight && (
        <div className="muted" style={{ fontSize: 13 }}>
          {t('From Master Lv {n} you sense what the floors are hiding — or a Devoted hero can reveal one.', { n: EV.hiddenHintMasterLevel })}
        </div>
      )}
    </div>
  )
}

/** A Devoted hero's peek: the current floor's enemies and what they're weak to. */
function PeekLine({ preview }: { preview: ReturnType<typeof buildEncounter> }) {
  const notes = new Set<string>()
  for (const w of preview.waves) {
    for (const u of w.units) {
      for (const k of u.keywords) {
        const name = t(u.name)
        if (k.kind === 'vulnerable') notes.add(t('{name}: weak to {what}', { name, what: t(ELEMENT_VIS[k.element].label) }))
        if (k.kind === 'immune') notes.add(t('{name}: immune to {what}', { name, what: t(k.damageType) }))
        if (k.kind === 'resist') notes.add(t('{name}: resists {what}', { name, what: t(k.damageType) }))
        if (k.kind === 'looming') notes.add(t('{name}: too strong to fight — finish before it wakes', { name }))
        if (k.kind === 'phased') notes.add(t('{name}: shielded until its guard falls', { name }))
        if (k.kind === 'enrage') notes.add(t('{name}: enrages after {n} ticks', { name, n: k.afterTick }))
      }
    }
  }
  return <div className="peek-line">👁 {notes.size > 0 ? [...notes].join(' · ') : t('No special weakness — just steel and nerve.')}</div>
}

const THREAT_LABEL: Record<ScoutReport['threat'], string> = {
  safe: 'Safe',
  fair: 'Fair fight',
  risky: 'Risky',
  deadly: 'Deadly',
}
const THREAT_COLOR: Record<ScoutReport['threat'], string> = {
  safe: 'var(--good)',
  fair: 'var(--gold)',
  risky: 'var(--warn)',
  deadly: 'var(--bad)',
}

function keywordNote(k: ScoutReport['enemies'][number]['keywords'][number]): string | null {
  switch (k.kind) {
    case 'immune':
      return t('immune to {what}', { what: t(k.damageType) })
    case 'resist':
      return t('resists {what}', { what: t(k.damageType) })
    case 'vulnerable':
      return t('weak to {what}', { what: t(ELEMENT_VIS[k.element].label) })
    case 'looming':
      return t('too strong to fight — finish first')
    case 'phased':
      return t('shielded until its guard falls')
    case 'enrage':
      return t('enrages after {n} ticks', { n: k.afterTick })
    case 'aegis':
      return t('shrugs off the first {n} hits', { n: k.charges })
    default:
      return null
  }
}

/** The scouting report: who waits on the floor, and how the party measures up. */
function ScoutPanel({ state, report, onSuggest }: { state: GameState; report: ScoutReport; onSuggest: () => void }) {
  const pct = Math.min(100, (report.ratio / 2) * 100)
  return (
    <div className="pframe scout">
      <div className="event-head">
        <span className="event-kind">{t('Scouting report · F{n}', { n: report.floor })}</span>
        <span className="muted">
          {t(report.mission)} · {report.waves === 1 ? t('1 wave') : t('{n} waves', { n: report.waves })}
        </span>
      </div>
      <div className="threat-row">
        <span className="threat-label" style={{ color: THREAT_COLOR[report.threat] }}>
          {t(THREAT_LABEL[report.threat])}
        </span>
        <span className="gauge threat-gauge">
          <span style={{ width: `${pct}%`, background: THREAT_COLOR[report.threat] }} />
        </span>
        <span className="muted small">
          {t('party {p} vs floor {f}', { p: Math.round(report.partyCp).toLocaleString(), f: Math.round(report.budget).toLocaleString() })}
        </span>
      </div>
      <div className="muted small">
        {report.expectedDeaths === 0
          ? t('Parties this strong have come back whole.')
          : t('Parties this strong lose about {n} heroes an attempt.', { n: report.expectedDeaths })}
      </div>
      <FloorModsLine mods={report.modifiers} />
      <div className="scout-enemies">
        {report.enemies.map((e) => {
          const notes = report.studied || e.studied || e.keywords.some((k) => k.kind === 'looming') ? e.keywords.map(keywordNote).filter(Boolean) : []
          return (
            <div key={`${e.name}|${e.level}`} className="scout-enemy">
              <span className="el-dot" style={{ background: ELEMENT_VIS[e.element].color }} title={t(ELEMENT_VIS[e.element].label)} />
              <b>{t(e.name)}</b>
              {e.count > 1 && <span className="muted">×{e.count}</span>}
              <span className="muted small">Lv{e.level}</span>
              {e.target && <span className="chip">{t('target')}</span>}
              {notes.length > 0 && <span className="scout-notes">{notes.join(' · ')}</span>}
              <ScoutCodexNote enemy={e} floorStudied={report.studied} />
            </div>
          )
        })}
      </div>
      {!report.studied && (
        <div className="muted small">{t('Weaknesses unknown — a Scholar in the Library can study this floor.')}</div>
      )}
      {report.immune.physical && <div className="scout-warn">⚠ {t('Most of this floor shrugs off physical blows — bring magic.')}</div>}
      {report.immune.magic && <div className="scout-warn">⚠ {t('Most of this floor shrugs off magic — bring blades.')}</div>}
      <div className="scout-actions">
        <button className="pbtn sm" onClick={onSuggest} disabled={Object.values(state.heroes).filter((h) => h.alive).length === 0}>
          ✦ {t('Suggest a party')}
        </button>
      </div>
    </div>
  )
}

/** The tower from outside: where the party stands on the spire of 100 floors. */
function TowerExterior({ state }: { state: GameState }) {
  const tw = state.tower
  const key = `tower|${tw.currentFloor}|${tw.highestCleared}|${tw.worldEnded}|${tw.worldSaved}`
  const url = cachedDataUrl(key, () =>
    scale(drawTowerExterior({ current: tw.currentFloor, highest: tw.highestCleared, worldEnded: tw.worldEnded, worldSaved: tw.worldSaved }), 2),
  )
  return (
    <div className="tower-exterior" title={t('Floor {n} of {max}', { n: Math.min(tw.currentFloor, MAX_FLOOR), max: MAX_FLOOR })}>
      {url && <img className="px" src={url} width={TOWER_W * 2} height={TOWER_H * 2} alt={t('The Tower from outside')} />}
      <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
        {t('{n}/{max} cleared', { n: tw.highestCleared, max: MAX_FLOOR })}
      </div>
    </div>
  )
}

export function TowerScreen({ state, store }: { state: GameState; store: Store }) {
  const [combat, setCombat] = useState<CombatLog | null>(null)
  const [pending, setPending] = useState<FloorResult | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [outcome, setOutcome] = useState<EventOutcome | null>(null)
  const [replay, setReplay] = useState<CombatLog | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [aiming, setAiming] = useState(false)
  const [orders, setOrders] = useState<BattleOrders | null>(null)
  const [openActs, setOpenActs] = useState<Set<string>>(() => new Set([actForFloor(state.tower.currentFloor).id]))

  const current = state.tower.currentFloor
  const currentRef = useRef<HTMLDivElement>(null)
  // The tower is drawn bottom-up; bring the floor you're standing on into view.
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'center' })
  }, [current])
  useEffect(() => {
    setOpenActs((cur) => new Set([...cur, actForFloor(current).id]))
  }, [current])

  const deployable = state.party.slots.some((id) => {
    const h = id ? state.heroes[id] : undefined
    return !!h && h.alive && h.sanity > 0 && h.training === null
  })
  const summit = state.tower.highestCleared >= MAX_FLOOR
  const event = state.tower.event
  const loop = state.tower.loop

  function enter() {
    if (!deployable || current > MAX_FLOOR || event !== null) return
    // Anchors with a mission minigame (the ballista) are played first.
    if (ANCHORS[current]?.minigame === 'ballista') {
      setAiming(true)
      return
    }
    fight(undefined)
  }
  function fight(ballista: number | undefined, subvert?: boolean) {
    setAiming(false)
    const pre = store.getState()!
    const { result } = attemptFloorWithResult(pre, undefined, ballista, subvert) // capture the log for playback
    store.dispatch({ type: 'ATTEMPT_FLOOR', ballista, subvert }) // advance the store identically (deterministic)
    setPending(result)
    setCombat(result.result.log)
    // Mid-battle orders re-resolve the same fight from the same state (deterministic up to
    // the order's tick) and revise the attempt the store just recorded.
    const given: BattleOrder[] = []
    setOrders({
      left: ordersAllowed(pre),
      give: (order) => {
        try {
          const next = [...given, order]
          const r = attemptFloorWithResult(pre, undefined, ballista, subvert, next)
          store.revise({ type: 'ATTEMPT_FLOOR', ballista, subvert, orders: next })
          given.push(order)
          setPending(r.result)
          return r.result.result.log
        } catch {
          return null
        }
      },
    })
  }

  function suggest() {
    const p = suggestParty(state)
    if (p.slots.some(Boolean)) store.dispatch({ type: 'SET_PARTY', slots: p.slots, lines: p.lines })
  }

  function resolve(option: string) {
    setErr(null)
    try {
      const { outcome: out } = resolveEventWithResult(store.getState(), option, Date.now())
      store.dispatch({ type: 'RESOLVE_EVENT', option }, Date.now())
      setOutcome(out)
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }

  function combatDone() {
    setCombat(null)
    setShowResult(true)
  }
  function resultDone() {
    setShowResult(false)
    setPending(null)
  }
  const toggleAct = (id: string) =>
    setOpenActs((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Floor descriptions (anchors are labelled; the current floor gets a live preview).
  const preview = current <= MAX_FLOOR ? buildEncounter(state, current) : null
  const report = current <= MAX_FLOOR && !event ? scoutFloor(state) : null

  return (
    <div className="screen">
      <h2>{t('The Tower')}</h2>
      <p className="sub">
        {t('100 floors of permadeath. Falling heroes are gone for good.')}
        {state.tower.worldEnded && ` ${t('The world you climbed is gone.')}`}
        <CodexButton state={state} />
      </p>

      {summit && (
        <div className="result-card" style={{ marginTop: 0, marginBottom: 20 }}>
          <div className="big-outcome win">{state.tower.worldSaved ? t('TRUE END ✦') : t('SUMMIT ✦')}</div>
          <div className="muted">
            {t('Tell, the Architect, has fallen. You conquered all {n} floors', { n: MAX_FLOOR })}
            {state.tower.worldSaved ? t(' — and the world you climbed is still there.') : t(' — for a world that is already gone.')}
          </div>
        </div>
      )}
      {state.tower.worldEnded && !summit && (
        <div className="pframe world-ended">
          {t('The ninetieth floor is behind you, and the world beneath it has ended. The climb goes on into floors that were never finished.')}
        </div>
      )}

      {loop && (
        <div className="pframe loop-banner">
          <b>{t('Looped mission')}</b> —{' '}
          {t('F{a}–{b}. Failing F{b} sends the room back to F{c}.', {
            a: TUNING.tower.loop.start,
            b: TUNING.tower.loop.gate,
            c: TUNING.tower.loop.fallbackTo,
          })}{' '}
          {t('Attempts left:')} <b>{loop.attemptsLeft}</b>
          {loop.scars > 0 && <> · {t('scars:')} <b>{loop.scars}</b> {t('(the loop has hardened)')}</>}
        </div>
      )}

      {event && <EventPanel state={state} onResolve={resolve} />}
      {err && <div className="muted" style={{ color: 'var(--bad)' }}>{err}</div>}

      {report && <ScoutPanel state={state} report={report} onSuggest={suggest} />}
      {report && <SynergyPanel state={state} />}

      {!deployable && !event && (
        <div className="empty" style={{ color: 'var(--warn)' }}>
          {t("No deployable heroes — set your Party (heroes in training or broken down can't fight).")}
        </div>
      )}

      <div className="tower-layout">
      <TowerExterior state={state} />
      <div className="tower">
        {ACTS.flatMap((act) => {
          const open = openActs.has(act.id)
          const floors = open ? Array.from({ length: act.to - act.from + 1 }, (_, i) => act.from + i) : []
          return [...floors, `act:${act.id}`]
        }).map((f) => {
          if (typeof f === 'string') {
            const act = ACTS.find((a) => `act:${a.id}` === f)!
            const cleared = Math.max(0, Math.min(act.to, state.tower.highestCleared) - act.from + 1)
            return (
              <button key={f} className={`act-head ${openActs.has(act.id) ? 'open' : ''}`} onClick={() => toggleAct(act.id)}>
                <span className="act-title">
                  {openActs.has(act.id) ? '▾' : '▸'} {t(act.title)}
                </span>
                <span className="muted">
                  {t(act.subtitle)} · {cleared}/{act.to - act.from + 1}
                </span>
              </button>
            )
          }
          const cleared = f <= state.tower.highestCleared
          const isCurrent = f === current
          const locked = f > current
          const anchor = ANCHORS[f]
          const cls = ['floor', cleared ? 'cleared' : '', isCurrent ? 'current' : '', locked ? 'locked' : ''].filter(Boolean).join(' ')
          const mission = isCurrent && preview ? preview.mission.type : anchor ? anchor.missionType : 'Seeded floor'
          const enemyCount = isCurrent && preview ? preview.waves.reduce((n, w) => n + w.units.length, 0) : null
          return (
            <div key={f} className={cls} ref={isCurrent ? currentRef : undefined}>
              <div className="fnum">{cleared ? '✓' : `F${f}`}</div>
              <div className="fdesc">
                <div className="ft">
                  {t('Floor {n}', { n: f })} {anchor && <span className="anchor-badge">{t('ANCHOR')}</span>}
                  {f === TUNING.tower.worldEndFloor && <span className="anchor-badge danger">{t('WORLD\'S END')}</span>}
                  <FloorModBadge state={state} floor={f} />
                </div>
                <div className="fs">
                  {t(mission)}
                  {enemyCount !== null && ` · ${t('{n} enemies', { n: enemyCount })}`}
                  {f === current && state.tower.attemptIndex > 0 && ` · ${t('attempt {n}', { n: state.tower.attemptIndex + 1 })}`}
                  {anchor?.minigame === 'ballista' && ` · 🎯 ${t('ballista')}`}
                </div>
                {isCurrent && preview && state.meta.peekedFloors.includes(f) && <PeekLine preview={preview} />}
              </div>
              {isCurrent && f <= MAX_FLOOR && (
                <button className="btn primary" onClick={enter} disabled={!deployable || event !== null}>
                  {f === TUNING.tower.worldEndFloor && !state.tower.worldSaved ? t('Clear it ▸') : t('Enter ▸')}
                </button>
              )}
              {isCurrent && f === TUNING.tower.worldEndFloor && state.tower.hiddenFound.length >= TUNING.lifecycle.subvertTruths && (
                <button
                  className="btn gem"
                  onClick={() => fight(undefined, true)}
                  disabled={!deployable || event !== null}
                  title={t('You know what clearing this floor does. Refuse the win condition.')}
                >
                  {t('Subvert ✦')}
                </button>
              )}
            </div>
          )
        })}
      </div>

      </div>

      <Chronicle state={state} />

      {aiming && (
        <TimingGame
          title={t('The Ballista')}
          verb={t('Shoot')}
          skill={state.meta.skill.ballista}
          hint={t('Loose the bolt as the sight crosses the heart. A true shot breaks the scales before the fight begins.')}
          onDone={fight}
          onCancel={() => setAiming(false)}
        />
      )}
      {combat && <BattleScene log={combat} state={state} onDone={combatDone} orders={orders ?? undefined} />}
      {showResult && pending && <ResultsScreen result={pending} state={state} onContinue={resultDone} />}
      {outcome && !replay && <EventOutcomeCard outcome={outcome} onReplay={setReplay} onClose={() => setOutcome(null)} />}
      {replay && <BattleScene log={replay} state={state} onDone={() => setReplay(null)} />}
    </div>
  )
}
