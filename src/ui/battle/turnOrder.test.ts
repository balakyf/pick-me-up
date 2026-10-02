import { TUNING } from '../../engine/tuning'
import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { loggedTurns, replayGauges, upcomingTurns } from './turnOrder'
import { realLogs } from './realLogs.testkit'

const u = (id: string, side: 'hero' | 'enemy', spd: number, extra: Partial<CombatUnitInit> = {}): CombatUnitInit => ({
  id,
  name: id,
  side,
  line: 'front',
  unitClass: null,
  element: 'physical',
  level: 1,
  maxHP: 100,
  maxSP: 0,
  cp: 1,
  spd,
  ...extra,
})

function log(units: CombatUnitInit[], events: object[]): CombatLog {
  return {
    seed: 1,
    floor: 1,
    encounterContext: 'tower',
    unitsInit: units,
    events: events.map((e, seq) => ({ ...e, seq }) as CombatEvent),
    outcome: 'win',
    rngDraws: 0,
  }
}

describe('turn order', () => {
  it('a stun pushes the gauge back and a speed buff bends the fill until it wears off', () => {
    const MAX = TUNING.combat.actionGaugeMax
    const start = { tick: 0, kind: 'battle-start', heroIds: ['a'], enemyIds: ['z'] }
    // Stun: z's gauge falls by half a turn (never below the floor).
    const stunned = log([u('a', 'hero', 100), u('z', 'enemy', 100)], [
      start,
      { tick: 3, kind: 'status', unitId: 'z', status: 'stun', sourceId: 'a', ticks: 0, value: 50 },
    ])
    expect(replayGauges(stunned, 2).gauge.get('z')).toBe(300 - Math.floor(MAX / 2))
    // Speed: +50% from tick 2 for 2 ticks (fills of ticks 3 only; it is gone at the top of 4).
    const hasted = log([u('a', 'hero', 100), u('z', 'enemy', 100)], [
      start,
      { tick: 2, kind: 'status', unitId: 'a', status: 'spd-up', sourceId: 'a', ticks: 2, value: 50 },
      { tick: 5, kind: 'mission', note: '' },
    ])
    // Ticks 1-2 fill 100 each, tick 3 fills 150, ticks 4-5 fill 100 each.
    expect(replayGauges(hasted, 3).gauge.get('a')).toBe(550)
  })

  it('runs the gauges forward: the fast act more often, ties go by id', () => {
    const l = log([u('a', 'hero', 500), u('b', 'hero', 250), u('z', 'enemy', 500)], [
      { tick: 0, kind: 'battle-start', heroIds: ['a', 'b'], enemyIds: ['z'] },
      { tick: 2, kind: 'act', actorId: 'a', skillId: 'basic', targetId: 'z' },
      { tick: 2, kind: 'act', actorId: 'z', skillId: 'basic', targetId: 'a' },
    ])
    // Tick 2: a and z reach 1000 (a first by id); tick 4: a, b, z all at 1000+.
    expect(upcomingTurns(l, 1, 6)).toEqual(['a', 'z', 'a', 'b', 'z', 'a'])
  })

  it('a turn the log shows is spent; the fallen and escorts drop out of the forecast', () => {
    const l = log([u('a', 'hero', 500), u('npc', 'hero', 900, { isNpc: true }), u('z', 'enemy', 400)], [
      { tick: 0, kind: 'battle-start', heroIds: ['a', 'npc'], enemyIds: ['z'] },
      { tick: 2, kind: 'act', actorId: 'a', skillId: 'basic', targetId: 'z' },
      { tick: 2, kind: 'death', unitId: 'z' },
    ])
    const st = replayGauges(l, 2)
    expect(st.divergences).toBe(0)
    // The escort, ready first at tick 2, spent a silent turn before a acted.
    expect(st.gauge.get('npc')).toBe(800)
    expect(upcomingTurns(l, 2, 3)).toEqual(['z', 'a', 'z'])
    expect(upcomingTurns(l, 3, 3)).toEqual(['a', 'a', 'a'])
  })

  it('a foe that keeps silent is dormant until it wakes', () => {
    const l = log([u('a', 'hero', 400), u('giant', 'enemy', 600)], [
      { tick: 0, kind: 'battle-start', heroIds: ['a'], enemyIds: ['giant'] },
      { tick: 3, kind: 'act', actorId: 'a', skillId: 'basic', targetId: 'giant' },
      { tick: 5, kind: 'mission', note: 'wakes', code: 'wakes', params: { unitId: 'giant' } },
    ])
    expect(replayGauges(l, 2).dormant.has('giant')).toBe(true)
    expect(upcomingTurns(l, 2, 2)).toEqual(['a', 'a'])
    // Awake at tick 5, level with the hero (who goes first by id).
    expect(upcomingTurns(l, 3, 2)).toEqual(['a', 'giant'])
  })

  it('matches the order of every turn in real battles', () => {
    const logs = realLogs()
    expect(logs.length).toBeGreaterThan(10)
    let turns = 0
    let longChecks = 0
    let unforeseeable = 0
    for (const l of logs) {
      const shown = loggedTurns(l)
      const divergence = replayGauges(l, l.events.length).divergences
      expect(divergence, `F${l.floor}`).toBe(0)
      const fastest = Math.max(...l.unitsInit.map((u) => u.spd ?? 0))
      for (let k = 0; k < shown.length; k++) {
        const { index, unitId } = shown[k]!
        turns++
        // After a silent stretch (long enough that someone passed a turn with nobody in
        // reach — an escape run, say), who wakes first depends on who finds something to
        // do: a healer with a hurt friend. The gauges cannot foresee that; allow it, rarely.
        const gap = l.events[index]!.tick - (k > 0 ? l.events[shown[k - 1]!.index]!.tick : 0)
        const predicted = upcomingTurns(l, index, 1)[0]
        if (predicted !== unitId && gap * fastest > 2 * TUNING.combat.actionGaugeMax) {
          unforeseeable++
          continue
        }
        // Standing just before this turn, the strip names this actor first…
        expect(predicted, `F${l.floor} event ${index}`).toBe(unitId)
        // …and the whole strip holds until someone falls or a wave arrives.
        if (k % 7 !== 0) continue
        const strip = upcomingTurns(l, index, 6)
        const actual: string[] = []
        for (let j = index; j < l.events.length && actual.length < strip.length; j++) {
          const e = l.events[j]!
          if (e.kind === 'death' || e.kind === 'wave-spawn' || e.kind === 'mission' || e.kind === 'end') break
          if (e.kind === 'act') actual.push(e.actorId)
          if (e.kind === 'panic') actual.push(e.unitId)
        }
        expect(strip.slice(0, actual.length), `F${l.floor} strip at ${index}`).toEqual(actual)
        longChecks++
      }
    }
    expect(unforeseeable).toBeLessThanOrEqual(Math.ceil(turns / 200))
    expect(turns).toBeGreaterThan(500)
    expect(longChecks).toBeGreaterThan(50)
  }, 60_000)
})
