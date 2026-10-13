/** "While you were away" (spec 2026-10-12 S26): the pure diff behind the welcome-back ledger. */
import { describe, it, expect } from 'vitest'
import { awayHasNews, emptyAwaySummary, summarizeAway, VIGNETTE_WEIGHT } from './away'
import { createAccount } from '../account'
import { advanceTime, toWorldTime } from '../time'
import { reduce } from '../store'
import { TUNING } from '../tuning'
import type { ChronicleEntry, GameState, HeroId, OwnedHero } from '../types'

const T0 = Date.UTC(2026, 9, 1, 18)
const REAL_HOUR = 3_600_000
const W = TUNING.return.welcome

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as object)) deepFreeze(v)
  }
  return o
}

/** A Master with a few heroes, last seen at T0 (a real clock time). */
function roster(seed = 11, n = 6): GameState {
  let s: GameState = { ...createAccount(seed, { now: T0 }), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  return s
}

function ids(s: GameState): HeroId[] {
  return (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive).map((h) => h.id)
}

function withChronicle(s: GameState, entries: ChronicleEntry[]): GameState {
  return { ...s, life: { ...s.life, chronicle: [...s.life.chronicle, ...entries] } }
}

describe('summarizeAway', () => {
  it('is empty for a no-op gap', () => {
    const s = roster()
    expect(summarizeAway(s, s)).toEqual(emptyAwaySummary())
    expect(awayHasNews(summarizeAway(s, s))).toBe(false)
  })

  it('lists completions: promotions, drills and builds that finished while away', () => {
    const s = roster()
    const [a, b] = ids(s)
    const seen = s.meta.lastSeenAtWorld
    const before: GameState = {
      ...s,
      heroes: {
        ...s.heroes,
        [a!]: { ...s.heroes[a!]!, promotion: { completesAtWorld: seen + 1000 } },
        [b!]: { ...s.heroes[b!]!, training: { skillId: 'power_strike', mode: 'refine', completesAtWorld: seen + 2000 } },
      },
      facilities: { ...s.facilities, kitchen: { level: 1, build: { toLevel: 2, completesAtWorld: seen + 3000 } } },
    }
    const after = advanceTime(before, toWorldTime(T0 + 10 * REAL_HOUR))
    const sum = summarizeAway(before, after)
    expect(sum.awayWorld).toBe(toWorldTime(10 * REAL_HOUR))
    expect(sum.ready.promotions).toEqual([a])
    expect(sum.ready.drills).toEqual([b])
    expect(sum.ready.builds).toEqual(['kitchen'])
    // 10 real hours also built a charge of Pent-up Interference.
    expect(sum.collect.restedCharges).toBe(1)
    expect(sum.collect.loginReady).toBe(true)
    expect(awayHasNews(sum)).toBe(true)
  })

  it('reports new chronicle entries only, at most maxVignettes, sorted by emotional weight', () => {
    const before = roster()
    const [a, b, c, d] = ids(before)
    const t = before.meta.lastSeenAtWorld
    const old: ChronicleEntry = { at: t - 10, kind: 'closeFriends', heroIds: [a!, b!] }
    const prior = withChronicle(before, [old])
    const after = withChronicle(
      { ...prior, meta: { ...prior.meta, lastSeenAtWorld: t + toWorldTime(9 * REAL_HOUR) } },
      [
        { at: t + 5, kind: 'forged', heroIds: [a!], detail: 'Iron Sword' },
        { at: t + 6, kind: 'forged', heroIds: [b!], detail: 'Iron Helm' },
        { at: t + 7, kind: 'forged', heroIds: [c!], detail: 'Iron Boots' },
        { at: t + 8, kind: 'friends', heroIds: [a!, c!] },
        { at: t + 9, kind: 'argument', heroIds: [b!, d!] },
        { at: t + 10, kind: 'jobTier', heroIds: [d!], detail: 'cook:1' },
        { at: t + 11, kind: 'arrival', heroIds: [c!, a!] },
        { at: t + 12, kind: 'research', heroIds: [b!], floor: 4 },
      ],
    )
    const sum = summarizeAway(prior, after)
    expect(sum.vignettes.length).toBe(W.maxVignettes)
    const weights = sum.vignettes.map((v) => v.weight)
    expect([...weights].sort((x, y) => y - x)).toEqual(weights)
    expect(sum.vignettes[0]!.kind).toBe('arrival')
    expect(sum.vignettes[1]!.kind).toBe('friends')
    // The old entry (before the Master left) is not news.
    expect(sum.vignettes.some((v) => v.kind === 'closeFriends')).toBe(false)
    // Variety: every kind gets a line before any kind gets a second one.
    expect(new Set(sum.vignettes.map((v) => v.kind)).size).toBe(W.maxVignettes)
    expect(sum.vignettes.map((v) => v.kind)).toEqual(['arrival', 'friends', 'jobTier', 'research', 'argument'])
    expect(sum.vignettes.find((v) => v.kind === 'research')?.floor).toBe(4)
    // With only one kind of news, a second helping is allowed (never a third).
    const forges = withChronicle({ ...prior, meta: { ...prior.meta, lastSeenAtWorld: t + 100 } }, [1, 2, 3].map((i) => ({ at: t + i, kind: 'forged' as const, heroIds: [a!] })))
    expect(summarizeAway(prior, forges).vignettes.map((v) => v.kind)).toEqual(['forged', 'forged'])
  })

  it('each expedition home reports its own haul, and the total matches the purse', () => {
    const s = roster()
    const [a, b] = ids(s)
    const seen = s.meta.lastSeenAtWorld
    const before: GameState = {
      ...s,
      heroes: {
        ...s.heroes,
        [a!]: { ...s.heroes[a!]!, expedition: { completesAtWorld: seen + 1000 } },
        [b!]: { ...s.heroes[b!]!, expedition: { completesAtWorld: seen + 2000 } },
      },
    }
    const after = advanceTime(before, toWorldTime(T0 + 3 * REAL_HOUR))
    const homes = summarizeAway(before, after).vignettes.filter((v) => v.kind === 'completion')
    expect(homes.map((v) => v.heroIds[0]).sort()).toEqual([a, b].sort())
    const hauls = homes.map((v) => Number(v.detail!.split(':')[1]))
    for (const n of hauls) expect(n).toBeGreaterThan(0)
    expect(hauls.reduce((x, y) => x + y, 0)).toBe(after.gems - before.gems)
  })

  it('a Master level-up and the heroes’ work are reported; the tally becomes "busy"', () => {
    const before = roster()
    const after: GameState = {
      ...before,
      gold: before.gold + 240,
      meta: { ...before.meta, masterLevel: before.meta.masterLevel + 1, lastSeenAtWorld: before.meta.lastSeenAtWorld + 1000 },
      life: { ...before.life, tally: { ...before.life.tally, jobGold: before.life.tally.jobGold + 240, meals: before.life.tally.meals + 6 } },
    }
    const sum = summarizeAway(before, after)
    expect(sum.vignettes[0]).toMatchObject({ kind: 'levelUp', detail: `master:${before.meta.masterLevel + 1}` })
    expect(sum.collect.gold).toBe(240)
    expect(sum.busy.meals).toBe(6)
    expect(VIGNETTE_WEIGHT.death).toBeGreaterThan(VIGNETTE_WEIGHT.friends)
  })

  it('"a summon is affordable" is news only when the absence made it so', () => {
    const cost = TUNING.gacha.normalCostGold
    const s = roster()
    const later = (g: GameState, gold: number): GameState => ({ ...g, gold, meta: { ...g.meta, lastSeenAtWorld: g.meta.lastSeenAtWorld + 1000 } })
    expect(summarizeAway({ ...s, gold: cost - 1 }, later(s, cost + 5)).ready.summonAffordable).toBe(true)
    expect(summarizeAway({ ...s, gold: cost * 3 }, later(s, cost * 3)).ready.summonAffordable).toBe(false)
    expect(summarizeAway({ ...s, gold: 0 }, later(s, cost - 1)).ready.summonAffordable).toBe(false)
  })

  it('is pure and deterministic over a real simulated absence', () => {
    const before = deepFreeze(roster(23, 8))
    const after = deepFreeze(advanceTime(before, toWorldTime(T0 + 30 * REAL_HOUR)))
    const a = summarizeAway(before, after)
    const b = summarizeAway(before, after)
    expect(a).toEqual(b)
    expect(a.vignettes.length).toBeLessThanOrEqual(W.maxVignettes)
    // A day and more away always brings something back (charges at least).
    expect(awayHasNews(a)).toBe(true)
    expect(a.collect.restedCharges).toBe(3)
    for (const v of a.vignettes) expect(v.at).toBeGreaterThan(before.meta.lastSeenAtWorld - 1)
  })
})
