/**
 * The waiting room as a CAMPUS (Living Lobby spec §3) — pure data + pathing.
 *
 * A walled estate around the Great Hall (summon crystal, the roster lectern, Isel, the
 * guild standard). Freestanding buildings with doors and roofs ring it: the Dormitory,
 * Tactical Center, Promotion Chamber, Transfer Station and Watchtower along the north
 * road; the Kitchen, Tavern and Forge down the west road; the Library, Hall of Magic and
 * Infirmary to the east; the Synthesis Chamber in the south-west. Outdoors: the Training
 * Yard, the Market square, the Garden, the Memorial, the Daily-Dungeon portal ring and a
 * courtyard with a fountain. The Tower Gate stands in the north wall.
 *
 * The map is GENERATED from the building/zone/road tables below (so it can grow), then
 * frozen into MAP_ROWS. Heroes walk between buildings following their Quanton Life
 * activity; the Master walks everywhere.
 */

export const TILE = 16
export const MAP_W = 80
export const MAP_H = 58

/**
 *  #  wall                      G  tower gate (in the north wall)
 *  D  door (walkable)           =  fence / hedge (blocks)
 *  g  grass    c  cobble road   s  garden soil    y  memorial lawn
 *  .  planks   ~  hall carpet   w  dormitory boards
 *  k  kitchen tiles   t  tactical flagstones   p  promotion marble
 *  m  synthesis stone a  forge slate           d  portal stone
 *  r  training-yard sand        x  transfer crystal   h  hall-of-magic stars
 *  i  infirmary tiles           o  watchtower stone   v  tavern boards
 *  l  library boards            q  market flags
 */
export type TileChar =
  | '#'
  | 'G'
  | 'D'
  | '='
  | 'g'
  | 'c'
  | 's'
  | 'y'
  | '.'
  | '~'
  | 'w'
  | 'k'
  | 't'
  | 'p'
  | 'm'
  | 'a'
  | 'd'
  | 'r'
  | 'x'
  | 'h'
  | 'i'
  | 'o'
  | 'v'
  | 'l'
  | 'q'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Buildings, zones, roads
// ─────────────────────────────────────────────────────────────────────────────

export type BuildingId =
  | 'dormitory'
  | 'tacticalCenter'
  | 'promotionChamber'
  | 'transfer'
  | 'watchtower'
  | 'kitchen'
  | 'tavern'
  | 'hall'
  | 'library'
  | 'magic'
  | 'armory'
  | 'synthesis'
  | 'infirmary'

/** The emblem painted on each building's sign (and shown in its name plate). */
export const BUILDING_ICON: Record<BuildingId, string> = {
  dormitory: '🛏️',
  tacticalCenter: '🗺️',
  promotionChamber: '⭐',
  transfer: '🔀',
  watchtower: '🔭',
  kitchen: '🍲',
  tavern: '🍺',
  hall: '💎',
  library: '📚',
  magic: '🔮',
  armory: '⚒️',
  synthesis: '⚗️',
  infirmary: '🏥',
}

export interface Building {
  id: BuildingId
  rect: Rect
  floor: TileChar
  doors: { x: number; y: number }[]
  /** Roof colours (shingle base) and an optional chimney. */
  roof: string
  chimney?: boolean
  label: string
}

