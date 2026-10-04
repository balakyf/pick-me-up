import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { ENEMY_TEMPLATES } from '../../engine/content'
import { BOSS_LINES } from '../../engine/content/story'
import { realLogs } from '../battle/realLogs.testkit'
import { STORY_MS, storyAt, storyBeats, TELEGRAPH_LINES_PER_MOVE, victoryLine } from './storyBeats'

const unit = (id: string, side: 'hero' | 'enemy', extra: Partial<CombatUnitInit> = {}): CombatUnitInit => ({
  id,
  name: side === 'hero' ? `Hero ${id}` : 'Goblin',
  side,
  line: 'front',
  unitClass: side === 'hero' ? 'warrior' : null,
  element: 'fire',
  level: 20,
  maxHP: 1000,
  maxSP: 100,
  cp: 10,
  spd: 50,
  ...extra,
})
const tpl = (id: string): Partial<CombatUnitInit> => ({ templateId: id, name: ENEMY_TEMPLATES[id]!.name })
const byIdOf = (log: CombatLog) => Object.fromEntries(log.unitsInit.map((u) => [u.id, u]))

/** F20 in miniature: a guard wave, then Halgiraf, who breathes four times, takes flight and falls. */
function f20(outcome: CombatLog['outcome'] = 'win'): CombatLog {
  const tg = (seq: number): CombatEvent => ({ seq, tick: seq, kind: 'telegraph', unitId: 'hal', skillId: 'e_dragon_breath', firesAtTick: seq + 2, targets: ['h1'] })
  const ev: CombatEvent[] = [
    { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['g1'] },
    { seq: 1, tick: 1, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'g1' },
    { seq: 2, tick: 1, kind: 'hit', actorId: 'h1', targetId: 'g1', amount: 1000, crit: false, hpAfter: 0 },
    { seq: 3, tick: 1, kind: 'death', unitId: 'g1' },
    { seq: 4, tick: 2, kind: 'wave-spawn', wave: 1, enemyIds: ['hal'] },
    tg(5),
    tg(6),
    { seq: 7, tick: 7, kind: 'phase', unitId: 'hal', phase: 1, phases: 1, title: 'Takes flight', line: 'Halgiraf beats his black wings and takes to the sky!' },
    tg(8),
    tg(9),
    ...(outcome === 'win'
      ? ([
          { seq: 10, tick: 10, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'hal' },
          { seq: 11, tick: 10, kind: 'hit', actorId: 'h1', targetId: 'hal', amount: 1000, crit: true, hpAfter: 0 },
          { seq: 12, tick: 10, kind: 'death', unitId: 'hal' },
        ] as CombatEvent[])
      : ([{ seq: 10, tick: 10, kind: 'death', unitId: 'h1' }] as CombatEvent[])),
    { seq: 13, tick: 11, kind: 'end', outcome },
  ]
  return {
    seed: 20,
    floor: 20,
    encounterContext: 'tower',
    unitsInit: [unit('h1', 'hero'), unit('g1', 'enemy'), unit('hal', 'enemy', { ...tpl('halgiraf'), targetTag: 'halgiraf' })],
    events: ev,
    outcome,
    rngDraws: 0,
    mission: { type: 'Subjugation', objectives: [], waves: 2 },
  }
}

