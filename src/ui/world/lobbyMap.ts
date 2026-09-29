/**
 * The Lobby (waiting room) as a top-down tilemap — pure data + pathing.
 *
 * A Great Hall (summoning circle, roster lectern, the Tower Gate, the fairy Isel)
 * ringed by eight rooms: Kitchen · Tactical Center · Promotion Chamber on top,
 * Synthesis Chamber · Armory · Daily-Dungeon portal below, the Training Yard east with
 * the Transfer Station through its north door. Heroes wander inside
 * the room their state puts them in; the Master walks everywhere.
 */

export const TILE = 16

/**
 *  #  wall            G  tower gate (wall-mounted door)
 *  .  hall planks     ~  hall carpet
 *  k  kitchen tiles   t  tactical flagstones   p  promotion marble
 *  m  synthesis stone a  armory slate          d  daily-portal stone
 *  r  training-yard sand      x  transfer-station crystal floor
 *  h  hall-of-magic star tiles (the Crack of Time opens here)
 */
export const MAP_ROWS = [
  '#######################################',
  '#kkkkkkkk#tttttttttt#pppppppp#xxxxxxxx#',
  '#kkkkkkkk#tttttttttt#pppppppp#xxxxxxxx#',
  '#kkkkkkkk#tttttttttt#pppppppp#xxxxxxxx#',
  '#kkkkkkkk#tttttttttt#pppppppp#xxxxxxxx#',
  '#kkkkkkkk#tttttttttt#pppppppp#xxxxxxxx#',
  '####..######....######..########x######',
  '#............................#rrrrrrrr#',
  '#.........~~~~~~~~~~.........#rrrrrrrr#',
  'G.........~~~~~~~~~~..........rrrrrrrr#',
  'G.........~~~~~~~~~~..........rrrrrrrr#',
  '#.........~~~~~~~~~~.........#rrrrrrrr#',
  '#............................#rrrrrrrr#',
  '####..######....######..#########h#####',
  '#mmmmmmmm#aaaaaaaaaa#dddddddd#hhhhhhhh#',
  '#mmmmmmmm#aaaaaaaaaa#dddddddd#hhhhhhhh#',
  '#mmmmmmmm#aaaaaaaaaa#dddddddd#hhhhhhhh#',
  '#mmmmmmmm#aaaaaaaaaa#dddddddd#hhhhhhhh#',
  '#######################################',
] as const

export const MAP_W = MAP_ROWS[0].length
export const MAP_H = MAP_ROWS.length

export type TileChar = '#' | 'G' | '.' | '~' | 'k' | 't' | 'p' | 'm' | 'a' | 'd' | 'r' | 'x' | 'h'

export function tileAt(x: number, y: number): TileChar {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return '#'
  return MAP_ROWS[y]![x] as TileChar
}

export function isWallChar(c: TileChar): boolean {
  return c === '#' || c === 'G'
}

// ─────────────────────────────────────────────────────────────────────────────
// Rooms (wander regions)
// ─────────────────────────────────────────────────────────────────────────────

export type RoomId =
  | 'kitchen'
  | 'tacticalCenter'
  | 'promotionChamber'
  | 'hall'
  | 'synthesis'
  | 'armory'
  | 'daily'
  | 'training'
  | 'transfer'
  | 'magic'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const ROOMS: Record<RoomId, Rect> = {
  kitchen: { x: 1, y: 1, w: 8, h: 5 },
  tacticalCenter: { x: 10, y: 1, w: 10, h: 5 },
  promotionChamber: { x: 21, y: 1, w: 8, h: 5 },
  hall: { x: 1, y: 7, w: 28, h: 6 },
  synthesis: { x: 1, y: 14, w: 8, h: 4 },
  armory: { x: 10, y: 14, w: 10, h: 4 },
  daily: { x: 21, y: 14, w: 8, h: 4 },
  training: { x: 30, y: 7, w: 8, h: 6 },
  transfer: { x: 30, y: 1, w: 8, h: 5 },
  magic: { x: 30, y: 14, w: 8, h: 4 },
}

