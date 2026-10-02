/**
 * Boss sprites at native resolution (lane I): the anchor bosses and raid bosses drawn as
 * set pieces, two to three times a hero's height, instead of hero-sized figures or
 * nearest-neighbour upscales. Side view, facing RIGHT toward the party, like every foe.
 *
 * Each drawer takes the idle frame (0 or 1): on frame 1 the body breathes a pixel lower,
 * capes and hair sway, wings and auras shift — the two frames alternate on the stage.
 * Pure: shapes are hand-placed geometry shaded by `shape.paint`, flecks seeded through
 * `rand.ts`, then the universal ink outline.
 */
import { createBitmap, hex, hline, line, mix, outline, rect, set, vline, withAlpha, type Bitmap, type RGBA } from './bitmap'
import { BONE, GOLD, INK, LEATHER, STEEL, ramp, type Ramp } from './palette'
import { hashString, seededRand } from './rand'
import { arc, disc, paint, poly, thick, type Pt } from './shape'

export type IdleFrame = 0 | 1

const FAIR = ramp('#b87450', '#e3a878', '#f6c79c')
const PALE = ramp('#8a7a88', '#d4c4c8', '#f0e4e8')
const SILVER = ramp('#5e6278', '#b8bcd0', '#f0f2ff')
const IRON_RED = ramp('#4a0c10', '#8e1a1e', '#d0403a')
const DARK_PLATE = ramp('#120c18', '#2e2440', '#62527e')
const BLACK_CLOTH = ramp('#0a080e', '#1e1a28', '#3a3448')
const BLOOD_CAPE = ramp('#3a0a14', '#6a1424', '#a02a3a')
const ROYAL = ramp('#141c4a', '#24347a', '#4a62b0')
const RED_EYE = hex('#ff3a2e')
const WHITE = hex('#fff6e0')

/** The far side of a figure: the same material a step into shadow. */
const far = (r: Ramp): Ramp => ({ d: mix(r.d, INK, 0.3), m: mix(r.m, r.d, 0.5), l: r.m })

/** Shift every y of a point list (the breath of the upper body). */
const dy = (pts: readonly Pt[], d: number): Pt[] => pts.map(([x, y]) => [x, y + d] as Pt)
const P = (...xy: number[]): Pt[] => {
  const out: Pt[] = []
  for (let i = 0; i + 1 < xy.length; i += 2) out.push([xy[i]!, xy[i + 1]!])
  return out
}

/** A side-on head facing right: skin, ear, an eye, a nose that breaks the outline. */
function head(b: Bitmap, x: number, y: number, skin: Ramp, eye: RGBA, opts: { w?: number; h?: number; brow?: boolean } = {}) {
  const w = opts.w ?? 10
  const h = opts.h ?? 11
  paint(b, (m) => poly(m, P(x + 1, y, x + w - 2, y, x + w, y + 3, x + w, y + h - 4, x + w - 2, y + h - 1, x + 3, y + h, x, y + h - 4, x, y + 2), 1), skin)
  set(b, x + w + 1, y + h - 5, skin.m) // nose
  set(b, x + w, y + h - 4, skin.d)
  set(b, x + w - 2, y + h - 6, eye) // eye
  set(b, x + w - 3, y + h - 6, INK)
  if (opts.brow !== false) hline(b, x + w - 4, y + h - 8, 3, INK)
  set(b, x + w - 1, y + h - 2, skin.d) // mouth
  set(b, x + 3, y + h - 6, skin.d) // ear
  set(b, x + 3, y + h - 5, skin.d)
}

/** A long straight blade from the hand (hx, hy) toward (tx, ty), with a crossguard. */
function blade(b: Bitmap, hx: number, hy: number, tx: number, ty: number, metal: Ramp, guard: Ramp, w = 2) {
  thick(b, hx, hy, tx, ty, w, metal.m)
  line(b, hx + (tx > hx ? 1 : -1), hy - 1, tx, ty - (w > 2 ? 1 : 0), metal.l)
  line(b, hx, hy + (w > 2 ? 1 : 0), tx - 1, ty + 1, metal.d)
  set(b, tx, ty, WHITE)
  // the guard crosses the blade at right angles near the hand
  const gx = Math.sign(tx - hx)
  const gy = Math.sign(ty - hy)
  thick(b, hx + gx * 2 - gy * 3, hy + gy * 2 + gx * 3, hx + gx * 2 + gy * 3, hy + gy * 2 - gx * 3, 2, guard.m)
  set(b, hx + gx * 2, hy + gy * 2, guard.l)
  thick(b, hx - gx * 2, hy - gy * 2, hx, hy, 2, LEATHER.d) // the grip
  set(b, hx - gx * 3, hy - gy * 3, guard.l) // pommel
}

/** A cape hanging behind the shoulders, its hem swaying with the frame. */
function cape(b: Bitmap, sx: number, sy: number, len: number, back: number, outer: Ramp, inner: Ramp | null, f: IdleFrame) {
  const sway = f === 1 ? -1 : 0
  const hem = sy + len
  const pts = P(sx + 4, sy, sx - 1, sy + 2, sx - back + sway, hem - 4, sx - back - 2 + sway, hem, sx - back + 6 + sway, hem - 1, sx - 2, hem + 1, sx + 6, hem - 2, sx + 6, sy + 6)
  paint(b, (m) => poly(m, pts, 1), outer, { light: 'right', rim: 2 })
  // folds
  for (let i = 1; i <= 2; i++) line(b, sx - i * 3, sy + 6, sx - back + i * 3 + sway, hem - 2, outer.d)
  if (inner) poly(b, P(sx + 1, hem - 10, sx - 2, hem + 1, sx + 6, hem - 2, sx + 6, hem - 10), inner.m)
}

/** An armoured leg from the hip down: thigh, knee cop, greave, sabaton (toe forward). */
function plateLeg(b: Bitmap, hx: number, hy: number, fx: number, groundY: number, metal: Ramp, w: number) {
  const knee = Math.round((hy + groundY) / 2)
  const kx = Math.round((hx + fx) / 2)
  paint(b, (m) => {
    thick(m, hx, hy, kx, knee, w, 1)
    thick(m, kx, knee, fx, groundY - 3, w - 1, 1)
    poly(m, P(fx - Math.floor(w / 2), groundY - 4, fx + w + 2, groundY - 2, fx + w + 3, groundY, fx - Math.floor(w / 2), groundY), 1)
  }, metal)
  disc(b, kx + 1, knee, 2, metal.l) // knee cop
  set(b, kx + 1, knee, WHITE)
}

