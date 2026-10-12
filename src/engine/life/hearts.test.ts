import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { reduce, attemptFloorWithResult, tryoutWithResult } from '../store'
import { TUNING } from '../tuning'
import { giftDelta, collectionsOf, GIFTS } from '../favor'
import type { GameState, HeroId, OwnedHero, Trauma } from '../types'
import {
  consoleHero,
  consoleRefusal,
  dayOfSlot,
  favoriteOf,
  lifeOf,
  lifeReact,
  personalityOf,
  relationKey,
  slotOf,
  stepLife,
  tryout,
  tryoutRefusal,
  workPower,
} from '.'

const SLOT = TUNING.life.slotMs
const DAY = SLOT * TUNING.life.slotsPerDay
const TR = TUNING.life.trauma

function roster(seed: number, n = 9): GameState {
  let st: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) st = reduce(st, { type: 'SUMMON' })
  return st
}
function living(s: GameState): OwnedHero[] {
  return Object.values(s.heroes).filter((h) => h.alive)
}
/** Give every hero a life at world-time 0 (as the clock would). */
function alive(s: GameState): GameState {
  return stepLife(s, SLOT)
}
function withTrauma(s: GameState, id: HeroId, t: Trauma, extra: Partial<OwnedHero> = {}): GameState {
  const h = s.heroes[id]!
  return { ...s, heroes: { ...s.heroes, [id]: { ...h, ...extra, life: { ...lifeOf(h), trauma: t } } } }
}

describe('trauma: withdrawn', () => {
  it('a timid hero who loses a dear friend withdraws; a brave one grieves but carries on', () => {
    const s0 = alive(roster(41, 14))
    const heroes = living(s0)
    const timid = heroes.find((h) => personalityOf(h).courage < TR.withdrawCourage)!
    const brave = heroes.find((h) => personalityOf(h).courage >= TR.withdrawCourage)!
    const victim = heroes.find((h) => h.id !== timid.id && h.id !== brave.id)!
    const friends: GameState = {
      ...s0,
      life: {
        ...s0.life,
        relations: {
          [relationKey(victim.id, timid.id)]: { affinity: 85, shared: 5 },
          [relationKey(victim.id, brave.id)]: { affinity: 85, shared: 5 },
        },
      },
    }
    const dead = { ...friends, heroes: { ...friends.heroes, [victim.id]: { ...victim, alive: false } } }
    const after = lifeReact(friends, dead, { type: 'SYNTHESIZE', mode: 'salvage', survivorId: null, sacrificeIds: [victim.id] }, 0)
    expect(after.heroes[timid.id]!.life!.trauma?.kind).toBe('withdrawn')
    expect(after.heroes[timid.id]!.life!.memories.some((m) => m.kind === 'withdrew' && m.other === victim.id)).toBe(true)
    expect(after.heroes[brave.id]!.life!.trauma).toBeNull()
    expect(after.life.chronicle.some((e) => e.kind === 'withdrawn' && e.heroIds[0] === timid.id)).toBe(true)
  })

  it('a traumatized hero refuses the tower (no RNG drawn) and sits out the daily', () => {
    let s = roster(42, 4)
    const ids = living(s).map((h) => h.id).slice(0, 5)
    s = reduce(s, { type: 'SET_PARTY', slots: ids, lines: ['front', 'front', 'mid', 'back', 'back'] })
    s = withTrauma(alive(s), ids[1]!, { kind: 'withdrawn', sinceDay: 0, consoledDay: -1 })
    const { result } = attemptFloorWithResult(s)
    expect(result.refusedHeroIds).toContain(ids[1])
    expect(result.result.log.unitsInit.some((u) => u.id === ids[1])).toBe(false)
  })

  it('time heals: once grief has faded, the withdrawn come back after a few days', () => {
    let s = alive(roster(43))
    const id = living(s)[1]!.id
    s = withTrauma(s, id, { kind: 'withdrawn', sinceDay: 0, consoledDay: -1 })
    s = stepLife(s, (TR.withdrawnDays + 1) * DAY)
    const l = s.heroes[id]!.life!
    expect(l.trauma).toBeNull()
    expect(l.memories.some((m) => m.kind === 'recovered')).toBe(true)
    expect(s.life.chronicle.some((e) => e.kind === 'recovered' && e.heroIds[0] === id)).toBe(true)
  })

  it('a friend talks a withdrawn hero round before time would', () => {
    let s = alive(roster(44, 6))
    const ids = living(s).map((h) => h.id)
    const relations: GameState['life']['relations'] = {}
    for (const a of ids) for (const b of ids) if (a < b) relations[relationKey(a, b)] = { affinity: 80, shared: 2 }
    s = { ...s, life: { ...s.life, relations } }
    // Deep grief, so time alone cannot heal it inside the test window.
    const id = ids[1]!
    s = withTrauma(s, id, { kind: 'withdrawn', sinceDay: 0, consoledDay: -1 })
    s = { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, life: { ...s.heroes[id]!.life!, grief: 100 } } } }
    let recovered = false
    for (let d = 1; d <= TR.withdrawnDays - 1 && !recovered; d++) {
      s = stepLife(s, d * DAY)
      recovered = s.heroes[id]!.life!.trauma === null
    }
    expect(recovered).toBe(true)
    expect(s.heroes[id]!.life!.memories.some((m) => m.kind === 'recovered' && m.other !== undefined)).toBe(true)
  })
})

