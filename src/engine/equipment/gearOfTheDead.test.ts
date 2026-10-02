/**
 * B7 — gear on the dead. A fallen hero's gear goes back to the armory (every death site
 * releases it, and saves from before that are repaired on read: the dead hold nothing),
 * an Oath-Blade can be passed on once its hero has fallen, and the Memorial remembers what
 * they carried. B42 — gear never rolls EVA/ACC; old items fold them into SPD/CRIT.
 */
import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { attemptFloorWithResult, reduce } from '../store'
import { synthesize } from '../synthesis'
import { runRaid } from '../challenge'
import { rosterIds, veteranState } from '../challenge/fixtures.test-util'
import { resolveInvasions } from '../pvp'
import { upgradeRefusal } from '../minigames'
import { TUNING } from '../tuning'
import type { EquipmentGrade, EquipmentId, EquipmentItem, EquipmentSlot, GameState, HeroId, OwnedHero } from '../types'
import {
  boundElsewhere,
  carriedGear,
  combatSubstats,
  craftEquipment,
  equipItem,
  equipmentBonus,
  equippedItemIds,
  heirlooms,
  makeExclusiveWeapon,
  releaseGear,
  statBlockFor,
  wearerOf,
  wieldable,
} from './equipment'

const E = TUNING.lobby.equipment

function forge(seed = 4): { s: GameState; ids: HeroId[] } {
  let s: GameState = { ...createAccount(seed, { now: 0 }), gold: 10_000_000, materials: { promotionStone: 999 } }
  s = { ...s, meta: { ...s.meta, masterLevel: 6 } }
  s = summonMany(s, 'normal', 10).state
  return { s, ids: Object.keys(s.heroes) as HeroId[] }
}

/** Forge an item for `slot` and put it on `id`. */
function arm(s: GameState, id: HeroId, slot: EquipmentSlot): { s: GameState; item: EquipmentId } {
  const t = craftEquipment(s, slot)
  const item = t.inventory.at(-1)!.id
  return { s: equipItem(t, id, item), item }
}

function kill(s: GameState, id: HeroId): GameState {
  return { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, alive: false } } }
}

describe('the dead hold nothing', () => {
  it('an old save’s dead hero still pointing at gear: the item is free, anyone may take it up', () => {
    const { s: s0, ids } = forge()
    const { s: s1, item } = arm(s0, ids[0]!, 'weapon')
    // An old save: the hero died before gear was released at death.
    const s = kill(s1, ids[0]!)
    expect(s.heroes[ids[0]!]!.equipment.weapon).toBe(item)
    expect(equippedItemIds(s).has(item)).toBe(false)
    expect(wearerOf(s, item)).toBeNull()
    const taken = equipItem(s, ids[1]!, item)
    expect(taken.heroes[ids[1]!]!.equipment.weapon).toBe(item)
    expect(equippedItemIds(taken).has(item)).toBe(true)
    // The living still guard what they wear.
    expect(() => equipItem(taken, ids[2]!, item)).toThrow(/already equipped by/)
    // The anvil still takes it (nothing new refused).
    expect(upgradeRefusal(s, item)).toBeNull()
  })

  it('an Oath-Blade stays bound while its hero lives, and is passed on when they fall', () => {
    const { s: s0, ids } = forge()
    const owner = s0.heroes[ids[0]!]!
    const blade = makeExclusiveWeapon(s0.inventory, owner, 'B')
    const s = { ...s0, inventory: [...s0.inventory, blade] }
    expect(boundElsewhere(s, blade, ids[1]!)).toBe(true)
    expect(wieldable(s, blade, ids[1]!)).toBe(false)
    expect(() => equipItem(s, ids[1]!, blade.id)).toThrow(/bound to another hero/)
    expect(wieldable(s, blade, ids[0]!)).toBe(true)
    const fallen = kill(s, ids[0]!)
    expect(boundElsewhere(fallen, blade, ids[1]!)).toBe(false)
    expect(equipItem(fallen, ids[1]!, blade.id).heroes[ids[1]!]!.equipment.weapon).toBe(blade.id)
  })

  it('releaseGear empties the hands (same object when already empty); carriedGear lists what was worn', () => {
    const { s: s0, ids } = forge()
    const { s, item } = arm(s0, ids[0]!, 'armor')
    const h = s.heroes[ids[0]!]!
    expect(carriedGear(h, s.inventory)).toEqual([{ slot: 'armor', itemId: item, name: s.inventory.at(-1)!.name, grade: s.inventory.at(-1)!.grade }])
    expect(releaseGear(h).equipment).toEqual({ weapon: null, armor: null, accessory: null })
    const bare = s.heroes[ids[1]!]!
    expect(releaseGear(bare)).toBe(bare)
  })
})

