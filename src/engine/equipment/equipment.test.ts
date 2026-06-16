/**
 * Tests for Equipment (Layer 1 §5). Vitest globals enabled (no imports needed).
 *
 * Everything here is fully deterministic — no RNG. The forge grade is a pure
 * function of Master Level; ids are a pure function of inventory length.
 */
import {
  gradeMagnitude,
  statBlockFor,
  forgeGrade,
  forgeCost,
  smithyUnlocked,
  craftEquipment,
  equipItem,
  unequipItem,
  equipmentBonus,
  equippedItemIds,
  itemName,
} from './equipment'
import { createAccount } from '../account'
import { TUNING } from '../tuning'
import type { GameState, OwnedHero, HeroId, EquipmentItem, EquipmentId } from '../types'

const E = TUNING.lobby.equipment

/** An account at/above the Smithy unlock Master Level with funds + stones. */
function smithAccount(ml: number = E.unlockMasterLevel): GameState {
  const base = createAccount(1)
  return {
    ...base,
    gold: 999_999,
    materials: { promotionStone: 999 },
    meta: { ...base.meta, masterLevel: ml },
  }
}

/** The starter hero id (createAccount always mints exactly one). */
function starterId(state: GameState): HeroId {
  return Object.keys(state.heroes)[0] as HeroId
}

describe('grade ladder + stat blocks', () => {
  it('gradeMagnitude reads the canon weapon-ATK ladder', () => {
    expect(gradeMagnitude('E')).toBe(E.gradeMagnitude.E)
    expect(gradeMagnitude('S')).toBe(E.gradeMagnitude.S)
  })

  it('a weapon grants pAtk + mAtk equal to the magnitude', () => {
    expect(statBlockFor('weapon', 'B')).toEqual({ pAtk: E.gradeMagnitude.B, mAtk: E.gradeMagnitude.B })
  })

  it('armor grants maxHP + pDef; accessory grants critPct + spd', () => {
    const m = E.gradeMagnitude.C
    expect(statBlockFor('armor', 'C')).toEqual({
      maxHP: Math.round(m * E.slotMult.armorHpPerM),
      pDef: Math.round(m * E.slotMult.armorPDefPerM),
    })
    expect(statBlockFor('accessory', 'C')).toEqual({
      critPct: Math.round(m * E.slotMult.accessoryCritPerM),
      spd: Math.round(m * E.slotMult.accessorySpdPerM),
    })
  })

  it('itemName combines grade + a slot noun', () => {
    expect(itemName('weapon', 'A')).toContain('A')
  })
})

describe('forge gate + grade by Master Level', () => {
  it('smithyUnlocked is gated on Master Level', () => {
    const locked = smithAccount(E.unlockMasterLevel - 1)
    expect(smithyUnlocked(locked)).toBe(false)
    expect(smithyUnlocked(smithAccount())).toBe(true)
  })

  it('forgeGrade returns the highest grade unlocked at the Master Level', () => {
    expect(forgeGrade(1)).toBe('E')
    expect(forgeGrade(6)).toBe('C')
    expect(forgeGrade(14)).toBe('B') // below the A threshold (15)
    expect(forgeGrade(999)).toBe('S') // capped at the top reachable grade
  })

  it('forgeCost rises with grade', () => {
    expect(forgeCost('S').gold).toBeGreaterThan(forgeCost('E').gold)
    expect(forgeCost('S').promotionStone).toBeGreaterThan(forgeCost('E').promotionStone)
  })
})

