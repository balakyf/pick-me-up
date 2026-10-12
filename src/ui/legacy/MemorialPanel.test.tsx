// @vitest-environment jsdom
/** WP0: the Memorial body and its grave list moved to ui/legacy/MemorialPanel.tsx unchanged. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount } from '../../engine/account'
import { createStore } from '../../engine/store'
import type { FallenRecord, GameState, HeroId } from '../../engine/types'
import { PlacePanel } from '../facilityPanels'
import { GraveList, MemorialPanel } from './MemorialPanel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

function withGrave(): GameState {
  const s = createAccount(7, { now: 0 })
  const id = Object.keys(s.heroes)[0] as HeroId
  const h = s.heroes[id]!
  const grave: FallenRecord = {
    heroId: id, name: h.name, star: h.star, level: h.xp.level, heroClass: h.heroClass ?? null, element: h.element,
    portraitToken: '', cause: 'battle', floor: 4, day: 0, daysServed: 3, bestFloor: 4, mourners: [],
  }
  return { ...s, heroes: { ...s.heroes, [id]: { ...h, alive: false } }, life: { ...s.life, memorial: [grave] } }
}

describe('MemorialPanel (moved out of facilityPanels and lifePanels)', () => {
  it('an empty lawn says so', () => {
    act(() => root.render(<GraveList state={createAccount(7, { now: 0 })} />))
    expect(container.textContent).toContain('The lawn is empty. Keep it that way, Master.')
  })

  it('lists the graves, and the Memorial place renders the same body as the panel', () => {
    const s = withGrave()
    const store = createStore()
    act(() => root.render(<MemorialPanel state={s} store={store} />))
    const text = container.textContent ?? ''
    expect(text).toContain('1 names on the obelisk.')
    expect(text).toContain('fell on floor 4')
    expect(text).toContain('Visiting now')
    expect(container.querySelectorAll('.grave-row')).toHaveLength(1)
    const body = container.innerHTML
    act(() => root.render(<PlacePanel state={s} store={store} place="memorial" />))
    expect(container.innerHTML).toContain(body)
  })
})
