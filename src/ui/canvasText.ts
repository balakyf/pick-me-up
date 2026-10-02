/**
 * Text drawn on a canvas (roof signs, speech bubbles, site labels) follows the same rules
 * as the page: the digit face first, and no ligatures. CSS can't reach canvas text, so
 * each draw goes through `plainText` (Chrome's canvas `textRendering = 'optimizeSpeed'`
 * turns ligatures off) and the strings through `breakLigatures`, which slips a zero-width
 * non-joiner between the pairs Pixelify Sans would fuse (ff, fi, fl, ffi, ffl) for the
 * browsers that ignore `textRendering` on canvas.
 */

/** The UI font stack, digits first (see fonts.css). */
export const FONT_STACK = `'PMU Digits', 'Pixelify Sans', 'Courier New', monospace`

/** A canvas `font` string in the UI stack. */
export function canvasFont(px: number, weight: 400 | 600 = 400): string {
  return `${weight === 600 ? '600 ' : ''}${px}px ${FONT_STACK}`
}

const ZWNJ = '‌'

/** `first floor` → `f‌irst f‌loor`: the same letters, never fused into a ligature. */
export function breakLigatures(text: string): string {
  return text.replace(/f(?=[fil])/g, 'f' + ZWNJ)
}

/** Prepare a context for UI text: the font, and ligatures off where the browser allows. */
export function plainText(ctx: CanvasRenderingContext2D, font: string): void {
  ctx.font = font
  const c = ctx as CanvasRenderingContext2D & { textRendering?: string }
  if ('textRendering' in c) c.textRendering = 'optimizeSpeed'
}
