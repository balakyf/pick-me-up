/** First steps latch (playtest 2026-10-13: "3/6 → 2/6" when the Master shrank the party). */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createAccount, MemoryStorage, persist } from '../../engine/account'
import { createStore, reduce } from '../../engine/store'
import { lifeOf } from '../../engine/life'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import { GUIDE_STEPS, latching, recordStep } from './FirstSteps'

const LINES = ['front', 'front', 'mid', 'back', 'back'] as const
const step = (id: string) => GUIDE_STEPS.find((g) => g.id === id)!
const doneCount = (s: GameState) => GUIDE_STEPS.filter((g) => g.done(s)).length

/** The tutorial ten-pull taken, a party of five set, Floor 1 not yet fought. */
function pulled(): GameState {
  let s = reduce(createAccount(21, { now: 0 }), { type: 'SUMMON', pool: 'normal', count: 10 })
  const ids = Object.keys(s.heroes).slice(0, 5) as HeroId[]
  s = reduce(s, { type: 'SET_PARTY', slots: ids, lines: [...LINES] })
  expect(s.tower.highestCleared).toBe(0)
  expect(step('party').done(s)).toBe(true)
  return s
}

function storeWith(state: GameState) {
  const storage = new MemoryStorage()
  persist(storage, state)
  const store = createStore({ storage })
  store.load()
  return store
}

function shrink(s: GameState): (HeroId | null)[] {
  return [s.party.slots[0]!, s.party.slots[1]!, null, null, null]
}

describe('first steps never go backwards', () => {
  it('a party of five, shrunk on the party board, stays done (the count never drops)', () => {
    const store = storeWith(pulled())
    const before = doneCount(store.getState()!)
    latching(store, 'party', () => store.dispatch({ type: 'SET_PARTY', slots: shrink(store.getState()!), lines: [...LINES] }))
    const s = store.getState()!
    expect(s.party.slots.filter(Boolean)).toHaveLength(2)
    expect(step('party').now!(s)).toBe(false)
    expect(step('party').done(s)).toBe(true)
    expect(s.life.guide.done).toContain('party')
    expect(doneCount(s)).toBe(before)
  })

  it('without the latch the same shrink would have undone the step (the bug)', () => {
    const s = pulled()
    const shrunk = reduce(s, { type: 'SET_PARTY', slots: shrink(s), lines: [...LINES] })
    expect(step('party').now!(shrunk)).toBe(false)
  })

  it('older saves: a party that has climbed counts, even shrunk', () => {
    const s = pulled()
    const shrunk = reduce(s, { type: 'SET_PARTY', slots: shrink(s), lines: [...LINES] })
    expect(step('party').done({ ...shrunk, tower: { ...shrunk.tower, highestCleared: 1 } })).toBe(true)
    expect(step('party').done({ ...shrunk, tower: { ...shrunk.tower, attemptIndex: 1 } })).toBe(true)
  })

  it('a job, once given, stays done when it ends — recorded, or read from the work done', () => {
    const s0 = pulled()
    const h = Object.values(s0.heroes)[0] as OwnedHero
    const s = { ...s0, heroes: { ...s0.heroes, [h.id]: { ...h, life: { ...lifeOf(h), job: 'cook' as const } } } }
    expect(step('job').done(s)).toBe(true)
    const store = storeWith(s)
    latching(store, 'job', () => store.dispatch({ type: 'ASSIGN_JOB', heroId: h.id, job: null }, Date.now()))
    const after = store.getState()!
    expect(step('job').now!(after)).toBe(false)
    // Recorded by the latch itself (the store's catch-up may also have banked jobXp here,
    // which would hide a missing latch: a job taken back before any work leaves none).
    expect(after.life.guide.done).toContain('job')
    expect(step('job').done(after)).toBe(true)
    // An older save with no record: a job worked (jobXp) is evidence enough.
    const worked = { ...s0, heroes: { ...s0.heroes, [h.id]: { ...h, life: { ...lifeOf(h), job: null, jobXp: { cook: 3 } } } } }
    expect(step('job').done(worked)).toBe(true)
    expect(step('job').done(s0)).toBe(false)
  })

  it('recordStep records nothing that is not done', () => {
    const s = pulled()
    const store = storeWith({ ...s, party: { ...s.party, slots: shrink(s) } })
    recordStep(store, 'party')
    recordStep(store, 'job')
    expect(store.getState()!.life.guide.done).not.toContain('party')
    expect(store.getState()!.life.guide.done).not.toContain('job')
  })

  it('every screen that changes the party or a job goes through the latch', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p, out)
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !p.includes('__fixtures__')) out.push(p)
      }
      return out
    }
    const bare: string[] = []
    let wired = 0
    for (const f of walk('src/ui')) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!/type: '(SET_PARTY|ASSIGN_JOB)'/.test(line)) return
          if (/latching\(store, '(party|job)'/.test(line)) wired++
          else bare.push(`${f}:${i + 1}`)
        })
    }
    expect(bare).toEqual([])
    expect(wired).toBeGreaterThanOrEqual(4) // the party board, Suggest a party, both job pickers
  })
})
