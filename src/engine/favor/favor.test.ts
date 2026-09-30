import { describe, it, expect } from 'vitest'
import { favorTier, favorStatMult, giftPreferences, giftDelta, giveGift, withFavor, rebellionChance, isDefiant, GIFTS, shiftFavor } from './favor'
import { createAccount } from '../account'
import { buildCombatUnit } from '../unit'
import { banquet } from '../kitchen'
import { SKILLS } from '../content'
import { TUNING } from '../tuning'
import type { GameState, HeroId, OwnedHero } from '../types'

const F = TUNING.favor

function withHero(patch: Partial<OwnedHero> = {}): { state: GameState; id: HeroId } {
  const acct = createAccount(3)
  const id = Object.keys(acct.heroes)[0] as HeroId
  return { id, state: { ...acct, gold: 100_000, gems: 500, heroes: { [id]: { ...acct.heroes[id]!, ...patch } } } }
}

describe('favor tiers', () => {
  it('maps 0..100 onto Wary · Neutral · Warm · Devoted · Bonded', () => {
    expect([0, 20, 21, 40, 41, 60, 61, 80, 81, 100].map(favorTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
    expect(favorStatMult(35)).toBe(1)
    expect(favorStatMult(90)).toBeGreaterThan(1)
    expect(favorStatMult(10)).toBeLessThan(1)
    expect(isDefiant(10)).toBe(true)
    expect(isDefiant(35)).toBe(false)
  })

  it('fresh heroes start Neutral; combat stats follow the tier', () => {
    const { state, id } = withHero()
    const h = state.heroes[id]!
    expect(h.favor).toBe(F.start)
    const neutral = buildCombatUnit(h, 'front', SKILLS)
    const bonded = buildCombatUnit({ ...h, favor: 95 }, 'front', SKILLS)
    const wary = buildCombatUnit({ ...h, favor: 5 }, 'front', SKILLS)
    expect(bonded.stats.pAtk).toBeGreaterThan(neutral.stats.pAtk)
    expect(wary.stats.pAtk).toBeLessThan(neutral.stats.pAtk)
    expect(wary.defiant).toBe(true)
    expect(neutral.defiant).toBeUndefined()
  })

  it('reaching Devoted, then Bonded, pays Intervention Points once each', () => {
    const { state, id } = withHero()
    let h = withFavor(state.heroes[id]!, 70)
    expect(h.ip).toBe(TUNING.intervention.devotedBonus)
    h = withFavor(withFavor(h, 50), 75)
    expect(h.ip).toBe(TUNING.intervention.devotedBonus)
    h = withFavor(h, 95)
    expect(h.ip).toBe(TUNING.intervention.devotedBonus + TUNING.intervention.bondedBonus)
  })
})

describe('gifts', () => {
  it('each hero likes one category and dislikes another, deterministically', () => {
    const p = giftPreferences('h_x' as HeroId)
    expect(p.liked).not.toBe(p.disliked)
    expect(giftPreferences('h_x' as HeroId)).toEqual(p)
  })

  it('a liked gift doubles; a disliked one hurts; the same gift in a row decays, then sours', () => {
    const { state, id } = withHero()
    const pref = giftPreferences(id)
    const liked = Object.values(GIFTS).find((g) => g.category === pref.liked && g.gems === 0)!
    const disliked = Object.values(GIFTS).find((g) => g.category === pref.disliked)!
    const h = state.heroes[id]!
    expect(giftDelta(h, liked.id)).toBe(liked.favor * F.likedMult)
    expect(giftDelta(h, disliked.id)).toBe(-F.dislikedLoss)
    let s = state
    const gains: number[] = []
    for (let i = 0; i < 4; i++) {
      const before = s.heroes[id]!.favor
      s = giveGift(s, id, liked.id)
      gains.push(s.heroes[id]!.favor - before)
    }
    expect(gains[1]).toBeLessThan(gains[0]!)
    expect(gains[3]).toBe(-F.sourLoss)
    expect(s.gold).toBe(state.gold - liked.gold * 4)
  })

  it('high-rank gifts cost gems and are refused without them', () => {
    const { state, id } = withHero()
    expect(() => giveGift({ ...state, gems: 0 }, id, 'star_jewel')).toThrow(/gems/)
    expect(giveGift(state, id, 'star_jewel').gems).toBe(state.gems - GIFTS.star_jewel!.gems)
  })
})

describe('rebellion and the roster', () => {
  it('only a Wary and broken hero may refuse', () => {
    const { state, id } = withHero()
    const h = state.heroes[id]!
    expect(rebellionChance({ ...h, favor: 10, sanity: 80 })).toBe(0)
    expect(rebellionChance({ ...h, favor: 50, sanity: 5 })).toBe(0)
    expect(rebellionChance({ ...h, favor: 5, sanity: 5 })).toBeGreaterThan(0)
  })

  it('a Banquet warms everyone; shiftFavor skips the dead', () => {
    const { state, id } = withHero()
    expect(banquet(state).heroes[id]!.favor).toBe(F.start + F.perBanquet)
    const dead = { ...state, heroes: { [id]: { ...state.heroes[id]!, alive: false } } }
    expect(shiftFavor(dead, 'all', 10).heroes[id]!.favor).toBe(F.start)
  })
})
