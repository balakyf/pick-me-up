// @vitest-environment jsdom
/**
 * Lane P · the coach: the lessons come in order along a real climb (each at its teaching
 * floor), each once per save, a Master far past a lesson is not taught it, the Settings
 * toggle silences them, a battle teaches the pending lesson when its moment plays, and the
 * First Steps checklist still counts exactly as before with coach latches in the save.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAccount } from '../../engine/account'
import { reduce } from '../../engine/store'
import { buildEncounter } from '../../engine/tower'
import type { CombatEvent, CombatUnitInit, GameState } from '../../engine/types'
import { LESSONS, battleLesson, coachSeen, coachStep, coachTip, happensIn, pendingLesson } from './coach'
import { DEFAULT_SETTINGS, SETTINGS_KEY, coachTipsOn, getSettings, reloadSettingsForTests, sanitizeSettings, updateSettings } from './settings'
import { GUIDE_STEPS, guideComplete, latchKey, stepDone } from '../life/FirstSteps'

const at = (s: GameState, floor: number, attemptIndex = 0): GameState => ({
  ...s,
  tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1, attemptIndex },
})
const latch = (s: GameState, step: string) => reduce(s, { type: 'GUIDE_STEP', step })

/** Climb F1→F25, reading (and dismissing) every tip the war room shows on the way. */
function climb(): { order: string[]; floors: Record<string, number> } {
  let s = createAccount(77, { now: 0 })
  const order: string[] = []
  const floors: Record<string, number> = {}
  for (let f = 1; f <= 25; f++) {
    s = at(s, f)
    // The war room may show more than one tip on a floor, one after the other.
    for (let guard = 0; guard < LESSONS.length; guard++) {
      const tip = coachTip({ state: s, floor: f, encounter: buildEncounter(s, f) }, true)
      if (tip === null) break
      order.push(tip.id)
      floors[tip.id] = f
      s = latch(s, coachStep(tip.id))
    }
  }
  return { order, floors }
}

beforeEach(() => {
  window.localStorage.clear()
  reloadSettingsForTests()
})
afterEach(() => {
  window.localStorage.clear()
  reloadSettingsForTests()
})

