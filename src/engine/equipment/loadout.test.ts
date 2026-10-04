/**
 * Lane N — equip best, compare deltas and heirlooms (equipment/loadout).
 */
import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { reduce } from '../store'
import { heroCpFull } from '../unit/trueCp'
import type { EquipmentGrade, EquipmentItem, EquipmentSlot, FallenRecord, GameState, HeroId } from '../types'
import { equipItem, itemName, makeExclusiveWeapon, nextEquipmentId, statBlockFor } from './equipment'
import { bestLoadout, equipBest, heirloomOf, itemDelta, itemScore } from './loadout'

function roster(seed = 4): { s: GameState; ids: HeroId[] } {
  let s: GameState = { ...createAccount(seed, { now: 0 }), gold: 10_000_000, materials: { promotionStone: 999 } }
  s = { ...s, meta: { ...s.meta, masterLevel: 6 } }
  s = summonMany(s, 'normal', 10).state
  return { s, ids: (Object.keys(s.heroes) as HeroId[]).filter((id) => s.heroes[id]!.alive) }
}

/** Put a plain forged item of a grade into the inventory. */
function give(s: GameState, slot: EquipmentSlot, grade: EquipmentGrade, extra: Partial<EquipmentItem> = {}): { s: GameState; item: EquipmentItem } {
  const item: EquipmentItem = { id: nextEquipmentId(s.inventory), slot, grade, name: itemName(slot, grade), statBonus: statBlockFor(slot, grade), ...extra }
  return { s: { ...s, inventory: [...s.inventory, item] }, item }
}

describe('item worth and compare', () => {
  it('a higher grade is worth more, and an empty slot is worth nothing', () => {
    const lo = { statBonus: statBlockFor('armor', 'D') }
    const hi = { statBonus: statBlockFor('armor', 'B') }
    expect(itemScore(null)).toBe(0)
    expect(itemScore(hi)).toBeGreaterThan(itemScore(lo))
  })

  it('the delta lists only the stats that move, with from, to and the change', () => {
    const d = itemDelta({ statBonus: statBlockFor('weapon', 'D') }, { statBonus: statBlockFor('weapon', 'B') })
    expect(d.stats.map((s) => s.key)).toEqual(['pAtk', 'mAtk'])
    const p = d.stats[0]!
    expect(p.delta).toBe(p.to - p.from)
    expect(p.delta).toBeGreaterThan(0)
    expect(d.cp).toBeGreaterThan(0)
  })

  it('a swap across kinds shows losses as negatives, and an empty side as zeros', () => {
    const d = itemDelta({ statBonus: { maxHP: 100, pDef: 10 } }, { statBonus: { spd: 4, critPct: 3 } })
    expect(d.stats).toEqual([
      { key: 'maxHP', from: 100, to: 0, delta: -100 },
      { key: 'pDef', from: 10, to: 0, delta: -10 },
      { key: 'spd', from: 0, to: 4, delta: 4 },
      { key: 'critPct', from: 0, to: 3, delta: 3 },
    ])
    expect(itemDelta(null, null)).toEqual({ stats: [], cp: 0 })
  })

  it('legacy EVA/ACC is compared as combat reads it (folded into SPD/CRIT)', () => {
    const d = itemDelta(null, { statBonus: { evaPct: 10 } })
    expect(d.stats.map((s) => s.key)).toEqual(['spd'])
  })
})

