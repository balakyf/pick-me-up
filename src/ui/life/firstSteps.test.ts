import { describe, expect, it } from 'vitest'
import { reduce } from '../../engine/store'
import type { GameState } from '../../engine/types'
import { GUIDE_RETIRES_AT_FLOOR, GUIDE_STEPS, builtSomething, guideComplete, latchKey, stepDone, unlatchedSteps } from './FirstSteps'

const fresh = (): GameState => reduce(null, { type: 'NEW_ACCOUNT', seed: 99, now: 0 })
const step = (id: string) => GUIDE_STEPS.find((g) => g.id === id)!

describe('First Steps', () => {
  it('a new account has built nothing; any facility raised or under way counts', () => {
    const s = fresh()
    expect(builtSomething(s)).toBe(false)
    const training = { ...s, facilities: { ...s.facilities, trainingCenter: { level: 1, build: null } } }
    expect(builtSomething(training)).toBe(true)
    const building = { ...s, facilities: { ...s.facilities, promotionChamber: { level: 0, build: { toLevel: 1, completesAtWorld: 5 } } } }
    expect(builtSomething(building)).toBe(true)
    const kitchen2 = { ...s, facilities: { ...s.facilities, kitchen: { level: 2, build: null } } }
    expect(builtSomething(kitchen2)).toBe(true)
  })

  it('a latched step stays done when the state regresses (a hero dies)', () => {
    const s = fresh()
    const built = { ...s, facilities: { ...s.facilities, hallOfMagic: { level: 1, build: null } } }
    expect(unlatchedSteps(built).map((g) => g.id)).toContain('build')
    const latched = reduce(built, { type: 'GUIDE_STEP', step: latchKey('build') })
    // The building is gone again (say, an import), but the step stays ticked.
    const regressed = { ...latched, facilities: s.facilities }
    expect(stepDone(regressed, step('build'))).toBe(true)
    expect(unlatchedSteps(regressed).map((g) => g.id)).not.toContain('build')
  })

  it('retires when every step is done, when dismissed, or once the Master is well up the tower', () => {
    const s = fresh()
    expect(guideComplete(s)).toBe(false)
    let all = s
    for (const g of GUIDE_STEPS) all = reduce(all, { type: 'GUIDE_STEP', step: latchKey(g.id) })
    expect(guideComplete(all)).toBe(true)
    expect(guideComplete(reduce(s, { type: 'GUIDE_STEP', step: 'dismissed' }))).toBe(true)
    expect(guideComplete({ ...s, tower: { ...s.tower, highestCleared: GUIDE_RETIRES_AT_FLOOR } })).toBe(true)
  })
})
