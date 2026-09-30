/**
 * Battle backdrops (384×216), themed by tower band:
 *   F1–9   prairie (goblins, wolves, harpies under an open sky)
 *   F10    the falling city (dusk, burning skyline) — the first anchor wall
 *   F11–19 the ruined city (Act II)
 *   F20    Halgiraf's lair
 *   F21–30 the swamp · F31–35 the drowned coast · F36–69 the Order's war camp
 *   F70–79 the inflection's crimson sky · F80–89 the Wailing Wall
 *   F90–99 the unfinished floors · F100 the summit
 *   anchors: F30 the statue's valley · F50 the Egg's vault · F90 the world's end
 *   other  the tower's stone depths (tournaments)
 *
 * Each backdrop is split into parallax layers (sky → drift → far → mid → ground → fog)
 * so the scene can breathe: clouds and fog drift, far scenery sways a pixel or two,
 * the ground where the units stand stays put. Every layer tiles seamlessly in x
 * (features that cross an edge wrap around), so a wide screen simply repeats the
 * scenery past the 384px canon instead of letterboxing.
 */
import { CLEAR, createBitmap, ellipse, hex, hline, mix, rect, set, vline, type Bitmap, type RGBA } from './bitmap'
import { hashString, seededRand } from './rand'

export const BG_W = 384
export const BG_H = 216
export const HORIZON = 112

/** The parallax stack of one backdrop, back to front. Only `sky` is opaque. */
export interface BattleLayers {
  /** The sky: static, opaque. */
  sky: Bitmap
  /** Clouds / smoke / mist that drift slowly across the sky (tileable). */
  drift: Bitmap | null
  /** Distant scenery: sways a pixel. */
  far: Bitmap | null
  /** Near scenery on the horizon: sways a little more. */
  mid: Bitmap | null
  /** The ground the units stand on (static). */
  ground: Bitmap
  /** Low mist rolling along the horizon, in front of the scenery (tileable). */
  fog: Bitmap | null
}

export type BattleLayerName = keyof BattleLayers
export const LAYER_ORDER: readonly BattleLayerName[] = ['sky', 'drift', 'far', 'mid', 'ground', 'fog']

const blank = () => createBitmap(BG_W, BG_H)

/** Draw a feature three times, one tile left and right, so it wraps at the edges. */
function wrapX(draw: (ox: number) => void): void {
  draw(-BG_W)
  draw(0)
  draw(BG_W)
}

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
  // Below the horizon the sky only shows through gaps; fill it with the last band.
  for (let y = h; y < BG_H; y++) hline(b, 0, y, BG_W, bottom)
}

function sky(top: string, bottom: string): Bitmap {
  const b = blank()
  skyGradient(b, hex(top), hex(bottom), HORIZON)
  return b
}

/** A jagged silhouette from `baseY` down to the horizon, periodic in x (tiles). */
function ridge(b: Bitmap, seed: string, baseY: number, amp: number, color: RGBA, rough = 0.5) {
  const r = seededRand(hashString(seed))
  const ys: number[] = []
  let y = baseY
  for (let x = 0; x <= BG_W; x++) {
    if (x % 6 === 0) y = Math.max(baseY - amp, Math.min(baseY + amp / 3, y + (r.next() - rough) * 6))
    ys.push(y)
  }
  // Tilt the walk so it ends where it began: the seam disappears.
  const drift = ys[BG_W]! - ys[0]!
  for (let x = 0; x < BG_W; x++) {
    const top = Math.round(ys[x]! - (drift * x) / BG_W)
    for (let yy = top; yy < HORIZON + 4; yy++) set(b, x, yy, color)
  }
}

/** Horizontal bands of ground from the horizon down. */
function groundBands(b: Bitmap, period: number, a: string, c: string) {
  for (let y = HORIZON; y < BG_H; y++) hline(b, 0, y, BG_W, Math.floor((y - HORIZON) / period) % 2 ? hex(a) : hex(c))
}