/** A pauldron: a domed plate over the shoulder with a trim line. */
function pauldron(b: Bitmap, cx: number, cy: number, r: number, metal: Ramp, trim: Ramp | null) {
  paint(b, (m) => {
    disc(m, cx, cy, r, 1)
    rect(m, cx - r, cy, r * 2 + 1, Math.ceil(r / 2), 1)
  }, metal)
  if (trim) hline(b, cx - r, cy + Math.ceil(r / 2), r * 2 + 1, trim.m)
}

/** A kite shield seen side-on (held on the far arm): its face, rim and emblem. */
function kite(b: Bitmap, x: number, y: number, w: number, h: number, face: Ramp, rim: Ramp, emblem: RGBA) {
  paint(b, (m) => poly(m, P(x, y, x + w, y, x + w, y + Math.round(h * 0.55), x + Math.round(w / 2), y + h, x, y + Math.round(h * 0.55)), 1), face)
  line(b, x, y, x + w, y, rim.l)
  line(b, x + w, y, x + w, y + Math.round(h * 0.55), rim.m)
  const cx = x + Math.round(w / 2)
  vline(b, cx, y + 2, h - 5, emblem)
  hline(b, cx - 2, y + 5, 5, emblem)
}

/** Paint a small seeded sprinkle of pixels (sparks, motes) within a box. */
function sprinkle(b: Bitmap, seed: string, x: number, y: number, w: number, h: number, n: number, colors: readonly RGBA[]) {
  const r = seededRand(hashString(seed))
  for (let i = 0; i < n; i++) set(b, x + r.int(0, w - 1), y + r.int(0, h - 1), r.pick(colors))
}

// ─────────────────────────────────────────────────────────────────────────────
// El Cid, the Fallen Ranker (F60, a raid boss): white plate, a gold cape, a plumed helm,
// a long blade carried low and forward, the shield of his old rank slung at his back.
// ─────────────────────────────────────────────────────────────────────────────

export function drawElCid(f: IdleFrame): Bitmap {
  const W = 56
  const H = 68
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f // the breath
  const plume = ramp('#7a1a2a', '#c8304a', '#ff7a8a')
  // the old shield on his back
  kite(b, 9, 24 + br, 10, 18, ramp('#8a8aa0', '#d0d0e0', '#ffffff'), GOLD, GOLD.m)
  cape(b, 21, 24 + br, 36, 14, GOLD, ROYAL, f)
  // far arm (behind)
  paint(b, (m) => thick(m, 22, 26 + br, 21, 37 + br, 4, 1), far(SILVER))
  // legs
  plateLeg(b, 23, 44, 20, g, far(SILVER), 5)
  plateLeg(b, 29, 44, 32, g, SILVER, 6)
  // faulds: a white skirt of plates with a gold hem
  paint(b, (m) => poly(m, P(19, 39 + br, 34, 39 + br, 36, 47, 18, 47), 1), ramp('#8a8aa0', '#e0e0ec', '#ffffff'))
  hline(b, 18, 46, 19, GOLD.m)
  vline(b, 27, 40 + br, 6, SILVER.d)
  // breastplate
  paint(b, (m) => poly(m, dy(P(19, 24, 33, 23, 36, 30, 34, 40, 20, 40, 18, 32), br), 1), SILVER, { rim: 2 })
  line(b, 30, 25 + br, 34, 31 + br, WHITE) // the plate's gleam
  hline(b, 20, 40 + br, 15, GOLD.d) // belt
  hline(b, 20, 39 + br, 15, GOLD.m)
  rect(b, 26, 38 + br, 3, 3, GOLD.l) // buckle
  // the rank's star on his chest
  set(b, 29, 30 + br, GOLD.l)
  hline(b, 28, 31 + br, 3, GOLD.m)
  set(b, 29, 32 + br, GOLD.d)
  // gorget + head
  paint(b, (m) => rect(m, 23, 20 + br, 8, 4, 1), SILVER)
  head(b, 22, 10 + br, FAIR, hex('#2a6ab8'), { w: 10, h: 11 })
  // plumed helm: a skull cap, cheek guard, the visor up, a long plume streaming back
  paint(b, (m) => poly(m, dy(P(21, 9, 30, 7, 34, 10, 34, 13, 22, 14, 20, 12), br), 1), SILVER)
  paint(b, (m) => poly(m, dy(P(21, 13, 25, 13, 25, 20, 22, 21, 20, 17), br), 1), SILVER)
  hline(b, 23, 13 + br, 11, GOLD.m)
  const pl = f === 1 ? 1 : 0
  paint(b, (m) => poly(m, dy(P(26, 7, 30, 4, 25, 3, 16, 6 + pl, 9, 12 + pl, 7, 17 + pl, 14, 14, 21, 10), br), 1), plume, { light: 'right' })
  line(b, 25, 4 + br, 12, 11 + br + pl, plume.l)
  // near arm: pauldron, the arm bent forward, the blade carried low and forward
  pauldron(b, 29, 25 + br, 4, SILVER, GOLD)
  paint(b, (m) => {
    thick(m, 30, 28 + br, 33, 35 + br, 4, 1)
    thick(m, 33, 35 + br, 38, 39 + br, 4, 1)
  }, SILVER)
  rect(b, 37, 38 + br, 3, 3, GOLD.m) // gauntlet cuff
  blade(b, 40, 40 + br, 54, 18 + br, ramp('#7a84a8', '#d8deee', '#ffffff'), GOLD, 3)
  return outline(b, INK)
}

// ─────────────────────────────────────────────────────────────────────────────
// Valention of Iron Blood (F40): a wall of crimson plate. A closed great helm with a red
// crest and a burning eye-slit, a tower shield held forward, a greatsword on his shoulder.
// ─────────────────────────────────────────────────────────────────────────────

