// @vitest-environment jsdom
/**
 * Leaving the Tower for a summon while a Sortie runs (S15), with the REAL App and the
 * REAL engine. "A summon is ready" (after a Cache) and the results card's summon call to
 * action say they bank the purse, bank it, and open the summon screen in one click; the
 * "Leave the Tower?" confirm never lingers to pop up on a later Sortie.
 *
 * BattleScene is stood in by one that closes at once, so a floor fight reaches its
 * results card without animating.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { GameState, Sortie } from '../../engine/types'
import { TUNING } from '../../engine/tuning'

vi.mock('../battle/BattleScene', async (importOriginal) => {
  const real = await importOriginal<typeof import('../battle/BattleScene')>()
  type P = Parameters<typeof real.BattleScene>[0]
  return {
    ...real,
    BattleScene: (p: P) => {
      useEffect(() => {
        p.onDone()
      }, [])
      return <div className="battle-standin" />
    },
  }
})

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App } from '../App'
import { getStore } from '../useGame'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
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

const buttons = () => Array.from(container.querySelectorAll('button'))
function clickButton(label: string) {
  const btn = buttons().find((b) => b.textContent?.includes(label))
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
function tick(ms = 50) {
  act(() => {
    vi.advanceTimersByTime(ms)
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

const onTower = () => container.querySelector('.tower-screen') !== null
const onSummon = () => container.querySelector('.summon-pools') !== null
const confirmUp = () => (container.textContent ?? '').includes('Leave the Tower?')

const sortie: Sortie = { startFloor: 3, floors: 3, purse: 500, boons: ['warChest'] }

function cacheSave(seed: number) {
  loadSave(seed, (s) => ({
    ...s,
    gold: TUNING.gacha.normalCostGold - 1,
    tower: {
      ...s.tower,
      currentFloor: 6,
      highestCleared: 5,
      event: null,
      kind: 'path',
      sortie,
      doors: [
        { kind: 'cache', reward: 'stones' },
        { kind: 'path', reward: 'gold' },
      ],
    },
  }))
}

describe('Summon from the Tower while a Sortie runs', () => {
  it('after a Cache: the button names the bank, banks it, and opens the summon screen', () => {
    cacheSave(41)
    openPlace('Tower Gate')
    clickButton('Cache')
    const afterCache = getStore().getState()!
    expect(afterCache.tower.sortie).not.toBeNull()
    expect(afterCache.gold).toBeGreaterThanOrEqual(TUNING.gacha.normalCostGold)
    const purse = afterCache.tower.sortie!.purse
    const cta = buttons().find((b) => b.classList.contains('summon-cta'))!
    expect(cta.textContent).toContain(`Bank +${purse.toLocaleString()} and summon`)
    expect(container.textContent).toContain('A summon is ready')

    clickButton(`Bank +${purse.toLocaleString()} and summon`)
    const after = getStore().getState()!
    expect(after.tower.sortie).toBeNull()
    expect(after.gold).toBe(afterCache.gold + purse)
    expect(onSummon()).toBe(true)
    expect(onTower()).toBe(false)
    expect(confirmUp()).toBe(false)

    // Back to the Tower for a new climb: no stray "Leave the Tower?" pops up.
    tick()
    openPlace('Tower Gate')
    expect(onTower()).toBe(true)
    clickButton('Enter')
    tick()
    expect(getStore().getState()!.tower.sortie).not.toBeNull()
    expect(confirmUp()).toBe(false)
  })

  it('on the results card: "Bank +X and summon" banks and opens the summon screen', () => {
    loadSave(7, (s) => ({
      ...s,
      tower: { ...s.tower, currentFloor: 1, highestCleared: 0, event: null, kind: 'path', doors: null, sortie: { startFloor: 1, floors: 0, purse: 200, boons: [] } },
    }))
    expect(getStore().getState()!.gold).toBeGreaterThanOrEqual(TUNING.gacha.normalCostGold)
    openPlace('Tower Gate')
    clickButton('Enter')
    tick(1500)
    const live = getStore().getState()!.tower.sortie
    expect(live).not.toBeNull()
    const cta = buttons().find((b) => b.classList.contains('summon-cta'))
    expect(cta, container.textContent ?? '').toBeTruthy()
    expect(cta!.textContent).toContain(`Bank +${live!.purse.toLocaleString()} and summon`)
    const goldBefore = getStore().getState()!.gold

    act(() => cta!.click())
    const after = getStore().getState()!
    expect(after.tower.sortie).toBeNull()
    expect(after.gold).toBe(goldBefore + live!.purse)
    expect(onSummon()).toBe(true)
    expect(confirmUp()).toBe(false)

    tick()
    openPlace('Tower Gate')
    clickButton('Enter')
    tick()
    expect(getStore().getState()!.tower.sortie).not.toBeNull()
    expect(confirmUp()).toBe(false)
  })

  it('a pending "Leave the Tower?" is dropped once its Sortie ends some other way', () => {
    cacheSave(42)
    openPlace('Tower Gate')
    openPlace('Dormitory') // asks first: a Sortie is running
    expect(confirmUp()).toBe(true)
    expect(onTower()).toBe(true)
    act(() => {
      getStore().dispatch({ type: 'RETURN_TO_CAMPUS' })
    })
    expect(confirmUp()).toBe(false)
    act(() => {
      getStore().dispatch({ type: 'CHOOSE_DOOR', index: 1 })
    })
    act(() => {
      getStore().dispatch({ type: 'ATTEMPT_FLOOR' })
    })
    expect(getStore().getState()!.tower.sortie).not.toBeNull()
    expect(confirmUp()).toBe(false)
  })
})
