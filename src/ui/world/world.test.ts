import { describe, it, expect } from 'vitest'
import {
  MAP_ROWS,
  MAP_W,
  MAP_H,
  MASTER_SPAWN,
  PROPS,
  ROOMS,
  BUILDINGS,
  graveTile,
  insideBuilding,
  findPath,
  isAdjacentTo,
  isWalkable,
  propForPlace,
  walkableTilesIn,
  type PlaceId,
  type RoomId,
} from './lobbyMap'
import { heroLines, iselLines } from './lines'
import { fitViewport } from './LobbyWorld'
import { renderLobbyBase } from '../pixel/tiles'
import { drawProp, PROP_FRAMES } from '../pixel/props'
import { opaqueCount } from '../pixel/bitmap'
import { createStore } from '../../engine/store'
import type { GameState, OwnedHero } from '../../engine/types'

const PLACES: PlaceId[] = [
  'kitchen',
  'tacticalCenter',
  'promotionChamber',
  'trainingCenter',
  'transferStation',
  'synthesis',
  'armory',
  'daily',
  'shop',
  'hallOfMagic',
  'rift',
  'guild',
  'summon',
  'roster',
  'party',
  'tower',
  'fairy',
]

describe('lobby map', () => {
  it('is a rectangle', () => {
    for (const row of MAP_ROWS) expect(row.length).toBe(MAP_W)
    expect(MAP_ROWS.length).toBe(MAP_H)
  })

  it('the Master spawns on a walkable tile', () => {
    expect(isWalkable(MASTER_SPAWN.x, MASTER_SPAWN.y)).toBe(true)
  })

  it('every room is reachable from the spawn and has somewhere to stand', () => {
    for (const room of Object.keys(ROOMS) as RoomId[]) {
      const tiles = walkableTilesIn(room)
      expect(tiles.length, room).toBeGreaterThan(4)
      const t = tiles[0]!
      expect(findPath(MASTER_SPAWN, (x, y) => x === t.x && y === t.y), room).not.toBeNull()
    }
  })

  it('every place can be walked up to and used', () => {
    for (const place of PLACES) {
      const prop = propForPlace(place)
      expect(prop, place).toBeDefined()
      const path = findPath(MASTER_SPAWN, (x, y) => isAdjacentTo(prop, x, y))
      expect(path, place).not.toBeNull()
    }
  })

  it('props never sit on a door, and every door opens onto walkable ground both ways', () => {
    for (const p of PROPS) {
      for (let j = 0; j < p.h; j++)
        for (let i = 0; i < p.w; i++) expect(MAP_ROWS[p.y + j]![p.x + i], `${p.kind}@${p.x},${p.y}`).not.toBe('D')
    }
    for (const b of BUILDINGS) {
      for (const d of b.doors) {
        expect(isWalkable(d.x, d.y), `${b.id} door`).toBe(true)
        const around = [
          [d.x + 1, d.y],
          [d.x - 1, d.y],
          [d.x, d.y + 1],
          [d.x, d.y - 1],
        ].filter(([x, y]) => isWalkable(x!, y!))
        expect(around.length, `${b.id} door ${d.x},${d.y}`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('the campus is big, the Training Yard is roomy and the Tower Gate sits in the north wall', () => {
    expect(MAP_W * MAP_H).toBeGreaterThan(4000)
    expect(walkableTilesIn('training').length).toBeGreaterThan(100)
    expect(propForPlace('tower').y).toBe(0)
  })

  it('every building has an interior, and the Memorial has room for twelve graves', () => {
    for (const b of BUILDINGS) expect(insideBuilding(b.rect.x + 1, b.rect.y + 1)?.id).toBe(b.id)
    for (let i = 0; i < 12; i++) {
      const g = graveTile(i)!
      expect(isWalkable(g.x, g.y), `grave ${i}`).toBe(true)
      expect(isWalkable(g.x, g.y + 1), `grave ${i} visitor spot`).toBe(true)
    }
  })

  it('findPath returns [] when already at the goal and null when unreachable', () => {
    expect(findPath(MASTER_SPAWN, (x, y) => x === MASTER_SPAWN.x && y === MASTER_SPAWN.y)).toEqual([])
    expect(findPath(MASTER_SPAWN, (x, y) => x === 0 && y === 0)).toBeNull() // a wall
  })

  it('paths are made of orthogonal single steps over walkable tiles', () => {
    const goal = walkableTilesIn('daily').at(-1)!
    const path = findPath(MASTER_SPAWN, (x, y) => x === goal.x && y === goal.y)!
    let prev = MASTER_SPAWN
    for (const s of path) {
      expect(Math.abs(s.x - prev.x) + Math.abs(s.y - prev.y)).toBe(1)
      expect(isWalkable(s.x, s.y)).toBe(true)
      prev = s
    }
  })
})

describe('lobby art', () => {
  it('renders the full base layer', () => {
    const b = renderLobbyBase()
    expect(b.w).toBe(MAP_W * 16)
    expect(b.h).toBe(MAP_H * 16)
    expect(opaqueCount(b)).toBe(b.w * b.h) // no holes
  })

  it('every prop kind draws every animation frame', () => {
    for (const p of PROPS) {
      for (let f = 0; f < PROP_FRAMES[p.kind]; f++) expect(opaqueCount(drawProp(p.kind, f).bmp), p.kind).toBeGreaterThan(10)
    }
  })
})

function freshState(seed = 4242): GameState {
  const store = createStore({})
  store.dispatch({ type: 'NEW_ACCOUNT', seed, now: 0 })
  return store.getState()!
}

describe('dialog lines', () => {
  it('heroes speak from their state: exhausted heroes ask for rest', () => {
    const s = freshState()
    const h = Object.values(s.heroes)[0] as OwnedHero
    expect(heroLines({ ...h, sanity: 20 }, false)[0]).toMatch(/rest/i)
    expect(heroLines({ ...h, sanity: 100 }, true)[0]).toMatch(/climb/i)
    expect(heroLines(h, false)[1]).toContain(`Lv ${h.xp.level}`)
  })

  it('Isel points a new Master at the tower', () => {
    const s = freshState()
    const lines = iselLines(s)
    expect(lines[0]).toMatch(/Isel/)
    expect(lines[1]).toMatch(/Tower Gate|party board/)
  })
})

describe('viewport fitting', () => {
  it('desktop keeps the 384-wide view at an integer zoom and shows extra height', () => {
    const v = fitViewport(1280, 800)
    expect(v.zoom).toBe(3)
    expect(v.w).toBe(384)
    expect(v.h).toBeGreaterThanOrEqual(216)
  })

  it('phones get ×2 zoom with a narrower, taller view', () => {
    const v = fitViewport(390, 844)
    expect(v.zoom).toBe(2)
    expect(v.w).toBe(195)
    expect(v.h).toBeLessThanOrEqual(MAP_H * 16)
  })
})

describe('heroes on the campus', () => {
  it('every activity has a walkable, reachable spot for every hero', async () => {
    const { spotFor } = await import('./heroAgent')
    const s = freshState(777)
    const hero = Object.values(s.heroes)[0] as OwnedHero
    const kinds = ['sleep', 'eat', 'work', 'train', 'socialize', 'hobby', 'read', 'pray', 'mourn', 'heal', 'wander', 'promoting', 'drilling', 'away'] as const
    const places = ['dormitory', 'hall', 'kitchen', 'forge', 'yard', 'tavern', 'library', 'promotion', 'memorial', 'infirmary', 'garden', 'market', 'watchtower', 'courtyard'] as const
    for (const kind of kinds)
      for (const place of places) {
        const spot = spotFor(s, hero, { kind, place, untilSlot: 0 })
        expect(isWalkable(spot.at.x, spot.at.y), `${kind}@${place}`).toBe(true)
        expect(findPath(MASTER_SPAWN, (x, y) => x === spot.at.x && y === spot.at.y), `${kind}@${place}`).not.toBeNull()
      }
  })
})
