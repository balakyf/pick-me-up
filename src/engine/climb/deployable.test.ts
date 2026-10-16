/**
 * One deployability predicate (`isFightable`): the mercy director, playFloor's deploy
 * filter and the scout must always see the same heroes (review findings #3, #4).
 */
import { describe, it, expect } from 'vitest'
import { directorHeroes, isFightable, isRested, rosterCp, floorBudget } from './kinds'
import { createAccount } from '../account'
import { reduce, attemptFloorWithResult } from '../store'
import { playFloor } from '../tower'
import { canFight, scoutFloor, scoutUnits, suggestParty } from '../scout'
import { buildCombatUnit } from '../unit'
import { SKILLS } from '../content'
import { toWorldTime } from '../time/time'
import { TUNING } from '../tuning'
import type { GameState, HeroId, OwnedHero } from '../types'

/** A summoned roster of `n` (plus the starter), the suggested party set, standing on `floor`. */
function roster(seed: number, n: number, floor: number): GameState {
  let s: GameState = { ...createAccount(seed, { now: 0 }), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  s = reduce(s, { type: 'SET_PARTY', ...suggestParty(s) })
  return { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1 } }
}

const partyIds = (s: GameState): HeroId[] => s.party.slots.filter((id): id is HeroId => id !== null && id !== undefined)
const patch = (s: GameState, ids: HeroId[], f: (h: OwnedHero) => OwnedHero): GameState => {
  const heroes = { ...s.heroes }
  for (const id of ids) heroes[id] = f(heroes[id]!)
  return { ...s, heroes }
}
const promoting = (h: OwnedHero): OwnedHero => ({ ...h, promotion: { completesAtWorld: 9e15 } })
const deployed = (s: GameState): HeroId[] => {
  const r = playFloor(s).result.result
  return [...r.survivorHeroIds, ...r.fallenHeroIds]
}

describe('one deployability predicate (#4: promoting heroes)', () => {
  it('the scout reads the same predicate as the director', () => {
    expect(canFight).toBe(isFightable)
  })

  it('a hero mid-promotion is never deployed by playFloor (the director leaves it out too)', () => {
    for (const seed of [1, 2, 3]) {
      const s = roster(seed * 7, 10, 13)
      const ids = partyIds(s)
      const p = patch(s, ids.slice(0, 2), promoting)
      const sent = deployed(p)
      expect(sent.length, `seed ${seed}`).toBe(ids.length - 2)
      for (const id of sent) expect(isFightable(p.heroes[id]!)).toBe(true)
      for (const id of ids.slice(0, 2)) expect(sent).not.toContain(id)
    }
  })

  it('a party made only of promoting heroes deploys no one (and fights no free floor)', () => {
    const s = roster(11, 10, 13)
    const p = patch(s, partyIds(s), promoting)
    expect(deployed(p)).toEqual([])
    expect(playFloor(p).result.cleared).toBe(false)
  })

  it('the heroes the director counts in the party are exactly the heroes that fight', () => {
    for (const seed of [4, 5]) {
      const s = roster(seed * 13, 10, 12)
      const ids = partyIds(s)
      const p = patch(s, ids.slice(0, 3), promoting)
      // The director now reads the bench in place of the promoting heroes — and the battle
      // fields the same (lighter) party, so the budget is honest for who fights.
      expect(rosterCp(p)).toBeLessThan(rosterCp(s))
      expect(floorBudget(p, 12, 'path')).toBeLessThanOrEqual(floorBudget(s, 12, 'path'))
      const sent = deployed(p)
      expect(sent.length).toBe(ids.length - 3)
      // Every hero playFloor sends is one the director could count…
      for (const id of sent) expect(isFightable(p.heroes[id]!)).toBe(true)
      // …and the scout's partyCp is built from exactly those heroes.
      const heroes = partyIds(p).filter((id) => sent.includes(id)).map((id) => p.heroes[id]!)
      const cp = scoutUnits(p, heroes).reduce((n, u) => n + u.cp, 0)
      expect(scoutFloor(p)!.partyCp).toBe(cp)
    }
  })
})

