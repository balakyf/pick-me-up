import { describe, it, expect } from 'vitest'
import {
  MAX_FIREFLIES,
  MAX_LEAVES,
  MAX_PARTICLES,
  TINT_MAX_ALPHA,
  ambienceParticles,
  drawAmbience,
  nightOf,
  nightness,
  particleCounts,
  renderAmbience,
  skyTint,
  type AmbienceCtx,
  type AmbienceFrame,
} from './ambience'

/** A canvas stand-in that records what was drawn. */
function recorder() {
  const calls: { rect: [number, number, number, number]; fill: string; alpha: number; op: string }[] = []
  const ctx = {
    fillStyle: '#000' as string | CanvasGradient | CanvasPattern,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ rect: [x, y, w, h], fill: String(this.fillStyle), alpha: this.globalAlpha, op: this.globalCompositeOperation })
    },
  }
  return { ctx: ctx as unknown as AmbienceCtx & CanvasRenderingContext2D, calls }
}

const frame = (nowReal = 1_700_000_000_000): AmbienceFrame => ({ nowReal, view: { camX: 120, camY: 80, w: 320, h: 180 }, zoom: 3 })

describe('time-of-day tint', () => {
  it('is clear at midday, warm at golden hour, blue at night', () => {
    expect(skyTint(10).a).toBe(0)
    const golden = skyTint(17.5)
    expect(golden.r).toBeGreaterThan(golden.b)
    const night = skyTint(1)
    expect(night.b).toBeGreaterThan(night.r)
  })

  it('never exceeds the alpha cap and wraps around midnight', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const t = skyTint(h)
      expect(t.a).toBeGreaterThanOrEqual(0)
      expect(t.a).toBeLessThanOrEqual(TINT_MAX_ALPHA)
    }
    expect(skyTint(24)).toEqual(skyTint(0))
    expect(skyTint(-1)).toEqual(skyTint(23))
  })
})

describe('night and particle budget', () => {
  it('follows the lobby lighting curve', () => {
    expect(nightOf(12)).toBe(0)
    expect(nightOf(2)).toBe(1)
    expect(nightOf(18.5)).toBeCloseTo(0.5)
    expect(nightOf(6)).toBeCloseTo(0.5)
  })

  it('the world clock leads; the player\'s own night adds half', () => {
    expect(nightness(23, 12)).toBe(1)
    expect(nightness(12, 23)).toBe(0.5)
    expect(nightness(12, 12)).toBe(0)
  })

  it('fireflies at night, leaves by day, never more than 40', () => {
    for (let n = 0; n <= 1; n += 0.05) {
      const c = particleCounts(n)
      expect(c.fireflies + c.leaves).toBeLessThanOrEqual(MAX_PARTICLES)
      expect(c.fireflies).toBeLessThanOrEqual(MAX_FIREFLIES)
      expect(c.leaves).toBeLessThanOrEqual(MAX_LEAVES)
    }
    expect(particleCounts(0).fireflies).toBe(0)
    expect(particleCounts(0).leaves).toBe(MAX_LEAVES)
    expect(particleCounts(1).fireflies).toBe(MAX_FIREFLIES)
    expect(particleCounts(1).leaves).toBeLessThan(MAX_LEAVES / 2)
    expect(particleCounts(1, true).leaves).toBe(0) // reduced motion: no frozen leaves
  })
})

describe('particles', () => {
  const view = { camX: 500, camY: 300, w: 320, h: 180 }

  it('are deterministic (hash-based, no Math.random)', () => {
    const c = particleCounts(0.6)
    expect(ambienceParticles(42.5, view, c)).toEqual(ambienceParticles(42.5, view, c))
  })

  it('stay inside the padded viewport field', () => {
    for (const t of [0, 13.7, 999.2, 86_000]) {
      for (const p of ambienceParticles(t, view, particleCounts(0.6))) {
        expect(p.x).toBeGreaterThanOrEqual(-24)
        expect(p.x).toBeLessThanOrEqual(view.w + 24)
        expect(p.y).toBeGreaterThanOrEqual(-24)
        expect(p.y).toBeLessThanOrEqual(view.h + 24)
        expect(p.alpha).toBeGreaterThan(0)
        expect(p.alpha).toBeLessThanOrEqual(1)
      }
    }
  })

  it('move over time, and hold still under reduced motion', () => {
    const c = particleCounts(0.5)
    const a = ambienceParticles(10, view, c)
    const b = ambienceParticles(14, view, c)
    expect(b.filter((p, i) => p.x !== a[i]!.x || p.y !== a[i]!.y).length).toBeGreaterThan(a.length / 2)
    expect(ambienceParticles(10, view, c, true)).toEqual(ambienceParticles(14, view, c, true))
  })

  it('are anchored in the world: panning the camera shifts them the other way', () => {
    const c = { fireflies: 0, leaves: 8 }
    const a = ambienceParticles(5, view, c)
    const b = ambienceParticles(5, { ...view, camX: view.camX + 3 }, c)
    const shifted = b.filter((p, i) => p.x === a[i]!.x - 3).length
    expect(shifted).toBeGreaterThanOrEqual(6) // all but any that wrapped
  })
})

describe('renderAmbience / drawAmbience', () => {
  it('draws a night: the tint, then glowing fireflies, then restores the context', () => {
    const { ctx, calls } = recorder()
    const n = renderAmbience(ctx, frame(), { realHour: 23, worldHour: 23 })
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThanOrEqual(MAX_PARTICLES)
    expect(calls[0]!.rect).toEqual([0, 0, 320, 180])
    expect(calls[0]!.fill).toMatch(/^rgba\(/)
    expect(calls.some((c) => c.op === 'lighter')).toBe(true)
    expect(ctx.globalAlpha).toBe(1)
    expect(ctx.globalCompositeOperation).toBe('source-over')
  })

  it('a clear morning draws no tint and only leaves', () => {
    const { ctx, calls } = recorder()
    renderAmbience(ctx, frame(), { realHour: 10, worldHour: 10 })
    expect(calls.every((c) => !(c.rect[2] === 320 && c.rect[3] === 180))).toBe(true)
    expect(calls.every((c) => c.op === 'source-over')).toBe(true)
  })

  it('no-ops where there is no real canvas (node, jsdom)', () => {
    const { ctx, calls } = recorder()
    drawAmbience(ctx, frame())
    expect(calls).toHaveLength(0)
  })
})
