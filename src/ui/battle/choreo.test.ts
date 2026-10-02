import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatUnitInit } from '../../engine/types'
import { attackStyle, choreograph, popupLanes } from './choreo'

const unit = (id: string, side: 'hero' | 'enemy', extra: Partial<CombatUnitInit> = {}): CombatUnitInit => ({
  id,
  name: side === 'hero' ? `Hero ${id}` : 'Goblin',
  side,
  line: 'front',
  unitClass: side === 'hero' ? 'warrior' : null,
  element: 'fire',
  level: 1,
  maxHP: 100,
  maxSP: 0,
  cp: 10,
  ...extra,
})

const pos = { h: { x: 250, y: 168 }, e: { x: 140, y: 168 } }
const w = () => 24
const act = (actorId: string, targetId: string): CombatEvent => ({ seq: 4, tick: 2, kind: 'act', actorId, skillId: 'basic', targetId })

describe('battle choreography', () => {
  it('picks how each unit attacks', () => {
    expect(attackStyle(unit('h', 'hero'), 'basic', 24)).toBe('melee')
    expect(attackStyle(unit('h', 'hero', { unitClass: 'archer' }), 'basic', 24)).toBe('arrow')
    expect(attackStyle(unit('h', 'hero', { unitClass: 'mage' }), 'basic', 24)).toBe('magic')
    expect(attackStyle(unit('e', 'enemy', { name: 'Lizardman Shaman' }), 'basic', 24)).toBe('magic')
    expect(attackStyle(unit('e', 'enemy', { name: "Demon's Marksman" }), 'basic', 24)).toBe('arrow')
    // Big foes lunge where they stand instead of running across.
    expect(attackStyle(unit('e', 'enemy', { name: 'Halgiraf' }), 'basic', 90)).toBe('lunge')
  })

  it('a melee attacker runs up to the target and strikes from its own side', () => {
    const byId = { h: unit('h', 'hero'), e: unit('e', 'enemy') }
    const { poses, shot } = choreograph(act('h', 'e'), pos, byId, 'melee', w, w, 'fire')
    const end = pos.h.x + poses.h!.dx
    expect(end).toBeGreaterThan(pos.e.x) // stops short, on the heroes' side
    expect(end - pos.e.x).toBeLessThan(30)
    expect(shot).toBeNull()
  })

  it('archers and casters stay put and loose a projectile at the target', () => {
    const byId = { h: unit('h', 'hero', { unitClass: 'mage' }), e: unit('e', 'enemy') }
    const { poses, shot } = choreograph(act('h', 'e'), pos, byId, 'magic', w, w, 'water')
    expect(Math.abs(poses.h!.dx)).toBeLessThan(10)
    expect(shot?.style).toBe('magic')
    expect(shot!.to.x).toBe(pos.e.x)
    expect(shot!.element).toBe('water')
  })

  it('a blow knocks the target back, away from the attacker', () => {
    const byId = { h: unit('h', 'hero'), e: unit('e', 'enemy') }
    const hit: CombatEvent = { seq: 5, tick: 2, kind: 'hit', actorId: 'h', targetId: 'e', amount: 10, crit: true, hpAfter: 90 }
    expect(choreograph(hit, pos, byId, 'melee', w, w, 'fire').poses.e!.dx).toBeLessThan(0)
  })

  it('nothing moves between actions', () => {
    const byId = { h: unit('h', 'hero'), e: unit('e', 'enemy') }
    const death: CombatEvent = { seq: 6, tick: 2, kind: 'death', unitId: 'e' }
    expect(choreograph(death, pos, byId, null, w, w, 'fire')).toEqual({ poses: {}, shot: null })
  })

  it('damage numbers on the same target stack; the newest sits lowest', () => {
    const box = { x: 100, y: 120, w: 24, h: 12 }
    const lifts = popupLanes([box, box, box])
    expect(lifts[2]).toBe(0)
    expect(lifts[1]).toBeGreaterThanOrEqual(12)
    expect(lifts[0]).toBeGreaterThanOrEqual(lifts[1]! + 12)
  })

  it('numbers over neighbouring units never overlap; distant ones stay put', () => {
    const crit = { x: 100, y: 120, w: 44, h: 26 }
    const hit = { x: 124, y: 122, w: 28, h: 12 }
    const [a, b] = popupLanes([crit, hit])
    const top = (p: typeof crit, lift: number) => p.y - lift
    // The older crit rises clear of the newer hit's box.
    expect(top(crit, a!) + crit.h).toBeLessThanOrEqual(top(hit, b!))
    expect(b).toBe(0)
    expect(popupLanes([{ x: 40, y: 120, w: 30, h: 12 }, { x: 200, y: 120, w: 30, h: 12 }])).toEqual([0, 0])
  })

  it('a follow-up is the friend striking: an archer friend looses an arrow at the target', () => {
    const pos = { h1: { x: 250, y: 160 }, h2: { x: 300, y: 170 }, e1: { x: 120, y: 160 } }
    const byId = { h1: unit('h1', 'hero'), h2: unit('h2', 'hero', { unitClass: 'archer' }), e1: unit('e1', 'enemy') }
    const e: CombatEvent = { seq: 9, tick: 4, kind: 'followup', unitId: 'h2', allyId: 'h1', targetId: 'e1' }
    const { poses, shot } = choreograph(e, pos, byId, 'arrow', () => 24, () => 32, 'wind')
    expect(poses.h2).toBeDefined()
    expect(poses.h1).toBeUndefined()
    expect(shot?.style).toBe('arrow')
    expect(shot?.element).toBe('wind')
  })
})