export const BUILDINGS: Building[] = [
  { id: 'dormitory', rect: { x: 2, y: 2, w: 18, h: 11 }, floor: 'w', doors: [{ x: 10, y: 12 }, { x: 11, y: 12 }], roof: '#5b86d6', label: 'Dormitory' },
  { id: 'tacticalCenter', rect: { x: 22, y: 3, w: 12, h: 9 }, floor: 't', doors: [{ x: 27, y: 11 }, { x: 28, y: 11 }], roof: '#7d8a3a', label: 'Tactical Center' },
  { id: 'promotionChamber', rect: { x: 45, y: 3, w: 12, h: 9 }, floor: 'p', doors: [{ x: 50, y: 11 }, { x: 51, y: 11 }], roof: '#e0b64a', label: 'Promotion Chamber' },
  { id: 'transfer', rect: { x: 59, y: 3, w: 10, h: 8 }, floor: 'x', doors: [{ x: 63, y: 10 }], roof: '#36a7c9', label: 'Transfer Station' },
  { id: 'watchtower', rect: { x: 71, y: 2, w: 7, h: 8 }, floor: 'o', doors: [{ x: 74, y: 9 }], roof: '#b8573a', label: 'Watchtower' },
  { id: 'kitchen', rect: { x: 2, y: 16, w: 14, h: 10 }, floor: 'k', doors: [{ x: 15, y: 20 }, { x: 15, y: 21 }], roof: '#e07a36', chimney: true, label: 'Kitchen' },
  { id: 'tavern', rect: { x: 2, y: 28, w: 14, h: 10 }, floor: 'v', doors: [{ x: 15, y: 32 }, { x: 15, y: 33 }], roof: '#b23a52', chimney: true, label: 'Tavern' },
  {
    id: 'hall',
    rect: { x: 28, y: 16, w: 24, h: 16 },
    floor: '.',
    doors: [
      { x: 39, y: 16 },
      { x: 40, y: 16 },
      { x: 39, y: 31 },
      { x: 40, y: 31 },
      { x: 28, y: 23 },
      { x: 28, y: 24 },
      { x: 51, y: 23 },
      { x: 51, y: 24 },
    ],
    roof: '#7b3a92',
    label: 'Great Hall',
  },
  { id: 'library', rect: { x: 55, y: 31, w: 10, h: 9 }, floor: 'l', doors: [{ x: 59, y: 31 }], roof: '#8c5a2e', label: 'Library' },
  { id: 'magic', rect: { x: 67, y: 31, w: 11, h: 10 }, floor: 'h', doors: [{ x: 72, y: 31 }], roof: '#4646c8', label: 'Hall of Magic' },
  { id: 'armory', rect: { x: 2, y: 41, w: 14, h: 10 }, floor: 'a', doors: [{ x: 15, y: 45 }, { x: 15, y: 46 }], roof: '#5a616c', chimney: true, label: 'Forge' },
  { id: 'synthesis', rect: { x: 19, y: 42, w: 10, h: 8 }, floor: 'm', doors: [{ x: 23, y: 42 }], roof: '#c04a8a', label: 'Synthesis Chamber' },
  { id: 'infirmary', rect: { x: 66, y: 44, w: 12, h: 9 }, floor: 'i', doors: [{ x: 71, y: 44 }], roof: '#ecebf2', label: 'Infirmary' },
]

export type ZoneId = 'yard' | 'market' | 'garden' | 'memorial' | 'daily' | 'courtyard'

export interface Zone {
  id: ZoneId
  rect: Rect
  floor: TileChar
  /** Fenced zones get a fence ring with these gaps. */
  fence?: { x: number; y: number }[]
}

export const ZONES: Zone[] = [
  {
    id: 'yard',
    rect: { x: 55, y: 14, w: 23, h: 14 },
    floor: 'r',
    fence: [
      { x: 55, y: 20 },
      { x: 55, y: 21 },
      { x: 66, y: 14 },
      { x: 67, y: 14 },
    ],
  },
  { id: 'market', rect: { x: 30, y: 36, w: 20, h: 6 }, floor: 'q' },
  { id: 'garden', rect: { x: 31, y: 44, w: 14, h: 10 }, floor: 's', fence: [{ x: 39, y: 44 }, { x: 40, y: 44 }] },
  { id: 'memorial', rect: { x: 55, y: 44, w: 10, h: 10 }, floor: 'y', fence: [{ x: 55, y: 48 }, { x: 55, y: 49 }] },
  { id: 'daily', rect: { x: 2, y: 52, w: 12, h: 4 }, floor: 'd' },
  { id: 'courtyard', rect: { x: 18, y: 16, w: 9, h: 16 }, floor: 'g' },
]

