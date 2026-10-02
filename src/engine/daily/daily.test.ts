import { describe, it, expect } from 'vitest'
import {
  scaleDailyReward,
  worldDayIndex,
  dailyDungeonFor,
  dailyReward,
  dailyUnlocked,
  dailyAttemptsLeft,
  attemptDaily,
} from './daily'
import { xpToNext } from '../stats'
import { createAccount } from '../account'
import { TUNING } from '../tuning'
import type { GameState, OwnedHero, HeroId, Star } from '../types'

const D = TUNING.lobby.daily
const WORLD_DAY_MS = 24 * 3_600_000

/** A wildly overpowered hero that one-shots low-level daily filler. */
function strongHero(id = 'h_str'): OwnedHero {
  return {
    id: id as HeroId,
    name: 'Crusher',
    star: 6 as Star,
    heroClass: 'warrior',
    element: 'fire',
    baseAttrs: { str: 100, agi: 100, vit: 100, int: 100, wil: 100 },
    growthGrades: { str: 10, agi: 10, vit: 10, int: 10, wil: 10 },
    skills: [],
    portraitToken: '#fff',
    origin: 'procedural',
    xp: { level: 80, xpIntoLevel: 0, heldXp: 0, atCap: false },
    alive: true,
    sanity: 100,
    promotion: null,
    equipment: { weapon: null, armor: null, accessory: null },
    training: null,
    engraving: null,
    favor: 35,
    bondTier: 1,
    ip: 0,
    gift: { last: null, streak: 0 },
    blessed: false,
    expedition: null,
    captiveOf: null,
    bondGroup: null,
  }
}

/** A glass hero that loses to anything past floor 1. */
function weakHero(id = 'h_weak'): OwnedHero {
  return { ...strongHero(id), name: 'Glass', star: 1 as Star, baseAttrs: { str: 1, agi: 1, vit: 1, int: 1, wil: 1 }, growthGrades: { str: 0, agi: 0, vit: 0, int: 0, wil: 0 }, xp: { level: 1, xpIntoLevel: 0, heldXp: 0, atCap: false } }
}

function dailyState(opts: {
  hero?: OwnedHero
  highestCleared?: number
  attemptsUsed?: number
  gems?: number
}): GameState {
  const acct = createAccount(7, { now: 0 })
  const hero = opts.hero ?? strongHero()
  const highestCleared = opts.highestCleared ?? 1
  return {
    ...acct,
    heroes: { [hero.id]: hero },
    party: { slots: [hero.id, null, null, null, null], lines: ['front', 'front', 'mid', 'back', 'back'] },
    tower: { currentFloor: highestCleared + 1, highestCleared, attemptIndex: 0, event: null, loop: null, hiddenFound: [], worldEnded: false, worldSaved: false },
    dailies: { attemptsUsed: opts.attemptsUsed ?? 0, lastResetWorldDay: 0 },
    gems: opts.gems ?? 0,
    materials: {},
  }
}

/** A nowWorld value that lands inside world-day `d`. */
const inDay = (d: number) => d * WORLD_DAY_MS + 1000

describe('worldDayIndex', () => {
  it('is the floor of world-time over one world-day', () => {
    expect(worldDayIndex(0)).toBe(0)
    expect(worldDayIndex(WORLD_DAY_MS - 1)).toBe(0)
    expect(worldDayIndex(WORLD_DAY_MS)).toBe(1)
    expect(worldDayIndex(3 * WORLD_DAY_MS + 500)).toBe(3)
  })
})

describe('dailyDungeonFor', () => {
  it('cycles a 7-day rotation', () => {
    expect(dailyDungeonFor(0).id).toBe(dailyDungeonFor(7).id)
    const ids = new Set([0, 1, 2, 3, 4, 5, 6].map((d) => dailyDungeonFor(d).id))
    expect(ids.size).toBe(7)
  })
})

describe('dailyReward', () => {
  it('Monday (day 0) yields the Gold Vault gold reward', () => {
    expect(dailyReward(0).gold).toBe(D.rewards.goldVault)
  })
  it('Wednesday (day 2) yields Promotion Stones + rank material', () => {
    const r = dailyReward(2)
    expect(r.materials?.promotionStone).toBe(D.rewards.promotionStones)
    expect(r.materials?.rankMaterial).toBe(D.rewards.rankMaterials)
  })
  it('Tuesday (day 1) yields an Attribute Stone of the rotating element', () => {
    const r = dailyReward(1)
    const keys = Object.keys(r.materials ?? {})
    expect(keys.some((k) => k.startsWith('attrStone_'))).toBe(true)
  })
  it('Friday (day 4) yields a gem bundle', () => {
    expect(dailyReward(4).gems).toBe(D.rewards.gemsBundle)
  })
})

describe('dailyUnlocked / dailyAttemptsLeft', () => {
  it('is locked until the player has cleared the unlock floor', () => {
    expect(dailyUnlocked(dailyState({ highestCleared: 0 }))).toBe(false)
    expect(dailyUnlocked(dailyState({ highestCleared: D.unlockHighestCleared }))).toBe(true)
  })
  it('reports the free attempts remaining', () => {
    expect(dailyAttemptsLeft(dailyState({ attemptsUsed: 0 }))).toBe(D.freeAttempts)
    expect(dailyAttemptsLeft(dailyState({ attemptsUsed: D.freeAttempts + 5 }))).toBe(0)
  })
})