/** A soft cloud: a puffy body, a bright crown and a shaded underside. */
function cloud(b: Bitmap, cx: number, cy: number, w: number, body: string, crown: string, shade: string) {
  wrapX((o) => {
    ellipse(b, cx + o, cy, w, 12, hex(body))
    ellipse(b, cx + o + Math.round(w * 0.3), cy - 6, Math.round(w * 0.6), 12, hex(crown))
    hline(b, cx + o + 4, cy + 10, w - 8, hex(shade))
  })
}

/** A dithered band of haze (every other pixel), for mist, smoke and fog. */
function haze(b: Bitmap, seed: string, y0: number, y1: number, color: string, puffs = 10) {
  const r = seededRand(hashString(seed))
  const c = hex(color)
  for (let i = 0; i < puffs; i++) {
    const cx = r.int(0, BG_W - 1)
    const w = r.int(50, 110)
    const cy = r.int(y0, y1)
    const h = r.int(6, 14)
    wrapX((o) => {
      for (let y = cy; y < cy + h; y++) {
        const k = 1 - Math.abs((y - cy - h / 2) / (h / 2))
        const half = Math.round((w / 2) * Math.sqrt(Math.max(0, k)))
        for (let x = cx + o - half; x < cx + o + half; x++) if ((x + y) % 2 === 0) set(b, x, y, c)
      }
    })
  }
}

function prairie(): BattleLayers {
  const drift = blank()
  const r = seededRand(1234)
  for (let i = 0; i < 6; i++) cloud(drift, r.int(0, BG_W - 1), r.int(8, 50), 44, '#f4f8ff', '#ffffff', '#d0e0f4')
  const far = blank()
  ridge(far, 'mtn', 84, 26, hex('#6a78b0'), 0.5)
  const mid = blank()
  ridge(mid, 'hill', 100, 10, hex('#4a7a6a'), 0.5)
  ridge(mid, 'trees', 108, 6, hex('#2e5a3e'), 0.45)
  const ground = blank()
  // grass field with perspective stripes
  for (let y = HORIZON; y < BG_H; y++) {
    const band = Math.floor(Math.pow((y - HORIZON) / (BG_H - HORIZON), 0.6) * 8)
    hline(ground, 0, y, BG_W, band % 2 ? hex('#4e8e3a') : hex('#5a9a42'))
  }
  hline(ground, 0, HORIZON, BG_W, hex('#3e7a30'))
  // dirt path
  for (let y = HORIZON + 6; y < BG_H; y++) {
    const w = 10 + (y - HORIZON) * 0.9
    const cx = 190 + Math.sin(y / 18) * 12
    hline(ground, Math.round(cx - w / 2), y, Math.round(w), y % 7 === 0 ? hex('#a8844e') : hex('#b8945a'))
  }
  // tufts & flowers
  for (let i = 0; i < 160; i++) {
    const x = r.int(0, BG_W - 2)
    const y = r.int(HORIZON + 4, BG_H - 1)
    const k = r.int(0, 9)
    if (k < 6) {
      set(ground, x, y, hex('#2e6a2a'))
      set(ground, x + 1, y - 1, hex('#2e6a2a'))
    } else set(ground, x, y, [hex('#f4e060'), hex('#f08ac0'), hex('#ffffff')][k % 3]!)
  }
  return { sky: sky('#3a5aa8', '#b8d8f0'), drift, far, mid, ground, fog: null }
}

