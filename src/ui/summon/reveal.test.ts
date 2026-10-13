import { describe, it, expect } from 'vitest'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import type { OwnedHero, Star } from '../../engine/types'
import {
  HOLD_MS,
  TELL_COLOR,
  backTell,
  circleTellAt,
  holdMs,
  isSurprise,
  isSurpriseCard,
  revealOrder,
  revealPlan,
  ritualStepAt,
  tellTier,
} from './reveal'

function tutorialHeroes(seed: number): OwnedHero[] {
  return summonMany(createAccount(seed), 'normal', 10).heroes
}

/** A pull with hand-set stars (ids stay unique and stable). */
function withStars(stars: number[], seed = 1): OwnedHero[] {
  const base = tutorialHeroes(seed)
  return stars.map((s, i) => ({ ...base[i]!, star: s as Star, skills: [] }))
}

const nonDecreasing = (xs: number[]) => xs.every((x, i) => i === 0 || x >= xs[i - 1]!)

describe('tell ladder and hold times', () => {
  it('maps shown rarity to white, blue, gold, rainbow', () => {
    expect([1, 2, 3, 4, 5, 7].map(tellTier)).toEqual([0, 1, 2, 3, 3, 3])
    expect(Object.keys(TELL_COLOR)).toHaveLength(4)
  })

  it('holds longer the rarer the card: ~250 ms, 600 ms, 1.5 s, 3 s', () => {
    expect([1, 2, 3, 4, 5].map(holdMs)).toEqual([250, 600, 1500, 3000, 3000])
    expect(nonDecreasing(Object.values(HOLD_MS))).toBe(true)
  })
})

describe('revealOrder', () => {
  it('orders by shown star ascending, best last', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const cards = revealOrder(tutorialHeroes(seed), 1)
      expect(cards).toHaveLength(10)
      expect(nonDecreasing(cards.map((c) => c.star))).toBe(true)
      expect(cards[cards.length - 1]!.star).toBe(Math.max(...cards.map((c) => c.star)))
    }
  })

  it('breaks ties stably: fewer skills first, then pull order', () => {
    const heroes = withStars([1, 3, 1, 2, 3, 1])
    heroes[1] = { ...heroes[1]!, skills: [{ id: 'power_strike', level: 1, xp: 0 }] }
    const order = revealOrder(heroes, 1).map((c) => c.pullIndex)
    expect(order).toEqual([0, 2, 5, 3, 4, 1])
    // Deterministic: the same pull deals the same way, whatever order it arrives in.
    expect(revealOrder([...heroes], 1).map((c) => c.hero.id)).toEqual(revealOrder(heroes, 1).map((c) => c.hero.id))
  })

  it('a tutorial 3★ that knows its signature skill turns last', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const cards = revealOrder(tutorialHeroes(seed), 1)
      const last = cards[cards.length - 1]!
      expect(last.star).toBe(3)
      expect(last.hero.skills.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('uses the shown (whale-bait) star, not the true one', () => {
    const heroes = withStars([3, 3, 1])
    heroes[0] = { ...heroes[0]!, displayStar: 4 as Star }
    const cards = revealOrder(heroes, 1)
    expect(cards[cards.length - 1]!.pullIndex).toBe(0)
    expect(cards[cards.length - 1]!.star).toBe(4)
    expect(cards[cards.length - 1]!.tier).toBe(3)
    // Once the lie is revealed (Master Lv 25), the true star rules again.
    expect(revealOrder(heroes, 25).find((c) => c.pullIndex === 0)!.star).toBe(3)
  })
})

