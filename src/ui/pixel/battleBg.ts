/**
 * Battle backdrops (384×216), themed by tower band:
 *   F1–9   prairie (goblins, wolves, harpies under an open sky)
 *   F10    the falling city (dusk, burning skyline) — the first anchor wall
 *   F11–19 the ruined city (Act II)
 *   F20    Halgiraf's lair
 *   F21–30 the swamp · F31–35 the drowned coast · F36–69 the Order's war camp
 *   F70–79 the inflection's crimson sky · F80–89 the Wailing Wall
 *   F90–99 the unfinished floors · F100 the summit
 *   other  the tower's stone depths (tournaments)
 */
import { createBitmap, ellipse, hex, hline, mix, rect, set, vline, type Bitmap, type RGBA } from './bitmap'
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

function ruins(): Bitmap {
  // Act II: a ruined city under an overcast sky — broken colonnades, rubble streets.
  const b = createBitmap(BG_W, BG_H)
  skyGradient(b, hex('#3a4458'), hex('#9aa4b0'), HORIZON)
  const r = seededRand(2020)
  ridge(b, 'ruin-far', 92, 14, hex('#5a6272'), 0.5)
  // broken columns and wall stubs
  for (let x = 6; x < BG_W; x += r.int(34, 58)) {
    const h = r.int(24, 70)
    const w = r.int(10, 16)
    rect(b, x, HORIZON - h, w, h, hex('#7a7a86'))
    rect(b, x + 2, HORIZON - h, 2, h, hex('#9a9aa6'))
    rect(b, x - 2, HORIZON - h - 4, w + 4, 4, hex('#8a8a96'))
    // jagged broken top
    for (let i = 0; i < w; i += 3) rect(b, x + i, HORIZON - h - 4 - r.int(0, 5), 3, 5, hex('#8a8a96'))
    if (r.chance(0.5)) rect(b, x + w + 4, HORIZON - r.int(8, 18), r.int(12, 24), 18, hex('#6a6a76'))
  }
  // cracked flagstone street
  for (let y = HORIZON; y < BG_H; y++) hline(b, 0, y, BG_W, Math.floor((y - HORIZON) / 7) % 2 ? hex('#6a665e') : hex('#76726a'))
  for (let y = HORIZON + 4; y < BG_H; y += 7) for (let x = (y % 14) * 2; x < BG_W; x += 22) set(b, x, y, hex('#4a463e'))
  for (let i = 0; i < 90; i++) {
    const x = r.int(0, BG_W - 3)
    const y = r.int(HORIZON + 2, BG_H - 2)
    rect(b, x, y, r.int(1, 3), 1, hex('#8a867a')) // rubble
    if (r.chance(0.2)) set(b, x, y - 1, hex('#4e7a3a')) // weeds
  }
  hline(b, 0, HORIZON, BG_W, hex('#4a463e'))
  return b
}

function lair(): Bitmap {
  // F20: the half black dragon's lair — a vast cavern lit by embers.
  const b = createBitmap(BG_W, BG_H)
  skyGradient(b, hex('#0a060e'), hex('#3a1a1e'), HORIZON)
  const r = seededRand(20)
  // stalactites
  for (let x = 0; x < BG_W; x += r.int(10, 22)) {
    const h = r.int(10, 40)
    for (let i = 0; i < h; i++) hline(b, x + Math.floor(i / 4), i, Math.max(1, 8 - Math.floor(i / 5)), hex('#1e1420'))
  }
  // bone piles + ember glow
  for (let i = 0; i < 5; i++) {
    const x = r.int(10, BG_W - 40)
    ellipse(b, x, HORIZON - 12, 36, 18, hex('#3a2a2a'))
    for (let k = 0; k < 6; k++) rect(b, x + r.int(2, 30), HORIZON - r.int(4, 12), r.int(3, 7), 1, hex('#b8ae96'))
  }
  for (let y = HORIZON; y < BG_H; y++) hline(b, 0, y, BG_W, Math.floor((y - HORIZON) / 9) % 2 ? hex('#2a1a1c') : hex('#321e20'))
  for (let i = 0; i < 70; i++) set(b, r.int(0, BG_W - 1), r.int(HORIZON + 2, BG_H - 1), r.chance(0.3) ? hex('#e8553b') : hex('#4a2e2a'))
  hline(b, 0, HORIZON, BG_W, hex('#140c10'))
  return b
}

