import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameState, FloorResult, CombatLog, BattleOrder } from '../engine/types'
import { scoutFloor, suggestParty, enterConcerns, type EnterConcern, type Forecast, type ForecastAlternative } from '../engine/scout'
import { fitCount, ordersAllowed } from '../engine/tower'
import type { Store } from '../engine/store'
import { attemptFloorWithResult, resolveEventWithResult } from '../engine/store'
import { buildEncounter } from '../engine/tower'
import { ANCHORS, actForFloor } from '../engine/content'
import { TUNING } from '../engine/tuning'
import { tacticalFocusBonus } from '../engine/tactical'
import type { EventOutcome } from '../engine/events'
import { BattleScene, type BattleOrders } from './battle/BattleScene'
import { ResultsScreen } from './screens'
import { TimingGame } from './metaPanels'
import { TowerExterior } from './challenge/TowerExterior'
import { t } from './i18n/i18n'
import { ELEMENT_VIS } from './bits'
import { CodexButton } from './codex/CodexWindow'
import { enterBlock } from './tower/towerText'
import { CommandPanel } from './tower/CommandPanel'
import { EventOutcomeCard } from './tower/EventPanel'
import { FloorList } from './tower/FloorList'
import { Chronicle } from './tower/Chronicle'
import { EnterConfirm } from './tower/EnterConfirm'
import { useForecast } from './tower/useForecast'
import { forecastNow } from './tower/forecastClient'
import { clearPendingReplay, savePendingReplay } from './tower/pendingReplay'
import { truthStanding } from './tower/warRoomText'
import './tower/tower.css'

const MAX_FLOOR = TUNING.tower.sliceTopFloor

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

/** The Enter sheet's question, while it is open. */
interface Confirm {
  forecast: Forecast | null
  concerns: EnterConcern | null
  worldEnd: boolean
  subvert: boolean
  /** At F90, when the Master may refuse: the odds of the subverted fight. */
  subverted?: Forecast | null
}

/**
 * The Tower as a war room (O22): the tower art, a sticky command panel (event floors, the
 * forecast, the party, the side door, Enter) and the floor list with the Chronicle. While
 * a battle and its results play, the room shows the tower as it stood when the party went
 * in — nothing behind the overlay gives the outcome away.
 */
