import { describe, expect, it } from 'vitest'
import type { CombatEvent } from '../../engine/types'
import { castsSkill, heroPoseFor, isGuarded, type PoseCue } from './battlePose'

const cue = (over: Partial<PoseCue> = {}): PoseCue => ({
  dead: false,
  falling: false,
  acting: false,
  skillId: null,
  unitClass: 'warrior',
  hurt: false,
  guarded: false,
  won: false,
  ...over,
})

describe('battle poses (lane I)', () => {
  it('a spell, a support skill or a mage casts; a weapon blow attacks', () => {
    expect(castsSkill('arcane_burst', 'mage')).toBe(true)
    expect(castsSkill('spellbind', 'warrior')).toBe(true) // magic
    expect(castsSkill('first_aid', 'warrior')).toBe(true) // support: no blow of its own
    expect(castsSkill('war_cry', 'spearman')).toBe(true)
    expect(castsSkill('e_spell', null)).toBe(true)
    expect(castsSkill('basic', 'mage')).toBe(true)
    expect(castsSkill('basic', 'warrior')).toBe(false)
    expect(castsSkill('power_strike', 'warrior')).toBe(false)
    expect(castsSkill('thunder_volley', 'archer')).toBe(false) // a volley of arrows, physical
    expect(castsSkill('brace', 'mage')).toBe(false)
  })

  it('picks the pose from the frame, in order of what matters most', () => {
    expect(heroPoseFor(cue())).toBe('idle')
    expect(heroPoseFor(cue({ dead: true }))).toBe('ko')
    expect(heroPoseFor(cue({ dead: true, falling: true }))).toBe('hurt') // the fall animates from the flinch
    expect(heroPoseFor(cue({ won: true }))).toBe('victory')
    expect(heroPoseFor(cue({ dead: true, won: true }))).toBe('ko') // the fallen do not cheer
    expect(heroPoseFor(cue({ acting: true, skillId: 'power_strike' }))).toBe('attack')
    expect(heroPoseFor(cue({ acting: true, skillId: 'arcane_burst', unitClass: 'mage' }))).toBe('cast')
    expect(heroPoseFor(cue({ acting: true, skillId: 'brace' }))).toBe('guard')
    expect(heroPoseFor(cue({ hurt: true }))).toBe('hurt')
    expect(heroPoseFor(cue({ hurt: true, acting: true, skillId: 'basic' }))).toBe('attack')
    expect(heroPoseFor(cue({ guarded: true }))).toBe('guard')
    expect(heroPoseFor(cue({ guarded: true, hurt: true }))).toBe('hurt')
  })

  it('a hero is guarded under a guard-up status or when a blow is turned on it', () => {
    const turned: CombatEvent = { seq: 1, tick: 1, kind: 'guard', actorId: 'e1', targetId: 'h1' }
    expect(isGuarded([{ key: 'guard-up', value: 30, sourceId: 'master' }], [], 'h1')).toBe(true)
    expect(isGuarded([{ key: 'atk-up', value: 20, sourceId: 'h2' }], [], 'h1')).toBe(false)
    expect(isGuarded([], [turned], 'h1')).toBe(true)
    expect(isGuarded([], [turned], 'h2')).toBe(false)
  })
})
