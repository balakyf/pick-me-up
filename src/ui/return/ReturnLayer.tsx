import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { summarizeAway } from '../../engine/return'
import { toWorldTime } from '../../engine/time'
import { TUNING } from '../../engine/tuning'
import type { WorldView } from '../world/LobbyWorld'
import type { PlaceId } from '../world/lobbyMap'
import { LetterWindow, letterReady } from '../life/lifeWindows'
import { getPrefs } from '../prefs'
import { sfx } from '../audio/sound'
import { t } from '../i18n/i18n'
import { WelcomeBack, type Arrival } from './WelcomeBack'
import { LightsOut } from './LightsOut'
import { BackupWindow } from './BackupWindow'
import { heroLetter } from './heroLetters'
import { accountKey, awayRealMs, isArrival, isFreshMaster, isGreyArrival, isLongHide, seenOnRealClock } from './arrival'
import { useHonestTabTitle } from './tabTitle'
import { requestPersistentStorage } from './saveTransfer'
import './return.css'

export interface ReturnLayerProps {
  state: GameState
  store: Store
  /** The App's current view: the lobby or one of the full-screen scenes. */
  view: 'lobby' | WorldView
  /** Travel to a place (same handler as the Menu). */
  onGo: (place: PlaceId) => void
  /** The layer has its ceremony or a window up (the App holds the unlock fanfare meanwhile,
   *  so the two never stack). */
  onBusyChange?: (busy: boolean) => void
}

/** The window event that opens the backup window (WP7's Menu footer dispatches it). */
export const BACKUP_EVENT = 'pmu:backup'
/** Open the backup window from anywhere, without shared code. */
export function openBackup(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(BACKUP_EVENT))
}

/** localStorage flags (per browser, presentation only). */
const NUDGED_KEY = 'pmu.backup.nudged'
const PERSIST_KEY = 'pmu.persist.asked'
const NUDGE_FLOOR = 5
/** How long the lobby stays grey before the colour floods back (ms), and the flood. */
const GREY_HOLD_MS = 1200
const FLOOD_MS = 2600
/** "Rest for now" shows after this much real play. */
const LIGHTS_OUT_AFTER_MS = TUNING.return.welcome.lightsOutAfterRealMinutes * 60_000

function flag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null
  } catch {
    return true
  }
}
function setFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    /* storage may be unavailable */
  }
}

/**
 * Reasons to return (spec 2026-10-12 S25-S28), mounted once above the App:
 * - the arrival: on the first lobby view with a stale save away 2+ real hours (or a tab
 *   hidden that long), it snapshots the state, dispatches ONE TICK with the real clock and
 *   opens the welcome-back ledger; 30+ days away plays the grey Re-interference first;
 * - Lights Out: a "Rest for now" button after a climb or an hour of play;
 * - the honest tab title while hidden (never dispatches);
 * - the save: persistent storage after the first summon, a one-time backup nudge after
 *   F5, and the backup window (also opened by the `pmu:backup` window event).
 *
 * Smoke-test hygiene (§4.0.7): nothing opens for an account never seen on a real clock
 * (`now: 0`), nothing happens after `load()` (arrivals are judged once, at mount or on a
 * visibility return), the login is never claimed for the Master, and nothing dispatches
 * while the Tower view is up.
 */
