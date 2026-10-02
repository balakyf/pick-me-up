/**
 * Save hygiene (B9): the 1 Hz lobby TICK no longer writes the whole save every second,
 * flush() writes what is pending, and a refused write never freezes the game.
 */
import { describe, it, expect, vi } from 'vitest'
import { MemoryStorage, loadState, saveState } from '../account'
import { TUNING } from '../tuning'
import type { StoragePort } from '../types'
import { createStore } from './store'

/** A MemoryStorage that counts writes and can be told to refuse them (a full quota). */
class CountingStorage implements StoragePort {
  readonly inner = new MemoryStorage()
  writes = 0
  full = false
  read(key: string): string | null {
    return this.inner.read(key)
  }
  write(key: string, value: string): void {
    if (this.full) throw new Error('QuotaExceededError: the storage is full')
    this.writes++
    this.inner.write(key, value)
  }
  clear(key: string): void {
    this.inner.clear(key)
  }
}

const KEY = 'test.save'
const SEC = 1000

function boot(every = 5) {
  const storage = new CountingStorage()
  const store = createStore({ storage, saveKey: KEY, tickPersistEvery: every })
  store.dispatch({ type: 'NEW_ACCOUNT', seed: 7, now: 0 })
  return { storage, store }
}

const savedClock = (s: CountingStorage) => loadState(s.read(KEY)!).meta.lastSeenAtWorld

describe('store persistence (B9)', () => {
  it('the default cadence lives in tuning', () => {
    expect(TUNING.persistence.tickPersistEvery).toBeGreaterThanOrEqual(10)
  })

  it('a TICK is persisted only every Nth time; every other command at once', () => {
    const { storage, store } = boot(5)
    expect(storage.writes).toBe(1) // NEW_ACCOUNT
    for (let i = 1; i <= 4; i++) store.dispatch({ type: 'TICK' }, i * SEC)
    expect(storage.writes).toBe(1)
    // The held state moved on; the save is behind.
    expect(store.getState()!.meta.lastSeenAtWorld).toBeGreaterThan(savedClock(storage))
    store.dispatch({ type: 'TICK' }, 5 * SEC)
    expect(storage.writes).toBe(2)
    expect(savedClock(storage)).toBe(store.getState()!.meta.lastSeenAtWorld)
    // A real command persists immediately.
    store.dispatch({ type: 'SET_PARTY', slots: store.getState()!.party.slots, lines: ['back', 'front', 'mid', 'back', 'back'] }, 6 * SEC)
    expect(storage.writes).toBe(3)
    expect(loadState(storage.read(KEY)!).party.lines[0]).toBe('back')
  })

  it('flush() writes what is pending, and is a no-op when the save is current', () => {
    const { storage, store } = boot(15)
    store.dispatch({ type: 'TICK' }, 3 * SEC)
    expect(storage.writes).toBe(1)
    store.flush()
    expect(storage.writes).toBe(2)
    expect(savedClock(storage)).toBe(store.getState()!.meta.lastSeenAtWorld)
    store.flush()
    expect(storage.writes).toBe(2)
  })

  it('a TICK that changes nothing does not dirty the save', () => {
    const { storage, store } = boot(2)
    store.dispatch({ type: 'TICK' }, 0) // same clock: advanceTime returns the same state
    store.dispatch({ type: 'TICK' }, 0)
    store.flush()
    expect(storage.writes).toBe(1)
  })

  it('a refused write keeps the game going: the state applies, subscribers hear, the error is recorded', () => {
    const { storage, store } = boot(1)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const heard = vi.fn()
      store.subscribe(heard)
      storage.full = true
      const before = store.getState()!
      const next = store.dispatch({ type: 'SET_PARTY', slots: before.party.slots, lines: ['back', 'back', 'back', 'back', 'back'] }, SEC)
      expect(store.getState()).toBe(next)
      expect(next.party.lines).toEqual(['back', 'back', 'back', 'back', 'back'])
      expect(heard).toHaveBeenCalledTimes(1)
      expect(store.getSaveError()?.message).toMatch(/storage is full/)
      // TICKs keep flowing without throwing.
      expect(() => store.dispatch({ type: 'TICK' }, 2 * SEC)).not.toThrow()
      expect(() => store.flush()).not.toThrow()
      // Warned once, not every second.
      expect(warn).toHaveBeenCalledTimes(1)
      // Space frees up: the next save goes through and clears the error.
      storage.full = false
      store.flush()
      expect(store.getSaveError()).toBeNull()
      expect(loadState(storage.read(KEY)!).party.lines).toEqual(['back', 'back', 'back', 'back', 'back'])
    } finally {
      warn.mockRestore()
    }
  })

  it('load() makes the save current: an import is never overwritten by a stale flush', () => {
    const { storage, store } = boot(15)
    store.dispatch({ type: 'TICK' }, 4 * SEC) // pending
    // An import writes storage directly, then loads it.
    const imported = createStore().dispatch({ type: 'NEW_ACCOUNT', seed: 99, now: 0 })
    storage.inner.write(KEY, saveState(imported))
    store.load()
    store.flush()
    expect(loadState(storage.read(KEY)!).seed).toBe(imported.seed)
  })

  it('revise persists the revised attempt', () => {
    const storage = new CountingStorage()
    const store = createStore({ storage, saveKey: KEY })
    store.dispatch({ type: 'NEW_ACCOUNT', seed: 3, now: 0 })
    store.dispatch({ type: 'ATTEMPT_FLOOR' })
    const writes = storage.writes
    store.revise({ type: 'ATTEMPT_FLOOR', orders: [{ tick: 1, kind: 'retreat' }] })
    expect(storage.writes).toBe(writes + 1)
    expect(loadState(storage.read(KEY)!).tower.attemptIndex).toBe(store.getState()!.tower.attemptIndex)
  })
})
