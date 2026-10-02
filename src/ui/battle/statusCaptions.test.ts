import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatLog } from '../../engine/types'
import { STATUS_DURATION, statusDuration, statusName, statusShout, statusSnap, unitStatus, type StatusView } from './statusCaptions'
import { buildFrames, DURATION, eventDuration } from './battleFrames'

const nameOf = (id: string) => ({ tank: 'Han', mage: 'Mira', ogre: 'Ogre' })[id] ?? id
let seq = 0
const ev = (e: Record<string, unknown>): CombatEvent => ({ seq: seq++, tick: 1, ...e }) as CombatEvent

describe('status captions', () => {
  it('every status event kind has a presentation time, merged into the scene', () => {
    for (const k of Object.keys(STATUS_DURATION) as (keyof typeof STATUS_DURATION)[]) expect(DURATION[k]).toBe(STATUS_DURATION[k])
    const taunt = ev({ kind: 'status', unitId: 'tank', status: 'taunt', sourceId: 'tank', ticks: 20, value: 0 }) as Extract<CombatEvent, { kind: 'status' }>
    expect(eventDuration(taunt)).toBe(STATUS_DURATION.status)
    // The rest of a party-wide cast passes quickly; a breaking shield is a beat of its own.
    expect(statusDuration({ ...taunt, nth: 2 })).toBeLessThan(STATUS_DURATION.status)
    expect(statusDuration(ev({ kind: 'status-end', unitId: 'tank', status: 'shield', reason: 'broken' }))).toBeGreaterThan(STATUS_DURATION['status-end'])
    expect(statusDuration(ev({ kind: 'death', unitId: 'x' }))).toBeUndefined()
  })

  it('captions name who and what, and move the field on (marks, a DoT’s HP)', () => {
    const next: { hp: Record<string, number>; caption: string; status?: StatusView } = { hp: { ogre: 500 }, caption: 'before' }
    const s1 = statusSnap(ev({ kind: 'status', unitId: 'tank', status: 'taunt', sourceId: 'tank', ticks: 20, value: 0 }), nameOf, next)!
    expect(s1.caption).toBe('Han roars a challenge — every foe must face them!')
    expect(unitStatus(next.status, 'tank').marks.map((m) => m.key)).toEqual(['taunt'])
    const s2 = statusSnap(ev({ kind: 'dot', unitId: 'ogre', status: 'poison', amount: 40, hpAfter: 460, sourceId: 'mage' }), nameOf, next)!
    expect(s2.caption).toBe('Poison eats at Ogre — 40.')
    expect(next.hp.ogre).toBe(460)
    expect(s2.actor).toBeNull()
    const before = next.status
    statusSnap(ev({ kind: 'status-end', unitId: 'tank', status: 'taunt', reason: 'expired' }), nameOf, next)
    expect(unitStatus(next.status, 'tank').marks).toEqual([])
    // Frames share the old view: it is never mutated.
    expect(unitStatus(before, 'tank').marks.map((m) => m.key)).toEqual(['taunt'])
    expect(statusSnap(ev({ kind: 'death', unitId: 'ogre' }), nameOf, next)).toBeNull()
  })

  it('a shield’s soak updates its pool, and its pops read as numbers and words', () => {
    const next: { hp: Record<string, number>; caption: string; status?: StatusView } = { hp: {}, caption: '' }
    statusSnap(ev({ kind: 'status', unitId: 'tank', status: 'shield', sourceId: 'mage', ticks: 20, value: 300 }), nameOf, next)
    const s = statusSnap(ev({ kind: 'shield', unitId: 'tank', actorId: 'ogre', absorbed: 120, left: 180 }), nameOf, next)!
    expect(s.caption).toBe("Han's shield soaks 120!")
    const v = unitStatus(next.status, 'tank')
    expect(v.marks[0]).toMatchObject({ key: 'shield', value: 180 })
    expect(v.pops.map((p) => p.text)).toEqual(['SHIELD', '◆120'])
  })

  it('names and shouts exist for every status', () => {
    for (const k of ['taunt', 'shield', 'regen', 'stun', 'bleed', 'poison', 'burn', 'atk-up', 'atk-down', 'def-up', 'def-down', 'spd-up', 'spd-down', 'crit-up', 'crit-down', 'guard-up', 'guard-down'] as const) {
      expect(statusName(k).length).toBeGreaterThan(0)
      expect(statusShout(k).length).toBeGreaterThan(0)
    }
    expect(statusShout('atk-up')).toBe('ATK↑')
  })

  it('buildFrames carries the statuses frame to frame (the hook in battleFrames)', () => {
    seq = 0
    const log: CombatLog = {
      seed: 1,
      floor: 3,
      encounterContext: 'tower',
      outcome: 'win',
      rngDraws: 0,
      unitsInit: [
        { id: 'tank', name: 'Han', side: 'hero', line: 'front', unitClass: 'warrior', element: 'fire', level: 5, maxHP: 500, maxSP: 100, cp: 100 },
        { id: 'ogre', name: 'Ogre', side: 'enemy', line: 'front', unitClass: null, element: 'earth', level: 5, maxHP: 500, maxSP: 100, cp: 100 },
      ],
      events: [
        ev({ kind: 'battle-start', heroIds: ['tank'], enemyIds: ['ogre'] }),
        ev({ kind: 'act', actorId: 'tank', skillId: 'basic_shield', targetId: 'tank' }),
        ev({ kind: 'status', unitId: 'tank', status: 'taunt', sourceId: 'tank', ticks: 20, value: 0 }),
        ev({ kind: 'act', actorId: 'ogre', skillId: 'e_basic', targetId: 'tank' }),
        ev({ kind: 'hit', actorId: 'ogre', targetId: 'tank', amount: 10, crit: false, hpAfter: 490 }),
        ev({ kind: 'status-end', unitId: 'tank', status: 'taunt', reason: 'expired' }),
        ev({ kind: 'end', outcome: 'win' }),
      ],
    }
    const byId = Object.fromEntries(log.unitsInit.map((u) => [u.id, u]))
    const frames = buildFrames(log, byId, nameOf)
    expect(unitStatus(frames[3]!.status, 'tank').marks.map((m) => m.key)).toEqual(['taunt'])
    expect(unitStatus(frames[5]!.status, 'tank').marks.map((m) => m.key)).toEqual(['taunt'])
    expect(unitStatus(frames[6]!.status, 'tank').marks).toEqual([])
  })
})
