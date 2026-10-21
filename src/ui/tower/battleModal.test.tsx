// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount, DEFAULT_SAVE_KEY, MemoryStorage, saveState } from '../../engine/account'
import { createStore, reduce, type Store } from '../../engine/store'
import { suggestParty } from '../../engine/scout'
import type { Command } from '../../engine/types'
import { PREFS_KEY } from '../prefs'

/**
 * The battle is modal (review finding #2): while a replay is up, no key and no stray
 * click may start a second floor attempt behind it. In a browser, an Enter (or Space)
 * keydown that is not prevented on a focused button turns into a click on that button;
 * jsdom does not synthesize that click, so `press` emulates it.
 */
vi.mock('../pixel/sprites', async (orig) => {
  const real = await orig<typeof import('../pixel/sprites')>()
  return {
    ...real,
    heroPoseUrl: (h: { id: string }, pose: string) => `hero:${h.id}:${pose}`,
    heroBlinkUrl: (h: { id: string }) => `blink:${h.id}`,
    enemyPoseUrl: (name: string, _el: string, pose: string) => `enemy:${name}:${pose}`,
    allyPoseUrl: (name: string, pose: string) => `ally:${name}:${pose}`,
  }
})
const { TowerScreen } = await import('../TowerScreen')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 1 }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  act(() => {
    vi.runOnlyPendingTimers()
  })
  container.remove()
  vi.useRealTimers()
})

function Harness({ store }: { store: Store }) {
  const [, bump] = useState(0)
  useEffect(() => store.subscribe(() => bump((n) => n + 1)), [store])
  return <TowerScreen state={store.getState()!} store={store} />
}

function setup(): { store: Store; sent: string[] } {
  let s = createAccount(3)
  s = reduce(s, { type: 'SUMMON', count: 10 })
  const p = suggestParty(s)
  s = reduce(s, { type: 'SET_PARTY', slots: p.slots, lines: p.lines })
  const storage = new MemoryStorage()
  storage.write(DEFAULT_SAVE_KEY, saveState(s))
  const store = createStore({ storage })
  store.load()
  const sent: string[] = []
  const dispatch = store.dispatch.bind(store)
  store.dispatch = ((cmd: Command, ...rest: unknown[]) => {
    sent.push(cmd.type)
    return (dispatch as (...a: unknown[]) => unknown)(cmd, ...rest)
  }) as Store['dispatch']
  act(() => root.render(<Harness store={store} />))
  return { store, sent }
}

/** A key pressed on whatever has focus, with the browser's default (a focused button's
 *  click on Enter / Space) applied unless the keydown was prevented. */
function press(key: string): { prevented: boolean } {
  const target = (document.activeElement ?? document.body) as HTMLElement
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  act(() => {
    target.dispatchEvent(ev)
  })
  if (!ev.defaultPrevented && (key === 'Enter' || key === ' ') && target instanceof HTMLButtonElement && !target.disabled) {
    act(() => target.click())
  }
  return { prevented: ev.defaultPrevented }
}

describe('the battle is modal over the Tower', () => {
  it('Enter during the replay never starts a second floor attempt through the focused Fight button', () => {
    const { store, sent } = setup()
    const fightBtn = container.querySelector('.scout-fight') as HTMLButtonElement
    expect(fightBtn).toBeTruthy()
    fightBtn.focus()
    act(() => fightBtn.click())
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(container.querySelector('.battle')).toBeTruthy()
    const floorMid = store.getState()!.tower.currentFloor
    // Focus left the page behind the battle.
    expect(document.activeElement).not.toBe(fightBtn)
    // Even with focus put back on it (a click, a Tab), Enter and Space do nothing there.
    fightBtn.focus()
    for (const k of ['Enter', ' ', 'Enter']) {
      press(k)
      act(() => {
        vi.advanceTimersByTime(150)
      })
    }
    expect(sent.filter((t) => t === 'ATTEMPT_FLOOR')).toHaveLength(1)
    expect(store.getState()!.tower.currentFloor).toBe(floorMid)
  })

  it('the Fight button is disabled while a battle is up, and a click on it is refused', () => {
    const { sent } = setup()
    const fightBtn = container.querySelector('.scout-fight') as HTMLButtonElement
    act(() => fightBtn.click())
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(container.querySelector('.battle')).toBeTruthy()
    const again = container.querySelector('.scout-fight') as HTMLButtonElement | null
    if (again) {
      expect(again.disabled).toBe(true)
      // A click that reaches the handler anyway (dispatched programmatically) is refused.
      act(() => again.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    }
    expect(sent.filter((t) => t === 'ATTEMPT_FLOOR')).toHaveLength(1)
  })
})
