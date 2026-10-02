/**
 * B40 — the post-invasion shield protects the whole next world-day; PvP fields only heroes
 * fit to deploy (no bounty, no burnout).
 */
import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { chance, rngFor } from '../rng'
import { TUNING } from '../tuning'
import { estateOf } from '../estate'
import type { GameState, HeroId, OwnedHero } from '../types'
import { pvpReady, resolveInvasions } from './pvp'

const P = TUNING.pvp
const DAY = 24 * 3_600_000

function account(seed: number): { state: GameState; ids: HeroId[] } {
  const acct = createAccount(seed)
  const base = Object.values(acct.heroes)[0]!
  const heroes: Record<string, OwnedHero> = {}
  const ids: HeroId[] = []
  for (let i = 0; i < 3; i++) {
    const id = `h_sh${i}` as HeroId
    ids.push(id)
    heroes[id] = { ...base, id, name: `Guard ${i}`, xp: { level: 20, xpIntoLevel: 0, heldXp: 0, atCap: false } }
  }
  return {
    ids,
    state: {
      ...acct,
      gold: 100_000,
      heroes,
      party: { ...acct.party, slots: [...ids, null, null] },
      meta: { ...acct.meta, crackOpen: true, pi: 300, lastSeenAtWorld: 0 },
      pvp: { ...acct.pvp, lastInvasionDay: 0 },
      tower: { ...acct.tower, highestCleared: 45, currentFloor: 46 },
    },
  }
}

const rolls = (s: GameState, day: number) => chance(rngFor(s.seed, 'invade', day), P.invasionChance).value

describe('the post-invasion shield (B40)', () => {
  it('an invasion on day d keeps day d+1 safe even when its roll would have landed', () => {
    let tested = 0
    for (let seed = 1; seed <= 60 && tested < 3; seed++) {
      const { state } = account(seed)
      // Find two invasion days in a row for this account.
      let d = -1
      for (let x = 1; x < 40; x++) if (rolls(state, x) && rolls(state, x + 1)) (d = x), (x = 99)
      if (d < 0) continue
      tested++
      const at = { ...state, pvp: { ...state.pvp, lastInvasionDay: d - 1 } }
      const hit = resolveInvasions(at, d * DAY + 1)
      const ins = (s: GameState) => s.pvp.log.filter((r) => r.direction === 'in').length
      expect(ins(hit)).toBe(1)
      expect(hit.pvp.shieldUntil).toBeGreaterThan((d + 1) * DAY)
      // The next day: its roll would land, but the shield holds.
      const next = resolveInvasions(hit, (d + 1) * DAY + 1)
      expect(ins(next)).toBe(1)
      // The day after, the shield is down again.
      expect(next.pvp.shieldUntil).toBeLessThanOrEqual((d + 2) * DAY)
    }
    expect(tested).toBeGreaterThan(0)
  })
})

describe('PvP fields only the fit (B40)', () => {
  it('a hero out on a bounty or burnt out does not defend or raid', () => {
    const { state, ids } = account(4)
    const e = estateOf(state)
    const s: GameState = {
      ...state,
      estate: {
        ...e,
        bounties: [{ id: 0, kind: 'herbs', heroIds: [ids[0]!], postedAt: 0, endsAt: 1e15 }],
        trauma: { [ids[1]!]: { fatigue: 0, foughtAt: 0, burnoutUntil: 1e15, veteran: false, withdrawn: null, lowSince: null } },
      },
    }
    expect(pvpReady(s, s.heroes[ids[0]!])).toBe(false)
    expect(pvpReady(s, s.heroes[ids[1]!])).toBe(false)
    expect(pvpReady(s, s.heroes[ids[2]!])).toBe(true)
    expect(pvpReady(s, { ...s.heroes[ids[2]!]!, sanity: 0 })).toBe(false)
  })
})
