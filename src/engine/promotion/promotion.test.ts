import { describe, it, expect } from 'vitest'
import {
  promotionTargetStar,
  attrStoneId,
  promotionCost,
  canPromote,
  canAfford,
  promotionDuration,
  startPromotion,
  completePromotion,
  skipPromotion,
} from './promotion'
import { createAccount } from '../account'
import { levelCapForStar } from '../stats'
import { makeSeed } from '../rng'
import { SKILLS } from '../content'
import { TUNING } from '../tuning'
import type { GameState, OwnedHero, HeroId, Star, Element, MaterialId } from '../types'

const P = TUNING.lobby.promotion

/** An OwnedHero sitting at its star's level cap (the promotion gate). */
function cappedHero(overrides: Partial<OwnedHero> = {}): OwnedHero {
  const star: Star = (overrides.star ?? 3) as Star
  return {
    id: 'h_p' as HeroId,
    name: 'Promo',
    star,
    heroClass: 'warrior',
    element: 'fire',
    baseAttrs: { str: 12, agi: 11, vit: 13, int: 10, wil: 12 },
    growthGrades: { str: 2, agi: 1, vit: 3, int: 0, wil: 2 },
    skillIds: [],
    portraitToken: '#fff',
    origin: 'procedural',
    xp: { level: levelCapForStar(star), xpIntoLevel: 0, heldXp: 0, atCap: true },
    alive: true,
    sanity: 100,
    promotion: null,
    equipment: { weapon: null, armor: null, accessory: null },
    ...overrides,
  }
}

/** A state holding a single hero, rich in materials by default. */
function stateWith(hero: OwnedHero, opts?: { materials?: Record<MaterialId, number>; gems?: number }): GameState {
  const acct = createAccount(42, { now: 0 })
  return {
    ...acct,
    heroes: { [hero.id]: hero },
    materials: opts?.materials ?? { promotionStone: 9999, attrStone_fire: 9999, attrStone_water: 9999 },
    gems: opts?.gems ?? 0,
  }
}

describe('promotionTargetStar', () => {
  it('is one star above the current', () => {
    expect(promotionTargetStar(cappedHero({ star: 3 as Star }))).toBe(4)
  })
})

describe('attrStoneId', () => {
  it('keys the material by element', () => {
    expect(attrStoneId('fire' as Element)).toBe('attrStone_fire')
    expect(attrStoneId('water' as Element)).toBe('attrStone_water')
  })
})

describe('promotionCost', () => {
  it('charges the doubling stone curve and half that in element Attribute Stones', () => {
    const cost = promotionCost(cappedHero({ star: 3 as Star, element: 'fire' as Element }))
    expect(cost.promotionStone).toBe(P.stoneCost[4])
    expect(cost.attrStone_fire).toBe(P.stoneCost[4] / P.attrStoneDivisor)
  })
})

describe('canPromote', () => {
  it('is true for a living, at-cap, sub-ceiling hero with no promotion in flight', () => {
    expect(canPromote(cappedHero())).toBe(true)
  })
  it('is false when the hero is not at its level cap', () => {
    expect(canPromote(cappedHero({ xp: { level: 5, xpIntoLevel: 0, heldXp: 0, atCap: false } }))).toBe(false)
  })
  it('is false at the slice star ceiling', () => {
    expect(canPromote(cappedHero({ star: P.maxStar as Star }))).toBe(false)
  })
  it('is false when a promotion is already in flight', () => {
    expect(canPromote(cappedHero({ promotion: { completesAtWorld: 1 } }))).toBe(false)
  })
  it('is false for a dead hero', () => {
    expect(canPromote(cappedHero({ alive: false }))).toBe(false)
  })
})

describe('canAfford', () => {
  it('is true when both material buckets cover the cost', () => {
    expect(canAfford(stateWith(cappedHero()), cappedHero())).toBe(true)
  })
  it('is false when stones are short', () => {
    const hero = cappedHero()
    const poor = stateWith(hero, { materials: { promotionStone: 0, attrStone_fire: 9999 } })
    expect(canAfford(poor, hero)).toBe(false)
  })
})

describe('promotionDuration', () => {
  it('is the base duration at chamber level 0', () => {
    expect(promotionDuration(4, 0)).toBe(P.durationMs[4])
  })
  it('shrinks with chamber level', () => {
    expect(promotionDuration(4, 3)).toBeLessThan(promotionDuration(4, 0))
  })
  it('never drops below the minimum factor of the base', () => {
    const floor = Math.round(P.durationMs[4] * P.minDurationFactor)
    expect(promotionDuration(4, 999)).toBe(floor)
  })
})

