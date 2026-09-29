import { describe, it, expect } from 'vitest'
import { toWorldTime, advanceTime } from './time'
import { createAccount } from '../account'
import { levelCapForStar } from '../stats'
import { TUNING } from '../tuning'
import type { GameState, OwnedHero, HeroId, Star } from '../types'

const MAX = TUNING.lobby.sanityMax
const R = TUNING.lobby.regen
const WORLD_HOUR_MS = 3_600_000 // world-time is plain ms, just dilated at the edge

/** Fresh account whose heroes have the given sanity/alive, with a known clock + kitchen level. */
function stateWith(
  heroes: { sanity: number; alive?: boolean }[],
  opts?: { lastSeenAtWorld?: number; kitchenLevel?: number },
): GameState {
  const acct = createAccount(123, { now: 0 })
  const starter = Object.values(acct.heroes)[0]! as OwnedHero
  const map: Record<HeroId, OwnedHero> = {}
  heroes.forEach((h, i) => {
    const id = `h_test_${i}` as HeroId
    map[id] = { ...starter, id, name: id, sanity: h.sanity, alive: h.alive ?? true }
  })
  return {
    ...acct,
    heroes: map,
    meta: { ...acct.meta, lastSeenAtWorld: opts?.lastSeenAtWorld ?? 0 },
    facilities: {
      ...acct.facilities,
      kitchen: { ...acct.facilities.kitchen, level: opts?.kitchenLevel ?? 1 },
    },
  }
}

describe('toWorldTime', () => {
  it('scales real ms by the canon dilation factor', () => {
    expect(toWorldTime(1000)).toBe(1000 * TUNING.time.worldTimeFactor)
  })
})

describe('advanceTime — clock', () => {
  it('advances the high-water mark forward', () => {
    const s = stateWith([{ sanity: MAX }])
    expect(advanceTime(s, 5000).meta.lastSeenAtWorld).toBe(5000)
  })

  it('is a monotonic no-op when nowWorld is not ahead', () => {
    const s = stateWith([{ sanity: 50 }], { lastSeenAtWorld: 10_000 })
    expect(advanceTime(s, 10_000)).toBe(s) // same reference
    expect(advanceTime(s, 9_999)).toBe(s)
  })
})

describe('advanceTime — Sanity regen', () => {
  it('regenerates living heroes by perWorldHour over one world-hour at Kitchen L1', () => {
    const s = stateWith([{ sanity: 50 }], { lastSeenAtWorld: 0, kitchenLevel: 1 })
    const next = advanceTime(s, WORLD_HOUR_MS)
    const hero = Object.values(next.heroes)[0]! as OwnedHero
    expect(hero.sanity).toBe(50 + R.perWorldHour)
  })

  it('scales the rate with Kitchen level', () => {
    const s = stateWith([{ sanity: 50 }], { lastSeenAtWorld: 0, kitchenLevel: 3 })
    const next = advanceTime(s, WORLD_HOUR_MS)
    const hero = Object.values(next.heroes)[0]! as OwnedHero
    // L3 → perWorldHour + 2×perKitchenLevel
    expect(hero.sanity).toBe(50 + R.perWorldHour + 2 * R.perKitchenLevel)
  })

  it('clamps at sanityMax — never overheals', () => {
    const s = stateWith([{ sanity: MAX - 1 }], { lastSeenAtWorld: 0 })
    const next = advanceTime(s, 100 * WORLD_HOUR_MS) // way more than enough
    expect((Object.values(next.heroes)[0]! as OwnedHero).sanity).toBe(MAX)
  })

  it('leaves dead heroes untouched (no morale for the fallen)', () => {
    const s = stateWith([{ sanity: 10, alive: false }], { lastSeenAtWorld: 0 })
    const next = advanceTime(s, 10 * WORLD_HOUR_MS)
    expect((Object.values(next.heroes)[0]! as OwnedHero).sanity).toBe(10)
  })

  it('is deterministic in (state, elapsed) — fractional hours regen proportionally', () => {
    const s = stateWith([{ sanity: 50 }], { lastSeenAtWorld: 1_000_000 })
    // half a world-hour from the existing high-water mark
    const next = advanceTime(s, 1_000_000 + WORLD_HOUR_MS / 2)
    const hero = Object.values(next.heroes)[0]! as OwnedHero
    expect(hero.sanity).toBeCloseTo(50 + R.perWorldHour / 2, 6)
  })

  it('is pure — the input state is not mutated', () => {
    const s = stateWith([{ sanity: 40 }], { lastSeenAtWorld: 0 })
    advanceTime(s, WORLD_HOUR_MS)
    expect((Object.values(s.heroes)[0]! as OwnedHero).sanity).toBe(40)
    expect(s.meta.lastSeenAtWorld).toBe(0)
  })
})

