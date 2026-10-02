import { describe, expect, it } from 'vitest'
import { placeBubble, shelterRects, toCanvasRect } from './overlayLayout'

describe('lobby overlay layout', () => {
  it('a bubble that would sit under the HUD drops below it; others stay put', () => {
    const hud = [{ x: 200, y: 0, w: 180, h: 20 }]
    const under = placeBubble({ x: 250, y: 5, w: 60, h: 14 }, hud, 400, 240)
    expect(under.y).toBe(22)
    expect(under.moved).toBe(true)
    const free = placeBubble({ x: 20, y: 5, w: 60, h: 14 }, hud, 400, 240)
    expect(free).toMatchObject({ x: 20, y: 5, moved: false })
  })

  it('near the bottom HUD a bubble or label lifts above it instead', () => {
    const help = [{ x: 0, y: 225, w: 200, h: 12 }]
    const label = placeBubble({ x: 40, y: 220, w: 60, h: 10 }, help, 400, 240)
    expect(label.y + label.h).toBeLessThanOrEqual(225)
  })

  it('a bubble stays on screen sideways and at the bottom', () => {
    expect(placeBubble({ x: -10, y: 50, w: 60, h: 14 }, [], 400, 240).x).toBe(1)
    expect(placeBubble({ x: 380, y: 50, w: 60, h: 14 }, [], 400, 240).x).toBe(339)
    expect(placeBubble({ x: 10, y: 300, w: 60, h: 14 }, [], 400, 240).y).toBe(225)
  })

  it('maps a DOM box into canvas pixels', () => {
    const r = toCanvasRect({ left: 110, top: 20, width: 60, height: 30 }, { left: 10, top: 0, width: 800, height: 480 }, 400, 240)
    expect(r).toEqual({ x: 50, y: 10, w: 30, h: 15 })
  })

  it('only buildings with an open roof shelter from the weather', () => {
    const b = [
      { id: 'hall', rect: { x: 2, y: 3, w: 4, h: 2 } },
      { id: 'tavern', rect: { x: 10, y: 3, w: 4, h: 2 } },
    ]
    const open = shelterRects(b, (id) => (id === 'hall' ? 0 : 1), 16, 10, 8, 4)
    expect(open).toEqual([{ x: 24, y: 34, w: 64, h: 42 }])
  })
})
