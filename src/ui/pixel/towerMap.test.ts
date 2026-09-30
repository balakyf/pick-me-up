import { describe, it, expect } from 'vitest'
import { drawTowerExterior, floorRow, towerDamage, TOWER_W } from './towerMap'
import { get } from './bitmap'

const look = { current: 50, highest: 49, worldEnded: false, worldSaved: false }
const rowPixels = (b: ReturnType<typeof drawTowerExterior>, y0: number, y1: number) => {
  const out: number[] = []
  for (let y = y0; y < y1; y++) for (let x = 0; x < TOWER_W; x++) out.push(get(b, x, y))
  return out.join(',')
}

describe("the tower's look", () => {
  it('cracks creep in from F50 and split the stone at the Wall', () => {
    expect(towerDamage(40)).toBe(0)
    expect(towerDamage(65)).toBeCloseTo(0.5)
    expect(towerDamage(80)).toBe(1)
    // F61–89 is unlit in both; only the cracks (damage 0 vs 1/3) can tell them apart.
    const band = (highest: number) => rowPixels(drawTowerExterior({ ...look, highest, marker: 0 }), floorRow(89), floorRow(61) + 2)
    expect(band(50)).toBe(band(45))
    expect(band(60)).not.toBe(band(50))
  })

  it('the marker can stand between floors while it climbs', () => {
    const a = drawTowerExterior({ ...look, marker: 49 })
    const b = drawTowerExterior({ ...look, marker: 49.5 })
    const c = drawTowerExterior({ ...look })
    expect(rowPixels(a, 0, 236)).not.toBe(rowPixels(b, 0, 236))
    expect(rowPixels(b, 0, 236)).not.toBe(rowPixels(c, 0, 236))
  })

  it('cleared anchor ledges glow; a dead world greys everything past F90', () => {
    const before = drawTowerExterior({ ...look, highest: 44, current: 45 })
    const after = drawTowerExterior({ ...look, highest: 45, current: 46 })
    expect(rowPixels(before, floorRow(45) + 1, floorRow(45) + 2)).not.toBe(rowPixels(after, floorRow(45) + 1, floorRow(45) + 2))
    const alive = drawTowerExterior({ current: 91, highest: 90, worldEnded: false, worldSaved: false })
    const dead = drawTowerExterior({ current: 91, highest: 90, worldEnded: true, worldSaved: false })
    expect(rowPixels(alive, floorRow(95), floorRow(95) + 2)).not.toBe(rowPixels(dead, floorRow(95), floorRow(95) + 2))
    // Below F90 the stone itself is the same (only the ground and sky above change).
    expect(rowPixels(alive, floorRow(40), floorRow(40) + 2)).toBe(rowPixels(dead, floorRow(40), floorRow(40) + 2))
  })
})
