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
import type { Command, GameState, HeroId, Nemesis } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { TowerScreen } from '../TowerScreen'
import type { PlaceId } from '../world/lobbyMap'
import { setPrefs, PREFS_KEY } from '../prefs'
import { ANCHORS } from '../../engine/content'
import { floorKindBase } from '../../engine/climb'
import { atFloor } from './fixtures'
import { DECISIVE_TUTORIAL_STEP, decisiveTutorialDue } from '../battle/decisive'
import { nemesisUnitId } from '../../engine/tower'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const battles: { mode?: string; hasOrders: boolean; tutorialPrompt?: boolean; nemesisIds?: string[] }[] = []
/** The orders hook of the battle on screen (to give an order mid-fight). */
let liveOrders: { give: (o: { tick: number; kind: 'retreat' }) => unknown } | undefined
/** The battle's props on screen (to report a rescue or the tutorial coaching). */
let liveBattle: { onSaved?: (id: string) => void; onTutorialShown?: () => void } | undefined
/**
 * A stand-in for BattleScene that keeps its contract without animating: it shows the
 * banner of the log it is playing (an order swaps the log, as the real one does), and a
 * clean tower win (orders given, no hero fallen) moves on by itself after VICTORY_AUTO_MS,
 * exactly like BattleScene. Anything else waits for Continue.
 */
vi.mock('../battle/BattleScene', async (importOriginal) => {
  const real = await importOriginal<typeof import('../battle/BattleScene')>()
  type P = Parameters<typeof real.BattleScene>[0]
  return {
    ...real,
    BattleScene: (p: P) => {
      const [log, setLog] = useState(p.log)
      battles.push({ mode: p.mode, hasOrders: p.orders !== undefined, tutorialPrompt: p.tutorialPrompt, nemesisIds: p.nemesisIds })
      liveBattle = p
      liveOrders = p.orders && {
        give: (o) => {
          const next = p.orders!.give(o)
          if (next) setLog(next)
          return next
        },
      }
      const win = log.outcome === 'win'
      const heroes = new Set(log.unitsInit.filter((u) => u.side === 'hero' && !u.isNpc).map((u) => u.id))
      const clean = win && !log.events.some((e) => e.kind === 'death' && heroes.has(e.unitId))
      useEffect(() => {
        if (!p.orders || !clean) return
        const tm = setTimeout(p.onDone, real.VICTORY_AUTO_MS)
        return () => clearTimeout(tm)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [clean])
      return (
        <div className="battle">
          <div className={`battle-banner ${win ? 'win' : 'lose'}`}>{win ? 'VICTORY' : 'DEFEAT'}</div>
          <button onClick={p.onDone}>Continue ▸</button>
        </div>
      )
    },
  }
})

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

function Harness({ store, onGo, onHome }: { store: Store; onGo?: (p: PlaceId) => void; onHome?: () => void }) {
  const [, bump] = useState(0)
  useEffect(() => store.subscribe(() => bump((n) => n + 1)), [store])
  return <TowerScreen state={store.getState()!} store={store} onGo={onGo} onHome={onHome} />
}

function mount(state: GameState, onGo?: (p: PlaceId) => void, onHome?: () => void) {
  const h = storeWith(state)
  act(() => root.render(<Harness store={h.store} onGo={onGo} onHome={onHome} />))
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
  // A Master past F3 has had the scripted Decisive Moment (S5), which is never swept.
  s = reduce(s, { type: 'GUIDE_STEP', step: DECISIVE_TUTORIAL_STEP })
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
    expect(battles.at(-1)).toMatchObject({ mode: 'full', hasOrders: true }) // F1 is a tutorial floor: never swept
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
    // A retreat is not a clean win: the battle waits for the Master.
    expect(text()).not.toContain('RETREATED')
    click('Continue')
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

  it('sends the results card\'s summon button to the summon screen', () => {
    const onGo = vi.fn()
    mount(createAccount(7), onGo) // a fresh Master holds 15,000 gold
    click('Enter')
    wait(1250)
    click('and summon') // the first clear opened a Sortie: "Bank +X and summon ▸"
    expect(onGo).toHaveBeenCalledWith('summon')
  })

  it('with a Sortie running, the summon button names the bank, and banks before it leaves the Tower', () => {
    let sentAtGo: string[] = []
    const s = atFloor(createAccount(7), { currentFloor: 1, highestCleared: 0, sortie: { startFloor: 1, floors: 0, purse: 200, boons: [] } })
    const onGo = vi.fn(() => {
      sentAtGo = h.sent.map((c) => c.type)
    })
    const h = mount(s, onGo)
    click('Enter')
    wait(1250)
    const purse = h.store.getState()!.tower.sortie!.purse
    expect(buttons().some((b) => b.textContent?.includes('Summon now'))).toBe(false)
    click(`Bank +${purse.toLocaleString()} and summon`)
    expect(onGo).toHaveBeenCalledWith('summon')
    expect(sentAtGo.at(-1)).toBe('RETURN_TO_CAMPUS')
  })
})

