// @vitest-environment jsdom
/**
 * Lane P in the real war room: a new Master's first tip (and "Got it" latches it in the save),
 * a filler mission's briefing with what wins and what loses, the escort among the free
 * Protects, and the Settings toggle that silences the coach.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { App } from '../App'
import { getStore } from '../useGame'
import { setLocale } from '../i18n/i18n'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import type { GameState, HeroId } from '../../engine/types'
import { SettingsWindow } from '../qol/Settings'
import { getSettings, reloadSettingsForTests, updateSettings } from '../qol/settings'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  setLocale('en')
  window.localStorage.clear()
  reloadSettingsForTests()
  container?.remove()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  window.localStorage.clear()
  reloadSettingsForTests()
})

function account(floor = 1): GameState {
  let s = { ...createAccount(4242, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  const ids = (Object.keys(s.heroes) as HeroId[]).slice(0, 5)
  s = { ...s, party: { slots: ids, lines: ['front', 'front', 'mid', 'back', 'back'] } }
  if (floor > 1) s = { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1 } }
  return s
}
function load(s: GameState) {
  window.localStorage.setItem('pmu.save.v1', JSON.stringify({ schemaVersion: s.schemaVersion, savedAt: 0, state: s }))
  act(() => {
    getStore().load()
  })
}
const text = () => container.textContent ?? ''
const button = (label: string, scope: ParentNode = container) =>
  Array.from(scope.querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined
function toTower() {
  act(() => root.render(<App />))
  act(() => button('Menu')!.click())
  const item = Array.from(container.querySelectorAll('button.menu-item')).find((b) => b.textContent?.includes('Tower Gate')) as HTMLButtonElement
  act(() => item.click())
}

describe('missions and the coach in the war room', () => {
  it('a new Master meets Isel’s first tip; Got it latches it for good', () => {
    load(account(1))
    toTower()
    const card = container.querySelector('.coach-card')!
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('Elements')
    act(() => button('Got it', card)!.click())
    expect(getStore().getState()!.life.guide.done).toContain('coach:elements')
    expect(container.querySelector('.coach-card')).toBeNull()
  })

  it('a filler escort is briefed: the mission, what wins, what loses — and the escort can be protected', () => {
    load(account(12))
    toTower()
    const brief = container.querySelector('.mission-brief')!
    expect(brief).not.toBeNull()
    expect(brief.textContent).toContain('Escort')
    expect(brief.textContent).toContain('To win')
    expect(brief.textContent).toContain('Lost if')
    expect(brief.textContent).toContain('Refugee falls: the mission fails at once.')
    expect(Array.from(container.querySelectorAll('.pb-chip.escort')).some((b) => b.textContent?.includes('Refugee'))).toBe(true)
  })

  it('no briefing card of lane P on an anchor (lane M’s is there)', () => {
    load(account(10))
    toTower()
    expect(container.querySelector('.mission-brief')).toBeNull()
    expect(text()).toContain('The Falling City')
  })

  it('the coach can be turned off from its own card and from Settings', () => {
    load(account(1))
    toTower()
    act(() => button('Turn tips off')!.click())
    expect(getSettings().coachTips).toBe(false)
    expect(container.querySelector('.coach-card')).toBeNull()
    updateSettings({ coachTips: true })
    act(() => root.render(<SettingsWindow onClose={() => {}} />))
    const row = Array.from(container.querySelectorAll('.set-row')).find((r) => r.textContent?.includes('Isel’s tips'))!
    expect(row).toBeDefined()
    const toggle = row.querySelector('button, input') as HTMLElement
    act(() => toggle.click())
    expect(getSettings().coachTips).toBe(false)
  })
})
