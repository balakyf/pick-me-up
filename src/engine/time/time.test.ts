import { describe, it, expect } from 'vitest'
import { toWorldTime, advanceTime } from './time'
import { createAccount } from '../account'
import { TUNING } from '../tuning'
import type { GameState, OwnedHero, HeroId } from '../types'

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
