import { useEffect, useState } from 'react'
import './ui.css'
import { useGame, getStore } from './useGame'
import { TitleScreen, SummonScreen, RosterScreen, PartyScreen } from './screens'
import { TowerScreen } from './TowerScreen'
import { CombatView } from './CombatView'
import { attemptFloorWithResult } from '../engine/store'
import type { CombatLog } from '../engine/types'

type View = 'tower' | 'summon' | 'roster' | 'party'

/** Optional URL bootstrap (handy for demos/sharing): ?seed=N starts a fresh
 *  account deterministically when none exists; ?view= picks the opening tab. */
function urlParams() {
  if (typeof window === 'undefined') return { seed: null as number | null, view: 'tower' as View }
  const p = new URLSearchParams(window.location.search)
  const seedRaw = p.get('seed')
  const view = (p.get('view') as View) || 'tower'
  return { seed: seedRaw !== null ? Number(seedRaw) : null, view }
}

const TABS: { id: View; label: string }[] = [
  { id: 'tower', label: '🗼 Tower' },
  { id: 'summon', label: '🔮 Summon' },
  { id: 'party', label: '🛡 Party' },
  { id: 'roster', label: '📜 Roster' },
]

export function App() {
  const { state, store } = useGame()
  const params = urlParams()
  const [view, setView] = useState<View>(params.view)

  useEffect(() => {
    if (params.seed !== null && getStore().getState() === null) {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: params.seed >>> 0, now: 0 })
    }
  }, [params.seed])

  // Demo-only: ?fight=1 previews a battle (does NOT advance the real save).
  const wantFight = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fight')
  const [demoLog, setDemoLog] = useState<CombatLog | null>(null)
  useEffect(() => {
    if (wantFight && state && demoLog === null) {
      setDemoLog(attemptFloorWithResult(state).result.result.log)
    }
  }, [wantFight, state, demoLog])

  const hasSave = typeof window !== 'undefined' && window.localStorage.getItem('pmu.save.v1') !== null

  if (state === null) {
    return (
      <div className="app">
        <TitleScreen store={store} hasSave={hasSave} />
      </div>
    )
  }

  const living = Object.values(state.heroes).filter((h) => h.alive).length

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">
          Pick Me Up<span className="spark">!</span>
        </span>
        <span className="acct">Master #{state.accountId}</span>
        <span className="spacer" />
        <span className="pill">
          <span className="lab">Heroes</span> {living}
        </span>
        <span className="pill">
          <span className="lab">Floor</span> {Math.min(state.tower.currentFloor, 10)}
        </span>
        <span className="pill gold">◆ {state.gold.toLocaleString()}</span>
        <button
          className="cheat-gold"
          onClick={() => store.dispatch({ type: 'ADD_GOLD', amount: 10000 })}
          title="Testing only: add 10,000 free gold"
        >
          +10k ◆
        </button>
      </div>

      <div className="nav">
        {TABS.map((t) => (
          <button key={t.id} className={view === t.id ? 'active' : ''} onClick={() => setView(t.id)}>
            {t.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => {
            if (confirm('Abandon this Master and start a new game? Your save will be erased.')) {
              window.localStorage.removeItem('pmu.save.v1')
              location.reload()
            }
          }}
          title="New game"
        >
          ⟳ Reset
        </button>
      </div>

      {view === 'tower' && <TowerScreen state={state} store={store} />}
      {view === 'summon' && <SummonScreen state={state} store={store} />}
      {view === 'party' && <PartyScreen state={state} store={store} />}
      {view === 'roster' && <RosterScreen state={state} />}

      {demoLog && <CombatView log={demoLog} onDone={() => setDemoLog(null)} />}
    </div>
  )
}
