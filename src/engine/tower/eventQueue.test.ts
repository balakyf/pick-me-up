/**
 * B19 — event floors queue instead of erasing each other.
 */
import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { resolveEvent } from '../events'
import { TUNING } from '../tuning'
import type { GameState, HeroId } from '../types'
import { eventsAfter, playFloor } from './tower'

const E = TUNING.events
const T = TUNING.tower

describe('eventsAfter', () => {
  it('a heavy-loss first clear of F41 opens the recovery, then the tournament', () => {
    const ev = eventsAfter(41, true, E.recoveryDeaths)
    expect(ev.map((e) => e.kind)).toEqual(['recovery', 'tournament'])
  })

  it('a heavy-loss anchor first clear keeps its bonus behind the recovery', () => {
    expect(eventsAfter(45, true, E.recoveryDeaths + 1).map((e) => e.kind)).toEqual(['recovery', 'bonus'])
    expect(eventsAfter(45, true, 0).map((e) => e.kind)).toEqual(['bonus'])
    // Not a first clear: only the recovery.
    expect(eventsAfter(45, false, E.recoveryDeaths).map((e) => e.kind)).toEqual(['recovery'])
    expect(eventsAfter(44, true, 0)).toEqual([])
  })

  it('the first clear of F90 — the world just ended — opens no cheerful quiet floor', () => {
    expect(eventsAfter(T.worldEndFloor, true, 0)).toEqual([])
    expect(eventsAfter(T.worldEndFloor, true, E.recoveryDeaths).map((e) => e.kind)).toEqual(['recovery'])
    // Other anchors past it still do.
    expect(eventsAfter(95, true, 0).map((e) => e.kind)).toEqual(['bonus'])
  })
})

describe('the queue in play', () => {
  /** A Lv1 party at F41 — clears are unlikely, so build the state by hand around a result. */
  function at41(): GameState {
    let s: GameState = { ...createAccount(9, { now: 0 }), gold: 1_000_000 }
    s = summonMany(s, 'normal', 10).state
    const ids = Object.keys(s.heroes) as HeroId[]
    return { ...s, party: { slots: ids.slice(0, 5), lines: ['front', 'front', 'mid', 'back', 'back'] } }
  }

  it('resolving the recovery opens the tournament; resolving that clears the floor for the climb', () => {
    const s0 = at41()
    const queued: GameState = {
      ...s0,
      tower: { ...s0.tower, currentFloor: 42, highestCleared: 41, event: eventsAfter(41, true, 3)[0]!, eventQueue: eventsAfter(41, true, 3).slice(1) },
    }
    expect(() => playFloor(queued)).toThrow(/event floor/)
    const rested = resolveEvent(queued, 'rest').state
    expect(rested.tower.event?.kind).toBe('tournament')
    expect(rested.tower.eventQueue).toBeUndefined()
    expect(() => playFloor(rested)).toThrow(/event floor/)
    const done = resolveEvent(rested, 'team').state
    expect(done.tower.event).toBeNull()
    expect(done.tower.eventQueue).toBeUndefined()
    expect(() => playFloor(done)).not.toThrow()
  })

  it('playFloor writes the queue from a real attempt', () => {
    // A strong party at an anchor's first clear: the bonus opens (alone, no losses).
    const s0 = at41()
    const strong: GameState = {
      ...s0,
      heroes: Object.fromEntries(
        Object.entries(s0.heroes).map(([id, h]) => [id, { ...h, xp: { level: 90, xpIntoLevel: 0, heldXp: 0, atCap: false }, baseAttrs: { str: 99, agi: 99, vit: 99, int: 99, wil: 99 } }]),
      ),
      tower: { ...s0.tower, currentFloor: 5, highestCleared: 4 },
    }
    const { state, result } = playFloor(strong)
    expect(result.cleared).toBe(true)
    expect(result.event?.kind).toBe('bonus')
    expect(state.tower.eventQueue).toBeUndefined()
  })

  it('a tournament behind a recovery on a party of the fallen waits for the Master to field the living', () => {
    const s0 = at41()
    const ids = s0.party.slots.filter((x): x is HeroId => x !== null)
    const bench = (Object.keys(s0.heroes) as HeroId[]).filter((id) => !ids.includes(id))
    // The whole party fell clearing F41; the recovery has been resolved, the tournament is open.
    const heroes = { ...s0.heroes }
    for (const id of ids) heroes[id] = { ...heroes[id]!, alive: false }
    const open: GameState = { ...s0, heroes, tower: { ...s0.tower, currentFloor: 42, highestCleared: 41, event: eventsAfter(41, true, 5)[1]! } }
    expect(open.tower.event?.kind).toBe('tournament')
    expect(() => resolveEvent(open, 'team')).toThrow(/no deployable heroes/)
    // Fielding the bench lets the tournament run — it was never lost.
    const fielded: GameState = { ...open, party: { ...open.party, slots: [...bench.slice(0, 5)] } }
    const done = resolveEvent(fielded, 'team')
    expect(done.state.tower.event).toBeNull()
    expect(done.outcome.rounds?.length).toBeGreaterThan(0)
  })
})
