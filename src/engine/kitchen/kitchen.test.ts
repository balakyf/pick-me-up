import { describe, it, expect } from 'vitest'
import { banquet, banquetWouldHelp, clampSanity } from './kitchen'
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

describe('banquetWouldHelp', () => {
  it('is true when a living hero is below full', () => {
    expect(banquetWouldHelp(stateWith([{ sanity: MAX }, { sanity: MAX - 1 }]))).toBe(true)
  })
  it('is false when every living hero is full (dead below-full ignored)', () => {
    expect(banquetWouldHelp(stateWith([{ sanity: MAX }, { sanity: 0, alive: false }]))).toBe(false)
  })
})