describe('advanceTime — daily attempt reset', () => {
  const WORLD_DAY_MS = 24 * 3_600_000
  function dailyState(attemptsUsed: number, lastResetWorldDay: number, lastSeenAtWorld = 0): GameState {
    const acct = createAccount(3, { now: 0 })
    return {
      ...acct,
      meta: { ...acct.meta, lastSeenAtWorld },
      dailies: { attemptsUsed, lastResetWorldDay },
    }
  }

  it('resets attemptsUsed and bumps lastResetWorldDay when the world-day advances', () => {
    const next = advanceTime(dailyState(3, 0), WORLD_DAY_MS + 1000) // into day 1
    expect(next.dailies.attemptsUsed).toBe(0)
    expect(next.dailies.lastResetWorldDay).toBe(1)
  })

  it('does not reset within the same world-day', () => {
    const next = advanceTime(dailyState(2, 0, 1000), WORLD_DAY_MS - 1) // still day 0
    expect(next.dailies.attemptsUsed).toBe(2)
    expect(next.dailies.lastResetWorldDay).toBe(0)
  })
})

describe('advanceTime — facility build completion', () => {
  function buildingState(completesAtWorld: number, lastSeenAtWorld = 0): GameState {
    const acct = createAccount(4, { now: 0 })
    return {
      ...acct,
      meta: { ...acct.meta, lastSeenAtWorld },
      facilities: { ...acct.facilities, kitchen: { level: 1, build: { toLevel: 2, completesAtWorld } } },
    }
  }

  it('completes a build whose timer elapsed (level up, timer cleared, Master XP)', () => {
    const before = buildingState(5_000)
    const next = advanceTime(before, 6_000)
    expect(next.facilities.kitchen).toEqual({ level: 2, build: null })
    expect(next.meta.masterXp).toBe(before.meta.masterXp + TUNING.lobby.master.xpPerFacilityUpgrade)
  })

  it('leaves a build whose timer is still in the future untouched', () => {
    const before = buildingState(10_000)
    const next = advanceTime(before, 6_000)
    expect(next.facilities.kitchen.build).toEqual({ toLevel: 2, completesAtWorld: 10_000 })
    expect(next.facilities.kitchen.level).toBe(1)
  })
})

describe('advanceTime — promotion completion', () => {
  /** A capped, mid-promotion hero whose timer completes at `completesAtWorld`. */
  function promotingState(completesAtWorld: number, lastSeenAtWorld = 0): GameState {
    const acct = createAccount(77, { now: 0 })
    const star: Star = 3
    const hero: OwnedHero = {
      id: 'h_promo' as HeroId,
      name: 'Promo',
      star,
      heroClass: 'warrior',
      element: 'fire',
      baseAttrs: { str: 12, agi: 12, vit: 12, int: 12, wil: 12 },
      growthGrades: { str: 2, agi: 2, vit: 2, int: 2, wil: 2 },
      skills: [],
      portraitToken: '#fff',
      origin: 'procedural',
      xp: { level: levelCapForStar(star), xpIntoLevel: 0, heldXp: 0, atCap: true },
      alive: true,
      sanity: 100,
      promotion: { completesAtWorld },
      equipment: { weapon: null, armor: null, accessory: null },
    }
    return { ...acct, heroes: { [hero.id]: hero }, meta: { ...acct.meta, lastSeenAtWorld } }
  }

  it('completes a promotion whose timer has elapsed (star up, timer cleared)', () => {
    const next = advanceTime(promotingState(5_000), 6_000)
    const hero = next.heroes['h_promo' as HeroId]!
    expect(hero.star).toBe(4)
    expect(hero.promotion).toBeNull()
    expect(hero.xp.atCap).toBe(false)
  })

  it('leaves a promotion whose timer is still in the future untouched', () => {
    const next = advanceTime(promotingState(10_000), 6_000)
    const hero = next.heroes['h_promo' as HeroId]!
    expect(hero.star).toBe(3)
    expect(hero.promotion).toEqual({ completesAtWorld: 10_000 })
  })

  it('is deterministic — same state + now reproduces the promoted hero', () => {
    const a = advanceTime(promotingState(5_000), 6_000).heroes['h_promo' as HeroId]!
    const b = advanceTime(promotingState(5_000), 6_000).heroes['h_promo' as HeroId]!
    expect(a).toEqual(b)
  })

  it('awards Master XP when a promotion completes', () => {
    const before = promotingState(5_000)
    const next = advanceTime(before, 6_000)
    expect(next.meta.masterXp).toBe(before.meta.masterXp + TUNING.lobby.master.xpPerPromotion)
  })

  it('awards no promotion Master XP when nothing completes', () => {
    const before = promotingState(10_000)
    const next = advanceTime(before, 6_000) // timer still in the future
    expect(next.meta.masterXp).toBe(before.meta.masterXp)
  })
})
