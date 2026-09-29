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

function clickButton(label: string) {
  const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label))
  if (!btn) throw new Error(`no button "${label}" in: ${container.textContent}`)
  act(() => {
    btn.click()
  })
}

/** Open the game menu and fast-travel to a place (opens its window). */
function openPlace(label: string) {
  clickButton('Menu')
  const item = Array.from(container.querySelectorAll('button.menu-item')).find((b) => b.textContent?.includes(label))
  if (!item) throw new Error(`no menu place "${label}"`)
  act(() => {
    ;(item as HTMLButtonElement).click()
  })
}

function closeWindow() {
  const close = container.querySelector('button.pwin-close') as HTMLButtonElement
  act(() => {
    close.click()
  })
}

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

  it('creating an account drops the Master into the walkable lobby', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 12345, now: 0 })
    })
    // The world HUD: Master Level, currencies, menu, controls help.
    expect(container.textContent).toContain('Master Lv 1')
    expect(container.textContent).toContain('3,000') // starting gold
    expect(container.textContent).toContain('1 hero')
    expect(container.textContent).toContain('Menu')
    expect(container.querySelector('canvas.world-canvas')).not.toBeNull()
  })

  it('the Menu lists every place and fast-travels into the Kitchen window', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 777, now: 0 })
    })
    openPlace('Kitchen')
    // Kitchen window + its interactive Banquet action.
    expect(container.textContent).toContain('Kitchen')
    expect(container.textContent).toContain('Banquet')
    // Fresh starter is at full Sanity → Banquet is offered but reads as not-needed.
    expect(container.textContent).toContain('full morale')
    const banquetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Banquet'),
    )
    expect(banquetBtn).toBeDefined()
    expect((banquetBtn as HTMLButtonElement).disabled).toBe(true)
    // Facility upgrades surface; a fresh ML1 account is gated at the ML ceiling.
    expect(container.textContent).toContain('Raise Master Level to upgrade')
  })

  it('the Promotion Chamber, Tactical Center and Daily Dungeon open from the Menu', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 778, now: 0 })
    })
    openPlace('Promotion Chamber')
    // the fresh 1★ starter is not at cap, so it prompts to climb; the build is ML-gated.
    expect(container.textContent).toContain('star cap')
    expect(container.textContent).toContain(`Unlocks at Master Lv ${3}`)
    closeWindow()

    openPlace('Tactical Center')
    expect(container.textContent).toContain('Focus damage')
    expect(container.textContent).toContain('Overlook slots')
    closeWindow()

    openPlace('Daily Dungeon')
    expect(container.textContent).toContain('to unlock')
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

  it('the Synthesis Chamber renders, gated by Master Level', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 2024, now: 0 })
    })
    openPlace('Synthesis Chamber')
    expect(container.textContent).toContain('Synthesis Chamber')
    // …but a fresh ML1 account sees it locked.
    expect(container.textContent).toContain('Unlocks at Master Lv 3')
  })

  it('the Armory renders, gated by Master Level', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 4242, now: 0 })
    })
    openPlace('Armory')
    expect(container.textContent).toContain('Armory')
    // …but a fresh ML1 account sees the forge locked (the Smithy opens at ML2).
    expect(container.textContent).toContain('Unlocks at Master Lv 2')
  })

  it("the Roster lists each hero's skills with grade and level", () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 31, now: 0 })
    })
    openPlace('Roster')
    // The starter (Islat Han) owns Power Strike, Berserk and Composure at Lv1.
    const chips = Array.from(container.querySelectorAll('.skill-chip')).map((c) => c.textContent)
    expect(chips).toContain('CPower StrikeLv 1')
    expect(chips).toContain('DBerserkLv 1')
    expect(chips).toContain('DComposureLv 1')
  })

  it('the Training Center opens from the Menu, gated at Master Lv 2', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 32, now: 0 })
    })
    openPlace('Training Center')
    expect(container.textContent).toContain('never stats or level')
    expect(container.textContent).toContain('Build the Training Center to start drills')
    expect(container.textContent).toContain('Unlocks at Master Lv 2')
  })
})
