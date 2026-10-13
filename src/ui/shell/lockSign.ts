/**
 * The boarded sign that stands outside a place the campus has not opened yet
 * (spec 2026-10-12 S3), and where it stands. Pure: a 16×18 Bitmap (a plank board on a
 * post, two boards nailed across it, a gold padlock) and a tile position per place.
 */
import { createBitmap, line, rect, set, type Bitmap } from '../pixel/bitmap'
import { GOLD, INK, STEEL, WOOD } from '../pixel/palette'
import { BUILDINGS, buildingAt, propForPlace, type PlaceId } from '../world/lobbyMap'

export const SIGN_W = 16
export const SIGN_H = 18

export function drawLockSign(): Bitmap {
  const b = createBitmap(SIGN_W, SIGN_H)
  // post
  rect(b, 7, 9, 2, 9, WOOD.d)
  set(b, 7, 9, INK)
  rect(b, 6, 17, 4, 1, INK)
  // board, planked, outlined
  rect(b, 1, 1, 14, 9, WOOD.m)
  rect(b, 2, 4, 12, 1, WOOD.d)
  rect(b, 2, 7, 12, 1, WOOD.d)
  rect(b, 2, 2, 12, 1, WOOD.l)
  rect(b, 0, 1, 1, 9, INK)
  rect(b, 15, 1, 1, 9, INK)
  rect(b, 1, 0, 14, 1, INK)
  rect(b, 1, 10, 14, 1, INK)
  // two boards nailed across
  line(b, 1, 2, 14, 9, WOOD.l)
  line(b, 1, 9, 14, 2, WOOD.l)
  line(b, 1, 3, 13, 9, WOOD.d)
  line(b, 2, 9, 14, 3, WOOD.d)
  // padlock: steel shackle over a gold body with a keyhole
  rect(b, 6, 2, 4, 1, STEEL.l)
  rect(b, 6, 3, 1, 2, STEEL.m)
  rect(b, 9, 3, 1, 2, STEEL.m)
  rect(b, 5, 5, 6, 4, GOLD.m)
  rect(b, 5, 5, 6, 1, GOLD.l)
  rect(b, 5, 8, 6, 1, GOLD.d)
  set(b, 7, 6, INK)
  set(b, 7, 7, INK)
  rect(b, 4, 5, 1, 4, INK)
  rect(b, 11, 5, 1, 4, INK)
  rect(b, 5, 9, 6, 1, INK)
  return b
}

/**
 * Where a place's sign stands (tile coordinates of its top-left). A place inside a
 * building gets it just outside the door, beside the doorway (so the path stays clear);
 * an outdoor place, or one inside the always-open Great Hall, gets it beside its prop.
 */
export function signTileFor(place: PlaceId): { x: number; y: number } {
  const prop = propForPlace(place)
  const b = buildingAt(prop.x, prop.y)
  if (b && b.id !== 'hall' && BUILDINGS.includes(b)) {
    const door = b.doors[0]!
    const r = b.rect
    if (door.y === r.y + r.h - 1) return { x: door.x + b.doors.length, y: door.y + 1 } // south wall
    if (door.y === r.y) return { x: door.x + b.doors.length, y: door.y - 1 } // north wall
    if (door.x === r.x + r.w - 1) return { x: door.x + 1, y: door.y - 1 } // east wall
    return { x: door.x - 1, y: door.y - 1 } // west wall
  }
  return { x: prop.x + prop.w, y: prop.y }
}
