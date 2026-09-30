/**
 * The Tower, seen from outside (pure pixels): a stone spire of 100 floors rising from the
 * Master's world. Cleared floors glow; the act bands tint the stone; the Wailing Wall
 * (F80–89) is black crystal; the summit wears a crown. A gold marker shows the floor the
 * party stands on. Below, the world itself — green while it lives, ash once F90 ends it.
 *
 * The tower also wears the climb: cleared anchor floors keep a warm glow, cracks spread
 * through the stone as the Master nears the Wailing Wall, and once F90 has ended the
 * world, everything above it is grey and dead.
 */
import { createBitmap, hex, hline, mix, rect, set, vline, get, type Bitmap } from './bitmap'
import { seededRand } from './rand'

export const TOWER_W = 64
export const TOWER_H = 236

/** Pixel row (top edge) of floor f (1..100) on the spire. */
export function floorRow(f: number): number {
  return 20 + (100 - f) * 2
}

/** Half-width of the spire at floor f (it tapers towards the top). */
export function floorHalf(f: number): number {
  return 8 + Math.round((100 - f) * 0.1)
}

const ACT_TINT: [number, number, string][] = [
  [1, 10, '#6a7a5a'],
  [11, 20, '#7a7a86'],
  [21, 30, '#4e6a4a'],
  [31, 35, '#4a6a7a'],
  [36, 69, '#7a6a5a'],
  [70, 79, '#7a3a3a'],
  [80, 89, '#241a3a'],
  [90, 100, '#3a1a4a'],
]

function tintFor(f: number): number {
  const band = ACT_TINT.find(([a, b]) => f >= a && f <= b)
  return hex(band ? band[2] : '#6a6a72')
}

/** How cracked the stone is (0..1): damage creeps in from F50 and is total at the Wall. */
export function towerDamage(highest: number): number {
  return Math.max(0, Math.min(1, (highest - 50) / 30))
}

const GREY = hex('#6e6a70')
const DEAD_SKY = hex('#2a2830')

export interface TowerLook {
  current: number
  highest: number
  worldEnded: boolean
  worldSaved: boolean
  /** Where to draw the party's marker (a floor, possibly mid-climb); defaults to `current`. */
  marker?: number
}

export function drawTowerExterior(opts: TowerLook): Bitmap {
  const b = createBitmap(TOWER_W, TOWER_H)
  const dead = opts.worldEnded
  // sky — once the world has ended, the sky above F90 is ash
  for (let y = 0; y < TOWER_H; y++) {
    const sky = mix(hex('#0e0a1e'), hex('#3a3a6a'), y / TOWER_H)
    hline(b, 0, y, TOWER_W, dead && y < floorRow(90) ? mix(sky, DEAD_SKY, 0.7) : sky)
  }
  for (let i = 0; i < 30; i++) {
    const y = (i * 53) % 150
    if (!(dead && y < floorRow(90))) set(b, (i * 37) % TOWER_W, y, hex('#fff6e0'))
  }
  // the world below
  const ground = dead ? hex('#3a3434') : hex('#2e5a2e')
  rect(b, 0, TOWER_H - 16, TOWER_W, 16, ground)
  if (dead) for (let x = 0; x < TOWER_W; x += 5) set(b, x, TOWER_H - 12 + (x % 3), hex('#e8553b'))
  // the spire: 100 floors, tapering towards the top
  for (let f = 1; f <= 100; f++) {
    const y = floorRow(f)
    const half = floorHalf(f)
    const x0 = 32 - half
    const greyed = dead && f >= 90
    const stone = greyed ? mix(tintFor(f), GREY, 0.8) : tintFor(f)
    rect(b, x0, y, half * 2, 2, stone)
    set(b, x0, y, mix(stone, hex('#000000'), 0.4))
    set(b, x0 + half * 2 - 1, y, mix(stone, hex('#fff6e0'), 0.2))
    const anchorCleared = f % 5 === 0 && f <= opts.highest && !greyed
    if (f % 5 === 0) {
      // anchor ledge — a cleared anchor keeps a warm glow on its ledge and at its edges
      hline(b, x0 - 1, y + 1, half * 2 + 2, anchorCleared ? mix(stone, hex('#f2c75c'), 0.55) : mix(stone, hex('#fff6e0'), 0.25))
      if (anchorCleared) {
        set(b, x0 - 2, y + 1, mix(hex('#3a3a6a'), hex('#f2c75c'), 0.45))
        set(b, x0 + half * 2 + 1, y + 1, mix(hex('#3a3a6a'), hex('#f2c75c'), 0.45))
      }
    }
    // windows: lit where cleared (a dead world's windows are dark)
    const lit = f <= opts.highest && !greyed
    for (let x = x0 + 3; x < x0 + half * 2 - 3; x += 4) set(b, x, y, lit ? hex('#f2c75c') : greyed ? hex('#2a2830') : hex('#141020'))
  }
  drawCracks(b, towerDamage(opts.highest))
  // the crown at the summit
  const topY = floorRow(100)
  for (let i = 0; i < 5; i++) vline(b, 25 + i * 3, topY - 6 + (i % 2) * 2, 6 - (i % 2) * 2, opts.worldSaved ? hex('#f2c75c') : dead ? GREY : hex('#8a7a9a'))
  // the base / gate
  rect(b, 20, TOWER_H - 22, 24, 8, hex('#4a4452'))
  rect(b, 29, TOWER_H - 20, 6, 6, hex('#140c10'))
  // the party's marker (drawn at a fractional floor while it climbs)
  const m = opts.marker ?? opts.current
  if (m >= 1 && m <= 100) {
    const y = Math.round(20 + (100 - m) * 2)
    const half = floorHalf(Math.round(m))
    for (let i = 0; i < 4; i++) vline(b, 32 + half + 2 + i, y - i + 1, 1 + i * 2, hex('#ffe07a'))
  }
  return b
}

/**
 * Cracks: jagged dark seams through the upper-middle stone (F55–89), more of them and
 * longer as `damage` grows; at full damage the Wailing Wall splits. Deterministic.
 */
function drawCracks(b: Bitmap, damage: number): void {
  if (damage <= 0) return
  const r = seededRand(0x7a11)
  const seams = Math.round(damage * 14)
  for (let s = 0; s < seams; s++) {
    let f = r.int(55, 89)
    const half = floorHalf(f)
    let x = 32 - half + r.int(2, half * 2 - 3)
    const len = 3 + Math.round(damage * r.int(3, 10))
    for (let i = 0; i < len && f >= 50; i++) {
      const y = floorRow(f) + (i % 2)
      const hw = floorHalf(f)
      if (x > 32 - hw && x < 32 + hw - 1) {
        const c = get(b, x, y)
        set(b, x, y, mix(c, hex('#07040c'), 0.75))
      }
      if (i % 2 === 1) f--
      x += r.int(-1, 1)
    }
  }
}
