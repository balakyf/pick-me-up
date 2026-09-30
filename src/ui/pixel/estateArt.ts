/**
 * Pixel art for the estate (spec 2026-09-30-estate-and-life): the decorations the Master
 * buys (rugs and bunk lamps, the tavern hearth and music corner, flower boxes, hall
 * tapestries, the fountain's upgrades, road lanterns, yard pennants) and the Memorial's
 * statues — each fallen hero carved in stone, faintly painted in their own colours.
 * Same conventions as campusProps.ts: a bitmap plus its offset from the anchor tile.
 */
import { createBitmap, ellipse, hex, hline, mix, outline, packRgba, rect, rgbaParts, roundRect, set, vline, type Bitmap, type RGBA } from './bitmap'
import { GOLD, INK, LINEN, STEEL, WOOD, ramp } from './palette'
import type { PropSprite } from './props'
import { drawHeroFrame } from './heroSprite'
import type { HeroLook } from './look'

const STONE = ramp('#5a5462', '#8a8496', '#c4bed0')
const RUGS = [ramp('#5a1e2a', '#8e2e3a', '#c8584a'), ramp('#1e3a5a', '#2e5a8e', '#5a8ac8'), ramp('#3a4a1e', '#5a7a2e', '#8ab04a'), ramp('#4a2a5a', '#6e3e8e', '#a870c8')]
const CLOTH = [ramp('#4a1e3a', '#7a2e5a', '#b04a82'), ramp('#1e2e5a', '#2e468e', '#4a70c8'), ramp('#5a3a12', '#8e5e1e', '#c8903a'), ramp('#1e4a3a', '#2e7a5a', '#4ab08a')]
const PETALS = ['#e05a7a', '#f0d05a', '#fff6e0', '#9a7ae0', '#ff9a5a'].map(hex)
const LEAF = ramp('#1e4a2a', '#2e7a3a', '#5aae4e')

/** A patterned rug lying in the dormitory aisle (flat: drawn under everyone). */
export function rug(variant: number): PropSprite {
  const c = RUGS[variant % RUGS.length]!
  const b = createBitmap(28, 12)
  rect(b, 0, 0, 28, 12, c.d)
  rect(b, 2, 2, 24, 8, c.m)
  for (let x = 4; x < 24; x += 5) {
    set(b, x, 5, c.l)
    set(b, x + 1, 6, c.l)
    set(b, x + 2, 5, c.l)
  }
  hline(b, 2, 2, 24, c.l)
  for (let x = 1; x < 28; x += 3) {
    set(b, x, 0, LINEN.l)
    set(b, x, 11, LINEN.l)
  }
  return { bmp: b, dx: 2, dy: 2 }
}

/** A little wall lamp over a bunk. */
export function bunkLamp(f: number): PropSprite {
  const b = createBitmap(8, 10)
  vline(b, 3, 0, 3, STEEL.d)
  rect(b, 1, 3, 6, 6, STEEL.d)
  rect(b, 2, 4, 4, 4, f % 2 ? hex('#ffe08a') : hex('#ffd060'))
  return { bmp: outline(b, INK), dx: 4, dy: 2 }
}

/** The tavern hearth set into the north wall; the fire flickers. */
export function hearth(f: number): PropSprite {
  const b = createBitmap(32, 26)
  rect(b, 0, 2, 32, 24, STONE.d)
  for (let y = 4; y < 26; y += 4) for (let x = (y / 4) % 2 ? 0 : 4; x < 32; x += 8) rect(b, x + 1, y, 6, 3, STONE.m)
  rect(b, 0, 0, 32, 3, WOOD.m) // mantel
  hline(b, 0, 0, 32, WOOD.l)
  roundRect(b, 7, 9, 18, 17, hex('#1a0e0a'))
  const fl = [hex('#8e1e12'), hex('#e8553b'), hex('#ffb040'), hex('#fff0a0')]
  const k = f % 3
  ellipse(b, 9, 17 - k, 14, 9 + k, fl[0]!)
  ellipse(b, 11, 18 - k, 10, 7 + k, fl[1]!)
  ellipse(b, 13, 20 - (k >> 1), 6, 5, fl[2]!)
  set(b, 16, 19 - k, fl[3]!)
  rect(b, 9, 24, 14, 2, WOOD.d) // logs
  set(b, 4, 1, GOLD.l) // a mug on the mantel
  rect(b, 25, 0, 3, 2, hex('#c8c0a0'))
  return { bmp: outline(b, INK), dx: 0, dy: 6 }
}

