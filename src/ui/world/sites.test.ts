import { describe, it, expect } from 'vitest'
import { createStore } from '../../engine/store'
import type { GameState } from '../../engine/types'
import { allSites, buildableCount, gatedRooms, siteOf, siteRooms, unbuiltSites } from './sites'
import { siteMarkers } from './LobbyWorld'

function fresh(): GameState {
  const store = createStore()
  store.dispatch({ type: 'NEW_ACCOUNT', seed: 42, now: 0 })
  return store.getState()!
}

const at = (s: GameState, masterLevel: number, gold: number): GameState => ({ ...s, gold, meta: { ...s.meta, masterLevel } })

describe('construction sites', () => {
  it('a new Master sees every unbuilt place as a site, but can build nothing at Master Lv 1', () => {
    const s = fresh()
    const unbuilt = unbuiltSites(s).map((x) => x.facility)
    expect(unbuilt).toContain('tavern')
    expect(unbuilt).toContain('garden')
    expect(unbuilt).not.toContain('kitchen')
    expect(siteOf(s, 'tavern').status).toBe('locked')
    expect(siteOf(s, 'tavern').unlockAt).toBe(2)
    expect(buildableCount(s)).toBe(0)
  })

  it('at Master Lv 2 with gold the Tavern is ready; without the gold it is short', () => {
    const s = fresh()
    expect(siteOf(at(s, 2, 1_000_000), 'tavern').status).toBe('ready')
    expect(siteOf(at(s, 2, 0), 'tavern').status).toBe('short')
    expect(buildableCount(at(s, 2, 1_000_000))).toBeGreaterThan(0)
  })

  it('a running build is "building", a finished one "built" and no longer a site', () => {
    const s = at(fresh(), 2, 1_000_000)
    const building = { ...s, facilities: { ...s.facilities, tavern: { level: 0, build: { toLevel: 1, completesAtWorld: 99 } } } } as GameState
    expect(siteOf(building, 'tavern').status).toBe('building')
    const built = { ...s, facilities: { ...s.facilities, tavern: { level: 1, build: null } } } as GameState
    expect(siteOf(built, 'tavern').status).toBe('built')
    expect(siteRooms(built).has('tavern')).toBe(false)
  })

  it('every facility has exactly one site on the board', () => {
    const s = fresh()
    const ids = allSites(s).map((x) => x.facility)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.sort()).toEqual(Object.keys(s.facilities).sort())
  })

  it('places gated by level get a padlock marker; sites get one marker each', () => {
    const s = fresh()
    expect(gatedRooms(s).map((g) => g.room)).toContain('synthesis')
    const marks = siteMarkers(s)
    expect(marks.length).toBe(siteRooms(s).size + gatedRooms(s).length)
    expect(marks.every((m) => m.kind === 'locked')).toBe(true)
    expect(siteMarkers(at(s, 2, 1_000_000)).some((m) => m.kind === 'build')).toBe(true)
  })
})