export function drawValention(f: IdleFrame): Bitmap {
  const W = 62
  const H = 72
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f
  cape(b, 22, 25 + br, 40, 16, IRON_RED, BLACK_CLOTH, f)
  // the greatsword over his shoulder (behind the head, the blade raking back)
  blade(b, 36, 34 + br, 6, 6 + br, ramp('#4a4a5a', '#9a9aae', '#e0e0ee'), GOLD, 4)
  // far arm and legs
  paint(b, (m) => thick(m, 24, 28 + br, 30, 40 + br, 5, 1), far(IRON_RED))
  plateLeg(b, 24, 47, 20, g, far(IRON_RED), 6)
  plateLeg(b, 31, 47, 35, g, IRON_RED, 7)
  // a mail skirt under the plate
  paint(b, (m) => poly(m, P(18, 42 + br, 37, 42 + br, 39, 51, 17, 51), 1), STEEL)
  for (let x = 18; x < 39; x += 2) set(b, x, 49, STEEL.d)
  // the breastplate: broad, ridged, trimmed in gold
  paint(b, (m) => poly(m, dy(P(17, 25, 35, 24, 39, 31, 37, 43, 19, 43, 16, 33), br), 1), IRON_RED, { rim: 2 })
  line(b, 28, 25 + br, 30, 42 + br, IRON_RED.d) // the ridge
  line(b, 31, 26 + br, 36, 33 + br, IRON_RED.l)
  hline(b, 18, 43 + br, 20, GOLD.m)
  hline(b, 17, 25 + br, 18, GOLD.d)
  // the great helm: a bucket of iron with a crest and a slit that burns
  paint(b, (m) => poly(m, dy(P(20, 9, 32, 8, 35, 12, 35, 23, 21, 24, 19, 14), br), 1), IRON_RED, { rim: 2 })
  hline(b, 27, 15 + br, 8, INK)
  hline(b, 30, 15 + br, 4, RED_EYE)
  set(b, 33, 15 + br, hex('#ffd0a0'))
  for (let y = 18; y < 22; y += 2) hline(b, 31, y + br, 3, IRON_RED.d) // breaths
  vline(b, 26, 9 + br, 14, GOLD.m)
  const crest = ramp('#5a0a0a', '#a01414', '#e04040')
  paint(b, (m) => poly(m, dy(P(22, 9, 33, 7, 31, 3, 23, 2 + f, 14, 4 + f, 18, 8), br), 1), crest)
  // the tower shield, held forward on the far arm
  const sx = 37
  const sy = 27 + br
  paint(b, (m) => poly(m, P(sx, sy, sx + 11, sy - 1, sx + 12, sy + 26, sx + 6, sy + 30, sx, sy + 26), 1), ramp('#3a0808', '#6a1010', '#9a2020'), { rim: 1 })
  line(b, sx, sy, sx + 11, sy - 1, GOLD.l)
  vline(b, sx + 12, sy, 26, GOLD.m)
  vline(b, sx, sy + 1, 25, GOLD.d)
  // the iron-blood drop on the shield
  disc(b, sx + 6, sy + 15, 3, IRON_RED.l)
  poly(b, P(sx + 4, sy + 14, sx + 6, sy + 8, sx + 8, sy + 14), IRON_RED.l)
  set(b, sx + 7, sy + 14, WHITE)
  // near arm: a pauldron like a bell, the gauntlet gripping the hilt at his chest
  pauldron(b, 30, 27 + br, 5, IRON_RED, GOLD)
  paint(b, (m) => {
    thick(m, 31, 31 + br, 31, 38 + br, 5, 1)
    thick(m, 31, 38 + br, 35, 35 + br, 5, 1)
  }, IRON_RED)
  rect(b, 34, 33 + br, 4, 4, STEEL.m)
  return outline(b, INK)
}

// ─────────────────────────────────────────────────────────────────────────────
// Pryos Al Ragna (F80, a raid boss): the Wall's commander. Black plate trimmed in gold,
// a long black mane, a crimson-lined cape, the Ragna Blade held low with a red edge, and a
// broken seal turning behind him.
// ─────────────────────────────────────────────────────────────────────────────

export function drawPryos(f: IdleFrame): Bitmap {
  const W = 60
  const H = 72
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f
  // the seal behind him: a dark-red ring with runes, one arc broken
  const seal = hex('#8a1a2a')
  arc(b, 24, 30, 21, withAlpha(seal, 0xb0), 0.08 + f * 0.04, 0.92 + f * 0.04)
  arc(b, 24, 30, 18, withAlpha(seal, 0x70), 0.55, 1.45)
  for (let i = 0; i < 8; i++) {
    const a = ((i + f * 0.5) / 8) * Math.PI * 2
    set(b, Math.round(24 + Math.cos(a) * 21), Math.round(30 + Math.sin(a) * 21), hex('#ff5a5a'))
  }
  cape(b, 22, 25 + br, 40, 15, BLACK_CLOTH, BLOOD_CAPE, f)
  line(b, 20, 28 + br, 8, 62, BLOOD_CAPE.m) // the cape's red lining shows at its edge
  line(b, 19, 29 + br, 7, 62, BLOOD_CAPE.l)
  // the mane, streaming down his back
  const hair = ramp('#06040a', '#1a1424', '#3a3048')
  paint(b, (m) => poly(m, dy(P(25, 8, 18, 10, 14, 18, 13 - f, 32, 16 - f, 38, 20, 30, 22, 20, 26, 14), br), 1), hair, { light: 'right' })
  // far arm, legs
  paint(b, (m) => thick(m, 24, 28 + br, 23, 39 + br, 4, 1), far(DARK_PLATE))
  plateLeg(b, 24, 46, 21, g, far(DARK_PLATE), 5)
  plateLeg(b, 30, 46, 33, g, DARK_PLATE, 6)
  // a long armoured coat skirt split at the front
  paint(b, (m) => poly(m, P(18, 41 + br, 35, 41 + br, 37, 55, 31, 56, 27, 47, 23, 56, 17, 55), 1), BLACK_CLOTH)
  vline(b, 27, 46, 9, GOLD.d)
  // the cuirass
  paint(b, (m) => poly(m, dy(P(19, 24, 33, 23, 36, 30, 34, 42, 20, 42, 18, 32), br), 1), DARK_PLATE, { rim: 2 })
  line(b, 21, 25 + br, 33, 25 + br, GOLD.m)
  line(b, 26, 26 + br, 29, 38 + br, GOLD.d) // gold filigree down the front
  set(b, 30, 31 + br, GOLD.l)
  hline(b, 20, 41 + br, 15, BLOOD_CAPE.m) // the red sash
  vline(b, 21, 42 + br, 5, BLOOD_CAPE.d)
  // head: pale, red-eyed, the circlet of the Wall
  paint(b, (m) => rect(m, 24, 20 + br, 7, 5, 1), DARK_PLATE)
  head(b, 23, 10 + br, PALE, RED_EYE, { w: 10, h: 11 })
  paint(b, (m) => poly(m, dy(P(23, 9, 31, 8, 34, 11, 33, 13, 26, 12, 24, 15, 22, 13), br), 1), hair)
  hline(b, 23, 12 + br, 10, GOLD.m)
  set(b, 32, 12 + br, hex('#ff5a5a'))
  hline(b, 30, 19 + br, 2, PALE.d) // a thin mouth
  // near arm and the Ragna Blade, held low and forward, its edge burning red
  pauldron(b, 30, 26 + br, 4, DARK_PLATE, GOLD)
  paint(b, (m) => {
    thick(m, 31, 29 + br, 33, 36 + br, 4, 1)
    thick(m, 33, 36 + br, 37, 40 + br, 4, 1)
  }, DARK_PLATE)
  blade(b, 39, 41 + br, 57, 62, ramp('#1a1020', '#3a2a48', '#6a5a80'), GOLD, 3)
  line(b, 41, 44 + br, 57, 63 - (f ? 0 : 1), f ? hex('#ff7a6a') : hex('#e03a3a')) // the edge
  return outline(b, INK)
}

