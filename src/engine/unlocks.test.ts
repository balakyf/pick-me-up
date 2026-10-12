/** WP0 contract (spec 2026-10-12 S3): isPlaceOpen follows TUNING.unlocks. */
import { describe, it, expect } from 'vitest'
import { isPlaceOpen, openScheduledPlaces, unlockRule } from './unlocks'
import { createAccount } from './account'
import { TUNING } from './tuning'
import type { FallenRecord, GameState, HeroId, OwnedHero } from './types'

const fresh = (): GameState => createAccount(11, { now: 0 })
const cleared = (s: GameState, f: number): GameState => ({ ...s, tower: { ...s.tower, currentFloor: f + 1, highestCleared: f } })
const starterId = (s: GameState) => Object.keys(s.heroes)[0] as HeroId
function withHero(s: GameState, patch: Partial<OwnedHero>): GameState {
  const id = starterId(s)
  return { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, ...patch } } }
}

describe('isPlaceOpen', () => {
  it('a fresh account has only the four core places (and anything unscheduled) open', () => {
    const s = fresh()
    for (const p of ['tower', 'summon', 'party', 'roster', 'fairy', 'not-a-place']) expect(isPlaceOpen(s, p)).toBe(true)
    expect(openScheduledPlaces(s)).toEqual([])
    expect(unlockRule('tower')).toBeNull()
  })

  it('follows the S3 floor schedule exactly', () => {
    const want: Record<number, string[]> = {
      1: ['kitchen', 'memorial', 'daily'],
      2: ['tacticalCenter', 'dormitory', 'tavern'],
      3: ['trainingCenter', 'garden'],
      5: ['armory', 'infirmary', 'market'],
      7: ['promotionChamber', 'synthesis'],
      8: ['shop'],
      10: ['library', 'transferStation', 'watchtower'],
      15: ['guild'],
      20: ['hallOfMagic'],
    }
    for (const [floor, places] of Object.entries(want)) {
      for (const p of places) {
        expect(TUNING.unlocks[p]!.floor, p).toBe(Number(floor))
        expect(isPlaceOpen(cleared(fresh(), Number(floor) - 1), p), `${p} before F${floor}`).toBe(false)
        expect(isPlaceOpen(cleared(fresh(), Number(floor)), p), `${p} at F${floor}`).toBe(true)
      }
    }
    // Everything with a floor is open at F20.
    const all = Object.entries(TUNING.unlocks).filter(([, r]) => r.floor !== undefined).map(([p]) => p).sort()
    expect(openScheduledPlaces(cleared(fresh(), 20))).toEqual(all)
  })

  it('the Crack of Time opens at Master Level 20 (or once the crack is open)', () => {
    const s = cleared(fresh(), 90)
    expect(isPlaceOpen(s, 'rift')).toBe(false)
    expect(isPlaceOpen({ ...s, meta: { ...s.meta, masterLevel: 19 } }, 'rift')).toBe(false)
    expect(isPlaceOpen({ ...s, meta: { ...s.meta, masterLevel: 20 } }, 'rift')).toBe(true)
    expect(isPlaceOpen({ ...s, meta: { ...s.meta, crackOpen: true } }, 'rift')).toBe(true)
  })

  it('event alternatives open a place early', () => {
    const s = fresh()
    // The Memorial opens at the first death.
    expect(isPlaceOpen(s, 'memorial')).toBe(false)
    expect(isPlaceOpen(withHero(s, { alive: false }), 'memorial')).toBe(true)
    const grave = { heroId: starterId(s) } as FallenRecord
    expect(isPlaceOpen({ ...s, life: { ...s.life, memorial: [grave] } }, 'memorial')).toBe(true)
    // The Infirmary opens at the first grief.
    const h = s.heroes[starterId(s)]!
    expect(isPlaceOpen(s, 'infirmary')).toBe(false)
    const life = { needs: { energy: 80, hunger: 75, social: 60, fun: 60 }, job: null, jobXp: {}, doing: { kind: 'wander' as const, place: 'hall' as const, untilSlot: 0 }, memories: [], grief: 40, arrivedDay: 0, bestFloor: 0 }
    expect(isPlaceOpen(withHero(s, { life }), 'infirmary')).toBe(true)
    // The Promotion Chamber opens when a living hero reaches the level cap.
    expect(isPlaceOpen(s, 'promotionChamber')).toBe(false)
    expect(isPlaceOpen(withHero(s, { xp: { ...h.xp, atCap: true } }), 'promotionChamber')).toBe(true)
    expect(isPlaceOpen(withHero(s, { xp: { ...h.xp, atCap: true }, alive: false }), 'synthesis')).toBe(false)
  })
})
