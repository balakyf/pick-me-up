import { useSyncExternalStore } from 'react'
import { createStore, type Store } from '../engine/store'
import type { StoragePort } from '../engine/types'
import { DEFAULT_SAVE_KEY } from '../engine/account'

/**
 * The UI's single connection to the engine. One module-level store, wired to
 * localStorage, hydrated once on first use. Components read state via
 * useSyncExternalStore and dispatch Commands. All game rules live in the engine;
 * this is pure plumbing.
 */

/** Adapt the browser's localStorage (getItem/setItem) to the engine StoragePort. */
function localStoragePort(): StoragePort {
  return {
    read: (key) => window.localStorage.getItem(key),
    write: (key, value) => window.localStorage.setItem(key, value),
    clear: (key) => window.localStorage.removeItem(key),
  }
}

let singleton: Store | null = null

/** Where an unreadable save is copied before the app falls back to the title screen. */
export const BROKEN_SAVE_KEY = `${DEFAULT_SAVE_KEY}.broken`

/**
 * Copy the save on disk to BROKEN_SAVE_KEY, and say whether the copy is really there
 * (a full quota or blocked storage makes the write throw — the UI must not claim a copy
 * it does not have). False when there is no save to copy.
 */
export function keepBrokenCopy(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const raw = window.localStorage.getItem(DEFAULT_SAVE_KEY)
    if (raw === null) return false
    if (window.localStorage.getItem(BROKEN_SAVE_KEY) !== raw) window.localStorage.setItem(BROKEN_SAVE_KEY, raw)
    return window.localStorage.getItem(BROKEN_SAVE_KEY) === raw
  } catch {
    return false
  }
}

/** The raw save that failed to load at boot (kept in memory, as its copy may have failed). */
let bootFailedRaw: string | null = null
/** The save on disk is the one that failed to load at boot (whether or not a copy could be
 *  kept); a new game written since reads as false. */
export function bootLoadFailed(): boolean {
  try {
    return bootFailedRaw !== null && typeof window !== 'undefined' && window.localStorage.getItem(DEFAULT_SAVE_KEY) === bootFailedRaw
  } catch {
    return false
  }
}

/**
 * Restore the save, never letting a bad one brick boot: if loading or migrating throws,
 * copy the raw save to BROKEN_SAVE_KEY, leave the state null (the title screen) and log.
 * The original key is left as it was; a new game overwrites it only once it is copied
 * (or the Master confirms, when the copy could not be written).
 */
function safeLoad(store: Store): void {
  try {
    store.load() // restore an existing save if present (no-op if none)
  } catch (err) {
    try {
      bootFailedRaw = typeof window !== 'undefined' ? window.localStorage.getItem(DEFAULT_SAVE_KEY) : null
    } catch {
      /* storage may be unavailable */
    }
    if (keepBrokenCopy()) console.error(`Could not load the save; a copy was kept under "${BROKEN_SAVE_KEY}".`, err)
    else console.error('Could not load the save, and no copy of it could be kept.', err)
  }
}

export function getStore(): Store {
  if (singleton === null) {
    singleton = createStore(typeof window !== 'undefined' ? { storage: localStoragePort() } : {})
    safeLoad(singleton)
  }
  return singleton
}

export function useGame() {
  const store = getStore()
  const state = useSyncExternalStore(store.subscribe, store.getState, () => null)
  return { state, store }
}

/** The single allowed entropy point lives in the UI bootstrap, never the engine. */
export function freshSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    return a[0]!
  }
  // Fallback: combine the clock with a random draw (UI-only; the engine stays pure).
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
}
