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
 * Restore the save, never letting a bad one brick boot: if loading or migrating throws,
 * copy the raw save to BROKEN_SAVE_KEY, leave the state null (the title screen) and log.
 * The original key is left as it was; only a new game overwrites it.
 */
function safeLoad(store: Store): void {
  try {
    store.load() // restore an existing save if present (no-op if none)
  } catch (err) {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(DEFAULT_SAVE_KEY) : null
      if (raw !== null) window.localStorage.setItem(BROKEN_SAVE_KEY, raw)
    } catch {
      /* storage may be unavailable */
    }
    console.error(`Could not load the save; a copy was kept under "${BROKEN_SAVE_KEY}".`, err)
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