describe('trauma: burnout', () => {
  it('too many brushes with death, and a frayed mind, burn a hero out', () => {
    let s = roster(45, 4)
    const ids = living(s).map((h) => h.id).slice(0, 5)
    s = reduce(s, { type: 'SET_PARTY', slots: ids, lines: ['front', 'front', 'mid', 'back', 'back'] })
    s = alive(s)
    const id = ids[0]!
    const h = s.heroes[id]!
    const hard = Array.from({ length: TR.burnoutHard + 1 }, () => ({ kind: 'nearDeath' as const, day: 0, floor: 1, weight: 55 }))
    s = { ...s, heroes: { ...s.heroes, [id]: { ...h, sanity: 25, life: { ...h.life!, memories: [...h.life!.memories, ...hard] } } } }
    const after = reduce(s, { type: 'ATTEMPT_FLOOR' })
    expect(after.heroes[id]!.alive).toBe(true)
    expect(after.heroes[id]!.life!.trauma?.kind).toBe('burnout')
    expect(after.life.chronicle.some((e) => e.kind === 'burnout')).toBe(true)
  })

  it('a staff role as an instructor always lands, and the veteran teaches harder', () => {
    let s = alive(roster(46))
    s = { ...s, facilities: { ...s.facilities, trainingCenter: { level: 1, build: null } } }
    const id = living(s)[1]!.id
    s = withTrauma(s, id, { kind: 'burnout', sinceDay: 0, consoledDay: -1 })
    const before = workPower(s, s.heroes[id]!, 'instructor')
    const after = consoleHero(s, id, 0, 'instructor')
    const l = after.heroes[id]!.life!
    expect(l.trauma).toBeNull()
    expect(l.job).toBe('instructor')
    expect(l.veteran).toBe(true)
    expect(workPower(after, after.heroes[id]!, 'instructor')).toBeCloseTo(before * TR.veteranInstructor)
  })

  it('only the burnt-out are offered a staff role, and only with a seat free', () => {
    let s = alive(roster(47))
    const id = living(s)[1]!.id
    s = withTrauma(s, id, { kind: 'withdrawn', sinceDay: 0, consoledDay: -1 })
    expect(consoleRefusal(s, id, 0, 'instructor')).toMatch(/burnt-out/)
    s = withTrauma(s, id, { kind: 'burnout', sinceDay: 0, consoledDay: -1 })
    expect(consoleRefusal(s, id, 0, 'instructor')).toMatch(/Training Center/)
  })
})

describe('the Master’s talk', () => {
  it('needs a troubled hero, happens once a day, and earns favor even when it fails', () => {
    let s = alive(roster(48))
    const id = living(s)[1]!.id
    expect(() => consoleHero(s, id, 0)).toThrow(/not troubled/)
    s = withTrauma(s, id, { kind: 'withdrawn', sinceDay: 0, consoledDay: -1 }, { favor: 0 })
    let days = 0
    while (s.heroes[id]!.life!.trauma && days < 30) {
      const now = days * DAY
      const before = s.heroes[id]!.favor
      s = consoleHero(s, id, now)
      expect(s.heroes[id]!.favor).toBe(before + TR.consoleFavor)
      if (s.heroes[id]!.life!.trauma) expect(() => consoleHero(s, id, now)).toThrow(/already/)
      days++
    }
    expect(s.heroes[id]!.life!.trauma).toBeNull()
    expect(s.heroes[id]!.life!.memories.some((m) => m.kind === 'recovered' && m.detail === 'master')).toBe(true)
  })
})

