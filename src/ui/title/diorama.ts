/**
 * The title diorama (lane K): the tower at night seen from the waiting room's yard — a
 * moonlit sky, far hills, the spire rising out of frame with its lowest floors lit, the
 * lobby with warm windows, a path, and a campfire where a few heroes keep watch.
 *
 * Pure Bitmaps, drawn once and cached by FIXED keys (lane rule 12): the base, two star
 * frames, the window light and two fire frames. Everything that moves (twinkle, flicker,
 * flames, walkers, embers) is CSS stacking those few images, never a new cache key.
 */
import { createBitmap, get, hex, hline, mix, rect, set, vline, withAlpha, type Bitmap, type RGBA } from '../pixel/bitmap'
import { disc, poly } from '../pixel/shape'
import { seededRand } from '../pixel/rand'
import { drawTowerStatic, floorRow, TOWER_H, TOWER_W } from '../pixel/towerMap'

export const DIORAMA_W = 256
export const DIORAMA_H = 144
/** The ground line (the yard's horizon). */
export const DIORAMA_GROUND = 112
/** The tower's floors are lit up to here (the climb so far, on the title). */
export const DIORAMA_LIT_FLOOR = 24

/** Where things stand, in diorama pixels (the UI places heroes and embers from these). */
export const DIORAMA_SPOTS = {
  fire: { x: 150, y: 124 },
  tower: { x: 62 },
  lobby: { x: 176, y: 78, w: 64, h: 36 },
} as const

const SKY_TOP = hex('#06040f')
const SKY_LOW = hex('#2a2152')
const HILL_FAR = hex('#1c1838')
const HILL_NEAR = hex('#15122a')
const GROUND = hex('#1a2a22')
const GROUND_D = hex('#121e18')
const PATH = hex('#3a3326')
const STONE = hex('#3e3a52')
const STONE_D = hex('#2a2640')
const ROOF = hex('#3a2230')
const ROOF_L = hex('#5a3242')
const WIN_DARK = hex('#120c1a')
const WARM = hex('#f2c75c')
const WARM_SOFT = hex('#ffb85a')
const MOON = hex('#f4ecd6')

/** Blend `c` over the pixel at (x, y) by `t` (0..1). */
function tint(b: Bitmap, x: number, y: number, c: RGBA, t: number): void {
  const under = get(b, x, y)
  if (under === 0) return
  set(b, x, y, mix(under, c, t))
}

/** The waiting room: a long hall with a peaked roof, a chimney and four windows. */
function drawLobby(b: Bitmap): void {
  const { x, y, w, h } = DIORAMA_SPOTS.lobby
  // walls
  rect(b, x, y, w, h, STONE)
  for (let j = 0; j < h; j += 4) hline(b, x, y + j, w, STONE_D)
  for (let j = 0; j < h; j += 4) for (let i = (j / 4) % 2 === 0 ? 0 : 4; i < w; i += 8) vline(b, x + i, y + j, 4, STONE_D)
  // roof
  poly(b, [[x - 5, y + 1], [x + w / 2, y - 18], [x + w + 5, y + 1]], ROOF)
  for (let i = 0; i < 18; i++) hline(b, x + w / 2 - i * 2, y - 18 + i, 2, ROOF_L)
  hline(b, x - 5, y, w + 10, mix(ROOF, hex('#000000'), 0.35))
  // chimney
  rect(b, x + w - 16, y - 18, 6, 10, STONE_D)
  rect(b, x + w - 17, y - 19, 8, 2, STONE)
  // door
  rect(b, x + w / 2 - 4, y + h - 13, 8, 13, hex('#2a1a12'))
  vline(b, x + w / 2, y + h - 13, 13, hex('#1a100c'))
  // windows (dark; the light is its own layer)
  for (const wx of [x + 6, x + 18, x + w - 26, x + w - 14]) {
    rect(b, wx, y + 12, 8, 9, WIN_DARK)
    vline(b, wx + 4, y + 12, 9, STONE_D)
  }
  // a little round attic window
  disc(b, x + w / 2, y - 7, 2, WIN_DARK)
}

