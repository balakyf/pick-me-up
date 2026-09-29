import { useEffect, useState, type ReactNode } from 'react'
import '@fontsource/pixelify-sans/400.css'
import '@fontsource/pixelify-sans/600.css'
import './ui.css'
import { useGame, getStore } from './useGame'
import { TitleScreen, SummonScreen, RosterScreen, PartyScreen } from './screens'
import { TowerScreen } from './TowerScreen'
import { BattleScene } from './battle/BattleScene'
import { DevGallery } from './DevGallery'
import { LobbyWorld, MENU_PLACES, PLACE_ICON, type WorldView } from './world/LobbyWorld'
import { PLACE_LABEL, type PlaceId } from './world/lobbyMap'
import { PixelWindow } from './kit'
import { attemptFloorWithResult } from '../engine/store'
import type { CombatLog, GameState } from '../engine/types'
import type { Store } from '../engine/store'
import { playMusic, sfx, unlockAudio } from './audio/sound'
import { useMuted } from './audio/useSound'

type View = 'lobby' | WorldView

const VIEWS: View[] = ['lobby', 'tower', 'summon', 'party', 'roster']
const SCENE_TITLE: Record<WorldView, string> = {
  tower: 'The Tower',
  summon: 'Mobius Summon',
  party: 'Party Board',
  roster: 'Hero Registry',
}

/** Optional URL bootstrap (handy for demos/sharing): ?seed=N starts a fresh
 *  account deterministically when none exists; ?view= picks the opening scene. */
function urlParams() {
  if (typeof window === 'undefined') return { seed: null as number | null, view: 'lobby' as View }
  const p = new URLSearchParams(window.location.search)
  const seedRaw = p.get('seed')
  const v = p.get('view') as View | null
  return { seed: seedRaw !== null ? Number(seedRaw) : null, view: v && VIEWS.includes(v) ? v : 'lobby' }
}

function Coins({ state }: { state: GameState }) {
  return (
    <>
      <span className="coin gold">◆ {state.gold.toLocaleString()}</span>
      <span className="coin gem">♦ {state.gems.toLocaleString()}</span>
    </>
  )
}

/** Non-lobby scenes: a slim title bar with the way back to the waiting room. */
function Scene({
  title,
  state,
  onBack,
  onMenu,
  children,
}: {
  title: string
  state: GameState
  onBack: () => void
  onMenu: () => void
  children: ReactNode
}) {
  return (
    <div className="scene">
      <div className="scene-bar">
        <button className="pbtn" onClick={onBack}>
          ◀ Lobby
        </button>
        <span className="scene-title">{title}</span>
        <span className="spacer" />
        <Coins state={state} />
        <button className="pbtn" onClick={onMenu}>
          ☰ Menu
        </button>
      </div>
      <div className="scene-body">{children}</div>
    </div>
  )
}

function GameMenu({ store, onGo, onClose }: { store: Store; onGo: (p: PlaceId) => void; onClose: () => void }) {
  // In-page confirmation (browser confirm() dialogs are blocked in embedded viewers).
  const [confirmReset, setConfirmReset] = useState(false)
  const [muted, setMuted] = useMuted()
  return (
    <PixelWindow title="Menu" icon="☰" onClose={onClose}>
      <div className="menu-grid">
        {MENU_PLACES.map((p) => (
          <button key={p} className="menu-item" onClick={() => onGo(p)}>
            <span className="menu-icon">{PLACE_ICON[p]}</span>
            {PLACE_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="menu-foot">
        <button className="pbtn ghost" onClick={() => setMuted(!muted)} title="Chiptune sound effects and music">
          {muted ? '🔇 Sound off' : '🔊 Sound on'}
        </button>
        <button
          className="pbtn ghost"
          onClick={() => store.dispatch({ type: 'ADD_GOLD', amount: 10000 })}
          title="Testing only: add 10,000 free gold"
        >
          Debug · +10k ◆
        </button>
        {confirmReset ? (
          <span className="menu-confirm">
            <span className="muted">Erase this Master’s save?</span>
            <button className="pbtn ghost" onClick={() => setConfirmReset(false)}>
              Keep
            </button>
            <button
              className="pbtn danger"
              onClick={() => {
                window.localStorage.removeItem('pmu.save.v1')
                location.reload()
              }}
            >
              Erase
            </button>
          </span>
        ) : (
          <button className="pbtn danger" onClick={() => setConfirmReset(true)}>
            New game
          </button>
        )}
      </div>
    </PixelWindow>
  )
}

export function App() {
  const { state, store } = useGame()
  // Every pixel button clicks; the first gesture wakes the audio context and the lobby theme.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      unlockAudio()
      playMusic('lobby')
      const b = (e.target as HTMLElement | null)?.closest?.('button')
      if (b && !(b as HTMLButtonElement).disabled) sfx('click')
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [])
  const params = urlParams()
  const [view, setView] = useState<View>(params.view)
  const [menuOpen, setMenuOpen] = useState(false)
  const [travel, setTravel] = useState<{ place: PlaceId; nonce: number } | null>(null)

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

  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('gallery')) {
    return <DevGallery />
  }

  const hasSave = typeof window !== 'undefined' && window.localStorage.getItem('pmu.save.v1') !== null

  if (state === null) {
    return (
      <div className="app">
        <TitleScreen store={store} hasSave={hasSave} />
      </div>
    )
  }

  // Six months at zero Probability Interference: the canon grey towers.
  if (state.meta.deleted) {
    return (
      <div className="app">
        <div className="screen" style={{ textAlign: 'center', marginTop: '12vh' }}>
          <h2>The waiting room has greyed</h2>
          <p className="sub">No Master tended this world for six months. Its tower stands grey and empty; the account is gone.</p>
          <button
            className="btn primary big"
            onClick={() => {
              window.localStorage.removeItem('pmu.save.v1')
              location.reload()
            }}
          >
            Begin again as a new Master
          </button>
        </div>
      </div>
    )
  }

  function go(place: PlaceId) {
    setMenuOpen(false)
    if (place === 'tower' || place === 'summon' || place === 'party' || place === 'roster') {
      navigate(place)
    } else {
      setView('lobby')
      setTravel({ place, nonce: Date.now() })
    }
  }
  const back = () => {
    setTravel(null)
    setView('lobby')
  }
  const navigate = (v: WorldView) => {
    setTravel(null)
    setView(v)
  }
  const openMenu = () => setMenuOpen(true)

  return (
    <div className="app">
      {view === 'lobby' ? (
        <LobbyWorld state={state} store={store} onNavigate={navigate} onMenu={openMenu} travelRequest={travel} />
      ) : (
        <Scene title={SCENE_TITLE[view]} state={state} onBack={back} onMenu={openMenu}>
          {view === 'tower' && <TowerScreen state={state} store={store} />}
          {view === 'summon' && <SummonScreen state={state} store={store} />}
          {view === 'party' && <PartyScreen state={state} store={store} />}
          {view === 'roster' && <RosterScreen state={state} store={store} />}
        </Scene>
      )}

      {menuOpen && <GameMenu store={store} onGo={go} onClose={() => setMenuOpen(false)} />}
      {demoLog && <BattleScene log={demoLog} state={state} onDone={() => setDemoLog(null)} />}
    </div>
  )
}
