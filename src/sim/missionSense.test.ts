/**
 * Lane P · the bots read the mission: a hunt's leader and a carrier are marked, an escort is
 * protected, a looming giant is never marked, and a plain floor gets nothing. The reading
 * profiles are the engaged and the whale; and a standing Guard is among the answers a bot
 * tries when a big move hurt it.
 */
import { describe, expect, it } from 'vitest'
import { createAccount } from '../engine/account'
import { buildEncounter } from '../engine/tower'
import type { CombatLog, GameState } from '../engine/types'
import { MISSION_TAGS } from '../engine/content/missions'
import { missionDirective } from './missionSense'
import { PROFILES, orderAnswers } from './sim'

const onFloor = (floor: number, seed = 11): GameState => {
  const acct = createAccount(seed, { now: 0 })
  return { ...acct, tower: { ...acct.tower, currentFloor: floor, highestCleared: floor - 1 } }
}

describe('a reading bot', () => {
  it('marks the hunt’s leader and protects the escort, and leaves a plain floor alone', () => {
    const hunt = onFloor(8)
    const leader = buildEncounter(hunt, 8).waves[0]!.units.find((u) => u.targetTag === MISSION_TAGS.leader)!
    expect(missionDirective(hunt)).toEqual({ focusEnemyId: leader.id })
    const esc = onFloor(12)
    expect(missionDirective(esc)).toEqual({ overlookedAllyIds: [buildEncounter(esc, 12).allies![0]!.id] })
    expect(missionDirective(onFloor(3))).toBeUndefined()
  })

  it('never marks the F10 creature (it marks the Black Priest)', () => {
    const d = missionDirective(onFloor(10))!
    const priest = buildEncounter(onFloor(10), 10).waves.flatMap((w) => w.units).find((u) => u.targetTag === 'black_priest')!
    expect(d.focusEnemyId).toBe(priest.id)
  })

  it('the engaged and the whale read missions; the casual player does not', () => {
    expect(PROFILES.engaged.missions).toBe(true)
    expect(PROFILES.whale.missions).toBe(true)
    expect(PROFILES.casual.missions).toBe(false)
  })

  it('a big move that hurt is answered with a standing Guard among the tries', () => {
    const s = onFloor(6)
    const log = {
      seed: 1,
      floor: 6,
      encounterContext: 'tower',
      outcome: 'wipe',
      rngDraws: 0,
      unitsInit: [
        { id: 'h1', name: 'A', side: 'hero', line: 'front', unitClass: 'warrior', element: 'fire', level: 1, maxHP: 10, maxSP: 10, cp: 1 },
        { id: 'e1', name: 'Goblin', side: 'enemy', line: 'back', unitClass: null, element: 'physical', level: 1, maxHP: 10, maxSP: 10, cp: 1 },
      ],
      events: [
        { seq: 0, tick: 4, kind: 'telegraph', unitId: 'e1', skillId: 'e_haymaker', firesAtTick: 9, targets: ['h1'] },
        { seq: 1, tick: 9, kind: 'act', actorId: 'e1', skillId: 'e_haymaker', targetId: 'h1', charged: true },
      ],
    } as unknown as CombatLog
    const tries = orderAnswers(log, s)
    expect(tries[0]).toEqual([{ tick: 1, kind: 'guard', onTelegraph: true }])
    expect(tries[1]).toEqual([{ tick: 5, kind: 'guard' }])
  })
})