/** A stool, a lute and a drum: the music corner. */
export function musicCorner(): PropSprite {
  const b = createBitmap(24, 20)
  rect(b, 3, 12, 8, 3, WOOD.m)
  vline(b, 4, 15, 5, WOOD.d)
  vline(b, 9, 15, 5, WOOD.d)
  ellipse(b, 12, 6, 9, 10, WOOD.l) // the lute
  ellipse(b, 14, 8, 5, 5, WOOD.d)
  rect(b, 15, 0, 2, 8, WOOD.d)
  set(b, 16, 0, GOLD.m)
  ellipse(b, 1, 14, 8, 6, hex('#8e3a2a')) // a drum
  hline(b, 2, 14, 6, LINEN.l)
  return { bmp: outline(b, INK), dx: -4, dy: -4 }
}

/** A flower box on the garden fence. */
export function flowerBox(variant: number): PropSprite {
  const b = createBitmap(16, 12)
  rect(b, 1, 6, 14, 6, WOOD.m)
  hline(b, 1, 6, 14, WOOD.l)
  ellipse(b, 1, 1, 14, 7, LEAF.m)
  for (let i = 0; i < 5; i++) set(b, 3 + i * 2 + (variant % 2), 2 + ((i + variant) % 2) * 2, PETALS[(i + variant) % PETALS.length]!)
  return { bmp: outline(b, INK), dx: 0, dy: 0 }
}

/** A tapestry hanging on the Great Hall's wall. */
export function tapestry(variant: number, trim: boolean): PropSprite {
  const c = CLOTH[variant % CLOTH.length]!
  const b = createBitmap(14, 26)
  hline(b, 0, 0, 14, WOOD.d)
  rect(b, 1, 1, 12, 22, c.m)
  vline(b, 1, 1, 22, c.l)
  vline(b, 12, 1, 22, c.d)
  // An emblem: a tower, a sword, a crystal, a star.
  const e = trim ? GOLD.l : LINEN.l
  if (variant % 4 === 0) rect(b, 6, 5, 2, 12, e)
  if (variant % 4 === 1) (vline(b, 7, 4, 13, e), hline(b, 4, 8, 7, e))
  if (variant % 4 === 2) (ellipse(b, 4, 6, 6, 10, e), set(b, 7, 10, c.d))
  if (variant % 4 === 3) (hline(b, 4, 10, 7, e), vline(b, 7, 7, 7, e), set(b, 5, 8, e), set(b, 9, 12, e))
  for (let x = 1; x < 13; x += 2) set(b, x, 23, trim ? GOLD.m : c.d) // fringe
  if (trim) (hline(b, 1, 1, 12, GOLD.m), hline(b, 1, 22, 12, GOLD.m))
  return { bmp: outline(b, INK), dx: 1, dy: -6 }
}

/** The fountain's upgrades, drawn over the fountain (48×40 at the same anchor). */
export function fountainUpgrade(level: number, f: number): PropSprite {
  const b = createBitmap(48, 40)
  const water = hex('#9ad4ff')
  const foam = hex('#e8f6ff')
  // A taller jet (level 1+), side spouts (2+), a figure on the column (3+), gilded rim (5).
  const jet = 4 + level * 2
  for (let y = 0; y < jet; y++) set(b, 24 + ((y + f) % 3 === 0 ? 1 : 0), 8 - Math.min(8, y), y % 2 ? water : foam)
  if (level >= 2) for (let i = 0; i < 5; i++) {
    set(b, 15 - i, 9 + i + (f % 2), water)
    set(b, 33 + i, 9 + i + (f % 2), water)
  }
  if (level >= 3) {
    rect(b, 22, 0, 4, 4, hex('#d0cadc'))
    set(b, 23, 0, hex('#f0ecf6'))
  }
  if (level >= 4) for (let i = 0; i < 6; i++) set(b, 8 + ((i * 7 + f * 3) % 32), 22 + ((i * 5) % 8), foam) // sparkles
  if (level >= 5) {
    for (let x = 6; x < 42; x += 3) set(b, x, 13 + (x > 24 ? (x - 24) >> 3 : (24 - x) >> 3), GOLD.l)
  }
  return { bmp: b, dx: 0, dy: -8 }
}

