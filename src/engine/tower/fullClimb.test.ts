import { describe, it, expect } from 'vitest'
import {
  buildEncounter,
  fillerPoolForFloor,
  floorPower,
  mobLevel,
  nextTowerState,
  playFloor,
  hiddenObjectivesMet,
  isWallFloor,
} from './tower'
import { createAccount } from '../account'
import { ACTS, ANCHORS, ENEMY_TEMPLATES, ALLY_TEMPLATES, HIDDEN_OBJECTIVES, actForFloor } from '../content'
import { TUNING } from '../tuning'
import type { BattleResult, GameState, HeroId, OwnedHero, TowerState } from '../types'

const T = TUNING.tower

function onFloor(
  floor: number,
  hero: Partial<OwnedHero> = {},
  seed = 11,
  tower: Partial<TowerState> = {},
  partner?: Partial<OwnedHero>,
): GameState {
  const acct = createAccount(seed, { now: 0 })
  const id = Object.keys(acct.heroes)[0] as HeroId
  const heroes: Record<string, OwnedHero> = { [id]: { ...acct.heroes[id]!, ...hero } }
  const slots: (HeroId | null)[] = [id, null, null, null, null]
  if (partner) {
    // Four partners: a full party of five (the first hero + 2 of `hero`'s kind + 2 partners).
    const kinds = [hero, partner, hero, partner]
    kinds.forEach((kind, i) => {
      const pid = `h_partner${i}` as HeroId
      heroes[pid] = { ...acct.heroes[id]!, id: pid, name: `Partner ${i}`, ...kind }
      slots[i + 1] = pid
    })
  }
  return {
    ...acct,
    heroes,
    party: { slots, lines: ['front', 'front', 'mid', 'back', 'back'] },
    tower: { ...acct.tower, currentFloor: floor, highestCleared: floor - 1, ...tower },
  }
}

const god: Partial<OwnedHero> = {
  star: 7,
  heroClass: 'mage',
  element: 'light',
  baseAttrs: { str: 999, agi: 999, vit: 999, int: 999, wil: 999 },
  growthGrades: { str: 10, agi: 10, vit: 10, int: 10, wil: 10 },
  xp: { level: 150, xpIntoLevel: 0, heldXp: 0, atCap: false },
  skills: [{ id: 'arcane_burst', level: 6, xp: 0 }],
}
/** A physical god to pair with the mage (magic-immune statues, physical-immune wraiths). */
const blade: Partial<OwnedHero> = { ...god, heroClass: 'warrior', element: 'physical', skills: [{ id: 'power_strike', level: 5, xp: 0 }] }
/** A full party of gods (mages and blades) on one floor. */
const both = (f: number, seed = 11, tower: Partial<TowerState> = {}) => onFloor(f, god, seed, tower, blade)

describe('acts and bands', () => {
  it('cover floors 1–100 contiguously', () => {
    expect(ACTS[0]!.from).toBe(1)
    expect(ACTS[ACTS.length - 1]!.to).toBe(100)
    for (let i = 1; i < ACTS.length; i++) expect(ACTS[i]!.from).toBe(ACTS[i - 1]!.to + 1)
    for (const a of ACTS) for (const id of a.pool) expect(ENEMY_TEMPLATES[id], id).toBeDefined()
  })

  it('draws filler from its act’s pool', () => {
    expect(fillerPoolForFloor(23).map((t) => t.id)).toEqual([...actForFloor(23).pool])
    for (const f of [23, 33, 47, 72, 83, 97]) {
      const names = new Set(fillerPoolForFloor(f).map((t) => t.name))
      for (const u of buildEncounter(onFloor(f), f).waves[0]!.units) expect(names.has(u.name), `F${f} ${u.name}`).toBe(true)
    }
  })

  it('late filler mixes Subjugation, Survival and Escape; the coast has Seizure', () => {
    const late = new Set<string>()
    const coast = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      late.add(buildEncounter(onFloor(47, {}, seed), 47).mission.type)
      coast.add(buildEncounter(onFloor(33, {}, seed), 33).mission.type)
    }
    expect(late).toEqual(new Set(['Subjugation', 'Survival', 'Escape']))
    expect(coast).toEqual(new Set(['Subjugation', 'Seizure']))
  })

  it('never fields more than the unit cap; late enemies grow elite instead', () => {
    for (const f of [61, 79, 89, 99]) {
      const units = buildEncounter(onFloor(f), f).waves[0]!.units
      expect(units.length).toBeLessThanOrEqual(T.fillerMaxUnits)
      expect(units.reduce((n, u) => n + u.cp, 0)).toBeGreaterThan(floorPower(f, 1) * (1 - T.budgetTolerance) * 0.9)
    }
  })

  it('the mob-level curve steepens past F70 and explodes at the Wailing Wall (F80 ≈ Lv103)', () => {
    expect(mobLevel(80, 1) - mobLevel(79, 1)).toBeGreaterThanOrEqual(T.wallLevelBonus)
    expect(mobLevel(70, 1)).toBe(Math.round(70 * T.mobLevelPerFloor))
    expect(mobLevel(80, 1) - mobLevel(79, 1)).toBeGreaterThan(mobLevel(60, 1) - mobLevel(59, 1))
    expect(mobLevel(80, 1)).toBeGreaterThan(100)
    expect(mobLevel(80, 1)).toBeLessThan(115)
  })

  it('the Wailing Wall is the same for every account', () => {
    expect(isWallFloor(83)).toBe(true)
    const a = buildEncounter(onFloor(83, {}, 1), 83)
    const b = buildEncounter(onFloor(83, {}, 999), 83)
    expect(a.waves[0]!.units.map((u) => u.name)).toEqual(b.waves[0]!.units.map((u) => u.name))
    expect(a.mission).toEqual(b.mission)
  })
})

