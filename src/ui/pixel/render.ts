/**
 * The ONLY bridge from pure bitmaps to the browser. Converts a Bitmap into a
 * <canvas> (for game-loop drawImage) or a data URL (for <img> in React), caching
 * by a caller-supplied key. In non-browser/jsdom environments it degrades to
 * no-ops so the UI still mounts under tests.
 */
import type { Bitmap } from './bitmap'

let canvasOk: boolean | null = null

export function canvasAvailable(): boolean {
  if (canvasOk !== null) return canvasOk
  canvasOk =
    typeof document !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !/jsdom/i.test(navigator.userAgent)
  return canvasOk
}

const canvasCache = new Map<string, HTMLCanvasElement>()
const urlCache = new Map<string, string>()

export function bitmapToCanvas(b: Bitmap): HTMLCanvasElement | null {
  if (!canvasAvailable()) return null
  const cv = document.createElement('canvas')
  cv.width = b.w
  cv.height = b.h
  const ctx = cv.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(b.w, b.h)
  const d = img.data
  for (let i = 0; i < b.px.length; i++) {
    const c = b.px[i]!
    d[i * 4] = (c >>> 24) & 255
    d[i * 4 + 1] = (c >>> 16) & 255
    d[i * 4 + 2] = (c >>> 8) & 255
    d[i * 4 + 3] = c & 255
  }
  ctx.putImageData(img, 0, 0)
  return cv
}

/** Cached canvas for `key`, built on first request by `make`. */
export function cachedCanvas(key: string, make: () => Bitmap): HTMLCanvasElement | null {
  const hit = canvasCache.get(key)
  if (hit) return hit
  const cv = bitmapToCanvas(make())
  if (cv) canvasCache.set(key, cv)
  return cv
}

/** Cached data URL for `key` ('' when canvas is unavailable). */
export function cachedDataUrl(key: string, make: () => Bitmap): string {
  const hit = urlCache.get(key)
  if (hit !== undefined) return hit
  const cv = cachedCanvas(key, make)
  const url = cv ? cv.toDataURL() : ''
  if (cv) urlCache.set(key, url)
  return url
}
