// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { BattleOrder, CombatEvent, CombatLog } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { setLocale } from '../i18n/i18n'
import { PREFS_KEY } from '../prefs'
import { DecisiveMoment } from './DecisiveMoment'
import { BattleScene, DECISIVE_KEY_GRACE_MS, type BattleOrders } from './BattleScene'
import { findDecisive, survives, wayOut, type Decisive } from './decisive'
import { SEEDS, decisiveOf, deadlyFight, findFight, fightAt, ordersFor, partyIdsOf, resolve, type Fight } from './__fixtures__/logs'

/**
 * The Decisive Moment offers only real choices (review finding #13). Focus on the killer
 * never saved anyone (0 of 74 deadly fights: the order lands a tick or two before the
 * blow), so it is off the card. Each way out the card offers is previewed and offered only
 * if the doomed hero then lives through the whole fight, and each has its own cost:
 *  - Protect: spends an order (and may turn the blows on someone else — the card says so);
 *  - Pull back (the 'withdraw' order): no order, but the hero sits out a few turns, and it
 *    is not always enough — then it is not offered;
 *  - Retreat: always saves, and the floor is lost.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
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
const text = () => container.textContent ?? ''
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}
function until(done: () => boolean, maxMs = 300_000, step = 10): void {
  let t = 0
  while (!done()) {
    if (t > maxMs) throw new Error(`timed out: ${text().slice(0, 200)}`)
    advance(step)
    t += step
  }
}
function key(k: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  })
}

const order = (d: Decisive, kind: 'protect' | 'withdraw' | 'retreat' | 'focus'): BattleOrder =>
  kind === 'retreat'
    ? { tick: d.orderTick, kind }
    : kind === 'focus'
      ? { tick: d.orderTick, kind, enemyId: d.killerId! }
      : { tick: d.orderTick, kind, allyId: d.heroId }
const way = (f: Fight, d: Decisive, kind: 'protect' | 'withdraw' | 'retreat') => wayOut(f.log, resolve(f.pre, [order(d, kind)]), d, partyIdsOf(f.log))

/** Every deadly fight in the fixture sweep, with its first Decisive Moment. */
function deadlyFights(): { f: Fight; d: Decisive }[] {
  const out: { f: Fight; d: Decisive }[] = []
  for (const size of [5, 4, 3])
    for (const seed of SEEDS)
      for (let floor = 1; floor <= 20; floor++) {
        const f = fightAt(seed, floor, size)
        const d = decisiveOf(f)
        if (d) out.push({ f, d })
      }
  return out
}

describe('what each way out does, over real deadly tower fights', () => {
  it('Retreat always saves; Protect nearly always; Pull back sometimes (a real, costed choice)', () => {
    const fights = deadlyFights()
    expect(fights.length).toBeGreaterThan(20)
    let protect = 0
    let pullBack = 0
    for (const { f, d } of fights) {
      const r = way(f, d, 'retreat')
      expect(r, `retreat F${f.floor} seed ${f.seed}`).not.toBeNull()
      expect(r!.log.outcome).toBe('retreat')
      if (way(f, d, 'protect')) protect++
      const w = way(f, d, 'withdraw')
      if (w) {
        pullBack++
        expect(survives(w.log, d.heroId)).toBe(true) // through the whole fight, not just that tick
      }
    }
    expect(protect / fights.length).toBeGreaterThan(0.9)
    expect(pullBack).toBeGreaterThan(0)
    expect(pullBack).toBeLessThan(fights.length) // not a free pass: sometimes only an order or the floor will do
  })
})