/** A paper lantern on a post, for the roads. */
export function lanternPost(f: number): PropSprite {
  const b = createBitmap(10, 30)
  vline(b, 4, 6, 24, WOOD.d)
  vline(b, 5, 6, 24, WOOD.m)
  hline(b, 2, 5, 6, WOOD.d)
  roundRect(b, 1, 7, 8, 9, f % 2 ? hex('#ff9a4a') : hex('#ffb060'))
  hline(b, 2, 8, 6, hex('#ffe0a0'))
  hline(b, 1, 11, 8, hex('#c8602a'))
  rect(b, 3, 28, 4, 2, WOOD.d)
  return { bmp: outline(b, INK), dx: 3, dy: -14 }
}

/** A pennant on the yard fence, waving. */
export function pennant(variant: number, f: number): PropSprite {
  const c = CLOTH[variant % CLOTH.length]!
  const b = createBitmap(14, 28)
  vline(b, 1, 0, 28, WOOD.d)
  set(b, 1, 0, GOLD.l)
  const wave = f % 2
  for (let y = 0; y < 9; y++) {
    const len = 10 - y + (y % 3 === wave ? 1 : 0)
    hline(b, 2, 2 + y, Math.max(1, len), y < 3 ? c.l : c.m)
  }
  return { bmp: outline(b, INK), dx: 1, dy: -14 }
}

/** A scoreboard for the yard (level 3+ pennants). */
export function scoreboard(): PropSprite {
  const b = createBitmap(20, 18)
  rect(b, 0, 0, 20, 12, WOOD.m)
  rect(b, 1, 1, 18, 10, hex('#2a3a2a'))
  for (let i = 0; i < 3; i++) hline(b, 3, 3 + i * 3, 6 + ((i * 5) % 8), LINEN.l)
  vline(b, 3, 12, 6, WOOD.d)
  vline(b, 16, 12, 6, WOOD.d)
  return { bmp: outline(b, INK), dx: -2, dy: -4 }
}

const MARBLE = ['#4a4452', '#6e6878', '#948ea0', '#bcb6c8', '#e0dbe8'].map(hex)

/** Carve a pixel: its brightness becomes a marble tone, with a faint wash of its colour. */
function statuePixel(c: RGBA, tint: number): RGBA {
  const [r, g, bl, a] = rgbaParts(c)
  if (a === 0) return 0
  const lum = (r * 0.3 + g * 0.59 + bl * 0.11) / 255
  const stone = MARBLE[Math.min(MARBLE.length - 1, Math.floor(lum * 1.15 * MARBLE.length))]!
  return mix(stone, packRgba(r, g, bl, 255), tint)
}

/** A fallen hero carved in stone, faintly painted in their colours, on a plinth. */
export function statue(look: HeroLook): PropSprite {
  const fig = drawHeroFrame(look, 'down', 0)
  const b = createBitmap(24, 42)
  for (let y = 0; y < fig.h; y++) for (let x = 0; x < fig.w; x++) {
    const c = fig.px[y * fig.w + x]!
    if (c !== 0) set(b, x, y, c === INK ? hex('#2a2432') : statuePixel(c, 0.16))
  }
  rect(b, 3, 30, 18, 12, STONE.m)
  hline(b, 3, 30, 18, STONE.l)
  vline(b, 20, 31, 11, STONE.d)
  rect(b, 7, 34, 10, 4, hex('#6a6272')) // the plaque
  hline(b, 8, 35, 8, GOLD.m)
  return { bmp: outline(b, INK), dx: -4, dy: -26 }
}
