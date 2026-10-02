import { describe, expect, it } from 'vitest'
import type { CombatEvent } from '../../engine/types'
import { ORDERS } from '../../engine/combat/bossTuning'
import { aimSide, aimable, clickOrder, guardUp, holdGiven, ordersInHand, swappedPositions } from './ordersPlan'

const hero = { id: 'h1', side: 'hero' as const }
const hero2 = { id: 'h2', side: 'hero' as const }
const npc = { id: 'npc', side: 'hero' as const, isNpc: true }
const foe = { id: 'e1', side: 'enemy' as const }
const evs = (list: object[]) => list.map((e, seq) => ({ seq, ...e }) as CombatEvent)

describe('the orders on the battle screen', () => {
  it('each aim picks from its side (Unleash and Swap never the escort)', () => {
    expect(aimSide('focus')).toBe('enemy')
    expect(aimSide('unleash')).toBe('hero')
    expect(aimable('focus', foe, false, true)).toBe(true)
    expect(aimable('focus', foe, false, false)).toBe(false)
    expect(aimable('protect', npc, false, true)).toBe(true)
    expect(aimable('unleash', npc, false, true)).toBe(false)
    expect(aimable('swap', hero, true, true)).toBe(false)
    expect(aimable(null, hero, false, true)).toBe(false)
  })

  it('a click gives the order; a swap waits for its second hero', () => {
    expect(clickOrder('unleash', hero, 5, null)).toEqual({ order: { tick: 5, kind: 'unleash', allyId: 'h1' } })
    expect(clickOrder('focus', foe, 5, null)).toEqual({ order: { tick: 5, kind: 'focus', enemyId: 'e1' } })
    expect(clickOrder('focus', hero, 5, null)).toBeNull()
    expect(clickOrder('swap', hero, 5, null)).toEqual({ swapFirst: 'h1' })
    expect(clickOrder('swap', hero, 5, 'h1')).toEqual({ swapFirst: 'h1' })
    expect(clickOrder('swap', hero2, 5, 'h1')).toEqual({ order: { tick: 5, kind: 'swap', a: 'h1', b: 'h2' } })
    expect(clickOrder('swap', npc, 5, 'h1')).toBeNull()
  })

  it('a cleared wave gives an order back', () => {
    const log = { events: evs([{ tick: 10, kind: 'mission', note: '', code: 'wave-cleared' }]) }
    expect(ordersInHand(1, 1, log, 5)).toBe(0)
    expect(ordersInHand(1, 1, log, 11)).toBe(ORDERS.refillPerWave)
  })

  it('reads Hold and Guard from the events played', () => {
    const e = evs([
      { tick: 2, kind: 'order', order: { tick: 2, kind: 'hold' } },
      { tick: 3, kind: 'order', order: { tick: 3, kind: 'guard' } },
      { tick: 3, kind: 'status', unitId: 'h1', status: 'guard-up', sourceId: 'h1', ticks: 9, value: 30 },
      { tick: 12, kind: 'status-end', unitId: 'h1', status: 'guard-up', reason: 'expired' },
    ])
    expect(holdGiven(e, 0)).toBe(false)
    expect(holdGiven(e, 1)).toBe(true)
    expect(guardUp(e, 1)).toBe(false)
    expect(guardUp(e, 3)).toBe(true)
    expect(guardUp(e, 4)).toBe(false)
  })

  it('swapped heroes stand in each other’s places', () => {
    const pos = { h1: { x: 250, y: 160 }, h2: { x: 322, y: 180 }, e1: { x: 100, y: 160 } }
    const e = evs([{ tick: 4, kind: 'order', order: { tick: 4, kind: 'swap', a: 'h1', b: 'h2' } }])
    expect(swappedPositions(pos, e, 0)).toBe(pos)
    expect(swappedPositions(pos, e, 1)).toEqual({ h1: { x: 322, y: 180 }, h2: { x: 250, y: 160 }, e1: { x: 100, y: 160 } })
  })
})
