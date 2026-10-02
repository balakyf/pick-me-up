// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import { buildEncounter } from '../../engine/tower'
import { freeProtects } from '../../engine/tactical'
import type { FocusDirective, GameState, HeroId } from '../../engine/types'
import { setLocale } from '../i18n/i18n'
import { PreBattleOrders, bigMoves, markable } from './PreBattleOrders'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Lane G: the war room's free pre-battle levers — a mark, free Protects — and the floor's big moves. */

function account(floor: number): GameState {
  let s = { ...createAccount(77, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  const ids = (Object.keys(s.heroes) as HeroId[]).slice(0, 5)
  return { ...s, party: { slots: ids, lines: ['front', 'front', 'mid', 'back', 'back'] }, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1 } }
}

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  setLocale('en')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

let seen: FocusDirective | undefined
function Host({ state }: { state: GameState }) {
  const [d, setD] = useState<FocusDirective | undefined>(undefined)
  seen = d
  return <PreBattleOrders state={state} encounter={buildEncounter(state, state.tower.currentFloor)} directive={d} onChange={setD} />
}

describe('before the fight', () => {
  it('names the floor’s big moves and its phases (F20: the breath, and the flight at half)', () => {
    const s = account(20)
    const notes = bigMoves(buildEncounter(s, 20))
    const dragon = notes.find((n) => n.name === 'Halgiraf')!
    expect(dragon.moves).toContain('e_dragon_breath')
    expect(dragon.phases).toEqual([{ atHpPct: 50, title: 'Takes flight' }])
    act(() => root.render(<Host state={s} />))
    expect(dragon.moves).toContain('e_sky_dive') // taught by his flight
    expect(container.textContent).toContain('Halgiraf winds up Dragon Breath, Sky Dive — Guard answers it.')
    expect(container.textContent).toContain('Changes once: at 50% — Takes flight.')
  })

  it('marks one foe (free) and protects up to the Tactical Center’s slots', () => {
    const s = account(20)
    act(() => root.render(<Host state={s} />))
    const select = container.querySelector('select')!
    const foe = markable(buildEncounter(s, 20)).at(-1)!
    act(() => {
      select.value = foe.unitId
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(seen?.focusEnemyId).toBe(foe.unitId)
    const chips = Array.from(container.querySelectorAll('.pb-chip')) as HTMLButtonElement[]
    expect(chips.length).toBe(5)
    const slots = freeProtects(s.facilities.tacticalCenter.level)
    for (const c of chips) act(() => c.click())
    expect(seen?.overlookedAllyIds?.length).toBe(slots)
    // The rest wait: their chips are out of reach until one is freed.
    expect(chips.filter((c) => c.disabled).length).toBe(5 - slots)
    act(() => chips[0]!.click())
    expect(seen?.overlookedAllyIds?.length).toBe(slots - 1)
    expect(container.textContent).toContain(`${slots - 1}/${slots} free`)
  })
})
