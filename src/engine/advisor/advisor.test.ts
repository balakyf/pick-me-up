import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { reduce } from '../store'
import { TUNING } from '../tuning'
import type { GameState, HeroId, OwnedHero } from '../types'
import { aptitude, lifeOf } from '../life'
import { advise, adviceSignature, type Advice } from './advisor'

/** An account with `n` extra Normal pulls. */
function roster(seed: number, n = 9): GameState {
  let st: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) st = reduce(st, { type: 'SUMMON' })
  return st
}
const living = (s: GameState) => Object.values(s.heroes).filter((h) => h.alive) as OwnedHero[]
const run = (s: GameState, a: Advice) => a.actions.reduce((st, cmd) => reduce(st, cmd), s)

describe('advisor', () => {
  it('suggests the best-suited free hero for an open job seat, and the tip assigns them', () => {
    const s = roster(7)
    const tip = advise(s).find((a) => a.kind === 'job' && a.job === 'cook')
    expect(tip).toBeDefined()
    if (tip?.kind !== 'job') return
    // Only a real fit is suggested: above average, or a hero who would enjoy the work.
    expect(tip.aptitude >= 1 || tip.likes).toBe(true)
    expect(tip.aptitude).toBeLessThanOrEqual(Math.max(...living(s).map((h) => aptitude(h, 'cook'))))
    const after = run(s, tip)
    expect(lifeOf(after.heroes[tip.heroId]!).job).toBe('cook')
  })

  it('never suggests more workers than a building has seats, nor one hero twice', () => {
    const s = roster(3, 14)
    const jobs = advise(s).filter((a) => a.kind === 'job')
    const heroes = jobs.map((a) => (a.kind === 'job' ? a.heroId : ''))
    expect(new Set(heroes).size).toBe(heroes.length)
    const cooks = jobs.filter((a) => a.kind === 'job' && a.job === 'cook').length
    expect(cooks).toBeLessThanOrEqual(s.facilities.kitchen.level * TUNING.life.jobs.seatsPerLevel)
  })

  it('suggests a banquet for a pale party — but not while the hall is being cleaned', () => {
    const s0 = roster(6)
    const heroes = { ...s0.heroes }
    for (const h of living(s0)) heroes[h.id] = { ...h, sanity: 20 }
    const pale = { ...s0, heroes, gold: 100_000 }
    const tip = advise(pale).find((a) => a.kind === 'banquet')
    expect(tip).toBeDefined()
    const fed = run(pale, tip!)
    const again = { ...fed, heroes: Object.fromEntries(Object.entries(fed.heroes).map(([id, h]) => [id, { ...h, sanity: 20 }])) }
    expect(advise(again).some((a) => a.kind === 'banquet')).toBe(false)
  })

  it('the advice fingerprint ignores a quiet tick but moves with anything advice reads', () => {
    const s = roster(4)
    const sig = adviceSignature(s)
    // A few real seconds later (the 1 Hz lobby TICK): same advice inputs.
    const ticked = reduce(s, { type: 'TICK' }, s.meta.lastSeenAtWorld + 3_000 * TUNING.time.worldTimeFactor)
    expect(ticked).not.toBe(s)
    expect(adviceSignature(ticked)).toBe(sig)
    expect(advise(ticked)).toEqual(advise(s))
    // Things the advice depends on move it.
    const id = living(s)[0]!.id
    expect(adviceSignature({ ...s, gold: s.gold + 1 })).not.toBe(sig)
    expect(adviceSignature({ ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, sanity: s.heroes[id]!.sanity - 1 } } })).not.toBe(sig)
    expect(adviceSignature({ ...s, party: { ...s.party, slots: [null, null, null, null, null] } })).not.toBe(sig)
    expect(adviceSignature({ ...s, life: { ...s.life, slot: s.life.slot + 1 } })).not.toBe(sig)
    expect(adviceSignature({ ...s, meta: { ...s.meta, banquetDay: 3 } })).not.toBe(sig)
  })

  it('points out empty party slots when rested heroes are waiting', () => {
    const s = roster(5)
    const empty = { ...s, party: { ...s.party, slots: [null, null, null, null, null] as (HeroId | null)[] } }
    expect(advise(empty).some((a) => a.kind === 'fillParty')).toBe(true)
  })

  it('offers to swap a worn-out party member for a rested one of similar strength', () => {
    const s0 = roster(9, 12)
    const ids = living(s0).map((h) => h.id)
    const s: GameState = {
      ...s0,
      party: { ...s0.party, slots: ids.slice(0, 5) as (HeroId | null)[] },
      heroes: { ...s0.heroes, [ids[0]!]: { ...s0.heroes[ids[0]!]!, sanity: 10 } },
    }
    const tip = advise(s).find((a) => a.kind === 'tired')
    if (tip?.kind !== 'tired') return // no bench hero strong enough on this seed: nothing to suggest
    const after = run(s, tip)
    expect(after.party.slots).not.toContain(tip.heroId)
    expect(after.party.slots).toContain(tip.swapId)
  })

  it('suggests replacing a worker who is a poor fit when someone free would do much better', () => {
    const s0 = roster(21, 12)
    const byCook = living(s0).sort((a, b) => aptitude(a, 'cook') - aptitude(b, 'cook'))
    const worst = byCook[0]!
    const best = byCook[byCook.length - 1]!
    if (aptitude(best, 'cook') < aptitude(worst, 'cook') + 0.3) return
    const s = reduce(s0, { type: 'ASSIGN_JOB', heroId: worst.id, job: 'cook' })
    const tip = advise(s).find((a) => a.kind === 'reassign' || (a.kind === 'job' && a.job === 'cook'))
    expect(tip).toBeDefined()
  })

  it('every tip it offers is a move the game accepts (many rosters)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let s = roster(seed, 12)
      s = { ...s, gold: 50_000, facilities: { ...s.facilities, trainingCenter: { level: 1, build: null }, library: { level: 1, build: null } } }
      for (const tip of advise(s)) expect(() => run(s, tip)).not.toThrow()
    }
  })

  it('is sorted by priority and capped', () => {
    const tips = advise(roster(8, 20))
    for (let i = 1; i < tips.length; i++) expect(tips[i - 1]!.priority).toBeGreaterThanOrEqual(tips[i]!.priority)
    expect(tips.length).toBeLessThanOrEqual(12)
  })
})
