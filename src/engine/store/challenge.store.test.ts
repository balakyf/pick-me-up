/**
 * Store tests for the tower-challenge commands: BONUS_ROOM, TOWER_RAID, WEEKLY_TRIAL, and
 * the ATTEMPT_FLOOR hook that opens side rooms and spends the Shrine's blessing.
 */
import { describe, it, expect } from 'vitest'
import { reduce, createStore, bonusRoomWithResult, towerRaidWithResult, weeklyTrialWithResult, attemptFloorWithResult } from './store'
import { MemoryStorage, hydrate } from '../account'
import { challengeOf, rollBonusRoom, heroAllowed, weeklyRule } from '../challenge'
import { rosterIds, veteranState, withParty } from '../challenge/fixtures.test-util'
import type { GameState } from '../types'

function base(): GameState {
  const s = veteranState(7, 19, 20)
  return withParty(s, rosterIds(s))
}

describe('store: BONUS_ROOM', () => {
  it('matches the with-result helper and closes the room', () => {
    const s = { ...base(), challenge: { ...challengeOf(base()), room: { kind: 'vault' as const, floor: 20, bought: [] } } }
    const viaHelper = bonusRoomWithResult(s, 'take')
    const next = reduce(s, { type: 'BONUS_ROOM', choice: 'take' })
    expect(next.gold).toBe(viaHelper.state.gold)
    expect(challengeOf(next).room).toBeNull()
    expect(() => reduce(next, { type: 'BONUS_ROOM', choice: 'take' })).toThrow(/no side room/)
  })
})

describe('store: ATTEMPT_FLOOR opens side rooms', () => {
  it("an anchor's first clear can reveal a room (same through reduce and the helper)", () => {
    let seed = 1
    let s = base()
    while (rollBonusRoom({ ...s, seed: seed as GameState['seed'] }, 20) === null) seed++
    s = { ...s, seed: seed as GameState['seed'], tower: { ...s.tower, currentFloor: 20, highestCleared: 19 } }
    const helper = attemptFloorWithResult(s)
    const next = reduce(s, { type: 'ATTEMPT_FLOOR' })
    expect(challengeOf(next).room).toEqual(challengeOf(helper.state).room)
    if (helper.result.firstClear) expect(challengeOf(next).room).toEqual({ kind: rollBonusRoom(s, 20), floor: 20, bought: [] })
  })
})

describe('store: TOWER_RAID', () => {
  it('runs the raid, records it, and the fallen are mourned as battle deaths', () => {
    const s = base()
    const ids = rosterIds(s)
    const cmd = { type: 'TOWER_RAID' as const, floor: 20, parties: [ids.slice(0, 5), ids.slice(5, 10), ids.slice(10, 15)], crew: ids.slice(15, 18), ballista: 0.6 }
    const helper = towerRaidWithResult(s, cmd)
    const next = reduce(s, cmd)
    expect(challengeOf(next).raids['20']).toEqual(challengeOf(helper.state).raids['20'])
    expect(next.gems).toBe(helper.state.gems)
    for (const id of helper.outcome.fallen) expect(next.heroes[id]!.alive).toBe(false)
    const graves = next.life.memorial.filter((g) => helper.outcome.fallen.includes(g.heroId))
    expect(graves).toHaveLength(helper.outcome.fallen.length)
    for (const g of graves) expect(g).toMatchObject({ cause: 'battle', floor: 20 })
    expect(() => reduce(s, { ...cmd, floor: 60 })).toThrow(/Clear F60/)
  })
})

describe('store: WEEKLY_TRIAL', () => {
  it('scores the attempt, persists the record, and leaves the roster untouched', () => {
    const storage = new MemoryStorage()
    const store = createStore({ storage })
    const s = base()
    const rule = weeklyRule(0)
    const team = rosterIds(s).filter((id) => heroAllowed(rule, s.heroes[id]!)).slice(0, rule.maxHeroes)
    store.dispatch({ type: 'NEW_ACCOUNT', seed: 7, now: 0 })
    // Swap in the veteran state through a plain reduce (the store only wraps reduce).
    const helper = weeklyTrialWithResult(s, team)
    const next = reduce(s, { type: 'WEEKLY_TRIAL', heroIds: team })
    expect(challengeOf(next).weekly).toEqual(challengeOf(helper.state).weekly)
    expect(challengeOf(next).weekly.attempts).toBe(1)
    for (const id of team) {
      expect(next.heroes[id]!.alive).toBe(true)
      expect(next.heroes[id]!.sanity).toBe(s.heroes[id]!.sanity)
      expect(next.heroes[id]!.xp).toEqual(s.heroes[id]!.xp)
    }
    expect(() => store.dispatch({ type: 'WEEKLY_TRIAL', heroIds: team })).toThrow(/opens once/)
    expect(hydrate(storage)!.challenge.weekly.attempts).toBe(0)
  })
})
