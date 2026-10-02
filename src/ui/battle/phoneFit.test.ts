import { describe, expect, it } from 'vitest'
import type { CombatUnitInit } from '../../engine/types'
import { battleLayout, fitStage, STAGE_MIN_W } from './battleFx'
import { choreograph, popupPlaces, type PopupBox } from './choreo'

describe('the phone battle: layout and fit', () => {
  it('picks the layout from the screen: windows under, a phone upright, a phone on its side', () => {
    expect(battleLayout(1280, 800)).toBe('wide')
    expect(battleLayout(390, 844)).toBe('narrow')
    expect(battleLayout(844, 390)).toBe('beside')
    expect(battleLayout(1024, 1366)).toBe('wide') // a tablet upright keeps the full stage
  })

  it('a phone crops the stage to the units and zooms in further than the full canon allows', () => {
    const full = fitStage(378, 600)
    const cropped = fitStage(378, 600, 270)
    expect(full.zoom).toBeLessThan(1)
    expect(cropped.zoom).toBeGreaterThan(1.3)
    expect(cropped.width).toBeLessThan(STAGE_MIN_W)
    expect(cropped.width * cropped.zoom).toBeLessThanOrEqual(378)
    // The height still caps it.
    const short = fitStage(378, 260, 270)
    expect(short.zoom * 216).toBeLessThanOrEqual(260)
    // A wide screen is unchanged by the crop.
    expect(fitStage(1424, 660, 270)).toEqual(fitStage(1424, 660))
  })
})

describe('popup places', () => {
  it('a crowded column fans out sideways before it towers', () => {
    const box = (x: number, y: number): PopupBox => ({ x, y, w: 30, h: 12 })
    const boxes = [box(100, 100), box(104, 104), box(98, 108), box(102, 112)]
    const lifts = popupPlaces(boxes, 3, 140, 0)
    const fan = popupPlaces(boxes, 3, 140, 0.9)
    expect(Math.max(...fan.map((p) => p.lift))).toBeLessThan(Math.max(...lifts.map((p) => p.lift)))
    expect(fan.some((p) => p.dx !== 0)).toBe(true)
    // Never overlapping.
    const rect = (b: PopupBox, p: { dx: number; lift: number }) => ({ l: b.x + p.dx - 15, r: b.x + p.dx + 15, t: b.y - p.lift, b: b.y - p.lift + 12 })
    const rs = boxes.map((b, i) => rect(b, fan[i]!))
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) expect(rs[i]!.l < rs[j]!.r && rs[j]!.l < rs[i]!.r && rs[i]!.t < rs[j]!.b && rs[j]!.t < rs[i]!.b).toBe(false)
  })
})

describe('a sweep knocks back everyone it strikes', () => {
  it('each struck foe gets a pose, not only the first', () => {
    const u = (id: string, side: 'hero' | 'enemy'): CombatUnitInit => ({ id, name: id, side, line: 'front', unitClass: 'mage', element: 'fire', level: 1, maxHP: 1, maxSP: 0, cp: 1 })
    const byId = { h: u('h', 'hero'), a: u('a', 'enemy'), b: u('b', 'enemy'), c: u('c', 'enemy') }
    const pos = { h: { x: 250, y: 168 }, a: { x: 140, y: 150 }, b: { x: 140, y: 180 }, c: { x: 106, y: 165 } }
    const { poses } = choreograph(
      { seq: 1, tick: 1, kind: 'hit', actorId: 'h', targetId: 'a', amount: 1, crit: false, hpAfter: 0 },
      pos,
      byId,
      'magic',
      () => 24,
      () => 32,
      'fire',
      ['a', 'b', 'c'],
    )
    expect(poses.a?.dx).toBeLessThan(0)
    expect(poses.b?.dx).toBeLessThan(0)
    expect(poses.c?.dx).toBeLessThan(0)
  })
})
