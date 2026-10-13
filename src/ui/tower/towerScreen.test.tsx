// @vitest-environment jsdom
/**
 * The Tower screen's floor-to-floor rhythm (spec 2026-10-12 S6, S11, S13-S15; WP4).
 * BattleScene (WP2) is replaced by a stand-in that shows its VICTORY banner at once and
 * records the props it was given, so these tests drive the real engine and the real
 * TowerScreen without animating a battle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount, DEFAULT_SAVE_KEY, MemoryStorage, saveState } from '../../engine/account'
import { attemptFloorWithResult, createStore, reduce, type Store } from '../../engine/store'
import { scoutFloor, suggestParty } from '../../engine/scout'
import type { Command, GameState } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { TowerScreen } from '../TowerScreen'
import type { PlaceId } from '../world/lobbyMap'
import { setPrefs, PREFS_KEY } from '../prefs'
import { ANCHORS } from '../../engine/content'
import { floorKindBase } from '../../engine/climb'
import { atFloor } from './fixtures'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const battles: { mode?: string; hasOrders: boolean }[] = []
/** The orders hook of the battle on screen (to give an order mid-fight). */
let liveOrders: { give: (o: { tick: number; kind: 'retreat' }) => unknown } | undefined
vi.mock('../battle/BattleScene', () => ({
  BattleScene: (p: { onDone: () => void; mode?: string; orders?: typeof liveOrders; log: { outcome: string } }) => {
    battles.push({ mode: p.mode, hasOrders: p.orders !== undefined })
    liveOrders = p.orders
    const win = p.log.outcome === 'win'
    return (
      <div className="battle">
        <div className={`battle-banner ${win ? 'win' : 'lose'}`}>{win ? 'VICTORY' : 'DEFEAT'}</div>
        <button onClick={p.onDone}>Continue ▸</button>
      </div>
    )
  },
}))

// The climb engine (WP3) lands in parallel. Until it does, `chooseDoor` throws "not built
// yet"; only then does this stand in a minimal choice (a Cache pays and advances, as the
// spec says). Once WP3 lands, the real `chooseDoor` runs and the stand-in is inert.
vi.mock('../../engine/climb/doors', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../engine/climb/doors')>()
  const { TUNING: T } = await import('../../engine/tuning')
  return {
    ...real,
    chooseDoor: (state: GameState, index: number, nowWorld?: number): GameState => {
      try {
        return real.chooseDoor(state, index, nowWorld)
      } catch (e) {
        if (!(e instanceof Error) || !/not built yet/.test(e.message)) throw e
        const door = state.tower.doors?.[index]
        if (!door) throw new Error('chooseDoor: no such door')
        if (door.kind !== 'cache') return { ...state, tower: { ...state.tower, kind: door.kind, doors: null } }
        const f = state.tower.currentFloor
        return {
          ...state,
          gold: state.gold + T.climb.reward.cacheGoldPerFloor * f,
          materials: { ...state.materials, promotionStone: (state.materials.promotionStone ?? 0) + T.climb.reward.cacheStones },
          tower: { ...state.tower, currentFloor: f + 1, highestCleared: Math.max(state.tower.highestCleared, f), doors: null },
        }
      }
    },
  }
})

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  battles.length = 0
  try {
    window.localStorage.removeItem(PREFS_KEY)
  } catch {
    /* ignore */
  }
  setPrefs({ autoSweep: true })
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

const text = () => container.textContent ?? ''
const buttons = () => Array.from(container.querySelectorAll('button'))
const button = (label: string) => {
  const b = buttons().find((x) => x.textContent?.includes(label))
  if (!b) throw new Error(`no button "${label}" in: ${text()}`)
  return b
}
const click = (label: string) => act(() => button(label).click())
/** Close the results card, whichever way it offers (a Sortie running asks "Press on"). */
const closeResults = () => {
  const b = buttons().find((x) => /Onward|Press on|Regroup/.test(x.textContent ?? ''))
  if (!b) throw new Error(`no way to close the results in: ${text()}`)
  act(() => b.click())
}
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

/** A store holding `state`, and a log of every command dispatched through it. */
function storeWith(state: GameState): { store: Store; sent: Command[] } {
  const storage = new MemoryStorage()
  storage.write(DEFAULT_SAVE_KEY, saveState(state))
  const store = createStore({ storage })
  store.load()
  const sent: Command[] = []
  const dispatch = store.dispatch.bind(store)
  store.dispatch = (cmd, now) => {
    sent.push(cmd)
    return dispatch(cmd, now)
  }
  return { store, sent }
}

