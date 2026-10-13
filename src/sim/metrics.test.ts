/**
 * The climb's success metrics (spec 2026-10-12 §3 "Success metrics", §4.4 Acceptance),
 * measured with the balance bots: casual and engaged free players, ten seeds each, from a
 * new account to F25. The bots scout every floor before they fight it, take the Skull
 * door when the Path would be Safe, take the first Boon, and go home when tired.
 *
 *   - a floor scouted Safe never kills;
 *   - at most 5% of attempts on floors scouted Fair cost a hero;
 *   - at most 10% of lost fights are full wipes (the rest are routs);
 *   - every first clear from F2 on offers two Doors for the next floor (bosses aside);
 *   - consecutive Path floors ask at most +12% more;
 *   - F1-F2 are the old tutorial floors, and the lone Islat Han clears F1.
 *
 * Kept under a few seconds: 20 short runs.
 */
import { describe, it, expect } from 'vitest'
import { simulate, type ProfileId } from './sim'
import type { FloorResult, GameState } from '../engine/types'
import type { ScoutReport } from '../engine/scout'
import { floorKindBase, pathBudget, doorsOfferedFor } from '../engine/climb'
import { buildEncounter, buildFillerEncounter, floorPower, playFloor } from '../engine/tower'
import { createAccount } from '../engine/account'
import { rngFor } from '../engine/rng'
import { TUNING } from '../engine/tuning'

const TOP = 25
const SEEDS = 10
const PROFILES: ProfileId[] = ['casual', 'engaged']

interface Attempt {
  run: string
  floor: number
  threat: ScoutReport['threat'] | 'none'
  ratio: number
  deaths: number
  deployed: number
  cleared: boolean
  firstClear: boolean
  doors: number
}

/** Every attempt the bots made, F1 to F25, with what the scout said beforehand. */
const attempts: Attempt[] = (() => {
  const out: Attempt[] = []
  for (const p of PROFILES) {
    for (let i = 0; i < SEEDS; i++) {
      const run = `${p}#${i}`
      simulate(
        p,
        1000 + i * 7919,
        30,
        (_before: GameState, r: FloorResult, report: ScoutReport | null) => {
          out.push({
            run,
            floor: r.floor,
            threat: report?.threat ?? 'none',
            ratio: report?.ratio ?? 0,
            deaths: r.fallenHeroIds.length,
            deployed: r.result.log.unitsInit.filter((u) => u.side === 'hero' && !u.isNpc).length,
            cleared: r.cleared,
            firstClear: r.firstClear,
            doors: r.doors?.length ?? 0,
          })
        },
        { untilFloor: TOP },
      )
    }
  }
  return out
})()

const describeAttempt = (a: Attempt) => `${a.run} F${a.floor} ratio ${a.ratio} ${a.deaths}/${a.deployed} dead`

describe('climb success metrics (20 bot runs, F1-F25)', () => {
  it('every run reaches F25', () => {
    for (const p of PROFILES)
      for (let i = 0; i < SEEDS; i++) {
        const best = Math.max(0, ...attempts.filter((a) => a.run === `${p}#${i}` && a.cleared).map((a) => a.floor))
        expect(best, `${p}#${i}`).toBeGreaterThanOrEqual(TOP)
      }
  })

  it('a floor scouted Safe never kills', () => {
    const safe = attempts.filter((a) => a.threat === 'safe')
    expect(safe.length).toBeGreaterThan(20)
    const deadly = safe.filter((a) => a.deaths > 0)
    expect(deadly.map(describeAttempt)).toEqual([])
  })

  it('at most 5% of attempts on Fair floors cost a hero', () => {
    const fair = attempts.filter((a) => a.threat === 'fair')
    expect(fair.length).toBeGreaterThan(100)
    const hurt = fair.filter((a) => a.deaths > 0)
    expect(hurt.length / fair.length, hurt.map(describeAttempt).join('\n')).toBeLessThanOrEqual(0.05)
  })

  it('at most 10% of lost fights are full wipes', () => {
    const losses = attempts.filter((a) => !a.cleared)
    const wipes = losses.filter((a) => a.deployed > 0 && a.deaths >= a.deployed)
    if (losses.length > 0) expect(wipes.length / losses.length, wipes.map(describeAttempt).join('\n')).toBeLessThanOrEqual(0.1)
  })

  it('every first clear from F2 offers two Doors for the next floor (unless it is a Boss)', () => {
    const firsts = attempts.filter((a) => a.firstClear && a.floor >= 2 && a.floor < TOP)
    expect(firsts.length).toBeGreaterThan(SEEDS * PROFILES.length * 15)
    for (const a of firsts) {
      const next = a.floor + 1
      const expected = doorsOfferedFor(next) ? TUNING.climb.doors.offered : 0
      expect(a.doors, describeAttempt(a)).toBe(expected)
      if (floorKindBase(next) === 'path') expect(a.doors, describeAttempt(a)).toBe(2)
    }
  })
})

describe('the static curve', () => {
  it('consecutive Path floors ask at most +12% more, at every world grade', () => {
    for (const wm of Object.values(TUNING.tower.worldMult)) {
      let prev: number | null = null
      for (let f = TUNING.climb.directorFromFloor; f <= TUNING.tower.sliceTopFloor; f++) {
        if (floorKindBase(f) !== 'path') continue
        const cur = pathBudget(f, wm)
        if (prev !== null) expect(cur / prev, `F${f} ×${wm}`).toBeLessThanOrEqual(1 + TUNING.climb.maxStepPct + 1e-9)
        prev = cur
      }
    }
    expect(TUNING.climb.maxStepPct).toBeLessThanOrEqual(0.12)
  })

  it('F1-F2 are unchanged: the old filler at floorPower', () => {
    for (const seed of [3, 7, 123, 999]) {
      const s = createAccount(seed, { now: 0 })
      for (const f of [1, 2]) {
        const now = buildEncounter({ ...s, tower: { ...s.tower, currentFloor: f } }, f)
        const old = buildFillerEncounter(f, 1, rngFor(s.seed, 'floor', f), 0, floorPower(f, 1))
        expect(now.waves).toEqual(old.waves)
      }
    }
  })

  it('the lone Islat Han clears F1', () => {
    for (const seed of [7, 123, 2026, 31337]) expect(playFloor(createAccount(seed, { now: 0 })).result.cleared, `seed ${seed}`).toBe(true)
  })
})