function swamp(): Bitmap {
  // Act III: a drowned forest — hanging moss, reeds, still green water.
  const b = createBitmap(BG_W, BG_H)
  skyGradient(b, hex('#2a3a2a'), hex('#8aa07a'), HORIZON)
  const r = seededRand(2121)
  ridge(b, 'swamp-far', 96, 10, hex('#3a4e36'), 0.5)
  for (let x = 4; x < BG_W; x += r.int(26, 44)) {
    const h = r.int(50, 96)
    rect(b, x, HORIZON - h, r.int(5, 9), h, hex('#2a2418'))
    for (let i = 0; i < 6; i++) rect(b, x - 6 + r.int(0, 12), HORIZON - h + r.int(0, 30), 2, r.int(8, 18), hex('#5a7a3a')) // moss
  }
  for (let y = HORIZON; y < BG_H; y++) hline(b, 0, y, BG_W, Math.floor((y - HORIZON) / 5) % 2 ? hex('#3a5a3a') : hex('#44663e'))
  for (let i = 0; i < 80; i++) {
    const x = r.int(0, BG_W - 1)
    const y = r.int(HORIZON + 2, BG_H - 4)
    rect(b, x, y - 4, 1, 5, hex('#6a8a4a')) // reeds
    if (r.chance(0.2)) set(b, x + 1, y - 5, hex('#c8a04a'))
  }
  hline(b, 0, HORIZON, BG_W, hex('#1e2a1e'))
  return b
}

function coast(): Bitmap {
  // Act IV: a drowned coast — a storm sea, a sunken temple on the horizon.
  const b = createBitmap(BG_W, BG_H)
  skyGradient(b, hex('#1e2a44'), hex('#6a8aa8'), HORIZON)
  const r = seededRand(3535)
  rect(b, 250, 60, 70, HORIZON - 60, hex('#3a4a5a'))
  for (let x = 254; x < 316; x += 12) rect(b, x, 52, 6, HORIZON - 52, hex('#4a5a6a'))
  rect(b, 244, 48, 82, 6, hex('#5a6a7a'))
  for (let y = HORIZON; y < BG_H; y++) hline(b, 0, y, BG_W, Math.floor((y - HORIZON) / 4) % 2 ? hex('#1e4a6a') : hex('#2a5a7a'))
  for (let i = 0; i < 90; i++) hline(b, r.int(0, BG_W - 8), r.int(HORIZON + 1, BG_H - 1), r.int(3, 8), hex('#7ab8d8')) // foam
  hline(b, 0, HORIZON, BG_W, hex('#0e2a3a'))
  return b
}

function warCamp(): Bitmap {
  // Act V: the Order's war — banners, palisades, smoke under a grey sky.
  const b = createBitmap(BG_W, BG_H)
  skyGradient(b, hex('#3a3a44'), hex('#a09a94'), HORIZON)
  const r = seededRand(4040)
  ridge(b, 'war-far', 94, 12, hex('#5a5652'), 0.5)
  for (let x = 0; x < BG_W; x += 8) rect(b, x, HORIZON - 26 - r.int(0, 4), 6, 30, hex('#5a4030')) // palisade
  for (let x = 20; x < BG_W; x += r.int(60, 90)) {
    vline(b, x, HORIZON - 70, 50, hex('#2a2018'))
    rect(b, x + 1, HORIZON - 70, 16, 12, hex('#d0d0e0'))
    rect(b, x + 5, HORIZON - 67, 8, 6, hex('#c8962a')) // the Order's sigil
  }
  for (let y = HORIZON; y < BG_H; y++) hline(b, 0, y, BG_W, Math.floor((y - HORIZON) / 7) % 2 ? hex('#5a4a3a') : hex('#665444'))
  for (let i = 0; i < 60; i++) set(b, r.int(0, BG_W - 1), r.int(HORIZON + 2, BG_H - 1), hex('#3a2e24'))
  hline(b, 0, HORIZON, BG_W, hex('#2a2018'))
  return b
}

