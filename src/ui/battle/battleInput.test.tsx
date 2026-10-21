// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { CombatLog } from '../../engine/types'
import { PREFS_KEY } from '../prefs'
import { DECISIVE_KEY_GRACE_MS } from './BattleScene'
import { atFloor, deadlyFight, floorLog, ordersFor, SEEDS } from './__fixtures__/logs'

/**
 * Keys and orders at the edges of the battle (review findings #2, #6, #9): the battle is
 * modal (Enter and Space never press a button behind it), a focused battle button keeps
 * its own activation keys, and an order given while the final blow is on screen is refused
 * instead of replaying the whole fight from frame 0.
 */
const cues = vi.hoisted(() => [] as string[])
vi.mock('../audio/sound', () => ({
  sfx: (name: string) => {
    cues.push(name)
  },
  playMusic: () => {},
}))
const { BattleScene } = await import('./BattleScene')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  cues.length = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

const q = (sel: string) => container.querySelector(sel)
const caption = () => q('.battle-caption')?.textContent ?? ''
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}
function until(done: () => boolean, maxMs = 300_000, step = 5): void {
  let t = 0
  while (!done()) {
    if (t > maxMs) throw new Error(`timed out: ${caption()}`)
    advance(step)
    t += step
  }
}
function keyOn(target: EventTarget, key: string): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  act(() => {
    target.dispatchEvent(ev)
  })
  return ev
}

describe('the battle owns Enter and Space', () => {
  it('takes the focus from the page behind it, and never lets Enter or Space press a button there', () => {
    const behind = document.createElement('button')
    const clicked = vi.fn()
    behind.addEventListener('click', clicked)
    document.body.appendChild(behind)
    try {
      behind.focus()
      expect(document.activeElement).toBe(behind)
      const seed = SEEDS[0]
      const log = floorLog(seed, 1)
      act(() => root.render(<BattleScene log={log} state={null} onDone={() => {}} orders={ordersFor(atFloor(seed, 1))} />))
      expect(document.activeElement).not.toBe(behind)
      expect(q('.battle')!.contains(document.activeElement)).toBe(true)
      // Focus put back behind the battle (a Tab): Enter and Space are still the battle's.
      behind.focus()
      advance(100)
      for (const k of ['Enter', ' ']) expect(keyOn(behind, k).defaultPrevented).toBe(true)
      expect(keyOn(document.body, 'Enter').defaultPrevented).toBe(true)
      expect(clicked).not.toHaveBeenCalled()
    } finally {
      behind.remove()
    }
  })
})

describe('a focused Decisive Moment button keeps Space and Enter', () => {
  it('Space on a focused "Protect" is not read as "Let fate decide"', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { pre, log } = deadlyFight()
    const orders = ordersFor(pre)
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={orders} />))
    until(() => !!q('.decisive-card'), 300_000, 10)
    advance(DECISIVE_KEY_GRACE_MS)
    const protect = q('.decisive-card .protect') as HTMLButtonElement
    expect(protect).toBeTruthy()
    protect.focus()
    for (const k of [' ', 'Enter']) {
      const ev = keyOn(protect, k)
      // The browser's own click on the focused button goes ahead (jsdom does not synthesize it).
      expect(ev.defaultPrevented).toBe(false)
      expect(q('.decisive-card')).toBeTruthy()
      expect(orders.given).toEqual([])
    }
    act(() => protect.click())
    expect(orders.given.map((o) => o.kind)).toEqual(['protect'])
  })

  it('Space with nothing focused still lets fate decide (the advertised key)', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { pre, log } = deadlyFight()
    const orders = ordersFor(pre)
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={orders} />))
    until(() => !!q('.decisive-card'), 300_000, 10)
    advance(DECISIVE_KEY_GRACE_MS)
    expect(keyOn(window, ' ').defaultPrevented).toBe(true)
    expect(q('.decisive-card')).toBeNull()
    expect(orders.given).toEqual([])
  })
})

/** A won fight that ends on a foe's death, with an order to give. */
function endsOnAKill(): { seed: number; floor: number; log: CombatLog } {
  for (const seed of SEEDS)
    for (let floor = 1; floor <= 9; floor++) {
      const log = floorLog(seed, floor)
      const ev = log.events
      if (log.outcome === 'win' && ev[ev.length - 2]!.kind === 'death' && ev[ev.length - 2]!.tick === ev[ev.length - 1]!.tick) return { seed, floor, log }
    }
  throw new Error('no fight ending on a kill')
}

describe('orders at the very end of the fight', () => {
  it('an order while the final blow is on screen is refused: no order spent, no replay from frame 0', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { seed, floor, log } = endsOnAKill()
    const deaths = log.events.filter((e) => e.kind === 'death').length
    const orders = ordersFor(atFloor(seed, floor))
    act(() => root.render(<BattleScene log={log} state={null} onDone={() => {}} orders={orders} />))
    // Play until the last death's cue: the final frame before the end.
    until(() => cues.filter((c) => c === 'death' || c === 'heroFall').length >= deaths)
    expect(q('.battle-banner')).toBeNull()
    const at = caption()
    const dock = q('button.dock-hero') as HTMLButtonElement | null
    if (dock) act(() => dock.click())
    keyOn(window, 'r')
    expect(orders.given).toEqual([])
    expect(caption()).toBe(at)
    expect(caption()).not.toBe('Enemies approach!')
    until(() => !!q('.battle-banner'))
    expect(q('.battle-banner')!.textContent).toBe('VICTORY')
    expect(cues.filter((c) => c === 'death' || c === 'heroFall').length).toBe(deaths) // nothing replayed
  })

  it('an order mid-fight resumes where the replay stands (never earlier)', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
    const { seed, floor, log } = endsOnAKill()
    const orders = ordersFor(atFloor(seed, floor))
    act(() => root.render(<BattleScene log={log} state={null} onDone={() => {}} orders={orders} />))
    until(() => cues.filter((c) => c === 'hit' || c === 'crit').length >= 2)
    const at = caption()
    const hitsBefore = cues.filter((c) => c === 'hit' || c === 'crit').length
    keyOn(window, 'r')
    expect(orders.given.map((o) => o.kind)).toEqual(['retreat'])
    expect(caption()).toBe(at)
    until(() => !!q('.battle-banner'))
    expect(q('.battle-banner')!.textContent).toBe('RETREAT')
    // No hit was played twice: the replay went on from where it stood.
    expect(cues.filter((c) => c === 'hit' || c === 'crit').length).toBeLessThanOrEqual(log.events.filter((e) => e.kind === 'hit').length)
    expect(cues.filter((c) => c === 'hit' || c === 'crit').length).toBeGreaterThanOrEqual(hitsBefore)
  })
})