describe('revealPlan — the tell only ever climbs', () => {
  it('starts white and climbs to the best tier (or one below it, then upgrades)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const plan = revealPlan(tutorialHeroes(seed), 1)
      expect(plan.tells[0]).toBe(0)
      expect(nonDecreasing(plan.tells)).toBe(true)
      expect(plan.tells[plan.tells.length - 1]).toBe(plan.finalTier)
      expect(plan.finalTier).toBe(tellTier(plan.bestStar))
      // The circle while each card is up never steps down either.
      const circle = plan.cards.map((_, i) => circleTellAt(plan, i))
      expect(nonDecreasing(circle)).toBe(true)
      expect(circle[circle.length - 1]).toBe(plan.finalTier)
    }
  })

  it('surprises a deterministic ~30% of ≥3★ pulls, and never a pull below 3★', () => {
    let surprises = 0
    for (let seed = 1; seed <= 200; seed++) {
      const heroes = tutorialHeroes(seed)
      const plan = revealPlan(heroes, 1)
      expect(revealPlan(heroes, 1).surprise).toBe(plan.surprise)
      if (plan.surprise) {
        surprises++
        expect(plan.ritualTells[plan.ritualTells.length - 1]).toBe(plan.finalTier - 1)
        expect(plan.tells).toEqual([...plan.ritualTells, plan.finalTier])
      } else {
        expect(plan.tells).toEqual(plan.ritualTells)
      }
    }
    expect(surprises).toBeGreaterThan(30)
    expect(surprises).toBeLessThan(90)
    const low = withStars([1, 2, 1, 2])
    expect(isSurprise(low, 2)).toBe(false)
    expect(revealPlan(low, 1).surprise).toBe(false)
    expect(revealPlan(low, 1).tells).toEqual([0, 1])
  })

  it('the surprise card (the first top-tier card) shows the lower tell first, then upgrades to its own', () => {
    let seen = 0
    for (let seed = 1; seed <= 200 && seen < 5; seed++) {
      const plan = revealPlan(tutorialHeroes(seed), 1)
      if (!plan.surprise) continue
      seen++
      const at = plan.surpriseAt
      expect(plan.cards[at]!.tier).toBe(plan.finalTier)
      expect(plan.cards.findIndex((c) => c.tier === plan.finalTier)).toBe(at)
      expect(backTell(plan, at, false)).toBe(plan.finalTier - 1)
      expect(backTell(plan, at, true)).toBe(plan.finalTier)
      expect(backTell(plan, 0, false)).toBe(plan.cards[0]!.tier)
    }
    expect(seen).toBe(5)
  })

  it('walking the theatre step by step (back, upgrade, face), circle and backs never step down', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const plan = revealPlan(tutorialHeroes(seed), 1)
      const circle: number[] = [...plan.ritualTells]
      plan.cards.forEach((_, i) => {
        circle.push(circleTellAt(plan, i, false), circleTellAt(plan, i, true))
        // A back's glow only ever climbs (from the circle's tell to its own).
        expect(backTell(plan, i, true)).toBeGreaterThanOrEqual(backTell(plan, i, false))
        // No card glows above the circle before the surprise has been sprung.
        if (plan.surprise && i < plan.surpriseAt) expect(backTell(plan, i, false)).toBeLessThanOrEqual(circleTellAt(plan, i, false))
      })
      expect(nonDecreasing(circle)).toBe(true)
      expect(circle[circle.length - 1]).toBe(plan.finalTier)
    }
  })

  it('with two top-tier cards, the surprise springs on the first of them, not the last', () => {
    // Find ids that hash to a surprise, then give that pull two 3★s.
    let heroes: OwnedHero[] | null = null
    for (let seed = 1; seed <= 200 && !heroes; seed++) {
      const h = withStars([1, 3, 2, 1, 3, 2], seed)
      if (isSurprise(h, 3)) heroes = h
    }
    expect(heroes).not.toBeNull()
    const plan = revealPlan(heroes!, 1)
    expect(plan.surprise).toBe(true)
    expect(plan.cards.map((c) => c.star)).toEqual([1, 1, 2, 2, 3, 3])
    expect(plan.surpriseAt).toBe(4)
    expect(isSurpriseCard(plan, 4)).toBe(true)
    expect(isSurpriseCard(plan, 5)).toBe(false)
    // Before card 4 upgrades the circle is blue; from then on it is gold, and the last
    // 3★ glows gold from the start (no second fake-out).
    expect(circleTellAt(plan, 3, true)).toBe(1)
    expect(backTell(plan, 4, false)).toBe(1)
    expect(circleTellAt(plan, 4, false)).toBe(1)
    expect(circleTellAt(plan, 4, true)).toBe(2)
    expect(circleTellAt(plan, 5, false)).toBe(2)
    expect(backTell(plan, 5, false)).toBe(2)
    // No surprise → no surprise card.
    const plain = revealPlan(withStars([1, 1, 1]), 1)
    expect(plain.surpriseAt).toBe(-1)
  })

  it('an all-1★ pull stays white and never fakes a climb', () => {
    const plan = revealPlan(withStars([1, 1, 1]), 1)
    expect(plan.tells).toEqual([0])
    expect(plan.surprise).toBe(false)
  })

  it('times the ritual: open, one step per tier, settle; single pulls step faster', () => {
    const many = revealPlan(withStars([1, 2, 3]), 1)
    const one = revealPlan(withStars([3]), 1)
    expect(ritualStepAt(many, 0)).toBe(0)
    expect(ritualStepAt(many, 2)).toBeGreaterThan(ritualStepAt(many, 1))
    expect(ritualStepAt(one, 2) - ritualStepAt(one, 1)).toBeLessThan(ritualStepAt(many, 2) - ritualStepAt(many, 1))
    expect(many.ritualMs).toBeGreaterThan(ritualStepAt(many, many.ritualTells.length - 1))
  })

  it('handles an empty pull without throwing', () => {
    const plan = revealPlan([], 1)
    expect(plan.cards).toEqual([])
    expect(plan.tells).toEqual([0])
  })
})
