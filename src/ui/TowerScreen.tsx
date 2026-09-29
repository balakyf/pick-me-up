import { useEffect, useRef, useState } from 'react'
import type { GameState, FloorResult, CombatLog } from '../engine/types'
import type { Store } from '../engine/store'
import { attemptFloorWithResult, resolveEventWithResult } from '../engine/store'
import { buildEncounter } from '../engine/tower'
import { ACTS, ANCHORS, HIDDEN_OBJECTIVES, actForFloor } from '../engine/content'
import { TUNING } from '../engine/tuning'
import { EVENT_OPTION_LABEL, merchantPrice, treasureGold, type EventOutcome } from '../engine/events'
import { BattleScene } from './battle/BattleScene'
import { ResultsScreen } from './screens'
import { HeroCard } from './HeroCard'
import { TimingGame } from './metaPanels'
import { cachedDataUrl } from './pixel/render'
import { scale } from './pixel/bitmap'
import { drawTowerExterior, TOWER_H, TOWER_W } from './pixel/towerMap'

const MAX_FLOOR = TUNING.tower.sliceTopFloor
const EV = TUNING.events

/** One-line description of an event option (what the Master is choosing). */
function optionBlurb(option: string, floor: number): string {
  switch (option) {
    case 'rest':
      return `Every living hero recovers ${EV.restSanity} Sanity.`
    case 'treasure':
      return `A cache: ${treasureGold(floor).toLocaleString()} gold and ${EV.treasureStones} stones.`
    case 'merchant':
      return `Buy ${EV.merchantStones} Promotion Stones for ${merchantPrice().toLocaleString()} gold.`
    case 'gamble':
      return `A sealed door. ${Math.round(EV.gambleChance * 100)}%: a vault worth ×${EV.gambleWinMult} treasure. Otherwise the party loses ${EV.gambleSanity} Sanity.`
    case 'reinforcement':
      return 'A free Normal summon joins the roster.'
    case 'battle_royale':
      return 'Your party against three rival squads, back to back.'
    case 'party_raid':
      return 'Your party against a raid colossus, against the clock.'
    case 'team':
      return 'Three 5-on-5 rounds against rising rivals.'
    case 'pair':
      return 'Your two strongest heroes, three rounds.'
    case 'deathmatch':
      return 'Your single strongest hero, three duels.'
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
        <span className="event-kind">{EVENT_TITLE[ev.kind]}</span>
        <span className="muted">between F{ev.floor} and F{ev.floor + 1}</span>
      </div>
      <p className="muted" style={{ margin: '4px 0 10px' }}>
        {ev.kind === 'tournament'
          ? 'Masters from other worlds gather between the floors. Pick a format — no one dies here.'
          : ev.kind === 'recovery'
            ? 'The main team is gone. The tower offers a breather before the next floor.'
            : 'A quiet floor between the fights. Choose how to spend it.'}
      </p>
      <div className="event-options">
        {ev.options.map((o) => (
          <button
            key={o}
            className="event-option"
            onClick={() => onResolve(o)}
            disabled={o === 'merchant' && state.gold < merchantPrice()}
          >
            <span className="eo-name">{EVENT_OPTION_LABEL[o] ?? o}</span>
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
          {EVENT_OPTION_LABEL[outcome.option] ?? outcome.option}
        </div>
        <div className="muted">{outcome.note}</div>
        {outcome.rounds && (
          <div className="tourney-rounds">
            {outcome.rounds.map((r, i) => (
              <button key={i} className={`tr-round ${r.won ? 'won' : 'lost'}`} onClick={() => onReplay(r.log)} title="Watch this round">
                Round {i + 1} · {r.won ? 'won' : 'lost'} · rival CP {r.rivalCp.toLocaleString()} ▸
              </button>
            ))}
            <div className="tr-placing">Placing: {outcome.placing} / 8</div>
          </div>
        )}
        <div className="reward-row">
          {outcome.gold !== 0 && (
            <div className="r">
              <div className="n" style={{ color: 'var(--gold)' }}>
                {outcome.gold > 0 ? '+' : ''}
                {outcome.gold.toLocaleString()}
              </div>
              <div className="l">Gold</div>
            </div>
          )}
          {outcome.gems > 0 && (
            <div className="r">
              <div className="n" style={{ color: 'var(--gem)' }}>+{outcome.gems}</div>
              <div className="l">Gems</div>
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
              <div className="l">Sanity</div>
            </div>
          )}
        </div>
        {outcome.recruit && (
          <div className="reveal" style={{ margin: '0 auto 12px' }}>
            <HeroCard hero={outcome.recruit} />
          </div>
        )}
        <button className="btn primary big" onClick={onClose}>
          Onward ▸
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
        <span className="event-kind">Chronicle</span>
        <span className="muted">
          {found.size} / {HIDDEN_OBJECTIVES.length} truths
        </span>
      </div>
      {HIDDEN_OBJECTIVES.map((h) => (
        <div key={h.id} className={`chron-row ${found.has(h.id) ? 'found' : ''}`}>
          <span className="chron-floor">F{h.floor}</span>
          {found.has(h.id) ? (
            <span>
              <b>{h.name}</b> — <i>{h.lore}</i>
            </span>
          ) : (
            <span className="muted">{masterSight || revealed.has(h.id) ? `??? — ${h.hint}` : '??? (a hidden objective)'}</span>
          )}
        </div>
      ))}
      {!masterSight && (
        <div className="muted" style={{ fontSize: 13 }}>
          From Master Lv {EV.hiddenHintMasterLevel} you sense what the floors are hiding — or a Devoted hero can reveal one.
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
        if (k.kind === 'vulnerable') notes.add(`${u.name}: weak to ${k.element}`)
        if (k.kind === 'immune') notes.add(`${u.name}: immune to ${k.damageType}`)
        if (k.kind === 'phased') notes.add(`${u.name}: shielded until its guard falls`)
        if (k.kind === 'enrage') notes.add(`${u.name}: enrages after ${k.afterTick} ticks`)
      }
    }
  }
  return <div className="peek-line">👁 {notes.size > 0 ? [...notes].join(' · ') : 'No special weakness — just steel and nerve.'}</div>
}

/** The tower from outside: where the party stands on the spire of 100 floors. */
function TowerExterior({ state }: { state: GameState }) {
  const t = state.tower
  const key = `tower|${t.currentFloor}|${t.highestCleared}|${t.worldEnded}|${t.worldSaved}`
  const url = cachedDataUrl(key, () =>
    scale(drawTowerExterior({ current: t.currentFloor, highest: t.highestCleared, worldEnded: t.worldEnded, worldSaved: t.worldSaved }), 2),
  )
  return (
    <div className="tower-exterior" title={`Floor ${Math.min(t.currentFloor, MAX_FLOOR)} of ${MAX_FLOOR}`}>
      {url && <img className="px" src={url} width={TOWER_W * 2} height={TOWER_H * 2} alt="The Tower from outside" />}
      <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
        {t.highestCleared}/{MAX_FLOOR} cleared
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
  }

  function resolve(option: string) {
    setErr(null)
    try {
      const { outcome: out } = resolveEventWithResult(store.getState(), option, Date.now())
      store.dispatch({ type: 'RESOLVE_EVENT', option }, Date.now())
      setOutcome(out)
    } catch (e) {
      setErr(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed')
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

  return (
    <div className="screen">
      <h2>The Tower</h2>
      <p className="sub">
        100 floors of permadeath. Falling heroes are gone for good.
        {state.tower.worldEnded && ' The world you climbed is gone.'}
      </p>

      {summit && (
        <div className="result-card" style={{ marginTop: 0, marginBottom: 20 }}>
          <div className="big-outcome win">{state.tower.worldSaved ? 'TRUE END ✦' : 'SUMMIT ✦'}</div>
          <div className="muted">
            Tell, the Architect, has fallen. You conquered all {MAX_FLOOR} floors
            {state.tower.worldSaved ? ' — and the world you climbed is still there.' : ' — for a world that is already gone.'}
          </div>
        </div>
      )}
      {state.tower.worldEnded && !summit && (
        <div className="pframe world-ended">
          The ninetieth floor is behind you, and the world beneath it has ended. The climb goes on into floors that were never finished.
        </div>
      )}

      {loop && (
        <div className="pframe loop-banner">
          <b>Looped mission</b> — F{TUNING.tower.loop.start}–{TUNING.tower.loop.gate}. Failing F{TUNING.tower.loop.gate} sends the room back
          to F{TUNING.tower.loop.fallbackTo}. Attempts left: <b>{loop.attemptsLeft}</b>
          {loop.scars > 0 && <> · scars: <b>{loop.scars}</b> (the loop has hardened)</>}
        </div>
      )}

      {event && <EventPanel state={state} onResolve={resolve} />}
      {err && <div className="muted" style={{ color: 'var(--bad)' }}>{err}</div>}

      {!deployable && !event && (
        <div className="empty" style={{ color: 'var(--warn)' }}>
          No deployable heroes — set your Party (heroes in training or broken down can't fight).
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
                  {openActs.has(act.id) ? '▾' : '▸'} {act.title}
                </span>
                <span className="muted">
                  {act.subtitle} · {cleared}/{act.to - act.from + 1}
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
                  Floor {f} {anchor && <span className="anchor-badge">ANCHOR</span>}
                  {f === TUNING.tower.worldEndFloor && <span className="anchor-badge danger">WORLD'S END</span>}
                </div>
                <div className="fs">
                  {mission}
                  {enemyCount !== null && ` · ${enemyCount} enemies`}
                  {f === current && state.tower.attemptIndex > 0 && ` · attempt ${state.tower.attemptIndex + 1}`}
                  {anchor?.minigame === 'ballista' && ' · 🎯 ballista'}
                </div>
                {isCurrent && preview && state.meta.peekedFloors.includes(f) && <PeekLine preview={preview} />}
              </div>
              {isCurrent && f <= MAX_FLOOR && (
                <button className="btn primary" onClick={enter} disabled={!deployable || event !== null}>
                  {f === TUNING.tower.worldEndFloor && !state.tower.worldSaved ? 'Clear it ▸' : 'Enter ▸'}
                </button>
              )}
              {isCurrent && f === TUNING.tower.worldEndFloor && state.tower.hiddenFound.length >= TUNING.lifecycle.subvertTruths && (
                <button
                  className="btn gem"
                  onClick={() => fight(undefined, true)}
                  disabled={!deployable || event !== null}
                  title="You know what clearing this floor does. Refuse the win condition."
                >
                  Subvert ✦
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
          title="The Ballista"
          verb="Fire"
          skill={state.meta.skill.ballista}
          hint="Loose the bolt as the sight crosses the heart. A true shot breaks the scales before the fight begins."
          onDone={fight}
          onCancel={() => setAiming(false)}
        />
      )}
      {combat && <BattleScene log={combat} state={state} onDone={combatDone} />}
      {showResult && pending && <ResultsScreen result={pending} state={state} onContinue={resultDone} />}
      {outcome && !replay && <EventOutcomeCard outcome={outcome} onReplay={setReplay} onClose={() => setOutcome(null)} />}
      {replay && <BattleScene log={replay} state={state} onDone={() => setReplay(null)} />}
    </div>
  )
}
