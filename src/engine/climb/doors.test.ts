/** Doors: player-chosen risk for the next floor (spec 2026-10-12 S13). */
import { describe, it, expect } from 'vitest'
import { rollDoors, chooseDoor, chooseDoorRefusal, doorsOfferedFor, doorReward, cacheGold, DOOR_REWARD } from './doors'
import { boonOffer, canEarnBoon } from './boons'
import { floorKindBase } from './kinds'
import { playFloor } from '../tower'
import { createAccount } from '../account'
import { reduce } from '../store'
import { suggestParty } from '../scout'
import { TUNING } from '../tuning'
import type { BoonId, Door, GameState, HeroId, OwnedHero } from '../types'

const CL = TUNING.climb

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
  }
  return o
}

function roster(seed: number, n: number): GameState {
  let s: GameState = { ...createAccount(seed, { now: 0 }), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  return reduce(s, { type: 'SET_PARTY', ...suggestParty(s) })
}

/** A party of gods: every floor falls. */
function gods(seed = 9): GameState {
  const s = roster(seed, 4)
  const heroes: Record<HeroId, OwnedHero> = {}
  for (const h of Object.values(s.heroes)) {
    heroes[h.id] = { ...h, star: 7, xp: { ...h.xp, level: 150 }, baseAttrs: { str: 999, agi: 999, vit: 999, int: 999, wil: 999 } }
  }
  return { ...s, heroes, gold: 0 }
}

function at(s: GameState, floor: number, doors: Door[] | null = null): GameState {
  return { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1, doors, kind: doors?.[0]?.kind ?? floorKindBase(floor) } }
}

describe('rollDoors', () => {
  const s = createAccount(42, { now: 0 })

  it('offers Doors from F3 on, never for an anchor, the F36-40 loop, the Wall or past the summit', () => {
    expect(rollDoors(s, 1)).toBeNull()
    expect(rollDoors(s, 2)).toBeNull()
    expect(rollDoors(s, 3)).not.toBeNull()
    for (const f of [5, 10, 41, 42, 36, 37, 38, 39, 40, 80, 85, 89, 101]) expect(rollDoors(s, f), `F${f}`).toBeNull()
    for (const f of [3, 4, 6, 9, 11, 31, 34, 43, 79, 91, 99]) expect(doorsOfferedFor(f), `F${f}`).toBe(true)
  })

  it('always offers `offered` Doors, the first a fight the party was going to have anyway', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const a = createAccount(seed, { now: 0 })
      for (const f of [3, 4, 6, 7, 8, 9, 11, 14, 16, 19, 21, 24]) {
        const d = rollDoors(a, f)!
        expect(d).toHaveLength(CL.doors.offered)
        expect(['path', 'breather']).toContain(d[0]!.kind)
        expect(new Set(d.map((x) => x.kind)).size).toBe(d.length)
        for (const door of d) expect(door.reward).toBe(DOOR_REWARD[door.kind])
      }
    }
  })

  it('the Skull promises a Boon only while the Sortie can still take one (review #21)', () => {
    const full = ['ironVow', 'warChest', 'calmMind', 'volley'] as BoonId[]
    expect(full).toHaveLength(CL.boons.max)
    const withBoons = (boons: BoonId[] | null): GameState => ({
      ...s,
      tower: { ...s.tower, sortie: boons === null ? null : { startFloor: 3, floors: 1, purse: 0, boons } },
    })
    // On campus a new Sortie starts empty, so the Skull's Boon is real; so it is with room left.
    for (const st of [withBoons(null), withBoons([]), withBoons(full.slice(0, 3))]) {
      expect(canEarnBoon(st)).toBe(true)
      expect(doorReward(st, 'elite')).toBe('boon')
    }
    // A full Sortie: no Boon can be offered, so the Door must not advertise one.
    const capped = withBoons(full)
    expect(canEarnBoon(capped)).toBe(false)
    expect(boonOffer(capped, 7)).toEqual([])
    expect(doorReward(capped, 'elite')).toBe('stones')
    for (const f of [4, 7, 8, 9]) {
      for (const d of rollDoors(capped, f)!) expect(d.reward, `F${f} ${d.kind}`).not.toBe('boon')
    }
    // Other Doors are untouched.
    for (const k of ['path', 'breather', 'rest', 'cache'] as const) expect(doorReward(capped, k)).toBe(DOOR_REWARD[k])
  })

  it('a Skull cleared with a full Sortie opens no Boon, as its Door said', () => {
    const full = ['ironVow', 'warChest', 'calmMind', 'volley'] as BoonId[]
    for (const seed of [1, 2, 3]) {
      const g = gods(seed)
      const st: GameState = { ...g, tower: { ...g.tower, currentFloor: 4, highestCleared: 3, kind: 'elite', doors: null, event: null, sortie: { startFloor: 3, floors: 1, purse: 0, boons: full } } }
      const r = playFloor(st).result
      expect(r.cleared).toBe(true)
      expect(r.event).toBeNull()
      expect(doorReward(st, 'elite')).not.toBe('boon')
    }
  })

  it('a Breather follows a boss; a Rest stop only comes before one', () => {
    const kinds = new Set<string>()
    for (let seed = 1; seed <= 80; seed++) {
      const a = createAccount(seed, { now: 0 })
      expect(rollDoors(a, 6)![0]!.kind).toBe('breather')
      expect(rollDoors(a, 11)![0]!.kind).toBe('breather')
      expect(rollDoors(a, 7)![0]!.kind).toBe('path')
      for (const f of [6, 7, 8]) expect(rollDoors(a, f)!.some((d) => d.kind === 'rest'), `F${f}`).toBe(false)
      for (const d of rollDoors(a, 9)!) kinds.add(d.kind)
      for (const d of rollDoors(a, 7)!) kinds.add(d.kind)
    }
    // Over many seeds the second Door is sometimes a Rest (before a boss) or a Cache.
    expect(kinds).toEqual(new Set(['path', 'elite', 'rest', 'cache']))
  })

  it('is deterministic per floor: retrying never re-rolls the Doors', () => {
    expect(rollDoors(s, 7)).toEqual(rollDoors(s, 7))
    expect(rollDoors(createAccount(42, { now: 999 }), 7)).toEqual(rollDoors(s, 7))
  })
})

