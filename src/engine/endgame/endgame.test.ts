import { describe, it, expect } from 'vitest'
import { buildEncounter, buildFillerEncounter, floorPower, mobLevel, playFloor } from '../tower'
import { createAccount, loadState, saveState } from '../account'
import { reduce, attemptFloorWithResult, reliveWithResult } from '../store'
import { HIDDEN_OBJECTIVES } from '../content'
import { TUNING } from '../tuning'
import { makeSeed, rngFor } from '../rng/rng'
import type { FallenRecord, GameState, HeroId, OwnedHero, TowerState } from '../types'
import {
  ENDGAME,
  POST_WALL,
  RELIVE_FLOORS,
  creditsOf,
  cycleMult,
  endgameOf,
  fateEncounter,
  fateGoldMult,
  fateOf,
  legendsOf,
  missedTruths,
  newCycle,
  relivableFloors,
  relive,
  reliveRefusal,
  scaleFoe,
  postWallRamp,
} from '.'

const T = TUNING.tower

function onFloor(floor: number, hero: Partial<OwnedHero> = {}, seed = 11, tower: Partial<TowerState> = {}, partner?: Partial<OwnedHero>): GameState {
  const acct = createAccount(seed, { now: 0 })
  const id = Object.keys(acct.heroes)[0] as HeroId
  const heroes: Record<string, OwnedHero> = { [id]: { ...acct.heroes[id]!, ...hero } }
  const slots: (HeroId | null)[] = [id, null, null, null, null]
  if (partner) {
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
const blade: Partial<OwnedHero> = { ...god, heroClass: 'warrior', element: 'physical', skills: [{ id: 'power_strike', level: 5, xp: 0 }] }
const gods = (f: number, seed = 11, tower: Partial<TowerState> = {}) => onFloor(f, god, seed, tower, blade)
/** Seven truths, enough to Subvert. */
const SEVEN = HIDDEN_OBJECTIVES.slice(0, TUNING.lifecycle.subvertTruths).map((h) => h.id).sort()
const cpOf = (w: { units: { cp: number }[] }[]) => w.reduce((n, x) => n + x.units.reduce((m, u) => m + u.cp, 0), 0)

const grave = (heroId: string, floor: number, day: number, extra: Partial<FallenRecord> = {}): FallenRecord => ({
  heroId: heroId as HeroId,
  name: `Hero ${heroId}`,
  star: 3,
  level: 30,
  heroClass: 'warrior',
  element: 'fire',
  portraitToken: `tok_${heroId}`,
  cause: 'battle',
  floor,
  day,
  daysServed: 3,
  bestFloor: floor,
  mourners: [],
  ...extra,
})

describe('the endgame slice', () => {
  it('a save without it reads as the first world, its fate unsealed', () => {
    const s = createAccount(5)
    expect(s.endgame).toBeUndefined()
    expect(endgameOf(s)).toEqual({ cycle: 0, history: [], legends: [] })
    expect(fateOf(s)).toBeNull()
    expect(cycleMult(s)).toBe(1)
  })
})

describe('the Siege of the Wailing Wall (F80)', () => {
  it('is four stages with a ram to protect and Pryos to defeat, the same for every Master', () => {
    const a = buildEncounter(onFloor(80, {}, 11), 80)
    const b = buildEncounter(onFloor(80, {}, 999), 80)
    expect(a.waves).toHaveLength(ENDGAME.siege.stages)
    expect(a.mission.objectives).toEqual([
      { kind: 'defend', waves: 4 },
      { kind: 'protect', targetTag: 'siege_ram' },
      { kind: 'defeat', targetTag: 'pryos' },
    ])
    expect(a.allies?.map((u) => u.name)).toEqual(['Siege Ram'])
    expect(a.waves[3]!.units.map((u) => u.targetTag)).toEqual(['pryos'])
    expect(JSON.stringify(a.waves)).toBe(JSON.stringify(b.waves))
  })

  it('stands on its budget, raised for the siege', () => {
    const enc = buildEncounter(onFloor(80), 80)
    const target = floorPower(80, 1) * T.anchorBudgetMult * T.wallPowerMult * ENDGAME.siege.budgetMult
    // The siege stands on exactly its budget (the elite steps are trimmed), give or take rounding.
    expect(Math.abs(cpOf(enc.waves) / target - 1)).toBeLessThan(0.01)
  })

  it('is deterministic: the same attempt replays the same siege', () => {
    const s = gods(80)
    const one = playFloor(s)
    const two = playFloor(s)
    expect(one.result.cleared).toBe(true)
    expect(JSON.stringify(two.result.result.log)).toBe(JSON.stringify(one.result.result.log))
    expect(one.result.result.log.events.filter((e) => e.kind === 'wave-spawn')).toHaveLength(3)
  })

  it('fields the ram as a mission NPC on the party’s side', () => {
    const s = gods(80)
    const enc = buildEncounter(s, 80)
    expect(enc.allies![0]!.targetTag).toBe('siege_ram')
    expect(enc.allies![0]!.isNpc).toBe(true)
  })
})

describe('behind the Wall (F81–89)', () => {
  it('each floor carries its own mission, the same for every Master, on the floor’s own budget', () => {
    for (const [f, def] of Object.entries(POST_WALL)) {
      const floor = Number(f)
      const a = buildEncounter(onFloor(floor, {}, 11), floor)
      const b = buildEncounter(onFloor(floor, {}, 4242), floor)
      expect(a.mission.type, `F${floor}`).toBe(def.missionType)
      expect(JSON.stringify(a), `F${floor}`).toBe(JSON.stringify(b))
      // The squad is the floor's power-budgeted fill (the Wall seed), reshaped and ramped
      // toward the Herald (×1.05 at F81 … ×1.45 at F89).
      const fill = buildFillerEncounter(floor, 1, rngFor(makeSeed(T.wallSeed), 'floor', floor))
      const units = a.waves.flatMap((w) => w.units)
      const filled = fill.waves.flatMap((w) => w.units)
      expect(units.map((u) => u.templateId).sort(), `F${floor}`).toEqual(filled.map((u) => u.templateId).sort())
      const byId = new Map(filled.map((u) => [u.id, u]))
      for (const u of units) expect(u.stats.maxHP, `F${floor} ${u.id}`).toBe(scaleFoe(byId.get(u.id)!, postWallRamp(floor)).stats.maxHP)
      expect(cpOf(a.waves)).toBeGreaterThan(cpOf(fill.waves))
      if (floor > 81) expect(postWallRamp(floor)).toBeGreaterThan(postWallRamp(floor - 1))
    }
  })

  it('gives the floors their identities: an escape, a seizure, a garrison, a captain, a banner, an echoing hall', () => {
    const m = (f: number) => buildEncounter(onFloor(f), f)
    expect(m(81).mission.objectives[0]).toEqual({ kind: 'reach', distance: ENDGAME.postWall.breachDistance })
    expect(m(82).mission.objectives[0]).toEqual({ kind: 'acquire', targetTag: 'archive_keeper' })
    expect(m(83).waves).toHaveLength(2)
    expect(m(84).waves[m(84).waves.length - 1]!.units.map((u) => u.targetTag)).toEqual(['vigil_captain'])
    expect(m(86).allies?.map((u) => u.name)).toEqual(['Al Ragna Banner'])
    expect(m(86).mission.objectives).toContainEqual({ kind: 'protect', targetTag: 'al_ragna_banner' })
    expect(m(87).mission.objectives[0]).toEqual({ kind: 'defend', waves: m(87).waves.length })
    // F85 stays the Colossus's anchor.
    expect(m(85).waves[1]!.units[0]!.targetTag).toBe('fragment_colossus')
  })
})

describe('the F90 decision and its consequences', () => {
  it('a plain clear ends the world, and the fate is sealed in the save', () => {
    const s = gods(90)
    const { state, result } = playFloor(s)
    expect(result.worldEnded).toBe(true)
    expect(fateOf(state)).toBe('ended')
    expect(endgameOf(state).fate).toEqual({ kind: 'ended', day: 0, truths: 0 })
    // It survives a save and a load.
    const back = loadState(saveState(state))
    expect(fateOf(back)).toBe('ended')
    expect(endgameOf(back).fate?.kind).toBe('ended')
  })

  it('past an ended world the void is sated and the floors pay less', () => {
    const alive = gods(91, 11, { highestCleared: 90 })
    const ended: GameState = { ...alive, tower: { ...alive.tower, worldEnded: true } }
    const a = buildEncounter(alive, 91)
    const b = buildEncounter(ended, 91)
    expect(cpOf(b.waves)).toBeLessThan(cpOf(a.waves))
    expect(b.waves[0]!.units[0]!.stats.maxHP).toBe(scaleFoe(a.waves[0]!.units[0]!, ENDGAME.fate.endedPowerMult).stats.maxHP)
    expect(fateGoldMult(ended, 91)).toBe(ENDGAME.fate.endedGoldMult)
    expect(fateGoldMult(ended, 89)).toBe(1)
    const ra = playFloor({ ...alive, tower: { ...alive.tower, highestCleared: 95 } }).result
    const rb = playFloor({ ...ended, tower: { ...ended.tower, highestCleared: 95 } }).result
    expect(ra.cleared && rb.cleared).toBe(true)
    expect(rb.goldAwarded).toBe(Math.round(ra.goldAwarded * ENDGAME.fate.endedGoldMult))
    // Floors before the end never change.
    expect(JSON.stringify(buildEncounter(ended, 85))).toBe(JSON.stringify(buildEncounter(alive, 85)))
  })

  it('subverting saves the world: the tribute is paid once, and Tell cannot call back the Herald', () => {
    const s = gods(90, 11, { hiddenFound: SEVEN })
    const r = attemptFloorWithResult(s, undefined, undefined, true)
    expect(r.result.worldSaved).toBe(true)
    expect(fateOf(r.state)).toBe('saved')
    expect(r.state.gems - s.gems).toBeGreaterThanOrEqual(ENDGAME.fate.savedTribute.gems)
    const top = { ...r.state, tower: { ...r.state.tower, currentFloor: 100 } }
    const summit = buildEncounter(top, 100)
    expect(summit.reserves?.echo3?.map((u) => u.templateId)).toEqual(['echo_pryos'])
    const plain = buildEncounter({ ...top, tower: { ...top.tower, worldSaved: false } }, 100)
    expect(plain.reserves?.echo3?.map((u) => u.templateId)).toEqual(['echo_pryos', 'echo_herald'])
  })

  it('replays deterministically through reduce, and matches the result helper', () => {
    const s = gods(90, 11, { hiddenFound: SEVEN })
    const a = reduce(s, { type: 'ATTEMPT_FLOOR', subvert: true })
    const b = reduce(s, { type: 'ATTEMPT_FLOOR', subvert: true })
    const c = attemptFloorWithResult(s, undefined, undefined, true).state
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(a)).toBe(JSON.stringify(c))
    // The fate is sealed once: clearing F90 again (a later attempt) changes nothing.
    expect(fateEncounter(a, 90, buildEncounter(a, 90))).toEqual(buildEncounter(a, 90))
  })
})

describe('Reliving (Memories of the Tower)', () => {
  it('holds the anchors and the truth floors below the end', () => {
    expect(RELIVE_FLOORS).toContain(10)
    expect(RELIVE_FLOORS).toContain(80)
    expect(RELIVE_FLOORS).toContain(89)
    expect(RELIVE_FLOORS).not.toContain(90)
    expect(RELIVE_FLOORS).not.toContain(21)
    expect(relivableFloors({ tower: { highestCleared: 20 } as TowerState })).toEqual([5, 10, 15, 20])
  })

  it('refuses an uncleared anchor, a floor with no memory, and an empty team', () => {
    const s = gods(20, 11, { highestCleared: 19 })
    const ids = s.party.slots.filter((x): x is HeroId => x !== null)
    expect(reliveRefusal(s, 20, 'true', ids, 0)).toMatch(/not been cleared/)
    expect(() => relive(s, 20, 'true', ids, 0)).toThrow(/^relive: F20 has not been cleared/)
    expect(() => reduce(s, { type: 'RELIVE_FLOOR', floor: 20, difficulty: 'true', heroIds: ids })).toThrow(/not been cleared/)
    expect(reliveRefusal(s, 21, 'true', ids, 0)).toMatch(/no memory/)
    expect(reliveRefusal(s, 10, 'true', [], 0)).toMatch(/at least one/)
    expect(reliveRefusal(s, 10, 'true', ids, 0)).toBeNull()
  })

  it('recovers a missed truth at true difficulty, pays half its reward, and costs Sanity — nobody dies', () => {
    const s = gods(30, 11, { highestCleared: 29 })
    const ids = s.party.slots.filter((x): x is HeroId => x !== null)
    expect(missedTruths(s).map((h) => h.id)).toContain('priest_before_fall')
    const { state, outcome } = relive(s, 10, 'true', ids, 0)
    expect(outcome.won).toBe(true)
    expect(outcome.truths).toEqual(['priest_before_fall'])
    expect(state.tower.hiddenFound).toContain('priest_before_fall')
    expect(endgameOf(state).recovered).toEqual(['priest_before_fall'])
    expect(outcome.gems).toBe(Math.round(15 * ENDGAME.relive.truthShare))
    for (const id of ids) {
      expect(state.heroes[id]!.alive).toBe(true)
      expect(state.heroes[id]!.sanity).toBe(Math.max(0, s.heroes[id]!.sanity - ENDGAME.relive.sanityCost))
    }
    expect(endgameOf(state).relive).toEqual({ week: 0, used: 1 })
    // A faded memory keeps no truths.
    const faded = relive(s, 10, 'faded', ids, 0)
    expect(faded.outcome.won).toBe(true)
    expect(faded.outcome.truths).toEqual([])
    // Deterministic, and the result helper agrees with reduce.
    const viaReduce = reduce(s, { type: 'RELIVE_FLOOR', floor: 10, difficulty: 'true', heroIds: ids })
    expect(JSON.stringify(reliveWithResult(s, { floor: 10, difficulty: 'true', heroIds: ids }).state)).toBe(JSON.stringify(viaReduce))
  })

  it('allows only a few memories a world-week', () => {
    let s = gods(30, 11, { highestCleared: 29 })
    const ids = s.party.slots.filter((x): x is HeroId => x !== null)
    for (let i = 0; i < ENDGAME.relive.attemptsPerWeek; i++) {
      s = relive({ ...s, heroes: Object.fromEntries(Object.entries(s.heroes).map(([k, h]) => [k, { ...h, sanity: 100 }])) }, 5, 'faded', ids, 0).state
    }
    expect(reliveRefusal(s, 5, 'faded', ids, 0)).toMatch(/No memories left/)
    // A new world-week brings them back.
    expect(reliveRefusal(s, 5, 'faded', ids, 7 * 24 * 3_600_000)).toBeNull()
  })
})

describe('the credits', () => {
  it('list exactly the fallen, in the order they fell, and exactly the living', () => {
    const s = gods(90)
    const ids = Object.keys(s.heroes) as HeroId[]
    const fallen = [grave('h_x2', 40, 5), grave('h_x1', 12, 2), grave('h_x3', 40, 5, { cause: 'synthesis' })]
    const dead = { ...s.heroes[ids[1]!]!, alive: false }
    const st: GameState = { ...s, heroes: { ...s.heroes, [ids[1]!]: dead }, life: { ...s.life, memorial: fallen } }
    const c = creditsOf(st)
    expect(c.fallen.map((g) => g.heroId)).toEqual(['h_x1', 'h_x2', 'h_x3'])
    expect(c.survivors.map((h) => h.id).sort()).toEqual(ids.filter((id) => id !== ids[1]).sort())
    expect(c.stats.fallen).toBe(3)
    expect(c.stats.survivors).toBe(ids.length - 1)
  })
})

describe('the New Cycle', () => {
  const sealed = (): GameState => {
    const s = playFloor(gods(90)).state
    return {
      ...s,
      gems: 777,
      gold: 999_999,
      meta: { ...s.meta, masterLevel: 31, masterXp: 123 },
      life: { ...s.life, memorial: [grave('h_a', 20, 1), grave('h_b', 70, 9), grave('h_c', 44, 4)], guide: { tutorialPull: true, done: ['step:summon', 'story:act:wall'] } },
      estate: { ...s.estate, statues: ['h_c' as HeroId] },
      codex: { entries: { goblin: { seen: 9, defeated: 9, studied: true, floors: [1, 2] } } },
    }
  }

  it('is refused before the world’s fate is sealed', () => {
    const s = gods(85)
    expect(() => newCycle(s)).toThrow(/^newCycle: /)
    expect(() => reduce(s, { type: 'NEW_CYCLE' })).toThrow(/newCycle/)
  })

  it('carries over exactly what it claims, and nothing else', () => {
    const s = sealed()
    const n = reduce(s, { type: 'NEW_CYCLE' })
    const eg = endgameOf(n)
    // Carried.
    expect(n.meta.masterLevel).toBe(31)
    expect(n.meta.masterXp).toBe(123)
    expect(n.gems).toBe(777)
    expect(n.codex).toEqual(s.codex)
    expect(n.meta.wallet).toEqual(s.meta.wallet)
    expect(n.accountId).toBe(s.accountId)
    expect(n.life.guide.done).toEqual(['step:summon'])
    expect(eg.cycle).toBe(1)
    expect(eg.history).toEqual([{ cycle: 0, fate: 'ended', day: 0, highestCleared: 90, fallen: 3, survivors: Object.keys(s.heroes).length, truths: 0, masterLevel: 31 }])
    // The legends: the statue first, then the deepest.
    expect(eg.legends.map((l) => [l.heroId, l.cycle, l.statue])).toEqual([
      ['h_c', 0, true],
      ['h_b', 0, false],
      ['h_a', 0, false],
    ])
    // Fresh.
    expect(Object.keys(n.heroes)).toHaveLength(1)
    expect(n.gold).toBe(TUNING.economy.startingGold)
    expect(n.tower.currentFloor).toBe(1)
    expect(n.tower.highestCleared).toBe(0)
    expect(fateOf(n)).toBeNull()
    expect(n.life.memorial).toEqual([])
    expect(n.estate.statues).toEqual([])
    expect(n.seed).not.toBe(s.seed)
  })

  it('makes the next world harder, and replays deterministically', () => {
    const s = sealed()
    const a = reduce(s, { type: 'NEW_CYCLE' })
    const b = reduce(s, { type: 'NEW_CYCLE' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(cycleMult(a)).toBeCloseTo(1 + ENDGAME.cycle.powerStep)
    const first = buildEncounter({ ...a, endgame: undefined }, 10)
    const second = buildEncounter(a, 10)
    expect(second.waves[0]!.units[0]!.level).toBeGreaterThan(first.waves[0]!.units[0]!.level)
    expect(mobLevel(10, cycleMult(a))).toBeGreaterThan(mobLevel(10, 1))
    // A second cycle adds to the history and keeps the old legends.
    const ended2: GameState = { ...a, tower: { ...a.tower, worldSaved: true, highestCleared: 90 }, life: { ...a.life, memorial: [grave('h_z', 3, 1)] } }
    const c = newCycle(ended2)
    expect(endgameOf(c).cycle).toBe(2)
    expect(endgameOf(c).history.map((h) => h.fate)).toEqual(['ended', 'saved'])
    expect(endgameOf(c).legends.map((l) => `${l.cycle}:${l.heroId}`)).toEqual(['0:h_c', '0:h_b', '0:h_a', '1:h_z'])
  })

  it('carries at most legendsCarried of a world’s fallen', () => {
    const s = sealed()
    const many = Array.from({ length: 20 }, (_, i) => grave(`h_${i}`, i + 1, i))
    expect(legendsOf({ ...s, life: { ...s.life, memorial: many } }, 0)).toHaveLength(ENDGAME.cycle.legendsCarried)
  })
})
