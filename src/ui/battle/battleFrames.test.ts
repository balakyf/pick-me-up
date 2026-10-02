import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import {
  actionSkillId,
  beatLead,
  beatRanges,
  blowElement,
  buildFrames,
  CUTIN_MS,
  cutInActs,
  cutInSkill,
  DURATION,
  eventActor,
  eventsThrough,
  frameAtEvents,
  frameHold,
  HERO_DEATH_MS,
  HITSTOP_MS,
  layout,
  popupDelay,
  replayLength,
  shownLevel,
  SWEEP_DEATH_MS,
  SWEEP_MS,
  unitSpan,
} from './battleFrames'
import { realLogs } from './realLogs.testkit'
import { replayMs } from '../../sim/fightStats'

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

  it('a follow-up is the friend striking: their element, their basic strike', () => {
    const fl: CombatEvent[] = [
      { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1', 'h2'], enemyIds: ['e1'] },
      { seq: 1, tick: 1, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'e1' },
      { seq: 2, tick: 1, kind: 'hit', actorId: 'h1', targetId: 'e1', amount: 10, crit: false, hpAfter: 90 },
      { seq: 3, tick: 1, kind: 'followup', unitId: 'h2', allyId: 'h1', targetId: 'e1' },
      { seq: 4, tick: 1, kind: 'hit', actorId: 'h2', targetId: 'e1', amount: 5, crit: false, hpAfter: 85 },
    ]
    const units = [unit('h1', 'hero'), { ...unit('h2', 'hero'), element: 'water' as const }, unit('e1', 'enemy')]
    const l: CombatLog = { ...log, unitsInit: units, events: fl }
    const frames = buildFrames(l, Object.fromEntries(units.map((u) => [u.id, u])), (id) => id)
    expect(frames[4]!.element).toBe('water')
    expect(frames[4]!.actor).toBe('h2')
    expect(eventActor(fl[3])).toBe('h2')
    expect(actionSkillId(fl, 4, 'h2')).toBe('basic')
    // The first striker's own hits still find their act past the friend's follow-up.
    expect(actionSkillId(fl, 2, 'h1')).toBe('basic')
  })

  it('a trial: heroes who drop are out, and it ends without a defeat', () => {
    const wipe: CombatEvent[] = [
      { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['e1'] },
      { seq: 1, tick: 1, kind: 'death', unitId: 'h1' },
      { seq: 2, tick: 1, kind: 'end', outcome: 'wipe' },
    ]
    const frames = buildFrames({ ...log, events: wipe, outcome: 'wipe' }, byId, (id) => id, { nonLethal: true })
    expect(frames[2]!.caption).toBe('h1 is out of the trial.')
    expect(frames[3]!.caption).toBe('The trial ends. Nobody dies here.')
  })

  it('shows the template display level over the real one', () => {
    expect(shownLevel({ level: 60, templateId: 'lv999_creature' })).toBe(999)
    expect(shownLevel({ level: 12, templateId: 'goblin' })).toBe(12)
    expect(shownLevel({ level: 7 })).toBe(7)
  })
})

