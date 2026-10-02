import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatUnitInit } from '../../engine/types'
import { ELEMENT_VIS } from '../bits'
import { beatPopups, crowdScale, flinchDelays, MIN_SCREEN_PX, planPopups, popupColor, popupFontPx, popupLook, type PopupEvent, type PopupInput } from './popupStyle'
import { popupDelay } from './battleFrames'

const hit = (p: Partial<Extract<CombatEvent, { kind: 'hit' }>> = {}): Extract<CombatEvent, { kind: 'hit' }> => ({
  seq: 1,
  tick: 1,
  kind: 'hit',
  actorId: 'h',
  targetId: 'e',
  amount: 10,
  crit: false,
  hpAfter: 90,
  ...p,
})

const overlap = (a: { l: number; r: number; t: number; b: number }, b: { l: number; r: number; t: number; b: number }) =>
  a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b

describe('popup look', () => {
  it('a number grows with the share of max HP it took: a chip is small, a 40% blow is big', () => {
    const chip = popupFontPx(hit({ amount: 2 }), 100)
    const tenth = popupFontPx(hit({ amount: 10 }), 100)
    const big = popupFontPx(hit({ amount: 40 }), 100)
    expect(chip).toBeLessThan(tenth)
    expect(tenth).toBeLessThan(big)
    expect(big).toBe(21)
    expect(popupFontPx(hit({ amount: 90 }), 100)).toBe(21) // capped
    // A crit is bigger than the same plain blow, and never tiny.
    expect(popupFontPx(hit({ amount: 10, crit: true }), 100)).toBeGreaterThan(tenth)
    expect(popupFontPx(hit({ amount: 1, crit: true }), 1000)).toBeGreaterThanOrEqual(14)
    // Words stay small.
    expect(popupFontPx({ seq: 1, tick: 1, kind: 'miss', actorId: 'h', targetId: 'e' }, 100)).toBe(10)
  })

  it('a blow is coloured by its element; words keep their own colours', () => {
    expect(popupColor(hit(), 'fire')).toBe(ELEMENT_VIS.fire.color)
    expect(popupColor(hit(), 'water')).toBe(ELEMENT_VIS.water.color)
    expect(popupColor(hit(), 'physical')).not.toBe(ELEMENT_VIS.physical.color)
    expect(popupColor(hit({ eff: 'immune' }), 'fire')).not.toBe(ELEMENT_VIS.fire.color)
    expect(popupColor({ seq: 1, tick: 1, kind: 'heal', unitId: 'h', amount: 5, hpAfter: 50 }, 'fire')).toBe('#7be08a')
  })

  it('tags come one by one, each with its own badge', () => {
    expect(popupLook(hit({ crit: true, eff: 'weak' })).tags).toEqual([
      { text: 'CRITICAL!', cls: 'crit' },
      { text: 'WEAK!', cls: 'weak' },
    ])
    expect(popupLook({ seq: 1, tick: 1, kind: 'hp-cost', unitId: 'h', amount: 38, hpAfter: 100 })).toMatchObject({ text: '−38 HP', cls: 'cost' })
  })

  it('a crowded beat reads smaller, down to half', () => {
    expect(crowdScale(1)).toBe(1)
    expect(crowdScale(2)).toBe(1)
    expect(crowdScale(5)).toBeLessThan(1)
    expect(crowdScale(30)).toBe(0.5)
  })
})

