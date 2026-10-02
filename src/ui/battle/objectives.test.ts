import { afterEach, describe, expect, it } from 'vitest'
import type { CombatEvent, CombatLog, CombatLogMission, CombatUnitInit } from '../../engine/types'
import { setLocale } from '../i18n/i18n'
import { objectiveView } from './objectives'
import { realLogs } from './realLogs.testkit'

const u = (id: string, side: 'hero' | 'enemy', extra: Partial<CombatUnitInit> = {}): CombatUnitInit => ({
  id,
  name: id === 'vip' ? 'Princess Priasis' : id,
  side,
  line: 'front',
  unitClass: null,
  element: 'physical',
  level: 1,
  maxHP: 100,
  maxSP: 0,
  cp: 1,
  ...extra,
})

function log(mission: CombatLogMission | undefined, units: CombatUnitInit[], events: object[]): CombatLog {
  return {
    seed: 1,
    floor: 15,
    encounterContext: 'tower',
    unitsInit: units,
    events: events.map((e, seq) => ({ ...e, seq }) as CombatEvent),
    outcome: 'win',
    rngDraws: 0,
    ...(mission ? { mission } : {}),
  }
}
const nameOf = (id: string) => (id === 'vip' ? 'Princess Priasis' : id === 'boss' ? 'Black Priest' : id)

afterEach(() => setLocale('en'))

describe('objective HUD', () => {
  it('a log saved before missions has no HUD', () => {
    expect(objectiveView(log(undefined, [], []), 0, nameOf)).toBeNull()
  })

  it('an escort: the bell, the escort to keep alive, and the wave count', () => {
    const units = [u('h1', 'hero'), u('vip', 'hero', { isNpc: true, targetTag: 'priasis' }), u('e1', 'enemy'), u('e2', 'enemy')]
    const l = log(
      { type: 'Escort', objectives: [{ kind: 'survive', ticks: 200 }, { kind: 'protect', targetTag: 'priasis', unitIds: ['vip'] }], timerTicks: 200, waves: 2 },
      units,
      [
        { tick: 0, kind: 'battle-start', heroIds: ['h1', 'vip'], enemyIds: ['e1'] },
        { tick: 50, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'e1' },
        { tick: 100, kind: 'wave-spawn', wave: 1, enemyIds: ['e2'] },
        { tick: 150, kind: 'death', unitId: 'vip' },
      ],
    )
    const early = objectiveView(l, 2, nameOf)!
    expect(early.label).toBe('Escort')
    expect(early.lines.map((x) => x.text)).toEqual(['Survive until the bell', 'Keep Princess Priasis alive'])
    expect(early.clock).toEqual({ share: 0.25, survive: true })
    expect(early.escorts).toEqual(['vip'])
    expect(early.wave).toEqual({ n: 1, total: 2 })
    const later = objectiveView(l, 4, nameOf)!
    expect(later.wave).toEqual({ n: 2, total: 2 })
    expect(later.lines[1]!.state).toBe('failed')
  })

  it('a survival whose horde runs out: the bell rings at once', () => {
    const l = log({ type: 'Survival', objectives: [{ kind: 'survive', ticks: 400 }], timerTicks: 400, waves: 1 }, [u('h1', 'hero')], [
      { tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: [] },
      { tick: 40, kind: 'mission', note: 'spent', code: 'horde-spent', params: { left: 360 } },
    ])
    const v = objectiveView(l, 2, nameOf)!
    expect(v.hordeSpent).toBe(true)
    expect(v.clock?.share).toBe(1)
    expect(v.lines[0]!.state).toBe('done')
  })

  it('an escape: every hero turn is a step, the quarter beats say where the party is', () => {
    const l = log({ type: 'Escape', objectives: [{ kind: 'reach', distance: 20 }], waves: 1 }, [u('h1', 'hero'), u('e1', 'enemy')], [
      { tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['e1'] },
      { tick: 3, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'e1' },
      { tick: 4, kind: 'act', actorId: 'e1', skillId: 'basic', targetId: 'h1' },
      { tick: 6, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'e1' },
      { tick: 9, kind: 'mission', note: 'q', code: 'escape', params: { steps: 5, distance: 20, pct: 25 } },
    ])
    expect(objectiveView(l, 4, nameOf)!.road).toEqual({ share: 0.1, steps: 2, distance: 20 })
    expect(objectiveView(l, 5, nameOf)!.road?.steps).toBe(5)
  })

  it('a defeat target is marked and ticks off when it falls', () => {
    const l = log({ type: 'Defense', objectives: [{ kind: 'defend', waves: 1 }, { kind: 'defeat', targetTag: 'black_priest', unitIds: ['boss'] }], waves: 1 }, [u('h1', 'hero'), u('boss', 'enemy', { targetTag: 'black_priest' })], [
      { tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['boss'] },
      { tick: 5, kind: 'death', unitId: 'boss' },
      { tick: 5, kind: 'mission', note: 'w', code: 'wave-cleared', params: { wave: 1, waves: 1 } },
    ])
    const v = objectiveView(l, 1, nameOf)!
    expect(v.marked).toEqual(['boss'])
    expect(v.lines.map((x) => x.text)).toEqual(['Hold off 1 wave', 'Defeat Black Priest'])
    expect(objectiveView(l, 3, nameOf)!.lines.map((x) => x.state)).toEqual(['done', 'done'])
  })

  it('speaks French', () => {
    setLocale('fr')
    const l = log({ type: 'Survival', objectives: [{ kind: 'survive', ticks: 10 }], waves: 1 }, [], [])
    expect(objectiveView(l, 0, nameOf)!.label).toBe('Survie')
    expect(objectiveView(l, 0, nameOf)!.lines[0]!.text).toBe('Tenir jusqu’à la cloche')
  })

  it('every real battle has a HUD whose lines are all met when it is won', () => {
    let won = 0
    for (const l of realLogs()) {
      const v = objectiveView(l, l.events.length, (id) => id)
      expect(v, `F${l.floor}`).not.toBeNull()
      expect(v!.lines.length).toBeGreaterThan(0)
      if (l.outcome === 'win') {
        won++
        expect(v!.lines.every((x) => x.state === 'done'), `F${l.floor} ${l.mission?.type}`).toBe(true)
      }
    }
    expect(won).toBeGreaterThan(10)
  }, 60_000)
})