describe('every death site releases the gear', () => {
  it('the tower: the fallen go to the Memorial with what they carried; the blade waits in the armory', () => {
    let found = false
    for (let seed = 1; seed <= 12 && !found; seed++) {
      const { s: s0, ids } = forge(seed)
      let s = s0
      for (const id of ids.slice(0, 5)) s = arm(s, id, 'weapon').s
      // Lv1 heroes far above their station: someone falls.
      s = { ...s, party: { slots: ids.slice(0, 5), lines: ['front', 'front', 'mid', 'back', 'back'] }, tower: { ...s.tower, currentFloor: 30, highestCleared: 29 } }
      const { state, result } = attemptFloorWithResult(s)
      if (result.fallenHeroIds.length === 0) continue
      found = true
      for (const id of result.fallenHeroIds) {
        expect(state.heroes[id]!.equipment).toEqual({ weapon: null, armor: null, accessory: null })
        const grave = state.life.memorial.find((r) => r.heroId === id)!
        expect(grave.cause).toBe('battle')
        expect(grave.floor).toBe(30)
        expect(grave.carried).toHaveLength(1)
        expect(grave.carried![0]!.slot).toBe('weapon')
        const [heir] = heirlooms(state, grave)
        expect(heir!.wielder).toBeNull()
        // Handed on to a survivor, the Memorial can say who carries it now.
        const heirId = ids[6]!
        const passed = equipItem(state, heirId, grave.carried![0]!.itemId)
        expect(heirlooms(passed, grave)[0]!.wielder?.id).toBe(heirId)
      }
    }
    expect(found).toBe(true)
  })

  it('synthesis: a sacrifice’s gear returns to the armory', () => {
    const { s: s0, ids } = forge()
    const { s, item } = arm(s0, ids[3]!, 'accessory')
    const after = synthesize(s, { mode: 'salvage', survivorId: null, sacrificeIds: [ids[3]!] })
    expect(after.heroes[ids[3]!]!.alive).toBe(false)
    expect(after.heroes[ids[3]!]!.equipment.accessory).toBeNull()
    expect(equippedItemIds(after).has(item)).toBe(false)
  })

  it('a raid: the fallen come home empty-handed', () => {
    let s: GameState = { ...veteranState(5, 1, 20), meta: { ...veteranState(5, 1, 20).meta, masterLevel: 6 }, materials: { promotionStone: 999 } }
    const ids = rosterIds(s)
    for (const id of ids.slice(0, 5)) s = arm(s, id, 'weapon').s
    const r = runRaid(s, 20, [ids.slice(0, 5)], [], 0, 0)
    expect(r.outcome.fallen.length).toBeGreaterThan(0)
    for (const id of r.outcome.fallen) expect(r.state.heroes[id]!.equipment.weapon).toBeNull()
  })

  it('a captor’s deadline: the captive is synthesized, their gear left behind, and the grave names the captor', () => {
    const { s: s0, ids } = forge()
    const { s: s1, item } = arm(s0, ids[2]!, 'weapon')
    const held: OwnedHero = { ...s1.heroes[ids[2]!]!, captiveOf: { master: 'Vask', rivalId: 'r1', ransomGold: 1, ransomGems: 1, deadlineWorld: 1000 } }
    const s = { ...s1, heroes: { ...s1.heroes, [held.id]: held } }
    const lost = resolveInvasions(s, 2000)
    expect(lost.heroes[held.id]!.alive).toBe(false)
    expect(lost.heroes[held.id]!.equipment.weapon).toBeNull()
    expect(equippedItemIds(lost).has(item)).toBe(false)
    // B47: the captive dies while the Master happens to climb — the grave still names the captor.
    const party = { slots: [ids[0]!, null, null, null, null], lines: s.party.lines }
    const climbed = reduce({ ...s, party }, { type: 'ATTEMPT_FLOOR' }, 2000)
    const grave = climbed.life.memorial.find((r) => r.heroId === held.id)!
    expect(grave.cause).toBe('captor')
    expect(grave.carried?.[0]?.itemId).toBe(item)
  })
})

describe('B42 — no EVA/ACC on gear', () => {
  it('no slot at any grade rolls evasion or accuracy', () => {
    for (const slot of ['weapon', 'armor', 'accessory'] as EquipmentSlot[]) {
      for (const g of Object.keys(E.gradeMagnitude) as EquipmentGrade[]) {
        const b = statBlockFor(slot, g)
        expect(b.evaPct).toBeUndefined()
        expect(b.accPct).toBeUndefined()
      }
    }
  })

  it('an old item carrying them gives SPD and CRIT instead (old saves keep their value)', () => {
    expect(combatSubstats({ pAtk: 5 })).toEqual({ pAtk: 5 })
    expect(combatSubstats({ spd: 2, evaPct: 6, accPct: 10 })).toEqual({
      spd: 2 + Math.round(6 * E.legacySubstats.evaToSpd),
      critPct: Math.round(10 * E.legacySubstats.accToCrit),
    })
    const { s, ids } = forge()
    const old: EquipmentItem = { id: 'eq_legacy' as EquipmentId, slot: 'accessory', grade: 'C', name: 'Old Charm', statBonus: { evaPct: 8, accPct: 6 } }
    const hero: OwnedHero = { ...s.heroes[ids[0]!]!, equipment: { weapon: null, armor: null, accessory: old.id } }
    const bonus = equipmentBonus(hero, [old])
    expect(bonus.stats.evaPct).toBeUndefined()
    expect(bonus.stats.accPct).toBeUndefined()
    expect(bonus.stats.spd).toBe(8 * E.legacySubstats.evaToSpd)
    expect(bonus.stats.critPct).toBe(Math.round(6 * E.legacySubstats.accToCrit))
  })
})