function crimson(): Bitmap {
  // Act VI: the inflection — a crimson sky over a broken fortress.
  const b = createBitmap(BG_W, BG_H)
  skyGradient(b, hex('#2a0a14'), hex('#c04a3a'), HORIZON)
  const r = seededRand(7070)
  ridge(b, 'crimson-far', 90, 18, hex('#3a141a'), 0.55)
  for (let x = 30; x < BG_W; x += r.int(70, 110)) {
    const h = r.int(30, 60)
    rect(b, x, HORIZON - h, 26, h, hex('#2a1418'))
    for (let i = 0; i < 26; i += 6) rect(b, x + i, HORIZON - h - 5, 4, 5, hex('#2a1418'))
  }
  for (let y = HORIZON; y < BG_H; y++) hline(b, 0, y, BG_W, Math.floor((y - HORIZON) / 8) % 2 ? hex('#3a1a1a') : hex('#442020'))
  for (let i = 0; i < 50; i++) set(b, r.int(0, BG_W - 1), r.int(HORIZON + 2, BG_H - 1), hex('#e8553b'))
  hline(b, 0, HORIZON, BG_W, hex('#1a0a0e'))
  return b
}

function wailingWall(): Bitmap {
  // Act VII: the Wailing Wall — a black crystal cliff that fills the sky.
  const b = createBitmap(BG_W, BG_H)
  skyGradient(b, hex('#06040c'), hex('#2a1e4a'), HORIZON)
  const r = seededRand(8080)
  for (let x = 0; x < BG_W; x += r.int(8, 18)) {
    const h = r.int(60, 112)
    const w = r.int(8, 18)
    for (let i = 0; i < h; i++) hline(b, x + Math.floor(i / 8), HORIZON - i, Math.max(1, w - Math.floor(i / 10)), i % 7 === 0 ? hex('#5a4a9a') : hex('#1a1030'))
  }
  for (let y = HORIZON; y < BG_H; y++) hline(b, 0, y, BG_W, Math.floor((y - HORIZON) / 6) % 2 ? hex('#140e24') : hex('#1a1230'))
  for (let i = 0; i < 70; i++) set(b, r.int(0, BG_W - 1), r.int(HORIZON + 2, BG_H - 1), hex('#8a7ae0'))
  hline(b, 0, HORIZON, BG_W, hex('#06040c'))
  return b
}

function unfinished(): Bitmap {
  // Act VIII: the unfinished floors — the world's texture tearing into void.
  const b = createBitmap(BG_W, BG_H)
  skyGradient(b, hex('#000000'), hex('#1a0a2a'), HORIZON)
  const r = seededRand(9090)
  for (let i = 0; i < 40; i++) {
    const x = r.int(0, BG_W - 40)
    const y = r.int(0, HORIZON - 10)
    rect(b, x, y, r.int(10, 50), r.int(2, 6), r.chance(0.5) ? hex('#ff3aff') : hex('#3affff')) // glitch bars
  }
  for (let y = HORIZON; y < BG_H; y++) {
    for (let x = 0; x < BG_W; x += 16) rect(b, x, y, 16, 1, ((x >> 4) + (y >> 3)) % 2 ? hex('#1a1030') : hex('#0e0a1a')) // grid floor
  }
  hline(b, 0, HORIZON, BG_W, hex('#ff3aff'))
  return b
}

function summit(): Bitmap {
  // F100: above the clouds, the tower's crown.
  const b = createBitmap(BG_W, BG_H)
  skyGradient(b, hex('#1a2a6a'), hex('#f0d8a0'), HORIZON)
  const r = seededRand(100)
  for (let i = 0; i < 12; i++) ellipse(b, r.int(-20, BG_W), r.int(HORIZON - 30, HORIZON), r.int(40, 90), r.int(10, 20), hex('#fff6e0'))
  for (let y = HORIZON; y < BG_H; y++) hline(b, 0, y, BG_W, Math.floor((y - HORIZON) / 8) % 2 ? hex('#d6d2e2') : hex('#c8c2d6'))
  for (let x = 0; x < BG_W; x += 32) vline(b, x, HORIZON, BG_H - HORIZON, hex('#c8a24a'))
  hline(b, 0, HORIZON, BG_W, hex('#8a7a5a'))
  return b
}

export function drawBattleBg(floor: number): Bitmap {
  if (floor >= 1 && floor <= 9) return prairie()
  if (floor === 10) return fallingCity()
  if (floor === 20) return lair()
  if (floor >= 11 && floor <= 19) return ruins()
  if (floor >= 21 && floor <= 30) return swamp()
  if (floor >= 31 && floor <= 35) return coast()
  if (floor >= 36 && floor <= 69) return warCamp()
  if (floor >= 70 && floor <= 79) return crimson()
  if (floor >= 80 && floor <= 89) return wailingWall()
  if (floor === 100) return summit()
  if (floor >= 90 && floor <= 99) return unfinished()
  return depths()
}
