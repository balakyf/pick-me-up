import { describe, expect, it } from 'vitest'
import { opaqueCount } from '../pixel/bitmap'
import { DIORAMA_H, DIORAMA_W, drawCampfire, drawDioramaBase, drawDioramaLights, drawDioramaStars, FIRE_H, FIRE_W } from './diorama'

describe('the title diorama', () => {
  it('the base fills the frame; the overlays share its size and are mostly transparent', () => {
    const base = drawDioramaBase()
    expect([base.w, base.h]).toEqual([DIORAMA_W, DIORAMA_H])
    expect(opaqueCount(base)).toBe(DIORAMA_W * DIORAMA_H)
    for (const layer of [drawDioramaStars(0), drawDioramaStars(1), drawDioramaLights()]) {
      expect([layer.w, layer.h]).toEqual([DIORAMA_W, DIORAMA_H])
      const n = opaqueCount(layer)
      expect(n).toBeGreaterThan(20)
      expect(n).toBeLessThan((DIORAMA_W * DIORAMA_H) / 10)
    }
  })

  it('is pure: the same pixels every time (the cache keys are fixed)', () => {
    expect(drawDioramaBase().px).toEqual(drawDioramaBase().px)
    expect(drawDioramaStars(1).px).toEqual(drawDioramaStars(1).px)
    expect(drawCampfire(0).px).toEqual(drawCampfire(0).px)
  })

  it('the two star frames and the two fire frames differ (so stacking them animates)', () => {
    expect(drawDioramaStars(0).px).not.toEqual(drawDioramaStars(1).px)
    const f0 = drawCampfire(0)
    const f1 = drawCampfire(1)
    expect([f0.w, f0.h]).toEqual([FIRE_W, FIRE_H])
    expect(f0.px).not.toEqual(f1.px)
    expect(opaqueCount(f0)).toBeGreaterThan(30)
  })
})
