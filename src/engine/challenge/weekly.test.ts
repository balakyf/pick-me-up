import { describe, it, expect } from 'vitest'
import type { GameState, HeroId, OwnedHero } from '../types'
import { CHALLENGE } from './tuning'
import { challengeOf } from './challenge'
import { heroAllowed, runWeeklyTrial, weeklyAttemptsLeft, weeklyFor, weeklyRefusal, weeklyRule, weeklyWaves } from './weekly'
import { rosterIds, veteranState } from './fixtures.test-util'

const W = CHALLENGE.weekly
const WEEK = 7 * 24 * 3_600_000

/** Up to `n` heroes who meet week `week`'s rule. */
function eligible(s: GameState, week: number): HeroId[] {
  const rule = weeklyRule(week)
  return rosterIds(s)
    .filter((id) => heroAllowed(rule, s.heroes[id]!))
    .slice(0, rule.maxHeroes)
}

describe('the weekly Crack of Time trial: rules and rotation', () => {
  it('rotates a fixed rule per world-week (the element one cycles its element)', () => {
    const ids = Array.from({ length: 10 }, (_, w) => weeklyRule(w).id)
    expect(new Set(ids)).toEqual(new Set(['lowStar', 'element', 'duo', 'tough', 'noMages']))
    expect(weeklyRule(12)).toEqual(weeklyRule(12))
    expect(weeklyRule(1).element).not.toBe(weeklyRule(6).element)
    expect(weeklyRule(2).maxHeroes).toBe(2)
    expect(weeklyRule(3).enemyHpMult).toBe(W.toughHpMult)
  })

  it('the gauntlet escalates and is the same for every Master that week', () => {
    const a = weeklyWaves(veteranState(1, 10, 20), 4)
    const b = weeklyWaves(veteranState(2, 10, 20), 4)
    expect(a).toHaveLength(W.waves)
    expect(a.map((w) => w.map((u) => u.name))).toEqual(b.map((w) => w.map((u) => u.name)))
    expect(a.at(-1)![0]!.level).toBeGreaterThan(a[0]![0]!.level)
    // A tough week's enemies arrive with their HP pool raised (and full).
    const tough = weeklyWaves(veteranState(1, 10, 20), 3)
    for (const u of tough.flat()) expect(u.currentHP).toBe(u.stats.maxHP)
  })

  it('enforces the rule, the unlock floor and three attempts a week', () => {
    const s = veteranState(3, 20, 20)
    expect(weeklyRefusal(veteranState(3, 20, 5), eligible(s, 0), 0)).toMatch(/opens once/)
    expect(weeklyRefusal(s, [], 0)).toMatch(/at least one/)
    // Week 2 is the duo week: three heroes are refused.
    expect(weeklyRefusal(s, rosterIds(s).slice(0, 3), 2 * WEEK)).toMatch(/allows 2/)
    // Week 0 is 3★ and below: a 4★ is refused.
    const four = rosterIds(s)[0]!
    const promoted = { ...s, heroes: { ...s.heroes, [four]: { ...s.heroes[four]!, star: 4 } as OwnedHero } }
    expect(weeklyRefusal(promoted, [four], 0)).toMatch(/rule/)
    let cur = s
    for (let i = 0; i < W.attempts; i++) cur = runWeeklyTrial(cur, eligible(s, 0), 0).state
    expect(weeklyAttemptsLeft(cur, 0)).toBe(0)
    expect(() => runWeeklyTrial(cur, eligible(s, 0), 0)).toThrow(/No attempts/)
    // A new week starts fresh.
    expect(weeklyAttemptsLeft(cur, WEEK)).toBe(W.attempts)
    expect(weeklyFor(cur, WEEK)).toEqual({ week: 1, attempts: 0, best: 0, claimed: 0 })
  })
})

describe('the weekly trial: scoring, rewards, and no permadeath', () => {
  it('score = waves cleared; nothing real is lost (no death, no Sanity, no XP)', () => {
    const s0 = veteranState(3, 25, 20)
    // Tired heroes enter the simulation too — at full Sanity, and leave as they came.
    const heroes = { ...s0.heroes }
    for (const h of Object.values(heroes) as OwnedHero[]) heroes[h.id] = { ...h, sanity: 10 }
    const s = { ...s0, heroes }
    const team = eligible(s, 0)
    const r = runWeeklyTrial(s, team, 0)
    expect(r.outcome.score).toBeGreaterThan(0)
    expect(r.outcome.score).toBeLessThan(W.waves)
    expect(r.outcome.log.outcome).not.toBe('win')
    expect(r.state.heroes).toEqual(s.heroes)
    expect(r.state.gold).toBe(s.gold)
    expect(challengeOf(r.state).weekly).toEqual({ week: 0, attempts: 1, best: r.outcome.score, claimed: r.outcome.reached.length })
    expect(runWeeklyTrial(s, team, 0).outcome.log.events).toEqual(r.outcome.log.events)
  })

  it('first-time thresholds pay once a week; the best is kept', () => {
    const s = veteranState(3, 25, 20)
    const team = eligible(s, 0)
    const a = runWeeklyTrial(s, team, 0)
    const paid = W.thresholds.filter((t) => a.outcome.score >= t.waves)
    expect(a.outcome.reached).toEqual(paid.map((t) => t.waves))
    expect(a.outcome.gems).toBe(paid.reduce((n, t) => n + t.gems, 0))
    expect(a.state.gems).toBe(s.gems + a.outcome.gems)
    const b = runWeeklyTrial(a.state, team, 0)
    if (b.outcome.score <= a.outcome.score) {
      expect(b.outcome.gems).toBe(0)
      expect(b.outcome.reached).toEqual([])
    }
    expect(challengeOf(b.state).weekly.best).toBe(Math.max(a.outcome.score, b.outcome.score))
    // Next week, the same thresholds pay again.
    const c = runWeeklyTrial(b.state, eligible(s, 1), WEEK)
    expect(c.outcome.week).toBe(1)
    if (c.outcome.score >= W.thresholds[0]!.waves) expect(c.outcome.gems).toBeGreaterThan(0)
  })
})
