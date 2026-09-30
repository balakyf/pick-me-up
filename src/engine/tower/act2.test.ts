import { describe, it, expect } from 'vitest'
import { buildEncounter, fillerPoolForFloor, isRuinsFloor, playFloor } from './tower'
import { runBattle } from '../combat'
import { buildAllyUnit, buildEnemyUnit } from '../unit'
import { createAccount } from '../account'
import { ALLY_TEMPLATES, ANCHORS, ENEMY_TEMPLATES } from '../content'
import { TUNING } from '../tuning'
import type { CombatUnit, Encounter, GameState, HeroId, OwnedHero } from '../types'

/** A fresh account whose only (party) hero is `hero`, standing on `floor`. */
function onFloor(floor: number, hero: Partial<OwnedHero>, seed = 11): GameState {
  const acct = createAccount(seed, { now: 0 })
  const id = Object.keys(acct.heroes)[0] as HeroId
  const h = { ...acct.heroes[id]!, ...hero }
  return {
    ...acct,
    heroes: { [id]: h },
    party: { slots: [id, null, null, null, null], lines: ['front', 'front', 'mid', 'back', 'back'] },
    tower: { currentFloor: floor, highestCleared: floor - 1, attemptIndex: 0, event: null, loop: null, hiddenFound: [], worldEnded: false, worldSaved: false },
  }
}

const crusher: Partial<OwnedHero> = {
  star: 7,
  heroClass: 'mage',
  element: 'light',
  baseAttrs: { str: 100, agi: 100, vit: 100, int: 100, wil: 100 },
  growthGrades: { str: 10, agi: 10, vit: 10, int: 10, wil: 10 },
  xp: { level: 90, xpIntoLevel: 0, heldXp: 0, atCap: false },
  skills: [{ id: 'arcane_burst', level: 5, xp: 0 }],
}

describe('act bands', () => {
  it('F1–9 draw from the Prairie, F11–19 from the Ruins', () => {
    expect(fillerPoolForFloor(3).map((t) => t.id)).toEqual(['goblin', 'wolf', 'harpy'])
    const ruins = fillerPoolForFloor(12).map((t) => t.id)
    expect(ruins).toEqual(['skeleton', 'soldier', 'dark_mage', 'assassin', 'knight'])
    expect(isRuinsFloor(10)).toBe(false)
    expect(isRuinsFloor(11)).toBe(true)
  })

  it('Ruins filler mixes Subjugation and Survival across accounts, from the Ruins pool only', () => {
    const types = new Set<string>()
    const ruinIds = new Set(fillerPoolForFloor(13).map((t) => t.name))
    for (let seed = 1; seed <= 40; seed++) {
      const enc = buildEncounter(onFloor(13, {}, seed), 13)
      types.add(enc.mission.type)
      for (const u of enc.waves[0]!.units) expect(ruinIds.has(u.name)).toBe(true)
      if (enc.mission.type === 'Survival') {
        expect(enc.mission.objectives).toEqual([{ kind: 'survive', ticks: TUNING.tower.ruinsSurviveTicks }])
      }
    }
    expect(types).toEqual(new Set(['Subjugation', 'Survival']))
  })

  it('Prairie filler is always Subjugation (unchanged)', () => {
    for (let seed = 1; seed <= 20; seed++) expect(buildEncounter(onFloor(7, {}, seed), 7).mission.type).toBe('Subjugation')
  })

  it('the tower now tops out at floor 100', () => {
    expect(TUNING.tower.sliceTopFloor).toBe(100)
  })
})

describe('F15 — Escort Princess Priasis', () => {
  it('fields Priasis as a hero-side NPC on the back line with a protect objective', () => {
    const enc = buildEncounter(onFloor(15, {}), 15)
    expect(enc.mission.type).toBe('Escort')
    expect(enc.mission.objectives).toContainEqual({ kind: 'protect', targetTag: 'priasis' })
    expect(enc.allies).toHaveLength(1)
    const p = enc.allies![0]!
    expect(p).toMatchObject({ name: 'Princess Priasis', side: 'hero', isNpc: true, line: 'back', targetTag: 'priasis' })
    expect(ANCHORS[15]!.allies![0]!.templateId in ALLY_TEMPLATES).toBe(true)
  })

  it('a crushing party escorts her through: cleared, and she never counts as a party hero', () => {
    const { result } = playFloor(onFloor(15, crusher))
    expect(result.result.outcome).toBe('win')
    expect(result.cleared).toBe(true)
    expect(result.fallenHeroIds).toEqual([])
    expect(result.result.survivorHeroIds.every((id) => !String(id).startsWith('a'))).toBe(true)
  })

  it('if she falls the mission fails: not cleared, the party stays on F15', () => {
    // An unkillable wall that barely hurts anyone: assassins slip past to Priasis.
    const wall: Partial<OwnedHero> = {
      ...crusher,
      heroClass: 'warrior',
      baseAttrs: { str: 1, agi: 1, vit: 100, int: 1, wil: 100 },
      growthGrades: { str: 0, agi: 0, vit: 10, int: 0, wil: 10 },
      skills: [],
    }
    const { state, result } = playFloor(onFloor(15, wall))
    expect(result.result.outcome).toBe('failed')
    expect(result.cleared).toBe(false)
    expect(state.tower.currentFloor).toBe(15)
    expect(result.result.log.events.some((e) => e.kind === 'death' && e.unitId.startsWith('a15_'))).toBe(true)
  })
})