// ─────────────────────────────────────────────────────────────────────────────
// Versace of Silver Lightning (F41): lean and quick, a mane of silver, a pale long coat,
// two knives — one low and forward, one cocked behind — and lightning crawling over him.
// ─────────────────────────────────────────────────────────────────────────────

export function drawVersace(f: IdleFrame): Bitmap {
  const W = 54
  const H = 64
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f
  const coat = ramp('#5a5a72', '#a8a8c0', '#e8e8f8')
  const hair = ramp('#7a7a92', '#c8c8dc', '#ffffff')
  const zap = hex('#7af0ff')
  const wind = ramp('#1a6e3e', '#4fcf8a', '#b0ffcc')
  // the mane: long, swept back by his own speed
  paint(b, (m) => poly(m, dy(P(25, 7, 15, 8, 6, 12 + f, 2, 18 + f, 9, 17, 4, 24 + f, 13, 21, 15, 28, 21, 21, 25, 14), br), 1), hair, { light: 'right' })
  // far arm, cocked back with the second knife
  paint(b, (m) => {
    thick(m, 22, 25 + br, 17, 31 + br, 3, 1)
    thick(m, 17, 31 + br, 14, 26 + br, 3, 1)
  }, far(coat))
  thick(b, 14, 25 + br, 9, 18 + br, 2, STEEL.l)
  set(b, 8, 17 + br, WHITE)
  // long legs in a fencer's stance
  paint(b, (m) => {
    thick(m, 23, 40, 18, 51, 4, 1)
    thick(m, 18, 51, 15, g - 2, 3, 1)
  }, far(BLACK_CLOTH))
  paint(b, (m) => {
    thick(m, 27, 40, 33, 50, 4, 1)
    thick(m, 33, 50, 35, g - 2, 3, 1)
  }, BLACK_CLOTH)
  rect(b, 12, g - 2, 6, 3, LEATHER.d)
  rect(b, 33, g - 2, 7, 3, LEATHER.m)
  // the long coat, its tails flying
  paint(b, (m) => poly(m, dy(P(20, 22, 30, 21, 33, 28, 31, 40, 33, 50, 27, 46, 22, 52 - f, 12, 50, 18, 40, 18, 30), br), 1), coat, { rim: 2 })
  rect(b, 26, 23 + br, 4, 14, BLACK_CLOTH.m) // the dark vest under the open coat
  vline(b, 29, 23 + br, 14, BLACK_CLOTH.l)
  line(b, 30, 23 + br, 30, 38 + br, wind.m) // the green trim
  hline(b, 20, 37 + br, 12, LEATHER.m) // belt
  // head
  head(b, 23, 9 + br, FAIR, zap, { w: 9, h: 10 })
  paint(b, (m) => poly(m, dy(P(22, 8, 30, 7, 33, 10, 32, 12, 27, 11, 24, 14, 22, 12), br), 1), hair)
  // near arm: the knife held low and forward in a reverse grip
  paint(b, (m) => {
    thick(m, 29, 25 + br, 33, 31 + br, 3, 1)
    thick(m, 33, 31 + br, 38, 33 + br, 3, 1)
  }, coat)
  rect(b, 38, 32 + br, 2, 2, FAIR.m)
  thick(b, 40, 33 + br, 45, 37 + br, 2, STEEL.l)
  set(b, 46, 38 + br, WHITE)
  // lightning crawling over him (it moves between the frames)
  const r = seededRand(hashString(`versace${f}`))
  for (let k = 0; k < 3; k++) {
    let x = r.int(10, 44)
    let y = r.int(14, 50)
    for (let s = 0; s < 5; s++) {
      const nx = x + r.int(-2, 2)
      const ny = y + r.int(1, 3)
      line(b, x, y, nx, ny, s % 2 ? zap : WHITE)
      x = nx
      y = ny
    }
  }
  return outline(b, INK)
}

// ─────────────────────────────────────────────────────────────────────────────
// Darkan of Destruction (F42): a hulk in black-violet plate, a horned helm with eyes like
// coals, spikes on every edge, a spiked maul resting its head on the floor before him.
// ─────────────────────────────────────────────────────────────────────────────

