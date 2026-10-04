/**
 * Lane O's mission objects, as deterministic pixel bitmaps (lane rule 12): the Siege Ram the
 * Master's army drives at the Wailing Wall (F80), and the Al Ragna banner left on F86. Both
 * are things, not people: they draw as one frame (sprites.ts ALLY_OBJECTS).
 */
import { createBitmap, ellipse, hex, hline, outline, rect, vline, line, type Bitmap } from '../pixel/bitmap'
import { GOLD, INK, STEEL, WOOD } from '../pixel/palette'

/** The Siege Ram: an iron-shod log slung under a roofed frame on four wheels. 32×28. */
export function drawSiegeRam(): Bitmap {
  const b = createBitmap(32, 28)
  // The roof (hides on its frame), sloped.
  for (let i = 0; i < 6; i++) hline(b, 6 - i, 4 + i, 18 + 2 * i, i < 2 ? hex('#7a5a3a') : hex('#5e4430'))
  // The frame's posts.
  vline(b, 5, 10, 10, WOOD.d)
  vline(b, 26, 10, 10, WOOD.d)
  hline(b, 4, 19, 24, WOOD.m)
  // The log on its chains, its iron head pointing left (at the gate).
  vline(b, 11, 10, 3, STEEL.d)
  vline(b, 21, 10, 3, STEEL.d)
  rect(b, 4, 13, 24, 4, WOOD.m)
  hline(b, 4, 13, 24, WOOD.l)
  rect(b, 1, 12, 5, 6, STEEL.m)
  hline(b, 1, 12, 5, STEEL.l)
  rect(b, 0, 14, 2, 2, STEEL.d)
  // Four wheels.
  for (const x of [5, 12, 19, 25]) {
    ellipse(b, x - 2, 20, 6, 6, WOOD.d)
    rect(b, x, 22, 2, 2, STEEL.l)
  }
  return outline(b, INK)
}

/** The Al Ragna banner: a gold standard on a pole, a crown on crimson. 20×32. */
export function drawAlRagnaBanner(): Bitmap {
  const b = createBitmap(20, 32)
  // The pole and its finial.
  vline(b, 4, 2, 29, WOOD.d)
  vline(b, 5, 2, 29, WOOD.m)
  rect(b, 3, 0, 4, 3, GOLD.l)
  // The cloth, swallow-tailed.
  rect(b, 6, 4, 12, 16, hex('#8c1c2c'))
  hline(b, 6, 4, 12, hex('#b02a3a'))
  for (let i = 0; i < 4; i++) {
    hline(b, 6, 20 + i, 5 - i, hex('#8c1c2c'))
    hline(b, 13 + i, 20 + i, 5 - i, hex('#8c1c2c'))
  }
  // The golden crown of the bloodline.
  rect(b, 9, 10, 6, 4, GOLD.m)
  vline(b, 9, 8, 2, GOLD.l)
  vline(b, 12, 7, 3, GOLD.l)
  vline(b, 14, 8, 2, GOLD.l)
  line(b, 9, 14, 14, 14, GOLD.d)
  // The base stone.
  rect(b, 1, 29, 9, 3, hex('#6e6678'))
  return outline(b, INK)
}