describe('the Decisive Moment card', () => {
  it('never offers Focus; offers Pull back when it saves the hero; Pull back spends no order and earns "Saved!"', () => {
    const { pre, log } = findFight('Pull back saves the doomed hero', (f) => {
      const d = decisiveOf(f)
      return !!d && way(f, d, 'withdraw') !== null
    })
    const d = findDecisive(log, partyIdsOf(log))!
    const orders = ordersFor(pre)
    const onSaved = vi.fn()
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={orders} onSaved={onSaved} />))
    until(() => !!q('.decisive-card'))
    expect(q('.decisive-card .focus')).toBeNull()
    expect(q('.decisive-card .pullback')).toBeTruthy()
    expect(q('.decisive-card .protect')).toBeTruthy()
    // Pull back's lasting cost is on the card, with the hero's name and the real number.
    const heroName = q('.decisive-card .pullback .decisive-label')!.textContent!.replace(/^↩ Pull (.+) back$/, '$1')
    expect(q('.decisive-card .pullback .decisive-cost')!.textContent).toBe(`${heroName} comes home shaken: −${TUNING.combat.withdrawSanityCost} Sanity`)
    expect(q('.decisive-card .protect .decisive-cost')).toBeNull()
    const before = q('.order-count')!.textContent
    advance(DECISIVE_KEY_GRACE_MS)
    key('f') // not a card key any more
    expect(q('.decisive-card')).toBeTruthy()
    key('b')
    expect(orders.given).toEqual([{ tick: d.orderTick, kind: 'withdraw', allyId: d.heroId }])
    expect(q('.order-count')!.textContent).toBe(before) // no order spent
    until(() => onSaved.mock.calls.length > 0)
    expect(onSaved).toHaveBeenCalledWith(d.heroId)
    expect(q('.saved-callout')).toBeTruthy()
    until(() => {
      if (q('.decisive-card')) act(() => (q('.decisive-card .fate') as HTMLElement).click())
      return !!q('.battle-banner')
    })
    expect(survives(orders.given.length ? resolve(pre, orders.given)! : log, d.heroId)).toBe(true)
  })

  it('does not offer Pull back when it would not save the hero', () => {
    const { pre, log } = findFight('Pull back is not enough', (f) => {
      const d = decisiveOf(f)
      return !!d && way(f, d, 'withdraw') === null && way(f, d, 'protect') !== null
    })
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={ordersFor(pre)} />))
    until(() => !!q('.decisive-card'))
    expect(q('.decisive-card .pullback')).toBeNull()
    expect(q('.decisive-card .protect')).toBeTruthy()
    expect(q('.decisive-card .retreat')).toBeTruthy()
    advance(DECISIVE_KEY_GRACE_MS)
    key('b')
    expect(q('.decisive-card')).toBeTruthy()
  })

  it('says so when a way out turns the blows on someone else', () => {
    const { pre, log } = findFight(
      'Protect saves the hero but another falls in their place',
      (f) => {
        const d = decisiveOf(f)
        const p = d ? way(f, d, 'protect') : null
        return !!p && p.fallsInstead.length > 0
      },
      { seeds: Array.from({ length: 30 }, (_, i) => i + 1) },
    )
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={ordersFor(pre)} />))
    until(() => !!q('.decisive-card'))
    expect(q('.decisive-card .protect .decisive-warn')?.textContent).toMatch(/fall(s)? in their place/)
  })

  it('"Saved!" plays only for a hero who lives through the whole fight, not just past the fatal tick', () => {
    const { pre, log } = deadlyFight()
    const d = findDecisive(log, partyIdsOf(log))!
    // An order that carries the hero past the fatal blow, to fall later all the same.
    const later = (next: CombatLog): CombatLog => {
      const end = next.events[next.events.length - 1]!
      const events: CombatEvent[] = [...next.events.slice(0, -1), { seq: 0, tick: end.tick, kind: 'death', unitId: d.heroId } as CombatEvent, end].map((e, seq) => ({ ...e, seq }) as CombatEvent)
      return { ...next, events }
    }
    const real = ordersFor(pre)
    const orders: BattleOrders = {
      left: real.left,
      give: (o) => {
        const next = real.give(o)
        return next && o.kind !== 'retreat' ? later(next) : next
      },
      preview: (o) => real.preview!(o),
    }
    const onSaved = vi.fn()
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} orders={orders} onSaved={onSaved} />))
    until(() => !!q('.decisive-card'))
    act(() => (q('.decisive-card .protect') as HTMLElement).click())
    let sawCallout = false
    until(() => {
      sawCallout ||= !!q('.saved-callout')
      if (q('.decisive-card')) act(() => (q('.decisive-card .fate') as HTMLElement).click())
      return !!q('.battle-banner')
    })
    expect(sawCallout).toBe(false)
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe("the card states Pull back's lasting cost", () => {
  const card = (canPullBack: boolean) =>
    act(() =>
      root.render(
        <DecisiveMoment
          decisive={{ kind: 'death' } as Decisive}
          heroName="Ilan"
          heroBust=""
          iselBust=""
          ordersLeft={1}
          canPullBack={canPullBack}
          tutorial={false}
          onChoose={() => {}}
        />,
      ),
    )
  afterEach(() => setLocale('en'))

  it('in English and in French, next to the button that costs it', () => {
    const n = TUNING.combat.withdrawSanityCost
    card(true)
    expect(q('.pullback .decisive-cost')!.textContent).toBe(`Ilan comes home shaken: −${n} Sanity`)
    setLocale('fr')
    card(true)
    expect(q('.pullback .decisive-cost')!.textContent).toBe(`Ilan rentre sous le choc : −${n} de Santé mentale`)
  })

  it('says nothing of it when Pull back is not offered', () => {
    card(false)
    expect(q('.decisive-cost')).toBeNull()
    expect(text()).not.toContain('shaken')
  })
})