/** Cobble roads (rects), laid before buildings so doors connect cleanly. */
const ROADS: Rect[] = [
  { x: 1, y: 13, w: 78, h: 2 }, // north road
  { x: 39, y: 1, w: 2, h: 15 }, // the Tower Gate avenue
  { x: 16, y: 13, w: 2, h: 43 }, // west road
  { x: 53, y: 13, w: 2, h: 43 }, // east road
  { x: 14, y: 54, w: 64, h: 2 }, // south road
  { x: 18, y: 33, w: 35, h: 2 }, // the hall's south front
  { x: 39, y: 32, w: 2, h: 12 }, // hall → market → garden
  { x: 18, y: 23, w: 10, h: 2 }, // west door → west road
  { x: 52, y: 23, w: 2, h: 2 }, // east door → east road
  { x: 27, y: 12, w: 2, h: 1 }, // tactical door
  { x: 50, y: 12, w: 2, h: 1 }, // promotion door
  { x: 63, y: 11, w: 1, h: 2 }, // transfer door
  { x: 74, y: 10, w: 1, h: 3 }, // watchtower door
  { x: 55, y: 29, w: 18, h: 2 }, // library + hall of magic doors
  { x: 23, y: 35, w: 1, h: 7 }, // synthesis door
  { x: 55, y: 42, w: 17, h: 2 }, // infirmary door
  { x: 14, y: 52, w: 2, h: 2 }, // portal ring
]

function build(): string[] {
  const g: TileChar[][] = []
  for (let y = 0; y < MAP_H; y++) g.push(new Array<TileChar>(MAP_W).fill('g'))
  const fill = (r: Rect, c: TileChar) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (y >= 0 && x >= 0 && y < MAP_H && x < MAP_W) g[y]![x] = c
  }
  // Outer wall with the Tower Gate.
  for (let x = 0; x < MAP_W; x++) {
    g[0]![x] = '#'
    g[MAP_H - 1]![x] = '#'
  }
  for (let y = 0; y < MAP_H; y++) {
    g[y]![0] = '#'
    g[y]![MAP_W - 1] = '#'
  }
  g[0]![39] = 'G'
  g[0]![40] = 'G'
  for (const r of ROADS) fill(r, 'c')
  for (const z of ZONES) {
    if (z.id === 'courtyard') continue
    fill(z.rect, z.floor)
    if (z.fence) {
      const { x, y, w, h } = z.rect
      for (let i = x; i < x + w; i++) {
        g[y]![i] = '='
        g[y + h - 1]![i] = '='
      }
      for (let j = y; j < y + h; j++) {
        g[j]![x] = '='
        g[j]![x + w - 1] = '='
      }
      for (const d of z.fence) g[d.y]![d.x] = z.floor
    }
  }
  for (const b of BUILDINGS) {
    const { x, y, w, h } = b.rect
    fill(b.rect, '#')
    fill({ x: x + 1, y: y + 1, w: w - 2, h: h - 2 }, b.floor)
    for (const d of b.doors) g[d.y]![d.x] = 'D'
  }
  // The hall's carpet runs from the north door to the south door.
  fill({ x: 37, y: 17, w: 6, h: 14 }, '~')
  return g.map((row) => row.join(''))
}

export const MAP_ROWS: readonly string[] = build()

export function tileAt(x: number, y: number): TileChar {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return '#'
  return MAP_ROWS[y]![x] as TileChar
}

export function isWallChar(c: TileChar): boolean {
  return c === '#' || c === 'G'
}

export function isBlockingChar(c: TileChar): boolean {
  return c === '#' || c === 'G' || c === '='
}

/** The building whose footprint (walls included) holds (x, y). */
export function buildingAt(x: number, y: number): Building | null {
  for (const b of BUILDINGS) {
    const r = b.rect
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return b
  }
  return null
}

