/**
 * The Tower, seen from outside (pure pixels): a stone spire of 100 floors rising from the
 * Master's world. Cleared floors glow; the act bands tint the stone; the Wailing Wall
 * (F80–89) is black crystal; the summit wears a crown. A gold marker shows the floor the
 * party stands on. Below, the world itself — green while it lives, ash once F90 ends it.
 */
import { createBitmap, hex, hline, mix, rect, set, vline, type Bitmap } from './bitmap'

export const TOWER_W = 64
export const TOWER_H = 236

/** Pixel row (top edge) of floor f (1..100) on the spire. */
export function floorRow(f: number): number {
  return 20 + (100 - f) * 2
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

export function drawTowerExterior(opts: { current: number; highest: number; worldEnded: boolean; worldSaved: boolean }): Bitmap {
  const b = createBitmap(TOWER_W, TOWER_H)
  // sky
  for (let y = 0; y < TOWER_H; y++) hline(b, 0, y, TOWER_W, mix(hex('#0e0a1e'), hex('#3a3a6a'), y / TOWER_H))
  for (let i = 0; i < 30; i++) set(b, (i * 37) % TOWER_W, (i * 53) % 150, hex('#fff6e0'))
  // the world below
  const ground = opts.worldEnded ? hex('#3a3434') : hex('#2e5a2e')
  rect(b, 0, TOWER_H - 16, TOWER_W, 16, ground)
  if (opts.worldEnded) for (let x = 0; x < TOWER_W; x += 5) set(b, x, TOWER_H - 12 + (x % 3), hex('#e8553b'))
  // the spire: 100 floors, tapering towards the top
  for (let f = 1; f <= 100; f++) {
    const y = floorRow(f)
    const half = 8 + Math.round((100 - f) * 0.1)
    const x0 = 32 - half
    const stone = tintFor(f)
    rect(b, x0, y, half * 2, 2, stone)
    set(b, x0, y, mix(stone, hex('#000000'), 0.4))
    set(b, x0 + half * 2 - 1, y, mix(stone, hex('#fff6e0'), 0.2))
    if (f % 5 === 0) hline(b, x0 - 1, y + 1, half * 2 + 2, mix(stone, hex('#fff6e0'), 0.25)) // anchor ledge
    // windows: lit where cleared
    const lit = f <= opts.highest
    for (let x = x0 + 3; x < x0 + half * 2 - 3; x += 4) set(b, x, y, lit ? hex('#f2c75c') : hex('#141020'))
  }
  // the crown at the summit
  const topY = floorRow(100)
  for (let i = 0; i < 5; i++) vline(b, 25 + i * 3, topY - 6 + (i % 2) * 2, 6 - (i % 2) * 2, opts.worldSaved ? hex('#f2c75c') : hex('#8a7a9a'))
  // the base / gate
  rect(b, 20, TOWER_H - 22, 24, 8, hex('#4a4452'))
  rect(b, 29, TOWER_H - 20, 6, 6, hex('#140c10'))
  // the party's marker
  if (opts.current >= 1 && opts.current <= 100) {
    const y = floorRow(opts.current)
    const half = 8 + Math.round((100 - opts.current) * 0.1)
    for (let i = 0; i < 4; i++) vline(b, 32 + half + 2 + i, y - i + 1, 1 + i * 2, hex('#ffe07a'))
  }
  return b
}
