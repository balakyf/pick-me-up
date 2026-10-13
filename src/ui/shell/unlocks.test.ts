/** WP7 (spec 2026-10-12 S3): the progressive campus, UI side. */
import { describe, it, expect } from 'vitest'
import { createAccount } from '../../engine/account'
import { reduce } from '../../engine/store'
import { isPlaceOpen } from '../../engine/unlocks'
import { TUNING } from '../../engine/tuning'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import {
  CORE_PLACES,
  MENU_ORDER,
  lockedPlaces,
  menuGroups,
  nextUnlock,
  placeAccess,
  shortCondition,
  unlockCondition,
  unlockLine,
  unseenUnlocks,
} from './unlocks'
import { MENU_PLACES } from '../world/LobbyWorld'
import type { PlaceId } from '../world/lobbyMap'

const fresh = (): GameState => createAccount(11, { now: 0 })
const cleared = (s: GameState, f: number): GameState => ({ ...s, tower: { ...s.tower, currentFloor: f + 1, highestCleared: f } })
const SCHEDULED = MENU_ORDER.filter((p) => !CORE_PLACES.includes(p))

describe('placeAccess', () => {
  it('matches TUNING.unlocks for every place, at every floor up to F21', () => {
    for (let f = 0; f <= 21; f++) {
      const s = cleared(fresh(), f)
      for (const p of MENU_ORDER) {
        const a = placeAccess(s, p)
        expect(a.open, `${p} at F${f}`).toBe(isPlaceOpen(s, p))
        const rule = TUNING.unlocks[p]
        expect(a.unlockAt, p).toBe(rule?.floor ?? null)
        if (rule?.floor !== undefined) expect(a.open, `${p} at F${f}`).toBe(f >= rule.floor)
        expect(a.reason === null, p).toBe(a.open)
      }
    }
  })

  it('the four core doors are open from minute one, with no condition', () => {
    for (const p of CORE_PLACES) {
      const a = placeAccess(fresh(), p)
      expect(a).toMatchObject({ open: true, rule: null, unlockAt: null, progress: null, reason: null })
    }
  })

  it('says what opens a locked place and how close the Master is', () => {
    const s = cleared(fresh(), 3)
    expect(placeAccess(s, 'armory')).toMatchObject({ open: false, unlockAt: 5, progress: { cur: 3, need: 5 }, reason: 'Clear Floor 5' })
    expect(placeAccess(s, 'infirmary').reason).toBe('Clear Floor 5, or when a hero grieves')
    expect(placeAccess(s, 'memorial').reason).toBe(null) // F1 cleared
    expect(placeAccess(fresh(), 'memorial').reason).toBe('Clear Floor 1, or when a hero falls')
    expect(placeAccess(s, 'rift')).toMatchObject({ unlockAt: null, progress: { cur: 1, need: 20 }, reason: 'Reach Master Lv 20, or when the Crack opens' })
  })

  it('an event opens a place early (the first fallen hero opens the Memorial)', () => {
    const s = fresh()
    const id = Object.keys(s.heroes)[0] as HeroId
    const dead: GameState = { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, alive: false } as OwnedHero } }
    expect(placeAccess(dead, 'memorial').open).toBe(true)
    expect(placeAccess(dead, 'kitchen').open).toBe(false)
  })

  it('unlockCondition covers every scheduled rule and never returns an empty string', () => {
    for (const p of SCHEDULED) {
      const c = unlockCondition(TUNING.unlocks[p]!)
      expect(c, p).toBeTruthy()
    }
    expect(unlockCondition(null)).toBeNull()
  })

  it('shortCondition gives the main gate alone (for the dense Later grid)', () => {
    expect(shortCondition(TUNING.unlocks['library']!)).toBe(`Floor ${TUNING.unlocks['library']!.floor}`)
    expect(shortCondition(TUNING.unlocks['rift']!)).toBe(`Master Lv ${TUNING.unlocks['rift']!.masterLevel}`)
    expect(shortCondition({ event: 'firstDeath' })).toBe('or when a hero falls')
    expect(shortCondition(null)).toBeNull()
    for (const p of SCHEDULED) expect(shortCondition(TUNING.unlocks[p]!), p).toBeTruthy()
  })
})