describe('the coach', () => {
  it('teaches every lesson in order along the climb, each at the floor that features it', () => {
    const { order, floors } = climb()
    expect(order).toEqual(LESSONS.map((l) => l.id))
    expect(floors).toMatchObject({ elements: 1, lines: 2, skills: 3, missions: 5, telegraph: 6, focus: 8, retreat: 10, healing: 11, statuses: 13, phases: 20, morale: 21 })
  })

  it('shows each lesson once per save, and only the first unseen one', () => {
    let s = at(createAccount(5, { now: 0 }), 3)
    const enc = buildEncounter(s, 3)
    // F3, nothing seen: the first lesson (elements) shows, not 'skills'.
    expect(coachTip({ state: s, floor: 3, encounter: enc }, true)!.id).toBe('elements')
    s = latch(s, coachStep('elements'))
    expect(coachSeen(s, 'elements')).toBe(true)
    expect(coachTip({ state: s, floor: 3, encounter: enc }, true)!.id).toBe('lines')
    s = latch(latch(s, coachStep('lines')), coachStep('skills'))
    // 'missions' is next, and F3 (a plain Subjugation) is not its moment.
    expect(pendingLesson(s)!.id).toBe('missions')
    expect(coachTip({ state: s, floor: 3, encounter: enc }, true)).toBeNull()
    // Latching twice changes nothing.
    expect(latch(s, coachStep('elements'))).toBe(s)
  })

  it('a loss brings the Retreat lesson forward once its turn comes', () => {
    let s = at(createAccount(5, { now: 0 }), 9, 1)
    for (const id of ['elements', 'lines', 'skills', 'missions', 'telegraph', 'focus'] as const) s = latch(s, coachStep(id))
    expect(coachTip({ state: s, floor: 9, encounter: buildEncounter(s, 9) }, true)!.id).toBe('retreat')
    expect(coachTip({ state: at(s, 9, 0), floor: 9, encounter: buildEncounter(s, 9) }, true)).toBeNull()
  })

  it('a Master far past a lesson is not taught it', () => {
    const s = at(createAccount(5, { now: 0 }), 79)
    expect(pendingLesson(s)).toBeNull()
    const mid = at(createAccount(5, { now: 0 }), 24)
    // At F24 the early lessons are behind the Master; skills is the first still taught.
    expect(pendingLesson(mid)!.id).toBe('skills')
  })

  it('the toggle silences every tip, in the war room and in battle', () => {
    const s = at(createAccount(5, { now: 0 }), 1)
    const ctx = { state: s, floor: 1, encounter: buildEncounter(s, 1) }
    expect(coachTip(ctx, true)).not.toBeNull()
    expect(coachTip(ctx, false)).toBeNull()
    let b = at(createAccount(5, { now: 0 }), 12)
    for (const id of ['elements', 'lines', 'skills', 'missions', 'focus', 'retreat', 'healing'] as const) b = latch(b, coachStep(id))
    expect(battleLesson(b, true)!.id).toBe('telegraph')
    expect(battleLesson(b, false)).toBeNull()
  })

  it('the toggle is a setting: on by default, kept on this device, garbage falls back to on', () => {
    expect(DEFAULT_SETTINGS.coachTips).toBe(true)
    expect(coachTipsOn()).toBe(true)
    updateSettings({ coachTips: false })
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!).coachTips).toBe(false)
    expect(reloadSettingsForTests().coachTips).toBe(false)
    expect(coachTipsOn()).toBe(false)
    expect(sanitizeSettings({ coachTips: 'nope' }).coachTips).toBe(true)
    updateSettings({ coachTips: true })
    expect(getSettings().coachTips).toBe(true)
  })

  it('a battle teaches its lesson the first time the moment plays (a foe winds up; a hero poisoned)', () => {
    const byId: Record<string, CombatUnitInit> = {
      h1: { id: 'h1', name: 'A', side: 'hero', line: 'front', unitClass: 'warrior', element: 'fire', level: 1, maxHP: 10, maxSP: 10, cp: 1 },
      e1: { id: 'e1', name: 'Goblin', side: 'enemy', line: 'back', unitClass: null, element: 'physical', level: 1, maxHP: 10, maxSP: 10, cp: 1 },
    }
    const wind = { seq: 3, tick: 4, kind: 'telegraph', unitId: 'e1', skillId: 'e_haymaker', firesAtTick: 9, targets: ['h1'] } as CombatEvent
    const poison = { seq: 5, tick: 6, kind: 'status', unitId: 'h1', status: 'poison', sourceId: 'e1', ticks: 30 } as CombatEvent
    const buff = { seq: 6, tick: 6, kind: 'status', unitId: 'h1', status: 'atk-up', sourceId: 'h1', ticks: 30 } as CombatEvent
    const telegraph = LESSONS.find((l) => l.id === 'telegraph')!
    const statuses = LESSONS.find((l) => l.id === 'statuses')!
    expect(happensIn(telegraph, [wind], byId)).toBe(true)
    expect(happensIn(telegraph, [poison], byId)).toBe(false)
    expect(happensIn(statuses, [poison], byId)).toBe(true)
    expect(happensIn(statuses, [buff], byId)).toBe(false)
    expect(happensIn(null, [wind], byId)).toBe(false)
  })
})

describe('First Steps with the coach in the save', () => {
  it('counts exactly as before: coach latches are not steps, and never retire the guide', () => {
    let s = createAccount(9, { now: 0 })
    const count = (x: GameState) => GUIDE_STEPS.filter((g) => stepDone(x, g)).length
    const before = count(s)
    const complete = guideComplete(s)
    for (const l of LESSONS) s = latch(s, coachStep(l.id))
    expect(count(s)).toBe(before)
    expect(guideComplete(s)).toBe(complete)
    // A real step still counts, with the coach's latches around it.
    s = latch(s, 'talk')
    s = latch(s, latchKey('talk'))
    expect(count(s)).toBe(before + 1)
    expect(s.life.guide.done.filter((d) => d.startsWith('coach:'))).toHaveLength(LESSONS.length)
  })
})
