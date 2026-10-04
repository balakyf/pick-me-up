import { useEffect, useState, type ReactNode } from 'react'
import '@fontsource/pixelify-sans/400.css'
import '@fontsource/pixelify-sans/600.css'
import './fonts.css'
import './ui.css'
import { useGame, getStore } from './useGame'
import { TitleScreen } from './title/TitleScreen'
import { SummonScreen } from './summon/SummonScreen'
import { RosterScreen } from './hero/RosterScreen'
import { PartyScreen } from './party/PartyScreen'
import { TowerScreen } from './TowerScreen'
import { BattleScene } from './battle/BattleScene'
import { DevGallery } from './DevGallery'
import { LobbyWorld, MENU_PLACES, PLACE_ICON, type WorldView } from './world/LobbyWorld'
import { PLACE_LABEL, type PlaceId } from './world/lobbyMap'
import { PixelWindow } from './kit'
import { attemptFloorWithResult } from '../engine/store'
import { fitCount } from '../engine/tower'
import type { CombatLog, GameState } from '../engine/types'
import type { Store } from '../engine/store'
import { sfx, unlockAudio } from './audio/sound'
import { useMuted } from './audio/useSound'
import { useCampMusic } from './audio/useLobbyAudio'
import { installToastSounds, uiCueFor } from './audio/uiSfx'
import { installAudioDevHook } from './audio/devAudio'
import { SettingsWindow } from './qol/Settings'
import { mirrorSettingsToDocument } from './qol/useSettings'
import { installMotionMirror } from './motion'
import { PxIcon } from './bits'
import { fmtInt } from './text'
import { useLocale } from './i18n/useLocale'
import { t } from './i18n/i18n'
import { useHotkeys } from './useHotkeys'
import { KeyboardHelp } from './qol/KeyboardHelp'
import { SaveTransfer, lastExportText } from './qol/SaveTransfer'
import { BackupReminder } from './qol/BackupReminder'
import { ToastHost } from './qol/Toast'
import { PromotionCeremonyHost } from './promotion/PromotionReveal'
import { useTimeToasts } from './qol/toastStore'
import { clearToasts } from './qol/toastBus'
import { devToolsEnabled } from './qol/devTools'
import { PendingReplayHost } from './tower/PendingReplayHost'
import { clearPendingReplay } from './tower/pendingReplay'
import { SceneTransition } from './transition/SceneTransition'

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
      <span className="coin gold" title={t('Gold')}>
        <PxIcon name="gold" /> {fmtInt(state.gold)}
      </span>
      <span className="coin gem" title={t('Gems')}>
        <PxIcon name="gem" /> {fmtInt(state.gems)}
      </span>
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
          ◀ {t('Lobby')}
        </button>
        <span className="scene-title">{title}</span>
        <span className="spacer" />
        <Coins state={state} />
        <button className="pbtn" onClick={onMenu}>
          <PxIcon name="menu" /> {t('Menu')}
        </button>
      </div>
      <div className="scene-body">{children}</div>
    </div>
  )
}

