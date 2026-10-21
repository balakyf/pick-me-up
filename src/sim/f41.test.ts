/**
 * F41, Versace of Silver Lightning (canon chase floor; plan
 * docs/superpowers/plans/2026-10-16-fun-tension-tuning.md, "Rest of the balance"):
 * a hard gate a prepared roster can pass, not a meat grinder.
 *
 * Versace acts at ~2.5-3.3× the party's pace, and CP prices speed like any other stat,
 * so the mercy cap used to size him as about a third of his real threat: engaged bots
 * needed ~3 attempts (up to 6 for the feel harness's typical player, a third of whom
 * walled there), every attempt was scouted Deadly, and a failed one cost 2.8 heroes on
 * average (up to 5). The cap now weighs him by his tempo (climb/kinds.ts `tempoMult`) and
 * a lost fight routs on its projected outcome (combat.ts `projectedLoss`).
 *
 * The engaged bot (src/sim/sim.ts) climbs from a new account until F41 is cleared. ~4 s.
 */
import { describe, it, expect } from 'vitest'
import { simulate } from './sim'
import type { Threat } from '../engine/scout'

const SEEDS = 10

interface F41Attempt {
  won: boolean
  dead: number
  threat: Threat | null
}

const runs = Array.from({ length: SEEDS }, (_, i) => {
  const attempts: F41Attempt[] = []
  const res = simulate('engaged', 1000 + i * 7919, 14, (_before, r, report) => {
    if (r.floor === 41) attempts.push({ won: r.cleared, dead: r.fallenHeroIds.length, threat: report?.threat ?? null })
  }, { untilFloor: 41 })
  return { seed: i, attempts, cleared: res.firstClearDay[41] !== undefined }
})
const table = runs.map((r) => `#${r.seed}: ${r.attempts.map((a) => `${a.threat}:${a.won ? 'W' : 'L'}${a.dead}`).join(' ')}`).join('\n')

describe(`F41 (Versace) is a gate, not a meat grinder: the engaged bot (${SEEDS} seeds)`, () => {
  it('every engaged roster that reaches F41 clears it within three attempts', () => {
    for (const r of runs) {
      expect(r.cleared, table).toBe(true)
      expect(r.attempts.length, table).toBeLessThanOrEqual(3)
    }
  })

  it('a failed attempt costs at most two heroes (the line breaks on the projected loss)', () => {
    for (const a of runs.flatMap((r) => r.attempts).filter((a) => !a.won)) expect(a.dead, table).toBeLessThanOrEqual(2)
  })

  it('the honest scout calls it a real risk for them: never Safe, mostly Risky', () => {
    const firsts = runs.map((r) => r.attempts[0]!)
    expect(firsts.filter((a) => a.threat === 'safe'), table).toEqual([])
    expect(firsts.filter((a) => a.threat === 'risky').length, table).toBeGreaterThanOrEqual(SEEDS / 2)
  })
})
