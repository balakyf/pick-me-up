import { describe, expect, it } from 'vitest'
import type { CombatEvent } from '../../engine/types'
import { SKILLS } from '../../engine/content'
import { castTargets, defaultFx, fxFlash, fxOps, skillFx, SKILL_FX, type FxCast, type FxShape } from './skillFx'
import { shatterShards } from './shatter'

const castOf = (shape: FxShape, dir: 1 | -1 = -1): FxCast => ({
  profile: { shape, colors: ['#ffffff', '#ffe07a', '#d4a02a', '#8a5a12'], ms: 800, size: 1 },
  caster: { x: 290, y: 168, h: 32 },
  targets: [
    { x: 140, y: 150, h: 40 },
    { x: 100, y: 180, h: 32 },
  ],
  dir,
  seed: 42,
})

const SHAPES: FxShape[] = ['rune', 'slash', 'sweep', 'thrust', 'flurry', 'columns', 'motes', 'dome', 'cloud', 'flames', 'cone', 'pillar', 'rain', 'quake', 'wave', 'void', 'aura-up', 'aura-down', 'stars', 'chains', 'bite', 'impact', 'portal', 'pages']

describe('skill VFX profiles (lane I)', () => {
  it('every hand-picked profile names a real skill', () => {
    for (const id of Object.keys(SKILL_FX)) expect(SKILLS[id], id).toBeDefined()
  })

  it('every skill a hero or a foe can cast has a profile', () => {
    for (const def of Object.values(SKILLS)) {
      if (def.passive) continue
      const p = skillFx(def.id, 'fire')
      expect(p, def.id).not.toBeNull()
      expect(p!.colors.length, def.id).toBeGreaterThanOrEqual(3)
      expect(p!.ms, def.id).toBeGreaterThan(300)
    }
  })

  it('the signature skills look like themselves', () => {
    expect(skillFx('arcane_burst', 'dark')!.shape).toBe('rune')
    expect(skillFx('incident', 'physical')!.shape).toBe('sweep')
    expect(skillFx('thunder_volley', 'wind')!.shape).toBe('columns')
    expect(skillFx('first_aid', 'light')!.shape).toBe('motes')
    expect(skillFx('barrier', 'water')!.shape).toBe('dome')
    expect(skillFx('e_venom_spit', 'earth')!.shape).toBe('cloud')
    expect(skillFx('e_dragon_breath', 'dark')!.shape).toBe('cone')
    expect(skillFx('e_sword_rain', 'light')!.shape).toBe('rain')
  })

  it('a plain attack, a caster foe’s Spell, a brace or an unknown id keep lane E’s sparks', () => {
    expect(skillFx('basic', 'fire')).toBeNull()
    expect(skillFx('e_spell', 'dark')).toBeNull()
    expect(skillFx('brace', 'physical')).toBeNull()
    expect(skillFx('no_such_skill', 'fire')).toBeNull()
  })

  it('a skill without its own entry gets one from what it does', () => {
    const base = { element: null, damageType: 'physical' as const, target: 'single' as const, baseMult: 1, hits: 1, effects: [] }
    expect(defaultFx({ ...base, baseMult: 0, effects: [{ kind: 'heal', from: 'mAtk', pct: 50 }] }, 'light').shape).toBe('motes')
    expect(defaultFx({ ...base, baseMult: 0, effects: [{ kind: 'shield', from: 'mAtk', pct: 50, turns: 2 }] }, 'water').shape).toBe('dome')
    expect(defaultFx({ ...base, baseMult: 0, effects: [{ kind: 'buff', stat: 'atk', pct: 20, turns: 2 }] }, 'fire').shape).toBe('aura-up')
    expect(defaultFx({ ...base, effects: [{ kind: 'dot', dot: 'poison', from: 'atk', pct: 10, turns: 3 }] }, 'earth').shape).toBe('cloud')
    expect(defaultFx({ ...base, effects: [{ kind: 'dot', dot: 'element', from: 'atk', pct: 10, turns: 3 }] }, 'fire').shape).toBe('flames')
    expect(defaultFx({ ...base, effects: [{ kind: 'stun', push: 50 }] }, 'earth').shape).toBe('stars')
    expect(defaultFx({ ...base, hits: 3 }, 'wind').shape).toBe('flurry')
    expect(defaultFx({ ...base, damageType: 'magic', target: 'all-enemies' }, 'dark').shape).toBe('void')
    expect(defaultFx({ ...base, damageType: 'magic', target: 'all-enemies' }, 'water').shape).toBe('rune')
    expect(defaultFx({ ...base, damageType: 'magic' }, 'light').shape).toBe('pillar')
    expect(defaultFx({ ...base, target: 'cleave' }, 'physical').shape).toBe('thrust')
    expect(defaultFx({ ...base, target: 'all-enemies' }, 'physical').shape).toBe('sweep')
    expect(defaultFx(base, 'physical').shape).toBe('slash')
  })

  it('every shape draws something mid-flight, nothing invisible, and the same thing every time', () => {
    for (const shape of SHAPES) {
      for (const dir of [1, -1] as const) {
        const ops = fxOps(castOf(shape, dir), 0.5)
        expect(ops.length, shape).toBeGreaterThan(0)
        for (const op of ops) {
          expect(op.alpha, shape).toBeGreaterThan(0)
          expect(op.w, shape).toBeGreaterThan(0)
          expect(Number.isFinite(op.x) && Number.isFinite(op.y), shape).toBe(true)
        }
        expect(fxOps(castOf(shape, dir), 0.5)).toEqual(ops)
      }
    }
  })

  it('an effect fades out by its end', () => {
    for (const shape of SHAPES) {
      const late = fxOps(castOf(shape), 0.999)
      const peak = Math.max(...fxOps(castOf(shape), 0.5).map((o) => o.alpha))
      const lateMax = late.length ? Math.max(...late.map((o) => o.alpha)) : 0
      expect(lateMax, shape).toBeLessThan(peak)
    }
  })

  it('flashes only at the peak of a flashing cast', () => {
    const p = skillFx('thunder_volley', 'wind')!
    expect(fxFlash(p, 0.36)).toBe(p.flash)
    expect(fxFlash(p, 0.1)).toBeNull()
    expect(fxFlash(skillFx('first_aid', 'light')!, 0.36)).toBeNull()
  })

  it('a cast reaches everyone its events land on, in order, until the next act', () => {
    const ev: CombatEvent[] = [
      { seq: 0, tick: 4, kind: 'act', actorId: 'h1', skillId: 'thunder_volley', targetId: 'e1' },
      { seq: 1, tick: 4, kind: 'hit', actorId: 'h1', targetId: 'e1', amount: 5, crit: false, hpAfter: 5 },
      { seq: 2, tick: 4, kind: 'miss', actorId: 'h1', targetId: 'e2' },
      { seq: 3, tick: 4, kind: 'hit', actorId: 'h1', targetId: 'e1', amount: 5, crit: false, hpAfter: 0 },
      { seq: 4, tick: 4, kind: 'status', unitId: 'e3', status: 'spd-down', sourceId: 'h1', ticks: 10 },
      { seq: 5, tick: 4, kind: 'act', actorId: 'e2', skillId: 'basic', targetId: 'h1' },
      { seq: 6, tick: 4, kind: 'hit', actorId: 'e2', targetId: 'h1', amount: 5, crit: false, hpAfter: 5 },
    ]
    expect(castTargets(ev, 0)).toEqual(['e1', 'e2', 'e3'])
    expect(castTargets(ev, 5)).toEqual(['h1'])
    expect(castTargets(ev, 1)).toEqual([])
    const heal: CombatEvent[] = [{ seq: 0, tick: 2, kind: 'act', actorId: 'h2', skillId: 'first_aid', targetId: 'h1' }]
    expect(castTargets(heal, 0)).toEqual(['h1'])
  })
})

describe('the finisher shatter (lane I)', () => {
  it('cuts the sprite into a grid of triangles, the same way every time for a unit', () => {
    const a = shatterShards(56, 68, 'e60_0')
    expect(a).toHaveLength(4 * 5 * 2)
    expect(shatterShards(56, 68, 'e60_0')).toEqual(a)
    expect(shatterShards(56, 68, 'e80_0')).not.toEqual(a)
    for (const s of a) {
      expect(s.clip.startsWith('polygon(')).toBe(true)
      expect(Math.hypot(s.dx, s.dy)).toBeGreaterThan(5)
    }
  })
})