export function drawDarkan(f: IdleFrame): Bitmap {
  const W = 66
  const H = 72
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f
  const plate = ramp('#140a1c', '#33204a', '#664a8a')
  const rag = ramp('#12081a', '#2a1238', '#4a2a5a')
  cape(b, 20, 26 + br, 38, 14, rag, null, f)
  // tatters at the hem
  for (let i = 0; i < 4; i++) line(b, 8 + i * 4, 60 + (i % 2), 6 + i * 4 - f, 66, rag.d)
  // far arm, legs (thick as pillars)
  paint(b, (m) => thick(m, 22, 30 + br, 22, 42 + br, 6, 1), far(plate))
  plateLeg(b, 22, 47, 19, g, far(plate), 7)
  plateLeg(b, 31, 47, 33, g, plate, 8)
  // the hulking cuirass
  paint(b, (m) => poly(m, dy(P(14, 26, 36, 24, 41, 31, 39, 45, 17, 46, 13, 35), br), 1), plate, { rim: 2 })
  line(b, 33, 26 + br, 39, 33 + br, plate.l)
  for (let x = 17; x < 38; x += 4) poly(b, P(x, 26 + br, x + 2, 26 + br, x + 1, 22 + br), plate.l) // collar spikes
  hline(b, 16, 45 + br, 23, rag.l)
  // the skull buckle
  rect(b, 25, 42 + br, 5, 4, BONE.m)
  set(b, 26, 43 + br, INK)
  set(b, 28, 43 + br, INK)
  // horned helm, the face a darkness with two coals in it
  paint(b, (m) => poly(m, dy(P(20, 10, 31, 9, 36, 13, 36, 23, 30, 25, 21, 25, 18, 16), br), 1), plate, { rim: 2 })
  rect(b, 28, 15 + br, 8, 6, INK)
  set(b, 31, 17 + br, RED_EYE)
  set(b, 34, 17 + br, RED_EYE)
  set(b, 34, 16 + br, hex('#ffb080'))
  // the horns sweep up and forward
  paint(b, (m) => {
    thick(m, 22, 12 + br, 16, 6 + br, 3, 1)
    thick(m, 16, 6 + br, 17, 0 + br, 2, 1)
    thick(m, 32, 10 + br, 37, 4 + br, 3, 1)
    thick(m, 37, 4 + br, 41, 1 + br, 2, 1)
  }, BONE)
  // near arm: a spiked pauldron, the gauntlet gripping the maul's haft
  pauldron(b, 30, 28 + br, 6, plate, null)
  for (const [x, y] of [[26, 22], [31, 21], [36, 23]] as const) poly(b, P(x - 1, y + 3 + br, x + 1, y + 3 + br, x, y - 1 + br), BONE.l)
  paint(b, (m) => {
    thick(m, 32, 33 + br, 36, 41 + br, 6, 1)
    thick(m, 36, 41 + br, 42, 44 + br, 5, 1)
  }, plate)
  // the maul: a long haft down to a spiked head on the floor
  thick(b, 42, 44 + br, 53, 60, 3, LEATHER.d)
  line(b, 43, 43 + br, 54, 59, LEATHER.m)
  paint(b, (m) => poly(m, P(48, 58, 60, 55, 64, 62, 62, 70, 50, 70, 47, 64), 1), ramp('#2a2a34', '#5a5a6a', '#9a9aae'), { rim: 2 })
  for (const [x, y] of [[53, 54], [60, 53], [65, 61], [46, 61]] as const) poly(b, P(x - 1, y + 3, x + 1, y + 3, x, y - 1), STEEL.l)
  set(b, 57, 61, RED_EYE) // a rune that still glows
  return outline(b, INK)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tell, the Architect (F100): the one who wrote the tower. Long robes of cream and gold
// that pool on the floor, a golden halo marked like a compass, a quill as tall as a spear,
// and pages of the draft circling him.
// ─────────────────────────────────────────────────────────────────────────────

export function drawTell(f: IdleFrame): Bitmap {
  const W = 58
  const H = 80
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f
  const robe = ramp('#a89a80', '#ece2cc', '#fffaf0')
  const hair = ramp('#8a8aa0', '#d0d0e0', '#ffffff')
  const paper = ramp('#b8a888', '#f4ecd8', '#ffffff')
  // the halo: a compass ring with its marks
  arc(b, 27, 15, 13, GOLD.m, 0.5, 1.5)
  arc(b, 27, 15, 12, withAlpha(GOLD.l, 0x90), 0.55, 1.45)
  for (let i = 0; i < 12; i++) {
    const a = ((i + f * 0.5) / 12) * Math.PI * 2
    set(b, Math.round(27 + Math.cos(a) * 15), Math.round(15 + Math.sin(a) * 15), i % 3 === 0 ? GOLD.l : withAlpha(GOLD.m, 0xa0))
  }
  cape(b, 21, 25 + br, 50, 13, GOLD, null, f)
  // the robe, pooling on the floor
  paint(b, (m) => poly(m, dy(P(20, 24, 33, 23, 36, 34, 39, 52, 43, 76 - br, 12, 76 - br, 15, 52, 17, 34), br), 1), robe, { rim: 2 })
  for (const [x0, x1] of [[22, 17], [28, 27], [33, 38]] as const) line(b, x0, 44 + br, x1, 75, robe.d) // folds
  hline(b, 12, g - 2, 32, GOLD.m) // the gold hem
  hline(b, 13, g - 3, 30, GOLD.l)
  // the stole down the front, embroidered
  paint(b, (m) => poly(m, dy(P(29, 24, 33, 24, 37, 60, 33, 61), br), 1), GOLD)
  for (let y = 30; y < 58; y += 6) set(b, 33 + Math.floor((y - 30) / 7), y + br, WHITE)
  // head: silver hair, the gold circlet, eyes like the sun
  head(b, 22, 11 + br, FAIR, hex('#ffd24a'), { w: 10, h: 11 })
  paint(b, (m) => poly(m, dy(P(22, 10, 30, 9, 33, 12, 32, 13, 27, 13, 25, 17, 21, 15, 21, 12), br), 1), hair)
  hline(b, 22, 13 + br, 10, GOLD.m)
  set(b, 31, 13 + br, hex('#9ad4ff'))
  // the near sleeve, wide, and the hand on the quill
  paint(b, (m) => poly(m, dy(P(28, 26, 33, 26, 41, 38, 38, 42, 30, 36), br), 1), robe)
  rect(b, 40, 37 + br, 2, 3, FAIR.m)
  // the quill: a shaft taller than he is, a golden nib, a drop of light at its tip
  vline(b, 42, 6, g - 7, WOOD_DARK)
  vline(b, 43, 8, g - 9, GOLD.d)
  paint(b, (m) => poly(m, P(40, 2, 46, 2, 47, 8, 43, 16, 39, 8), 1), GOLD)
  vline(b, 43, 5, 9, INK)
  disc(b, 43, 18 + br, 1, f ? WHITE : hex('#9ad4ff'))
  // feather vanes up the shaft
  for (let i = 0; i < 5; i++) {
    line(b, 41, 20 + i * 4, 37, 16 + i * 4, paper.l)
    line(b, 44, 20 + i * 4, 48, 16 + i * 4, paper.m)
  }
  // the pages of the draft, circling
  const pages: Pt[] = f ? P(6, 30, 48, 46, 10, 56, 50, 26) : P(5, 34, 49, 50, 12, 52, 51, 22)
  pages.forEach(([x, y], i) => {
    paint(b, (m) => rect(m, x, y, 5, 6, 1), paper)
    hline(b, x + 1, y + 2, 3, i % 2 ? GOLD.d : hex('#6a5a48'))
    hline(b, x + 1, y + 4, 2, hex('#6a5a48'))
  })
  return outline(b, INK)
}

const WOOD_DARK = hex('#4a2a14')

// ─────────────────────────────────────────────────────────────────────────────
// The Herald of the End (F90): the one who comes to announce the world's last floor. A
// towering hooded shape of void, torn wings, a bone mask with one burning slit, eyes opening
// all over its cloak, and the horn it was sent to sound. It does not touch the floor.
// ─────────────────────────────────────────────────────────────────────────────

export function drawHerald(f: IdleFrame): Bitmap {
  const W = 70
  const H = 86
  const b = createBitmap(W, H)
  const bob = f // it floats: the whole body rises and falls
  const voidR = ramp('#06040c', '#1c1234', '#3e2c66')
  const edge = hex('#ff3aff')
  const glow = hex('#ffb0ff')
  const Y = (pts: Pt[]) => dy(pts, bob)
  // torn wings of void behind it
  paint(b, (m) => {
    poly(m, Y(P(30, 22, 6, 4, 10, 16, 0, 20, 10, 28, 2, 36, 14, 38, 8, 48, 26, 40)), 1)
    poly(m, Y(P(36, 22, 50, 2, 52, 14, 62, 10, 58, 24, 68, 28, 56, 34, 60, 42, 42, 38)), 1)
  }, voidR, { light: 'right', flat: true })
  for (const [x0, y0, x1, y1] of [[30, 22, 6, 4], [30, 24, 0, 20], [30, 26, 2, 36], [36, 22, 50, 2], [36, 24, 62, 10], [36, 26, 68, 28]] as const)
    line(b, x0, y0 + bob, x1, y1 + bob, withAlpha(edge, 0x90))
  // the robe: a hood that widens into a tattered hem hanging in the air
  const hem = 76
  // the ragged hem, right to left: a tail of cloth, a notch, another tail…
  const tails: number[] = []
  const r = seededRand(hashString('herald-hem'))
  for (let x = 52, i = 0; x >= 16; x -= 3, i++) tails.push(x, i % 2 ? hem - 3 : hem + r.int(3, 8) + ((i + f) % 2))
  paint(b, (m) => poly(m, Y(P(28, 6, 38, 6, 44, 14, 46, 30, 52, 50, 54, hem, ...tails, 14, hem, 18, 50, 22, 30, 23, 14)), 1), voidR, { rim: 2 })
  // folds falling from the hood, and the void's light inside it
  for (const [x0, x1] of [[26, 20], [33, 32], [40, 46]] as const) line(b, x0, 26 + bob, x1, hem - 4 + bob, voidR.l)
  poly(b, Y(P(29, 9, 39, 9, 41, 16, 40, 24, 34, 28, 28, 23)), hex('#2a0a3a'))
  // a crown of black spikes over the hood
  for (const [x, h] of [[27, 7], [31, 10], [35, 9], [39, 6]] as const) poly(b, Y(P(x - 2, 8, x + 2, 8, x, 8 - h)), voidR.l)
  // the bone mask, one slit burning down its face
  paint(b, (m) => poly(m, Y(P(30, 11, 38, 11, 40, 15, 39, 22, 34, 26, 30, 22)), 1), BONE)
  vline(b, 35, 13 + bob, 9, INK)
  vline(b, 36, 14 + bob, 6, f ? glow : edge)
  // eyes opening all over the cloak (they blink between the frames)
  const eyes: Pt[] = P(24, 36, 40, 34, 30, 46, 44, 52, 22, 58, 36, 62, 47, 68, 28, 70)
  eyes.forEach(([x, y], i) => {
    if (f === 1 && i % 3 === 1) {
      hline(b, x, y + bob, 3, voidR.l) // shut
      return
    }
    hline(b, x, y + bob, 3, edge)
    set(b, x + 1, y + bob, glow)
    set(b, x + 1, y - 1 + bob, withAlpha(edge, 0x80))
  })
  // the bony hands: the near one holds the horn to the mask
  paint(b, (m) => {
    thick(m, 42, 30 + bob, 46, 36 + bob, 3, 1)
    thick(m, 20, 34 + bob, 17, 44 + bob, 3, 1)
    for (let k = 0; k < 3; k++) set(m, 15 + k, 45 + bob + (k % 2), 1) // fingers
  }, BONE)
  // the horn of the end: a long ivory horn banded in gold, flaring toward the party
  const horn = ramp('#8e8672', '#d0c8aa', '#f4eed8')
  paint(b, (m) => {
    thick(m, 39, 22 + bob, 52, 30 + bob, 2, 1)
    poly(m, Y(P(50, 27, 60, 22, 66, 20, 67, 38, 60, 36, 50, 32)), 1)
  }, horn)
  line(b, 66, 21 + bob, 66, 37 + bob, GOLD.m)
  vline(b, 47, 26 + bob, 4, GOLD.m)
  vline(b, 55, 25 + bob, 9, GOLD.m)
  poly(b, Y(P(60, 24, 66, 22, 66, 36, 60, 34)), hex('#2a0a3a')) // the bell's dark mouth
  vline(b, 64, 25 + bob, 9, f ? glow : edge)
  return outline(b, INK)
}

// ─────────────────────────────────────────────────────────────────────────────
// The Chimera Matriarch (F70): the mother of the brood. A lion the size of a cart, a goat's
// head rising from her back, a serpent for a tail, leathery wings half-raised.
// ─────────────────────────────────────────────────────────────────────────────

export function drawChimeraMatriarch(f: IdleFrame): Bitmap {
  const W = 92
  const H = 66
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f
  const fur = ramp('#6a3a14', '#b0702e', '#e0aa5a')
  const mane = ramp('#4a1a0a', '#8a3a14', '#c8602a')
  const wing = ramp('#2a0e14', '#5a1e2a', '#8a3a4a')
  const goat = ramp('#5a5048', '#a09484', '#d8ccbc')
  const snake = ramp('#1a3a1e', '#3a6a2e', '#6aa04a')
  // the wing, half-raised behind the goat
  paint(b, (m) => poly(m, dy(P(38, 26, 26, 4, 34, 10, 40, 0, 46, 10, 54, 6, 52, 24), br), 1), wing, { flat: true })
  for (const [x, y] of [[26, 4], [40, 0], [54, 6]] as const) line(b, 44, 24 + br, x, y + br, wing.l)
  // the serpent tail, rearing up behind her
  paint(b, (m) => {
    thick(m, 16, 34 + br, 8, 30, 4, 1)
    thick(m, 8, 30, 4, 20, 4, 1)
    thick(m, 4, 20, 8, 12 - f, 4, 1)
    poly(m, P(6, 8 - f, 14, 7 - f, 17, 11 - f, 12, 14 - f, 6, 14 - f), 1)
  }, snake)
  set(b, 13, 9 - f, hex('#ffe07a'))
  set(b, 17, 13 - f, BONE.l)
  // the far legs
  paint(b, (m) => {
    thick(m, 26, 44, 24, g - 2, 6, 1)
    thick(m, 60, 44, 62, g - 2, 6, 1)
  }, far(fur))
  // the body
  paint(b, (m) => {
    poly(m, dy(P(16, 30, 30, 22, 58, 20, 70, 26, 72, 40, 62, 50, 26, 50, 16, 42), br), 1)
  }, fur, { rim: 2 })
  for (let x = 30; x < 60; x += 6) line(b, x, 26 + br, x - 3, 36 + br, fur.d) // the stripes of an old lioness
  // the goat's neck and head rising from her back
  paint(b, (m) => {
    thick(m, 44, 26 + br, 46, 12 + br, 5, 1)
    poly(m, dy(P(42, 8, 52, 6, 58, 12, 56, 15, 48, 16, 43, 13), br), 1)
  }, goat)
  set(b, 53, 10 + br, hex('#ffe07a'))
  set(b, 57, 13 + br, INK)
  // curled horns
  paint(b, (m) => {
    thick(m, 46, 7 + br, 41, 3 + br, 2, 1)
    thick(m, 41, 3 + br, 38, 7 + br, 2, 1)
    thick(m, 38, 7 + br, 40, 10 + br, 2, 1)
  }, BONE)
  line(b, 47, 16 + br, 49, 20 + br, goat.l) // the beard
  // the near legs, with claws
  paint(b, (m) => {
    thick(m, 30, 44, 30, g - 2, 7, 1)
    thick(m, 64, 42, 67, g - 2, 7, 1)
  }, fur)
  for (const x of [27, 30, 33, 64, 67, 70]) set(b, x, g, BONE.l)
  // the lion's head in its great mane, jaws open toward the party
  paint(b, (m) => disc(m, 74, 24 + br, 13, 1), mane, { rim: 2 })
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    poly(b, P(74 + Math.round(Math.cos(a) * 11), 24 + br + Math.round(Math.sin(a) * 11), 74 + Math.round(Math.cos(a + 0.25) * 15), 24 + br + Math.round(Math.sin(a + 0.25) * 15), 74 + Math.round(Math.cos(a + 0.4) * 11), 24 + br + Math.round(Math.sin(a + 0.4) * 11)), mane.d)
  }
  paint(b, (m) => poly(m, dy(P(70, 16, 82, 15, 88, 22, 89, 27, 84, 30, 72, 32, 68, 24), br), 1), fur)
  rect(b, 80, 19 + br, 3, 2, hex('#ffe07a'))
  set(b, 81, 19 + br, INK)
  set(b, 88, 23 + br, INK) // nose
  // the open jaw
  poly(b, dy(P(76, 28 + f, 88, 28 + f, 86, 33 + f, 77, 33 + f), br), hex('#5a0e14'))
  for (let x = 78; x < 88; x += 2) {
    set(b, x, 28 + f + br, BONE.l)
    set(b, x, 32 + f + br, BONE.l)
  }
  return outline(b, INK)
}

