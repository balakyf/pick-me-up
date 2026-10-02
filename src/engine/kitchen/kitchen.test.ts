import { describe, it, expect } from 'vitest'
import { banquet, banquetReady, banquetReadyAt, banquetRefusal, banquetWarms, banquetWouldHelp, clampSanity } from './kitchen'
import { createAccount } from '../account'
import { TUNING } from '../tuning'
import type { GameState, OwnedHero, HeroId } from '../types'

const MAX = TUNING.lobby.sanityMax
const B = TUNING.lobby.banquet

/** Stamp a hero's sanity/alive onto a fresh account's starter and add a clone. */
function stateWith(heroes: { sanity: number; alive?: boolean }[]): GameState {
  const acct = createAccount(123, { now: 0 })
  const starter = Object.values(acct.heroes)[0]! as OwnedHero
  const map: Record<HeroId, OwnedHero> = {}
  heroes.forEach((h, i) => {
    const id = `h_test_${i}` as HeroId
    map[id] = { ...starter, id, name: id, sanity: h.sanity, alive: h.alive ?? true }
  })
  return { ...acct, gold: 10_000, heroes: map }
}

describe('clampSanity', () => {
  it('clamps into [0, sanityMax]', () => {
    expect(clampSanity(-5)).toBe(0)
    expect(clampSanity(MAX + 50)).toBe(MAX)
    expect(clampSanity(42)).toBe(42)
  })
})

describe('banquet', () => {
  it('raises every living hero by banquet.restore and charges gold', () => {
    const s = stateWith([{ sanity: 20 }, { sanity: 50 }])
    const next = banquet(s)
    const sanities = (Object.values(next.heroes) as OwnedHero[]).map((h) => h.sanity)
    expect(sanities).toEqual([20 + B.restore, 50 + B.restore])
    expect(next.gold).toBe(s.gold - B.gold)
  })

  it('clamps at sanityMax — never overheals', () => {
    const s = stateWith([{ sanity: MAX - 5 }])
    const hero = Object.values(banquet(s).heroes)[0]! as OwnedHero
    expect(hero.sanity).toBe(MAX)
  })

  it('leaves dead heroes untouched', () => {
    const s = stateWith([{ sanity: 10, alive: false }, { sanity: 40 }])
    const [dead, living] = Object.values(banquet(s).heroes) as OwnedHero[]
    expect(dead!.sanity).toBe(10) // unchanged
    expect(living!.sanity).toBe(40 + B.restore)
  })

  it('throws when gold is insufficient', () => {
    const poor = { ...stateWith([{ sanity: 10 }]), gold: B.gold - 1 }
    expect(() => banquet(poor)).toThrow(/insufficient gold/)
  })

  it('is pure — the input state is not mutated', () => {
    const s = stateWith([{ sanity: 30 }])
    const goldBefore = s.gold
    const sanityBefore = (Object.values(s.heroes)[0]! as OwnedHero).sanity
    banquet(s)
    expect(s.gold).toBe(goldBefore)
    expect((Object.values(s.heroes)[0]! as OwnedHero).sanity).toBe(sanityBefore)
  })
})

describe('banquet — once a day, and favor only now and then (B8)', () => {
  const DAY = 24 * 3_600_000
  /** The account's clock at world-day `d` (midday). */
  const at = (s: GameState, d: number): GameState => ({ ...s, meta: { ...s.meta, lastSeenAtWorld: d * DAY + DAY / 2 } })
  const favorOf = (s: GameState) => (Object.values(s.heroes)[0]! as OwnedHero).favor

  it('the hall needs a day: a second Banquet the same world-day is refused', () => {
    const s = at({ ...stateWith([{ sanity: 10 }]), gold: 100_000 }, 5)
    const once = banquet(s)
    expect(once.meta.banquetDay).toBe(5)
    expect(banquetReady(once)).toBe(false)
    expect(banquetRefusal(once)).toBe('the hall is still being cleaned')
    expect(() => banquet(once)).toThrow('banquet: the hall is still being cleaned')
    expect(banquetReadyAt(once)).toBe(6 * DAY)
    // The next world-day it is ready again.
    const next = at(once, 6)
    expect(banquetReady(next)).toBe(true)
    expect(banquetRefusal(next)).toBeNull()
    expect(() => banquet(next)).not.toThrow()
  })

  it('Sanity always restores, but favor only when no Banquet in the previous few days', () => {
    const F = TUNING.favor
    let s = at({ ...stateWith([{ sanity: 0 }]), gold: 1_000_000 }, 10)
    const f0 = favorOf(s)
    expect(banquetWarms(s)).toBe(true)
    s = banquet(s)
    expect(favorOf(s)).toBe(f0 + F.perBanquet)
    // Daily feasts: Sanity yes, favor no.
    for (let d = 11; d <= 10 + B.favorGapDays; d++) {
      s = at({ ...s, heroes: { ...s.heroes, [Object.keys(s.heroes)[0]!]: { ...(Object.values(s.heroes)[0]! as OwnedHero), sanity: 0 } } }, d)
      expect(banquetWarms(s)).toBe(false)
      s = banquet(s)
      expect((Object.values(s.heroes)[0]! as OwnedHero).sanity).toBe(B.restore)
      expect(favorOf(s)).toBe(f0 + F.perBanquet)
    }
    // A feast after a proper gap warms again.
    s = at(s, 10 + 2 * B.favorGapDays + 1)
    expect(banquetWarms(s)).toBe(true)
    expect(favorOf(banquet(s))).toBe(f0 + 2 * F.perBanquet)
  })

  it('a daily banquet habit can no longer max every bond: 30 days of feasts warm at most ~8 times', () => {
    let s = at({ ...stateWith([{ sanity: 0 }]), gold: 10_000_000 }, 0)
    const f0 = favorOf(s)
    for (let d = 0; d < 30; d++) s = banquet(at(s, d))
    expect(favorOf(s) - f0).toBe(TUNING.favor.perBanquet)
    let spaced = at({ ...stateWith([{ sanity: 0 }]), gold: 10_000_000 }, 0)
    for (let d = 0; d < 30; d += B.favorGapDays + 1) spaced = banquet(at(spaced, d))
    expect(favorOf(spaced) - f0).toBe(Math.ceil(30 / (B.favorGapDays + 1)) * TUNING.favor.perBanquet)
  })

  it('a refused Banquet costs nothing', () => {
    const s = banquet({ ...stateWith([{ sanity: 10 }]), gold: 100_000 })
    try {
      banquet(s)
    } catch {
      /* refused */
    }
    expect(s.gold).toBe(100_000 - B.gold)
  })
})

describe('banquetWouldHelp', () => {
  it('is true when a living hero is below full', () => {
    expect(banquetWouldHelp(stateWith([{ sanity: MAX }, { sanity: MAX - 1 }]))).toBe(true)
  })
  it('is false when every living hero is full (dead below-full ignored)', () => {
    expect(banquetWouldHelp(stateWith([{ sanity: MAX }, { sanity: 0, alive: false }]))).toBe(false)
  })
})
