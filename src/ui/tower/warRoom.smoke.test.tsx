// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { App } from '../App'
import { getStore } from '../useGame'
import { setLocale } from '../i18n/i18n'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import { attemptFloorWithResult } from '../../engine/store'
import { HIDDEN_OBJECTIVES } from '../../engine/content'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import { PENDING_KEY, savePendingReplay } from './pendingReplay'
import { cachedForecast, clearForecastCache, forecastInput } from '../../engine/scout/forecast'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The war room against the real engine (jsdom has no Worker, so the forecast answers at
 * once): the forecast, the Enter sheet, the room frozen behind the battle, the replay kept
 * for a reload, and the ninetieth floor's warning.
 */

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  setLocale('en')
  window.localStorage.clear()
  container?.remove()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
// Unmount each test's App, so no old clock keeps ticking into the next test.
afterEach(() => {
  act(() => root.unmount())
})

/** A ten-hero account with a full party, put in the store through a save (as a reload would). */
function account(floor = 1, patch: (s: GameState) => GameState = (s) => s): GameState {
  let s = { ...createAccount(4242, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  const ids = (Object.keys(s.heroes) as HeroId[]).slice(0, 5)
  s = { ...s, party: { slots: ids, lines: ['front', 'front', 'mid', 'back', 'back'] } }
  if (floor > 1) s = { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1 } }
  return patch(s)
}
function load(s: GameState) {
  window.localStorage.setItem('pmu.save.v1', JSON.stringify({ schemaVersion: s.schemaVersion, savedAt: 0, state: s }))
  act(() => {
    getStore().load()
  })
}
function mount() {
  act(() => {
    root.render(<App />)
  })
}
const text = () => container.textContent ?? ''
const button = (label: string) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined
function click(label: string) {
  const b = button(label)
  if (!b) throw new Error(`no button "${label}" in: ${text().slice(0, 400)}`)
  act(() => b.click())
}
function toTower() {
  click('Menu')
  const item = Array.from(container.querySelectorAll('button.menu-item')).find((b) => b.textContent?.includes('Tower Gate')) as HTMLButtonElement
  act(() => item.click())
}

describe('the war room', () => {
  it('forecasts the floor: a win %, the band, a chip per hero, the objective in words', () => {
    load(account(1))
    mount()
    toTower()
    expect(text()).toContain('Forecast · F1')
    expect(text()).toMatch(/\d+%to clear/)
    expect(text()).toMatch(/Safe|Fair fight|Risky|Deadly/)
    expect(container.querySelectorAll('.fc-chip').length).toBeGreaterThanOrEqual(5)
    expect(text()).toContain('Defeat every enemy.')
    expect(text()).toContain('16 runs of the real fight')
  })

  it('a healthy party on a safe floor enters without a sheet; the room stays as it was behind the battle', () => {
    load(account(1))
    mount()
    toTower()
    expect(text()).toContain('Safe')
    click('Enter ▸')
    expect(container.querySelector('.enter-sheet')).toBeNull()
    expect(container.querySelector('.battle')).not.toBeNull()
    // The attempt is already in the save — and its replay is kept until the results are seen.
    expect(getStore().getState()!.tower.highestCleared).toBe(1)
    expect(window.localStorage.getItem(PENDING_KEY)).not.toBeNull()
    // Nothing behind the overlay gives the outcome away: the room still reads floor 1.
    const command = container.querySelector('.war-command')!.textContent ?? ''
    expect(command).toContain('Forecast · F1')
    expect(command).not.toContain('Forecast · F2')
    // Skip to the end, continue, dismiss the results: the room moves on, the replay is gone.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }))
    })
    click('Continue')
    expect(text()).toContain('FLOOR CLEARED')
    click('Onward')
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull()
    expect(container.querySelector('.war-command')!.textContent).toContain('Forecast · F2')
  })

  it('Enter asks first when someone stays home or is shaky — naming each one and why', () => {
    load(
      account(1, (s) => {
        const ids = s.party.slots as HeroId[]
        const h = s.heroes
        return {
          ...s,
          heroes: {
            ...h,
            [ids[0]!]: { ...h[ids[0]!]!, promotion: { completesAtWorld: 1e15 } } as OwnedHero,
            [ids[1]!]: { ...h[ids[1]!]!, sanity: 12 } as OwnedHero,
          },
        }
      }),
    )
    mount()
    toTower()
    const state = getStore().getState()!
    const ids = state.party.slots as HeroId[]
    click('Enter ▸')
    const sheet = container.querySelector('.enter-sheet')!
    expect(sheet).not.toBeNull()
    expect(sheet.textContent).toContain('Only 4 of 5 will fight.')
    expect(sheet.textContent).toContain('is in the Promotion Chamber')
    expect(sheet.textContent).toContain('is at Sanity 12 and may panic')
    expect(sheet.textContent).toContain(state.heroes[ids[1]!]!.name.split(' ')[0]!)
    // Back: nothing happened.
    click('Back')
    expect(container.querySelector('.enter-sheet')).toBeNull()
    expect(getStore().getState()!.tower.highestCleared).toBe(0)
    // Enter anyway: the attempt goes.
    click('Enter ▸')
    click('Enter anyway')
    expect(container.querySelector('.battle')).not.toBeNull()
  })

  it('a reload mid-battle replays the fight and its results before anything else', () => {
    const s = account(1)
    // The attempt happened (the save holds it) but the page closed mid-replay.
    const r = attemptFloorWithResult(s)
    window.localStorage.setItem('pmu.save.v1', JSON.stringify({ schemaVersion: r.state.schemaVersion, savedAt: 0, state: r.state }))
    savePendingReplay(r.state, r.result)
    act(() => {
      getStore().load()
    })
    mount()
    expect(container.querySelector('.battle')).not.toBeNull()
    expect(text()).toContain('The battle you left on floor 1')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }))
    })
    click('Continue')
    expect(text()).toContain('FLOOR CLEARED')
    click('Onward')
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull()
    expect(container.querySelector('.battle')).toBeNull()
  })

  it('a replay that no longer matches the save (another Master, an import) is dropped unseen', () => {
    const s = account(1)
    const r = attemptFloorWithResult(s)
    savePendingReplay(r.state, r.result)
    load(s) // the save from before the attempt: the record does not match it
    mount()
    expect(container.querySelector('.battle')).toBeNull()
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull()
  })

  it('the ninetieth floor always asks — and says what clearing it does and how to refuse', () => {
    load(account(90, (s) => ({ ...s, tower: { ...s.tower, hiddenFound: HIDDEN_OBJECTIVES.slice(0, 7).map((h) => h.id) } })))
    mount()
    toTower()
    click('Clear it ▸')
    const sheet = container.querySelector('.enter-sheet.world')!
    expect(sheet).not.toBeNull()
    expect(sheet.textContent).toContain('ends the world beneath the tower')
    expect(sheet.textContent).toContain('You know 7 of the tower’s 10 truths.')
    expect(button('Subvert ✦')).toBeDefined()
    expect(button('Clear it — end the world')).toBeDefined()
    // The Subvert it offers comes with its own odds (the Herald without her aegis).
    expect(sheet.textContent).toMatch(/Subverted, the crystal gives this party \d+%/)
    click('Back')
    expect(getStore().getState()!.tower.worldEnded).toBe(false)
  })

  it('Subvert weighs the subverted fight (the Herald without her aegis), not the plain clear', () => {
    load(account(90, (s) => ({ ...s, tower: { ...s.tower, hiddenFound: HIDDEN_OBJECTIVES.slice(0, 7).map((h) => h.id) } })))
    mount()
    toTower()
    const live = getStore().getState()!
    const plain = forecastInput(live, { opening: [] })!
    const subverted = forecastInput(live, { opening: [], subvert: true })!
    expect(subverted.key).not.toBe(plain.key)
    clearForecastCache()
    const sv = container.querySelector('.war-enter .btn.gem') as HTMLButtonElement
    expect(sv?.textContent).toContain('Subvert')
    act(() => sv.click())
    // The sheet asked the crystal about the subversion itself.
    expect(cachedForecast(subverted)).toBeDefined()
    const sheet = container.querySelector('.enter-sheet')
    if (sheet) {
      expect(sheet.classList.contains('world')).toBe(false)
      expect(sheet.textContent).toContain(`gives this party ${cachedForecast(subverted)!.winPct}%`)
      click('Back')
    }
    expect(getStore().getState()!.tower.worldEnded).toBe(false)
  })

  it('the acts ahead stay sealed; seeded floors carry names; the Chronicle states the rule', () => {
    load(account(12))
    mount()
    toTower()
    expect(text()).toContain('Act II — The Ruins')
    expect(text()).toContain('Act III — ???')
    expect(text()).not.toContain('The Drowned Coast')
    expect(text()).not.toContain('Seeded floor')
    expect(text()).toMatch(/(Stair|Hall|Gallery|Landing|Vault|Causeway|Terrace|Cloister) of /)
    expect(text()).toContain('A Master who knows 7 of the tower’s truths before the ninetieth floor may refuse what it asks.')
  })
})
