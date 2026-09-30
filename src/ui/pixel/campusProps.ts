/**
 * Campus props for the Living Lobby: beds, trees, the fountain, graves, bookcases, the
 * tavern bar… plus the building roofs that hide interiors until the Master walks in.
 * Same conventions as props.ts: a bitmap and its draw offset from the footprint origin.
 */
import { createBitmap, ellipse, hex, hline, line, mix, outline, rect, roundRect, set, vline, type Bitmap } from './bitmap'
import { GOLD, INK, LINEN, STEEL, WOOD, ramp } from './palette'
import type { PropSprite } from './props'
import type { Building } from '../world/lobbyMap'
import { TILE } from '../world/lobbyMap'
import { hashString, seededRand } from './rand'

const LEAF = ramp('#1e4a2a', '#2e7a3a', '#5aae4e')
const STONE = ramp('#4a4452', '#6e6678', '#9a92a6')
const WATER = ramp('#1e4a8e', '#3a7ad0', '#9ad4ff')
const BLANKET = [ramp('#3a2a6e', '#5a4aa8', '#8a7ad8'), ramp('#6e2a2a', '#a8443a', '#d87a5a'), ramp('#2a5a4a', '#3e8a6e', '#6ec09a'), ramp('#6e5a2a', '#a88a3a', '#d8c070')]

export function bed(): PropSprite {
  const b = createBitmap(16, 34)
  rect(b, 1, 2, 14, 30, WOOD.d)
  rect(b, 2, 4, 12, 26, LINEN.l) // sheet
  roundRect(b, 3, 5, 10, 6, hex('#fff6e0')) // pillow
  const bl = BLANKET[0]!
  rect(b, 2, 13, 12, 17, bl.m)
  hline(b, 2, 13, 12, bl.l)
  vline(b, 13, 14, 16, bl.d)
  rect(b, 1, 31, 2, 3, WOOD.d)
  rect(b, 13, 31, 2, 3, WOOD.d)
  return { bmp: outline(b, INK), dx: 0, dy: -2 }
}

/** The blanket drawn over a sleeping hero (so they look tucked in). */
export function blanket(tint: number): Bitmap {
  const bl = BLANKET[tint % BLANKET.length]!
  const b = createBitmap(14, 18)
  rect(b, 0, 0, 14, 18, bl.m)
  hline(b, 0, 0, 14, bl.l)
  hline(b, 0, 1, 14, bl.l)
  vline(b, 13, 1, 17, bl.d)
  for (let y = 5; y < 18; y += 5) hline(b, 1, y, 12, bl.d)
  return b
}

export function tree(f: number): PropSprite {
  const b = createBitmap(32, 44)
  const sway = f % 2
  rect(b, 13, 28, 6, 14, WOOD.d)
  vline(b, 14, 28, 14, WOOD.m)
  ellipse(b, 2 + sway, 2, 28, 28, LEAF.d)
  ellipse(b, 4 + sway, 3, 22, 20, LEAF.m)
  ellipse(b, 8 + sway, 5, 12, 10, LEAF.l)
  ellipse(b, 18 + sway, 12, 8, 7, LEAF.l)
  for (let i = 0; i < 6; i++) set(b, 6 + ((i * 7) % 20) + sway, 8 + ((i * 5) % 16), LEAF.d)
  ellipse(b, 8, 40, 16, 4, hex('#00000040'))
  return { bmp: outline(b, INK), dx: -8, dy: -28 }
}

export function bush(): PropSprite {
  const b = createBitmap(18, 16)
  ellipse(b, 1, 3, 16, 12, LEAF.d)
  ellipse(b, 3, 3, 11, 8, LEAF.m)
  ellipse(b, 5, 4, 5, 4, LEAF.l)
  set(b, 12, 7, hex('#e05a7a'))
  set(b, 6, 10, hex('#f0d05a'))
  return { bmp: outline(b, INK), dx: -1, dy: -2 }
}

export function flowers(): PropSprite {
  const b = createBitmap(16, 12)
  ellipse(b, 1, 4, 14, 7, LEAF.m)
  const cols = ['#e05a7a', '#f0d05a', '#fff6e0', '#9a7ae0']
  for (let i = 0; i < 6; i++) set(b, 3 + i * 2, 4 + (i % 2) * 2, hex(cols[i % 4]!))
  return { bmp: outline(b, INK), dx: 0, dy: 4 }
}