/** The building whose interior (inside its walls) holds (x, y). */
export function insideBuilding(x: number, y: number): Building | null {
  for (const b of BUILDINGS) {
    const r = b.rect
    if (x > r.x && x < r.x + r.w - 1 && y > r.y && y < r.y + r.h - 1) return b
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Rooms (wander regions) — a building interior or an outdoor zone
// ─────────────────────────────────────────────────────────────────────────────

export type RoomId = BuildingId | Exclude<ZoneId, 'courtyard'> | 'courtyard' | 'training' | 'daily'

const inner = (r: Rect): Rect => ({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 })
const B = (id: BuildingId) => BUILDINGS.find((b) => b.id === id)!.rect
const Z = (id: ZoneId) => ZONES.find((z) => z.id === id)!.rect

export const ROOMS: Record<RoomId, Rect> = {
  dormitory: inner(B('dormitory')),
  tacticalCenter: inner(B('tacticalCenter')),
  promotionChamber: inner(B('promotionChamber')),
  transfer: inner(B('transfer')),
  watchtower: inner(B('watchtower')),
  kitchen: inner(B('kitchen')),
  tavern: inner(B('tavern')),
  hall: inner(B('hall')),
  library: inner(B('library')),
  magic: inner(B('magic')),
  armory: inner(B('armory')),
  synthesis: inner(B('synthesis')),
  infirmary: inner(B('infirmary')),
  training: inner(Z('yard')),
  yard: inner(Z('yard')),
  market: Z('market'),
  garden: inner(Z('garden')),
  memorial: inner(Z('memorial')),
  daily: Z('daily'),
  courtyard: Z('courtyard'),
}

export function roomAt(x: number, y: number): RoomId | null {
  for (const [id, r] of Object.entries(ROOMS) as [RoomId, Rect][]) {
    if (id === 'yard') continue
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return id
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Props: furniture (blocking) and places (blocking + interactable)
// ─────────────────────────────────────────────────────────────────────────────

/** Everything the Master can "use". Panels open in place; views switch screens. */
export type PlaceId =
  | 'kitchen'
  | 'tacticalCenter'
  | 'promotionChamber'
  | 'trainingCenter'
  | 'transferStation'
  | 'synthesis'
  | 'armory'
  | 'daily'
  | 'shop'
  | 'hallOfMagic'
  | 'rift'
  | 'guild'
  | 'summon'
  | 'roster'
  | 'party'
  | 'tower'
  | 'fairy'
  | 'dormitory'
  | 'tavern'
  | 'infirmary'
  | 'garden'
  | 'memorial'
  | 'library'
  | 'watchtower'
  | 'market'

export type PropKind =
  | 'hearth'
  | 'table'
  | 'barrels'
  | 'warTable'
  | 'partyBoard'
  | 'weaponRack'
  | 'altar'
  | 'pillar'
  | 'cauldron'
  | 'shelves'
  | 'forge'
  | 'anvil'
  | 'portal'
  | 'summonCrystal'
  | 'lectern'
  | 'gate'
  | 'plant'
  | 'banner'
  | 'torch'
  | 'fairy'
  | 'dummy'
  | 'drillBoard'
  | 'plinth'
  | 'orrery'
  | 'rift'
  | 'stall'
  | 'standard'
  // The campus
  | 'bed'
  | 'tree'
  | 'bush'
  | 'fountain'
  | 'well'
  | 'bench'
  | 'crop'
  | 'grave'
  | 'obelisk'
  | 'bookcase'
  | 'desk'
  | 'cot'
  | 'bar'
  | 'lamp'
  | 'telescope'
  | 'marketStall'
  | 'flowers'

export interface Prop {
  kind: PropKind
  /** Anchor tile (top-left of the footprint). */
  x: number
  y: number
  /** Footprint in tiles (blocking). Wall-mounted props sit on wall tiles. */
  w: number
  h: number
  /** Interacting with this prop opens this place (undefined = decoration). */
  place?: PlaceId
}

const P = (kind: PropKind, x: number, y: number, w = 1, h = 1, place?: PlaceId): Prop => ({ kind, x, y, w, h, place })

function campusProps(): Prop[] {
  const out: Prop[] = []
  // ── Dormitory: two rows of beds (bed index order = the life engine's bed index)
  for (let i = 0; i < 16; i++) {
    const col = i % 8
    const row = Math.floor(i / 8)
    out.push(P('bed', 3 + col * 2, row === 0 ? 3 : 8, 1, 2, i === 0 ? 'dormitory' : undefined))
  }
  out.push(P('plant', 18, 3), P('torch', 6, 2), P('torch', 14, 2))
  // ── Tactical Center
  out.push(P('partyBoard', 24, 3, 2, 1, 'party'), P('warTable', 27, 6, 3, 2, 'tacticalCenter'), P('weaponRack', 32, 4), P('banner', 30, 3))
  // ── Promotion Chamber
  out.push(P('altar', 50, 5, 2, 1, 'promotionChamber'), P('pillar', 47, 5), P('pillar', 54, 5), P('pillar', 47, 8), P('pillar', 54, 8))
  // ── Transfer Station
  out.push(P('plinth', 61, 5, 1, 1, 'transferStation'), P('plinth', 65, 5, 1, 1, 'transferStation'), P('torch', 60, 3), P('torch', 67, 3))
  // ── Watchtower
  out.push(P('telescope', 74, 4, 1, 1, 'watchtower'), P('barrels', 72, 7), P('weaponRack', 76, 4))
  // ── Kitchen
  out.push(P('hearth', 4, 17, 2, 1, 'kitchen'), P('barrels', 12, 17), P('table', 5, 20, 3, 1, 'kitchen'), P('table', 5, 23, 3, 1), P('table', 10, 23, 3, 1), P('shelves', 9, 17, 2, 1))
  // ── Tavern
  out.push(P('bar', 4, 29, 5, 1, 'tavern'), P('barrels', 10, 29), P('barrels', 12, 29), P('table', 4, 33, 2, 1), P('table', 8, 33, 2, 1), P('table', 5, 35, 2, 1), P('table', 10, 35, 2, 1), P('torch', 7, 28))
  // ── Great Hall
  out.push(
    P('summonCrystal', 39, 23, 2, 1, 'summon'),
    P('lectern', 32, 20, 1, 1, 'roster'),
    P('fairy', 34, 27, 1, 1, 'fairy'),
    P('stall', 46, 19, 2, 1, 'shop'),
    P('standard', 47, 28, 1, 1, 'guild'),
    P('plant', 29, 17),
    P('plant', 50, 17),
    P('plant', 29, 30),
    P('plant', 50, 30),
    P('torch', 32, 16),
    P('torch', 36, 16),
    P('torch', 43, 16),
    P('torch', 47, 16),
    P('banner', 34, 16),
    P('banner', 45, 16),
  )
  // ── The Tower Gate (north wall)
  out.push(P('gate', 39, 0, 2, 1, 'tower'), P('lamp', 37, 2), P('lamp', 42, 2))
  // ── Library
  out.push(P('bookcase', 56, 32, 2, 1, 'library'), P('bookcase', 61, 32, 2, 1), P('desk', 57, 35, 2, 1), P('desk', 61, 35, 2, 1), P('bookcase', 56, 38, 2, 1), P('bookcase', 61, 38, 2, 1))
  // ── Hall of Magic: the orrery and the Crack of Time and Space
  out.push(P('orrery', 69, 34, 2, 1, 'hallOfMagic'), P('rift', 73, 37, 2, 1, 'rift'), P('pillar', 68, 32), P('pillar', 76, 32))
  // ── Forge (Armory)
  out.push(P('forge', 4, 42, 2, 1, 'armory'), P('anvil', 8, 45, 1, 1, 'armory'), P('anvil', 11, 45), P('weaponRack', 13, 42), P('barrels', 3, 49), P('shelves', 9, 42, 2, 1))
  // ── Synthesis Chamber
  out.push(P('cauldron', 23, 45, 2, 1, 'synthesis'), P('shelves', 20, 43, 2, 1), P('shelves', 26, 43, 2, 1))
  // ── Infirmary
  out.push(P('cot', 68, 46, 1, 2, 'infirmary'), P('cot', 70, 46, 1, 2), P('cot', 72, 46, 1, 2), P('cot', 74, 46, 1, 2), P('shelves', 75, 45, 2, 1), P('desk', 68, 50, 2, 1))
  // ── Training Yard
  out.push(
    P('drillBoard', 58, 16, 2, 1, 'trainingCenter'),
    P('dummy', 60, 19, 1, 1, 'trainingCenter'),
    P('dummy', 63, 19),
    P('dummy', 66, 19),
    P('dummy', 69, 19),
    P('dummy', 72, 19),
    P('dummy', 61, 23),
    P('dummy', 65, 23),
    P('dummy', 69, 23),
    P('weaponRack', 75, 16),
    P('weaponRack', 76, 16),
  )
  // ── Market square: Isel's gem counter moved into the hall; the traders set up here
  out.push(P('marketStall', 32, 37, 2, 1, 'market'), P('marketStall', 36, 37, 2, 1), P('marketStall', 43, 37, 2, 1), P('marketStall', 47, 37, 2, 1), P('barrels', 45, 40), P('lamp', 30, 36), P('lamp', 49, 36))
  // ── Garden: crop rows
  for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) out.push(P('crop', 33 + col * 2, 46 + row * 2, 1, 1, col === 0 && row === 0 ? 'garden' : undefined))
  out.push(P('well', 43, 50))
  // ── Memorial: the obelisk; graves are added per fallen hero at render time
  out.push(P('obelisk', 59, 45, 1, 1, 'memorial'), P('flowers', 57, 45), P('flowers', 61, 45))
  // ── Daily Dungeon portal ring
  out.push(P('portal', 7, 53, 2, 1, 'daily'), P('pillar', 4, 53), P('pillar', 11, 53))
  // ── Courtyard: fountain, benches, lamps
  out.push(P('fountain', 21, 19, 3, 2), P('bench', 20, 27, 2, 1), P('bench', 24, 27, 2, 1), P('lamp', 19, 22), P('lamp', 25, 22))
  // ── Trees and bushes on the lawns (fixed, hand-placed so no door is ever blocked)
  const trees: [number, number][] = [
    [1, 15], [21, 2], [35, 3], [44, 7], [58, 12], [70, 11], [77, 12],
    [26, 30], [19, 30], [22, 38], [27, 38], [5, 39], [10, 39], [29, 44], [29, 50],
    [47, 45], [47, 51], [51, 40], [65, 36], [77, 29], [66, 42], [77, 54], [20, 52], [26, 52],
    [3, 38], [8, 26], [12, 26], [44, 12], [34, 12], [57, 41],
  ]
  for (const [x, y] of trees) out.push(P('tree', x, y))
  const bushes: [number, number][] = [[26, 17], [18, 17], [30, 43], [50, 43], [46, 54], [36, 54], [60, 54], [68, 54], [24, 40], [44, 35], [35, 35]]
  for (const [x, y] of bushes) out.push(P('bush', x, y))
  return out
}

export const PROPS: Prop[] = campusProps()

export const PLACE_LABEL: Record<PlaceId, string> = {
  kitchen: 'Kitchen',
  tacticalCenter: 'Tactical Center',
  promotionChamber: 'Promotion Chamber',
  trainingCenter: 'Training Center',
  transferStation: 'Transfer Station',
  synthesis: 'Synthesis Chamber',
  armory: 'Forge',
  daily: 'Daily Dungeon',
  shop: 'Gem Shop',
  hallOfMagic: 'Hall of Magic',
  rift: 'Crack of Time',
  guild: 'Guild Hall',
  summon: 'Mobius Summon',
  roster: 'Roster',
  party: 'Party',
  tower: 'Tower Gate',
  fairy: 'Isel',
  dormitory: 'Dormitory',
  tavern: 'Tavern',
  infirmary: 'Infirmary',
  garden: 'Garden',
  memorial: 'Memorial',
  library: 'Library',
  watchtower: 'Watchtower',
  market: 'Market',
}

const propGrid: (Prop | null)[] = new Array(MAP_W * MAP_H).fill(null)
for (const p of PROPS) {
  for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) propGrid[(p.y + j) * MAP_W + (p.x + i)] = p
}

export function propAt(x: number, y: number): Prop | null {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null
  return propGrid[y * MAP_W + x]!
}

export function isWalkable(x: number, y: number): boolean {
  return !isBlockingChar(tileAt(x, y)) && propAt(x, y) === null
}

/** The Master starts in the Great Hall, facing the crystal. */
export const MASTER_SPAWN = { x: 39, y: 27 }

// ─────────────────────────────────────────────────────────────────────────────
// Graves (the Memorial fills as heroes fall)
// ─────────────────────────────────────────────────────────────────────────────

/** Where the n-th grave stands (4 columns × 3 rows inside the Memorial lawn). */
export function graveTile(n: number): { x: number; y: number } | null {
  if (n < 0 || n >= 12) return null
  return { x: 57 + (n % 4) * 2, y: 47 + Math.floor(n / 4) * 2 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pathing
// ─────────────────────────────────────────────────────────────────────────────

export interface Pt {
  x: number
  y: number
}

const DIRS4: Pt[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]

/**
 * Breadth-first path from `from` to the nearest tile satisfying `goal`, walking
 * only on tiles `passable` accepts. Returns the steps AFTER `from` (empty when
 * already there), or null when unreachable.
 */
export function findPath(
  from: Pt,
  goal: (x: number, y: number) => boolean,
  passable: (x: number, y: number) => boolean = isWalkable,
): Pt[] | null {
  if (goal(from.x, from.y)) return []
  const prev = new Int32Array(MAP_W * MAP_H).fill(-1)
  const start = from.y * MAP_W + from.x
  prev[start] = start
  const queue = [start]
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi]!
    const cx = cur % MAP_W
    const cy = Math.floor(cur / MAP_W)
    for (const d of DIRS4) {
      const nx = cx + d.x
      const ny = cy + d.y
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue
      const ni = ny * MAP_W + nx
      if (prev[ni] !== -1 || !passable(nx, ny)) continue
      prev[ni] = cur
      if (goal(nx, ny)) {
        const path: Pt[] = []
        for (let k = ni; k !== start; k = prev[k]!) path.push({ x: k % MAP_W, y: Math.floor(k / MAP_W) })
        return path.reverse()
      }
      queue.push(ni)
    }
  }
  return null
}

/** Is (x, y) orthogonally adjacent to any footprint tile of `p`? */
export function isAdjacentTo(p: Prop, x: number, y: number): boolean {
  for (let j = 0; j < p.h; j++) {
    for (let i = 0; i < p.w; i++) {
      if (Math.abs(p.x + i - x) + Math.abs(p.y + j - y) === 1) return true
    }
  }
  return false
}

/** Direction to face from (x, y) toward the nearest footprint tile of `p`. */
export function facingToward(p: Prop, x: number, y: number): 'up' | 'down' | 'left' | 'right' {
  let best = { dx: 0, dy: -1, d: Infinity }
  for (let j = 0; j < p.h; j++) {
    for (let i = 0; i < p.w; i++) {
      const dx = p.x + i - x
      const dy = p.y + j - y
      const d = Math.abs(dx) + Math.abs(dy)
      if (d < best.d) best = { dx, dy, d }
    }
  }
  if (Math.abs(best.dx) > Math.abs(best.dy)) return best.dx > 0 ? 'right' : 'left'
  return best.dy > 0 ? 'down' : 'up'
}

/** The first prop offering `place` (for the places list / fast travel). */
export function propForPlace(place: PlaceId): Prop {
  return PROPS.find((p) => p.place === place)!
}

/** All walkable tiles of a room (for wandering). */
export function walkableTilesIn(room: RoomId): Pt[] {
  const r = ROOMS[room]
  const out: Pt[] = []
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (isWalkable(x, y)) out.push({ x, y })
  return out
}

/** Props of a kind inside a room's rect (one tile of slack for wall-mounted ones). */
export function propsInRoom(room: RoomId, kind?: PropKind): Prop[] {
  const r = ROOMS[room]
  return PROPS.filter(
    (p) => (!kind || p.kind === kind) && p.x >= r.x - 1 && p.x < r.x + r.w + 1 && p.y >= r.y - 1 && p.y < r.y + r.h + 1,
  )
}