describe('beats: one AoE act plays as one sweep', () => {
  const units = [
    { ...unit('h1', 'hero'), maxSP: 120 },
    unit('h2', 'hero'),
    unit('e1', 'enemy'),
    unit('e2', 'enemy'),
    unit('e3', 'enemy'),
    unit('e4', 'enemy'),
  ]
  const ids = Object.fromEntries(units.map((u) => [u.id, u]))
  const sweep: CombatEvent[] = [
    { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1', 'h2'], enemyIds: ['e1', 'e2', 'e3', 'e4'] },
    { seq: 1, tick: 3, kind: 'act', actorId: 'h1', skillId: 'arcane_burst', targetId: 'e1' },
    { seq: 2, tick: 3, kind: 'hit', actorId: 'h1', targetId: 'e1', amount: 100, crit: false, hpAfter: 0, eff: 'weak' },
    { seq: 3, tick: 3, kind: 'death', unitId: 'e1' },
    { seq: 4, tick: 3, kind: 'hit', actorId: 'h1', targetId: 'e2', amount: 30, crit: true, hpAfter: 70 },
    { seq: 5, tick: 3, kind: 'hit', actorId: 'h1', targetId: 'e3', amount: 0, crit: false, hpAfter: 100, eff: 'immune' },
    { seq: 6, tick: 3, kind: 'hit', actorId: 'h1', targetId: 'e4', amount: 100, crit: false, hpAfter: 0 },
    { seq: 7, tick: 3, kind: 'death', unitId: 'e4' },
    { seq: 8, tick: 3, kind: 'mission', note: 'x', code: 'wave-cleared', params: { wave: 1, waves: 2 } },
    { seq: 9, tick: 4, kind: 'end', outcome: 'win' },
  ]
  const sl: CombatLog = { ...log, unitsInit: units, events: sweep }

  it('folds every blow of the act (and the foes it fells) into one beat', () => {
    expect(beatRanges(sl, ids)).toEqual([
      [0, 0],
      [1, 1],
      [2, 7],
      [8, 8],
      [9, 9],
    ])
    const frames = buildFrames(sl, ids, (id) => id)
    expect(frames).toHaveLength(6)
    const f = frames[3]!
    expect(f.targets).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(f.dead).toMatchObject({ e1: true, e4: true })
    expect(f.hp.e2).toBe(70)
    // The caster's name and skill stay up through the sweep.
    expect(f.caption).toBe('h1 — Arcane Burst')
    expect(f.skill?.caster).toBe('h1')
    expect(beatLead(sweep, f)).toBe(sweep[2])
    expect(eventsThrough(frames, 3)).toBe(8)
    expect(frameAtEvents(frames, 8)).toBe(3)
    expect(frameAtEvents(frames, 5)).toBe(2) // mid-sweep: back to the act
  })

  it('a sweep holds far less than one 460 ms beat per target, with its crit hit-stop', () => {
    const frames = buildFrames(sl, ids, (id) => id)
    const hold = frameHold(frames[3]!, sweep, ids, { speed: 1 })
    expect(hold).toBe(SWEEP_MS + popupDelay(3) + SWEEP_DEATH_MS + HITSTOP_MS)
    expect(hold).toBeLessThan(4 * DURATION.hit + 2 * DURATION.death)
    expect(frameHold(frames[3]!, sweep, ids, { speed: 2 })).toBeCloseTo((SWEEP_MS + popupDelay(3) + SWEEP_DEATH_MS) / 2 + HITSTOP_MS)
  })

  it('pays the SP of each cast', () => {
    const frames = buildFrames(sl, ids, (id) => id)
    expect(frames[1]!.sp.h1).toBe(120)
    expect(frames[2]!.sp.h1).toBe(70) // Arcane Burst costs 50
  })

  it('a grade B+ skill earns its cut-in (when cut-ins play)', () => {
    const frames = buildFrames(sl, ids, (id) => id)
    expect(cutInSkill(sweep[1], ids)).toBe(true)
    expect(cutInActs(sl, ids)).toEqual(new Set([1]))
    expect(frameHold(frames[2]!, sweep, ids, { speed: 1, cutIns: cutInActs(sl, ids) })).toBe(DURATION.act + CUTIN_MS)
    expect(frameHold(frames[2]!, sweep, ids, { speed: 1 })).toBe(DURATION.act)
    expect(cutInSkill({ seq: 0, tick: 0, kind: 'act', actorId: 'h1', skillId: 'power_strike', targetId: 'e1' }, ids)).toBe(false)
    expect(cutInSkill({ seq: 0, tick: 0, kind: 'act', actorId: 'e1', skillId: 'arcane_burst', targetId: 'h1' }, ids)).toBe(false)
  })

  it('a grade B skill is cut in the first time each hero casts it; an A every time', () => {
    const acts: CombatEvent[] = [
      { seq: 0, tick: 1, kind: 'act', actorId: 'h1', skillId: 'arcane_burst', targetId: 'e1' },
      { seq: 1, tick: 2, kind: 'act', actorId: 'h1', skillId: 'arcane_burst', targetId: 'e1' },
      { seq: 2, tick: 3, kind: 'act', actorId: 'h2', skillId: 'arcane_burst', targetId: 'e1' },
      { seq: 3, tick: 4, kind: 'act', actorId: 'h1', skillId: 'pathology', targetId: 'e1' },
      { seq: 4, tick: 5, kind: 'act', actorId: 'h1', skillId: 'pathology', targetId: 'e1' },
    ]
    expect(cutInActs({ ...sl, events: acts }, ids)).toEqual(new Set([0, 2, 3, 4]))
  })

  it("a hero's death splits an enemy sweep and still holds the scene; in a trial it folds", () => {
    const foeSweep: CombatEvent[] = [
      { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1', 'h2'], enemyIds: ['e1'] },
      { seq: 1, tick: 2, kind: 'act', actorId: 'e1', skillId: 'basic', targetId: 'h1' },
      { seq: 2, tick: 2, kind: 'hit', actorId: 'e1', targetId: 'h1', amount: 100, crit: false, hpAfter: 0 },
      { seq: 3, tick: 2, kind: 'death', unitId: 'h1' },
      { seq: 4, tick: 2, kind: 'hit', actorId: 'e1', targetId: 'h2', amount: 10, crit: false, hpAfter: 90 },
      { seq: 5, tick: 2, kind: 'miss', actorId: 'e1', targetId: 'h2' },
    ]
    const fl: CombatLog = { ...log, unitsInit: units, events: foeSweep }
    expect(beatRanges(fl, ids)).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 5],
    ])
    const frames = buildFrames(fl, ids, (id) => id)
    expect(frameHold(frames[4]!, foeSweep, ids, { speed: 4 })).toBe(HERO_DEATH_MS / 2)
    expect(beatRanges(fl, ids, { nonLethal: true })).toEqual([
      [0, 0],
      [1, 1],
      [2, 5],
    ])
  })

  it('one blow stays its own beat, and blows on different ticks never fold', () => {
    expect(beatRanges(log, byId)).toEqual(events.map((_, i) => [i, i]))
  })

  it('real battles: every event plays exactly once, a sweep never spans two acts, and late replays get shorter', () => {
    let sweeps = 0
    let late = 0
    let lateShorter = 0
    for (const l of realLogs()) {
      const ids2 = Object.fromEntries(l.unitsInit.map((u) => [u.id, u]))
      const beats = beatRanges(l, ids2)
      let next = 0
      for (const [from, to] of beats) {
        expect(from).toBe(next)
        next = to + 1
        if (to > from) {
          sweeps++
          const evs = l.events.slice(from, to + 1)
          expect(evs.some((e) => e.kind === 'act' || e.kind === 'end' || e.kind === 'wave-spawn')).toBe(false)
          expect(new Set(evs.map((e) => e.tick)).size).toBe(1)
        }
      }
      expect(next).toBe(l.events.length)
      if (l.floor > 40) {
        late++
        if (replayLength(l) < replayMs(l)) lateShorter++
      }
    }
    expect(sweeps).toBeGreaterThan(20)
    expect(late).toBeGreaterThan(5)
    expect(lateShorter / late).toBeGreaterThan(0.8)
  }, 60_000)
})

