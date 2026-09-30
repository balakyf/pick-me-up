import { describe, expect, it } from 'vitest'
import { CLEAR } from './bitmap'
import { bgTheme, BG_H, BG_W, drawBattleBg, drawBattleLayers, HORIZON, LAYER_ORDER } from './battleBg'

const FLOORS = [0, 5, 10, 15, 20, 25, 30, 33, 45, 50, 75, 85, 90, 95, 100]

describe('battle backdrop layers', () => {
  it('maps floors to their act backdrop, anchors first', () => {
    expect(bgTheme(1)).toBe('prairie')
    expect(bgTheme(10)).toBe('fallingCity')
    expect(bgTheme(19)).toBe('ruins')
    expect(bgTheme(30)).toBe('statue')
    expect(bgTheme(34)).toBe('coast')
    expect(bgTheme(69)).toBe('war')
    expect(bgTheme(90)).toBe('worldsEnd')
    expect(bgTheme(99)).toBe('unfinished')
    expect(bgTheme(100)).toBe('summit')
    expect(bgTheme(-1)).toBe('depths')
  })

  it('every backdrop has an opaque sky, a solid ground and at least one layer that moves', () => {
    for (const f of FLOORS) {
      const L = drawBattleLayers(f)
      for (const name of LAYER_ORDER) {
        const b = L[name]
        if (b) expect([b.w, b.h], `${f} ${name}`).toEqual([BG_W, BG_H])
      }
      expect(Array.from(L.sky.px).every((c) => c !== CLEAR), `${f} sky`).toBe(true)
      for (let y = HORIZON; y < BG_H; y += 7) for (let x = 0; x < BG_W; x += 13) expect(L.ground.px[y * BG_W + x], `${f} ground`).not.toBe(CLEAR)
      // The ground is see-through above the horizon, so the scenery shows.
      expect(L.ground.px[(HORIZON - 20) * BG_W + 10]).toBe(CLEAR)
      expect(!!(L.drift || L.far || L.mid || L.fog), `${f} parallax`).toBe(true)
    }
  })

  it('the swamp and the coast roll mist over the horizon', () => {
    expect(drawBattleLayers(25).fog).not.toBeNull()
    expect(drawBattleLayers(33).fog).not.toBeNull()
    expect(drawBattleLayers(5).fog).toBeNull()
  })

  it('flattens into one opaque backdrop', () => {
    const b = drawBattleBg(25)
    expect(Array.from(b.px).every((c) => (c & 255) === 255)).toBe(true)
  })
})
