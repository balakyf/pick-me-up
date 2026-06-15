// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App } from './App'
import { getStore } from './useGame'

/**
 * UI smoke test: mount the REAL App against the REAL engine in jsdom and verify
 * the reactive wiring (title → new account → game shell → summon → roster).
 * Rendering correctness beyond this is checked by eye in the dev server; the game
 * LOGIC is covered exhaustively by the engine suites.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  window.localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

function mount() {
  act(() => {
    root.render(<App />)
  })
}

describe('App smoke', () => {
  it('renders the title screen for a fresh visitor', () => {
    mount()
    expect(container.textContent).toContain('Pick Me Up')
    expect(container.textContent).toContain('Begin')
  })

  it('creating an account shows the game shell with the starter and starting gold', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 12345, now: 0 })
    })
    // Top bar + nav shell now present; app opens on the Lobby (the home base).
    expect(container.textContent).toContain('Master #')
    expect(container.textContent).toContain('🗼 Tower') // nav tab, always rendered
    expect(container.textContent).toContain('Waiting Room') // default Lobby view
    // Starting gold (3000) renders in the gold pill.
    expect(container.textContent).toContain('3,000')
    // Exactly one living hero (the starter).
    expect(container.textContent).toContain('Heroes')
  })

  it('the Lobby scene renders the Master-Level spine, Kitchen, and Banquet control', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 777, now: 0 })
    })
    // Master-Level spine + currencies (Phase 2 scene).
    expect(container.textContent).toContain('Master Lv')
    expect(container.textContent).toContain('XP')
    // Kitchen room + its interactive Banquet action (Phase 3).
    expect(container.textContent).toContain('Kitchen')
    expect(container.textContent).toContain('Banquet')
    // Fresh starter is at full Sanity → Banquet is offered but reads as not-needed.
    expect(container.textContent).toContain('full morale')
    const banquetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Banquet'),
    )
    expect(banquetBtn).toBeDefined()
    expect((banquetBtn as HTMLButtonElement).disabled).toBe(true)

    // Promotion Chamber renders; the fresh 1★ starter is not at cap, so it prompts to climb.
    expect(container.textContent).toContain('Promotion Chamber')
    expect(container.textContent).toContain('star cap')

    // Daily Dungeon portal renders; locked until the player clears the unlock floor.
    expect(container.textContent).toContain('Daily Dungeon')
    expect(container.textContent).toContain('to unlock')

    // Tactical Center shows its current combat levers (focus bonus + overlook slots).
    expect(container.textContent).toContain('Tactical Center')
    expect(container.textContent).toContain('Focus damage')
    expect(container.textContent).toContain('Overlook slots')

    // Facility upgrades surface; a fresh ML1 account is gated (Kitchen at the ML
    // ceiling; Promotion Chamber locked until ML3).
    expect(container.textContent).toContain('Raise Master Level to upgrade')
    expect(container.textContent).toContain(`Unlocks at Master Lv ${3}`)
  })

  it('the lobby pumps the world clock on an interval (timers advance while watching)', () => {
    vi.useFakeTimers({ now: 1000 })
    try {
      mount()
      act(() => {
        getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 1, now: 0 })
      })
      expect(getStore().getState()!.meta.lastSeenAtWorld).toBe(0)
      act(() => {
        vi.advanceTimersByTime(2500) // a couple of interval ticks
      })
      // A TICK fired → advanceTime ran → the world clock moved forward.
      expect(getStore().getState()!.meta.lastSeenAtWorld).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('summoning reveals a hero and spends gold', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 999, now: 0 })
    })
    const before = getStore().getState()!.gold
    const heroesBefore = Object.keys(getStore().getState()!.heroes).length
    act(() => {
      getStore().dispatch({ type: 'SUMMON' })
    })
    const after = getStore().getState()!
    expect(after.gold).toBe(before - 3000)
    expect(Object.keys(after.heroes).length).toBe(heroesBefore + 1)
  })
})
