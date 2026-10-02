import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { actionSkillId, buildFrames, DURATION, layout } from './battleFrames'

const unit = (id: string, side: 'hero' | 'enemy', line: CombatUnitInit['line'] = 'front'): CombatUnitInit => ({
  id,
  name: side === 'hero' ? `Hero ${id}` : 'Goblin',
  side,
  line,
  unitClass: side === 'hero' ? 'warrior' : null,
  element: 'fire',
  level: 1,
  maxHP: 100,
  maxSP: 0,
  cp: 10,
})

const events: CombatEvent[] = [
  { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['e1'] },
  { seq: 1, tick: 1, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'e1' },
  { seq: 2, tick: 1, kind: 'hit', actorId: 'h1', targetId: 'e1', amount: 60, crit: false, hpAfter: 40 },
  { seq: 3, tick: 2, kind: 'hit', actorId: 'h1', targetId: 'e1', amount: 40, crit: true, hpAfter: 0 },
  { seq: 4, tick: 2, kind: 'death', unitId: 'e1' },
  { seq: 5, tick: 2, kind: 'end', outcome: 'win' },
]
const log: CombatLog = { seed: 1, floor: 4, encounterContext: 'tower', unitsInit: [unit('h1', 'hero'), unit('e1', 'enemy')], events, outcome: 'win', rngDraws: 0 }
const byId = Object.fromEntries(log.unitsInit.map((u) => [u.id, u]))

describe('battleFrames', () => {
  it('builds one frame per event after the empty opening frame', () => {
    const frames = buildFrames(log, byId, (id) => id)
    expect(frames).toHaveLength(events.length + 1)
    expect(frames[0]!.caption).toBe('Floor 4')
    expect(frames[1]!.visible).toEqual({ h1: true, e1: true })
    expect(frames[3]!.hp.e1).toBe(40)
    expect(frames[5]!.dead.e1).toBe(true)
    expect(frames[6]!.caption).toBe('Victory!')
  })

  it('every event kind holds the screen for a while', () => {
    for (const e of events) expect(DURATION[e.kind]).toBeGreaterThan(0)
  })

  it("finds the action's skill by walking back to its act", () => {
    expect(actionSkillId(events, 2, 'h1')).toBe('basic')
    expect(actionSkillId(events, 3, 'h1')).toBe('basic')
    expect(actionSkillId(events, 0, 'h1')).toBeNull()
  })

  it('puts the party on the right and the foes on the left', () => {
    const pos = layout(log)
    expect(pos.h1!.x).toBeGreaterThan(pos.e1!.x)
  })
})
