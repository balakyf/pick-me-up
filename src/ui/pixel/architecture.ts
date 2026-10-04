/**
 * Lane Q · the campus's architecture. Every building gets a roof of its own kind and the
 * features that say what it is — the dormitory's dormers, the Tactical Center's battlements
 * and flag, the Promotion Chamber's golden pagoda eaves, the Transfer Station's dome, the
 * Watchtower's spire and bell, the kitchen's and the forge's chimneys, the tavern's thatch,
 * the Great Hall's clock cupola, the library's rose window, the Hall of Magic's observatory,
 * the Synthesis Chamber's glass alembic, the infirmary's white roof and red cross — and a
 * hanging sign over its facade. Upgrades show on the building: a gold stud on the ridge for
 * each level, gilded eaves from Lv4, pennants on the gables from Lv7, a gilded finial at
 * Lv10. At night, `drawRoofLights` lights its windows.
 *
 * Rule 12: deterministic bitmaps keyed by (building, level); nothing animated is cached.
 * The bitmap reaches `ROOF_SPIRE` px above the roof (spires, domes, flags) and `ROOF_SIGN`
 * px below the eave (the hanging sign over the facade).
 */
import { createBitmap, ellipse, hex, hline, line, mix, rect, set, vline, withAlpha, type Bitmap, type RGBA } from './bitmap'
import { GOLD, STEEL, WOOD } from './palette'
import { hashString, seededRand } from './rand'
import type { Building, BuildingId } from '../world/lobbyMap'
import type { FacilityId, GameState } from '../../engine/types'
import { TILE } from '../world/lobbyMap'

/** Roof overhang above the building's top wall (px) — campusProps.ROOF_LIFT. */
const LIFT = 10
/** Room above the roof for spires, domes and flags (px). */
export const ROOF_SPIRE = 26
/** Room below the eave for a hanging sign over the facade (px). */
export const ROOF_SIGN = 12

const INK = hex('#140c20')
const LIT = hex('#ffd890')
const LIT_HOT = hex('#fff2c0')

export type RoofStyle = 'shingle' | 'slate' | 'tile' | 'thatch' | 'gold' | 'flat' | 'white'

/** Each building's roof and what stands on it. */
export const ARCHITECTURE: Record<BuildingId, { style: RoofStyle; sign: SignKind | null }> = {
  dormitory: { style: 'slate', sign: null },
  tacticalCenter: { style: 'flat', sign: null },
  promotionChamber: { style: 'gold', sign: null },
  transfer: { style: 'tile', sign: null },
  watchtower: { style: 'slate', sign: null },
  kitchen: { style: 'tile', sign: 'pot' },
  tavern: { style: 'thatch', sign: 'mug' },
  hall: { style: 'slate', sign: null },
  library: { style: 'shingle', sign: 'book' },
  magic: { style: 'slate', sign: 'star' },
  armory: { style: 'slate', sign: 'anvil' },
  synthesis: { style: 'tile', sign: 'flask' },
  infirmary: { style: 'white', sign: 'cross' },
}

export type SignKind = 'pot' | 'mug' | 'book' | 'star' | 'anvil' | 'flask' | 'cross'

interface Geo {
  w: number
  /** The roof's own height (its top at `top`, the eave at `top + body`). */
  body: number
  ridge: number
  /** Where the roof starts inside the bitmap (= ROOF_SPIRE). */
  top: number
  h: number
}

function geo(bld: Building): Geo {
  const w = bld.rect.w * TILE
  const body = (bld.rect.h - 1) * TILE + LIFT
  return { w, body, ridge: Math.round(body * 0.36), top: ROOF_SPIRE, h: ROOF_SPIRE + body + 5 + ROOF_SIGN }
}

/** Shades of the building's roof colour. */
function shades(base: RGBA) {
  return {
    base,
    light: mix(base, hex('#fff6e0'), 0.3),
    shade: mix(base, hex('#140c20'), 0.3),
    dark: mix(base, hex('#140c20'), 0.55),
  }
}

/** The x-range of the front slope the name sign covers (keep features clear of it). */
function signBox(g: Geo): { x0: number; x1: number } {
  const half = Math.min(g.w / 2 - 6, 44)
  return { x0: Math.round(g.w / 2 - half), x1: Math.round(g.w / 2 + half) }
}

