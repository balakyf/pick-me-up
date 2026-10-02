import { describe, expect, it } from 'vitest'
import { breakLigatures, canvasFont, FONT_STACK, plainText } from './canvasText'

describe('canvasText', () => {
  it('breaks every pair Pixelify Sans would fuse, and nothing else', () => {
    const out = breakLigatures('Take your first summon · party of five · Quality floor · official · staff')
    expect(out).not.toMatch(/f[fil]/)
    expect(out.replace(/‌/g, '')).toBe('Take your first summon · party of five · Quality floor · official · staff')
    expect(breakLigatures('Forge')).toBe('Forge')
    expect(breakLigatures('')).toBe('')
  })

  it('puts the digit face first in the canvas font', () => {
    expect(canvasFont(8)).toBe(`8px ${FONT_STACK}`)
    expect(canvasFont(12, 600)).toBe(`600 12px ${FONT_STACK}`)
    expect(FONT_STACK.startsWith("'PMU Digits'")).toBe(true)
  })

  it('sets the font and turns text rendering to plain where supported', () => {
    const ctx = { font: '', textRendering: 'auto' } as unknown as CanvasRenderingContext2D & { textRendering: string }
    plainText(ctx, canvasFont(10))
    expect(ctx.font).toBe(canvasFont(10))
    expect(ctx.textRendering).toBe('optimizeSpeed')
    const old = { font: '' } as unknown as CanvasRenderingContext2D
    plainText(old, canvasFont(10))
    expect('textRendering' in old).toBe(false)
  })
})