describe('craftEquipment', () => {
  it('forges an item of the ML-grade for the slot, deducting gold + stones', () => {
    const state = smithAccount(6) // → grade C
    const grade = forgeGrade(6)
    const cost = forgeCost(grade)
    const after = craftEquipment(state, 'weapon')
    expect(after.inventory).toHaveLength(1)
    const item = after.inventory[0]!
    expect(item.slot).toBe('weapon')
    expect(item.grade).toBe(grade)
    expect(item.statBonus).toEqual(statBlockFor('weapon', grade))
    expect(after.gold).toBe(state.gold - cost.gold)
    expect(after.materials.promotionStone).toBe(999 - cost.promotionStone)
  })

  it('assigns deterministic, unique ids by inventory length', () => {
    let state = smithAccount(6)
    state = craftEquipment(state, 'weapon')
    state = craftEquipment(state, 'armor')
    expect(state.inventory.map((i) => i.id)).toEqual(['eq_000001', 'eq_000002'])
  })

  it('throws when the Smithy is locked', () => {
    const locked = smithAccount(E.unlockMasterLevel - 1)
    expect(() => craftEquipment(locked, 'weapon')).toThrow()
  })

  it('throws when the account cannot afford the forge', () => {
    const broke = { ...smithAccount(6), gold: 0, materials: {} }
    expect(() => craftEquipment(broke, 'weapon')).toThrow()
  })

  it('is pure — does not mutate the input state', () => {
    const state = smithAccount(6)
    const before = JSON.stringify(state)
    craftEquipment(state, 'weapon')
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('equip / unequip', () => {
  it('equips an item onto the matching slot', () => {
    let state = smithAccount(6)
    state = craftEquipment(state, 'weapon')
    const hid = starterId(state)
    const itemId = state.inventory[0]!.id
    const after = equipItem(state, hid, itemId)
    expect(after.heroes[hid]!.equipment.weapon).toBe(itemId)
  })

  it('unequips a slot back to null', () => {
    let state = smithAccount(6)
    state = craftEquipment(state, 'weapon')
    const hid = starterId(state)
    state = equipItem(state, hid, state.inventory[0]!.id)
    const after = unequipItem(state, hid, 'weapon')
    expect(after.heroes[hid]!.equipment.weapon).toBeNull()
  })

  it('refuses to equip an item already worn by another hero', () => {
    let state = smithAccount(6)
    state = craftEquipment(state, 'weapon')
    const hid = starterId(state)
    const itemId = state.inventory[0]!.id
    // Add a second hero.
    const other: OwnedHero = { ...state.heroes[hid]!, id: 'h_other' as HeroId, name: 'Other' }
    state = { ...state, heroes: { ...state.heroes, [other.id]: other } }
    state = equipItem(state, hid, itemId)
    expect(() => equipItem(state, other.id, itemId)).toThrow(/already/)
  })

  it('refuses an item whose slot does not match… handled by single equip path', () => {
    let state = smithAccount(6)
    state = craftEquipment(state, 'armor') // an armor item
    const hid = starterId(state)
    // equipItem routes by the item's own slot, so it lands in armor, not weapon.
    const after = equipItem(state, hid, state.inventory[0]!.id)
    expect(after.heroes[hid]!.equipment.armor).toBe(state.inventory[0]!.id)
    expect(after.heroes[hid]!.equipment.weapon).toBeNull()
  })

  it('throws on an unknown hero or unknown item', () => {
    const state = smithAccount(6)
    expect(() => equipItem(state, 'nope' as HeroId, 'eq_x' as EquipmentId)).toThrow()
  })
})

describe('equipmentBonus + equippedItemIds', () => {
  it('sums the flat blocks of every equipped item', () => {
    let state = smithAccount(15) // grade A
    state = craftEquipment(state, 'weapon')
    state = craftEquipment(state, 'armor')
    const hid = starterId(state)
    state = equipItem(state, hid, state.inventory[0]!.id)
    state = equipItem(state, hid, state.inventory[1]!.id)
    const bonus = equipmentBonus(state.heroes[hid]!, state.inventory)
    const m = gradeMagnitude('A')
    expect(bonus.stats.pAtk).toBe(m) // from the weapon
    expect(bonus.stats.maxHP).toBe(Math.round(m * E.slotMult.armorHpPerM)) // from the armor
  })

  it('takes a weapon element override and concatenates keywords', () => {
    const item: EquipmentItem = {
      id: 'eq_w' as EquipmentId,
      slot: 'weapon',
      grade: 'A',
      name: 'Flameblade',
      statBonus: { pAtk: 50 },
      element: 'fire',
      keywords: [{ kind: 'vulnerable', element: 'water' }],
    }
    const base = createAccount(1)
    const hero = Object.values(base.heroes)[0]!
    const geared: OwnedHero = { ...hero, equipment: { ...hero.equipment, weapon: item.id } }
    const bonus = equipmentBonus(geared, [item])
    expect(bonus.element).toBe('fire')
    expect(bonus.keywords).toHaveLength(1)
  })

  it('an ungeared hero yields an empty bonus', () => {
    const base = createAccount(1)
    const hero = Object.values(base.heroes)[0]!
    const bonus = equipmentBonus(hero, base.inventory)
    expect(bonus.stats).toEqual({})
    expect(bonus.element).toBeUndefined()
    expect(bonus.keywords).toEqual([])
  })

  it('equippedItemIds reports every referenced item across the roster', () => {
    let state = smithAccount(6)
    state = craftEquipment(state, 'weapon')
    const hid = starterId(state)
    const itemId = state.inventory[0]!.id
    expect(equippedItemIds(state).has(itemId)).toBe(false)
    state = equipItem(state, hid, itemId)
    expect(equippedItemIds(state).has(itemId)).toBe(true)
  })
})