describe('startPromotion', () => {
  it('deducts materials and sets the completion timer', () => {
    const hero = cappedHero()
    const state = stateWith(hero)
    const next = startPromotion(state, hero.id, 1_000)

    const cost = promotionCost(hero)
    expect(next.materials.promotionStone).toBe(9999 - cost.promotionStone)
    expect(next.materials.attrStone_fire).toBe(9999 - cost.attrStone_fire)
    const promo = next.heroes[hero.id]!.promotion
    expect(promo).not.toBeNull()
    expect(promo!.completesAtWorld).toBe(1_000 + promotionDuration(promotionTargetStar(hero), state.facilities.promotionChamber.level))
  })

  it('throws when the hero cannot be promoted', () => {
    const hero = cappedHero({ star: P.maxStar as Star })
    expect(() => startPromotion(stateWith(hero), hero.id, 0)).toThrow(/cannot be promoted|ceiling|cap/i)
  })

  it('throws when materials are insufficient', () => {
    const hero = cappedHero()
    const poor = stateWith(hero, { materials: { promotionStone: 0 } })
    expect(() => startPromotion(poor, hero.id, 0)).toThrow(/material|afford|insufficient/i)
  })

  it('is pure — the input state is not mutated', () => {
    const hero = cappedHero()
    const state = stateWith(hero)
    startPromotion(state, hero.id, 5)
    expect(state.materials.promotionStone).toBe(9999)
    expect(state.heroes[hero.id]!.promotion).toBeNull()
  })
})

describe('completePromotion', () => {
  it('raises the star by one and clears the in-flight timer', () => {
    const hero = cappedHero({ star: 3 as Star, promotion: { completesAtWorld: 1 } })
    const done = completePromotion(hero, makeSeed(42))
    expect(done.star).toBe(4)
    expect(done.promotion).toBeNull()
  })

  it('lifts the level cap so the hero is no longer at-cap', () => {
    const done = completePromotion(cappedHero({ star: 3 as Star }), makeSeed(42))
    expect(done.xp.atCap).toBe(false)
    expect(levelCapForStar(done.star)).toBeGreaterThan(levelCapForStar(3 as Star))
  })

  it('re-rolls base attributes and grades UPWARD-ONLY (never weakens a stat)', () => {
    const hero = cappedHero({ star: 3 as Star })
    const done = completePromotion(hero, makeSeed(7))
    for (const k of ['str', 'agi', 'vit', 'int', 'wil'] as const) {
      expect(done.baseAttrs[k]).toBeGreaterThanOrEqual(hero.baseAttrs[k])
      expect(done.growthGrades[k]).toBeGreaterThanOrEqual(hero.growthGrades[k])
    }
  })

  it('keeps every grade within the new star envelope ceiling', () => {
    const done = completePromotion(cappedHero({ star: 3 as Star }), makeSeed(7))
    const ceiling = { 1: 3, 2: 4, 3: 6, 4: 8, 5: 9, 6: 10, 7: 10 }[done.star]!
    for (const k of ['str', 'agi', 'vit', 'int', 'wil'] as const) {
      expect(done.growthGrades[k]).toBeLessThanOrEqual(ceiling)
    }
  })

  it('grants a promotion skill the hero did not already have', () => {
    const hero = cappedHero({ skillIds: [] })
    const done = completePromotion(hero, makeSeed(7))
    expect(done.skillIds.length).toBe(1)
    expect(Object.keys(SKILLS)).toContain(done.skillIds[0])
  })

  it('no-ops the skill grant when the hero already knows every skill', () => {
    const all = Object.keys(SKILLS)
    const done = completePromotion(cappedHero({ skillIds: all }), makeSeed(7))
    expect(done.skillIds.sort()).toEqual(all.sort())
  })

  it('is deterministic in (hero, accountSeed)', () => {
    const hero = cappedHero({ star: 3 as Star })
    expect(completePromotion(hero, makeSeed(123))).toEqual(completePromotion(hero, makeSeed(123)))
  })

  it('is pure — the input hero is not mutated', () => {
    const hero = cappedHero({ star: 3 as Star })
    const snapshot = JSON.parse(JSON.stringify(hero))
    completePromotion(hero, makeSeed(9))
    expect(hero).toEqual(snapshot)
  })
})

describe('skipPromotion', () => {
  /** A hero mid-promotion (timer set), in a state with `gems`. */
  function promotingState(gems: number): GameState {
    const hero = cappedHero({ star: 3 as Star, promotion: { completesAtWorld: 999_999 } })
    return { ...stateWith(hero, { gems }), gems }
  }

  it('charges the gem skip cost and completes the promotion immediately', () => {
    const state = promotingState(100)
    const next = skipPromotion(state, 'h_p' as HeroId)
    expect(next.gems).toBe(100 - P.skipGemCost)
    const hero = next.heroes['h_p' as HeroId]!
    expect(hero.star).toBe(4)
    expect(hero.promotion).toBeNull()
  })

  it('throws when no promotion is in flight', () => {
    const idle = stateWith(cappedHero({ star: 3 as Star }), { gems: 100 })
    expect(() => skipPromotion(idle, 'h_p' as HeroId)).toThrow(/no promotion|in flight/i)
  })

  it('throws when gems are insufficient', () => {
    expect(() => skipPromotion(promotingState(P.skipGemCost - 1), 'h_p' as HeroId)).toThrow(/gem/i)
  })

  it('is pure — the input state is not mutated', () => {
    const state = promotingState(100)
    skipPromotion(state, 'h_p' as HeroId)
    expect(state.gems).toBe(100)
    expect(state.heroes['h_p' as HeroId]!.promotion).not.toBeNull()
  })
})