describe('F20 — Halgiraf, the half black dragon', () => {
  it('guards first, then the light-vulnerable, enraging dragon as the Defeat target', () => {
    const enc = buildEncounter(onFloor(20, {}), 20)
    expect(enc.mission.objectives).toEqual([{ kind: 'defeat', targetTag: 'halgiraf' }])
    expect(enc.waves).toHaveLength(2)
    const dragon = enc.waves[1]!.units.find((u) => u.targetTag === 'halgiraf')!
    expect(dragon.name).toBe('Halgiraf')
    expect(dragon.keywords).toContainEqual({ kind: 'vulnerable', element: 'light' })
    expect(dragon.keywords.some((k) => k.kind === 'enrage')).toBe(true)
    expect(dragon.stats.maxHP).toBeGreaterThan(enc.waves[1]!.units.find((u) => u.targetTag !== 'halgiraf')!.stats.maxHP * 3)
  })

  it('a crushing light party slays him and clears the act', () => {
    const { result } = playFloor(onFloor(20, crusher))
    expect(result.result.defeatedTargetTags).toContain('halgiraf')
    expect(result.cleared).toBe(true)
  })
})

describe('combat — NPC allies', () => {
  const T = ENEMY_TEMPLATES
  const npc = (): CombatUnit => buildAllyUnit(ALLY_TEMPLATES.priasis!, 5, 'npc', { line: 'back', targetTag: 'vip' })
  const hero = (vit = 60): CombatUnit => ({
    ...buildEnemyUnit(T.knight!, 30, 'h1'),
    side: 'hero',
    sourceHeroId: 'h1' as HeroId,
    stats: { ...buildEnemyUnit(T.knight!, 30, 'h1').stats, maxHP: vit * 100, pAtk: 1, mAtk: 1 },
    currentHP: vit * 100,
  })
  const enc = (objectives: Encounter['mission']['objectives'], enemies: CombatUnit[], timer: number | null = 200): Encounter => ({
    floor: 15,
    mission: { type: 'test', objectives, timer },
    waves: [{ units: enemies }],
    encounterContext: 'tower',
    allies: [npc()],
  })

  it('never acts, and is the assassins’ first target', () => {
    const r = runBattle([hero()], enc([{ kind: 'protect', targetTag: 'vip' }, { kind: 'survive', ticks: 200 }], [buildEnemyUnit(T.assassin!, 30, 'e1')]), 1)
    expect(r.log.events.some((e) => e.kind === 'act' && e.actorId === 'npc')).toBe(false)
    const firstEnemyAct = r.log.events.find((e) => e.kind === 'act' && e.actorId === 'e1') as { targetId: string } | undefined
    expect(firstEnemyAct?.targetId).toBe('npc')
    expect(r.log.unitsInit.find((u) => u.id === 'npc')?.isNpc).toBe(true)
  })

  it('her death ends the battle as `failed`, with the party still standing', () => {
    const r = runBattle([hero()], enc([{ kind: 'protect', targetTag: 'vip' }, { kind: 'survive', ticks: 2000 }], [buildEnemyUnit(T.assassin!, 40, 'e1')], 2000), 2)
    expect(r.outcome).toBe('failed')
    expect(r.survivorHeroIds).toEqual(['h1'])
    expect(r.fallenHeroIds).toEqual([])
  })

  it('a living NPC does not keep a wiped party in the fight', () => {
    const glass: CombatUnit = { ...hero(), stats: { ...hero().stats, maxHP: 1, pDef: 0, mDef: 0 }, currentHP: 1 }
    const r = runBattle([glass], enc([{ kind: 'annihilate' }], [buildEnemyUnit(T.knight!, 40, 'e1')], null), 3)
    expect(r.outcome).toBe('wipe')
  })
})

describe('F20 — raid rewards (Layer 1 completion)', () => {
  it('the first clear drops a Book of Reverse Heaven and teaches Dragon Slayer', () => {
    const { state, result } = playFloor(onFloor(20, crusher))
    expect(result.firstClear).toBe(true)
    expect(result.materialsAwarded.bookOfReverseHeaven).toBe(1)
    expect(state.materials.bookOfReverseHeaven).toBe(1)
    const id = Object.keys(state.heroes)[0] as HeroId
    expect(state.heroes[id]!.skills.map((s) => s.id)).toContain('dragon_slayer')
    expect(result.skillProgress).toContainEqual({ kind: 'achievement', heroId: id, skillId: 'dragon_slayer' })
  })

  it('a repeat clear drops no second Book', () => {
    const repeat = { ...onFloor(20, crusher), tower: { currentFloor: 20, highestCleared: 20, attemptIndex: 0, event: null, loop: null, hiddenFound: [], worldEnded: false, worldSaved: false } }
    const { result } = playFloor(repeat)
    expect(result.cleared).toBe(true)
    expect(result.materialsAwarded.bookOfReverseHeaven).toBeUndefined()
  })
})