describe('the director reads the heroes the game would send (#3: tired heroes)', () => {
  const R = TUNING.climb.restedSanity
  const unitCp = (s: GameState, h: OwnedHero) => buildCombatUnit(h, 'front', SKILLS, s.inventory).cp
  const top5 = (s: GameState, hs: OwnedHero[]) =>
    hs
      .map((h) => unitCp(s, h))
      .sort((a, b) => b - a)
      .slice(0, TUNING.account.partySize)
      .reduce((n, c) => n + c, 0)
  /** A roster of 10 whose five strongest are tired (just under the rested line). */
  const tiredCarries = (seed: number) => {
    const s = roster(seed, 10, 20)
    const best = Object.values(s.heroes)
      .filter(isFightable)
      .sort((a, b) => unitCp(s, b) - unitCp(s, a))
      .slice(0, 5)
      .map((h) => h.id)
    return { s: patch(s, best, (h) => ({ ...h, sanity: R - 4 })), best }
  }

  it('suggestParty benches tired heroes at the same line the director uses', () => {
    const { s, best } = tiredCarries(2)
    const p = suggestParty(s)
    for (const id of best) expect(p.slots).not.toContain(id)
    for (const id of p.slots) if (id) expect(isRested(s.heroes[id]!)).toBe(true)
  })

  it('a tired hero on the bench is not counted: the floor is sized for the party Suggest sends', () => {
    for (const seed of [2, 3, 5]) {
      const { s, best } = tiredCarries(seed)
      const sent = reduce(s, { type: 'SET_PARTY', ...suggestParty(s) })
      const read = directorHeroes(sent).map((h) => h.id)
      for (const id of best) expect(read).not.toContain(id)
      expect(rosterCp(sent)).toBe(top5(sent, Object.values(sent.heroes).filter(isRested)))
      // The director and the battle see the same heroes: the suggested party is what it reads.
      const partyCp = partyIds(sent).reduce((n, id) => n + unitCp(sent, sent.heroes[id]!), 0)
      expect(partyCp / rosterCp(sent), `seed ${seed}`).toBeGreaterThan(0.95)
    }
  })

  it('a tired hero who is sent does count: tiring the carries and fielding them buys nothing', () => {
    const { s, best } = tiredCarries(2)
    const fielded = reduce(s, { type: 'SET_PARTY', slots: best, lines: ['front', 'front', 'mid', 'back', 'back'] })
    expect(rosterCp(fielded)).toBe(top5(fielded, Object.values(fielded.heroes).filter(isFightable)))
    const suggested = reduce(s, { type: 'SET_PARTY', ...suggestParty(s) })
    expect(floorBudget(fielded, 20, 'boss')).toBeGreaterThan(floorBudget(suggested, 20, 'boss'))
  })

  it('sending a weak party never lowers the floor', () => {
    const s = roster(6, 10, 12)
    const weakest = Object.values(s.heroes)
      .filter(isFightable)
      .sort((a, b) => unitCp(s, a) - unitCp(s, b))
      .slice(0, 5)
      .map((h) => h.id)
    const weak = reduce(s, { type: 'SET_PARTY', slots: weakest, lines: ['front', 'front', 'mid', 'back', 'back'] })
    expect(rosterCp(weak)).toBe(rosterCp(s))
    expect(floorBudget(weak, 12, 'path')).toBe(floorBudget(s, 12, 'path'))
  })

  it('the Suggest-only climb meets no F20 wall: the boss is built for the party that fights it', () => {
    // Review repro (seed 2): before F20 Suggest benched four tired heroes, yet the director
    // built Halgiraf for them (rosterCp 2125 against a 1098 party: a 3-death rout).
    let s: GameState = reduce(null, { type: 'NEW_ACCOUNT', seed: 2, now: 0 })
    s = reduce(s, { type: 'SUMMON', count: 10 })
    let real = 0
    const step = () => {
      real += 180000
      s = reduce(s, { type: 'TICK' }, toWorldTime(real))
      for (let i = 0; i < 5 && s.tower.event !== null; i++) s = reduce(s, { type: 'RESOLVE_EVENT', option: s.tower.event.options[0]! }, toWorldTime(real))
      s = reduce(s, { type: 'SET_PARTY', ...suggestParty(s) })
    }
    // Bounded: a climb that stalls below F20 fails here instead of hanging the suite.
    for (let guard = 0; s.tower.currentFloor < 20; guard++) {
      expect(guard, `stalled on F${s.tower.currentFloor}`).toBeLessThan(200)
      step()
      s = attemptFloorWithResult(s).state
    }
    step()
    const benchedTired = Object.values(s.heroes).filter((h) => isFightable(h) && !isRested(h) && !partyIds(s).includes(h.id))
    expect(benchedTired.length).toBeGreaterThan(0)
    const partyCp = partyIds(s).reduce((n, id) => n + unitCp(s, s.heroes[id]!), 0)
    expect(partyCp / rosterCp(s)).toBeGreaterThan(0.95)
    expect(attemptFloorWithResult(s).result.result.fallenHeroIds.length).toBeLessThan(TUNING.climb.rout.boss!)
  })
})
