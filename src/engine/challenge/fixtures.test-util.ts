/** Shared fixtures for the tower-challenge tests (not a test file itself). */
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import type { GameState, HeroId, OwnedHero } from '../types'

/** An account with 30+ heroes at `level`, `floor` cleared, and a full purse. */
export function veteranState(seed: number, level: number, floor: number): GameState {
  let s = createAccount(seed, { now: 0 })
  s = { ...s, gold: 10_000_000, gems: 100_000 }
  for (let i = 0; i < 3; i++) s = summonMany(s, 'normal', 10).state
  const heroes = { ...s.heroes }
  for (const h of Object.values(heroes) as OwnedHero[]) heroes[h.id] = { ...h, xp: { level, xpIntoLevel: 0, heldXp: 0, atCap: false } }
  return { ...s, heroes, tower: { ...s.tower, highestCleared: floor, currentFloor: floor + 1 } }
}

/** Living hero ids, strongest star first (ties by id). */
export function rosterIds(s: GameState): HeroId[] {
  return (Object.values(s.heroes) as OwnedHero[])
    .filter((h) => h.alive)
    .sort((a, b) => b.star - a.star || (a.id < b.id ? -1 : 1))
    .map((h) => h.id)
}

/** Put the first five of `ids` in the party. */
export function withParty(s: GameState, ids: HeroId[]): GameState {
  const slots = [0, 1, 2, 3, 4].map((i) => ids[i] ?? null)
  return { ...s, party: { slots, lines: ['front', 'front', 'mid', 'back', 'back'] } }
}