describe('anchors F25–F100', () => {
  it('reference known templates and meet their budget', () => {
    for (const f of Object.keys(ANCHORS).map(Number).filter((f) => f > 20)) {
      const a = ANCHORS[f]!
      for (const w of a.waves) for (const g of w) expect(ENEMY_TEMPLATES[g.templateId], `F${f} ${g.templateId}`).toBeDefined()
      for (const al of a.allies ?? []) expect(ALLY_TEMPLATES[al.templateId]).toBeDefined()
      const enc = buildEncounter(onFloor(f), f)
      const cp = enc.waves.reduce((n, w) => n + w.units.reduce((m, u) => m + u.cp, 0), 0)
      expect(cp, `F${f}`).toBeGreaterThanOrEqual(floorPower(f, 1) * T.anchorBudgetMult * 0.99)
    }
  })

  it('carry the canon set-pieces', () => {
    const tags = (f: number) => buildEncounter(onFloor(f), f).waves.flatMap((w) => w.units.map((u) => u.targetTag))
    expect(buildEncounter(onFloor(25), 25).mission.objectives).toContainEqual({ kind: 'reach', distance: T.f25EscapeDistance })
    expect(tags(30)).toContain('stone_statue')
    expect(buildEncounter(onFloor(35), 35).mission.objectives).toEqual([{ kind: 'acquire', targetTag: 'blue_jewel' }])
    expect(tags(35)).toContain('kthat')
    expect(tags(40)).toContain('valention')
    expect(buildEncounter(onFloor(41), 41).mission.timer).toBe(T.f41ChaseTicks)
    expect(buildEncounter(onFloor(50), 50).mission.objectives.map((o) => o.kind)).toEqual(['protect', 'defeat'])
    expect(tags(80)).toContain('pryos')
    expect(tags(100)).toContain('tell')
  })

  it('an overwhelming party can win every late anchor', () => {
    for (const f of Object.keys(ANCHORS).map(Number).filter((f) => f > 20)) {
      const { result } = playFloor(both(f))
      expect(result.cleared, `F${f}: ${result.result.outcome}`).toBe(true)
    }
  })
})