export function ReturnLayer({ state, store, view, onGo, onBusyChange }: ReturnLayerProps): JSX.Element | null {
  useHonestTabTitle(store)
  const [arrival, setArrival] = useState<Arrival | null>(null)
  const [letterOpen, setLetterOpen] = useState(false)
  const [lightsOut, setLightsOut] = useState(false)
  const [backup, setBackup] = useState(false)
  const [restReady, setRestReady] = useState(false)
  const [nudge, setNudge] = useState(false)
  /** The grey Re-interference in progress (its arrival opens once the colour is back). */
  const [ceremony, setCeremony] = useState<Arrival | null>(null)
  const [visTick, setVisTick] = useState(0)
  const judged = useRef(false)
  const hiddenAt = useRef<{ at: number; before: GameState | null } | null>(null)
  const pendingReturn = useRef<{ at: number; before: GameState } | null>(null)
  const prevView = useRef(view)
  const viewRef = useRef(view)
  viewRef.current = view

  /** The arrival: one TICK from `before` to now, then the ledger (after the grey, if any). */
  function arrive(before: GameState, now: number, grey: boolean) {
    let after: GameState
    try {
      after = store.dispatch({ type: 'TICK' }, now)
    } catch {
      return
    }
    const a: Arrival = {
      summary: summarizeAway(before, after),
      letter: heroLetter(before, after),
      awayRealMs: awayRealMs(before, now),
      grey,
      accountId: accountKey(after),
      at: before.meta.lastSeenAtWorld,
    }
    if (!grey || getPrefs().reducedMotion || typeof document === 'undefined') {
      setArrival(a)
      return
    }
    setCeremony(a)
  }

  // Re-interference (S25): the lobby holds grey, then the colour floods back and the ledger
  // opens. Driven by an effect (not timers started inside `arrive`) so its cleanup is
  // paired with its setup: under StrictMode's mount → unmount → mount the ceremony restarts
  // instead of being cancelled for good.
  useEffect(() => {
    if (!ceremony || typeof document === 'undefined') return
    const body = document.body.classList
    body.add('greyed', 'reinterfering')
    const back = setTimeout(() => {
      body.remove('greyed')
      sfx('unlock')
      setArrival(ceremony)
    }, GREY_HOLD_MS)
    const done = setTimeout(() => setCeremony(null), GREY_HOLD_MS + FLOOD_MS)
    return () => {
      clearTimeout(back)
      clearTimeout(done)
      body.remove('greyed', 'reinterfering')
    }
  }, [ceremony])

  // The arrival is judged once, the first time the lobby is on screen.
  useEffect(() => {
    if (judged.current || view !== 'lobby') return
    judged.current = true
    const before = store.getState()
    const now = Date.now()
    if (before && isArrival(before, now)) arrive(before, now, isGreyArrival(before, now))
  }, [view])

  // A tab hidden for hours and shown again is an arrival too.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = { at: Date.now(), before: store.getState() }
        return
      }
      const h = hiddenAt.current
      hiddenAt.current = null
      // Only a return onto the lobby: a Master who comes back to a climb on screen plays on,
      // and a later lobby visit would report their own floors as "while you were away".
      if (h?.before && viewRef.current === 'lobby' && isLongHide(Date.now() - h.at)) {
        pendingReturn.current = { at: h.at, before: h.before }
        setVisTick((n) => n + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [store])

  useEffect(() => {
    const h = pendingReturn.current
    if (!h || view !== 'lobby' || arrival) return
    pendingReturn.current = null
    const cur = store.getState()
    if (!cur || accountKey(cur) !== accountKey(h.before) || isFreshMaster(cur) || cur.meta.deleted) return
    const now = Date.now()
    if (isArrival(h.before, now)) arrive(h.before, now, isGreyArrival(h.before, now))
  }, [view, visTick, arrival])

  // A ledger belongs to one account: a new game or an imported save closes it.
  useEffect(() => {
    if (arrival && accountKey(state) !== arrival.accountId) {
      setArrival(null)
      setLetterOpen(false)
    }
  }, [state.accountId, state.seed, arrival])

  // "Rest for now" appears after a climb, or after an hour of play.
  useEffect(() => {
    if (prevView.current === 'tower' && view === 'lobby') setRestReady(true)
    prevView.current = view
  }, [view])
  useEffect(() => {
    const id = setTimeout(() => setRestReady(true), LIGHTS_OUT_AFTER_MS)
    return () => clearTimeout(id)
  }, [])

  // The backup window opens on the `pmu:backup` window event (WP7's Menu footer).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const open = () => setBackup(true)
    window.addEventListener(BACKUP_EVENT, open)
    return () => window.removeEventListener(BACKUP_EVENT, open)
  }, [])

  // Ask the browser to keep the save, right after the first summon (a user gesture).
  useEffect(() => {
    if (flag(PERSIST_KEY)) return
    let prev = store.getState()
    return store.subscribe(() => {
      const cur = store.getState()
      const summoned = !!cur && !!prev && accountKey(cur) === accountKey(prev) && Object.keys(cur.heroes).length > Object.keys(prev.heroes).length
      prev = cur
      if (summoned && !flag(PERSIST_KEY)) {
        setFlag(PERSIST_KEY)
        void requestPersistentStorage()
      }
    })
  }, [store])

  // One gentle backup nudge, once, after floor 5.
  useEffect(() => {
    if (!nudge && view === 'lobby' && !arrival && state.tower.highestCleared >= NUDGE_FLOOR && seenOnRealClock(state) && !flag(NUDGED_KEY)) setNudge(true)
  }, [view, arrival, state, nudge])

  const closeNudge = (thenBackup: boolean) => {
    setFlag(NUDGED_KEY)
    setNudge(false)
    if (thenBackup) setBackup(true)
  }

  const busy = ceremony !== null || arrival !== null || letterOpen || lightsOut || backup
  const busyCb = useRef(onBusyChange)
  busyCb.current = onBusyChange
  useEffect(() => {
    busyCb.current?.(busy)
  }, [busy])

  const inLobby = view === 'lobby'
  const nowWorld = toWorldTime(Date.now())
  return (
    <>
      {ceremony && <div className="reinterference" aria-hidden="true">{t('✦ Re-interference ✦')}</div>}

      {inLobby && restReady && !arrival && !lightsOut && (
        <button className="pbtn rest-btn" onClick={() => setLightsOut(true)} title={t('A good place to stop: see what waits for next time')}>
          ☾ {t('Rest for now')}
        </button>
      )}

      {inLobby && nudge && !backup && (
        <div className="backup-nudge" role="status">
          <span>💾 {t('Back up your save? Browsers sometimes forget.')}</span>
          <button className="pbtn sm" onClick={() => closeNudge(true)}>
            {t('Back up')}
          </button>
          <button className="pbtn sm ghost" onClick={() => closeNudge(false)}>
            {t('Not now')}
          </button>
        </div>
      )}

      {inLobby && arrival && !letterOpen && (
        <WelcomeBack
          arrival={arrival}
          state={state}
          store={store}
          onGo={onGo}
          onClose={() => {
            // The ledger was the welcome-back letter: Isel's letter is read (it would
            // otherwise pop up again the next time the lobby mounts).
            setArrival(null)
            store.dispatch({ type: 'READ_LETTER' }, Date.now())
          }}
          onOpenLetter={letterReady(state, nowWorld) ? () => setLetterOpen(true) : null}
        />
      )}
      {inLobby && letterOpen && (
        <LetterWindow
          state={state}
          onClose={() => {
            setLetterOpen(false)
            setArrival(null)
            store.dispatch({ type: 'READ_LETTER' }, Date.now())
          }}
        />
      )}

      {inLobby && lightsOut && (
        <LightsOut
          state={state}
          nowReal={Date.now()}
          onGo={onGo}
          onClose={() => setLightsOut(false)}
          onBackup={() => {
            setLightsOut(false)
            setBackup(true)
          }}
        />
      )}
      {backup && <BackupWindow state={state} store={store} canRestore={view !== 'tower'} onClose={() => setBackup(false)} />}
    </>
  )
}
