import { describe, it, expect } from 'vitest'
import { resolveEvent, runTournament, tournamentPlacing, treasureGold, merchantPrice } from './events'
import { createAccount } from '../account'
import { TUNING } from '../tuning'
import type { GameState, HeroId, TowerEvent } from '../types'

const E = TUNING.events

function withEvent(event: TowerEvent, patch: Partial<GameState> = {}): GameState {
  const acct = createAccount(21, { now: 0 })
  return { ...acct, ...patch, tower: { ...acct.tower, event } }
}
const bonus: TowerEvent = { kind: 'bonus', floor: 25, options: ['rest', 'treasure', 'merchant', 'gamble'] }

describe('event floors', () => {
  it('Rest restores Sanity and closes the event', () => {
    const s = withEvent(bonus)
    const id = Object.keys(s.heroes)[0] as HeroId
    const tired = { ...s, heroes: { [id]: { ...s.heroes[id]!, sanity: 30 } } }
    const { state, outcome } = resolveEvent(tired, 'rest')
    expect(state.heroes[id]!.sanity).toBe(30 + E.restSanity)
    expect(state.tower.event).toBeNull()
    expect(outcome.sanity).toBe(E.restSanity)
  })

  it('Treasure pays gold and stones scaled by floor', () => {
    const s = withEvent(bonus)
    const { state } = resolveEvent(s, 'treasure')
    expect(state.gold).toBe(s.gold + treasureGold(25))
    expect(state.materials.promotionStone).toBe(E.treasureStones)
  })

  it('the Merchant trades gold for stones, and refuses the broke', () => {
    const s = withEvent(bonus, { gold: 10_000 })
    const { state } = resolveEvent(s, 'merchant')
    expect(state.gold).toBe(10_000 - merchantPrice())
    expect(state.materials.promotionStone).toBe(E.merchantStones)
    expect(() => resolveEvent(withEvent(bonus, { gold: 0 }), 'merchant')).toThrow(/merchant/)
  })

  it('the Gamble is seeded: it either pays big or shakes the party', () => {
    const outcomes = new Set<boolean>()
    for (let seed = 1; seed <= 30; seed++) {
      const acct = createAccount(seed)
      const s = { ...acct, tower: { ...acct.tower, event: bonus } }
      outcomes.add(resolveEvent(s, 'gamble').outcome.won!)
    }
    expect(outcomes).toEqual(new Set([true, false]))
  })

  it('Reinforcement recruits a free hero; options not on offer are refused', () => {
    const recovery: TowerEvent = { kind: 'recovery', floor: 12, options: ['reinforcement', 'rest'] }
    const s = withEvent(recovery, { gold: 0 })
    const { state, outcome } = resolveEvent(s, 'reinforcement')
    expect(Object.keys(state.heroes).length).toBe(Object.keys(s.heroes).length + 1)
    expect(state.gold).toBe(0)
    expect(outcome.recruit).toBeDefined()
    expect(() => resolveEvent(s, 'treasure')).toThrow(/not offered/)
    expect(() => resolveEvent(createAccount(1), 'rest')).toThrow(/no event/)
  })

  it('after a heavy loss the rest is a camp on the stair (same Sanity as any rest)', () => {
    const recovery: TowerEvent = { kind: 'recovery', floor: 12, options: ['reinforcement', 'rest'] }
    const camp = resolveEvent(withEvent(recovery), 'rest').outcome
    const quiet = resolveEvent(withEvent(bonus), 'rest').outcome
    expect(camp.note).toMatch(/make camp on the stair/)
    expect(quiet.note).toMatch(/quiet fire/)
    expect(camp.sanity).toBe(quiet.sanity)
    expect(resolveEvent(withEvent(recovery), 'reinforcement').outcome.note).toMatch(/finds the camp/)
  })
})

describe('the tournament (F41/42)', () => {
  const tourney: TowerEvent = { kind: 'tournament', floor: 41, options: ['battle_royale', 'party_raid', 'team', 'pair', 'deathmatch'] }

  it('runs every canon format for three rounds, deterministically and non-lethally', () => {
    const s = withEvent(tourney)
    for (const f of tourney.options) {
      const a = runTournament(s, f as never)
      const b = runTournament(s, f as never)
      expect(a.rounds).toHaveLength(3)
      expect(a.wins).toBe(b.wins)
      expect(a.wins).toBeGreaterThanOrEqual(0)
      expect(a.wins).toBeLessThanOrEqual(3)
    }
    const { state } = resolveEvent(s, 'team')
    for (const id of Object.keys(s.heroes) as HeroId[]) {
      expect(state.heroes[id]!.alive).toBe(true)
      expect(state.heroes[id]!.xp).toEqual(s.heroes[id]!.xp)
    }
  })

  it('pays by rounds won and places the Master among 8', () => {
    const s = withEvent(tourney)
    const { state, outcome } = resolveEvent(s, 'deathmatch')
    expect(outcome.placing).toBe(tournamentPlacing(outcome.wins!))
    expect(state.gold).toBe(s.gold + E.tournament.goldByWins[outcome.wins!]!)
    expect(state.gems).toBe(s.gems + E.tournament.gemsByWins[outcome.wins!]!)
    expect(tournamentPlacing(3)).toBe(1)
    expect(tournamentPlacing(0)).toBe(8)
  })

  it('refuses a party with no one to field', () => {
    const s = withEvent(tourney)
    expect(() => runTournament({ ...s, party: { ...s.party, slots: [null, null, null, null, null] } }, 'team')).toThrow(/deployable/)
  })
})