function fallingCity(): BattleLayers {
  const r = seededRand(99)
  // smoke rolling over the city
  const drift = blank()
  for (let i = 0; i < 7; i++) {
    const fx = r.int(0, BG_W - 1)
    const fy = HORIZON - 70 - r.int(0, 30)
    wrapX((o) => ellipse(drift, fx + o, fy, 40, 20, hex('#3a2a3a')))
  }
  // a hazy far skyline
  const far = blank()
  for (let x = 0; x < BG_W; ) {
    const w = r.int(14, 30)
    const h = r.int(40, 70)
    rect(far, x, HORIZON - h, Math.min(w, BG_W - x), h, hex('#3a1e30'))
    x += w + r.int(0, 3)
  }
  const mid = blank()
  // skyline
  let x = 0
  while (x < BG_W) {
    const w = Math.min(r.int(10, 26), BG_W - x)
    const h = r.int(18, 54)
    rect(mid, x, HORIZON - h, w, h, hex('#1e1224'))
    if (r.chance(0.4) && w > 6) rect(mid, x + Math.floor(w / 2) - 2, HORIZON - h - 10, 4, 10, hex('#1e1224'))
    for (let i = 0; i < 4; i++) if (r.chance(0.5) && w > 5) set(mid, x + r.int(2, w - 3), HORIZON - r.int(4, h - 4), hex('#ffb040'))
    x += w + r.int(0, 4)
  }
  // fires
  for (let i = 0; i < 6; i++) {
    const fx = r.int(10, BG_W - 30)
    ellipse(mid, fx + 8, HORIZON - 10, 10, 12, hex('#e8553b'))
    ellipse(mid, fx + 10, HORIZON - 6, 6, 8, hex('#ffb040'))
  }
  // cobbles
  const ground = blank()
  groundBands(ground, 6, '#4a3e48', '#54464e')
  for (let y = HORIZON + 3; y < BG_H; y += 6) for (let xx = (y % 12) * 2; xx < BG_W; xx += 16) set(ground, xx, y, hex('#2e242e'))
  hline(ground, 0, HORIZON, BG_W, hex('#2e242e'))
  return { sky: sky('#1a0e2a', '#c84a3a'), drift, far, mid, ground, fog: null }
}

function depths(): BattleLayers {
  // distant arches in the dark
  const far = blank()
  for (let x = 40; x < BG_W; x += 64) {
    rect(far, x, 30, 30, HORIZON - 30, hex('#1c1628'))
    ellipse(far, x - 4, 20, 38, 24, hex('#1c1628'))
  }
  // pillars with torches
  const mid = blank()
  for (let x = 16; x < BG_W; x += 64) {
    rect(mid, x, 10, 18, HORIZON - 10, hex('#342a44'))
    rect(mid, x + 2, 10, 4, HORIZON - 10, hex('#443858'))
    rect(mid, x - 3, 6, 24, 6, hex('#443858'))
    ellipse(mid, x + 5, 44, 8, 10, hex('#e8553b55'))
    set(mid, x + 9, 48, hex('#ffb040'))
  }
  const ground = blank()
  groundBands(ground, 8, '#2a2234', '#322840')
  hline(ground, 0, HORIZON, BG_W, hex('#14101c'))
  return { sky: sky('#0e0a16', '#2a2238'), drift: null, far, mid, ground, fog: null }
}

function ruins(): BattleLayers {
  // Act II: a ruined city under an overcast sky — broken colonnades, rubble streets.
  const r = seededRand(2020)
  const drift = blank()
  haze(drift, 'ruin-overcast', 10, 60, '#c0c6d0', 9)
  const far = blank()
  ridge(far, 'ruin-far', 92, 14, hex('#5a6272'), 0.5)
  // broken columns and wall stubs
  const mid = blank()
  for (let x = 6; x < BG_W - 20; x += r.int(34, 58)) {
    const h = r.int(24, 70)
    const w = r.int(10, 16)
    rect(mid, x, HORIZON - h, w, h, hex('#7a7a86'))
    rect(mid, x + 2, HORIZON - h, 2, h, hex('#9a9aa6'))
    rect(mid, x - 2, HORIZON - h - 4, w + 4, 4, hex('#8a8a96'))
    // jagged broken top
    for (let i = 0; i < w; i += 3) rect(mid, x + i, HORIZON - h - 4 - r.int(0, 5), 3, 5, hex('#8a8a96'))
    if (r.chance(0.5)) rect(mid, x + w + 4, HORIZON - r.int(8, 18), r.int(12, 24), 18, hex('#6a6a76'))
  }
  // cracked flagstone street
  const ground = blank()
  groundBands(ground, 7, '#6a665e', '#76726a')
  for (let y = HORIZON + 4; y < BG_H; y += 7) for (let x = (y % 14) * 2; x < BG_W; x += 22) set(ground, x, y, hex('#4a463e'))
  for (let i = 0; i < 90; i++) {
    const x = r.int(0, BG_W - 3)
    const y = r.int(HORIZON + 2, BG_H - 2)
    rect(ground, x, y, r.int(1, 3), 1, hex('#8a867a')) // rubble
    if (r.chance(0.2)) set(ground, x, y - 1, hex('#4e7a3a')) // weeds
  }
  hline(ground, 0, HORIZON, BG_W, hex('#4a463e'))
  return { sky: sky('#3a4458', '#9aa4b0'), drift, far, mid, ground, fog: null }
}

