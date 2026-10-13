import { useEffect, useState, type ReactNode } from 'react'
import '@fontsource/pixelify-sans/400.css'
import '@fontsource/pixelify-sans/600.css'
import './ui.css'
import { useGame, getStore, BROKEN_SAVE_KEY, bootLoadFailed } from './useGame'
import { TitleScreen, SummonScreen, RosterScreen, PartyScreen } from './screens'
import { TowerScreen } from './TowerScreen'
import { BattleScene } from './battle/BattleScene'
import { DevGallery } from './DevGallery'
import { ReturnLayer } from './return/ReturnLayer'
import { LobbyWorld, PLACE_ICON, type WorldView } from './world/LobbyWorld'
import { PLACE_LABEL, type PlaceId } from './world/lobbyMap'
import { PixelWindow } from './kit'
import { attemptFloorWithResult } from '../engine/store'
import type { CombatLog, GameState } from '../engine/types'
import type { Store } from '../engine/store'
import { playMusic, sfx, unlockAudio } from './audio/sound'
import { useMuted } from './audio/useSound'
import { useLocale } from './i18n/useLocale'
import { t } from './i18n/i18n'
import { GoalTracker } from './shell/GoalTracker'
import { menuGroups, nextUnlock, placeAccess, shortCondition } from './shell/unlocks'
import { DEFAULT_SAVE_KEY } from '../engine/account'
import { usePrefs } from './prefs'
import './shell/shell.css'

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
  view,
  state,
  onBack,
  onMenu,
  onGo,
  children,
}: {
  title: string
  view: WorldView
  state: GameState
  onBack: () => void
  onMenu: () => void
  onGo: (p: PlaceId) => void
  children: ReactNode
}) {
  return (
    <div className="scene">
      <div className="scene-bar">
        <button className="pbtn" onClick={onBack}>
          ◀ {t('Lobby')}
        </button>
        <span className="scene-title">{title}</span>
        <span className="spacer" />
        <Coins state={state} />
        <button className="pbtn" onClick={onMenu}>
          ☰ {t('Menu')}
        </button>
        {/* After the Menu button in DOM order (smoke tests click the first "Menu"); it
            never dispatches, so it is safe over the Tower view's mid-battle orders. */}
        <GoalTracker
          state={state}
          variant="bar"
          view={view}
          onGo={(g) => {
            if (g.kind === 'place') onGo(g.place)
          }}
        />
      </div>
      <div className="scene-body">{children}</div>
    </div>
  )
}

/** One Menu tile. Every place stays a `button.menu-item` that opens its window; a locked
 *  one opens it as a preview (spec 2026-10-12 S3). */
function MenuTile({ place, state, kind, onGo }: { place: PlaceId; state: GameState; kind: 'now' | 'open' | 'next' | 'later'; onGo: (p: PlaceId) => void }) {
  const access = kind === 'next' || kind === 'later' ? placeAccess(state, place) : null
  const p = access?.progress
  const cls = kind === 'now' ? 'menu-item now' : kind === 'next' ? 'menu-item next' : kind === 'later' ? 'menu-item locked' : 'menu-item'
  return (
    <button className={cls} onClick={() => onGo(place)} title={access?.reason ?? undefined} aria-label={access?.reason ? `${t(PLACE_LABEL[place])}: ${access.reason}` : undefined}>
      <span className="menu-icon">{PLACE_ICON[place]}</span>
      <span className="menu-text">
        <span>
          {t(PLACE_LABEL[place])}
        </span>
        {access?.reason &&
          (kind === 'later' ? (
            <span className="menu-sub">
              <span className="lock-badge">🔒 {shortCondition(access.rule)}</span>
            </span>
          ) : (
            <span className="menu-sub">{access.reason}</span>
          ))}
        {kind === 'next' && p && (
          <span className="goal-bar" aria-hidden="true">
            <span className="goal-bar-track">
              <span className="goal-bar-fill" style={{ width: `${(p.cur / Math.max(1, p.need)) * 100}%` }} />
            </span>
            <span className="goal-bar-label">
              {p.cur}/{p.need}
            </span>
          </span>
        )}
      </span>
    </button>
  )
}

