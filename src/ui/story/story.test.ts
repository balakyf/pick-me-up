import { describe, expect, it } from 'vitest'
import { ACTS, ANCHORS, ENEMY_TEMPLATES, SKILLS } from '../../engine/content'
import { ACT_STORY, ANCHOR_STORY, BOSS_LINES, HERALD, PRIASIS_ARC } from '../../engine/content/story'
import { createAccount } from '../../engine/account'
import { reduce } from '../../engine/store'
import type { GameState, PhaseKeyword } from '../../engine/types'
import { BOSS_INTRO, phasesOf } from '../battle/bossIntro'
import { iselLines } from '../world/lines'
import {
  actCardDue,
  actKey,
  actNumeral,
  anchorBriefing,
  iselStoryWord,
  latestPriasis,
  priasisBeats,
  priasisKey,
  priasisUnread,
  storySeen,
  storyStep,
} from './storyText'

/** Every skill a template can wind up (its kit and its phases' skills). */
function charged(templateId: string): string[] {
  const tp = ENEMY_TEMPLATES[templateId]!
  const phases = (tp.keywords ?? []).filter((k): k is PhaseKeyword => k.kind === 'phase')
  return [...(tp.kit ?? []), ...phases.flatMap((p) => p.skills ?? [])].filter((s) => SKILLS[s]?.charge !== undefined)
}

const BOX = 120 // a JRPG text box, not a paragraph

describe('the story data (lane M)', () => {
  it('every act has a card: a name, an epigraph and Isel’s word', () => {
    expect(Object.keys(ACT_STORY).sort()).toEqual(ACTS.map((a) => a.id).sort())
    for (const a of ACTS) {
      const s = ACT_STORY[a.id]!
      expect(a.title).toContain(s.name)
      for (const line of [s.name, s.epigraph, s.isel]) expect(line.trim().length).toBeGreaterThan(0)
      expect(s.epigraph.length).toBeLessThanOrEqual(BOX)
    }
  })

  it('every anchor has a briefing and an aftermath, at text-box length', () => {
    expect(Object.keys(ANCHOR_STORY).map(Number).sort((a, b) => a - b)).toEqual(Object.keys(ANCHORS).map(Number).sort((a, b) => a - b))
    for (const [floor, s] of Object.entries(ANCHOR_STORY)) {
      for (const line of [s.title, s.who, s.why, s.isel, s.aftermath, s.opening?.line ?? 'x']) {
        expect(line.trim().length, `F${floor}`).toBeGreaterThan(0)
        expect(line.length, `F${floor}: ${line}`).toBeLessThanOrEqual(BOX)
      }
    }
  })

  it('every boss line belongs to a real boss, and every phase line to a real phase', () => {
    for (const [id, lines] of Object.entries(BOSS_LINES)) {
      expect(ENEMY_TEMPLATES[id], id).toBeDefined()
      expect(BOSS_INTRO[id], `${id} has a title card`).toBeDefined()
      const n = phasesOf(id).length
      for (const k of Object.keys(lines.phases ?? {}).map(Number)) {
        expect(k, `${id} phase ${k}`).toBeGreaterThanOrEqual(1)
        expect(k, `${id} phase ${k}`).toBeLessThanOrEqual(n)
      }
      // A wind-up line only for a move this foe can wind up.
      for (const skillId of Object.keys(lines.telegraph ?? {})) expect(charged(id), `${id} winds up ${skillId}`).toContain(skillId)
      for (const line of [lines.entrance, lines.defeat, lines.victory ?? 'x', ...Object.values(lines.telegraph ?? {}), ...Object.values(lines.phases ?? {})]) {
        expect(line.trim().length, id).toBeGreaterThan(0)
        expect(line.length, `${id}: ${line}`).toBeLessThanOrEqual(BOX)
      }
    }
  })

  it('every boss with a full title card speaks (entrance and defeat), and every anchor boss too', () => {
    for (const [id, intro] of Object.entries(BOSS_INTRO)) if (intro.tier === 'boss') expect(BOSS_LINES[id], id).toBeDefined()
    for (const def of Object.values(ANCHORS)) {
      const tags = new Set(def.objectives.flatMap((o) => ('targetTag' in o && o.targetTag ? [o.targetTag] : [])))
      for (const g of def.waves.flat()) if (g.targetTag && tags.has(g.targetTag) && BOSS_INTRO[g.templateId]?.tier === 'boss') expect(BOSS_LINES[g.templateId], g.templateId).toBeDefined()
    }
  })

  it('every boss that can wind up a big move says something as it does', () => {
    for (const id of Object.keys(BOSS_LINES)) for (const skillId of charged(id)) expect(BOSS_LINES[id]!.telegraph?.[skillId], `${id}: ${skillId}`).toBeDefined()
  })

  it('the bosses whose phase card is narration speak at the turn (Halgiraf takes flight)', () => {
    expect(BOSS_LINES.halgiraf!.phases?.[1]).toBeDefined()
    expect(BOSS_LINES.kthat!.phases?.[1]).toBeDefined()
  })

  it('the Priasis arc follows the canon: the escort, the escape, her death at the loop’s end, her kin at the Wall', () => {
    const ids = PRIASIS_ARC.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (let i = 1; i < PRIASIS_ARC.length; i++) expect(PRIASIS_ARC[i]!.after).toBeGreaterThanOrEqual(PRIASIS_ARC[i - 1]!.after)
    const at = (id: string) => PRIASIS_ARC.find((b) => b.id === id)!
    expect(at('ruins').after).toBe(15)
    expect(at('sands').after).toBe(25)
    expect(at('fallen').after).toBe(40)
    expect(at('fallen').letter!.from).toBe('isel')
    expect(at('pryos').after).toBe(80)
    for (const b of PRIASIS_ARC) {
      expect(b.lobby.length).toBeGreaterThan(0)
      for (const l of b.letter?.lines ?? []) expect(l.length).toBeLessThanOrEqual(BOX)
    }
    // Pryos knows (F80): his entrance names her.
    expect(BOSS_LINES.pryos!.entrance).toContain('Priasis')
  })

  it('the Herald frames the choice both ways', () => {
    for (const v of Object.values(HERALD)) expect(v.length).toBeGreaterThan(0)
    expect(HERALD.subvert).toMatch(/Subvert/)
  })
})

