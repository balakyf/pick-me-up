/**
 * Codex art: the generated enemy sprites, and a dark silhouette of the same shape for
 * enemies the Master has not met yet. Pure bitmap work + the shared data-URL cache.
 */
import type { Element } from '../../engine/types'
import { createBitmap, hex, outline, scale, type Bitmap } from '../pixel/bitmap'
import { drawEnemy } from '../pixel/enemySprite'
import { cachedDataUrl } from '../pixel/render'

const SHADOW = hex('#1a1432')
const SHADOW_RIM = hex('#3e3478')

/** Every opaque pixel filled with one dark tone, rimmed so the shape still reads. */
export function silhouette(b: Bitmap): Bitmap {
  const out = createBitmap(b.w, b.h)
  for (let i = 0; i < b.px.length; i++) if ((b.px[i]! & 0xff) !== 0) out.px[i] = SHADOW
  return outline(out, SHADOW_RIM)
}

/** The codex portrait of a template (×2), or its silhouette while unseen. */
export function codexSpriteUrl(templateId: string, element: Element, seen: boolean): string {
  return cachedDataUrl(`codex|${templateId}|${seen ? 1 : 0}`, () => {
    const b = drawEnemy(templateId, element)
    return scale(seen ? b : silhouette(b), 2)
  })
}
