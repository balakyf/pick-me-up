/**
 * Shape helpers for the big sprites (bosses, poses): filled polygons, thick strokes, and
 * `paint`, which fills a shape and shades it from its own silhouette — the edge facing the
 * light catches the light ramp, the far edge and the underside fall into shadow — so a
 * hand-placed outline reads as a solid form without placing every shade by hand. Pure.
 */
import { createBitmap, set, type Bitmap, type RGBA } from './bitmap'
import type { Ramp } from './palette'

export type Pt = readonly [number, number]

/** Scanline polygon fill (pixel centres, even–odd), clipped to the bitmap. */
export function poly(b: Bitmap, pts: readonly Pt[], c: RGBA): void {
  if (pts.length < 3) return
  let minY = Infinity
  let maxY = -Infinity
  for (const [, y] of pts) {
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(b.h - 1, Math.ceil(maxY)); y++) {
    const cy = y + 0.5
    const xs: number[] = []
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i]!
      const [x1, y1] = pts[(i + 1) % pts.length]!
      if ((y0 <= cy && y1 > cy) || (y1 <= cy && y0 > cy)) xs.push(x0 + ((cy - y0) / (y1 - y0)) * (x1 - x0))
    }
    xs.sort((a, b2) => a - b2)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]! - 0.5); x <= Math.floor(xs[k + 1]! - 0.5); x++) set(b, x, y, c)
    }
  }
}

/** A stroke `w` px thick from (x0, y0) to (x1, y1) (square brush). */
export function thick(b: Bitmap, x0: number, y0: number, x1: number, y1: number, w: number, c: RGBA): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  const o = Math.floor((w - 1) / 2)
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n)
    const y = Math.round(y0 + ((y1 - y0) * i) / n)
    for (let j = 0; j < w; j++) for (let k = 0; k < w; k++) set(b, x - o + k, y - o + j, c)
  }
}

/** A filled disc of radius r centred on (cx, cy). */
export function disc(b: Bitmap, cx: number, cy: number, r: number, c: RGBA): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r * r + r * 0.6) set(b, x, y, c)
    }
}

/** A one-pixel ring of radius r centred on (cx, cy), `from`..`to` in turns (0 = right, clockwise). */
export function arc(b: Bitmap, cx: number, cy: number, r: number, c: RGBA, from = 0, to = 1): void {
  const steps = Math.max(12, Math.round(r * 8))
  for (let i = 0; i <= steps; i++) {
    const a = (from + ((to - from) * i) / steps) * Math.PI * 2
    set(b, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), c)
  }
}

/** Checkerboard dither of two colours over a rectangle (a soft band between two ramps). */
export function dither(b: Bitmap, x: number, y: number, w: number, h: number, a: RGBA, c: RGBA): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (b.px[(y + j) * b.w + x + i] !== undefined) set(b, x + i, y + j, (i + j) % 2 ? a : c)
}

export interface ShadeOpts {
  /** Which side the light comes from (the side the figure faces). Default 'right'. */
  light?: 'left' | 'right'
  /** How many pixels deep the shadow rim on the dark side is. Default 1. */
  rim?: number
  /** Leave the interior flat (no top highlight). */
  flat?: boolean
}

/**
 * Fill whatever `draw` paints (any colour) with `ramp`, shaded by the silhouette: pixels on
 * the lit side's edge and the top take the light tone, pixels on the far side's edge
 * (`rim` deep) and the underside take the shadow. Only touches pixels the shape covers.
 */
export function paint(dst: Bitmap, draw: (mask: Bitmap) => void, ramp: Ramp, opts: ShadeOpts = {}): void {
  const m = createBitmap(dst.w, dst.h)
  draw(m)
  const lit = (opts.light ?? 'right') === 'right' ? 1 : -1
  const rim = opts.rim ?? 1
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.px[y * m.w + x] !== 0
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!on(x, y)) continue
      let c = ramp.m
      let dark = !on(x, y + 1)
      for (let k = 1; k <= rim && !dark; k++) if (!on(x - lit * k, y)) dark = true
      if (dark) c = ramp.d
      else if (!on(x + lit, y) || (!opts.flat && !on(x, y - 1))) c = ramp.l
      dst.px[y * dst.w + x] = c
    }
  }
}

/** Every pixel of `b` in colour `from` within the box becomes `to`. */
export function recolorIn(b: Bitmap, x: number, y: number, w: number, h: number, from: RGBA, to: RGBA): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < b.w && j < b.h && b.px[j * b.w + i] === from) b.px[j * b.w + i] = to
}

/**
 * The generic two-frame idle for a sprite drawn as one frame: the body above `cut` (a row)
 * sinks one pixel — a breath — while the legs below stay planted. `mode: 'hover'` bobs the
 * whole figure a pixel instead (floating things). Frame 0 is the sprite itself.
 */
export function idleFrame(src: Bitmap, mode: 'breathe' | 'hover', cut = Math.round(src.h * 0.55)): Bitmap {
  const out = createBitmap(src.w, src.h)
  const w = src.w
  if (mode === 'hover') {
    for (let y = 0; y < src.h - 1; y++) for (let x = 0; x < w; x++) out.px[(y + 1) * w + x] = src.px[y * w + x]!
    return out
  }
  out.px.set(src.px)
  for (let y = cut; y >= 1; y--) {
    for (let x = 0; x < w; x++) {
      const above = src.px[(y - 1) * w + x]!
      if (y === cut) {
        if (above !== 0) out.px[y * w + x] = above
      } else out.px[y * w + x] = above
    }
  }
  for (let x = 0; x < w; x++) out.px[x] = 0
  return out
}