/** A fresh account standing on `floor` (all below cleared). */
function at(floor: number, patch: Partial<GameState['tower']> = {}): GameState {
  const s = createAccount(777, { now: 0 })
  return { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1, ...patch } }
}

describe('story in the war room and the lobby', () => {
  it('reads what was seen through the guide list, and an old save has seen nothing', () => {
    const s = at(1)
    expect(storySeen(s, 'act:prairie')).toBe(false)
    expect(storySeen({ life: {} } as unknown as GameState, 'act:prairie')).toBe(false)
    const seen = reduce(s, { type: 'GUIDE_STEP', step: storyStep('act:prairie') })
    expect(storySeen(seen, 'act:prairie')).toBe(true)
  })

  it('shows each act’s card once: the act the Master stands in, until it is latched', () => {
    const s = at(1)
    const due = actCardDue(s)
    expect(due?.id).toBe('prairie')
    expect(due?.story.name).toBe('The Prairie')
    const latched = reduce(s, { type: 'GUIDE_STEP', step: storyStep(actKey(due!)) })
    expect(actCardDue(latched)).toBeNull()
    // Climbing into the next act brings its card, the first still latched.
    const next = { ...latched, tower: { ...latched.tower, currentFloor: 11, highestCleared: 10 } }
    expect(actCardDue(next)?.id).toBe('ruins')
    expect(actNumeral(actCardDue(next)!)).toBe('II')
    // Past the summit there is nothing left to title.
    expect(actCardDue(at(101))).toBeNull()
  })

  it('briefs an anchor floor with its face: the boss, else the one to protect', () => {
    expect(anchorBriefing(19)).toBeNull()
    expect(anchorBriefing(20)?.face).toEqual({ kind: 'enemy', templateId: 'halgiraf' })
    expect(anchorBriefing(10)?.face).toEqual({ kind: 'enemy', templateId: 'black_priest' })
    expect(anchorBriefing(15)?.face).toEqual({ kind: 'ally', templateId: 'priasis' })
    expect(anchorBriefing(35)?.face).toEqual({ kind: 'enemy', templateId: 'kthat' })
    expect(anchorBriefing(45)?.face).toEqual({ kind: 'ally', templateId: 'key_bearer' })
    expect(anchorBriefing(90)?.face).toEqual({ kind: 'enemy', templateId: 'herald_of_end' })
    expect(anchorBriefing(5)?.face).toBeNull()
    expect(anchorBriefing(20)?.mission).toBe('Subjugation')
  })

  it('follows Priasis as far as the Master has climbed, and the world’s fate decides the last word', () => {
    expect(priasisBeats(at(10))).toEqual([])
    expect(latestPriasis(at(16))?.id).toBe('ruins')
    expect(latestPriasis(at(41))?.id).toBe('fallen')
    expect(latestPriasis(at(91, { worldEnded: true }))?.id).toBe('ended')
    expect(latestPriasis(at(91, { worldSaved: true }))?.id).toBe('saved')
    expect(priasisBeats(at(91, { worldSaved: true })).some((b) => b.id === 'ended')).toBe(false)
  })

  it('folds her newest letter into Isel’s until it is read', () => {
    const s = at(26)
    expect(priasisUnread(s)?.id).toBe('sands')
    const read = reduce(s, { type: 'GUIDE_STEP', step: storyStep(priasisKey(priasisUnread(s)!)) })
    expect(priasisUnread(read)).toBeNull()
    // F45's beat has no letter: the newest letter stays the one already read.
    expect(priasisUnread({ ...read, tower: { ...read.tower, highestCleared: 29 } })).toBeNull()
  })

  it('Isel tells the arc in the lobby, after her greeting and her tip', () => {
    expect(iselStoryWord(at(5))).toBeNull()
    expect(iselLines(at(5))).toHaveLength(2)
    const lines = iselLines(at(41))
    expect(lines).toHaveLength(3)
    expect(lines[2]).toBe(iselStoryWord(at(41)))
  })
})
