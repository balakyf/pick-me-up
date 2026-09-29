/**
 * Battle backdrops (384×216), themed by tower band:
 *   F1–9   prairie (goblins, wolves, harpies under an open sky)
 *   F10    the falling city (dusk, burning skyline) — the first anchor wall
 *   other  the tower's stone depths
 */
import { createBitmap, ellipse, hex, hline, mix, rect, set, type Bitmap, type RGBA } from './bitmap'
import { hashString, seededRand } from './rand'

export const BG_W = 384
export const BG_H = 216
export const HORIZON = 112

function skyGradient(b: Bitmap, top: RGBA, bottom: RGBA, h: number) {
  // 8 hard bands with a checker dither between them — the SNES sky.
  const bands = 8
  for (let y = 0; y < h; y++) {
    const t = y / h
    const band = Math.floor(t * bands)
    const frac = t * bands - band
    const c0 = mix(top, bottom, band / bands)
    const c1 = mix(top, bottom, Math.min(1, (band + 1) / bands))
    for (let x = 0; x < BG_W; x++) set(b, x, y, frac > 0.75 && (x + y) % 2 === 0 ? c1 : c0)
  }
}

function ridge(b: Bitmap, seed: string, baseY: number, amp: number, color: RGBA, rough = 0.5) {
  const r = seededRand(hashString(seed))
  let y = baseY
  for (let x = 0; x < BG_W; x++) {
    if (x % 6 === 0) y = Math.max(baseY - amp, Math.min(baseY + amp / 3, y + (r.next() - rough) * 6))
    for (let yy = Math.round(y); yy < HORIZON + 4; yy++) set(b, x, yy, color)
  }
}

function prairie(): Bitmap {
  const b = createBitmap(BG_W, BG_H)
  skyGradient(b, hex('#3a5aa8'), hex('#b8d8f0'), HORIZON)
  const r = seededRand(1234)
  for (let i = 0; i < 5; i++) {
    const cx = r.int(0, BG_W - 60)
    const cy = r.int(8, 50)
    ellipse(b, cx, cy, 44, 12, hex('#f4f8ff'))
    ellipse(b, cx + 14, cy - 6, 26, 12, hex('#ffffff'))
    hline(b, cx + 4, cy + 10, 36, hex('#d0e0f4'))
  }
  ridge(b, 'mtn', 84, 26, hex('#6a78b0'), 0.5)
  ridge(b, 'hill', 100, 10, hex('#4a7a6a'), 0.5)
  ridge(b, 'trees', 108, 6, hex('#2e5a3e'), 0.45)
  // grass field with perspective stripes
  for (let y = HORIZON; y < BG_H; y++) {
    const band = Math.floor(Math.pow((y - HORIZON) / (BG_H - HORIZON), 0.6) * 8)
    const c = band % 2 ? hex('#4e8e3a') : hex('#5a9a42')
    hline(b, 0, y, BG_W, c)
  }
  hline(b, 0, HORIZON, BG_W, hex('#3e7a30'))
  // dirt path
  for (let y = HORIZON + 6; y < BG_H; y++) {
    const w = 10 + (y - HORIZON) * 0.9
    const cx = 190 + Math.sin(y / 18) * 12
    hline(b, Math.round(cx - w / 2), y, Math.round(w), (y % 7 === 0 ? hex('#a8844e') : hex('#b8945a')))
  }
  // tufts & flowers
  for (let i = 0; i < 160; i++) {
    const x = r.int(0, BG_W - 1)
    const y = r.int(HORIZON + 4, BG_H - 1)
    const k = r.int(0, 9)
    if (k < 6) {
      set(b, x, y, hex('#2e6a2a'))
      set(b, x + 1, y - 1, hex('#2e6a2a'))
    } else set(b, x, y, [hex('#f4e060'), hex('#f08ac0'), hex('#ffffff')][k % 3]!)
  }
  return b
}

function fallingCity(): Bitmap {
  const b = createBitmap(BG_W, BG_H)
  skyGradient(b, hex('#1a0e2a'), hex('#c84a3a'), HORIZON)
  const r = seededRand(99)
  // skyline
  let x = 0
  while (x < BG_W) {
    const w = r.int(10, 26)
    const h = r.int(18, 54)
    rect(b, x, HORIZON - h, w, h, hex('#1e1224'))
    if (r.chance(0.4)) rect(b, x + Math.floor(w / 2) - 2, HORIZON - h - 10, 4, 10, hex('#1e1224'))
    for (let i = 0; i < 4; i++) if (r.chance(0.5)) set(b, x + r.int(2, w - 3), HORIZON - r.int(4, h - 4), hex('#ffb040'))
    x += w + r.int(0, 4)
  }
  // fires & smoke
  for (let i = 0; i < 6; i++) {
    const fx = r.int(10, BG_W - 30)
    ellipse(b, fx, HORIZON - 40 - r.int(0, 30), 30, 24, hex('#3a2a3a'))
    ellipse(b, fx + 8, HORIZON - 10, 10, 12, hex('#e8553b'))
    ellipse(b, fx + 10, HORIZON - 6, 6, 8, hex('#ffb040'))
  }
  // cobbles
  for (let y = HORIZON; y < BG_H; y++) hline(b, 0, y, BG_W, (Math.floor((y - HORIZON) / 6) % 2 ? hex('#4a3e48') : hex('#54464e')))
  for (let y = HORIZON + 3; y < BG_H; y += 6) for (let xx = (y % 12) * 2; xx < BG_W; xx += 16) set(b, xx, y, hex('#2e242e'))
  hline(b, 0, HORIZON, BG_W, hex('#2e242e'))
  return b
}

function depths(): Bitmap {
  const b = createBitmap(BG_W, BG_H)
  skyGradient(b, hex('#0e0a16'), hex('#2a2238'), HORIZON)
  // pillars
  for (let x = 16; x < BG_W; x += 72) {
    rect(b, x, 10, 18, HORIZON - 10, hex('#342a44'))
    rect(b, x + 2, 10, 4, HORIZON - 10, hex('#443858'))
    rect(b, x - 3, 6, 24, 6, hex('#443858'))
    ellipse(b, x + 5, 44, 8, 10, hex('#e8553b55'))
    set(b, x + 9, 48, hex('#ffb040'))
  }
  for (let y = HORIZON; y < BG_H; y++) hline(b, 0, y, BG_W, (Math.floor((y - HORIZON) / 8) % 2 ? hex('#2a2234') : hex('#322840')))
  hline(b, 0, HORIZON, BG_W, hex('#14101c'))
  return b
}

export function drawBattleBg(floor: number): Bitmap {
  if (floor >= 1 && floor <= 9) return prairie()
  if (floor === 10) return fallingCity()
  return depths()
}
