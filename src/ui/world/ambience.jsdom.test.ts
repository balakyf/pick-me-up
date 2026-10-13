// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { drawAmbience } from './ambience'

describe('lobby ambience under jsdom', () => {
  it('is a silent no-op (no canvas calls, no throw)', () => {
    let calls = 0
    const ctx = new Proxy(
      {},
      {
        get: () => () => {
          calls++
        },
        set: () => {
          calls++
          return true
        },
      },
    ) as unknown as CanvasRenderingContext2D
    expect(() => drawAmbience(ctx, { nowReal: Date.now(), view: { camX: 0, camY: 0, w: 320, h: 180 }, zoom: 3 })).not.toThrow()
    expect(calls).toBe(0)
  })
})