function GameMenu({
  state,
  store,
  onGo,
  onClose,
}: {
  state: GameState
  store: Store
  onGo: (p: PlaceId) => void
  onClose: () => void
}) {
  // In-page confirmation (browser confirm() dialogs are blocked in embedded viewers).
  const [confirmReset, setConfirmReset] = useState(false)
  const [muted, setMuted] = useMuted()
  const [locale, setLocale] = useLocale()
  const groups = menuGroups(state)
  const nextAlso = groups.next ? (nextUnlock(state)?.also ?? []) : []
  return (
    <PixelWindow title={t('Menu')} icon="☰" onClose={onClose} wide>
      <div className="menu-groups">
        <section className="menu-group menu-group-now">
          <h4 className="menu-group-title">{t('Now')}</h4>
          <div className="menu-grid">
            {groups.now.map((p) => (
              <MenuTile key={p} place={p} state={state} kind="now" onGo={onGo} />
            ))}
          </div>
        </section>
        {groups.campus.length > 0 && (
          <section className="menu-group menu-group-campus">
            <h4 className="menu-group-title">{t('Campus')}</h4>
            <div className="menu-grid">
              {groups.campus.map((p) => (
                <MenuTile key={p} place={p} state={state} kind="open" onGo={onGo} />
              ))}
            </div>
          </section>
        )}
        {groups.next && (
          <section className="menu-group menu-group-next">
            <h4 className="menu-group-title">{t('Next unlock')}</h4>
            <MenuTile place={groups.next} state={state} kind="next" onGo={onGo} />
            {/* Outside the tile: a menu-item's text names its own place only (the smoke
                tests find places by the first menu-item whose text includes the name). */}
            {nextAlso.length > 0 && (
              <div className="menu-next-also">{t('Also: {places}', { places: nextAlso.map((a) => t(PLACE_LABEL[a])).join(', ') })}</div>
            )}
          </section>
        )}
        {groups.later.length > 0 && (
          <section className="menu-group menu-group-later">
            <h4 className="menu-group-title">{t('Later')}</h4>
            <div className="menu-grid">
              {groups.later.map((p) => (
                <MenuTile key={p} place={p} state={state} kind="later" onGo={onGo} />
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="menu-foot">
        <button className="pbtn ghost" onClick={() => setMuted(!muted)} title={t('Chiptune sound effects and music')}>
          {muted ? `🔇 ${t('Sound off')}` : `🔊 ${t('Sound on')}`}
        </button>
        <button className="pbtn ghost" onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')} title="Language / Langue">
          {locale === 'fr' ? '🇬🇧 English' : '🇫🇷 Français'}
        </button>
        <button
          className="pbtn ghost"
          onClick={() => {
            onClose()
            // The save backup lives in the return layer (WP6); it listens for this event.
            window.dispatchEvent(new CustomEvent('pmu:backup'))
          }}
          title={t('Export or import your save')}
        >
          💾 {t('Backup…')}
        </button>
        <button
          className="pbtn ghost"
          onClick={() => store.dispatch({ type: 'ADD_GOLD', amount: 10000 })}
          title={t('Testing only: add 10,000 free gold')}
        >
          {t('Debug · +10k ◆')}
        </button>
        {confirmReset ? (
          <span className="menu-confirm">
            <span className="muted">{t('Erase this Master’s save?')}</span>
            <button className="pbtn ghost" onClick={() => setConfirmReset(false)}>
              {t('Keep')}
            </button>
            <button
              className="pbtn danger"
              onClick={() => {
                window.localStorage.removeItem('pmu.save.v1')
                location.reload()
              }}
            >
              {t('Erase')}
            </button>
          </span>
        ) : (
          <button className="pbtn danger" onClick={() => setConfirmReset(true)}>
            {t('New game')}
          </button>
        )}
      </div>
    </PixelWindow>
  )
}

/**
 * Is there a save the title screen can Continue? Not when the stored save is the very
 * one that already failed to load (useGame copied it to BROKEN_SAVE_KEY, or failed to and
 * flagged the boot): Continue would only throw again. A new game then overwrites it; the
 * broken copy stays put.
 */
export function continuableSave(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const raw = window.localStorage.getItem(DEFAULT_SAVE_KEY)
    if (raw === null || bootLoadFailed()) return false
    return raw !== window.localStorage.getItem(BROKEN_SAVE_KEY)
  } catch {
    return false
  }
}

/**
 * Leaving the Tower ends a running Sortie and banks its purse (S15): asked first. "Bank it"
 * dispatches RETURN_TO_CAMPUS and then goes; TowerScreen's own unmount bank then finds no
 * Sortie. In-page (browser confirm() dialogs are blocked in embedded viewers).
 */
function LeaveTowerConfirm({ purse, onBank, onStay }: { purse: number; onBank: () => void; onStay: () => void }) {
  return (
    <PixelWindow title={t('Leave the Tower?')} icon="⛫" onClose={onStay}>
      <div className="leave-tower">
        <p>{t('Return to campus and bank +{purse}?', { purse: purse.toLocaleString() })}</p>
        <p className="muted small">{t('The Sortie ends: its Boons fade and the next climb starts a new streak.')}</p>
        <div className="leave-tower-actions">
          <button className="pbtn primary" onClick={onBank}>
            ◆ {t('Bank it')}
          </button>
          <button className="pbtn ghost" onClick={onStay}>
            {t('Stay')}
          </button>
        </div>
      </div>
    </PixelWindow>
  )
}

export function App() {
  const { state, store } = useGame()
  // Re-render the whole tree when the language changes (every t() re-reads it).
  const [locale] = useLocale()
  // The in-game "Reduce motion" (prefs) stills every animation, as the OS setting does:
  // ui.css keys its global rule on .reduce-motion on <html>.
  const [prefs] = usePrefs()
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.classList.toggle('reduce-motion', prefs.reducedMotion)
    return () => root.classList.remove('reduce-motion')
  }, [prefs.reducedMotion])
  /** The return layer has a ceremony or window up (the unlock fanfare waits for it). */
  const [returnBusy, setReturnBusy] = useState(false)
  /** A lobby window or the unlock fanfare is up: the return layer keeps its nudge back. */
  const [lobbyModal, setLobbyModal] = useState(false)
  /** Where the Master asked to go from the Tower while a Sortie runs (S15 confirm). */
  const [leaving, setLeaving] = useState<{ to: PlaceId | 'lobby' } | null>(null)
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
  // A pending "Leave the Tower?" belongs to the Sortie it asked about: once that Sortie
  // ends (banked by any button) or the Tower is left, drop it, so it can never pop up
  // uninvited on a later Sortie.
  const sortieLive = state?.tower.sortie ?? null
  useEffect(() => {
    if (view !== 'tower' || sortieLive === null) setLeaving(null)
  }, [view, sortieLive])
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

  const hasSave = continuableSave()

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
          <h2>{t('The waiting room has greyed')}</h2>
          <p className="sub">{t('No Master tended this world for six months. Its tower stands grey and empty; the account is gone.')}</p>
          <button
            className="btn primary big"
            onClick={() => {
              window.localStorage.removeItem('pmu.save.v1')
              location.reload()
            }}
          >
            {t('Begin again as a new Master')}
          </button>
        </div>
      </div>
    )
  }

  /**
   * Leaving the Tower with a Sortie running asks first (S15); everything else goes at once.
   * Reads the LIVE store, not this render's snapshot: a caller that banks the Sortie and
   * then goes in the same click (TowerScreen's "Bank +X and summon") must go at once.
   */
  const sortieAtRisk = (to: PlaceId | 'lobby') => view === 'tower' && to !== 'tower' && (store.getState()?.tower.sortie ?? null) !== null
  function go(place: PlaceId) {
    setMenuOpen(false)
    if (sortieAtRisk(place)) {
      setLeaving({ to: place })
      return
    }
    goNow(place)
  }
  function goNow(place: PlaceId) {
    if (place === 'tower' || place === 'summon' || place === 'party' || place === 'roster') {
      navigate(place)
    } else {
      setView('lobby')
      setTravel({ place, nonce: Date.now() })
    }
  }
  const home = () => {
    setTravel(null)
    setView('lobby')
  }
  const back = () => {
    if (sortieAtRisk('lobby')) setLeaving({ to: 'lobby' })
    else home()
  }
  const bankAndLeave = () => {
    const to = leaving?.to
    setLeaving(null)
    try {
      if (store.getState()?.tower.sortie) store.dispatch({ type: 'RETURN_TO_CAMPUS' })
      sfx('coin', { semis: 7 })
    } catch {
      /* nothing to bank (the Tower's own unmount tries again) */
    }
    if (to === 'lobby' || to === undefined) home()
    else goNow(to)
  }
  const navigate = (v: WorldView) => {
    setTravel(null)
    setView(v)
  }
  const openMenu = () => setMenuOpen(true)

  return (
    <div className="app">
      {view === 'lobby' ? (
        <LobbyWorld
          state={state}
          store={store}
          onNavigate={navigate}
          onMenu={openMenu}
          travelRequest={travel}
          paused={menuOpen || demoLog !== null || returnBusy}
          onModalChange={setLobbyModal}
        />
      ) : (
        <Scene title={t(SCENE_TITLE[view])} view={view} state={state} onBack={back} onMenu={openMenu} onGo={go}>
          {view === 'tower' && <TowerScreen state={state} store={store} onGo={go} onHome={home} />}
          {view === 'summon' && <SummonScreen state={state} store={store} />}
          {view === 'party' && <PartyScreen state={state} store={store} />}
          {view === 'roster' && <RosterScreen state={state} store={store} />}
        </Scene>
      )}

      {menuOpen && <GameMenu state={state} store={store} onGo={go} onClose={() => setMenuOpen(false)} />}
      {leaving && view === 'tower' && state.tower.sortie && (
        <LeaveTowerConfirm purse={state.tower.sortie.purse} onBank={bankAndLeave} onStay={() => setLeaving(null)} />
      )}
      {demoLog && <BattleScene log={demoLog} state={state} onDone={() => setDemoLog(null)} />}
      <ReturnLayer state={state} store={store} view={view} onGo={go} onBusyChange={setReturnBusy} quiet={menuOpen || lobbyModal} />
    </div>
  )
}
