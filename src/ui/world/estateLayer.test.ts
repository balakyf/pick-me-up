import { describe, it, expect } from 'vitest'
import { ESTATE_SPOTS } from './estateLayer'
import { PROPS, propAt, tileAt } from './lobbyMap'
import { opaqueCount } from '../pixel/bitmap'
import { bunkLamp, flowerBox, fountainUpgrade, hearth, lanternPost, musicCorner, pennant, rug, scoreboard, statue, tapestry } from '../pixel/estateArt'
import { lookForHero } from '../pixel/look'

describe('estate spots sit where they belong on the campus', () => {
  it('rugs lie on dormitory boards, lamps and tapestries hang on walls', () => {
    for (const [x, y] of ESTATE_SPOTS.rugs) expect(tileAt(x, y)).toBe('w')
    for (const [x, y] of ESTATE_SPOTS.bunkLamps) expect(tileAt(x, y)).toBe('#')
    for (const [x, y] of ESTATE_SPOTS.tapestries) {
      expect(tileAt(x, y)).toBe('#')
      expect(propAt(x, y)).toBeNull()
    }
  })

  it('the hearth and the music corner stand on free tavern floor', () => {
    for (const [x, y] of [ESTATE_SPOTS.hearth, ESTATE_SPOTS.music]) {
      expect(tileAt(x, y)).toBe('v')
      expect(propAt(x, y)).toBeNull()
    }
  })

  it('flower boxes, pennants and statues stand on hedges and fences (never in a path)', () => {
    for (const [x, y] of [...ESTATE_SPOTS.flowerBoxes, ...ESTATE_SPOTS.pennants, ...ESTATE_SPOTS.statues]) expect(tileAt(x, y)).toBe('=')
    expect(new Set(ESTATE_SPOTS.statues.map((p) => p.join())).size).toBe(ESTATE_SPOTS.statues.length)
  })

  it('lanterns stand on open grass beside the roads, never on a road or a prop', () => {
    for (const [x, y] of ESTATE_SPOTS.lanterns) {
      expect(tileAt(x, y)).toBe('g')
      expect(propAt(x, y)).toBeNull()
      const nearRoad = [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => tileAt(x + dx, y + dy) === 'c'))
      expect(nearRoad).toBe(true)
    }
  })

  it('the fountain upgrade sits on the fountain', () => {
    const f = PROPS.find((p) => p.kind === 'fountain')!
    expect([f.x, f.y]).toEqual(ESTATE_SPOTS.fountain)
  })
})

describe('estate art', () => {
  it('every piece draws something', () => {
    const look = lookForHero({ id: 'h_x', name: 'Mira Vale', star: 3, heroClass: 'warrior', element: 'fire' })
    const sprites = [rug(0), bunkLamp(0), hearth(1), musicCorner(), flowerBox(2), tapestry(1, true), fountainUpgrade(5, 1), lanternPost(1), pennant(2, 1), scoreboard(), statue(look)]
    for (const s of sprites) expect(opaqueCount(s.bmp)).toBeGreaterThan(10)
  })
})