export function fountain(f: number): PropSprite {
  const b = createBitmap(48, 40)
  ellipse(b, 1, 12, 46, 26, STONE.d)
  ellipse(b, 3, 13, 42, 22, STONE.m)
  ellipse(b, 6, 15, 36, 17, WATER.m)
  ellipse(b, 10, 17, 20, 8, WATER.l)
  // ripples
  const r = f % 4
  ellipse(b, 14 - r, 20 - (r >> 1), 20 + r * 2, 8 + r, WATER.d)
  ellipse(b, 15 - r, 21 - (r >> 1), 18 + r * 2, 6 + r, WATER.m)
  // the column and its spout
  rect(b, 21, 4, 6, 18, STONE.l)
  vline(b, 26, 4, 18, STONE.d)
  ellipse(b, 17, 2, 14, 6, STONE.m)
  for (let i = 0; i < 4; i++) {
    set(b, 19 - i - (f % 2), 4 + i * 2, WATER.l)
    set(b, 28 + i + (f % 2), 4 + i * 2, WATER.l)
  }
  set(b, 24, 0, WATER.l)
  return { bmp: outline(b, INK), dx: 0, dy: -8 }
}

export function well(): PropSprite {
  const b = createBitmap(16, 30)
  vline(b, 2, 0, 18, WOOD.d)
  vline(b, 13, 0, 18, WOOD.d)
  hline(b, 1, 1, 14, WOOD.m)
  rect(b, 5, 0, 6, 2, hex('#8e3a2a'))
  vline(b, 8, 2, 8, LINEN.d)
  rect(b, 7, 9, 3, 3, WOOD.m)
  rect(b, 0, 16, 16, 12, STONE.m)
  hline(b, 0, 16, 16, STONE.l)
  for (let x = 1; x < 16; x += 4) vline(b, x, 17, 10, STONE.d)
  ellipse(b, 2, 14, 12, 5, WATER.d)
  return { bmp: outline(b, INK), dx: 0, dy: -14 }
}

export function bench(): PropSprite {
  const b = createBitmap(32, 16)
  rect(b, 1, 4, 30, 4, WOOD.m)
  hline(b, 1, 4, 30, WOOD.l)
  rect(b, 1, 1, 30, 2, WOOD.d)
  rect(b, 3, 8, 2, 7, WOOD.d)
  rect(b, 27, 8, 2, 7, WOOD.d)
  return { bmp: outline(b, INK), dx: 0, dy: -2 }
}

export function crop(f: number): PropSprite {
  const b = createBitmap(16, 18)
  const g = f % 2
  for (let i = 0; i < 3; i++) {
    const x = 2 + i * 5
    vline(b, x + 1, 6 + g, 10, LEAF.m)
    ellipse(b, x - 1, 4 + g, 5, 4, LEAF.l)
    ellipse(b, x + 1, 9, 4, 3, LEAF.d)
    set(b, x + 1, 3 + g, i === 1 ? hex('#e8553b') : hex('#f0d05a'))
  }
  return { bmp: outline(b, INK), dx: 0, dy: -4 }
}

export function grave(): PropSprite {
  const b = createBitmap(14, 20)
  roundRect(b, 1, 0, 12, 16, STONE.m)
  vline(b, 11, 2, 13, STONE.d)
  vline(b, 2, 2, 12, STONE.l)
  hline(b, 5, 5, 4, STONE.d) // the cross
  vline(b, 7, 3, 7, STONE.d)
  rect(b, 0, 15, 14, 4, hex('#4a6e3a'))
  set(b, 3, 16, hex('#e05a7a'))
  set(b, 10, 16, hex('#fff6e0'))
  return { bmp: outline(b, INK), dx: 1, dy: -4 }
}

export function obelisk(f: number): PropSprite {
  const b = createBitmap(16, 44)
  rect(b, 0, 36, 16, 7, STONE.d)
  rect(b, 3, 6, 10, 31, STONE.m)
  vline(b, 12, 6, 31, STONE.d)
  vline(b, 3, 6, 31, STONE.l)
  for (let i = 0; i < 4; i++) {
    hline(b, 4, 2 + i, 8 - i * 2 + 1, STONE.l)
  }
  for (let y = 12; y < 34; y += 3) hline(b, 5, y, 6, STONE.d) // engraved names
  // an eternal flame at its foot
  const fl = [hex('#8e1e12'), hex('#e8553b'), hex('#ffb040')]
  for (let i = 0; i < 4; i++) hline(b, 6 + (f % 2) - (i >> 1), 35 - i, 3 - (i >> 1), fl[Math.min(2, i)]!)
  return { bmp: outline(b, INK), dx: 0, dy: -28 }
}

