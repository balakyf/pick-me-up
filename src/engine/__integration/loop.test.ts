import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { summon } from '../gacha'
import { playFloor } from '../tower'
import { resolveEvent } from '../events'
import { startPromotion } from '../promotion'
import { advanceTime } from '../time'
import { combatPowerForHero, levelCapForStar } from '../stats'
import type { GameState, HeroId, Line, OwnedHero, Star } from '../types'

/**
 * End-to-end integration: exercise the full core loop across every engine module
 * (account → gacha → stats/unit → tower → combat) and sanity-check first-pass
 * balance. These tests assert INTEGRATION invariants, not exact numbers.
 */

const LINES: Line[] = ['front', 'front', 'mid', 'back', 'back']

/** Pick the strongest living owned heroes into a 5-slot party. */
function bestParty(state: GameState): GameState {
  const living = (Object.values(state.heroes) as OwnedHero[])
    .filter((h) => h.alive)
    .sort((a, b) => combatPowerForHero(b, b.xp.level) - combatPowerForHero(a, a.xp.level))
    .slice(0, 5)
  const slots: (HeroId | null)[] = [null, null, null, null, null]
  living.forEach((h, i) => (slots[i] = h.id))
  return { ...state, party: { slots, lines: LINES } }
}

/** Summon `n` heroes (with gold forced high so we can build a roster). */
function summonMany(state: GameState, n: number): GameState {
  let s: GameState = { ...state, gold: 10_000_000 }
  for (let i = 0; i < n; i++) s = summon(s).state
  return s
}

/** Play the current floor, then close any event floor it opened (Rest) so the climb continues. */
function playAndRest(s: GameState): ReturnType<typeof playFloor> {
  const out = playFloor(s)
  const ev = out.state.tower.event
  if (ev === null) return out
  const option = ev.options.includes('rest') ? 'rest' : ev.options[0]!
  return { ...out, state: resolveEvent(out.state, option).state }
}