describe('chooseDoor', () => {
  const doors: Door[] = [
    { kind: 'path', reward: 'gold' },
    { kind: 'elite', reward: 'boon' },
  ]

  it('a fight Door sets the floor’s kind and closes the choice (pure)', () => {
    const s = deepFreeze(at(roster(3, 4), 7, doors))
    const next = chooseDoor(s, 1)
    expect(next.tower.kind).toBe('elite')
    expect(next.tower.doors).toBeNull()
    expect(next.tower.currentFloor).toBe(7)
    expect(s.tower.kind).toBe('path')
  })

  it('is refused with no Doors open, a bad index, or an event waiting', () => {
    const s = at(roster(3, 4), 7, doors)
    expect(chooseDoorRefusal(at(roster(3, 4), 7), 0)).toMatch(/No doors/)
    expect(() => chooseDoor(s, 2)).toThrow(/no such door/)
    expect(() => chooseDoor(s, -1)).toThrow(/no such door/)
    const withEvent = { ...s, tower: { ...s.tower, event: { kind: 'boon' as const, floor: 6, options: ['volley'] } } }
    expect(() => chooseDoor(withEvent, 0)).toThrow(/event/)
  })

  it('a Rest stop restores the party’s Sanity, cooks a meal and advances with no fight', () => {
    const base = roster(3, 4)
    const tired: Record<HeroId, OwnedHero> = {}
    for (const h of Object.values(base.heroes)) tired[h.id] = { ...h, sanity: 40 }
    const s = deepFreeze(at({ ...base, heroes: tired }, 9, [doors[0]!, { kind: 'rest', reward: 'sanity' }]))
    const next = chooseDoor(s, 1)
    expect(next.tower.currentFloor).toBe(10)
    expect(next.tower.highestCleared).toBe(9)
    expect(next.tower.kind).toBe('boss')
    expect(next.tower.doors).toBeNull()
    expect(next.life.pantry).toBe(s.life.pantry + CL.reward.restMeals)
    for (const id of s.party.slots) if (id) expect(next.heroes[id]!.sanity).toBe(40 + CL.reward.restSanity)
    // No floor pay, no Master XP or PI.
    expect(next.gold).toBe(s.gold)
    expect(next.meta).toEqual(s.meta)
  })

  it('a Cache pays gold and stones and advances; the next floor’s Doors are rolled', () => {
    const s = at(roster(3, 4), 7, [doors[0]!, { kind: 'cache', reward: 'stones' }])
    const next = chooseDoor(s, 1)
    expect(next.gold).toBe(s.gold + cacheGold(s, 7))
    expect(cacheGold(s, 7)).toBe(CL.reward.cacheGoldPerFloor * 7)
    expect(next.materials.promotionStone ?? 0).toBe((s.materials.promotionStone ?? 0) + CL.reward.cacheStones)
    expect(next.tower.currentFloor).toBe(8)
    expect(next.tower.doors).toEqual(rollDoors(s, 8))
    expect(next.tower.kind).toBe(next.tower.doors![0]!.kind)
  })

  it('goes through the store as CHOOSE_DOOR', () => {
    const s = at(roster(3, 4), 7, doors)
    expect(reduce(s, { type: 'CHOOSE_DOOR', index: 1 }).tower.kind).toBe('elite')
  })
})