export function bookcase(): PropSprite {
  const b = createBitmap(32, 32)
  rect(b, 0, 0, 32, 30, WOOD.d)
  const cols = ['#8e2a2a', '#2a5a8e', '#5a8e2a', '#8e6a2a', '#6a2a8e', '#2a8e7a']
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 2 + shelf * 9
    rect(b, 2, y, 28, 8, WOOD.m)
    for (let x = 3; x < 29; x += 3) rect(b, x, y + 1 + ((x + shelf) % 3 === 0 ? 1 : 0), 2, 7 - ((x + shelf) % 3 === 0 ? 1 : 0), hex(cols[(x + shelf * 2) % cols.length]!))
    hline(b, 2, y + 8, 28, WOOD.d)
  }
  return { bmp: outline(b, INK), dx: 0, dy: -16 }
}

export function desk(): PropSprite {
  const b = createBitmap(32, 22)
  rect(b, 0, 2, 32, 10, WOOD.m)
  hline(b, 0, 2, 32, WOOD.l)
  rect(b, 2, 12, 3, 9, WOOD.d)
  rect(b, 27, 12, 3, 9, WOOD.d)
  rect(b, 6, 3, 10, 7, LINEN.l) // open book
  vline(b, 11, 3, 7, LINEN.d)
  rect(b, 20, 0, 3, 5, STEEL.m) // inkwell
  set(b, 24, 0, GOLD.l) // candle
  vline(b, 24, 1, 4, hex('#fff6e0'))
  return { bmp: outline(b, INK), dx: 0, dy: -6 }
}

export function cot(): PropSprite {
  const b = createBitmap(16, 32)
  rect(b, 1, 2, 14, 28, STEEL.m)
  rect(b, 2, 3, 12, 26, hex('#f0f0f8'))
  roundRect(b, 3, 4, 10, 5, hex('#ffffff'))
  rect(b, 2, 12, 12, 17, hex('#c8d8f0'))
  hline(b, 2, 12, 12, hex('#e8f0ff'))
  set(b, 7, 20, hex('#d0302a'))
  hline(b, 6, 21, 3, hex('#d0302a'))
  set(b, 7, 22, hex('#d0302a'))
  return { bmp: outline(b, INK), dx: 0, dy: -2 }
}

export function bar(): PropSprite {
  const b = createBitmap(80, 26)
  rect(b, 0, 6, 80, 18, WOOD.d)
  rect(b, 0, 4, 80, 4, WOOD.l)
  for (let x = 4; x < 80; x += 10) vline(b, x, 9, 14, WOOD.m)
  for (let i = 0; i < 5; i++) {
    const x = 8 + i * 15
    rect(b, x, 0, 4, 5, i % 2 ? GOLD.m : hex('#8e3a2a'))
    hline(b, x, 0, 4, hex('#fff6e0'))
  }
  return { bmp: outline(b, INK), dx: 0, dy: -8 }
}

export function lamp(f: number): PropSprite {
  const b = createBitmap(12, 34)
  vline(b, 5, 8, 24, STEEL.d)
  vline(b, 6, 8, 24, STEEL.m)
  rect(b, 3, 31, 6, 3, STEEL.d)
  rect(b, 2, 1, 8, 8, STEEL.d)
  rect(b, 3, 2, 6, 6, f % 2 ? hex('#ffe08a') : hex('#ffd060'))
  hline(b, 1, 0, 10, STEEL.m)
  return { bmp: outline(b, INK), dx: 2, dy: -18 }
}

export function telescope(): PropSprite {
  const b = createBitmap(24, 26)
  line(b, 6, 24, 12, 12, WOOD.d)
  line(b, 18, 24, 12, 12, WOOD.d)
  line(b, 12, 24, 12, 12, WOOD.m)
  for (let i = 0; i < 12; i++) {
    set(b, 4 + i, 12 - Math.floor(i / 1.5), GOLD.m)
    set(b, 4 + i, 13 - Math.floor(i / 1.5), GOLD.d)
  }
  rect(b, 16, 2, 4, 4, STEEL.l)
  return { bmp: outline(b, INK), dx: -4, dy: -10 }
}