describe('core loop — end to end', () => {
  it('a fresh account owns only the 1★ starter with starting gold', () => {
    const acc = createAccount(2026)
    const heroes = Object.values(acc.heroes) as OwnedHero[]
    expect(heroes).toHaveLength(1)
    expect(heroes[0]!.name).toBe('Islat Han')
    expect(heroes[0]!.star).toBe(1)
    expect(acc.gold).toBeGreaterThanOrEqual(3000)
    expect(acc.tower.currentFloor).toBe(1)
  })

  it('summoning grows a no-duplicate roster with star variety', () => {
    const acc = summonMany(createAccount(7), 60)
    const heroes = Object.values(acc.heroes) as OwnedHero[]
    expect(heroes.length).toBe(61) // starter + 60
    // no duplicate ids
    const ids = heroes.map((h) => h.id)
    expect(new Set(ids).size).toBe(ids.length)
    // consumed-id ledger tracks every issued hero
    expect(acc.consumedHeroIds.length).toBe(61)
    // star spread: Normal pool should produce mostly 1★, some 2★, a few 3★
    const stars = new Set(heroes.map((h) => h.star))
    expect(stars.has(1)).toBe(true)
    expect(stars.size).toBeGreaterThanOrEqual(2)
  })

  it('the starter party can clear floor 1 and bank gold (the loop can start)', () => {
    let s = bestParty(createAccount(123))
    const goldBefore = s.gold
    const { state, result } = playFloor(s)
    expect(result.floor).toBe(1)
    expect(result.cleared).toBe(true)
    expect(result.result.outcome).toBe('win')
    expect(result.firstClear).toBe(true)
    expect(result.goldAwarded).toBeGreaterThan(0)
    expect(state.gold).toBe(goldBefore + result.goldAwarded)
    expect(state.tower.currentFloor).toBe(2) // advanced
  })

  it('a built roster climbs and the run terminates (permadeath throttles it)', () => {
    let s = summonMany(createAccount(99), 40)
    s = bestParty(s)

    let attempts = 0
    const trajectory: string[] = []
    while (s.tower.currentFloor <= 10 && attempts < 60) {
      attempts++
      const before = s.tower.currentFloor
      const { state, result } = playAndRest(s)
      s = state
      if (result.fallenHeroIds.length > 0) {
        trajectory.push(`F${before}: ${result.cleared ? 'WIN' : 'WIPE'} (lost ${result.fallenHeroIds.length})`)
        s = bestParty(s) // rebuild from survivors after casualties
      } else if (!result.cleared) {
        trajectory.push(`F${before}: fail`)
      }
      const livingCount = (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive).length
      if (livingCount === 0) {
        trajectory.push('roster wiped out')
        break
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[seed 99] reached floor ${s.tower.currentFloor}, highestCleared ${s.tower.highestCleared}; ` +
      `survivors ${(Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive).length}/${Object.keys(s.heroes).length}`)
    if (trajectory.length) console.log(trajectory.join('  |  ')) // eslint-disable-line no-console

    expect(attempts).toBeLessThan(60) // it terminates, not an infinite loop
    expect(s.tower.highestCleared).toBeGreaterThanOrEqual(1) // it makes progress
  })

  it('permadeath is permanent: a fallen hero never revives across floors', () => {
    let s = bestParty(summonMany(createAccount(555), 30))
    const dead = new Set<HeroId>()
    for (let i = 0; i < 20 && s.tower.currentFloor <= 10; i++) {
      const { state, result } = playAndRest(s)
      s = state
      for (const id of result.fallenHeroIds) dead.add(id)
      // every once-dead hero stays alive===false forever
      for (const id of dead) expect(s.heroes[id]!.alive).toBe(false)
      if (result.fallenHeroIds.length > 0) s = bestParty(s)
      if ((Object.values(s.heroes) as OwnedHero[]).every((h) => !h.alive)) break
    }
  })

  it('Sanity drains as a party climbs the tower (lobby ↔ tower)', () => {
    let s = bestParty(summonMany(createAccount(99), 40))
    let drained = false
    for (let i = 0; i < 5 && s.tower.currentFloor <= 10 && !drained; i++) {
      const deployed = s.party.slots.filter(Boolean) as HeroId[]
      const { state, result } = playAndRest(s)
      s = state
      for (const id of deployed) {
        const h = s.heroes[id]
        if (h && h.alive && h.sanity < 100) drained = true // a survivor lost morale
      }
      if (result.fallenHeroIds.length > 0) s = bestParty(s)
      if ((Object.values(s.heroes) as OwnedHero[]).every((h) => !h.alive)) break
    }
    expect(drained).toBe(true)
  })

  it('a promotion completes "offline" when world-time advances past its timer (lobby ↔ time)', () => {
    const acct = createAccount(7)
    const star = 3 as Star
    const hero: OwnedHero = {
      id: 'h_promo' as HeroId,
      name: 'Promo',
      star,
      heroClass: 'warrior',
      element: 'fire',
      baseAttrs: { str: 20, agi: 20, vit: 20, int: 20, wil: 20 },
      growthGrades: { str: 4, agi: 4, vit: 4, int: 4, wil: 4 },
      skills: [],
      portraitToken: '#fff',
      origin: 'procedural',
      xp: { level: levelCapForStar(star), xpIntoLevel: 0, heldXp: 0, atCap: true },
      alive: true,
      sanity: 100,
      promotion: null,
      equipment: { weapon: null, armor: null, accessory: null },
      training: null,
      engraving: null,
    }
    const state: GameState = {
      ...acct,
      heroes: { [hero.id]: hero },
      materials: { promotionStone: 999, attrStone_fire: 999 },
    }

    const started = startPromotion(state, hero.id, 0)
    const promo = started.heroes[hero.id]!.promotion
    expect(promo).not.toBeNull()

    // Fast-forward world-time past the timer: advanceTime resolves it deterministically.
    const after = advanceTime(started, promo!.completesAtWorld + 1)
    expect(after.heroes[hero.id]!.star).toBe(4)
    expect(after.heroes[hero.id]!.promotion).toBeNull()
    expect(after.heroes[hero.id]!.xp.atCap).toBe(false) // level cap lifted
  })

  it('the whole scripted playthrough is deterministic for a fixed seed', () => {
    const run = (): GameState => {
      let s = bestParty(summonMany(createAccount(2024), 20))
      for (let i = 0; i < 8 && s.tower.currentFloor <= 10; i++) {
        s = playAndRest(s).state
        s = bestParty(s)
        if ((Object.values(s.heroes) as OwnedHero[]).every((h) => !h.alive)) break
      }
      return s
    }
    expect(run()).toEqual(run())
  })
})
