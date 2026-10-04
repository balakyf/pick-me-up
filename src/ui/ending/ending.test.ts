import { describe, expect, it } from 'vitest'
import { createAccount } from '../../engine/account'
import { playFloor } from '../../engine/tower'
import { reduce } from '../../engine/store'
import { HIDDEN_OBJECTIVES } from '../../engine/content'
import { ANCHOR_STORY, EPILOGUE, POST_WALL_STORY } from '../../engine/content/story'
import { POST_WALL } from '../../engine/endgame'
import type { CombatLog, FallenRecord, GameState, HeroId, OwnedHero } from '../../engine/types'
import { setLocale } from '../i18n/i18n'
import { storyStep } from '../story/storyText'
import { storyBeats } from '../story/storyBeats'
import {
  afterActDue,
  creditRoll,
  cycleLine,
  epilogueDue,
  epilogueKey,
  epilogueOf,
  fateConsequences,
  fateTint,
  memoryRows,
  newCycleCarries,
  postWallBriefing,
  truthsShort,
} from './endingText'

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

function gods(floor: number, tower: Partial<GameState['tower']> = {}): GameState {
  const acct = createAccount(21, { now: 0 })
  const id = Object.keys(acct.heroes)[0] as HeroId
  const heroes: Record<string, OwnedHero> = { [id]: { ...acct.heroes[id]!, ...god } }
  const slots: (HeroId | null)[] = [id, null, null, null, null]
  ;[god, blade, god, blade].forEach((kind, i) => {
    const pid = `h_p${i}` as HeroId
    heroes[pid] = { ...acct.heroes[id]!, id: pid, name: `Partner${i} Vale`, ...kind }
    slots[i + 1] = pid
  })
  return { ...acct, heroes, party: { slots, lines: ['front', 'front', 'mid', 'back', 'back'] }, tower: { ...acct.tower, currentFloor: floor, highestCleared: floor - 1, ...tower } }
}

const grave = (h: OwnedHero, floor: number, day: number): FallenRecord => ({
  heroId: h.id,
  name: h.name,
  star: h.star,
  level: h.xp.level,
  heroClass: h.heroClass,
  element: h.element,
  portraitToken: h.portraitToken,
  cause: 'battle',
  floor,
  day,
  daysServed: 4,
  bestFloor: floor,
  mourners: [],
})

