// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { CombatEvent, CombatLog, GameState } from '../../engine/types'
import { BattleScene, DECISIVE_KEY_GRACE_MS, VICTORY_AUTO_MS } from './BattleScene'
import { findDangerMoment, findDecisive } from './decisive'
import { highlightPlan, HIGHLIGHT_BUDGET_MS } from './fx'
import {
  SEEDS,
  atFloor,
  costlyWin,
  deadlyFight,
  floorLog,
  ordersFor,
  partyDeaths,
  partyIdsOf,
  protectHolds,
  rearmFight,
  retreatSaves,
  twoRescues,
  wipeFight,
  type EventSpec,
} from './__fixtures__/logs'
import { PREFS_KEY } from '../prefs'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

const text = () => container.textContent ?? ''
const q = (sel: string) => container.querySelector(sel)
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(label))

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}
/** Advance fake time in small steps until `done()`; returns the ms it took. */
function until(done: () => boolean, maxMs = 300_000, step = 20): number {
  let t = 0
  while (!done()) {
    if (t > maxMs) throw new Error(`timed out after ${maxMs} ms: ${text().slice(0, 200)}`)
    advance(step)
    t += step
  }
  return t
}
function click(el: Element | null | undefined) {
  expect(el).toBeTruthy()
  act(() => (el as HTMLElement).click())
}
function key(k: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  })
}

/** A win in which no hero dies (seed 7 reliably clears the low floors). */
function quietWin(): { seed: number; floor: number; log: CombatLog } {
  for (const seed of SEEDS)
    for (let floor = 1; floor <= 9; floor++) {
      const log = floorLog(seed, floor)
      if (log.outcome === 'win' && highlightPlan(log) !== null) return { seed, floor, log }
    }
  throw new Error('no quiet win in the fixtures')
}