describe('menuGroups and nextUnlock', () => {
  it('a fresh account: 4 doors now, the Kitchen next, everything else later', () => {
    const g = menuGroups(fresh())
    expect(g.now).toEqual(['tower', 'summon', 'party', 'roster'])
    expect(g.campus).toEqual([])
    expect(g.next).toBe('kitchen')
    expect(g.later).toHaveLength(SCHEDULED.length - 1)
    const nu = nextUnlock(fresh())!
    expect(nu.place).toBe('kitchen')
    expect(nu.also).toEqual(['memorial', 'daily'])
  })

  it('every menu place appears exactly once, at any progress', () => {
    for (const f of [0, 1, 4, 7, 12, 20, 40]) {
      const g = menuGroups(cleared(fresh(), f))
      const all = [...g.now, ...g.campus, ...(g.next ? [g.next] : []), ...g.later]
      expect([...all].sort(), `F${f}`).toEqual([...MENU_ORDER].sort())
      expect(new Set(all).size).toBe(all.length)
      for (const p of g.campus) expect(isPlaceOpen(cleared(fresh(), f), p)).toBe(true)
      for (const p of g.later) expect(isPlaceOpen(cleared(fresh(), f), p)).toBe(false)
    }
  })

  it('the next unlock is the nearest floor gate, then the Master Level gate, then none', () => {
    expect(nextUnlock(cleared(fresh(), 5))!.place).toBe('promotionChamber')
    expect(nextUnlock(cleared(fresh(), 5))!.also).toEqual(['synthesis'])
    expect(nextUnlock(cleared(fresh(), 12))!.place).toBe('guild')
    expect(nextUnlock(cleared(fresh(), 20))!.place).toBe('rift')
    const all = { ...cleared(fresh(), 20), meta: { ...fresh().meta, masterLevel: 20 } }
    expect(nextUnlock(all)).toBeNull()
    expect(lockedPlaces(all)).toEqual([])
    expect(menuGroups(all).next).toBeNull()
  })

  it('the Menu keeps every place the lobby offers (nothing is ever hidden)', () => {
    expect(MENU_PLACES).toEqual([...MENU_ORDER])
  })
})

describe('the unlock fanfare bookkeeping', () => {
  it('a fresh account has nothing to celebrate', () => {
    expect(unseenUnlocks(fresh())).toEqual([])
  })

  it('a first F1 clear opens three places; SEE_UNLOCK makes each fire once', () => {
    let s = reduce(null, { type: 'NEW_ACCOUNT', seed: 7, now: 0 })
    s = reduce(s, { type: 'ATTEMPT_FLOOR' })
    expect(s.tower.highestCleared).toBeGreaterThanOrEqual(1)
    const unseen = unseenUnlocks(s)
    expect(unseen).toEqual(['kitchen', 'memorial', 'daily'])
    for (const p of unseen) s = reduce(s, { type: 'SEE_UNLOCK', place: p })
    expect(unseenUnlocks(s)).toEqual([])
    expect(s.life.unlocks).toEqual(['daily', 'kitchen', 'memorial'])
    // Seeing it again changes nothing.
    expect(reduce(s, { type: 'SEE_UNLOCK', place: 'kitchen' }).life.unlocks).toEqual(s.life.unlocks)
  })

  it('a save missing a seen entry for an open place gets its fanfare (arrival); a backfilled one does not', () => {
    const s = cleared(fresh(), 5)
    expect(unseenUnlocks(s).length).toBeGreaterThan(0)
    const backfilled = { ...s, life: { ...s.life, unlocks: [...unseenUnlocks(s)].sort() } }
    expect(unseenUnlocks(backfilled)).toEqual([])
  })

  it('every scheduled place has its own line from Isel', () => {
    const lines = new Set<string>()
    for (const p of SCHEDULED) {
      const l = unlockLine(p as PlaceId)
      expect(l).not.toBe(unlockLine('tower'))
      lines.add(l)
    }
    expect(lines.size).toBe(SCHEDULED.length)
  })
})