describe('layout on a phone', () => {
  it('a squeeze draws both sides in toward the middle', () => {
    const wide = layout(log)
    const tight = layout(log, 0.8)
    expect(tight.h1!.x - tight.e1!.x).toBeLessThan(wide.h1!.x - wide.e1!.x)
    const w = (p: Record<string, { x: number; y: number }>) => {
      const s = unitSpan(p, () => 12)
      return s.right - s.left
    }
    expect(w(tight)).toBeLessThan(w(wide))
  })
})

describe('blow elements', () => {
  it("a blow carries its skill's element, else the striker's own", () => {
    const units = [{ ...unit('h1', 'hero'), element: 'water' as const }, unit('e1', 'enemy')]
    const ids = Object.fromEntries(units.map((u) => [u.id, u]))
    const ev: CombatEvent[] = [
      { seq: 0, tick: 1, kind: 'act', actorId: 'h1', skillId: 'thunder_volley', targetId: 'e1' },
      { seq: 1, tick: 1, kind: 'hit', actorId: 'h1', targetId: 'e1', amount: 5, crit: false, hpAfter: 95 },
      { seq: 2, tick: 2, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'e1' },
      { seq: 3, tick: 2, kind: 'hit', actorId: 'h1', targetId: 'e1', amount: 5, crit: false, hpAfter: 90 },
    ]
    expect(blowElement(ev, 1, ids)).toBe('wind')
    expect(blowElement(ev, 3, ids)).toBe('water')
  })
})
