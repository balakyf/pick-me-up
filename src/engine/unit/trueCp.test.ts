import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { craftEquipment, equipItem } from '../equipment'
import { playFloor } from '../tower'
import { heroCp, scoutFloor, suggestParty } from '../scout'
import { estateOf } from '../estate'
import { combatPowerForHero } from '../stats'
import { skillCp } from '../skills'
import { engravingCp } from '../engravings'
import type { GameState, HeroId, OwnedHero } from '../types'
import { heroCpFull, heroStatsFull, heroUnitFull } from './trueCp'

function account(): { s: GameState; id: HeroId } {
  let s: GameState = { ...createAccount(8, { now: 0 }), gold: 10_000_000, materials: { promotionStone: 1000 } }
  s = { ...s, meta: { ...s.meta, masterLevel: 10 } }
  s = summonMany(s, 'normal', 10).state
  const id = Object.keys(s.heroes)[0] as HeroId
  return { s, id }
}

function patch(s: GameState, id: HeroId, p: Partial<OwnedHero>): GameState {
  return { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, ...p } } }
}

/** The old display CP (stats + skills + engraving term only). */
function oldCp(h: OwnedHero): number {
  return combatPowerForHero(h, h.xp.level, skillCp(h.skills) + engravingCp(h.engraving))
}

describe('true CP (B23)', () => {
  it('a bare, rested, Neutral hero reads as before', () => {
    const { s, id } = account()
    const h = s.heroes[id]!
    // Favor 35 is Neutral (×1) and Sanity 100 has no penalty; passives may add a little.
    expect(heroCpFull(s, h)).toBeGreaterThanOrEqual(oldCp(h))
  })

  it('gear moves CP (and the scout, and the suggestion)', () => {
    const { s, id } = account()
    const before = heroCpFull(s, s.heroes[id]!)
    let g = craftEquipment(s, 'weapon')
    g = equipItem(g, id, g.inventory.at(-1)!.id)
    const after = heroCpFull(g, g.heroes[id]!)
    expect(after).toBeGreaterThan(before)
    expect(heroCp(g.heroes[id]!, g)).toBe(after)
    // Without the account, the hero is read bare-handed.
    expect(heroCp(g.heroes[id]!)).toBe(before)
    expect(heroStatsFull(g, g.heroes[id]!).pAtk).toBeGreaterThan(heroStatsFull(s, s.heroes[id]!).pAtk)
  })

  it('favor, the Sanity penalty and withdrawal are counted', () => {
    const { s, id } = account()
    const base = heroCpFull(s, s.heroes[id]!)
    expect(heroCpFull(s, { ...s.heroes[id]!, favor: 100 })).toBeGreaterThan(base)
    expect(heroCpFull(s, { ...s.heroes[id]!, favor: 0 })).toBeLessThan(base)
    expect(heroCpFull(s, { ...s.heroes[id]!, sanity: 50 })).toBeLessThan(base)
    expect(heroCpFull(s, { ...s.heroes[id]!, sanity: 10 })).toBeLessThan(heroCpFull(s, { ...s.heroes[id]!, sanity: 50 }))
    const e = estateOf(s)
    const withdrawn = {
      ...s,
      estate: { ...e, trauma: { [id]: { fatigue: 0, foughtAt: 0, burnoutUntil: null, veteran: false, lowSince: null, withdrawn: { since: 0, cause: null, comfort: 0, lastTalkDay: 0 } } } },
    }
    expect(heroCpFull(withdrawn, withdrawn.heroes[id]!)).toBeLessThan(base)
  })

  it('is exactly the CP the tower fields', () => {
    const { s, id } = account()
    let g = craftEquipment(s, 'armor')
    g = equipItem(g, id, g.inventory.at(-1)!.id)
    g = patch(g, id, { sanity: 45, favor: 70 })
    const party = { slots: [id, null, null, null, null], lines: g.party.lines }
    const fielded = playFloor({ ...g, party }).result.result.log.unitsInit.find((u) => u.id === id)!
    expect(fielded.cp).toBe(heroCpFull(g, g.heroes[id]!))
    expect(fielded.maxHP).toBe(heroUnitFull(g, g.heroes[id]!).stats.maxHP)
  })

  it('suggestParty ranks by true CP: a geared hero outranks a bare twin', () => {
    const { s } = account()
    const ids = Object.keys(s.heroes) as HeroId[]
    // Make everyone identical except gear.
    const twin = s.heroes[ids[0]!]!
    let t: GameState = { ...s, heroes: {} }
    for (const id of ids) t.heroes[id] = { ...twin, id, name: `${twin.name} ${id}` }
    const weakest = ids.at(-1)!
    for (const slot of ['weapon', 'armor', 'accessory'] as const) {
      t = craftEquipment(t, slot)
      t = equipItem(t, weakest, t.inventory.at(-1)!.id)
    }
    expect(suggestParty(t, 0).slots).toContain(weakest)
    expect(scoutFloor({ ...t, party: { ...t.party, slots: [weakest, null, null, null, null] } })!.partyCp).toBe(heroCpFull(t, t.heroes[weakest]!))
  })
})
