import { describe, it, expect } from 'vitest'
import { BLINK_EVERY_MS, BREATH_MS, battlePose, idlePhase, idleStyle } from './poses'
import { poseRig, HERO_POSES } from './heroSprite'

describe('idle life (per-unit phase)', () => {
  const ids = Array.from({ length: 200 }, (_, i) => `h_${String(i).padStart(6, '0')}`)

  it('is a pure function of the unit id', () => {
    expect(idlePhase('h_000042')).toEqual(idlePhase('h_000042'))
    expect(idleStyle('e_3')).toEqual(idleStyle('e_3'))
  })

  it('breathes within 0.9–1.4 s and blinks every 2–5 s, starting mid-cycle', () => {
    for (const id of ids) {
      const p = idlePhase(id)
      expect(p.breathMs).toBeGreaterThanOrEqual(BREATH_MS[0])
      expect(p.breathMs).toBeLessThanOrEqual(BREATH_MS[1])
      expect(p.blinkEveryMs).toBeGreaterThanOrEqual(BLINK_EVERY_MS[0])
      expect(p.blinkEveryMs).toBeLessThanOrEqual(BLINK_EVERY_MS[1])
      expect(p.breathDelayMs).toBeLessThanOrEqual(0)
      expect(p.breathDelayMs).toBeGreaterThan(-p.breathMs)
      expect(p.blinkDelayMs).toBeLessThanOrEqual(0)
      expect(p.blinkDelayMs).toBeGreaterThan(-p.blinkEveryMs)
    }
  })

  it('desynchronises a party: units do not breathe or blink in lockstep', () => {
    const party = ['h_000001', 'h_000002', 'h_000003', 'h_000004', 'h_000005']
    const phases = party.map(idlePhase)
    expect(new Set(phases.map((p) => `${p.breathMs}|${p.breathDelayMs}`)).size).toBe(party.length)
    expect(new Set(phases.map((p) => `${p.blinkEveryMs}|${p.blinkDelayMs}`)).size).toBe(party.length)
    // and across many units the periods actually spread over the range
    const periods = new Set(ids.map((id) => idlePhase(id).blinkEveryMs))
    expect(periods.size).toBeGreaterThan(50)
  })

  it('exposes the phase as the CSS variables ui.css reads', () => {
    const p = idlePhase('h_000007')
    expect(idleStyle('h_000007')).toEqual({
      '--idle-period': `${p.breathMs}ms`,
      '--idle-delay': `${p.breathDelayMs}ms`,
      '--blink-period': `${p.blinkEveryMs}ms`,
      '--blink-delay': `${p.blinkDelayMs}ms`,
    })
  })
})

describe('battlePose', () => {
  it('picks KO > hurt > the action > idle', () => {
    expect(battlePose({})).toBe('idle')
    expect(battlePose({ acting: true })).toBe('attack')
    expect(battlePose({ acting: true, casting: true })).toBe('cast')
    expect(battlePose({ acting: true, windingUp: true })).toBe('windup')
    expect(battlePose({ acting: true, hurt: true })).toBe('hurt')
    expect(battlePose({ hurt: true, dead: true })).toBe('ko')
    expect(battlePose({ casting: true })).toBe('idle') // casting only matters while acting
  })

  it('every pose it can return has art', () => {
    const moments = [{}, { acting: true }, { acting: true, casting: true }, { acting: true, windingUp: true }, { hurt: true }, { dead: true }]
    for (const m of moments) expect(HERO_POSES).toContain(battlePose(m))
  })
})

describe('pose rigs', () => {
  it('idle and blink stand still; the wind-up rocks the body 2 px back', () => {
    expect(poseRig('idle').body).toEqual({ x: 0, y: 0 })
    expect(poseRig('blink').body).toEqual({ x: 0, y: 0 })
    expect(poseRig('windup').body.x).toBe(2) // heroes face left: +x is backward
    expect(poseRig('attack').body.x).toBeLessThan(0)
    expect(poseRig('ko').body.y).toBeGreaterThan(0)
  })
})