function lair(): BattleLayers {
  // F20: the half black dragon's lair — a vast cavern lit by embers.
  const r = seededRand(20)
  // stalactites
  const far = blank()
  for (let x = 0; x < BG_W; x += r.int(10, 22)) {
    const h = r.int(10, 40)
    for (let i = 0; i < h; i++) hline(far, x + Math.floor(i / 4), i, Math.max(1, 8 - Math.floor(i / 5)), hex('#1e1420'))
  }
  // bone piles + ember glow
  const mid = blank()
  for (let i = 0; i < 5; i++) {
    const x = r.int(10, BG_W - 40)
    ellipse(mid, x, HORIZON - 12, 36, 18, hex('#3a2a2a'))
    for (let k = 0; k < 6; k++) rect(mid, x + r.int(2, 30), HORIZON - r.int(4, 12), r.int(3, 7), 1, hex('#b8ae96'))
  }
  const ground = blank()
  groundBands(ground, 9, '#2a1a1c', '#321e20')
  for (let i = 0; i < 70; i++) set(ground, r.int(0, BG_W - 1), r.int(HORIZON + 2, BG_H - 1), r.chance(0.3) ? hex('#e8553b') : hex('#4a2e2a'))
  hline(ground, 0, HORIZON, BG_W, hex('#140c10'))
  return { sky: sky('#0a060e', '#3a1a1e'), drift: null, far, mid, ground, fog: null }
}

function swamp(): BattleLayers {
  // Act III: a drowned forest — hanging moss, reeds, still green water, low mist.
  const r = seededRand(2121)
  const drift = blank()
  haze(drift, 'swamp-overcast', 6, 50, '#5a6e56', 8)
  const fog = blank()
  haze(fog, 'swamp-mist', HORIZON - 18, HORIZON + 2, '#d0e2c8', 14)
  const far = blank()
  ridge(far, 'swamp-far', 96, 10, hex('#3a4e36'), 0.5)
  const mid = blank()
  for (let x = 4; x < BG_W - 10; x += r.int(26, 44)) {
    const h = r.int(50, 96)
    rect(mid, x, HORIZON - h, r.int(5, 9), h, hex('#2a2418'))
    for (let i = 0; i < 6; i++) rect(mid, x - 6 + r.int(0, 12), HORIZON - h + r.int(0, 30), 2, r.int(8, 18), hex('#5a7a3a')) // moss
  }
  const ground = blank()
  groundBands(ground, 5, '#3a5a3a', '#44663e')
  for (let i = 0; i < 80; i++) {
    const x = r.int(0, BG_W - 2)
    const y = r.int(HORIZON + 2, BG_H - 4)
    rect(ground, x, y - 4, 1, 5, hex('#6a8a4a')) // reeds
    if (r.chance(0.2)) set(ground, x + 1, y - 5, hex('#c8a04a'))
  }
  hline(ground, 0, HORIZON, BG_W, hex('#1e2a1e'))
  return { sky: sky('#2a3a2a', '#8aa07a'), drift, far, mid, ground, fog }
}