export function TowerScreen({ state: live, store }: { state: GameState; store: Store }) {
  const [combat, setCombat] = useState<CombatLog | null>(null)
  const [pending, setPending] = useState<FloorResult | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [outcome, setOutcome] = useState<EventOutcome | null>(null)
  const [replay, setReplay] = useState<CombatLog | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [aiming, setAiming] = useState<{ subvert?: boolean } | null>(null)
  const [orders, setOrders] = useState<BattleOrders | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  // The tower as it stood when the party went in (until the results are dismissed).
  const [frozen, setFrozen] = useState<GameState | null>(null)
  const state = frozen ?? live
  const current = state.tower.currentFloor
  const atKey = `${state.accountId}|${current}|${state.tower.attemptIndex}`
  // An opening order (the forecast's "Open with Focus") belongs to this floor and attempt.
  const [opening, setOpening] = useState<{ at: string; orders: BattleOrder[] }>({ at: '', orders: [] })
  const openingOrders = opening.at === atKey ? opening.orders : []
  const [openActs, setOpenActs] = useState<Set<string>>(() => new Set([actForFloor(current).id]))

  const currentRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLElement>(null)
  const eventRef = useRef<HTMLDivElement>(null)
  const event = state.tower.event
  const hasEvent = event !== null
  // Bring the floor you stand on into view inside the floor column (never yank the page).
  useEffect(() => {
    const list = listRef.current
    const row = currentRef.current
    if (!list || !row || list.scrollHeight <= list.clientHeight + 4) return
    list.scrollTop = Math.max(0, row.offsetTop - list.offsetTop - list.clientHeight / 2)
  }, [current])
  const toEvent = () => eventRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  useEffect(() => {
    setOpenActs((cur) => new Set([...cur, actForFloor(current).id]))
  }, [current])

  // The engine's deploy rails decide who can fight (the engine refuses an empty attempt).
  const deployable = fitCount(state) > 0
  const summit = state.tower.highestCleared >= MAX_FLOOR
  const loop = state.tower.loop
  // A disabled Enter always says why (and an event floor can be reached from here).
  const block = enterBlock(state, deployable)

  // The current floor, built once: the enemy count, the peek, and every name the war room
  // needs (bosses and escorts by tag, foes by id).
  const preview = useMemo(() => (current <= MAX_FLOOR ? buildEncounter(state, current) : null), [state, current])
  const names = useMemo(() => {
    const out: Record<string, string> = {}
    for (const u of [...(preview?.waves.flatMap((w) => w.units) ?? []), ...(preview?.allies ?? [])]) {
      out[u.id] = t(u.name)
      if (u.targetTag !== undefined && out[u.targetTag] === undefined) out[u.targetTag] = t(u.name)
    }
    return out
  }, [preview])
  const report = useMemo(() => (current <= MAX_FLOOR && !hasEvent ? scoutFloor(state) : null), [state, current, hasEvent])

  // The crystal: the real fight, run many times (off the main thread), for the plan on the board.
  const plan = useMemo(() => ({ opening: openingOrders }), [openingOrders])
  // (Behind a battle the room keeps the forecast it showed when the party went in.)
  const view = useForecast(state, plan, report !== null)

  const worldEnd = current === TUNING.tower.worldEndFloor && !state.tower.worldEnded && !state.tower.worldSaved

  /** Enter: ask first when the war room has something to say (or the world would end). */
  function enter(subvert = false) {
    if (block !== null || current > MAX_FLOOR) return
    // Subverting strips the Herald's aegis: the sheet must weigh THAT fight, not the plain clear.
    const f = subvert ? forecastNow(live, { ...plan, subvert: true }) : (view.forecast ?? forecastNow(live, plan))
    const concerns = f ? enterConcerns(f) : null
    if ((worldEnd && !subvert) || concerns) {
      const sheetWorld = worldEnd && !subvert
      // The world sheet offers Subvert too: give its odds beside the plain clear's.
      const subverted = sheetWorld && truthStanding(live).qualified ? forecastNow(live, { ...plan, subvert: true }) : undefined
      setConfirm({ forecast: f, concerns, worldEnd: sheetWorld, subvert, subverted })
      return
    }
    go(subvert)
  }
  /** Past the sheet: the ballista first on its anchors, then the fight. */
  function go(subvert: boolean) {
    setConfirm(null)
    if (ANCHORS[current]?.minigame === 'ballista') {
      setAiming({ subvert })
      return
    }
    fight(undefined, subvert)
  }
  function fight(ballista: number | undefined, subvert?: boolean) {
    setAiming(null)
    setErr(null)
    const pre = store.getState()!
    // An opening Focus is one of the battle's orders; only aim it at someone on this floor.
    const initial = openingOrders.filter((o) => o.kind !== 'focus' || names[o.enemyId] !== undefined)
    const first = initial.length > 0 ? initial : undefined
    let attempt: { state: GameState; result: FloorResult }
    try {
      attempt = attemptFloorWithResult(pre, undefined, ballista, subvert || undefined, first) // capture the log for playback
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
      return
    }
    // B14: the attempt is decided now; keep its replay until the results are seen, so a
    // reload shows the fight instead of applying it in silence.
    savePendingReplay(attempt.state, attempt.result)
    setFrozen(pre)
    store.dispatch({ type: 'ATTEMPT_FLOOR', ballista, subvert: subvert || undefined, orders: first }) // advance the store identically (deterministic)
    setPending(attempt.result)
    setCombat(attempt.result.result.log)
    setOpening({ at: '', orders: [] })
    // Mid-battle orders re-resolve the same fight from the same state (deterministic up to
    // the order's tick) and revise the attempt the store just recorded.
    const given: BattleOrder[] = [...initial]
    setOrders({
      left: ordersAllowed(pre) - initial.filter((o) => o.kind !== 'retreat').length,
      focusBonus: tacticalFocusBonus(pre.facilities.tacticalCenter.level),
      give: (order) => {
        try {
          const next = [...given, order]
          const r = attemptFloorWithResult(pre, undefined, ballista, subvert || undefined, next)
          store.revise({ type: 'ATTEMPT_FLOOR', ballista, subvert: subvert || undefined, orders: next })
          given.push(order)
          setPending(r.result)
          savePendingReplay(r.state, r.result)
          return r.result.result.log
        } catch {
          return null
        }
      },
    })
  }

  function suggest() {
    const p = suggestParty(live)
    if (p.slots.some(Boolean)) store.dispatch({ type: 'SET_PARTY', slots: p.slots, lines: p.lines })
  }

  /** Adopt an odds-changer: its party on the board, its opening order in the plan. */
  function adopt(a: ForecastAlternative) {
    const same = a.slots.every((s, i) => (s ?? null) === (live.party.slots[i] ?? null) && a.lines[i] === live.party.lines[i])
    if (!same) store.dispatch({ type: 'SET_PARTY', slots: a.slots, lines: a.lines })
    setOpening({ at: atKey, orders: [...a.opening] })
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
    setFrozen(null)
    clearPendingReplay()
  }
  const toggleAct = (id: string) =>
    setOpenActs((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const enemyCount = preview ? preview.waves.reduce((n, w) => n + w.units.length, 0) : null
  const truths = truthStanding(state)

  return (
    <div className="screen war-room">
      <h2>{t('The Tower')}</h2>
      <div className="war-grid">
        <div className="war-art">
          <TowerExterior state={state} hold={combat !== null || showResult} />
        </div>

        <CommandPanel
          state={state}
          store={store}
          view={view}
          report={report}
          names={names}
          opening={openingOrders}
          block={block}
          err={err}
          eventRef={eventRef}
          onResolve={resolve}
          onEnter={() => enter(false)}
          onSubvert={() => enter(true)}
          onSuggest={suggest}
          onUse={adopt}
          onClearOpening={() => setOpening({ at: '', orders: [] })}
          onToEvent={toEvent}
        >
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
              {loop.scars > 0 && (
                <>
                  {' '}
                  · {t('scars:')} <b>{loop.scars}</b> {t('(the loop has hardened)')}
                </>
              )}
            </div>
          )}
        </CommandPanel>

        <section className="war-floors" ref={listRef} aria-label={t('Floors')}>
          <FloorList
            state={state}
            openActs={openActs}
            onToggle={toggleAct}
            currentRef={currentRef}
            enemyCount={enemyCount}
            peek={preview && state.meta.peekedFloors.includes(current) ? <PeekLine preview={preview} /> : undefined}
          />
          <Chronicle state={state} />
        </section>
      </div>

      {confirm && (
        <EnterConfirm
          state={live}
          forecast={confirm.forecast}
          concerns={confirm.concerns}
          worldEnd={confirm.worldEnd}
          subverted={confirm.subverted ?? null}
          onBack={() => setConfirm(null)}
          onEnter={() => go(confirm.subvert)}
          onSubvert={confirm.worldEnd && truths.qualified ? () => go(true) : undefined}
        />
      )}
      {aiming && (
        <TimingGame
          title={t('The Ballista')}
          verb={t('Shoot')}
          skill={state.meta.skill.ballista}
          hint={t('Loose the bolt as the sight crosses the heart. A true shot breaks the scales before the fight begins.')}
          onDone={(perf) => fight(perf, aiming.subvert)}
          onCancel={() => setAiming(null)}
        />
      )}
      {combat && <BattleScene log={combat} state={live} onDone={combatDone} orders={orders ?? undefined} />}
      {showResult && pending && <ResultsScreen result={pending} state={live} onContinue={resultDone} />}
      {outcome && !replay && <EventOutcomeCard outcome={outcome} onReplay={setReplay} onClose={() => setOutcome(null)} />}
      {replay && <BattleScene log={replay} state={live} onDone={() => setReplay(null)} />}
    </div>
  )
}