describe('boss lines in battle (lane M)', () => {
  it('Halgiraf speaks as he arrives, as he winds up (the first few), as he takes flight, and as he falls', () => {
    const log = f20()
    const lines = storyBeats(log, byIdOf(log))
    // His title card plays on his arrival (4); he speaks as it lifts (5).
    expect(lines.has(4)).toBe(false)
    expect(lines.get(5)).toMatchObject({ kind: 'entrance', speaker: 'boss', unitId: 'hal', text: BOSS_LINES.halgiraf!.entrance })
    // The line belongs to the move he winds up (the first wind-up here gave way to his entrance).
    expect(lines.get(6)).toMatchObject({ kind: 'telegraph', text: BOSS_LINES.halgiraf!.telegraph!.e_dragon_breath })
    expect(lines.get(7)).toMatchObject({ kind: 'phase', text: BOSS_LINES.halgiraf!.phases![1] })
    // Two wind-ups of the breath are spoken (one gave way to the entrance), then silence.
    const told = [5, 6, 8, 9].filter((i) => lines.get(i)?.kind === 'telegraph')
    expect(told).toEqual([6, 8].slice(0, TELEGRAPH_LINES_PER_MOVE))
    expect(lines.get(12)).toMatchObject({ kind: 'defeat', text: BOSS_LINES.halgiraf!.defeat })
    // The goblin is nobody's story; a plain beat carries nothing.
    expect(lines.has(3)).toBe(false)
    expect(storyAt(lines, 10, 12)).toEqual({ at: 12, line: lines.get(12) })
    expect(storyAt(lines, -1, -1)).toBeNull()
    // A win leaves no last word for the boss.
    expect(victoryLine(log, byIdOf(log))).toBeNull()
  })

  it('a boss still standing over a lost party has the last word', () => {
    const log = f20('wipe')
    const v = victoryLine(log, byIdOf(log))
    expect(v).toMatchObject({ kind: 'victory', unitId: 'hal', text: BOSS_LINES.halgiraf!.victory })
    expect(STORY_MS.victory).toBe(0)
  })

  it('an escort speaks as the fight begins, only in the anchor’s own fight', () => {
    const ev: CombatEvent[] = [
      { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1', 'pri'], enemyIds: ['g1'] },
      { seq: 1, tick: 1, kind: 'act', actorId: 'g1', skillId: 'basic', targetId: 'pri' },
      { seq: 2, tick: 1, kind: 'end', outcome: 'win' },
    ]
    const base: CombatLog = {
      seed: 15,
      floor: 15,
      encounterContext: 'tower',
      unitsInit: [unit('h1', 'hero'), unit('pri', 'hero', { isNpc: true, name: 'Princess Priasis', templateId: 'priasis' }), unit('g1', 'enemy')],
      events: ev,
      outcome: 'win',
      rngDraws: 0,
      mission: { type: 'Escort', objectives: [], waves: 2 },
    }
    expect(storyBeats(base, byIdOf(base)).get(1)).toMatchObject({ kind: 'opening', speaker: 'priasis' })
    const raid = { ...base, mission: { type: 'Raid', objectives: [], waves: 1 } }
    expect(storyBeats(raid, byIdOf(raid)).size).toBe(0)
  })

  it('every line has a duration (lane rule 8), and the battle-time ones are readable at 1×', () => {
    for (const [k, ms] of Object.entries(STORY_MS)) {
      if (k === 'victory') continue
      expect(ms).toBeGreaterThanOrEqual(1500)
      expect(ms).toBeLessThanOrEqual(4000)
    }
  })

  it('on the engine’s own F20 fights, the Halgiraf phase change carries his line', () => {
    const logs = realLogs().filter((l) => l.floor === 20 && l.events.some((e) => e.kind === 'phase'))
    expect(logs.length).toBeGreaterThan(0)
    for (const log of logs) {
      const lines = storyBeats(log, byIdOf(log))
      const i = log.events.findIndex((e) => e.kind === 'phase')
      expect(lines.get(i)?.text).toBe(BOSS_LINES.halgiraf!.phases![1])
      // He arrives speaking.
      expect([...lines.values()].some((l) => l.kind === 'entrance' && l.text === BOSS_LINES.halgiraf!.entrance)).toBe(true)
    }
  }, 120_000)

  it('on every real log, lines only ever belong to units in the fight', () => {
    for (const log of realLogs()) {
      const byId = byIdOf(log)
      for (const [i, l] of storyBeats(log, byId)) {
        expect(i).toBeLessThan(log.events.length)
        if (l.unitId !== undefined) expect(byId[l.unitId]).toBeDefined()
      }
    }
  }, 120_000)
})
