/**
 * The honest scout (spec 2026-10-12 §3 S12: "a floor scouted Safe or Fair should
 * essentially never kill"), measured where a CP ratio lies most: ROSTERS REBUILT after
 * losses. Fresh Lv1 recruits, mixed parties (half levelled to the floor, half Lv1) and
 * under-levelled parties (60% of the floor) are sent to F3-F40 across many seeds; the
 * mercy director holds their CP ratio near even while level-scaled mitigation and enemy
 * tempo make the real odds far worse. Each attempt is scouted, then played for real (on
 * the attempt's own combat stream, which the scout never reads):
 *
 *   - of attempts scouted Safe, at least 99% come back whole;
 *   - of attempts scouted Fair, at least 90% come back whole;
 *   - Deadly means it: at least half of the Deadly attempts are lost;
 *   - F41 (Versace, ~3x the party's speed) is never scouted Safe or Fair for a party that
 *     dies there.
 *
 * Before the trial-run scout (CP-ratio bands) the same Lv1 rosters lost a hero on 31 of
 * 32 floors scouted Safe and 88 of 119 scouted Fair.
 */
import { describe, it, expect } from 'vitest'
import { createAccount } from '../engine/account'
import { reduce, attemptFloorWithResult } from '../engine/store'
import { TUNING } from '../engine/tuning'
import { scoutFloor, suggestParty, type Threat } from '../engine/scout'
import { floorKindBase } from '../engine/climb'
import type { GameState, OwnedHero } from '../engine/types'

const SEEDS = 6
const ROSTER = 8
const MODES: Record<string, (i: number, floor: number) => number> = {
  recruits: () => 1,
  mixed: (i, f) => (i % 2 === 1 ? f : 1),
  under: (_, f) => Math.round(f * 0.6),
}

interface Sample {
  label: string
  floor: number
  threat: Threat
  winRate: number
  ratio: number
  deaths: number
  cleared: boolean
}

const summoned = (seed: number): GameState => {
  let s: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * ROSTER }
  for (let i = 0; i < ROSTER; i++) s = reduce(s, { type: 'SUMMON' })
  return s
}

const samples: Sample[] = (() => {
  const out: Sample[] = []
  for (let seed = 0; seed < SEEDS; seed++) {
    const base = summoned(4000 + seed * 977)
    for (const [mode, level] of Object.entries(MODES)) {
      for (let floor = 3; floor <= 41; floor++) {
        const heroes: Record<string, OwnedHero> = {}
        Object.values(base.heroes).forEach((h, i) => {
          heroes[h.id] = { ...h, xp: { ...h.xp, level: Math.max(1, level(i, floor)) } }
        })
        const rostered = { ...base, heroes }
        const p = reduce(rostered, { type: 'SET_PARTY', ...suggestParty(rostered) })
        const s: GameState = { ...p, tower: { ...p.tower, currentFloor: floor, highestCleared: floor - 1, kind: floorKindBase(floor) } }
        const report = scoutFloor(s)!
        const r = attemptFloorWithResult(s).result
        out.push({
          label: `${mode}#${seed} F${floor}`,
          floor,
          threat: report.threat,
          winRate: report.winRate,
          ratio: report.ratio,
          deaths: r.fallenHeroIds.length,
          cleared: r.cleared,
        })
      }
    }
  }
  return out
})()

const show = (a: Sample) => `${a.label} ratio ${a.ratio} won ${a.winRate} → ${a.cleared ? 'won' : 'lost'}, ${a.deaths} dead`
const whole = (xs: Sample[]) => xs.filter((a) => a.deaths === 0).length / xs.length

describe('the scout is honest for rebuilt rosters (Lv1, mixed, under-levelled; F3-F41)', () => {
  const upTo40 = samples.filter((a) => a.floor <= 40)

  it('Safe: at least 99% come back whole', () => {
    const safe = upTo40.filter((a) => a.threat === 'safe')
    expect(safe.length).toBeGreaterThan(100)
    expect(whole(safe), safe.filter((a) => a.deaths > 0).map(show).join('\n')).toBeGreaterThanOrEqual(0.99)
  })

  it('Fair: at least 90% come back whole', () => {
    const fair = upTo40.filter((a) => a.threat === 'fair')
    expect(fair.length).toBeGreaterThan(30)
    expect(whole(fair), fair.filter((a) => a.deaths > 0).map(show).join('\n')).toBeGreaterThanOrEqual(0.9)
  })

  it('Deadly is not just pessimism: at least half of Deadly attempts are lost', () => {
    const deadly = upTo40.filter((a) => a.threat === 'deadly')
    expect(deadly.length).toBeGreaterThan(30)
    expect(deadly.filter((a) => !a.cleared).length / deadly.length).toBeGreaterThanOrEqual(0.5)
  })

  it('F41 (Versace) is never Safe or Fair for a party that dies there', () => {
    const f41 = samples.filter((a) => a.floor === 41)
    expect(f41.length).toBe(SEEDS * Object.keys(MODES).length)
    const lied = f41.filter((a) => a.deaths > 0 && (a.threat === 'safe' || a.threat === 'fair'))
    expect(lied.map(show)).toEqual([])
  })
})