function Harness({ store, onGo }: { store: Store; onGo?: (p: PlaceId) => void }) {
  const [, bump] = useState(0)
  useEffect(() => store.subscribe(() => bump((n) => n + 1)), [store])
  return <TowerScreen state={store.getState()!} store={store} onGo={onGo} />
}

function mount(state: GameState, onGo?: (p: PlaceId) => void) {
  const h = storeWith(state)
  act(() => root.render(<Harness store={h.store} onGo={onGo} />))
  return h
}

/**
 * A strong roster standing on a Sweep-eligible floor (from F3, no guardian) that it wins
 * with nobody lost. The floor is searched rather than fixed, so the test holds whatever
 * budget the climb engine (WP3) gives each floor.
 */
function strongOnSafeFloor(seed: number): GameState {
  let s = createAccount(seed)
  s = reduce(s, { type: 'ADD_GOLD', amount: 300_000 })
  for (let i = 0; i < 6; i++) s = reduce(s, { type: 'SUMMON', count: 10 })
  const p = suggestParty(s)
  s = reduce(s, { type: 'SET_PARTY', slots: p.slots, lines: p.lines })
  // A Path floor that scouts Safe, else the Breather after a guardian (Sweep-eligible
  // whatever its rating; the climb engine sets its budget low).
  for (const kind of ['path', 'breather'] as const) {
    for (let f = 3; f <= 14; f++) {
      if (ANCHORS[f] || floorKindBase(f) !== 'path') continue
      if (kind === 'breather' && floorKindBase(f - 1) !== 'boss') continue
      const at: GameState = { ...s, tower: { ...s.tower, currentFloor: f, highestCleared: f - 1, kind, doors: null, event: null } }
      if (kind === 'path' && scoutFloor(at)?.threat !== 'safe') continue
      const { result } = attemptFloorWithResult(at)
      if (result.cleared && result.fallenHeroIds.length === 0) return at
    }
  }
  throw new Error('no Sweep-eligible floor won clean in F3-F14 for this roster')
}

describe('TowerScreen — floor to floor', () => {
  it('VICTORY auto-advances to the results, which count up to what the floor paid', () => {
    const s = createAccount(7)
    const { result } = attemptFloorWithResult(s)
    const { store } = mount(s)
    click('Enter')
    expect(battles.at(-1)).toEqual({ mode: 'full', hasOrders: true }) // F1 is a tutorial floor: never swept
    expect(text()).not.toContain('FLOOR CLEARED')
    wait(1250)
    expect(text()).toContain('FLOOR CLEARED')
    wait(5000)
    const paid = store.getState()!.gold - s.gold
    expect(paid).toBe(result.goldAwarded + (result.restedBonus ?? 0))
    expect(container.querySelector('.reward-row .r .n')!.textContent!.startsWith(`+${paid.toLocaleString()}`)).toBe(true)
    closeResults()
    expect(text()).not.toContain('FLOOR CLEARED')
  })

  it('sweeps a Safe floor won with nobody lost, and offers the full replay', () => {
    const s = strongOnSafeFloor(31)
    const { result } = attemptFloorWithResult(s)
    expect(result.cleared && result.fallenHeroIds.length === 0).toBe(true)
    mount(s)
    click('Enter')
    expect(battles.at(-1)!.mode).toBe('highlights')
    wait(1250)
    expect(text()).toContain('Swept: an easy floor, nobody lost.')
    click('Watch full replay')
    expect(battles.at(-1)!.mode).toBe('full')
    expect(text()).not.toContain('Swept:')
    click('Continue')
    expect(text()).toContain('Swept: an easy floor, nobody lost.')
  })

  it('drops the Sweep claim when an order mid-highlight changed the outcome', () => {
    const s = strongOnSafeFloor(31)
    mount(s)
    click('Enter')
    expect(battles.at(-1)!.mode).toBe('highlights')
    act(() => {
      liveOrders!.give({ tick: 1, kind: 'retreat' })
    })
    wait(1250)
    expect(text()).toContain('RETREATED')
    expect(text()).not.toContain('Swept')
  })

  it('plays the floor in full when the player turned Sweep off', () => {
    const s = strongOnSafeFloor(31)
    mount(s)
    click('Sweep easy floors: on')
    expect(text()).toContain('Sweep easy floors: off')
    click('Enter')
    expect(battles.at(-1)!.mode).toBe('full')
  })

  it('sends "Summon now!" to the summon screen', () => {
    const onGo = vi.fn()
    mount(createAccount(7), onGo) // a fresh Master holds 15,000 gold
    click('Enter')
    wait(1250)
    click('Summon now')
    expect(onGo).toHaveBeenCalledWith('summon')
  })

  it('banks a running Sortie before "Summon now" leaves the Tower', () => {
    let sentAtGo: string[] = []
    const s = atFloor(createAccount(7), { currentFloor: 1, highestCleared: 0, sortie: { startFloor: 1, floors: 0, purse: 200, boons: [] } })
    const onGo = vi.fn(() => {
      sentAtGo = h.sent.map((c) => c.type)
    })
    const h = mount(s, onGo)
    click('Enter')
    wait(1250)
    expect(text()).toContain('(banks the purse)')
    click('Summon now')
    expect(onGo).toHaveBeenCalledWith('summon')
    expect(sentAtGo.at(-1)).toBe('RETURN_TO_CAMPUS')
  })
})