describe('popup plan', () => {
  const pos = { a: { x: 100, y: 170 }, b: { x: 110, y: 170 }, c: { x: 120, y: 175 }, h: { x: 260, y: 170 } }
  const head = () => 32
  const kinds: PopupEvent[] = [
    hit({ seq: 1, targetId: 'a', amount: 50, crit: true, eff: 'weak' }),
    hit({ seq: 2, targetId: 'b', amount: 0, eff: 'immune' }),
    { seq: 3, tick: 1, kind: 'miss', actorId: 'h', targetId: 'c' },
    { seq: 4, tick: 1, kind: 'guard', actorId: 'h', targetId: 'a' },
    { seq: 5, tick: 1, kind: 'heal', unitId: 'h', amount: 30, hpAfter: 90 },
    { seq: 6, tick: 1, kind: 'hp-cost', unitId: 'h', amount: 20, hpAfter: 70 },
    hit({ seq: 7, targetId: 'a', amount: 3 }),
  ]
  const items: PopupInput[] = kinds.map((e, i) => ({ e, element: 'fire', maxHP: 100, delayMs: popupDelay(i), crowd: kinds.length }))

  it('no two popups overlap — numbers, IMMUNE, MISS, GUARD, heals and HP costs alike', () => {
    for (const zoom of [0.97, 1.4, 2.75]) {
      const plan = planPopups(items, pos, head, zoom)
      expect(plan).toHaveLength(kinds.length)
      const boxes = plan.map((p) => {
        const w = Math.max(p.look.text.length * p.fs * 0.66 + 4, p.look.tag ? p.look.tag.length * p.tagFs * 0.72 + 6 : 0)
        const h = p.fs + (p.look.tag ? p.tagFs + 3 : 2)
        return { l: p.x - w / 2, r: p.x + w / 2, t: p.y, b: p.y + h }
      })
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!), `${zoom}: ${i}/${j}`).toBe(false)
    }
  })

  it('on a phone every number reads at 12 CSS px at least', () => {
    const zoom = 0.97
    for (const p of planPopups(items, pos, head, zoom)) expect(p.fs * zoom).toBeGreaterThanOrEqual(MIN_SCREEN_PX - 0.1)
  })

  it("keeps clear of the skill name over its caster (an HP cost never sits on 'Pathology')", () => {
    const cost: PopupInput = { e: { seq: 9, tick: 1, kind: 'hp-cost', unitId: 'h', amount: 70, hpAfter: 30 }, element: 'physical', maxHP: 100, delayMs: 0 }
    const banner = { x: 260, y: 170 - 32 - 20, w: 50, h: 13 }
    const [free] = planPopups([cost], pos, head, 2)
    const [clear] = planPopups([cost], pos, head, 2, undefined, [banner])
    const fs = clear!.fs
    expect(free!.y + fs > banner.y && free!.y < banner.y + banner.h).toBe(true) // it would have sat on it
    expect(clear!.y + fs + 2 <= banner.y || Math.abs(clear!.x - banner.x) * 2 >= banner.w).toBe(true)
  })

  it('keeps a number on the visible stretch of a cropped stage', () => {
    const [p] = planPopups([{ e: hit({ targetId: 'a', amount: 40 }), element: 'fire', maxHP: 100, delayMs: 0 }], { a: { x: 4, y: 170 } }, head, 1, { left: 0, right: 300 })
    expect(p!.x).toBeGreaterThan(4)
  })

  it("a sweep's numbers land one after another, and each target flinches with its own", () => {
    const units: CombatUnitInit[] = ['h', 'a', 'b'].map((id) => ({
      id,
      name: id,
      side: id === 'h' ? 'hero' : 'enemy',
      line: 'front',
      unitClass: null,
      element: 'wind',
      level: 1,
      maxHP: 100,
      maxSP: 0,
      cp: 1,
    }))
    const byId = Object.fromEntries(units.map((u) => [u.id, u]))
    const ev: CombatEvent[] = [
      { seq: 0, tick: 1, kind: 'act', actorId: 'h', skillId: 'thunder_volley', targetId: 'a' },
      hit({ seq: 1, targetId: 'a' }),
      hit({ seq: 2, targetId: 'b' }),
    ]
    const out = beatPopups(ev, [undefined, { from: 1, to: 2 }], byId)
    expect(out.map((p) => p.delayMs)).toEqual([0, popupDelay(1)])
    expect(out.every((p) => p.element === 'wind' && p.crowd === 2)).toBe(true)
    expect(flinchDelays(ev.slice(1))).toEqual({ a: 0, b: popupDelay(1) })
  })
})