function GameMenu({
  store,
  onGo,
  onClose,
  onSave,
  onKeys,
  onSettings,
}: {
  store: Store
  onGo: (p: PlaceId) => void
  onClose: () => void
  onSave: () => void
  onKeys: () => void
  onSettings: () => void
}) {
  // In-page confirmation (browser confirm() dialogs are blocked in embedded viewers).
  const [confirmReset, setConfirmReset] = useState(false)
  const [muted, setMuted] = useMuted()
  const [locale, setLocale] = useLocale()
  return (
    <PixelWindow title={t('Menu')} icon={<PxIcon name="menu" size={18} />} onClose={onClose}>
      <div className="menu-grid">
        {MENU_PLACES.map((p) => (
          <button key={p} className="menu-item" onClick={() => onGo(p)}>
            <span className="menu-icon">{PLACE_ICON[p]}</span>
            {t(PLACE_LABEL[p])}
          </button>
        ))}
      </div>
      <div className="menu-extra">
        <button className="pbtn" onClick={onSave}>
          <PxIcon name="save" /> {t('Export / import save')}
        </button>
        <span className="muted">{lastExportText(Date.now())}</span>
        <span className="spacer" />
        <button className="pbtn ghost" onClick={onKeys} title={t('Keyboard shortcuts')}>
          <PxIcon name="keys" /> {t('Keys')} <kbd>?</kbd>
        </button>
        <button className="pbtn ghost" onClick={onSettings} title={t('Sound, comfort, speed and language')}>
          <PxIcon name="settings" /> {t('Settings')} <kbd>O</kbd>
        </button>
      </div>
      <div className="menu-foot">
        <button
          className="pbtn ghost"
          role="switch"
          aria-checked={!muted}
          onClick={() => setMuted(!muted)}
          title={t('Chiptune sound effects and music')}
        >
          <PxIcon name={muted ? 'sound-off' : 'sound-on'} /> {muted ? t('Sound off') : t('Sound on')}
        </button>
        <button className="pbtn ghost" onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')} title={t('Language / Langue')} lang={locale === 'fr' ? 'en' : 'fr'}>
          <PxIcon name={locale === 'fr' ? 'flag-gb' : 'flag-fr'} /> {locale === 'fr' ? 'English' : 'Français'}
        </button>
        {/* A developer's convenience: only in a dev build or with ?dev=1. */}
        {devToolsEnabled() && (
          <button
            className="pbtn ghost"
            onClick={() => store.dispatch({ type: 'ADD_GOLD', amount: 10000 })}
            title={t('Testing only: add 10,000 free gold')}
          >
            {t('Debug · +10k ◆')}
          </button>
        )}
        {confirmReset ? (
          <span className="menu-confirm">
            <span className="muted">{t('Erase this Master’s save?')}</span>
            <button className="pbtn ghost" onClick={() => setConfirmReset(false)}>
              {t('Keep')}
            </button>
            <button
              className="pbtn danger"
              onClick={() => {
                // Reset in place: a reload let the lobby's clock re-save the old game first.
                clearPendingReplay()
                store.reset()
                setConfirmReset(false)
                onClose()
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

export function App() {
  const { state, store } = useGame()
  // Re-render the whole tree when the language changes (every t() re-reads it).
  const [locale] = useLocale()
  // The scene picks the music: the title, then the camp's theme by the hour and the weather
  // (a battle or the summoning circle pushes its own on top).
  useCampMusic(state)
  // Every pixel button sounds (a click, a confirm, a cancel); the first gesture (a click or a
  // key) wakes the audio context and the scene's track. Clicks never choose the music.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      unlockAudio()
      const cue = uiCueFor(e.target)
      if (cue) sfx(cue)
    }
    const onKey = () => unlockAudio()
    window.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKey, true)
    const offToasts = installToastSounds()
    const offSettings = mirrorSettingsToDocument()
    const offMotion = installMotionMirror()
    installAudioDevHook()
    return () => {
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKey, true)
      offToasts()
      offSettings()
      offMotion()
    }
  }, [])
  const params = urlParams()
  const [view, setView] = useState<View>(params.view)
  const [menuOpen, setMenuOpen] = useState(false)
  const [travel, setTravel] = useState<{ place: PlaceId; nonce: number } | null>(null)
  // Quality-of-life windows (save export/import, keyboard help); `epoch` remounts the
  // world after an import so nothing holds on to the replaced save.
  const [panel, setPanel] = useState<'save' | 'keys' | 'settings' | null>(null)
  const [epoch, setEpoch] = useState(0)
  // Rewards that arrive with time (a building finished, a promotion done) are announced.
  useTimeToasts(state, epoch)
  // A new game or an erased save starts with a clean slate of toasts.
  const accountId = state?.accountId ?? null
  useEffect(() => clearToasts(), [accountId, epoch])

  useEffect(() => {
    if (params.seed !== null && getStore().getState() === null) {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: params.seed >>> 0, now: Date.now() })
    }
  }, [params.seed])

  // Demo-only: ?fight=1 previews a battle (does NOT advance the real save).
  const wantFight = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fight')
  const [demoLog, setDemoLog] = useState<CombatLog | null>(null)
  useEffect(() => {
    if (wantFight && state && demoLog === null && fitCount(state) > 0) {
      setDemoLog(attemptFloorWithResult(state).result.result.log)
    }
  }, [wantFight, state, demoLog])

  // Scene shortcuts (T/P/R/U/G/L/M/?); they stand aside for inputs, windows and battles.
  useHotkeys(
    view,
    (a) => {
      if (a.kind === 'go' || a.kind === 'back') {
        setTravel(null)
        setView(a.kind === 'go' ? a.view : 'lobby')
      } else if (a.kind === 'menu') setMenuOpen(true)
      else if (a.kind === 'settings') setPanel('settings')
      else setPanel('keys')
    },
    state !== null && !state.meta.deleted && demoLog === null,
  )

  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('gallery')) {
    return <DevGallery />
  }

  const hasSave = typeof window !== 'undefined' && window.localStorage.getItem('pmu.save.v1') !== null

  if (state === null) {
    return (
      <div className="app">
        <TitleScreen store={store} hasSave={hasSave} />
        <SceneTransition scene="title" />
        <ToastHost />
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
              store.reset()
              setView('lobby')
            }}
          >
            {t('Begin again as a new Master')}
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
        <LobbyWorld key={epoch} state={state} store={store} onNavigate={navigate} onMenu={openMenu} travelRequest={travel} />
      ) : (
        <Scene key={epoch} title={t(SCENE_TITLE[view])} state={state} onBack={back} onMenu={openMenu}>
          {view === 'tower' && <TowerScreen state={state} store={store} />}
          {view === 'summon' && <SummonScreen state={state} store={store} onNavigate={navigate} />}
          {view === 'party' && <PartyScreen state={state} store={store} />}
          {view === 'roster' && <RosterScreen state={state} store={store} />}
        </Scene>
      )}

      {menuOpen && (
        <GameMenu
          store={store}
          onGo={go}
          onClose={() => setMenuOpen(false)}
          onSave={() => (setMenuOpen(false), setPanel('save'))}
          onKeys={() => (setMenuOpen(false), setPanel('keys'))}
          onSettings={() => (setMenuOpen(false), setPanel('settings'))}
        />
      )}
      {panel === 'save' && (
        <SaveTransfer
          state={state}
          store={store}
          onClose={() => setPanel(null)}
          onImported={() => {
            clearPendingReplay()
            setEpoch((e) => e + 1)
          }}
        />
      )}
      {panel === 'keys' && <KeyboardHelp onClose={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsWindow onClose={() => setPanel(null)} />}
      {view === 'lobby' && !menuOpen && panel === null && <BackupReminder state={state} onExport={() => setPanel('save')} />}
      {demoLog && <BattleScene log={demoLog} state={state} onDone={() => setDemoLog(null)} />}
      {/* A floor attempt the Master never saw the end of (a reload mid-battle) plays first (B14). */}
      <PendingReplayHost key={`${state.accountId}|${epoch}`} state={state} />
      {/* A promotion that completed plays its ceremony (lane J) — never over a climb. */}
      <PromotionCeremonyHost key={`pc|${state.accountId}|${epoch}`} state={state} hold={view === 'tower' || demoLog !== null} />
      {/* Lane K: a pixel curtain between scenes. */}
      <SceneTransition scene={view} />
      <ToastHost />
    </div>
  )
}