// ─────────────────────────────────────────────────────────────────────────────
// The roof itself, by style
// ─────────────────────────────────────────────────────────────────────────────

function roofBody(b: Bitmap, bld: Building, g: Geo, style: RoofStyle): void {
  const T = g.top
  const { base, light, shade, dark } = shades(hex(bld.roof))
  const r = seededRand(hashString(`roof|${bld.id}`))
  if (style === 'flat') {
    // A flat stone roof behind a parapet: flagstones, a drain, battlements on the front.
    for (let y = 0; y < g.body; y++) hline(b, 0, T + y, g.w, y % 8 === 0 ? shade : base)
    for (let y = 4; y < g.body - 6; y += 8) for (let x = (y / 8) % 2 ? 0 : 6; x < g.w; x += 12) vline(b, x, T + y - 4, 8, shade)
    // the parapet walk around the edge
    rect(b, 0, T, g.w, 4, light)
    rect(b, 0, T, 4, g.body, light)
    rect(b, g.w - 4, T, 4, g.body, dark)
    for (let x = 0; x < g.w; x += 10) rect(b, x, T + g.body - 9, 6, 4, light) // merlons
    hline(b, 0, T + g.body - 5, g.w, dark)
  } else {
    // A pitched roof: the back slope in shadow above the ridge, the front slope lit.
    const step = style === 'tile' ? 5 : style === 'slate' ? 3 : 4
    for (let y = 0; y < g.body; y++) hline(b, 0, T + y, g.w, y < g.ridge ? shade : base)
    for (let y = 1; y < g.body - 3; y += step) {
      const back = y < g.ridge
      if (style === 'thatch') {
        // Straw: ragged strokes, no courses.
        for (let x = 0; x < g.w; x += 2) if (r.chance(0.45)) vline(b, x, T + y, step - 1, back ? dark : r.chance(0.5) ? shade : light)
        continue
      }
      hline(b, 0, T + y + step - 1, g.w, back ? dark : shade)
      if (style === 'tile') {
        // Barrel tiles: vertical rolls, each catching the light on one side.
        for (let x = (y % 2) * 3; x < g.w; x += 6) {
          vline(b, x, T + y, step - 1, back ? dark : shade)
          if (!back) vline(b, x + 1, T + y, step - 2, light)
        }
      } else {
        const off = Math.floor(y / step) % 2 ? 0 : style === 'slate' ? 2 : 3
        const pitch = style === 'slate' ? 5 : 6
        for (let x = off; x < g.w; x += pitch) {
          vline(b, x, T + y, step - 1, back ? dark : shade)
          if (!back) set(b, x + 1, T + y, light)
          if (style === 'shingle' && r.chance(0.06)) set(b, x + 3, T + y + 1, mix(base, hex('#5a8a3a'), 0.6)) // moss
        }
      }
    }
    if (style === 'gold') {
      // Lacquered gold tiles with red ridge beams.
      for (let y = 2; y < g.body - 4; y += 6) hline(b, 0, T + y, g.w, mix(base, GOLD.l, 0.4))
    }
    // ridge cap
    hline(b, 0, T + g.ridge - 1, g.w, dark)
    hline(b, 0, T + g.ridge, g.w, style === 'gold' ? hex('#c03020') : light)
    hline(b, 0, T + g.ridge + 1, g.w, mix(light, base, 0.5))
    // verge trim at the gable ends
    for (const x of [0, 1, g.w - 2, g.w - 1]) vline(b, x, T, g.body, x === 0 || x === g.w - 1 ? INK : dark)
  }
  // the eave: a thick lip, then its shadow on the facade
  hline(b, 0, T + g.body - 3, g.w, light)
  hline(b, 0, T + g.body - 2, g.w, dark)
  hline(b, 0, T + g.body - 1, g.w, INK)
  for (let y = 0; y < 5; y++) hline(b, 0, T + g.body + y, g.w, hex(`#0c0814${(0x70 - y * 0x16).toString(16).padStart(2, '0')}`))
  hline(b, 0, T, g.w, INK)
  if (style === 'gold') {
    // Pagoda eaves: the corners sweep up.
    for (const [x, d] of [[0, 1], [g.w - 1, -1]] as const) {
      for (let k = 0; k < 6; k++) set(b, x + d * k, T + g.body - 3 - (5 - k), GOLD.l)
      set(b, x, T + g.body - 9, GOLD.l)
      set(b, x, T + g.body - 10, hex('#c03020'))
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// What stands on each roof
// ─────────────────────────────────────────────────────────────────────────────

/** A chimney (brick) from the back slope; returns its top-left. */
function chimney(b: Bitmap, g: Geo, x: number, w = 8, brick = hex('#6e4a3a')): void {
  const T = g.top
  // A stack rising from the back slope (not the whole slope): its foot hides in the tiles.
  const hgt = Math.min(g.ridge + 2, 20)
  rect(b, x, T - 6, w, hgt, brick)
  for (let y = T - 4; y < T - 6 + hgt; y += 3) hline(b, x, y, w, mix(brick, INK, 0.25))
  hline(b, x - 1, T - 6, w + 2, mix(brick, hex('#fff6e0'), 0.25))
  vline(b, x - 1, T - 6, hgt, INK)
  vline(b, x + w, T - 6, hgt, INK)
  hline(b, x - 1, T - 7, w + 2, INK)
  hline(b, x, T - 6 + hgt, w, mix(brick, INK, 0.5))
}

/** A dormer window on the front slope (a small gabled box with a glass pane). */
function dormer(b: Bitmap, g: Geo, cx: number, base: RGBA, lights: Bitmap | null): void {
  const T = g.top
  const y = T + g.ridge + 4
  const s = shades(base)
  rect(b, cx - 8, y + 6, 16, 13, s.shade)
  for (let k = 0; k < 10; k++) hline(b, cx - k, y + k - 3, k * 2 + 1, k < 2 ? s.light : k === 9 ? s.dark : s.base) // its little gable
  rect(b, cx - 5, y + 8, 10, 9, hex('#e8e0d0')) // the frame
  rect(b, cx - 4, y + 9, 8, 7, hex('#2a2440')) // the glass
  vline(b, cx, y + 9, 7, hex('#e8e0d0'))
  hline(b, cx - 4, y + 12, 8, hex('#e8e0d0'))
  vline(b, cx - 9, y + 6, 13, INK)
  vline(b, cx + 8, y + 6, 13, INK)
  hline(b, cx - 8, y + 19, 16, INK)
  if (lights) for (const [lx, ly] of [[cx - 4, y + 9], [cx + 1, y + 9], [cx - 4, y + 13], [cx + 1, y + 13]] as const) rect(lights, lx, ly, 3, 3, LIT)
}

/** A flag on a pole from (x, topY), waving to the right. */
function flag(b: Bitmap, x: number, y: number, cloth: RGBA, len = 10): void {
  vline(b, x, y, 16, WOOD.d)
  set(b, x, y - 1, GOLD.l)
  for (let k = 0; k < 5; k++) hline(b, x + 1, y + 1 + k, len - k, k === 0 ? mix(cloth, hex('#ffffff'), 0.3) : cloth)
}

function cupola(b0: Bitmap, g: Geo, cx0: number, roof: RGBA, lights0: Bitmap | null, opts: { clock?: boolean; dome?: boolean; slit?: boolean; spire?: boolean }): void {
  // Drawn at 2:3 on a scratch and scaled up 1.5× onto the roof, so it reads from the camera.
  const SW = 40
  const SH = 40
  const b = createBitmap(SW, SH)
  const lights = lights0 ? createBitmap(SW, SH) : null
  const cx = 20
  const s = shades(roof)
  const baseY = SH - 1
  // the drum: a box standing on the ridge
  rect(b, cx - 9, baseY - 14, 18, 14, hex('#c4bed0'))
  vline(b, cx + 8, baseY - 14, 14, hex('#8a8496'))
  vline(b, cx - 10, baseY - 14, 14, INK)
  vline(b, cx + 9, baseY - 14, 14, INK)
  if (opts.clock) {
    ellipse(b, cx - 5, baseY - 12, 10, 10, hex('#fff6e0'))
    set(b, cx, baseY - 7, INK)
    vline(b, cx, baseY - 11, 4, INK)
    hline(b, cx, baseY - 7, 3, INK)
    if (lights) ellipse(lights, cx - 5, baseY - 12, 10, 10, LIT)
  } else {
    for (const wx of [cx - 6, cx + 2]) {
      rect(b, wx, baseY - 11, 4, 7, hex('#2a2440'))
      if (lights) rect(lights, wx, baseY - 11, 4, 7, LIT)
    }
  }
  if (opts.dome) {
    // a dome over the drum
    ellipse(b, cx - 11, baseY - 26, 22, 16, s.base)
    ellipse(b, cx - 8, baseY - 25, 9, 6, s.light)
    hline(b, cx - 11, baseY - 15, 22, s.dark)
    if (opts.slit) {
      vline(b, cx + 2, baseY - 25, 10, hex('#0a0614'))
      vline(b, cx + 3, baseY - 25, 10, hex('#0a0614'))
      if (lights) (vline(lights, cx + 2, baseY - 24, 8, hex('#9ad4ff')), vline(lights, cx + 3, baseY - 24, 8, hex('#9ad4ff')))
    }
    vline(b, cx, baseY - 30, 4, GOLD.d)
    set(b, cx, baseY - 31, GOLD.l)
  } else {
    // a pyramid cap
    for (let k = 0; k < 10; k++) hline(b, cx - 10 + k, baseY - 15 - k, 20 - k * 2, k < 3 ? s.dark : s.base)
    if (opts.spire) vline(b, cx, baseY - 30, 6, GOLD.m)
  }
  // Paste at 1.5×, its foot on the ridge.
  const ox = cx0 - 30
  const oy = g.top + g.ridge + 1 - 60
  for (let y = 0; y < 60; y++)
    for (let x = 0; x < 60; x++) {
      const sx = Math.floor((x * 2) / 3)
      const sy = Math.floor((y * 2) / 3)
      const c = b.px[sy * SW + sx]!
      if (c !== 0) set(b0, ox + x, oy + y, c)
      const l = lights ? lights.px[sy * SW + sx]! : 0
      if (lights0 && l !== 0) set(lights0, ox + x, oy + y, l)
    }
}

/** A hanging sign over the facade (from the eave), its emblem painted on a board. */
function hangingSign(b: Bitmap, g: Geo, x: number, kind: SignKind): void {
  const y = g.top + g.body - 1
  vline(b, x + 1, y, 3, STEEL.d)
  vline(b, x + 10, y, 3, STEEL.d)
  rect(b, x, y + 3, 12, 9, WOOD.m)
  hline(b, x, y + 3, 12, WOOD.l)
  rect(b, x - 1, y + 3, 1, 9, INK)
  rect(b, x + 12, y + 3, 1, 9, INK)
  hline(b, x, y + 12, 12, INK)
  const ex = x + 2
  const ey = y + 4
  const p = (rows: string[], cols: Record<string, RGBA>) => rows.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && set(b, ex + i, ey + j, cols[ch]!)))
  switch (kind) {
    case 'pot':
      return p(['........', '.d....d.', 'dddddddd', '.mmmmmm.', '.mmmmmm.', '..mmmm..', '........'], { d: hex('#3a3f48'), m: hex('#8a919c') })
    case 'mug':
      return p(['.ffff...', '.aaaa.a.', '.aaaa..a', '.aaaa.a.', '.aaaa...', '.wwww...', '........'], { f: hex('#fff6e0'), a: hex('#f0a030'), w: hex('#8a5a30') })
    case 'book':
      return p(['........', '.rrrrrr.', '.rppppr.', '.rppppr.', '.rrrrrr.', '..y.....', '........'], { r: hex('#b04040'), p: hex('#fff6e0'), y: GOLD.l })
    case 'star':
      return p(['...v....', '..vlv...', 'vvlllvv.', '.vlllv..', '.v...v..', '........', '........'], { v: hex('#8b6cf0'), l: hex('#fff6c0') })
    case 'anvil':
      return p(['........', 'mmmmmm..', '.mmmmmmm', '...mm...', '..mmmm..', '.dddddd.', '........'], { m: hex('#8a919c'), d: hex('#3a3f48') })
    case 'flask':
      return p(['...gg...', '...gg...', '..gppg..', '.gppppg.', '.gpppppg', '..gggg..', '........'], { g: hex('#c8d0e0'), p: hex('#c04a8a') })
    case 'cross':
      return p(['...rr...', '...rr...', '.rrrrrr.', '.rrrrrr.', '...rr...', '...rr...', '........'], { r: hex('#d0302a') })
  }
}

/** Where a hanging sign can go: a front corner with no door under it. */
function signX(bld: Building, g: Geo): number | null {
  const doors = bld.doors.filter((d) => d.y === bld.rect.y + bld.rect.h - 1).map((d) => (d.x - bld.rect.x) * TILE)
  const free = (x: number) => doors.every((dx) => x + 14 < dx || x > dx + TILE + 2)
  for (const x of [8, g.w - 22, 24, g.w - 38]) if (x > 2 && x < g.w - 14 && free(x)) return x
  return null
}

/** The building's own features (and, when `lights` is given, its lit windows). */
function features(b: Bitmap, bld: Building, g: Geo, lights: Bitmap | null): void {
  const T = g.top
  const roof = hex(bld.roof)
  const sb = signBox(g)
  switch (bld.id) {
    case 'dormitory': {
      // a row of dormers either side of the sign, two chimney pots
      for (let cx = 14; cx < sb.x0 - 6; cx += 22) dormer(b, g, cx, roof, lights)
      for (let cx = g.w - 14; cx > sb.x1 + 6; cx -= 22) dormer(b, g, cx, roof, lights)
      chimney(b, g, Math.round(g.w * 0.22), 6)
      chimney(b, g, Math.round(g.w * 0.74), 6)
      break
    }
    case 'tacticalCenter': {
      // the war flag over the battlements, and a brazier at the corner
      flag(b, g.w - 14, T - 14, hex('#c03a3a'), 12)
      rect(b, 6, T - 4, 6, 6, STEEL.d)
      set(b, 8, T - 6, hex('#ff8a3a'))
      set(b, 9, T - 7, hex('#ffd27a'))
      if (lights) (rect(lights, 7, T - 7, 4, 4, hex('#ff9a40')), set(lights, 9, T - 9, LIT_HOT))
      // a lit slit window in each merlon pair
      if (lights) for (let x = 2; x < g.w; x += 20) set(lights, x, T + g.body - 7, LIT)
      break
    }
    case 'promotionChamber': {
      // a second, smaller pagoda tier on the ridge with a golden finial
      const cx = Math.round(g.w / 2)
      const y = T + g.ridge
      rect(b, cx - 12, y - 10, 24, 10, hex('#c03020'))
      for (let k = 0; k < 8; k++) hline(b, cx - 16 + k, y - 10 - k, 32 - k * 2, k < 2 ? GOLD.d : GOLD.m)
      for (const d of [-1, 1]) set(b, cx + d * 16, y - 11, GOLD.l)
      vline(b, cx, y - 24, 6, GOLD.l)
      ellipse(b, cx - 2, y - 27, 5, 4, GOLD.l)
      for (const wx of [cx - 8, cx + 4]) {
        rect(b, wx, y - 8, 4, 6, hex('#2a1a10'))
        if (lights) rect(lights, wx, y - 8, 4, 6, hex('#ffc860'))
      }
      break
    }
    case 'transfer': {
      cupola(b, g, Math.round(g.w / 2), hex('#36a7c9'), lights, { dome: true })
      // a ring of light around the dome
      if (lights) for (let k = 0; k < 10; k++) set(lights, Math.round(g.w / 2) - 10 + k * 2, T + g.ridge - 15, hex('#9ae0f0'))
      break
    }
    case 'watchtower': {
      // a tall spire with a bell under it
      const cx = Math.round(g.w / 2)
      const y = T + g.ridge
      rect(b, cx - 6, y - 12, 12, 12, hex('#8a6a4a'))
      rect(b, cx - 3, y - 10, 6, 7, hex('#1a1028'))
      ellipse(b, cx - 2, y - 9, 5, 5, GOLD.m) // the bell
      for (let k = 0; k < 14; k++) hline(b, cx - 8 + Math.floor(k / 2), y - 12 - k, 16 - Math.floor(k / 2) * 2, k % 3 ? roof : mix(roof, INK, 0.3))
      vline(b, cx, y - 30, 4, STEEL.l)
      if (lights) rect(lights, cx - 3, y - 10, 6, 7, hex('#ffc860'))
      break
    }
    case 'kitchen':
    case 'tavern': {
      // the chimney (smoke is drawn live by the lobby) and a skylight by the hearth
      chimney(b, g, Math.round(g.w * 0.78), 8)
      const wx = Math.round(g.w * 0.16)
      dormer(b, g, wx, roof, lights)
      break
    }
    case 'hall': {
      cupola(b, g, Math.round(g.w / 2), roof, lights, { clock: true, spire: true })
      // banners at both gables
      flag(b, 6, T - 12, hex('#7b3a92'), 9)
      flag(b, g.w - 8, T - 12, hex('#7b3a92'), 9)
      for (let cx = 20; cx < sb.x0 - 8; cx += 28) dormer(b, g, cx, roof, lights)
      for (let cx = g.w - 20; cx > sb.x1 + 8; cx -= 28) dormer(b, g, cx, roof, lights)
      break
    }
    case 'library': {
      // a round rose window in a gable on the back slope
      const cx = Math.round(g.w * 0.22)
      const y = T + 2
      for (let k = 0; k < 9; k++) hline(b, cx - k, y + k, k * 2 + 1, mix(roof, hex('#fff6e0'), 0.2))
      ellipse(b, cx - 4, y + 4, 9, 9, hex('#3a2a50'))
      for (let k = 0; k < 4; k++) (set(b, cx - 2 + k, y + 8, hex('#c04a4a')), set(b, cx, y + 6 + k, hex('#4a74c0')))
      if (lights) ellipse(lights, cx - 4, y + 4, 9, 9, hex('#ffc070'))
      chimney(b, g, Math.round(g.w * 0.72), 6)
      break
    }
    case 'magic': {
      cupola(b, g, Math.round(g.w * 0.7), hex('#3a3aa8'), lights, { dome: true, slit: true })
      // stars glinting on the roof
      const r = seededRand(hashString('magic|stars'))
      for (let i = 0; i < 6; i++) set(b, r.int(4, g.w - 4), T + r.int(2, g.ridge - 2), hex('#fff6c0'))
      break
    }
    case 'armory': {
      // the forge's great chimney, vents glowing along the ridge
      chimney(b, g, Math.round(g.w * 0.78), 10, hex('#5a4a44'))
      for (let x = 10; x < g.w * 0.6; x += 14) {
        rect(b, x, T + g.ridge - 4, 6, 3, hex('#2a1a14'))
        if (lights) rect(lights, x, T + g.ridge - 4, 6, 3, hex('#ff7a30'))
      }
      break
    }
    case 'synthesis': {
      // a glass alembic for a chimney: a bulb and a curling tube
      const x = Math.round(g.w * 0.74)
      const y = T + g.ridge
      ellipse(b, x - 5, y - 12, 11, 11, hex('#c8d0e0'))
      ellipse(b, x - 3, y - 10, 7, 7, hex('#c04a8a'))
      line(b, x + 4, y - 10, x + 9, y - 18, hex('#c8d0e0'))
      line(b, x + 9, y - 18, x + 12, y - 16, hex('#c8d0e0'))
      if (lights) ellipse(lights, x - 3, y - 10, 7, 7, hex('#ff70c0'))
      break
    }
    case 'infirmary': {
      // a red cross on the back slope, a little bell-cot
      const cx = Math.round(g.w * 0.25)
      rect(b, cx - 2, T + 2, 4, 12, hex('#d0302a'))
      rect(b, cx - 6, T + 6, 12, 4, hex('#d0302a'))
      chimney(b, g, Math.round(g.w * 0.75), 6, hex('#b8b4c0'))
      for (const wx of [Math.round(g.w * 0.12), Math.round(g.w * 0.88)]) dormer(b, g, wx, hex('#ecebf2'), lights)
      break
    }
  }
  const sign = ARCHITECTURE[bld.id].sign
  if (sign) {
    const x = signX(bld, g)
    if (x !== null) {
      hangingSign(b, g, x, sign)
      if (lights) set(lights, x + 6, g.top + g.body + 1, withAlpha(LIT, 0xc0)) // a lantern on the bracket
    }
  }
}

/** The upgrade marks: ridge studs per level, gilded eaves (Lv4+), gable pennants (Lv7+), a finial (Lv10). */
function upgrades(b: Bitmap, bld: Building, g: Geo, level: number): void {
  if (level <= 0) return
  const T = g.top
  const L = Math.min(10, level)
  const y = T + (ARCHITECTURE[bld.id].style === 'flat' ? 1 : g.ridge)
  const span = Math.min(g.w - 16, L * 10)
  for (let i = 0; i < L; i++) {
    const x = Math.round(g.w / 2 - span / 2 + (L === 1 ? span / 2 : (i * span) / (L - 1)))
    set(b, x, y - 1, GOLD.l)
    set(b, x, y, GOLD.m)
    set(b, x - 1, y, GOLD.d)
    set(b, x + 1, y, GOLD.d)
  }
  if (L >= 4) {
    for (let x = 0; x < g.w; x += 2) set(b, x, T + g.body - 3, x % 4 ? GOLD.m : GOLD.l)
  }
  if (L >= 7) {
    for (const [x, d] of [[3, 1], [g.w - 4, -1]] as const) {
      vline(b, x, T - 8, 10, WOOD.d)
      for (let k = 0; k < 4; k++) hline(b, d > 0 ? x + 1 : x - (6 - k), T - 7 + k, 6 - k, hex(bld.roof))
      set(b, x, T - 9, GOLD.l)
    }
  }
  if (L >= 10) {
    const cx = Math.round(g.w / 2)
    vline(b, cx, T - 16, 16 + Math.max(0, ARCHITECTURE[bld.id].style === 'flat' ? 1 : 0), GOLD.m)
    ellipse(b, cx - 2, T - 20, 5, 5, GOLD.l)
    set(b, cx, T - 19, hex('#ffffff'))
  }
}

/** The whole roof of a building at an upgrade level. Pure. */
export function drawArchitecture(bld: Building, level: number): Bitmap {
  const g = geo(bld)
  const b = createBitmap(g.w, g.h)
  roofBody(b, bld, g, ARCHITECTURE[bld.id].style)
  features(b, bld, g, null)
  upgrades(b, bld, g, level)
  return b
}

/**
 * The building's lit windows at night (same size and place as its roof): drawn over the
 * dark with 'lighter', its strength the night's darkness. Each light gets a soft halo.
 */
export function drawRoofLights(bld: Building, level: number): Bitmap {
  const g = geo(bld)
  const scratch = createBitmap(g.w, g.h)
  const lights = createBitmap(g.w, g.h)
  features(scratch, bld, g, lights)
  void level
  // A soft two-pixel halo around every light (at low alpha), the light itself on top.
  const out = createBitmap(g.w, g.h)
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const c = lights.px[y * g.w + x]!
      if (c === 0) continue
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d === 0 || d > 3) continue
          const i = (y + dy) * g.w + x + dx
          if (x + dx < 0 || y + dy < 0 || x + dx >= g.w || y + dy >= g.h || out.px[i] !== 0) continue
          out.px[i] = withAlpha(c, d === 1 ? 0x70 : 0x30)
        }
    }
  for (let i = 0; i < lights.px.length; i++) if (lights.px[i] !== 0) out.px[i] = lights.px[i]!
  return out
}

/** Which facility's level a building shows (none: the Great Hall, the Synthesis Chamber). */
export const BUILDING_FACILITY: Partial<Record<BuildingId, FacilityId>> = {
  dormitory: 'dormitory',
  tacticalCenter: 'tacticalCenter',
  promotionChamber: 'promotionChamber',
  transfer: 'transferStation',
  watchtower: 'watchtower',
  kitchen: 'kitchen',
  tavern: 'tavern',
  library: 'library',
  magic: 'hallOfMagic',
  armory: 'forge',
  infirmary: 'infirmary',
}

/** The upgrade level a building shows (0 when it has none). */
export function buildingLevel(state: Pick<GameState, 'facilities'>, id: BuildingId): number {
  const f = BUILDING_FACILITY[id]
  return f ? Math.max(0, Math.min(10, state.facilities[f]?.level ?? 0)) : 0
}