describe('Doors in the climb', () => {
  it('every first clear from F2 on rolls Doors for the next floor (2 from F3), and never blocks the climb', () => {
    let s = at(gods(), 1)
    for (let f = 1; f <= 14; f++) {
      const { state, result } = playFloor(s)
      expect(result.cleared, `F${f}`).toBe(true)
      expect(result.doors ?? null).toEqual(rollDoors(s, f + 1))
      if (f + 1 >= 3 && floorKindBase(f + 1) !== 'boss') expect(result.doors, `F${f + 1}`).toHaveLength(2)
      // ATTEMPT_FLOOR with no choice fights doors[0].
      if (result.doors) expect(state.tower.kind).toBe(result.doors[0]!.kind)
      s = state
      // Only Boon choices (after an Elite or a Boss) block; the bot takes the first.
      while (s.tower.event) s = reduce(s, { type: 'RESOLVE_EVENT', option: s.tower.event.options.includes('rest') ? 'rest' : s.tower.event.options[0]! })
    }
    expect(s.tower.currentFloor).toBe(15)
  })

  it('a chosen Skull is fought as an Elite: double gold, a Promotion Stone and a Boon choice', () => {
    const doors: Door[] = [
      { kind: 'path', reward: 'gold' },
      { kind: 'elite', reward: 'boon' },
    ]
    const s = at(gods(), 7, doors)
    const path = playFloor(s).result
    const skull = playFloor(chooseDoor(s, 1))
    expect(skull.result.kind).toBe('elite')
    expect(skull.result.goldAwarded).toBe(path.goldAwarded * CL.reward.eliteGoldMult)
    expect(skull.result.materialsAwarded.promotionStone ?? 0).toBeGreaterThanOrEqual(CL.reward.eliteStones)
    expect(skull.result.event?.kind).toBe('boon')
    expect(path.event).toBeNull()
  })

  it('a lost floor re-offers its Doors, so a beaten Skull can be swapped for the Path', () => {
    const doors = rollDoors(createAccount(5, { now: 0 }), 9)!
    const s = at(roster(5, 4), 9, doors)
    const skull = doors.findIndex((d) => d.kind === 'elite')
    expect(skull).toBeGreaterThan(0)
    // The party sounds the retreat at once: the floor is not cleared.
    const { state, result } = playFloor(chooseDoor(s, skull), undefined, undefined, undefined, [{ tick: 1, kind: 'retreat' }])
    expect(result.cleared).toBe(false)
    expect(state.tower.doors).toEqual(doors)
    expect(state.tower.kind).toBe(doors[0]!.kind)
  })
})