describe('favoritism', () => {
  it('lavishing one hero makes them the favourite, and the others feel it each day', () => {
    let s = alive(roster(49, 5))
    s = { ...s, gold: 1_000_000 }
    const fav = living(s)[2]!.id
    const gifts = Object.keys(GIFTS).filter((g) => GIFTS[g]!.gems === 0)
    for (let i = 0; i < 10; i++) s = reduce(s, { type: 'GIVE_GIFT', heroId: fav, giftId: gifts[i % gifts.length]! })
    expect(s.life.attention[fav]).toBe(10)
    expect(favoriteOf(s)).toBe(fav)
    const other = living(s).find((h) => h.id !== fav && h.favor < 60)!
    const after = stepLife(s, DAY + SLOT)
    expect(after.life.favorite).toBe(fav)
    expect(after.life.chronicle.some((e) => e.kind === 'favoritism' && e.heroIds[0] === fav)).toBe(true)
    expect(after.heroes[other.id]!.favor).toBeLessThan(other.favor)
    // Attention cools by the day.
    expect(after.life.attention[fav]).toBeCloseTo(10 * TUNING.life.favoritism.decayPerDay)
  })

  it('attention spread across the lobby picks no favourite', () => {
    let s = alive(roster(50, 5))
    s = { ...s, gold: 1_000_000 }
    for (const h of living(s)) for (let i = 0; i < 3; i++) s = reduce(s, { type: 'GIVE_GIFT', heroId: h.id, giftId: 'honey_cake' })
    expect(favoriteOf(s)).toBeNull()
  })
})

describe('gift meaning drift', () => {
  it('the same gift sours, then becomes a collection they love', () => {
    let s = alive(roster(51))
    s = { ...s, gold: 1_000_000 }
    const id = living(s)[1]!.id
    const deltas: number[] = []
    for (let i = 0; i < TUNING.favor.collectAt + 2; i++) {
      deltas.push(giftDelta(s.heroes[id]!, 'glow_stick'))
      s = reduce(s, { type: 'GIVE_GIFT', heroId: id, giftId: 'glow_stick' })
    }
    expect(deltas[TUNING.favor.repeatSour]).toBeLessThan(0)
    expect(deltas[TUNING.favor.collectAt]).toBe(TUNING.favor.collectionFavor)
    expect(collectionsOf(s.heroes[id]!)).toEqual([['glow_stick', TUNING.favor.collectAt + 2]])
    expect(s.heroes[id]!.life!.memories.some((m) => m.kind === 'collection')).toBe(true)
    expect(s.life.chronicle.filter((e) => e.kind === 'collection')).toHaveLength(1)
  })
})

describe('tryouts', () => {
  function setup(seed: number): { s: GameState; holder: HeroId; challenger: HeroId } {
    let s = roster(seed, 6)
    const ids = living(s).map((h) => h.id)
    s = reduce(s, { type: 'SET_PARTY', slots: [ids[0]!, ids[1]!, null, null, null], lines: ['front', 'front', 'mid', 'back', 'back'] })
    return { s: alive(s), holder: ids[1]!, challenger: ids[4]! }
  }

  it('the duel decides the seat; the loser smarts and a rivalry starts', () => {
    const { s, holder, challenger } = setup(52)
    const { state, result } = tryout(s, challenger, holder, 0)
    expect([challenger, holder]).toContain(result.winnerId)
    expect(state.party.slots[1]).toBe(result.seatTaken ? challenger : holder)
    expect(state.heroes[result.loserId]!.sanity).toBeCloseTo(s.heroes[result.loserId]!.sanity - TUNING.life.tryout.loserSanity)
    expect(state.life.relations[relationKey(holder, challenger)]!.affinity).toBe(-TUNING.life.tryout.rivalry)
    expect(state.heroes[result.loserId]!.life!.memories.some((m) => m.kind === 'lostTryout' && m.other === result.winnerId)).toBe(true)
    expect(state.life.chronicle.at(-1)!.kind).toBe('tryout')
    expect(living(state).every((h) => s.heroes[h.id]!.alive)).toBe(true)
  })

  it('is deterministic, and the store’s preview matches the dispatch', () => {
    const { s, holder, challenger } = setup(53)
    const a = tryoutWithResult(s, challenger, holder, 0)
    const b = reduce(s, { type: 'TRYOUT', challengerId: challenger, holderId: holder })
    expect(b.party).toEqual(a.state.party)
    expect(b.life.duels.count).toBe(1)
  })

  it('one duel a day; seated heroes cannot challenge; the troubled cannot duel', () => {
    const { s, holder, challenger } = setup(54)
    const done = tryout(s, challenger, holder, 0).state
    const holderNow = done.party.slots[1]!
    const outside = holderNow === holder ? challenger : holder
    expect(tryoutRefusal(done, outside, holderNow, 0)).toMatch(/one duel a day/)
    expect(dayOfSlot(slotOf(DAY))).toBe(1)
    expect(tryoutRefusal(done, done.party.slots[0]!, holderNow, DAY)).toMatch(/already holds/)
    const troubled = withTrauma(done, outside, { kind: 'burnout', sinceDay: 0, consoledDay: -1 })
    expect(tryoutRefusal(troubled, outside, holderNow, DAY)).toMatch(/willing/)
  })
})
