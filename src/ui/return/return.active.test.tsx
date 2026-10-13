// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App } from '../App'
import { getStore } from '../useGame'
import { createAccount, saveState } from '../../engine/account'
import type { GameState } from '../../engine/types'
import { isArrival } from './arrival'

/**
 * Review #17: a long session off the lobby (Tower, Summon, Party, Roster) dispatches
 * without the real clock, so `meta.lastSeenAtWorld` stays where the lobby left it. A reload
 * after 2+ hours of such play must not be greeted as an absence: the return layer tracks
 * the Master's real activity and the arrival is judged from the later of the two.
 */

const MIN = 60_000
const HOUR = 60 * MIN
const T0 = Date.UTC(2026, 9, 12, 9)
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers({ now: T0 })
  window.localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  window.history.replaceState({}, '', '/')
  vi.useRealTimers()
})

function boot(view: string | null) {
  window.history.replaceState({}, '', view ? `/?view=${view}` : '/')
  act(() => root.render(<App />))
}

/** "Reload": the tab closes, the save is read back from storage, the App mounts afresh. */
function reloadAt(nowReal: number) {
  act(() => root.unmount())
  vi.setSystemTime(nowReal)
  act(() => {
    getStore().load()
  })
  root = createRoot(container)
  boot(null)
}

/** Two and a half hours in the Hero Registry: clicks and engine commands with no clock. */
function longSessionOffTheLobby(seed: number) {
  const base = createAccount(seed, { now: T0 })
  const s: GameState = { ...base, life: { ...base.life, guide: { ...base.life.guide, done: ['welcome'] } } }
  window.localStorage.setItem('pmu.save.v1', saveState(s))
  act(() => {
    getStore().load()
  })
  boot('roster')
  for (let m = 15; m <= 150; m += 15) {
    vi.setSystemTime(T0 + m * MIN)
    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
      getStore().dispatch({ type: 'ADD_GOLD', amount: 1 })
    })
  }
}

describe('A reload after a long session off the lobby', () => {
  it('is not "While you were away"', () => {
    longSessionOffTheLobby(101)
    const back = T0 + 150 * MIN + MIN
    // The engine's clock alone would call this an arrival (the scenario is real) …
    expect(isArrival(getStore().getState()!, back)).toBe(true)
    reloadAt(back)
    // … but the Master was here a minute ago.
    expect(container.textContent).not.toContain('While you were away')
  })

  it('nor is the first lobby visit after such a session in the same page', () => {
    longSessionOffTheLobby(103)
    vi.setSystemTime(T0 + 150 * MIN + MIN)
    const lobby = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Lobby'))!
    act(() => lobby.click())
    expect(container.textContent).toContain('Master Lv')
    expect(container.textContent).not.toContain('While you were away')
  })

  it('activity noted for another account does not hide a real absence', () => {
    longSessionOffTheLobby(104)
    // A different save is restored in its place (same browser, older activity unknown).
    const other = createAccount(105, { now: T0 })
    window.localStorage.setItem('pmu.save.v1', saveState({ ...other, life: { ...other.life, guide: { ...other.life.guide, done: ['welcome'] } } }))
    reloadAt(T0 + 150 * MIN + MIN)
    expect(container.textContent).toContain('While you were away')
  })

  it('a real absence after such a session is still welcomed, timed from the last activity', () => {
    longSessionOffTheLobby(102)
    reloadAt(T0 + 150 * MIN + 3 * HOUR + MIN)
    expect(container.textContent).toContain('While you were away')
    expect(container.textContent).toContain('You were away 3 hours')
  })
})
