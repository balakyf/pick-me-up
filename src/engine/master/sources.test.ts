/**
 * B21 — the Master learns by playing: every system that is a real lever pays Master XP,
 * not just floor clears.
 */
import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { attemptDaily } from '../daily'
import { hostDuel, postBounty, raiseStatue, resolveBounties, BOUNTIES } from '../estate'
import { runWeeklyTrial } from '../challenge'
import { resolveEvent } from '../events'
import { eventsAfter } from '../tower'
import { TUNING } from '../tuning'
import type { FallenRecord, GameState, HeroId, MetaState, OwnedHero } from '../types'
import { masterXpTotal } from './master'

const M = TUNING.lobby.master
const xpOf = (m: MetaState) => masterXpTotal(m.masterLevel) + m.masterXp

/** A rich account with ten strong heroes, F45 cleared. */
function strong(seed = 5): { s: GameState; ids: HeroId[] } {
  let s: GameState = { ...createAccount(seed, { now: 0 }), gold: 10_000_000, gems: 10_000 }
  s = summonMany(s, 'normal', 10).state
  const heroes: Record<string, OwnedHero> = {}
  for (const h of Object.values(s.heroes) as OwnedHero[]) {
    heroes[h.id] = { ...h, xp: { level: 90, xpIntoLevel: 0, heldXp: 0, atCap: false }, baseAttrs: { str: 90, agi: 90, vit: 90, int: 90, wil: 90 } }
  }
  const ids = Object.keys(heroes) as HeroId[]
  return {
    s: { ...s, heroes, party: { slots: ids.slice(0, 5), lines: ['front', 'front', 'mid', 'back', 'back'] }, tower: { ...s.tower, highestCleared: 45, currentFloor: 46 } },
    ids,
  }
}

describe('Master XP from playing (B21)', () => {
  it('a Daily Dungeon cleared', () => {
    const { s } = strong()
    const { state, result } = attemptDaily(s, 0)
    expect(result.cleared).toBe(true)
    expect(xpOf(state.meta) - xpOf(s.meta)).toBe(M.xpPerDailyClear)
  })

  it('the weekly trial pays per wave held', () => {
    const { s, ids } = strong()
    const { state, outcome } = runWeeklyTrial(s, ids.slice(0, 2), 0)
    expect(outcome.score).toBeGreaterThan(0)
    expect(xpOf(state.meta) - xpOf(s.meta)).toBe(outcome.score * M.xpPerTrialWave)
  })

  it('a tryout duel', () => {
    const { s, ids } = strong()
    const after = hostDuel(s, ids[5]!, ids[6]!, 0)
    expect(xpOf(after.meta) - xpOf(s.meta)).toBe(M.xpPerDuel)
  })

  it('a bounty brought home', () => {
    const { s, ids } = strong()
    const kind = Object.values(BOUNTIES).find((b) => b.heroes === 1 && b.minFloor <= 45)!
    const posted = postBounty(s, kind.id, [ids[7]!], 0)
    const home = resolveBounties(posted, kind.ms + 1)
    expect(xpOf(home.meta) - xpOf(posted.meta)).toBe(M.xpPerBounty)
  })

  it('a statue raised for the fallen', () => {
    const { s, ids } = strong()
    const h = s.heroes[ids[8]!]!
    const rec: FallenRecord = {
      heroId: h.id, name: h.name, star: h.star, level: h.xp.level, heroClass: h.heroClass, element: h.element,
      portraitToken: h.portraitToken, cause: 'battle', floor: 30, day: 0, daysServed: 3, bestFloor: 30, mourners: [],
    }
    const graves = { ...s, heroes: { ...s.heroes, [h.id]: { ...h, alive: false } }, life: { ...s.life, memorial: [rec] } }
    const after = raiseStatue(graves, h.id, 0)
    expect(xpOf(after.meta) - xpOf(graves.meta)).toBe(M.xpPerStatue)
  })

  it('tournament rounds won', () => {
    const { s } = strong()
    const open = { ...s, tower: { ...s.tower, event: eventsAfter(41, true, 0)[0]! } }
    const { state, outcome } = resolveEvent(open, 'team')
    expect(xpOf(state.meta) - xpOf(open.meta)).toBe((outcome.wins ?? 0) * M.xpPerTournamentWin)
  })
})