describe('attemptDaily', () => {
  it('throws when dailies are still locked', () => {
    expect(() => attemptDaily(dailyState({ highestCleared: 0 }), inDay(0))).toThrow(/lock/i)
  })

  it('grants the weekday reward and increments attemptsUsed on a win', () => {
    const before = dailyState({ highestCleared: 1 }) // floor-1 daily → crusher wins
    const { state: after, result } = attemptDaily(before, inDay(0)) // day 0 = Gold Vault
    expect(result.cleared).toBe(true)
    // Rewards scale with depth: ×(1 + highestCleared × depthScalePerFloor).
    expect(after.gold).toBe(before.gold + Math.round(D.rewards.goldVault * (1 + 1 * D.depthScalePerFloor)))
    expect(after.dailies.attemptsUsed).toBe(1)
  })

  it('is fought at the party\'s level when it has fallen behind (the catch-up faucet)', () => {
    const strong = { ...strongHero(), xp: { level: 1, xpIntoLevel: 0, heldXp: 0, atCap: false } }
    const before = dailyState({ hero: strong, highestCleared: 40 })
    const { result } = attemptDaily(before, inDay(0))
    expect(result.cleared).toBe(true) // a Lv1 party faces a Lv1 daily, not F40
  })

  it('scales rewards with the Master\'s depth (gems stay flat)', () => {
    expect(scaleDailyReward({ gold: 600 }, 0).gold).toBe(600)
    expect(scaleDailyReward({ gold: 600 }, 30).gold).toBe(Math.round(600 * (1 + 30 * D.depthScalePerFloor)))
    expect(scaleDailyReward({ gems: 20 }, 50).gems).toBe(20)
    const deep = scaleDailyReward({ materials: { promotionStone: 2 } }, 40).materials!.promotionStone!
    expect(deep).toBe(Math.round(2 * (1 + 40 * D.depthScalePerFloor)))
    // The Proving Hall's XP keeps up with the XP curve (never below the flat floor).
    expect(scaleDailyReward({ heroXp: 120 }, 0).heroXp).toBe(120)
    expect(scaleDailyReward({ heroXp: 120 }, 30).heroXp).toBe(Math.round(xpToNext(30) * D.provingHallXpShare))
  })

  it('is NON-LETHAL — a losing run never permakills a hero (no 4th permadeath source)', () => {
    // A Lv30 hero with no stats to speak of: the daily is fought at its level (F30) and lost.
    const weak = { ...weakHero(), xp: { level: 30, xpIntoLevel: 0, heldXp: 0, atCap: false } }
    const before = dailyState({ hero: weak, highestCleared: 30 })
    const { state: after, result } = attemptDaily(before, inDay(0))
    expect(result.cleared).toBe(false)
    expect(after.heroes[weak.id]!.alive).toBe(true) // still alive
    expect(after.gold).toBe(before.gold) // no reward on a loss
    expect(after.dailies.attemptsUsed).toBe(1) // attempt still consumed
  })

  it('charges gems for attempts beyond the free allotment', () => {
    const before = dailyState({ highestCleared: 1, attemptsUsed: D.freeAttempts, gems: 100 })
    const { state: after } = attemptDaily(before, inDay(0))
    expect(after.gems).toBe(100 - D.extraAttemptGemCost)
  })

  it('throws when out of free attempts and unable to afford the gem refill', () => {
    const before = dailyState({ highestCleared: 1, attemptsUsed: D.freeAttempts, gems: D.extraAttemptGemCost - 1 })
    expect(() => attemptDaily(before, inDay(0))).toThrow(/attempt|gem/i)
  })

  it('grants hero XP to deployed survivors on a Proving Hall win (day 3)', () => {
    const before = dailyState({ highestCleared: 1 })
    const beforeXp = before.heroes['h_str' as HeroId]!.xp
    const { state: after } = attemptDaily(before, inDay(3)) // Thu → hero XP
    const afterXp = after.heroes['h_str' as HeroId]!.xp
    expect(afterXp.level >= beforeXp.level && afterXp.xpIntoLevel >= beforeXp.xpIntoLevel).toBe(true)
    expect(afterXp).not.toEqual(beforeXp)
  })

  it('survivors auto-learn skills from their casts (reported on the result)', () => {
    const xpToLv2 = TUNING.skills.xpToNext[1]!
    const hero = { ...strongHero(), skills: [{ id: 'power_strike', level: 1, xp: xpToLv2 - 1 }] }
    // A dungeon deep enough that its foes outlast a basic swing (the AI keeps its SP when
    // a plain blow would kill just as well).
    const { state: after, result } = attemptDaily(dailyState({ hero, highestCleared: 70 }), inDay(0))
    const level = after.heroes['h_str' as HeroId]!.skills[0]!.level
    expect(level).toBeGreaterThanOrEqual(2)
    expect(result.skillProgress).toContainEqual({ kind: 'level-up', heroId: 'h_str', skillId: 'power_strike', level })
  })

  it('is deterministic in (state, nowWorld)', () => {
    const before = dailyState({ highestCleared: 1 })
    expect(attemptDaily(before, inDay(0)).state).toEqual(attemptDaily(before, inDay(0)).state)
  })

  it('is pure — the input state is not mutated', () => {
    const before = dailyState({ highestCleared: 1 })
    const goldBefore = before.gold
    attemptDaily(before, inDay(0))
    expect(before.gold).toBe(goldBefore)
    expect(before.dailies.attemptsUsed).toBe(0)
  })
})

describe('Elemental Trial rotation', () => {
  it('a given weekday cycles through every element over the weeks (no lock-in)', () => {
    const tuesdays = Array.from({ length: 7 }, (_, w) => 7 * w + 1)
    const els = new Set(tuesdays.map((d) => Object.keys(dailyReward(d).materials ?? {})[0]))
    expect(els.size).toBe(TUNING.lobby.daily.elementRotation.length)
  })
})
