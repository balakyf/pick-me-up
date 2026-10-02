import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../engine/types'
import { fightStats, median, percentile, replayMs, summarizeFights } from './fightStats'
import { DURATION, HERO_DEATH_MS, HITSTOP_MS } from '../ui/battle/battleFrames'

const u = (id: string, side: 'hero' | 'enemy', maxHP = 100): CombatUnitInit => ({
  id,
  name: id,
  side,
  line: 'front',
  unitClass: null,
  element: 'physical',
  level: 1,
  maxHP,
  maxSP: 0,
  cp: 1,
})

let seq = 0
const ev = (e: Record<string, unknown>): CombatEvent => ({ seq: seq++, tick: 1, ...e }) as CombatEvent

function log(events: CombatEvent[]): CombatLog {
  return { seed: 1, floor: 45, encounterContext: 'tower', unitsInit: [u('h1', 'hero'), u('h2', 'hero'), u('a', 'enemy', 50), u('b', 'enemy', 50)], events, outcome: 'win', rngDraws: 0 }
}

describe('fightStats', () => {
  const events = [
    ev({ kind: 'battle-start', heroIds: ['h1', 'h2'], enemyIds: ['a', 'b'] }),
    // h1 sweeps both (incident is an all-enemies skill): 30 + 30.
    ev({ kind: 'act', actorId: 'h1', skillId: 'incident', targetId: 'a' }),
    ev({ kind: 'hit', actorId: 'h1', targetId: 'a', amount: 30, crit: false, hpAfter: 20, eff: 'weak' }),
    ev({ kind: 'hit', actorId: 'h1', targetId: 'b', amount: 30, crit: true, hpAfter: 20 }),
    // a friend presses the attack (not a sweep): 5.
    ev({ kind: 'followup', unitId: 'h2', allyId: 'h1', targetId: 'a' }),
    ev({ kind: 'hit', actorId: 'h2', targetId: 'a', amount: 5, crit: false, hpAfter: 15 }),
    // the enemy answers and kills h2.
    ev({ kind: 'act', actorId: 'a', skillId: 'e_basic', targetId: 'h2' }),
    ev({ kind: 'hit', actorId: 'a', targetId: 'h2', amount: 100, crit: false, hpAfter: 0 }),
    ev({ kind: 'death', unitId: 'h2' }),
    // h1 strikes a for 40 (25 of it overkill), then hits an immune b for nothing.
    ev({ kind: 'act', actorId: 'h1', skillId: 'siman', targetId: 'a' }),
    ev({ kind: 'hit', actorId: 'h1', targetId: 'a', amount: 40, crit: false, hpAfter: -25 }),
    ev({ kind: 'death', unitId: 'a' }),
    ev({ kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'b' }),
    ev({ kind: 'hit', actorId: 'h1', targetId: 'b', amount: 0, crit: false, hpAfter: 20, eff: 'immune' }),
    ev({ kind: 'end', outcome: 'win' }),
  ]
  const f = fightStats(log(events))

  it('counts actions, rounds, damage, sweeps, overkill and effectiveness', () => {
    expect(f.heroActs).toBe(3)
    expect(f.enemyActs).toBe(1)
    expect(f.rounds).toBe(1.5)
    expect(f.heroDamage).toBe(30 + 30 + 5 + 15)
    expect(f.aoeDamage).toBe(60)
    expect(f.overkill).toBe(25)
    expect(f.immuneHits).toBe(1)
    expect(f.weakHits).toBe(1)
    expect(f.heroHits).toBe(5)
    expect(f.deaths).toBe(1)
  })

  it('estimates the 1× replay as the scene times it', () => {
    let want = 0
    for (const e of events) want += DURATION[e.kind]
    // The crit hit holds the next frame (+hit-stop); h2's death holds the scene.
    want += HITSTOP_MS
    want += HERO_DEATH_MS - DURATION.act
    expect(replayMs(log(events))).toBe(want)
  })

  it('summarises a batch', () => {
    const s = summarizeFights([f, { ...f, enemyActs: 0, outcome: 'wipe' }])
    expect(s.fights).toBe(2)
    expect(s.aoeShare).toBeCloseTo(60 / 80)
    expect(s.enemiesActShare).toBe(0.5)
    expect(s.winShare).toBe(0.5)
    expect(s.deathsPerAttempt).toBe(1)
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9)
  })
})