function coast(): BattleLayers {
  // Act IV: a drowned coast — a storm sea, a sunken temple on the horizon.
  const r = seededRand(3535)
  const drift = blank()
  for (let i = 0; i < 6; i++) cloud(drift, r.int(0, BG_W - 1), r.int(4, 40), 60, '#34425e', '#46587a', '#26324a')
  const far = blank()
  rect(far, 250, 60, 70, HORIZON - 60, hex('#3a4a5a'))
  for (let x = 254; x < 316; x += 12) rect(far, x, 52, 6, HORIZON - 52, hex('#4a5a6a'))
  rect(far, 244, 48, 82, 6, hex('#5a6a7a'))
  const mid = blank()
  for (let x = 0; x < BG_W; x += 2) set(mid, x, HORIZON - 1 - ((x >> 3) % 2), hex('#4a7a9a')) // swell on the horizon
  const ground = blank()
  groundBands(ground, 4, '#1e4a6a', '#2a5a7a')
  for (let i = 0; i < 90; i++) hline(ground, r.int(0, BG_W - 8), r.int(HORIZON + 1, BG_H - 1), r.int(3, 8), hex('#7ab8d8')) // foam
  hline(ground, 0, HORIZON, BG_W, hex('#0e2a3a'))
  const fog = blank()
  haze(fog, 'coast-spray', HORIZON - 12, HORIZON + 6, '#c8dcec', 10)
  return { sky: sky('#1e2a44', '#6a8aa8'), drift, far, mid, ground, fog }
}

function warCamp(): BattleLayers {
  // Act V: the Order's war — banners, palisades, smoke under a grey sky.
  const r = seededRand(4040)
  const drift = blank()
  haze(drift, 'war-smoke', 16, 70, '#5a5652', 10)
  const far = blank()
  ridge(far, 'war-far', 94, 12, hex('#5a5652'), 0.5)
  const mid = blank()
  for (let x = 0; x < BG_W; x += 8) rect(mid, x, HORIZON - 26 - r.int(0, 4), 6, 30, hex('#5a4030')) // palisade
  for (let x = 20; x < BG_W - 20; x += r.int(60, 90)) {
    vline(mid, x, HORIZON - 70, 50, hex('#2a2018'))
    rect(mid, x + 1, HORIZON - 70, 16, 12, hex('#d0d0e0'))
    rect(mid, x + 5, HORIZON - 67, 8, 6, hex('#c8962a')) // the Order's sigil
  }
  const ground = blank()
  groundBands(ground, 7, '#5a4a3a', '#665444')
  for (let i = 0; i < 60; i++) set(ground, r.int(0, BG_W - 1), r.int(HORIZON + 2, BG_H - 1), hex('#3a2e24'))
  hline(ground, 0, HORIZON, BG_W, hex('#2a2018'))
  return { sky: sky('#3a3a44', '#a09a94'), drift, far, mid, ground, fog: null }
}

function crimson(): BattleLayers {
  // Act VI: the inflection — a crimson sky over a broken fortress.
  const r = seededRand(7070)
  const drift = blank()
  haze(drift, 'crimson-streaks', 8, 56, '#7a1e22', 9)
  const far = blank()
  ridge(far, 'crimson-far', 90, 18, hex('#3a141a'), 0.55)
  const mid = blank()
  for (let x = 30; x < BG_W - 30; x += r.int(70, 110)) {
    const h = r.int(30, 60)
    rect(mid, x, HORIZON - h, 26, h, hex('#2a1418'))
    for (let i = 0; i < 26; i += 6) rect(mid, x + i, HORIZON - h - 5, 4, 5, hex('#2a1418'))
  }
  const ground = blank()
  groundBands(ground, 8, '#3a1a1a', '#442020')
  for (let i = 0; i < 50; i++) set(ground, r.int(0, BG_W - 1), r.int(HORIZON + 2, BG_H - 1), hex('#e8553b'))
  hline(ground, 0, HORIZON, BG_W, hex('#1a0a0e'))
  return { sky: sky('#2a0a14', '#c04a3a'), drift, far, mid, ground, fog: null }
}

