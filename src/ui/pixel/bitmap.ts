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

// ─────────────────────────────────────────────────────────────────────────────
// Light & motion passes (spec 2026-10-12 S10/V8). Every pass is PURE: it returns
// a fresh bitmap and never mutates its input (enemy bitmaps are cached and
// shared). `outline` above is deliberately untouched.
// ─────────────────────────────────────────────────────────────────────────────

/** Bounding box of the opaque pixels, or null for an empty bitmap. */
export function opaqueBounds(b: Bitmap): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = b.w
  let y0 = b.h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (b.px[y * b.w + x] === CLEAR) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

/** Integer luma (0..255) of a colour — Rec. 601 weights. */
export function luma(c: RGBA): number {
  const [r, g, bl] = rgbaParts(c)
  return Math.round((r * 299 + g * 587 + bl * 114) / 1000)
}

/**
 * The hit flash: mix every opaque pixel toward `white` by `amt` (0..1), leaving
 * pixels equal to `keep` (the outline ink) alone so the silhouette still reads.
 */
export function flashWhite(b: Bitmap, amt = 1, keep: RGBA | null = null, white: RGBA = 0xffffffff): Bitmap {
  const out = clone(b)
  const t = Math.max(0, Math.min(1, amt))
  for (let i = 0; i < out.px.length; i++) {
    const c = out.px[i]!
    if (c === CLEAR || c === keep) continue
    out.px[i] = mix(c, white, t)
  }
  return out
}

/**
 * Lean: a horizontal shear anchored on the lowest opaque row (the feet stay put).
 * `dx` is how far the TOP opaque row moves (+ → right). The shift is clamped to the
 * empty margin so nothing is ever clipped off the bitmap.
 */
export function shear(b: Bitmap, dx: number): Bitmap {
  const box = opaqueBounds(b)
  const out = createBitmap(b.w, b.h)
  if (!box) return out
  const k = Math.max(-box.x0, Math.min(b.w - 1 - box.x1, Math.round(dx)))
  const span = Math.max(1, box.y1 - box.y0)
  for (let y = 0; y < b.h; y++) {
    const off = y < box.y0 ? k : Math.round((k * (box.y1 - y)) / span)
    for (let x = 0; x < b.w; x++) {
      const c = b.px[y * b.w + x]!
      if (c === CLEAR) continue
      const nx = x + off
      if (nx >= 0 && nx < b.w) out.px[y * b.w + nx] = c
    }
  }
  return out
}

/**
 * Squash & stretch: nearest-neighbour rescale of the opaque content by (sx, sy),
 * anchored at its bottom-centre (the ground contact). Factors are clamped so the
 * result always fits inside the original bitmap — sizes never change, so battle
 * layout doesn't either.
 */
export function squash(b: Bitmap, sx: number, sy: number): Bitmap {
  const box = opaqueBounds(b)
  const out = createBitmap(b.w, b.h)
  if (!box) return out
  const w = box.x1 - box.x0 + 1
  const h = box.y1 - box.y0 + 1
  const cx = (box.x0 + box.x1 + 1) / 2
  const maxSx = Math.min(b.w / w, (2 * Math.min(cx, b.w - cx)) / w)
  const maxSy = (box.y1 + 1) / h
  const kx = Math.max(0.25, Math.min(sx, maxSx))
  const ky = Math.max(0.25, Math.min(sy, maxSy))
  const nw = Math.max(1, Math.round(w * kx))
  const nh = Math.max(1, Math.round(h * ky))
  const left = Math.round(cx - nw / 2)
  const top = box.y1 + 1 - nh
  for (let y = 0; y < nh; y++) {
    const syy = box.y0 + Math.min(h - 1, Math.floor((y * h) / nh))
    for (let x = 0; x < nw; x++) {
      const sxx = box.x0 + Math.min(w - 1, Math.floor((x * w) / nw))
      const c = b.px[syy * b.w + sxx]!
      if (c !== CLEAR) set(out, left + x, top + y, c)
    }
  }
  return out
}

export type RimSide = 'left' | 'right' | 'top' | 'all'

/**
 * Rim light: brighten the first body pixel inside the silhouette on `side`
 * (the pixel whose neighbour that way is empty or outline `ink`) toward `color`.
 */
export function rimLight(b: Bitmap, side: RimSide, color: RGBA, amt = 0.5, ink: RGBA | null = null): Bitmap {
  const out = clone(b)
  const dirs: [number, number][] =
    side === 'left' ? [[-1, 0]] : side === 'right' ? [[1, 0]] : side === 'top' ? [[0, -1]] : [[-1, 0], [1, 0], [0, -1]]
  const edge = (c: RGBA) => c === CLEAR || c === ink
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const c = b.px[y * b.w + x]!
      if (edge(c)) continue
      if (dirs.some(([dx, dy]) => edge(get(b, x + dx, y + dy)))) out.px[y * b.w + x] = mix(c, color, amt)
    }
  }
  return out
}

/**
 * Colour grade: pull every opaque pixel toward `tint` re-lit to the pixel's own
 * luma (so shading survives), by `amt` 0..1. The per-act backdrop pass.
 */
export function grade(b: Bitmap, tint: RGBA, amt: number): Bitmap {
  const out = clone(b)
  const [tr, tg, tb] = rgbaParts(tint)
  const tl = Math.max(1, luma(tint))
  for (let i = 0; i < out.px.length; i++) {
    const c = out.px[i]!
    if (c === CLEAR) continue
    const l = luma(c)
    const k = l / tl
    const target = packRgba(Math.min(255, Math.round(tr * k)), Math.min(255, Math.round(tg * k)), Math.min(255, Math.round(tb * k)), 255)
    out.px[i] = mix(c, target, amt)
  }
  return out
}

/** Chroma of a colour, 0..1 (max − min channel). */
export function chroma(c: RGBA): number {
  const [r, g, bl] = rgbaParts(c)
  return (Math.max(r, g, bl) - Math.min(r, g, bl)) / 255
}

/**
 * Saturation cap (the Octopath warning): any pixel whose chroma exceeds `max` is
 * pulled toward its own grey until it doesn't. Calmer pixels are untouched.
 */
export function capSaturation(b: Bitmap, max: number): Bitmap {
  const out = clone(b)
  for (let i = 0; i < out.px.length; i++) {
    const c = out.px[i]!
    if (c === CLEAR) continue
    const ch = chroma(c)
    if (ch <= max) continue
    const l = luma(c)
    out.px[i] = mix(c, packRgba(l, l, l, c & 255), 1 - max / ch)
  }
  return out
}

/**
 * A stepped, dithered vignette: darken toward `dark` with distance from the centre
 * (elliptical). Hard bands (6 by default) with a checker dither between them — the same
 * grammar as the SNES skies, so it never reads as a smooth modern gradient.
 */
export function vignette(b: Bitmap, strength: number, dark: RGBA, inner = 0.55, bands = 6): Bitmap {
  const out = clone(b)
  const cx = b.w / 2
  const cy = b.h / 2
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const i = y * b.w + x
      const c = out.px[i]!
      if (c === CLEAR) continue
      const dx = (x + 0.5 - cx) / cx
      const dy = (y + 0.5 - cy) / cy
      const d = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2
      if (d <= inner) continue
      const f = Math.min(1, (d - inner) / (1 - inner))
      const pos = f * bands
      let band = Math.floor(pos)
      if (pos - band > 0.5 && (x + y) % 2 === 0) band += 1
      const t = (Math.min(bands, band) / bands) * strength
      if (t > 0) out.px[i] = mix(c, dark, t)
    }
  }
  return out
}