export function roomAt(x: number, y: number): RoomId | null {
  for (const [id, r] of Object.entries(ROOMS) as [RoomId, Rect][]) {
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

export const PROPS: Prop[] = [
  // Kitchen
  { kind: 'hearth', x: 2, y: 1, w: 2, h: 1, place: 'kitchen' },
  { kind: 'barrels', x: 7, y: 1, w: 1, h: 1 },
  { kind: 'table', x: 3, y: 3, w: 3, h: 1, place: 'kitchen' },
  // Tactical Center
  { kind: 'partyBoard', x: 11, y: 0, w: 2, h: 1, place: 'party' },
  { kind: 'warTable', x: 14, y: 3, w: 3, h: 2, place: 'tacticalCenter' },
  { kind: 'weaponRack', x: 18, y: 1, w: 1, h: 1 },
  { kind: 'banner', x: 16, y: 0, w: 1, h: 1 },
  // Promotion Chamber
  { kind: 'altar', x: 24, y: 2, w: 2, h: 1, place: 'promotionChamber' },
  { kind: 'pillar', x: 22, y: 2, w: 1, h: 1 },
  { kind: 'pillar', x: 27, y: 2, w: 1, h: 1 },
  // Hall
  { kind: 'summonCrystal', x: 14, y: 9, w: 2, h: 1, place: 'summon' },
  { kind: 'lectern', x: 5, y: 9, w: 1, h: 1, place: 'roster' },
  { kind: 'gate', x: 0, y: 9, w: 1, h: 2, place: 'tower' },
  { kind: 'fairy', x: 3, y: 11, w: 1, h: 1, place: 'fairy' },
  { kind: 'plant', x: 1, y: 7, w: 1, h: 1 },
  { kind: 'plant', x: 28, y: 7, w: 1, h: 1 },
  { kind: 'plant', x: 1, y: 12, w: 1, h: 1 },
  { kind: 'plant', x: 28, y: 12, w: 1, h: 1 },
  { kind: 'torch', x: 3, y: 6, w: 1, h: 1 },
  { kind: 'torch', x: 9, y: 6, w: 1, h: 1 },
  { kind: 'torch', x: 20, y: 6, w: 1, h: 1 },
  { kind: 'torch', x: 26, y: 6, w: 1, h: 1 },
  { kind: 'banner', x: 7, y: 6, w: 1, h: 1 },
  { kind: 'banner', x: 17, y: 6, w: 1, h: 1 },
  // Training Yard (east of the hall)
  { kind: 'drillBoard', x: 33, y: 6, w: 2, h: 1, place: 'trainingCenter' },
  { kind: 'dummy', x: 32, y: 9, w: 1, h: 1, place: 'trainingCenter' },
  { kind: 'dummy', x: 35, y: 9, w: 1, h: 1, place: 'trainingCenter' },
  { kind: 'dummy', x: 33, y: 11, w: 1, h: 1, place: 'trainingCenter' },
  { kind: 'weaponRack', x: 37, y: 7, w: 1, h: 1 },
  { kind: 'torch', x: 31, y: 6, w: 1, h: 1 },
  { kind: 'banner', x: 36, y: 6, w: 1, h: 1 },
  // Transfer Station (north of the yard): twin crystal plinths a skill passes between
  { kind: 'plinth', x: 32, y: 2, w: 1, h: 1, place: 'transferStation' },
  { kind: 'plinth', x: 35, y: 2, w: 1, h: 1, place: 'transferStation' },
  { kind: 'torch', x: 31, y: 0, w: 1, h: 1 },
  { kind: 'torch', x: 36, y: 0, w: 1, h: 1 },
  { kind: 'banner', x: 34, y: 0, w: 1, h: 1 },
  // Hall of Magic (south of the yard): the orrery and the Crack of Time and Space
  { kind: 'orrery', x: 31, y: 15, w: 2, h: 1, place: 'hallOfMagic' },
  { kind: 'rift', x: 35, y: 15, w: 2, h: 1, place: 'rift' },
  // Isel's shop counter in the hall
  { kind: 'stall', x: 24, y: 8, w: 2, h: 1, place: 'shop' },
  // The guild standard, for the Masters beyond the crack
  { kind: 'standard', x: 20, y: 12, w: 1, h: 1, place: 'guild' },
  // Synthesis Chamber
  { kind: 'cauldron', x: 4, y: 15, w: 2, h: 1, place: 'synthesis' },
  { kind: 'shelves', x: 1, y: 14, w: 2, h: 1 },
  // Armory
  { kind: 'forge', x: 13, y: 14, w: 2, h: 1, place: 'armory' },
  { kind: 'anvil', x: 15, y: 16, w: 1, h: 1, place: 'armory' },
  { kind: 'weaponRack', x: 18, y: 14, w: 1, h: 1 },
  // Daily Dungeon
  { kind: 'portal', x: 24, y: 15, w: 2, h: 1, place: 'daily' },
  { kind: 'pillar', x: 22, y: 15, w: 1, h: 1 },
  { kind: 'pillar', x: 27, y: 15, w: 1, h: 1 },
]

export const PLACE_LABEL: Record<PlaceId, string> = {
  kitchen: 'Kitchen',
  tacticalCenter: 'Tactical Center',
  promotionChamber: 'Promotion Chamber',
  trainingCenter: 'Training Center',
  transferStation: 'Transfer Station',
  synthesis: 'Synthesis Chamber',
  armory: 'Armory',
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
  return !isWallChar(tileAt(x, y)) && propAt(x, y) === null
}

export const MASTER_SPAWN = { x: 14, y: 12 }

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