function crystalCliff(b: Bitmap, r: ReturnType<typeof seededRand>, lo: number, hi: number, body: string, glint: string) {
  for (let x = 0; x < BG_W; x += r.int(8, 18)) {
    const h = r.int(lo, hi)
    const w = r.int(8, 18)
    wrapX((o) => {
      for (let i = 0; i < h; i++) hline(b, x + o + Math.floor(i / 8), HORIZON - i, Math.max(1, w - Math.floor(i / 10)), i % 7 === 0 ? hex(glint) : hex(body))
    })
  }
}

function wailingWall(): BattleLayers {
  // Act VII: the Wailing Wall — a black crystal cliff that fills the sky.
  const r = seededRand(8080)
  const far = blank()
  crystalCliff(far, r, 80, 112, '#120a24', '#2e2458')
  const mid = blank()
  crystalCliff(mid, r, 40, 90, '#1a1030', '#5a4a9a')
  const ground = blank()
  groundBands(ground, 6, '#140e24', '#1a1230')
  for (let i = 0; i < 70; i++) set(ground, r.int(0, BG_W - 1), r.int(HORIZON + 2, BG_H - 1), hex('#8a7ae0'))
  hline(ground, 0, HORIZON, BG_W, hex('#06040c'))
  return { sky: sky('#06040c', '#2a1e4a'), drift: null, far, mid, ground, fog: null }
}

function unfinished(): BattleLayers {
  // Act VIII: the unfinished floors — the world's texture tearing into void.
  const r = seededRand(9090)
  const far = blank()
  for (let i = 0; i < 40; i++) {
    const x = r.int(0, BG_W - 1)
    const y = r.int(0, HORIZON - 10)
    const w = r.int(10, 50)
    const h = r.int(2, 6)
    const c = r.chance(0.5) ? hex('#ff3aff') : hex('#3affff') // glitch bars
    wrapX((o) => rect(far, x + o, y, w, h, c))
  }
  const ground = blank()
  for (let y = HORIZON; y < BG_H; y++) {
    for (let x = 0; x < BG_W; x += 16) rect(ground, x, y, 16, 1, ((x >> 4) + (y >> 3)) % 2 ? hex('#1a1030') : hex('#0e0a1a')) // grid floor
  }
  hline(ground, 0, HORIZON, BG_W, hex('#ff3aff'))
  return { sky: sky('#000000', '#1a0a2a'), drift: null, far, mid: null, ground, fog: null }
}

function summit(): BattleLayers {
  // F100: above the clouds, the tower's crown.
  const r = seededRand(100)
  const drift = blank()
  for (let i = 0; i < 12; i++) {
    const x = r.int(0, BG_W - 1)
    const y = r.int(HORIZON - 30, HORIZON)
    const w = r.int(40, 90)
    const h = r.int(10, 20)
    wrapX((o) => ellipse(drift, x + o, y, w, h, hex('#fff6e0')))
  }
  const ground = blank()
  groundBands(ground, 8, '#d6d2e2', '#c8c2d6')
  for (let x = 0; x < BG_W; x += 32) vline(ground, x, HORIZON, BG_H - HORIZON, hex('#c8a24a'))
  hline(ground, 0, HORIZON, BG_W, hex('#8a7a5a'))
  return { sky: sky('#1a2a6a', '#f0d8a0'), drift, far: null, mid: null, ground, fog: null }
}

function statueRuins(): BattleLayers {
  // F30: the ancient stone statue's valley — a colossal broken figure against a green dusk.
  const L = swamp()
  const far = L.far ?? blank()
  const stone = hex('#7a7a72')
  rect(far, 250, 20, 60, HORIZON - 20, stone)
  rect(far, 262, 4, 36, 22, stone) // head
  rect(far, 270, 12, 6, 4, hex('#ff5a3a')) // the eye beam
  rect(far, 286, 12, 6, 4, hex('#ff5a3a'))
  rect(far, 236, 40, 16, 50, stone) // arms
  rect(far, 308, 40, 16, 50, stone)
  for (let y = 24; y < HORIZON; y += 9) hline(far, 250, y, 60, hex('#5e5e58'))
  return { ...L, far }
}

