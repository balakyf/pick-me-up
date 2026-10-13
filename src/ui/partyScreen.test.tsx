// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { PartyScreen } from './screens'
import { createStore, type Store } from '../engine/store'

/**
 * Playtest 2026-10-13: the Party board kept a local draft that only a small "Save Party"
 * button committed. A new Master who picked five heroes and followed the goal tracker
 * away lost the party, and the tracker kept asking for one. Every tap now saves.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function Board({ store }: { store: Store }) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  return state ? <PartyScreen state={state} store={store} /> : null
}

describe('PartyScreen', () => {
  it('saves the party on every tap — no separate Save button to forget', () => {
    const store = createStore()
    store.dispatch({ type: 'NEW_ACCOUNT', seed: 5, now: 0 })
    const s0 = store.getState()!
    act(() => {
      store.dispatch({ type: 'SET_PARTY', slots: [null, null, null, null, null], lines: s0.party.lines })
    })
    act(() => {
      store.dispatch({ type: 'SUMMON' })
    })
    act(() => root.render(<Board store={store} />))
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'Save Party')).toBe(false)

    const cards = () => Array.from(container.querySelectorAll('.grid.cards > *')) as HTMLElement[]
    expect(cards().length).toBeGreaterThan(0)
    act(() => cards()[0]!.click())
    const saved = store.getState()!.party.slots.filter(Boolean)
    expect(saved).toHaveLength(1)
    expect(container.textContent).toContain('✓ Saved')

    // Tapping the filled slot removes the hero, and that is saved too.
    act(() => (container.querySelector('.party-slots .slot.filled') as HTMLElement).click())
    expect(store.getState()!.party.slots.filter(Boolean)).toHaveLength(0)
  })
})
