import { describe, expect, it } from 'vitest'
import { blockMs, curtainDelays, curtainGrid, transitionFor, TRANSITION_MS } from './transition'

describe('transitionFor', () => {
  it('nothing on the first scene or when the scene stays', () => {
    expect(transitionFor(null, 'lobby', false)).toEqual({ style: 'none', ms: 0 })
    expect(transitionFor('tower', 'tower', false).style).toBe('none')
  })
  it('a wipe between rooms, an iris into a battle, its results and the summoning circle', () => {
    expect(transitionFor('lobby', 'tower', false)).toEqual({ style: 'wipe', ms: TRANSITION_MS.wipe })
    expect(transitionFor('title', 'lobby', false).style).toBe('wipe')
    expect(transitionFor('tower', 'battle', false)).toEqual({ style: 'iris', ms: TRANSITION_MS.iris })
    expect(transitionFor('battle', 'results', false).style).toBe('iris')
    expect(transitionFor('lobby', 'summon', false).style).toBe('iris')
    expect(transitionFor('results', 'tower', false).style).toBe('wipe')
  })
  it('reduced motion: a short fade, never a wipe or an iris', () => {
    for (const to of ['tower', 'battle', 'results', 'summon'] as const) expect(transitionFor('lobby', to, true)).toEqual({ style: 'fade', ms: TRANSITION_MS.fade })
    expect(transitionFor(null, 'lobby', true).style).toBe('none')
  })
})

describe('the curtain', () => {
  it('a grid of square-ish blocks for any viewport', () => {
    for (const [w, h] of [
      [1280, 800],
      [390, 844],
      [844, 390],
      [0, 0],
    ] as const) {
      const g = curtainGrid(w, h)
      expect(g.cols).toBeGreaterThanOrEqual(10)
      expect(g.cols).toBeLessThanOrEqual(20)
      expect(g.rows).toBeGreaterThanOrEqual(6)
      if (w > 0) expect(g.rows * (w / g.cols)).toBeGreaterThanOrEqual(h) // covers the height
    }
  })

  it('every block finishes inside the transition; a wipe runs corner to corner, an iris opens from the centre', () => {
    const wipe = transitionFor('lobby', 'tower', false)
    const iris = transitionFor('tower', 'battle', false)
    const cols = 16
    const rows = 10
    for (const plan of [wipe, iris]) {
      const d = curtainDelays(plan, cols, rows)
      expect(d).toHaveLength(cols * rows)
      for (const x of d) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x + blockMs(plan)).toBeLessThanOrEqual(plan.ms)
      }
    }
    const w = curtainDelays(wipe, cols, rows)
    expect(w[0]!).toBeLessThan(w[cols * rows - 1]!) // top-left before bottom-right
    const i = curtainDelays(iris, cols, rows)
    const centre = i[5 * cols + 8]!
    expect(centre).toBeLessThan(i[0]!)
    expect(centre).toBeLessThan(i[cols * rows - 1]!)
    // Pure: the same grid twice.
    expect(curtainDelays(wipe, cols, rows)).toEqual(w)
  })

  it('a fade has no blocks to stagger', () => {
    expect(new Set(curtainDelays({ style: 'fade', ms: 180 }, 4, 4))).toEqual(new Set([0]))
  })
})