/** The static scene. */
export function drawDioramaBase(): Bitmap {
  const W = DIORAMA_W
  const H = DIORAMA_H
  const G = DIORAMA_GROUND
  const b = createBitmap(W, H)
  // sky: a stepped gradient (pixel bands, not a smooth ramp)
  for (let y = 0; y < G; y++) {
    const band = Math.floor((y / G) * 8) / 8
    hline(b, 0, y, W, mix(SKY_TOP, SKY_LOW, band))
  }
  // the moon and its halo
  disc(b, 214, 22, 11, mix(SKY_LOW, MOON, 0.12))
  disc(b, 214, 22, 8, MOON)
  disc(b, 218, 19, 7, mix(SKY_TOP, SKY_LOW, 0.25))
  // far hills
  const r = seededRand(0x717e)
  let hy = 92
  for (let x = 0; x < W; x++) {
    if (x % 6 === 0) hy = Math.max(80, Math.min(98, hy + r.int(-3, 3)))
    vline(b, x, hy, G - hy, HILL_FAR)
  }
  // the tower, rising out of the frame: its lowest floors lit (the climb so far)
  const dark = drawTowerStatic({ crackHighest: 50, worldEnded: false, worldSaved: false, lit: false })
  const lit = drawTowerStatic({ crackHighest: 50, worldEnded: false, worldSaved: false, lit: true })
  const tx = DIORAMA_SPOTS.tower.x - TOWER_W / 2
  // The tower's gate sits on the yard's horizon; its own sky and ground band are left out.
  const top = G + 2 - (TOWER_H - 14)
  const litFrom = floorRow(DIORAMA_LIT_FLOOR)
  const star = hex('#fff6e0')
  for (let y = Math.max(0, -top); y < TOWER_H - 14; y++)
    for (let x = 0; x < TOWER_W; x++) {
      const c = (y >= litFrom ? lit : dark).px[y * TOWER_W + x]!
      // The tower's sky is one colour across each row (plus a few stars): keep only the stone.
      if (c === 0 || c === get(dark, 0, y) || c === get(dark, TOWER_W - 1, y) || c === star) continue
      set(b, tx + x, top + y, c)
    }
  // a faint glow at the tower's foot (the gate)
  for (let x = -10; x <= 10; x++) for (let y = -3; y <= 1; y++) tint(b, DIORAMA_SPOTS.tower.x + x, G + y, WARM_SOFT, 0.18 * (1 - Math.abs(x) / 11))
  // nearer hills
  hy = 104
  for (let x = 0; x < W; x++) {
    if (x % 9 === 0) hy = Math.max(98, Math.min(108, hy + r.int(-2, 2)))
    if (x < DIORAMA_SPOTS.tower.x - 19 || x > DIORAMA_SPOTS.tower.x + 19) vline(b, x, hy, G - hy, HILL_NEAR)
  }
  // the lobby
  drawLobby(b)
  // the yard
  rect(b, 0, G, W, H - G, GROUND)
  for (let i = 0; i < 260; i++) {
    const x = r.int(0, W - 1)
    const y = r.int(G, H - 1)
    set(b, x, y, r.chance(0.5) ? GROUND_D : mix(GROUND, hex('#4a6a3a'), 0.4))
  }
  // the path from the lobby's door to the tower
  const doorX = DIORAMA_SPOTS.lobby.x + DIORAMA_SPOTS.lobby.w / 2
  for (let y = G; y < H; y++) {
    const t = (y - G) / (H - G)
    const cx = Math.round(DIORAMA_SPOTS.tower.x + (doorX - DIORAMA_SPOTS.tower.x) * (0.15 + t * 0.6))
    const half = 3 + Math.round(t * 8)
    hline(b, cx - half, y, half * 2, PATH)
    set(b, cx - half, y, mix(PATH, GROUND, 0.5))
  }
  // the fire pit: a ring of stones, its glow on the grass
  const f = DIORAMA_SPOTS.fire
  for (let y = -12; y <= 12; y++)
    for (let x = -22; x <= 22; x++) {
      const d = (x * x) / (22 * 22) + (y * y) / (12 * 12)
      if (d <= 1 && f.y + y >= G) tint(b, f.x + x, f.y + y, WARM_SOFT, 0.32 * (1 - d))
    }
  for (const [dx, dy] of [[-6, 2], [-4, 3], [-1, 4], [2, 4], [5, 3], [7, 2], [-7, 0], [8, 0]] as const) {
    rect(b, f.x + dx, f.y + dy, 2, 1, STONE)
    set(b, f.x + dx, f.y + dy + 1, STONE_D)
  }
  // logs to sit on
  rect(b, f.x - 20, f.y + 4, 9, 3, hex('#4a3020'))
  hline(b, f.x - 20, f.y + 4, 9, hex('#6a4a30'))
  rect(b, f.x + 12, f.y + 4, 9, 3, hex('#4a3020'))
  hline(b, f.x + 12, f.y + 4, 9, hex('#6a4a30'))
  return b
}

