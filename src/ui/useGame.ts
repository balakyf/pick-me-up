import { useSyncExternalStore } from 'react'
import { createStore, type Store } from '../engine/store'
import type { GameState, StoragePort } from '../engine/types'

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

export function getStore(): Store {
  if (singleton === null) {
    singleton = createStore(typeof window !== 'undefined' ? { storage: localStoragePort() } : {})
    singleton.load() // restore an existing save if present (no-op if none)
    flushOnLeave(singleton)
  }
  return singleton
}

/**
 * The store saves the 1 Hz lobby TICK only every few seconds (B9), so write whatever is
 * pending the moment the page is hidden (tab switch, phone lock) or closed.
 */
function flushOnLeave(store: Store): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flush()
  })
  window.addEventListener('pagehide', () => store.flush())
}

/** The live account, if the store exists yet (never creates it). For helpers such as
 *  `cpOf` that need the account's inventory but are called with a hero alone. */
export function peekState(): GameState | null {
  return singleton?.getState() ?? null
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
