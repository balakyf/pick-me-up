/**
 * Lane P · missions on the filler floors: the per-act table is deterministic, every draw is
 * a valid mission for its act's enemies (an escort has an escort, a hunt has its marked
 * leader, a defense has its waves), the teaching floors teach what they say, the loop, the
 * anchors and the Wall keep their own logic, and the enemies themselves are drawn exactly as
 * before (the 'floor' stream).
 */
import { describe, expect, it } from 'vitest'
import { createAccount } from '../account'
import { buildEncounter, buildFillerEncounter, hiddenObjectivesMet, mobLevel } from '../tower'
import { rngFor, makeSeed } from '../rng/rng'
import { TUNING } from '../tuning'
import type { BattleResult, Encounter, GameState } from '../types'
import { ACTS, ANCHORS, ENEMY_TEMPLATES, HIDDEN_OBJECTIVES, actForFloor } from '.'
import {
  ESCORT_TEMPLATES,
  MISSION_LABEL,
  MISSION_TABLE,
  MISSION_TAGS,
  MISSION_TUNING,
  TEACHING_FLOORS,
  fillerMissionPlan,
  isLoopFloor,
  type FillerMissionKind,
} from './missions'

const onFloor = (floor: number, seed = 11): GameState => {
  const acct = createAccount(seed, { now: 0 })
  return { ...acct, tower: { ...acct.tower, currentFloor: floor, highestCleared: floor - 1 } }
}
const units = (enc: Encounter) => enc.waves.flatMap((w) => w.units)
const charged = (enc: Encounter) => units(enc).filter((u) => u.skills.some((s) => s.charge !== undefined))
/** Every filler floor below the Wall that the table governs. */
const TABLE_FLOORS = Array.from({ length: 79 }, (_, i) => i + 1).filter((f) => ANCHORS[f] === undefined && !isLoopFloor(f))
const kindOf = (enc: Encounter) => (Object.keys(MISSION_LABEL) as FillerMissionKind[]).find((k) => MISSION_LABEL[k] === enc.mission.type)

describe('the mission table', () => {
  it('is deterministic per (seed, floor), and different accounts draw different missions', () => {
    const seed = makeSeed(1234)
    for (const f of TABLE_FLOORS) expect(fillerMissionPlan(seed, f)).toEqual(fillerMissionPlan(seed, f))
    for (const f of [7, 14, 23, 48, 72]) expect(buildEncounter(onFloor(f, 5), f)).toEqual(buildEncounter(onFloor(f, 5), f))
    const kinds = new Set<string>()
    for (let s = 1; s <= 40; s++) kinds.add(fillerMissionPlan(makeSeed(s), 48)!.kind)
    expect(kinds.size).toBeGreaterThan(3)
  })

  it('leaves the anchors, the F36–40 loop, the Wall and the floors past it alone', () => {
    const seed = makeSeed(7)
    for (const f of Object.keys(ANCHORS).map(Number)) expect(fillerMissionPlan(seed, f)).toBeNull()
    for (let f = 36; f <= 39; f++) expect(fillerMissionPlan(seed, f)).toBeNull()
    for (let f = 80; f <= 100; f++) expect(fillerMissionPlan(seed, f)).toBeNull()
    // A legacy floor is exactly what the old mix built.
    for (const f of [37, 83, 97]) {
      const s = onFloor(f, 3)
      const legacy = buildFillerEncounter(f, TUNING.tower.worldMult.C, rngFor(f >= 80 && f <= 89 ? makeSeed(TUNING.tower.wallSeed) : s.seed, 'floor', f))
      const enc = buildEncounter(s, f)
      expect(enc.mission).toEqual(legacy.mission)
      expect(enc.waves).toEqual(legacy.waves)
    }
  })

  it('draws only the kinds its act lists, and every act with a table has weights that add up', () => {
    for (const act of ACTS) {
      const table = MISSION_TABLE[act.id]
      if (table === undefined) continue
      expect(table.reduce((n, e) => n + e.weight, 0)).toBeGreaterThan(0)
      const listed = new Set(table.map((e) => e.kind))
      for (let f = act.from; f <= Math.min(act.to, 79); f++) {
        if (ANCHORS[f] !== undefined || isLoopFloor(f) || TEACHING_FLOORS[f] !== undefined) continue
        for (let s = 1; s <= 12; s++) expect(listed.has(fillerMissionPlan(makeSeed(s), f)!.kind), `F${f} seed ${s}`).toBe(true)
      }
    }
  })

  it('every draw is valid for its act’s enemies: escorts, leaders, carriers, waves', () => {
    for (const f of TABLE_FLOORS) {
      for (let seed = 1; seed <= 8; seed++) {
        const enc = buildEncounter(onFloor(f, seed), f)
        const kind = kindOf(enc)
        expect(kind, `F${f}`).toBeDefined()
        const act = actForFloor(f)
        // The foes come from the act's pool (a teaching floor's lead is one of them too).
        const pool = new Set(act.pool.map((id) => ENEMY_TEMPLATES[id]!.name))
        for (const u of units(enc)) expect(pool.has(u.name), `F${f} ${u.name}`).toBe(true)
        const objs = enc.mission.objectives
        switch (kind!) {
          case 'subjugation':
            expect(objs).toEqual([{ kind: 'annihilate' }])
            break
          case 'survival':
            expect(objs[0]!.kind).toBe('survive')
            expect(enc.mission.timer).toBe((objs[0] as { ticks: number }).ticks)
            break
          case 'escape':
            expect(objs).toEqual([{ kind: 'reach', distance: TUNING.tower.escapeDistance }])
            break
          case 'defense':
            expect(objs).toEqual([{ kind: 'defend', waves: MISSION_TUNING.defenseWaves }])
            expect(enc.waves.length).toBe(MISSION_TUNING.defenseWaves)
            // Wave ids never collide.
            expect(new Set(units(enc).map((u) => u.id)).size).toBe(units(enc).length)
            break
          case 'hunt': {
            expect(objs).toEqual([{ kind: 'defeat', targetTag: MISSION_TAGS.leader }])
            const leaders = units(enc).filter((u) => u.targetTag === MISSION_TAGS.leader)
            expect(leaders, `F${f}`).toHaveLength(1)
            expect(leaders[0]!.skills.some((s) => s.id === MISSION_TUNING.leaderMove)).toBe(true)
            expect(leaders[0]!.line).toBe('back')
            break
          }
          case 'seizure': {
            const tag = (objs[0] as { targetTag: string }).targetTag
            expect(objs[0]!.kind).toBe('acquire')
            expect(units(enc).filter((u) => u.targetTag === tag)).toHaveLength(1)
            break
          }
          case 'escort': {
            expect(objs).toContainEqual({ kind: 'protect', targetTag: MISSION_TAGS.escort })
            expect(objs).toContainEqual({ kind: 'reach', distance: MISSION_TUNING.escortDistance })
            const allies = enc.allies ?? []
            expect(allies).toHaveLength(1)
            expect(allies[0]!.isNpc).toBe(true)
            expect(allies[0]!.side).toBe('hero')
            expect(allies[0]!.targetTag).toBe(MISSION_TAGS.escort)
            expect(Object.values(ESCORT_TEMPLATES).map((t) => t.name)).toContain(allies[0]!.name)
            expect(allies[0]!.level).toBe(mobLevel(f, 1) + MISSION_TUNING.escortLevelBonus)
            break
          }
        }
        if (kind !== 'escort') expect(enc.allies).toBeUndefined()
      }
    }
  })

  it('keeps the enemies drawn exactly as before on a plain Subjugation (the floor stream is untouched)', () => {
    for (const f of [1, 2, 3, 4]) {
      for (const seed of [1, 9, 31337]) {
        const s = onFloor(f, seed)
        const legacy = buildFillerEncounter(f, TUNING.tower.worldMult.C, rngFor(s.seed, 'floor', f))
        expect(buildEncounter(s, f).waves).toEqual(legacy.waves)
      }
    }
  })
})

