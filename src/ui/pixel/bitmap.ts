/**
 * Pure pixel bitmaps — the data layer under every sprite, tile and portrait.
 *
 * Colours are packed 0xRRGGBBAA unsigned ints; 0 is fully transparent. Nothing in
 * this module touches the DOM, so every generator built on it is unit-testable in
 * node and deterministic. `render.ts` is the only bridge to <canvas>.
 */

export type RGBA = number

export interface Bitmap {
  readonly w: number
  readonly h: number
  readonly px: Uint32Array
}

export const CLEAR: RGBA = 0

export function createBitmap(w: number, h: number): Bitmap {
  return { w, h, px: new Uint32Array(w * h) }
}

/** '#rrggbb' or '#rrggbbaa' → packed RGBA. */
export function hex(s: string): RGBA {
  const t = s.replace('#', '')
  const n = parseInt(t.length === 6 ? t + 'ff' : t, 16)
  return n >>> 0
}

export function rgbaParts(c: RGBA): [number, number, number, number] {
  return [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255]
}

export function packRgba(r: number, g: number, b: number, a = 255): RGBA {
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0
}

/** Linear mix of two colours; t=0 → a, t=1 → b. Alpha taken from a. */
export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  const [ar, ag, ab, aa] = rgbaParts(a)
  const [br, bg, bb] = rgbaParts(b)
  return packRgba(
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t),
    aa,
  )
}

export function withAlpha(c: RGBA, a: number): RGBA {
  return ((c & 0xffffff00) | (a & 255)) >>> 0
}

export function get(b: Bitmap, x: number, y: number): RGBA {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return CLEAR
  return b.px[y * b.w + x]!
}

export function set(b: Bitmap, x: number, y: number, c: RGBA): void {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return
  b.px[y * b.w + x] = c
}

/** Filled rectangle, clipped to the bitmap. */
export function rect(b: Bitmap, x: number, y: number, w: number, h: number, c: RGBA): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(b, x + i, y + j, c)
}

export function hline(b: Bitmap, x: number, y: number, len: number, c: RGBA): void {
  rect(b, x, y, len, 1, c)
}

export function vline(b: Bitmap, x: number, y: number, len: number, c: RGBA): void {
  rect(b, x, y, 1, len, c)
}

/** Filled axis-aligned ellipse inside the box (x, y, w, h). */
export function ellipse(b: Bitmap, x: number, y: number, w: number, h: number, c: RGBA): void {
  const rx = w / 2
  const ry = h / 2
  const cx = x + rx
  const cy = y + ry
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const dx = (x + i + 0.5 - cx) / rx
      const dy = (y + j + 0.5 - cy) / ry
      if (dx * dx + dy * dy <= 1) set(b, x + i, y + j, c)
    }
  }
}

/** Rectangle with the four corner pixels cut — the basic chibi "rounded" block. */
export function roundRect(b: Bitmap, x: number, y: number, w: number, h: number, c: RGBA): void {
  rect(b, x + 1, y, w - 2, h, c)
  rect(b, x, y + 1, 1, h - 2, c)
  rect(b, x + w - 1, y + 1, 1, h - 2, c)
}

/** Pixel line (Bresenham). */
export function line(b: Bitmap, x0: number, y0: number, x1: number, y1: number, c: RGBA): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1)
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    set(b, x0, y0, c)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
}

/** Replace every pixel of colour `from` with `to` (palette swaps). */
export function recolor(b: Bitmap, from: RGBA, to: RGBA): void {
  for (let i = 0; i < b.px.length; i++) if (b.px[i] === from) b.px[i] = to
}

export function clone(b: Bitmap): Bitmap {
  return { w: b.w, h: b.h, px: new Uint32Array(b.px) }
}

export function flipX(b: Bitmap): Bitmap {
  const out = createBitmap(b.w, b.h)
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) out.px[y * b.w + (b.w - 1 - x)] = b.px[y * b.w + x]!
  return out
}

/** Copy `src` onto `dst` at (dx, dy); transparent source pixels are skipped. */
export function blit(dst: Bitmap, src: Bitmap, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const c = src.px[y * src.w + x]!
      if (c !== CLEAR) set(dst, dx + x, dy + y, c)
    }
  }
}

/**
 * Draw a 1px outline in `color` around every opaque region (4-neighbourhood).
 * The SNES look: every sprite reads against any floor because of this pass.
 */
export function outline(b: Bitmap, color: RGBA): Bitmap {
  const out = clone(b)
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (get(b, x, y) !== CLEAR) continue
      if (get(b, x - 1, y) || get(b, x + 1, y) || get(b, x, y - 1) || get(b, x, y + 1)) {
        out.px[y * b.w + x] = color
      }
    }
  }
  return out
}

/** Nearest-neighbour integer upscale (for previews/thumbnails only). */
export function scale(b: Bitmap, k: number): Bitmap {
  const out = createBitmap(b.w * k, b.h * k)
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.px[y * out.w + x] = b.px[Math.floor(y / k) * b.w + Math.floor(x / k)]!
  return out
}

/** Count of non-transparent pixels (used by tests). */
export function opaqueCount(b: Bitmap): number {
  let n = 0
  for (let i = 0; i < b.px.length; i++) if (b.px[i] !== CLEAR) n++
  return n
}