/** Stars (transparent). Frame 1 lights a different handful, so stacking the two twinkles. */
export function drawDioramaStars(frame: 0 | 1): Bitmap {
  const b = createBitmap(DIORAMA_W, DIORAMA_H)
  const r = seededRand(0x57a5 + frame)
  for (let i = 0; i < 46; i++) {
    const x = r.int(0, DIORAMA_W - 1)
    const y = r.int(0, 78)
    const bright = r.chance(0.25)
    set(b, x, y, bright ? hex('#fff6e0') : withAlpha(hex('#c8c0f0'), 200))
    if (bright && r.chance(0.5)) {
      set(b, x - 1, y, withAlpha(hex('#fff6e0'), 110))
      set(b, x + 1, y, withAlpha(hex('#fff6e0'), 110))
      set(b, x, y - 1, withAlpha(hex('#fff6e0'), 110))
      set(b, x, y + 1, withAlpha(hex('#fff6e0'), 110))
    }
  }
  return b
}

/** The lobby's window light and its spill on the yard (transparent; the UI flickers it). */
export function drawDioramaLights(): Bitmap {
  const b = createBitmap(DIORAMA_W, DIORAMA_H)
  const { x, y, w, h } = DIORAMA_SPOTS.lobby
  for (const wx of [x + 6, x + 18, x + w - 26, x + w - 14]) {
    rect(b, wx, y + 12, 8, 9, WARM)
    rect(b, wx + 1, y + 13, 3, 3, hex('#fff0b0'))
    vline(b, wx + 4, y + 12, 9, hex('#8a6a3a'))
    // the light falling on the yard beneath the window
    for (let j = 0; j < 6; j++) hline(b, wx - j, y + h + j, 8 + j * 2, withAlpha(WARM_SOFT, Math.max(0, 70 - j * 12)))
  }
  disc(b, x + w / 2, y - 7, 2, WARM)
  // the door left ajar
  rect(b, x + w / 2 - 4, y + h - 13, 3, 13, withAlpha(WARM, 220))
  return b
}

export const FIRE_W = 16
export const FIRE_H = 20

/** The campfire's flames and logs (transparent), two frames that the UI alternates. */
export function drawCampfire(frame: 0 | 1): Bitmap {
  const b = createBitmap(FIRE_W, FIRE_H)
  // logs
  rect(b, 2, FIRE_H - 3, 12, 2, hex('#4a3020'))
  hline(b, 3, FIRE_H - 3, 10, hex('#6a4a30'))
  set(b, 2, FIRE_H - 4, hex('#3a2418'))
  set(b, 13, FIRE_H - 4, hex('#3a2418'))
  // flames: three tongues, swaying between the frames
  const s = frame === 0 ? 0 : 1
  const tongues: [number, number, number][] = [
    [5 - s, 9, 3],
    [8 + s, 14, 4],
    [11 - s, 8, 3],
  ]
  for (const [cx, hgt, wd] of tongues) {
    for (let j = 0; j < hgt; j++) {
      const t = j / hgt
      const half = Math.max(0, Math.round(wd * (1 - t) - (j % 2 === 0 ? 0 : 0.4)))
      const yy = FIRE_H - 4 - j
      const col = t < 0.35 ? hex('#fff0b0') : t < 0.7 ? WARM_SOFT : hex('#e8553b')
      hline(b, cx - half, yy, half * 2 + 1, col)
    }
  }
  // a spark above
  set(b, 7 + s * 2, 2 + s, hex('#ffd27a'))
  return b
}
