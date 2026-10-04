import { describe, it, expect } from 'vitest'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import { equipItem, itemName, makeExclusiveWeapon, nextEquipmentId, statBlockFor } from '../../engine/equipment'
import type { EquipmentGrade, EquipmentItem, EquipmentSlot, FallenRecord, GameState, HeroId } from '../../engine/types'
import { GEAR_ALL, compareFor, gearRows, gradeCounts } from './armoryModel'

function base(): { s: GameState; ids: HeroId[] } {
  let s: GameState = { ...createAccount(5, { now: 0 }), gold: 10_000_000 }
  s = summonMany(s, 'normal', 10).state
  return { s, ids: (Object.keys(s.heroes) as HeroId[]).filter((id) => s.heroes[id]!.alive) }
}
function give(s: GameState, slot: EquipmentSlot, grade: EquipmentGrade): { s: GameState; item: EquipmentItem } {
  const item: EquipmentItem = { id: nextEquipmentId(s.inventory), slot, grade, name: itemName(slot, grade), statBonus: statBlockFor(slot, grade) }
  return { s: { ...s, inventory: [...s.inventory, item] }, item }
}

describe('the inventory grid', () => {
  it('orders by slot, best grade first, and filters by slot and grade', () => {
    let { s } = base()
    s = { ...s, inventory: [] }
    s = give(s, 'armor', 'D').s
    s = give(s, 'weapon', 'C').s
    s = give(s, 'weapon', 'A').s
    s = give(s, 'accessory', 'D').s
    expect(gearRows(s).map((r) => `${r.item.slot}:${r.item.grade}`)).toEqual(['weapon:A', 'weapon:C', 'armor:D', 'accessory:D'])
    expect(gearRows(s, { ...GEAR_ALL, slot: 'weapon' }).length).toBe(2)
    expect(gearRows(s, { ...GEAR_ALL, grade: 'D' }).map((r) => r.item.slot)).toEqual(['armor', 'accessory'])
    expect(gradeCounts(s)).toEqual({ D: 2, C: 1, A: 1 })
  })

  it('knows who wears what, and shows only the free or only the worn', () => {
    let { s, ids } = base()
    s = { ...s, inventory: [] }
    const a = give(s, 'weapon', 'B')
    s = give(a.s, 'armor', 'B').s
    s = equipItem(s, ids[0]!, a.item.id)
    const rows = gearRows(s)
    expect(rows.find((r) => r.item.id === a.item.id)!.wearer!.id).toBe(ids[0])
    expect(gearRows(s, { ...GEAR_ALL, show: 'free' }).map((r) => r.item.slot)).toEqual(['armor'])
    expect(gearRows(s, { ...GEAR_ALL, show: 'worn' }).map((r) => r.item.slot)).toEqual(['weapon'])
  })

  it('names the fallen who carried an heirloom, and the hero an Oath-Blade is bound to', () => {
    let { s, ids } = base()
    s = { ...s, inventory: [] }
    const a = give(s, 'weapon', 'B')
    s = a.s
    const grave: FallenRecord = {
      heroId: 'h_gone' as HeroId, name: 'Aria Vell', star: 2, level: 9, heroClass: null, element: 'fire', portraitToken: '#fff',
      cause: 'battle', floor: 14, day: 3, daysServed: 2, bestFloor: 14, mourners: [],
      carried: [{ slot: 'weapon', itemId: a.item.id, name: a.item.name, grade: 'B' }],
    }
    s = { ...s, life: { ...s.life, memorial: [grave] } }
    const oath = makeExclusiveWeapon(s.inventory, s.heroes[ids[1]!]!, 'C')
    s = { ...s, inventory: [...s.inventory, oath] }
    const rows = gearRows(s)
    expect(rows.find((r) => r.item.id === a.item.id)!.heirloom!.name).toBe('Aria Vell')
    expect(rows.find((r) => r.item.id === oath.id)!.boundTo!.id).toBe(ids[1])
    expect(gearRows(s, { ...GEAR_ALL, show: 'heirloom' }).map((r) => r.item.id)).toEqual([a.item.id])
  })
})

describe('compare', () => {
  it('lists the slot’s other items with deltas against what the hero wears, the wieldable best first', () => {
    let { s, ids } = base()
    s = { ...s, inventory: [] }
    const worn = give(s, 'armor', 'C')
    s = equipItem(worn.s, ids[0]!, worn.item.id)
    const up = give(s, 'armor', 'A')
    s = up.s
    const down = give(s, 'armor', 'E')
    s = down.s
    const taken = give(s, 'armor', 'S')
    s = equipItem(taken.s, ids[1]!, taken.item.id)
    const rows = compareFor(s, s.heroes[ids[0]!]!, 'armor')
    expect(rows.map((r) => r.item.id)).toEqual([up.item.id, down.item.id, taken.item.id])
    expect(rows[0]!.delta.cp).toBeGreaterThan(0)
    expect(rows[1]!.delta.cp).toBeLessThan(0)
    expect(rows[1]!.delta.stats.every((d) => d.delta < 0)).toBe(true)
    // Worn by another living hero: listed, but not wieldable.
    expect(rows[2]!.ok).toBe(false)
    expect(rows[2]!.wearer!.id).toBe(ids[1])
  })
})
