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

  it('lane G: a wind-up is a turn; its caster waits, then fires on its tick (named in the strip)', () => {
    const l = log([u('a', 'hero', 100), u('boss', 'enemy', 250)], [
      { tick: 0, kind: 'battle-start', heroIds: ['a'], enemyIds: ['boss'] },
      { tick: 4, kind: 'telegraph', unitId: 'boss', skillId: 'e_dragon_breath', firesAtTick: 8, targets: ['a'] },
      { tick: 8, kind: 'act', actorId: 'boss', skillId: 'e_dragon_breath', targetId: 'a', charged: true },
      { tick: 10, kind: 'act', actorId: 'a', skillId: 'basic', targetId: 'boss' },
    ])
    // After the wind-up the boss's gauge stands at 0 and does not fill until it fires.
    const st = replayGauges(l, 2)
    expect(st.charging.get('boss')).toBe(8)
    expect(st.gauge.get('boss')).toBe(0)
    // The strip names the fire at tick 8, before the hero's turn at 10.
    expect(upcomingTurns(l, 2, 2)).toEqual(['boss', 'a'])
    // Through the fire: no divergence (the fire is not a turn), and the boss fills again from tick 8.
    const after = replayGauges(l, l.events.length)
    expect(after.divergences).toBe(0)
    expect(after.gauge.get('boss')).toBe(3 * 250)
    expect(loggedTurns(l).map((t) => t.unitId)).toEqual(['boss', 'boss', 'a'])
  })

  it('lane G: a stun cancels a wind-up; a summon joins with an empty gauge; a phase changes speed; Unleash fills a gauge', () => {
    const l = log([u('a', 'hero', 100), u('boss', 'enemy', 200), u('m', 'enemy', 300)], [
      { tick: 0, kind: 'battle-start', heroIds: ['a'], enemyIds: ['boss'] },
      { tick: 5, kind: 'telegraph', unitId: 'boss', skillId: 'e_dragon_breath', firesAtTick: 10, targets: ['a'] },
      { tick: 6, kind: 'telegraph-end', unitId: 'boss', skillId: 'e_dragon_breath', reason: 'stunned' },
      { tick: 6, kind: 'phase', unitId: 'boss', phase: 1, phases: 1, spd: 400 },
      { tick: 6, kind: 'summon', unitId: 'boss', enemyIds: ['m'], wave: 0 },
      { tick: 7, kind: 'order', order: { tick: 7, kind: 'unleash', allyId: 'a' } },
      { tick: 7, kind: 'act', actorId: 'a', skillId: 'basic', targetId: 'boss' },
    ])
    const st = replayGauges(l, 5)
    expect(st.charging.has('boss')).toBe(false)
    expect(st.spd.get('boss')).toBe(400)
    expect(st.alive.has('m')).toBe(true)
    expect(st.gauge.get('m')).toBe(0)
    // The engine fills the hero to a whole turn before tick 7's fill: 1000 + 100.
    expect(replayGauges(l, 6).gauge.get('a')).toBe(1100)
    expect(replayGauges(l, 7).divergences).toBe(0)
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
        // Likewise with no foe on the field (an escape run past the last wave): a hero with
        // nothing to strike passes its turn in silence, and who acts first is whoever has a
        // friend to tend.
        const st = replayGauges(l, index)
        const foesUp = [...st.alive].some((id) => l.unitsInit.find((u) => u.id === id)?.side === 'enemy')
        if (predicted !== unitId && (gap * fastest > 2 * TUNING.combat.actionGaugeMax || !foesUp)) {
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
          // (Lane G: a summon or a phase changes the field the same way a wave does.)
          if (e.kind === 'death' || e.kind === 'wave-spawn' || e.kind === 'mission' || e.kind === 'end' || e.kind === 'summon' || e.kind === 'phase') break
          // A daze or a speed change landing mid-strip re-orders what comes after it (the
          // replay reads it from its event; the strip shown before it could not know).
          if (e.kind === 'status' && (e.status === 'stun' || e.status === 'spd-up' || e.status === 'spd-down')) break
          if (e.kind === 'act') actual.push(e.actorId)
          if (e.kind === 'panic' || e.kind === 'telegraph') actual.push(e.unitId)
          // A wind-up's move fires on a tick of its own: the strip shown before it could not know.
          if (e.kind === 'telegraph') break
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