// ─────────────────────────────────────────────────────────────────────────────
// The lieutenants and the first anchor's master, a size between a hero and a boss.
// ─────────────────────────────────────────────────────────────────────────────

/** The Black Priest (F10): a tall mitred hood over a grey face, black robes trimmed in
 *  gold, a blood-red stole, and a staff crowned with a dark flame. */
export function drawBlackPriest(f: IdleFrame): Bitmap {
  const W = 40
  const H = 52
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f
  const robe = ramp('#0a080e', '#221c2e', '#443a58')
  const flame = f ? hex('#d8a8ff') : hex('#9a5ad0')
  // the staff, behind the near hand
  vline(b, 30, 6, g - 6, WOOD_DARK)
  vline(b, 31, 8, g - 8, GOLD.d)
  paint(b, (m) => poly(m, P(27, 7, 34, 7, 33, 11, 28, 11), 1), GOLD)
  poly(b, P(28, 7, 31, 0 + f, 33, 7), flame)
  set(b, 31, 4, WHITE)
  cape(b, 14, 16 + br, 30, 8, BLOOD_CAPE, null, f)
  // the robe to the floor
  paint(b, (m) => poly(m, dy(P(13, 16, 23, 15, 26, 24, 28, g - 1, 8, g - 1, 11, 26), br), 1), robe, { rim: 2 })
  hline(b, 8, g - 2, 21, GOLD.m)
  line(b, 19, 17 + br, 21, g - 3, BLOOD_CAPE.m) // the stole
  line(b, 20, 17 + br, 22, g - 3, BLOOD_CAPE.l)
  for (let y = 24; y < g - 4; y += 6) set(b, 21, y, GOLD.l)
  // the face under a tall mitre-hood
  head(b, 14, 6 + br, ramp('#7a6a6a', '#b0a0a0', '#d4c8c8'), RED_EYE, { w: 8, h: 9 })
  paint(b, (m) => poly(m, dy(P(13, 5, 17, -1, 22, 3, 24, 7, 21, 8, 17, 9, 15, 14, 12, 12), br), 1), robe)
  line(b, 17, -1 + br, 20, 6 + br, GOLD.m)
  // the near sleeve to the staff
  paint(b, (m) => poly(m, dy(P(18, 18, 22, 18, 30, 25, 28, 28, 20, 25), br), 1), robe)
  rect(b, 29, 24 + br, 2, 3, ramp('#7a6a6a', '#b0a0a0', '#d4c8c8').m)
  return outline(b, INK)
}