describe('TowerScreen — the battle wiring (S5, S18, S22)', () => {
  /** A party on a floor whose fight carries the scripted first Decisive Moment. */
  function tutorialFloor(): GameState {
    let s = createAccount(7)
    s = reduce(s, { type: 'SUMMON', count: 10 })
    const p = suggestParty(s)
    s = reduce(s, { type: 'SET_PARTY', slots: p.slots, lines: p.lines })
    for (let f = 3; f <= 30; f++) {
      const at: GameState = { ...s, tower: { ...s.tower, currentFloor: f, highestCleared: f - 1, kind: floorKindBase(f), doors: null, event: null } }
      if (decisiveTutorialDue(at, attemptFloorWithResult(at).result.result.log)) return at
    }
    throw new Error('no tutorial-due floor in F3-F30')
  }

  it('passes the scripted first Decisive Moment, and marks it seen only after the battle closes', () => {
    const { sent } = mount(tutorialFloor())
    click('Enter')
    expect(battles.at(-1)).toMatchObject({ tutorialPrompt: true, mode: 'full' })
    act(() => liveBattle!.onTutorialShown!())
    expect(sent.map((c) => c.type)).toEqual(['ATTEMPT_FLOOR'])
    click('Continue')
    expect(sent.at(-1)).toEqual({ type: 'GUIDE_STEP', step: DECISIVE_TUTORIAL_STEP })
  })

  it('never marks the tutorial seen when its coaching did not show', () => {
    const { sent } = mount(tutorialFloor())
    click('Enter')
    click('Continue')
    expect(sent.some((c) => c.type === 'GUIDE_STEP')).toBe(false)
  })

  it('a rescue reported by the battle becomes a "Because…" line', () => {
    const s = createAccount(7)
    const hero = s.party.slots.find((id) => id !== null)!
    mount(s)
    click('Enter')
    act(() => liveBattle!.onSaved!(hero))
    click('Continue')
    expect(text()).toContain(`Saved: your order pulled ${s.heroes[hero]!.name.split(' ')[0]} back from the edge.`)
  })

  it('tells the battle which units are Banes', () => {
    const base = atFloor(createAccount(12), { currentFloor: 6, highestCleared: 5, doors: null })
    const nem: Nemesis = {
      id: 'nem_h_x',
      templateId: 'goblin',
      name: 'Goblin',
      element: 'fire',
      level: 3,
      heroId: 'h_x' as HeroId,
      heroName: 'Mira Vey',
      diedFloor: 2,
      revengeFloor: 6,
      status: 'waiting',
    }
    mount({ ...base, life: { ...base.life, legacy: { ...base.life.legacy, nemeses: [nem] } } })
    click('Enter')
    expect(battles.at(-1)!.nemesisIds).toEqual([nemesisUnitId(nem)])
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

  it('a Cache door with a Sortie running offers to bank the purse and summon, and banks before it goes', () => {
    const cost = TUNING.gacha.normalCostGold
    let sentAtGo: string[] = []
    const onGo = vi.fn(() => {
      sentAtGo = h.sent.map((c) => c.type)
    })
    const base = atFloor(createAccount(12), {
      doors: [{ kind: 'path', reward: 'gold' }, { kind: 'cache', reward: 'stones' }],
      sortie: { startFloor: 3, floors: 2, purse: 450, boons: [] },
    })
    const h = mount({ ...base, gold: cost - 100 }, onGo)
    click('Cache')
    expect(text()).toContain('A summon is ready')
    click('Bank +450 and summon')
    expect(onGo).toHaveBeenCalledWith('summon')
    expect(sentAtGo.at(-1)).toBe('RETURN_TO_CAMPUS')
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

  it('Return to campus lands in the lobby itself when the App offers it', () => {
    const onGo = vi.fn()
    const onHome = vi.fn()
    const s = atFloor(createAccount(12), { sortie: { startFloor: 3, floors: 3, purse: 640, boons: [] } })
    const { sent } = mount(s, onGo, onHome)
    click('Return to campus (bank +640)')
    expect(sent).toContainEqual({ type: 'RETURN_TO_CAMPUS' })
    expect(onHome).toHaveBeenCalledTimes(1)
    expect(onGo).not.toHaveBeenCalled()
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