describe('equip best', () => {
  it('fills every empty slot with the best free item of that slot', () => {
    let { s, ids } = roster()
    s = give(s, 'weapon', 'D').s
    s = give(s, 'weapon', 'B').s
    s = give(s, 'armor', 'C').s
    const plan = bestLoadout(s, ids[0]!)
    expect(plan.map((c) => c.slot)).toEqual(['weapon', 'armor'])
    const next = equipBest(s, ids[0]!)
    const h = next.heroes[ids[0]!]!
    expect(next.inventory.find((i) => i.id === h.equipment.weapon)!.grade).toBe('B')
    expect(next.inventory.find((i) => i.id === h.equipment.armor)!.grade).toBe('C')
    expect(h.equipment.accessory).toBeNull()
  })

  it('upgrades a worn item only when something better is free, and raises true CP', () => {
    let { s, ids } = roster()
    const lo = give(s, 'armor', 'D')
    s = equipItem(lo.s, ids[0]!, lo.item.id)
    expect(bestLoadout(s, ids[0]!)).toEqual([])
    const hi = give(s, 'armor', 'A')
    s = hi.s
    const before = heroCpFull(s, s.heroes[ids[0]!]!)
    const plan = bestLoadout(s, ids[0]!)
    expect(plan).toEqual([{ slot: 'armor', from: lo.item.id, to: hi.item.id, gain: itemScore(hi.item) - itemScore(lo.item) }])
    const next = equipBest(s, ids[0]!)
    expect(heroCpFull(next, next.heroes[ids[0]!]!)).toBeGreaterThan(before)
  })

  it('never takes an item another living hero wears', () => {
    let { s, ids } = roster()
    const a = give(s, 'weapon', 'A')
    s = equipItem(a.s, ids[1]!, a.item.id)
    expect(bestLoadout(s, ids[0]!)).toEqual([])
  })

  it('leaves a foreign-element blade alone, and another hero’s Oath-Blade too', () => {
    let { s, ids } = roster()
    const h0 = s.heroes[ids[0]!]!
    const other = (['fire', 'water', 'wind', 'earth'] as const).find((e) => e !== h0.element)!
    s = give(s, 'weapon', 'S', { element: other }).s
    const oath = makeExclusiveWeapon(s.inventory, s.heroes[ids[1]!]!, 'S')
    s = { ...s, inventory: [...s.inventory, oath] }
    expect(bestLoadout(s, ids[0]!)).toEqual([])
    // The Oath-Blade's own hero takes it up.
    expect(bestLoadout(s, ids[1]!).map((c) => c.to)).toContain(oath.id)
  })

  it('prefers the hero’s own Oath-Blade over an equal forged one', () => {
    let { s, ids } = roster()
    s = give(s, 'weapon', 'B').s
    const oath = makeExclusiveWeapon(s.inventory, s.heroes[ids[0]!]!, 'B')
    s = { ...s, inventory: [...s.inventory, oath] }
    expect(bestLoadout(s, ids[0]!)[0]!.to).toBe(oath.id)
  })

  it('is deterministic: the same state gives the same loadout', () => {
    let { s, ids } = roster()
    for (const g of ['C', 'C', 'B', 'D'] as EquipmentGrade[]) s = give(s, 'accessory', g).s
    expect(bestLoadout(s, ids[0]!)).toEqual(bestLoadout(s, ids[0]!))
    // Ties go to the lowest id.
    const plan = bestLoadout(s, ids[0]!)
    expect(s.inventory.find((i) => i.id === plan[0]!.to)!.grade).toBe('B')
  })

  it('the command applies it, and refuses with a reason', () => {
    let { s, ids } = roster()
    s = give(s, 'armor', 'C').s
    const next = reduce(s, { type: 'EQUIP_BEST', heroId: ids[0]! })
    expect(next).toEqual(equipBest(s, ids[0]!))
    expect(() => reduce(next, { type: 'EQUIP_BEST', heroId: ids[0]! })).toThrow(/^equipBest: nothing better to equip/)
    expect(() => reduce(s, { type: 'EQUIP_BEST', heroId: 'h_nope' as HeroId })).toThrow(/^equipBest: unknown hero/)
    const dead = { ...s, heroes: { ...s.heroes, [ids[0]!]: { ...s.heroes[ids[0]!]!, alive: false } } }
    expect(() => reduce(dead, { type: 'EQUIP_BEST', heroId: ids[0]! })).toThrow(/^equipBest: hero .* is not alive/)
  })
})

describe('heirlooms', () => {
  it('names the latest fallen hero who carried an item, else null', () => {
    let { s } = roster()
    const a = give(s, 'weapon', 'B')
    s = a.s
    expect(heirloomOf(s, a.item.id)).toBeNull()
    const grave = (name: string, day: number): FallenRecord => ({
      heroId: `h_${name}` as HeroId,
      name,
      star: 2,
      level: 10,
      heroClass: null,
      element: 'fire',
      portraitToken: '#fff',
      cause: 'battle',
      floor: 12,
      day,
      daysServed: 3,
      bestFloor: 12,
      mourners: [],
      carried: [{ slot: 'weapon', itemId: a.item.id, name: a.item.name, grade: a.item.grade }],
    })
    s = { ...s, life: { ...s.life, memorial: [grave('Aria', 2), grave('Bram', 5)] } }
    expect(heirloomOf(s, a.item.id)!.name).toBe('Bram')
  })
})

describe('equip best skips heroes who would carry the gear away (review of lane N)', () => {
  it('a captive or a hero away in the Ruins gets nothing', () => {
    const { s: s0, ids } = roster()
    const { s } = give(s0, 'armor', 'B')
    const id = ids[0]!
    expect(bestLoadout(s, id).length).toBeGreaterThan(0)
    const held = { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, captiveOf: 'rival' } } } as GameState
    expect(bestLoadout(held, id)).toEqual([])
    const away = { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, expedition: { until: 1 } } } } as unknown as GameState
    expect(bestLoadout(away, id)).toEqual([])
  })
})