/** Rodvick (F40): Valention's hammer — a bearded bull of a man in leather and iron, a great
 *  studded club over his shoulder. */
export function drawRodvick(f: IdleFrame): Bitmap {
  const W = 44
  const H = 50
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f
  const hide = ramp('#3a2414', '#6a4424', '#9a6a3a')
  // the club over his shoulder, raking back
  paint(b, (m) => {
    thick(m, 27, 22 + br, 9, 4 + br, 3, 1)
    poly(m, dy(P(4, 0, 12, 2, 12, 9, 6, 11, 2, 6), br), 1)
  }, WOOD_R)
  for (const [x, y] of [[5, 3], [9, 4], [6, 8]] as const) set(b, x, y + br, STEEL.l)
  // legs
  plateLeg(b, 16, 33, 14, g, far(hide), 5)
  plateLeg(b, 22, 33, 24, g, hide, 6)
  // the torso: broad, a leather jerkin over mail
  paint(b, (m) => poly(m, dy(P(11, 16, 26, 15, 29, 22, 27, 34, 13, 34, 10, 24), br), 1), hide, { rim: 2 })
  for (let y = 18; y < 32; y += 3) hline(b, 22, y + br, 4, STEEL.m)
  hline(b, 12, 32 + br, 15, LEATHER.d)
  // the head: bald, a great red beard
  head(b, 15, 5 + br, FAIR, INK, { w: 9, h: 10 })
  const beard = ramp('#5a1a0a', '#9a3a14', '#d0602a')
  paint(b, (m) => poly(m, dy(P(17, 11, 25, 11, 25, 16, 21, 20, 17, 17), br), 1), beard)
  set(b, 24, 12 + br, FAIR.m)
  // the near arm, bare and thick, gripping the club
  pauldron(b, 21, 17 + br, 3, STEEL, null)
  paint(b, (m) => {
    thick(m, 22, 19 + br, 25, 26 + br, 4, 1)
    thick(m, 25, 26 + br, 27, 22 + br, 4, 1)
  }, FAIR)
  return outline(b, INK)
}