describe('TowerScreen — Doors, Boons and the Sortie', () => {
  const doors = [
    { kind: 'path' as const, reward: 'gold' as const },
    { kind: 'elite' as const, reward: 'boon' as const },
  ]

  it('shows the Door picker instead of the scout card, with Enter still ready', () => {
    const { sent } = mount(atFloor(createAccount(12), { doors }))
    expect(text()).toContain('Choose the next door')
    expect(container.querySelector('.scout')).toBeNull()
    expect((button('Enter') as HTMLButtonElement).disabled).toBe(false)
    click('Skull')
    expect(sent).toContainEqual({ type: 'CHOOSE_DOOR', index: 1 })
  })

  it('a Cache door says what it paid, and offers the summon it just paid for', () => {
    const cost = TUNING.gacha.normalCostGold
    const onGo = vi.fn()
    const base = atFloor(createAccount(12), { doors: [{ kind: 'path', reward: 'gold' }, { kind: 'cache', reward: 'stones' }] })
    const { sent } = mount({ ...base, gold: cost - 100 }, onGo)
    click('Cache')
    expect(sent).toContainEqual({ type: 'CHOOSE_DOOR', index: 1 })
    expect(text()).toContain('A cache, unguarded.')
    expect(text()).toContain('+1 Promotion Stone')
    click('A summon is ready')
    expect(onGo).toHaveBeenCalledWith('summon')
  })

  it('a Cache door that leaves a summon out of reach offers nothing more', () => {
    const onGo = vi.fn()
    const base = atFloor(createAccount(12), { doors: [{ kind: 'path', reward: 'gold' }, { kind: 'cache', reward: 'stones' }] })
    mount({ ...base, gold: 0 }, onGo)
    click('Cache')
    expect(text()).toContain('A cache, unguarded.')
    expect(buttons().some((b) => b.textContent?.includes('A summon is ready'))).toBe(false)
  })

  it('shows the Boon picker for an open Boon event, and Enter waits for it', () => {
    const s = atFloor(createAccount(12), { event: { kind: 'boon', floor: 5, options: ['ironVow', 'volley', 'warChest'] } })
    const { sent } = mount(s)
    expect(container.querySelectorAll('.boon-option')).toHaveLength(3)
    expect((button('Enter') as HTMLButtonElement).disabled).toBe(true)
    click('Volley')
    expect(sent).toContainEqual({ type: 'RESOLVE_EVENT', option: 'volley' })
  })

  it('shows the Sortie bar; Return to campus banks it and walks home', () => {
    const onGo = vi.fn()
    const s = atFloor(createAccount(12), { sortie: { startFloor: 3, floors: 3, purse: 640, boons: ['volley'] } })
    const { sent } = mount(s, onGo)
    expect(text()).toContain('◆ 640')
    click('Return to campus (bank +640)')
    expect(sent).toContainEqual({ type: 'RETURN_TO_CAMPUS' })
    expect(onGo).toHaveBeenCalledWith('fairy')
  })

  it('banks a running Sortie when the Tower view closes', () => {
    const s = atFloor(createAccount(12), { sortie: { startFloor: 3, floors: 1, purse: 90, boons: [] } })
    const { sent } = mount(s)
    act(() => root.render(<div />))
    expect(sent).not.toContainEqual({ type: 'RETURN_TO_CAMPUS' })
    wait(10)
    expect(sent).toContainEqual({ type: 'RETURN_TO_CAMPUS' })
  })

  it('does not dispatch anything between the attempt and the end of the battle', () => {
    const { sent } = mount(atFloor(createAccount(7), { currentFloor: 1, highestCleared: 0 }))
    click('Enter')
    expect(sent.map((c) => c.type)).toEqual(['ATTEMPT_FLOOR'])
    wait(1000)
    expect(sent.map((c) => c.type)).toEqual(['ATTEMPT_FLOOR'])
  })
})