describe('the F36–40 loop', () => {
  const base: TowerState = { currentFloor: 35, highestCleared: 34, attemptIndex: 0, event: null, loop: null, hiddenFound: [], worldEnded: false, worldSaved: false }

  it('opens on reaching F36 and closes when F40 falls', () => {
    const at36 = nextTowerState(base, 35, true).state
    expect(at36.loop).toEqual({ attemptsLeft: T.loop.attempts, scars: 0 })
    expect(nextTowerState({ ...at36, currentFloor: 40 }, 40, true).state.loop).toBeNull()
  })

  it('failing the F40 gate drops the room to F31 and spends an attempt; F36–39 failures just retry', () => {
    const inLoop: TowerState = { ...base, currentFloor: 40, highestCleared: 39, loop: { attemptsLeft: 5, scars: 0 } }
    const fail = nextTowerState(inLoop, 40, false)
    expect(fail.rollback).toBe(true)
    expect(fail.state.currentFloor).toBe(T.loop.fallbackTo)
    expect(fail.state.loop).toEqual({ attemptsLeft: 4, scars: 0 })
    expect(fail.state.highestCleared).toBe(39)
    const retry = nextTowerState({ ...inLoop, currentFloor: 38 }, 38, false)
    expect(retry.state.currentFloor).toBe(38)
    expect(retry.rollback).toBe(false)
  })

  it('running out of attempts scars the loop, hardening F36–40', () => {
    const last: TowerState = { ...base, currentFloor: 40, highestCleared: 39, loop: { attemptsLeft: 1, scars: 0 } }
    const scarred = nextTowerState(last, 40, false).state
    expect(scarred.loop).toEqual({ attemptsLeft: T.loop.attempts, scars: 1 })
    const plain = buildEncounter(onFloor(38, {}, 3, { loop: { attemptsLeft: 5, scars: 0 } }), 38).waves[0]!.units[0]!
    const hard = buildEncounter(onFloor(38, {}, 3, { loop: { attemptsLeft: 5, scars: 1 } }), 38).waves[0]!.units[0]!
    expect(hard.level).toBe(plain.level + T.loop.scarLevels)
  })

  it('a real F40 wipe rolls the tower back to F31', () => {
    const weak = onFloor(40, { xp: { level: 1, xpIntoLevel: 0, heldXp: 0, atCap: false } }, 11, { loop: { attemptsLeft: 5, scars: 0 } })
    const { state, result } = playFloor(weak)
    expect(result.cleared).toBe(false)
    expect(result.loopRollback).toBe(true)
    expect(state.tower.currentFloor).toBe(31)
  })
})

describe('events, hidden objectives, the end of the world', () => {
  it('an anchor’s first clear opens a bonus event that blocks the climb', () => {
    const { state, result } = playFloor(both(25))
    expect(result.event).toEqual({ kind: 'bonus', floor: 25, options: ['rest', 'treasure', 'merchant', 'gamble'] })
    expect(state.tower.event).toEqual(result.event)
    expect(() => playFloor(state)).toThrow(/event floor/)
  })

  it('F41’s first clear opens the tournament', () => {
    const { result } = playFloor(both(41))
    expect(result.event?.kind).toBe('tournament')
    expect(result.event?.options).toContain('deathmatch')
  })

  it('a filler first clear opens nothing; a repeat anchor clear opens nothing', () => {
    expect(playFloor(both(23)).result.event).toBeNull()
    expect(playFloor(both(25, 11, { highestCleared: 30 })).result.event).toBeNull()
  })

  it('hidden objectives are found once, pay out, and are recorded', () => {
    const s = both(30)
    const { state, result } = playFloor(s)
    expect(result.hiddenFound).toContain('void_key')
    expect(state.tower.hiddenFound).toContain('void_key')
    expect(state.gems).toBe(s.gems + HIDDEN_OBJECTIVES.find((h) => h.id === 'void_key')!.reward.gems!)
    const res = result.result as BattleResult
    expect(hiddenObjectivesMet(30, res, ['void_key'])).toEqual([])
  })

  it('the Hunt of the Water God needs Kthat felled before the jewel is taken', () => {
    const h = HIDDEN_OBJECTIVES.find((x) => x.id === 'hunt_of_the_water_god')!
    const base = { defeatedTargetTags: ['blue_jewel'], fallenHeroIds: [], ticksElapsed: 100, allyHpPct: {} } as unknown as BattleResult
    expect(hiddenObjectivesMet(35, base, []).map((x) => x.id)).not.toContain(h.id)
    const hunted = { ...base, defeatedTargetTags: ['kthat', 'blue_jewel'] } as BattleResult
    expect(hiddenObjectivesMet(35, hunted, []).map((x) => x.id)).toContain(h.id)
  })

  it('clearing F90 ends the world; F100 is the summit', () => {
    const { state, result } = playFloor(both(90))
    expect(result.worldEnded).toBe(true)
    expect(state.tower.worldEnded).toBe(true)
    const summit = playFloor(both(100))
    expect(summit.result.cleared).toBe(true)
    expect(summit.state.tower.currentFloor).toBe(101)
    expect(summit.result.event).toBeNull()
    expect(() => playFloor(summit.state)).toThrow(/summit/)
  })
})