function eggChamber(): BattleLayers {
  // F50: a fleshy vault where the Egg pulses.
  const r = seededRand(5050)
  const s = sky('#1a060e', '#4a1a2a')
  for (let i = 0; i < 18; i++) {
    const x = r.int(0, BG_W)
    for (let y = 0; y < HORIZON; y += 2) set(s, (x + Math.round(Math.sin(y / 9) * 4) + BG_W) % BG_W, y, hex('#6a2a3a')) // veins
  }
  const far = blank()
  ellipse(far, 150, 30, 84, 70, hex('#3a0e1e'))
  const ground = blank()
  groundBands(ground, 6, '#2a0a16', '#34101c')
  hline(ground, 0, HORIZON, BG_W, hex('#14040a'))
  return { sky: s, drift: null, far, mid: null, ground, fog: null }
}

function worldsEnd(): BattleLayers {
  // F90: the top of the unfinished tower; far below, the world burns.
  const r = seededRand(9000)
  const far = blank()
  for (let i = 0; i < 140; i++) set(far, r.int(0, BG_W - 1), r.int(HORIZON - 30, HORIZON), r.chance(0.5) ? hex('#ff7a2a') : hex('#e8e05a'))
  const drift = blank()
  for (let i = 0; i < 30; i++) {
    const x = r.int(0, BG_W - 1)
    const y = r.int(0, HORIZON - 40)
    const w = r.int(6, 30)
    wrapX((o) => rect(drift, x + o, y, w, 2, hex('#ff3aff'))) // the sky tearing
  }
  const ground = blank()
  groundBands(ground, 8, '#1a1030', '#140c24')
  hline(ground, 0, HORIZON, BG_W, hex('#ff3aff'))
  return { sky: sky('#000000', '#6a1a0e'), drift, far, mid: null, ground, fog: null }
}

/** Which backdrop a floor uses (also the cache key for its layers). */
export function bgTheme(floor: number): string {
  if (floor >= 1 && floor <= 9) return 'prairie'
  if (floor === 10) return 'fallingCity'
  if (floor === 20) return 'lair'
  if (floor === 30) return 'statue'
  if (floor === 50) return 'egg'
  if (floor === 90) return 'worldsEnd'
  if (floor >= 11 && floor <= 19) return 'ruins'
  if (floor >= 21 && floor <= 30) return 'swamp'
  if (floor >= 31 && floor <= 35) return 'coast'
  if (floor >= 36 && floor <= 69) return 'war'
  if (floor >= 70 && floor <= 79) return 'crimson'
  if (floor >= 80 && floor <= 89) return 'wall'
  if (floor === 100) return 'summit'
  if (floor >= 90 && floor <= 99) return 'unfinished'
  return 'depths'
}

const THEMES: Record<string, () => BattleLayers> = {
  prairie,
  fallingCity,
  lair,
  statue: statueRuins,
  egg: eggChamber,
  worldsEnd,
  ruins,
  swamp,
  coast,
  war: warCamp,
  crimson,
  wall: wailingWall,
  summit,
  unfinished,
  depths,
}

/** The parallax layers of the backdrop for `floor`. */
export function drawBattleLayers(floor: number): BattleLayers {
  return (THEMES[bgTheme(floor)] ?? depths)()
}

/** The whole backdrop flattened into one bitmap (thumbnails, tests). */
export function drawBattleBg(floor: number): Bitmap {
  const L = drawBattleLayers(floor)
  const out = createBitmap(BG_W, BG_H)
  for (const name of LAYER_ORDER) {
    const layer = L[name]
    if (!layer) continue
    for (let i = 0; i < layer.px.length; i++) {
      const c = layer.px[i]!
      if (c === CLEAR) continue
      const a = c & 255
      out.px[i] = a === 255 ? c : ((mix(out.px[i]!, c | 255, a / 255) & 0xffffff00) | 255) >>> 0
    }
  }
  return out
}
