import { useEffect, useRef, useState } from 'react'
import type { GameState, FloorResult, CombatLog } from '../engine/types'
import type { Store } from '../engine/store'
import { attemptFloorWithResult } from '../engine/store'
import { buildEncounter } from '../engine/tower'
import { ANCHORS } from '../engine/content'
import { TUNING } from '../engine/tuning'
import { BattleScene } from './battle/BattleScene'
import { ResultsScreen } from './screens'

const MAX_FLOOR = TUNING.tower.sliceTopFloor

/** Acts of the climbable slice (Layer 2 §2.1 bands), bottom-up. */
const ACTS: { title: string; subtitle: string; from: number; to: number }[] = [
  { title: 'Act I — The Prairie', subtitle: 'goblins, wolves, harpies · the falling city at F10', from: 1, to: 10 },
  { title: 'Act II — The Ruins', subtitle: 'undead, soldiers, assassins · Halgiraf at F20', from: 11, to: 20 },
]

export function TowerScreen({ state, store }: { state: GameState; store: Store }) {
  const [combat, setCombat] = useState<CombatLog | null>(null)
  const [pending, setPending] = useState<FloorResult | null>(null)
  const [showResult, setShowResult] = useState(false)

  const current = state.tower.currentFloor
  const currentRef = useRef<HTMLDivElement>(null)
  // The tower is drawn bottom-up; bring the floor you're standing on into view.
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'center' })
  }, [current])
  const deployable = state.party.slots.some((id) => {
    const h = id ? state.heroes[id] : undefined
    return !!h && h.alive && h.sanity > 0 && h.training === null
  })
  const beatGame = state.tower.highestCleared >= MAX_FLOOR

  function enter() {
    if (!deployable || current > MAX_FLOOR) return
    const pre = store.getState()!
    const { result } = attemptFloorWithResult(pre) // capture the log for playback
    store.dispatch({ type: 'ATTEMPT_FLOOR' }) // advance the store identically (deterministic)
    setPending(result)
    setCombat(result.result.log)
  }

  function combatDone() {
    setCombat(null)
    setShowResult(true)
  }
  function resultDone() {
    setShowResult(false)
    setPending(null)
  }

  // Floor descriptions (anchors are labelled; the current floor gets a live preview).
  const preview = current <= MAX_FLOOR ? buildEncounter(state, current) : null

  return (
    <div className="screen">
      <h2>The Tower</h2>
      <p className="sub">
        100 floors of permadeath. Reach floor {MAX_FLOOR} in this slice. Falling heroes are gone for good.
      </p>

      {beatGame && (
        <div className="result-card" style={{ marginTop: 0, marginBottom: 20 }}>
          <div className="big-outcome win">SLICE CLEARED ✦</div>
          <div className="muted">You conquered floors 1–{MAX_FLOOR}. The full 100-floor tower awaits in future builds.</div>
        </div>
      )}

      {!deployable && (
        <div className="empty" style={{ color: 'var(--warn)' }}>
          No deployable heroes — set your Party (heroes in training or broken down can't fight).
        </div>
      )}

      <div className="tower">
        {ACTS.flatMap((act) => [
          ...Array.from({ length: act.to - act.from + 1 }, (_, i) => act.from + i),
          `act:${act.title}`,
        ]).map((f) => {
          if (typeof f === 'string') {
            const act = ACTS.find((a) => `act:${a.title}` === f)!
            return (
              <div key={f} className="act-head">
                <span className="act-title">{act.title}</span>
                <span className="muted">{act.subtitle}</span>
              </div>
            )
          }
          const cleared = f <= state.tower.highestCleared
          const isCurrent = f === current
          const locked = f > current
          const anchor = ANCHORS[f]
          const cls = ['floor', cleared ? 'cleared' : '', isCurrent ? 'current' : '', locked ? 'locked' : ''].filter(Boolean).join(' ')
          const mission = isCurrent && preview ? preview.mission.type : anchor ? anchor.missionType : 'Subjugation'
          const enemyCount = isCurrent && preview ? preview.waves.reduce((n, w) => n + w.units.length, 0) : null
          return (
            <div key={f} className={cls} ref={isCurrent ? currentRef : undefined}>
              <div className="fnum">{cleared ? '✓' : `F${f}`}</div>
              <div className="fdesc">
                <div className="ft">
                  Floor {f} {anchor && <span className="anchor-badge">ANCHOR</span>}
                </div>
                <div className="fs">
                  {mission}
                  {enemyCount !== null && ` · ${enemyCount} enemies`}
                  {f === current && state.tower.attemptIndex > 0 && ` · attempt ${state.tower.attemptIndex + 1}`}
                </div>
              </div>
              {isCurrent && f <= MAX_FLOOR && (
                <button className="btn primary" onClick={enter} disabled={!deployable}>
                  Enter ▸
                </button>
              )}
            </div>
          )
        })}
      </div>

      {combat && <BattleScene log={combat} state={state} onDone={combatDone} />}
      {showResult && pending && <ResultsScreen result={pending} state={state} onContinue={resultDone} />}
    </div>
  )
}