const WOOD_R = ramp('#3a2010', '#6a4020', '#9a6a3a')

/** Lazenca (F40): Valention's knife — a lean shadow in green, a bandana and a scarf trailing,
 *  two curved knives held low. */
export function drawLazenca(f: IdleFrame): Bitmap {
  const W = 40
  const H = 48
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f
  const garb = ramp('#14281c', '#2a4a34', '#4a7a54')
  const scarf = ramp('#5a0e1e', '#9a1a2e', '#d0404a')
  // the scarf, trailing
  paint(b, (m) => poly(m, dy(P(17, 14, 10, 16, 3, 20 + f, 1, 24 + f, 8, 21, 16, 18), br), 1), scarf)
  // far arm with the second knife, low behind
  paint(b, (m) => thick(m, 15, 17 + br, 11, 26 + br, 3, 1), far(garb))
  thick(b, 11, 27 + br, 7, 31 + br, 2, STEEL.l)
  // legs: a low crouch
  paint(b, (m) => {
    thick(m, 16, 30, 12, 38, 3, 1)
    thick(m, 12, 38, 12, g - 1, 3, 1)
  }, far(garb))
  paint(b, (m) => {
    thick(m, 20, 30, 26, 37, 3, 1)
    thick(m, 26, 37, 26, g - 1, 3, 1)
  }, garb)
  rect(b, 10, g - 1, 5, 1, LEATHER.d)
  rect(b, 25, g - 1, 5, 1, LEATHER.d)
  // torso, leaning forward
  paint(b, (m) => poly(m, dy(P(14, 15, 23, 14, 26, 20, 24, 31, 15, 31, 13, 23), br), 1), garb, { rim: 2 })
  hline(b, 14, 29 + br, 11, LEATHER.m)
  // head with its bandana, a mask over the mouth
  head(b, 16, 5 + br, FAIR, hex('#ffd24a'), { w: 8, h: 9 })
  paint(b, (m) => poly(m, dy(P(15, 4, 23, 4, 25, 7, 16, 8, 14, 7), br), 1), scarf)
  paint(b, (m) => rect(m, 19, 10 + br, 6, 4, 1), garb)
  // the near arm, a curved knife held low and forward
  paint(b, (m) => {
    thick(m, 21, 17 + br, 25, 24 + br, 3, 1)
    thick(m, 25, 24 + br, 29, 25 + br, 3, 1)
  }, garb)
  line(b, 30, 25 + br, 34, 23 + br, STEEL.l)
  line(b, 34, 23 + br, 36, 20 + br, STEEL.l)
  set(b, 36, 19 + br, WHITE)
  return outline(b, INK)
}
