// @vitest-environment jsdom
/** The honest tab title (spec 2026-10-12 S27) reads the store and NEVER dispatches. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createAccount } from '../../engine/account'
import { createStore, type Store } from '../../engine/store'
import { toWorldTime } from '../../engine/time'
import type { GameState, HeroId } from '../../engine/types'
import { useHonestTabTitle } from './tabTitle'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Probe({ store }: { store: Store }) {
  useHonestTabTitle(store)
  return null
}

afterEach(() => {
  delete (document as { hidden?: boolean }).hidden
  vi.useRealTimers()
})

describe('useHonestTabTitle', () => {
  it('never dispatches, never flashes, and restores the title when visible', () => {
    const t0 = Date.UTC(2026, 9, 12, 20)
    vi.useFakeTimers({ now: t0 })
    let isHidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden })
    const base = createAccount(9, { now: t0 })
    const id = Object.keys(base.heroes)[0] as HeroId
    const s: GameState = { ...base, heroes: { ...base.heroes, [id]: { ...base.heroes[id]!, promotion: { completesAtWorld: toWorldTime(t0 + 60_000) } } } }
    const real = createStore()
    real.dispatch({ type: 'NEW_ACCOUNT', seed: 9, now: 0 })
    const dispatch = vi.fn(() => {
      throw new Error('the tab title must not dispatch')
    })
    const store: Store = { ...real, getState: () => s, dispatch }
    const host = document.createElement('div')
    const root = createRoot(host)
    document.title = 'Pick Me Up!'
    act(() => root.render(<Probe store={store} />))
    isHidden = true
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const titles = new Set<string>()
    for (let i = 0; i < 12; i++) {
      act(() => {
        vi.advanceTimersByTime(15_000)
      })
      titles.add(document.title)
    }
    // Before the promotion: the plain title; after: one honest line that never changes again.
    expect([...titles]).toEqual(['Pick Me Up!', 'Pick Me Up! · ✓ Promotion done'])
    isHidden = false
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(document.title).toBe('Pick Me Up!')
    expect(dispatch).not.toHaveBeenCalled()
    act(() => root.unmount())
  })
})