describe('the ending, in words (lane O)', () => {
  it('plays the epilogue once, after the fate is sealed', () => {
    setLocale('en')
    const before = gods(90)
    expect(epilogueDue(before)).toBeNull()
    const ended = playFloor(before).state
    expect(epilogueDue(ended)).toBe('ended')
    const seen = reduce(ended, { type: 'GUIDE_STEP', step: storyStep(epilogueKey('ended')) })
    expect(epilogueDue(seen)).toBeNull()
    const ep = epilogueOf('ended')
    expect(ep.stills.map((s) => s.act.id)).toEqual(EPILOGUE.ended.stills.map((s) => s.id))
    expect(ep.isel).toBe(EPILOGUE.ended.isel)
  })

  it('brings Act VIII’s card back once past ninety, latched apart from the first', () => {
    const s = playFloor(gods(90)).state
    const due = afterActDue(s)
    expect(due?.id).toBe('void')
    expect(due?.latch).toBe('act:void:ended')
    expect(due?.story.epigraph).toMatch(/gone/)
    const seen = reduce(s, { type: 'GUIDE_STEP', step: storyStep('act:void:ended') })
    expect(afterActDue(seen)).toBeNull()
    expect(afterActDue(gods(91))).toBeNull()
  })

  it('the credits list exactly the fallen — with last words and Isel’s eulogy — and exactly the living', () => {
    setLocale('en')
    const s = gods(90)
    const ids = Object.keys(s.heroes) as HeroId[]
    const dead = [ids[1]!, ids[3]!]
    const heroes = { ...s.heroes }
    for (const id of dead) heroes[id] = { ...heroes[id]!, alive: false }
    const memorial = [grave(heroes[dead[1]!]!, 44, 7), grave(heroes[dead[0]!]!, 20, 3)]
    const st: GameState = { ...s, heroes, life: { ...s.life, memorial } }
    const roll = creditRoll(st)
    expect(roll.fallen.map((f) => f.id)).toEqual([dead[0], dead[1]])
    for (const f of roll.fallen) {
      expect(f.lastWords.length).toBeGreaterThan(1)
      expect(f.eulogy.length).toBeGreaterThan(10)
      expect(f.meta).toMatch(/fell on F\d+/)
    }
    expect(roll.survivors.map((x) => x.id).sort()).toEqual(ids.filter((id) => !dead.includes(id)).sort())
    expect(roll.stats.some((l) => l.includes('2 fell'))).toBe(true)
  })

  it('names the fate’s consequences, the cycle, the lobby tint and what a New Cycle keeps', () => {
    setLocale('en')
    const plain = gods(85)
    expect(fateConsequences(plain)).toBeNull()
    expect(cycleLine(plain)).toBeNull()
    expect(fateTint(plain)).toBe('')
    const ended = playFloor(gods(90)).state
    expect(fateConsequences(ended)?.lines.join(' ')).toMatch(/85%/)
    expect(fateTint(ended)).toBe('fate-tint-ended')
    const saved = playFloor(gods(90, { hiddenFound: HIDDEN_OBJECTIVES.slice(0, 7).map((h) => h.id).sort() }), undefined, undefined, true).state
    expect(fateConsequences(saved)?.title).toBe('The world was spared')
    const next = reduce(saved, { type: 'NEW_CYCLE' })
    expect(cycleLine(next)).toMatch(/Cycle II/)
    expect(newCycleCarries(saved).keeps.join(' ')).toMatch(/Enemy Codex/)
  })

  it('briefs the floors behind the Wall, and only them', () => {
    for (const f of Object.keys(POST_WALL).map(Number)) {
      const b = postWallBriefing(f)
      expect(b?.title, `F${f}`).toBe(POST_WALL_STORY[f]!.title)
      expect(b?.mission).toBe(POST_WALL[f]!.missionType)
    }
    expect(postWallBriefing(80)).toBeNull()
    expect(postWallBriefing(85)).toBeNull()
    expect(postWallBriefing(79)).toBeNull()
  })

  it('lists the memories with missed truths first, and counts the truths still needed', () => {
    setLocale('en')
    const s = gods(36, { highestCleared: 35, hiddenFound: ['void_key'] })
    const rows = memoryRows(s)
    expect(rows[0]!.missed.length).toBeGreaterThan(0)
    expect(rows.find((r) => r.floor === 30)!.found.map((h) => h.id)).toEqual(['void_key'])
    expect(rows.every((r) => r.floor <= 35)).toBe(true)
    expect(truthsShort(s)).toBe(6)
  })

  it('the siege speaks stage by stage, and a floor behind the Wall opens with its own line', () => {
    setLocale('en')
    const byIdOf = (log: CombatLog) => Object.fromEntries(log.unitsInit.map((u) => [u.id, u]))
    const siege = playFloor(gods(80)).result.result.log
    const lines = [...storyBeats(siege, byIdOf(siege)).values()]
    expect(lines.filter((l) => l.kind === 'wave').map((l) => l.text)).toEqual(Object.values(ANCHOR_STORY[80]!.waves!).map((w) => w.line))
    expect(lines.some((l) => l.kind === 'opening' && l.text === ANCHOR_STORY[80]!.opening!.line)).toBe(true)
    const road = playFloor(gods(81)).result.result.log
    expect([...storyBeats(road, byIdOf(road)).values()].some((l) => l.kind === 'opening' && l.text === POST_WALL_STORY[81]!.opening!.line)).toBe(true)
  })
})