export function marketStall(): PropSprite {
  const b = createBitmap(32, 30)
  rect(b, 1, 14, 30, 14, WOOD.m)
  hline(b, 1, 14, 30, WOOD.l)
  vline(b, 2, 0, 14, WOOD.d)
  vline(b, 29, 0, 14, WOOD.d)
  for (let x = 2; x < 30; x += 4) rect(b, x, 1, 4, 6, (x / 4) % 2 ? hex('#3a7a4a') : hex('#fff6e0'))
  // wares: fruit, cloth, pots
  ellipse(b, 4, 10, 6, 5, hex('#d0402a'))
  ellipse(b, 9, 10, 5, 5, hex('#f0a030'))
  rect(b, 16, 9, 6, 5, hex('#5a4aa8'))
  ellipse(b, 23, 9, 5, 6, hex('#a8583a'))
  return { bmp: outline(b, INK), dx: 0, dy: -12 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Roofs
// ─────────────────────────────────────────────────────────────────────────────

/** Roof overhang above the building's top wall (px). */
export const ROOF_LIFT = 10

/**
 * A pitched shingle roof covering a building (all but its front wall row, which stays
 * visible as the facade). Chimneys smoke when `frame` animates.
 */
export function drawRoof(bld: Building, frame: number): Bitmap {
  const w = bld.rect.w * TILE
  const body = (bld.rect.h - 1) * TILE + ROOF_LIFT
  const h = body + 5 // + the eave's shadow on the facade
  const b = createBitmap(w, h)
  const base = hex(bld.roof)
  const light = mix(base, hex('#fff6e0'), 0.3)
  const shade = mix(base, hex('#140c20'), 0.3)
  const dark = mix(base, hex('#140c20'), 0.55)
  const ink = hex('#140c20')
  const r = seededRand(hashString(`roof|${bld.id}`))
  const ridge = Math.round(body * 0.36)
  // Back slope (in shadow) and front slope (lit), shingled in staggered rows.
  for (let y = 0; y < body; y++) hline(b, 0, y, w, y < ridge ? shade : base)
  for (let y = 1; y < body - 3; y += 4) {
    const back = y < ridge
    hline(b, 0, y + 3, w, back ? dark : shade)
    const off = ((y - 1) / 4) % 2 ? 0 : 3
    for (let x = off; x < w; x += 6) {
      vline(b, x, y, 3, back ? dark : shade)
      if (!back) set(b, x + 1, y, light)
      if (r.chance(0.06)) set(b, x + 3, y + 1, mix(base, hex('#5a8a3a'), 0.6)) // moss
    }
  }
  // Ridge cap.
  hline(b, 0, ridge - 1, w, dark)
  hline(b, 0, ridge, w, light)
  hline(b, 0, ridge + 1, w, mix(light, base, 0.5))
  // Verge trim at the gable ends.
  for (const x of [0, 1, w - 2, w - 1]) vline(b, x, 0, body, x === 0 || x === w - 1 ? ink : dark)
  // Eaves: a thick lip, then its shadow falling on the facade below.
  hline(b, 0, body - 3, w, light)
  hline(b, 0, body - 2, w, dark)
  hline(b, 0, body - 1, w, ink)
  for (let y = body; y < h; y++) hline(b, 0, y, w, hex(`#0c0814${(0x70 - (y - body) * 0x16).toString(16).padStart(2, '0')}`))
  hline(b, 0, 0, w, ink)
  // A dormer window on the front slope.
  const cx = Math.round(w / 2)
  const dy = ridge + 4
  rect(b, cx - 7, dy, 14, 11, dark)
  rect(b, cx - 8, dy - 2, 16, 3, light) // its little roof
  rect(b, cx - 5, dy + 2, 10, 7, hex('#2a2440'))
  vline(b, cx, dy + 2, 7, dark)
  hline(b, cx - 5, dy + 5, 10, dark)
  set(b, cx - 4, dy + 3, hex('#5a5480'))
  if (bld.chimney) {
    const x = Math.round(w * 0.78)
    rect(b, x, 1, 8, ridge + 2, hex('#6e4a3a'))
    for (let y = 3; y < ridge + 2; y += 3) hline(b, x, y, 8, hex('#5a3a2e'))
    hline(b, x - 1, 1, 10, hex('#8e6a5a'))
    vline(b, x + 7, 2, ridge, hex('#4a2e24'))
    vline(b, x - 1, 1, ridge + 2, ink)
    vline(b, x + 8, 1, ridge + 2, ink)
  }
  void frame
  return b
}

/** A puff of chimney smoke (drawn above the roof, animated). */
export function smoke(frame: number): Bitmap {
  const b = createBitmap(12, 20)
  const g = [hex('#c8c0d0a0'), hex('#a8a0b880'), hex('#8e869a60')]
  for (let i = 0; i < 3; i++) {
    const y = 16 - ((frame + i * 5) % 15)
    const x = 3 + ((frame + i) % 3) - 1
    ellipse(b, x, y, 6 - i, 5 - i, g[i]!)
  }
  return b
}