describe('the teaching floors', () => {
  it('F6: one foe, at the back, winds up one big move', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const enc = buildEncounter(onFloor(6, seed), 6)
      const big = charged(enc)
      expect(big).toHaveLength(1)
      expect(big[0]!.name).toBe('Goblin')
      expect(big[0]!.line).toBe('back')
      expect(enc.mission.type).toBe('Subjugation')
    }
  })

  it('F8: the goblin raiders’ chief is the marked leader', () => {
    const enc = buildEncounter(onFloor(8), 8)
    expect(enc.mission.objectives).toEqual([{ kind: 'defeat', targetTag: MISSION_TAGS.leader }])
    const chief = units(enc).find((u) => u.targetTag === MISSION_TAGS.leader)!
    expect(chief.name).toBe('Goblin')
  })

  it('F12 is the first escort; F13’s soldier stuns; F21 sinks; F31 is treasure; F43 is a siege', () => {
    expect(buildEncounter(onFloor(12), 12).mission.type).toBe('Escort')
    expect(units(buildEncounter(onFloor(13), 13)).some((u) => u.templateId === 'soldier')).toBe(true)
    expect(buildEncounter(onFloor(21), 21).mission.type).toBe('Escape')
    expect(buildEncounter(onFloor(31), 31).mission.type).toBe('Seizure')
    expect(buildEncounter(onFloor(43), 43).mission.type).toBe('Defense')
  })

  it('a gentle teaching floor fills less of its budget than the same floor would', () => {
    const cp = (enc: Encounter) => units(enc).reduce((n, u) => n + u.cp, 0)
    // F12's escort is gentle: its foes stand well under F14's (a plain ruins floor of the same act).
    expect(cp(buildEncounter(onFloor(12), 12))).toBeLessThan(cp(buildEncounter(onFloor(14), 14)))
  })
})

describe('the F45 key pays off at F47', () => {
  it('F47 is Priasis’s vault: take the seal from its keeper', () => {
    const enc = buildEncounter(onFloor(47), 47)
    expect(enc.mission.type).toBe('Seizure')
    expect(enc.mission.objectives).toEqual([{ kind: 'acquire', targetTag: MISSION_TAGS.vault }])
    expect(units(enc).filter((u) => u.targetTag === MISSION_TAGS.vault)).toHaveLength(1)
  })

  it('clearing it reveals a truth (her key), once', () => {
    const truth = HIDDEN_OBJECTIVES.find((h) => h.id === 'her_key')!
    expect(truth.floor).toBe(47)
    const res = { defeatedTargetTags: [MISSION_TAGS.vault], fallenHeroIds: [], ticksElapsed: 100, allyHpPct: {} } as unknown as BattleResult
    expect(hiddenObjectivesMet(47, res, []).map((h) => h.id)).toEqual(['her_key'])
    expect(hiddenObjectivesMet(47, res, ['her_key'])).toEqual([])
  })
})