describe('BattleScene', () => {
  it('replays a fixture log at 8× to the end and calls onDone once on Continue', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { log } = quietWin()
    const onDone = vi.fn()
    act(() => root.render(<BattleScene log={log} state={null} onDone={onDone} />))
    expect(button('8×')!.className).toContain('on')
    expect(q('.orders-dock')).toBeTruthy()
    expect(q('.decisive-card')).toBeNull()
    const took = until(() => !!button('Continue ▸'))
    expect(took).toBeLessThan(15_000)
    expect(text()).toContain('VICTORY')
    // A replay (no orders) waits for the Master.
    advance(VICTORY_AUTO_MS * 3)
    expect(onDone).not.toHaveBeenCalled()
    click(button('Continue ▸'))
    key('Enter')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('starts at the 2× default; number keys change speed and remember it; Space pauses', () => {
    const { log } = quietWin()
    act(() => root.render(<BattleScene log={log} state={null} onDone={() => {}} />))
    expect(button('2×')!.className).toContain('on')
    key('4')
    expect(button('8×')!.className).toContain('on')
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).battleSpeed).toBe(8)
    key(' ')
    expect(button('▶ Play')).toBeTruthy()
    const caption = q('.battle-caption')!.textContent
    advance(5_000)
    expect(q('.battle-caption')!.textContent).toBe(caption)
    key(' ')
    expect(button('❚❚ Pause')).toBeTruthy()
  })

  it('owns the keyboard while it is up: no key reaches the lobby behind it', () => {
    const { log } = quietWin()
    const behind = vi.fn()
    window.addEventListener('keydown', behind)
    try {
      act(() => root.render(<BattleScene log={log} state={null} onDone={() => {}} />))
      for (const k of ['e', 'w', 'ArrowLeft', 'Escape', ' ']) key(k)
      expect(behind).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', behind)
    }
  })

  it('a won tower fight moves on to the results by itself', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { seed, floor, log } = quietWin()
    const onDone = vi.fn()
    act(() => root.render(<BattleScene log={log} state={null} onDone={onDone} orders={ordersFor(atFloor(seed, floor))} />))
    until(() => onDone.mock.calls.length > 0)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('a clean win waits while the effects panel is open, then moves on once it closes', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { seed, floor, log } = quietWin()
    const onDone = vi.fn()
    act(() => root.render(<BattleScene log={log} state={null} onDone={onDone} orders={ordersFor(atFloor(seed, floor))} />))
    click(q('.fx-prefs-toggle'))
    until(() => !!button('Continue ▸'))
    advance(VICTORY_AUTO_MS * 3)
    expect(onDone).not.toHaveBeenCalled()
    click(q('.fx-prefs-toggle'))
    advance(VICTORY_AUTO_MS + 50)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('a win that cost a hero waits for the Master instead of moving on', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { pre, log } = costlyWin()
    expect(log.outcome).toBe('win')
    expect(partyDeaths(log)).toBeGreaterThan(0)
    const onDone = vi.fn()
    act(() => root.render(<BattleScene log={log} state={pre} onDone={onDone} orders={ordersFor(pre)} />))
    until(() => {
      if (q('.decisive-card')) click(button('Let fate decide'))
      return !!button('Continue ▸')
    })
    expect(q('.grave-marker')).toBeTruthy()
    advance(VICTORY_AUTO_MS * 3)
    expect(onDone).not.toHaveBeenCalled()
    click(button('Continue ▸'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('the Decisive Moment pauses before a hero’s fatal tick, and Protect re-resolves through orders.give', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { pre, log } = deadlyFight()
    const d = findDecisive(log, partyIdsOf(log))!
    expect(d).not.toBeNull()
    const orders = ordersFor(pre)
    const giveSpy = vi.spyOn(orders, 'give')
    const onSaved = vi.fn()
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={orders} onSaved={onSaved} />))
    until(() => !!q('.decisive-card'))
    expect(text()).toContain('is about to fall!')
    expect(button('Let fate decide')).toBeTruthy()
    expect(button('Retreat')).toBeTruthy()
    expect(q('.decisive-card .protect')).toBeTruthy()
    // Time has stopped: nothing advances while the Master decides.
    const caption = q('.battle-caption')!.textContent
    advance(10_000)
    expect(q('.battle-caption')!.textContent).toBe(caption)
    expect(q('.dock-hero.doomed')).toBeTruthy()
    click(q('.decisive-card .protect'))
    expect(giveSpy).toHaveBeenCalledTimes(1)
    expect(giveSpy.mock.calls[0]![0]).toEqual({ tick: d.orderTick, kind: 'protect', allyId: d.heroId })
    expect(q('.decisive-card')).toBeNull()
    // Play on to the end (a second, different hero may be offered once more: let fate decide).
    until(() => {
      if (q('.decisive-card')) click(button('Let fate decide'))
      return !!button('Continue ▸')
    })
    expect(orders.given).toEqual([{ tick: d.orderTick, kind: 'protect', allyId: d.heroId }])
  })

  it('Retreat at the Decisive Moment (key R) saves the hero: a "Saved!" callout and onSaved', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { pre, log } = retreatSaves()
    const d = findDecisive(log, partyIdsOf(log))!
    expect(d).not.toBeNull()
    const orders = ordersFor(pre)
    const onSaved = vi.fn()
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={orders} onSaved={onSaved} />))
    until(() => !!q('.decisive-card'))
    advance(DECISIVE_KEY_GRACE_MS)
    key('r')
    expect(orders.given).toEqual([{ tick: d.orderTick, kind: 'retreat' }])
    until(() => onSaved.mock.calls.length > 0)
    expect(onSaved).toHaveBeenCalledWith(d.heroId)
    expect(q('.saved-callout')?.textContent).toBe('Saved!')
    until(() => !!button('Continue ▸'))
    expect(text()).toContain('RETREAT')
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('Protect that holds plays "Saved!" and the fight is won', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { pre, log } = protectHolds()
    expect(log.outcome).toBe('win')
    const d = findDecisive(log, partyIdsOf(log))!
    expect(d).not.toBeNull()
    const orders = ordersFor(pre)
    const onSaved = vi.fn()
    const onDone = vi.fn()
    act(() => root.render(<BattleScene log={log} state={pre} onDone={onDone} orders={orders} onSaved={onSaved} />))
    until(() => !!q('.decisive-card'))
    advance(DECISIVE_KEY_GRACE_MS)
    key('p')
    expect(orders.given).toEqual([{ tick: d.orderTick, kind: 'protect', allyId: d.heroId }])
    until(() => onSaved.mock.calls.length > 0)
    expect(onSaved).toHaveBeenCalledWith(d.heroId)
    expect(q('.saved-callout')).toBeTruthy()
    until(() => onDone.mock.calls.length > 0)
    expect(q('.grave-marker')).toBeNull() // nobody fell
  })

  it('re-arms once for a different hero after an order, and never offers a third moment', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { pre, log } = rearmFight()
    const first = findDecisive(log, partyIdsOf(log))!
    expect(first).not.toBeNull()
    const orders = ordersFor(pre)
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={orders} />))
    const doomed: string[] = []
    until(() => {
      const card = q('.decisive-card')
      if (card) {
        doomed.push(q('.dock-hero.doomed .dock-name')!.textContent!)
        if (doomed.length === 2) {
          expect(q('.decisive-card .protect')).toBeNull() // no orders left: Retreat or fate
          expect(button('Retreat')).toBeTruthy()
        }
        // Protect on the first, then let fate decide.
        click(doomed.length === 1 ? q('.decisive-card .protect') : button('Let fate decide'))
      }
      return !!button('Continue ▸') || orders.given.length > 2
    })
    expect(orders.given[0]).toEqual({ tick: first.orderTick, kind: 'protect', allyId: first.heroId })
    expect(doomed).toHaveLength(2)
    expect(doomed[0]).not.toBe(doomed[1])
    // The one order was spent: the second moment offers only Retreat or fate.
    expect(orders.given).toHaveLength(1)
  })

  it('"Let fate decide" is final: no second moment in the same fight', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { pre, log } = wipeFight()
    expect(log.events.filter((e) => e.kind === 'death' && partyIdsOf(log).includes(e.unitId)).length).toBeGreaterThan(1)
    const orders = ordersFor(pre)
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={orders} />))
    let cards = 0
    until(() => {
      if (q('.decisive-card')) {
        cards++
        click(button('Let fate decide'))
      }
      return !!button('Continue ▸')
    })
    expect(cards).toBe(1)
    expect(orders.given).toEqual([])
    expect(text()).toContain('DEFEAT')
  })

  it('the effects panel sets screen shake and reduced motion (remembered in prefs)', () => {
    const { log } = quietWin()
    act(() => root.render(<BattleScene log={log} state={null} onDone={() => {}} />))
    expect(q('.battle.calm')).toBeNull()
    click(q('.fx-prefs-toggle'))
    const slider = q('.fx-prefs input[type="range"]') as HTMLInputElement
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(slider, '0.5')
      slider.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).shake).toBe(0.5)
    click(q('.fx-prefs input[type="checkbox"]'))
    expect(q('.battle.calm')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).reducedMotion).toBe(true)
    expect((q('.fx-prefs input[type="range"]') as HTMLInputElement).disabled).toBe(true)
  })

  it('Skip stops at an unmade decision instead of jumping past it', () => {
    const { pre, log } = deadlyFight(SEEDS[2])
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={ordersFor(pre)} />))
    advance(50)
    key('s')
    expect(q('.decisive-card')).toBeTruthy()
  })

  it('never offers a Decisive Moment without orders (replays, PvP), but keeps the death hold and graves', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { log } = wipeFight()
    let sawCard = false
    let sawGrave = false
    act(() => root.render(<BattleScene log={log} state={null} onDone={() => {}} />))
    until(() => {
      sawCard ||= !!q('.decisive-card')
      sawGrave ||= !!q('.grave-marker')
      return !!button('Continue ▸')
    })
    expect(sawCard).toBe(false)
    expect(sawGrave).toBe(true)
    expect(text()).toContain('DEFEAT')
  })

  it('the scripted first Decisive Moment coaches, even in a fight nobody would lose (S5)', () => {
    let found: { seed: number; log: CombatLog } | null = null
    for (const seed of SEEDS) {
      const log = floorLog(seed, 3)
      if (!findDecisive(log, partyIdsOf(log)) && findDangerMoment(log, partyIdsOf(log))) {
        found = { seed, log }
        break
      }
    }
    expect(found).not.toBeNull()
    const pre = atFloor(found!.seed, 3)
    const shown = vi.fn()
    act(() =>
      root.render(<BattleScene log={found!.log} state={pre} onDone={() => {}} orders={ordersFor(pre)} tutorialPrompt onTutorialShown={shown} />),
    )
    until(() => !!q('.decisive-card'))
    expect(text()).toContain('Your orders change fate. Try Protect.')
    expect(shown).toHaveBeenCalledTimes(1)
    expect(text()).toContain('is in danger!')
    expect(q('.decisive-card .protect.coach')).toBeTruthy()
    click(button('Let fate decide'))
    expect(q('.decisive-card')).toBeNull()
    expect(shown).toHaveBeenCalledTimes(1)
  })

  it('the coaching is not reported shown when the card cannot offer Protect (no orders left)', () => {
    const { pre, log } = deadlyFight()
    const shown = vi.fn()
    const spent = { ...ordersFor(pre), left: 0 }
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={spent} tutorialPrompt onTutorialShown={shown} />))
    until(() => !!q('.decisive-card'))
    expect(text()).not.toContain('Your orders change fate. Try Protect.')
    expect(shown).not.toHaveBeenCalled()
  })

  it('a portrait tap gives the Protect order; a foe tap gives Focus (one order on a fresh account)', () => {
    const { seed, floor, log } = quietWin()
    const pre = atFloor(seed, floor)
    const orders = ordersFor(pre)
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={orders} />))
    until(() => !!q('.bunit.enemy'))
    advance(200)
    const portrait = q('button.dock-hero')
    click(portrait)
    expect(orders.given).toHaveLength(1)
    expect(orders.given[0]!.kind).toBe('protect')
    // That was the only order: the dock and the foes are no longer tappable.
    expect(q('button.dock-hero')).toBeNull()
    expect(q('.bunit.enemy.tappable')).toBeNull()
    expect(text()).toContain('0 orders')
  })

  it('highlights mode plays a ≤2.5 s reel then calls onDone; "Watch full replay" switches to the full fight', () => {
    const { log } = quietWin()
    const onDone = vi.fn()
    act(() => root.render(<BattleScene log={log} state={null} onDone={onDone} mode="highlights" />))
    expect(button('Watch full replay ▸')).toBeTruthy()
    const took = until(() => onDone.mock.calls.length > 0)
    expect(took).toBeLessThanOrEqual(HIGHLIGHT_BUDGET_MS + 40)
    act(() => root.unmount())
    root = createRoot(container)
    const onDone2 = vi.fn()
    act(() => root.render(<BattleScene log={log} state={null} onDone={onDone2} mode="highlights" />))
    click(button('Watch full replay ▸'))
    advance(HIGHLIGHT_BUDGET_MS * 2)
    expect(onDone2).not.toHaveBeenCalled()
    expect(button('Watch full replay ▸')).toBeFalsy()
    expect(button('2×')).toBeTruthy()
  })

  it('the scripted tutorial fight is never swept (the coaching needs the whole fight)', () => {
    const { seed, floor, log } = quietWin()
    const pre = atFloor(seed, floor)
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={ordersFor(pre)} mode="highlights" tutorialPrompt />))
    expect(button('Watch full replay ▸')).toBeFalsy()
    expect(button('2×')).toBeTruthy()
  })

  it('a log with a hero death is never swept, even when highlights are asked for', () => {
    const { log } = deadlyFight()
    expect(partyDeaths(log)).toBeGreaterThan(0)
    act(() => root.render(<BattleScene log={log} state={null} onDone={() => {}} mode="highlights" />))
    expect(button('Watch full replay ▸')).toBeFalsy()
    expect(button('2×')).toBeTruthy()
  })

  // ── Review additions ──────────────────────────────────────────────────────
  /** A Tactical Center at level 4: three Focus/Protect orders a battle. */
  function withOrders(pre: GameState): GameState {
    return { ...pre, facilities: { ...pre.facilities, tacticalCenter: { ...pre.facilities.tacticalCenter, level: 4 } } }
  }

  it('never spends a second order on a hero who is already protected (stage tap after a portrait tap)', () => {
    const { seed, floor, log } = quietWin()
    const pre = withOrders(atFloor(seed, floor))
    const orders = ordersFor(pre)
    expect(orders.left).toBe(3)
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={orders} />))
    until(() => !!q('.bunit.enemy'))
    advance(200)
    const portrait = q('button.dock-hero')!
    const name = portrait.querySelector('.dock-name')!.textContent!
    click(portrait)
    expect(orders.given).toHaveLength(1)
    const heroId = (orders.given[0] as { allyId: string }).allyId
    const fullName = log.unitsInit.find((u) => u.id === heroId)!.name
    expect(fullName.startsWith(name)).toBe(true)
    // Same frame, a tap on that hero's sprite: no second Protect.
    click(q(`.bunit[data-unit="${heroId}"]`))
    advance(500)
    click(q(`.bunit[data-unit="${heroId}"]`))
    expect(orders.given).toHaveLength(1)
    expect(text()).toContain('2 orders')
    // And the portrait is no longer a button.
    expect([...container.querySelectorAll('button.dock-hero .dock-name')].map((n) => n.textContent)).not.toContain(name)
  })

  it('an escort is named properly in intents, and the card never re-offers an order already standing', () => {
    const real = floorLog(1, 15)
    const keep = new Set(['h_000001', 'a15_0', 'e15_w0_3'])
    const H = 'h_000001'
    const E = 'e15_w0_3'
    const specs: EventSpec[] = [
      { tick: 0, kind: 'battle-start', heroIds: [H, 'a15_0'], enemyIds: [E] },
      { tick: 1, kind: 'order', order: { tick: 1, kind: 'protect', allyId: H } },
      { tick: 2, kind: 'act', actorId: E, skillId: 'e_basic', targetId: 'a15_0' },
      { tick: 2, kind: 'hit', actorId: E, targetId: 'a15_0', amount: 200, crit: false, hpAfter: 102 },
      { tick: 5, kind: 'act', actorId: E, skillId: 'e_basic', targetId: H },
      { tick: 5, kind: 'hit', actorId: E, targetId: H, amount: 134, crit: false, hpAfter: 0 },
      { tick: 5, kind: 'death', unitId: H },
      { tick: 5, kind: 'end', outcome: 'wipe' },
    ]
    const log: CombatLog = {
      ...real,
      unitsInit: real.unitsInit.filter((u) => keep.has(u.id)),
      events: specs.map((e, seq) => ({ ...e, seq }) as CombatEvent),
      outcome: 'wipe',
    }
    const give = vi.fn(() => null)
    act(() => root.render(<BattleScene log={log} state={null} onDone={() => {}} orders={{ left: 2, give }} />))
    until(() => !!q('.intent'))
    expect(q('.intent')!.textContent).toContain('→ Priasis')
    expect(q('.intent')!.textContent).not.toContain('Princess')
    until(() => !!q('.decisive-card'))
    // The hero is already under a Protect order: offering it again would only burn an order.
    expect(q('.decisive-card .protect')).toBeNull()
    expect(q('.decisive-card .focus')).toBeTruthy()
    // The foe the card names is marked on stage.
    expect(q('.bunit.killer')?.getAttribute('data-unit')).toBe(E)
    advance(DECISIVE_KEY_GRACE_MS)
    key('p')
    expect(give).not.toHaveBeenCalled()
    expect(q('.decisive-card')).toBeTruthy()
    key('f')
    expect(give).toHaveBeenCalledWith({ tick: 3, kind: 'focus', enemyId: E })
  })

  it('two rescues in one fight each get their "Saved!" (Protect, then Retreat)', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { pre, log } = twoRescues()
    const orders = ordersFor(pre)
    const onSaved = vi.fn()
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={orders} onSaved={onSaved} />))
    let cards = 0
    until(() => {
      if (q('.decisive-card')) {
        cards++
        click(cards === 1 ? q('.decisive-card .protect') : q('.decisive-card .retreat'))
      }
      return !!button('Continue ▸')
    })
    expect(cards).toBe(2)
    expect(orders.given.map((o) => o.kind)).toEqual(['protect', 'retreat'])
    const ids = onSaved.mock.calls.map((c) => c[0])
    expect(new Set(ids).size).toBe(2)
    expect(ids).toHaveLength(2)
  })

  it('a Space pressed as time stops is not read as "Let fate decide"; after a short grace it is', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { pre, log } = deadlyFight()
    const orders = ordersFor(pre)
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={orders} />))
    until(() => !!q('.decisive-card'), 300_000, 10)
    key(' ')
    key('r')
    expect(q('.decisive-card')).toBeTruthy()
    expect(orders.given).toEqual([])
    advance(DECISIVE_KEY_GRACE_MS)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true, cancelable: true }))
    })
    expect(q('.decisive-card')).toBeTruthy() // a held key's auto-repeat does not choose either
    key(' ')
    expect(q('.decisive-card')).toBeNull()
    expect(orders.given).toEqual([])
  })
})
