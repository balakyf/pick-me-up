// @vitest-environment jsdom
/**
 * Tower smoke test (spec 2026-10-12 §4.5, WP4): the REAL App against the REAL engine.
 * A save stands on F6 with two Doors offered; the Master opens the Tower Gate, takes
 * the Skull door, and the scouting report names the floor Elite.
 *
 * The climb engine (WP3) lands in parallel. Until it does, `chooseDoor` throws "not
 * built yet"; only in that case this file stands in a minimal choice (set the kind,
 * clear the offer). Once WP3 lands the real `chooseDoor` runs and this stand-in is inert.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { GameState } from '../../engine/types'

vi.mock('../../engine/climb/doors', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../engine/climb/doors')>()
  return {
    ...real,
    chooseDoor: (state: GameState, index: number, nowWorld?: number): GameState => {
      try {
        return real.chooseDoor(state, index, nowWorld)
      } catch (e) {
        if (!(e instanceof Error) || !/not built yet/.test(e.message)) throw e
        const door = state.tower.doors?.[index]
        if (!door) throw new Error('chooseDoor: no such door')
        return { ...state, tower: { ...state.tower, kind: door.kind, doors: null } }
      }
    },
  }
})

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App } from '../App'
import { getStore } from '../useGame'

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

function openPlace(label: string) {
  clickButton('Menu')
  const item = Array.from(container.querySelectorAll('button.menu-item')).find((b) => b.textContent?.includes(label))
  if (!item) throw new Error(`no menu place "${label}"`)
  act(() => {
    ;(item as HTMLButtonElement).click()
  })
}

/** Start a fresh Master, then load a save shaped by `edit`. */
function loadSave(seed: number, edit: (s: GameState) => GameState) {
  act(() => {
    root.render(<App />)
  })
  act(() => {
    getStore().dispatch({ type: 'NEW_ACCOUNT', seed, now: 0 })
  })
  const s = edit(getStore().getState()!)
  window.localStorage.setItem('pmu.save.v1', JSON.stringify({ schemaVersion: s.schemaVersion, savedAt: 0, state: s }))
  act(() => {
    getStore().load()
  })
}

describe('Tower smoke — Doors', () => {
  it('a save on F6 with Doors pending: take the Skull door and the scout shows Elite', () => {
    loadSave(41, (s) => ({
      ...s,
      tower: {
        ...s.tower,
        currentFloor: 6,
        highestCleared: 5,
        event: null,
        kind: 'path',
        doors: [
          { kind: 'path', reward: 'gold' },
          { kind: 'elite', reward: 'boon' },
        ],
      },
    }))
    openPlace('Tower Gate')
    expect(container.textContent).toContain('Choose the next door')
    expect(container.textContent).toContain('The skull door hides an elite') // Isel, the first time
    const enter = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Enter'))
    expect((enter as HTMLButtonElement).disabled).toBe(false) // Enter still works: it takes doors[0]
    clickButton('Skull')
    const after = getStore().getState()!
    expect(after.tower.doors).toBeNull()
    expect(after.tower.kind).toBe('elite')
    expect(after.life.guide.done).toContain('doors')
    expect(container.textContent).not.toContain('Choose the next door')
    const scout = container.querySelector('.scout')
    expect(scout).not.toBeNull()
    expect(scout!.textContent).toContain('Elite')
  })

  it('an open Boon event still blocks the first Enter, as every event does', () => {
    loadSave(42, (s) => ({
      ...s,
      tower: { ...s.tower, currentFloor: 6, highestCleared: 5, event: { kind: 'boon', floor: 5, options: ['ironVow', 'volley', 'warChest'] } },
    }))
    openPlace('Tower Gate')
    expect(container.textContent).toContain('Boon')
    const enter = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Enter'))
    expect((enter as HTMLButtonElement).disabled).toBe(true)
  })
})
