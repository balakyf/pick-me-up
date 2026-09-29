import { describe, it, expect } from 'vitest'
import {
  maxLevelFor,
  skillMultAt,
  hpCostAt,
  resolveSkillEffect,
  heroSkillsFromIds,
  awardSkillXp,
  resolveMerges,
  skillScore,
  skillCp,
  diffSkills,
  learnableSkillIds,
} from './skills'
import { SKILLS, SKILL_MERGES } from '../content'
import { TUNING } from '../tuning'
import type { HeroId, HeroSkill } from '../types'

const hs = (id: string, level = 1, xp = 0): HeroSkill => ({ id, level, xp })
const H = 'h_000001' as HeroId

describe('grade & leveling', () => {
  it('caps levels by grade', () => {
    expect(maxLevelFor('D')).toBe(TUNING.skills.maxLevel.D)
    expect(maxLevelFor('S')).toBeGreaterThan(maxLevelFor('D'))
  })

  it('skillMultAt grows linearly by perLevel and equals baseMult at Lv1', () => {
    const ps = SKILLS.power_strike!
    expect(skillMultAt(ps, 1)).toBe(ps.baseMult)
    expect(skillMultAt(ps, 3)).toBeCloseTo(ps.baseMult + 2 * ps.perLevel)
  })

  it('skillMultAt clamps to the grade cap', () => {
    const ps = SKILLS.power_strike!
    const cap = maxLevelFor(ps.grade)
    expect(skillMultAt(ps, cap + 5)).toBe(skillMultAt(ps, cap))
  })

  it('hpCostAt is 0 for ordinary skills and rises with level for ultimates', () => {
    expect(hpCostAt(SKILLS.power_strike!, 3)).toBe(0)
    const ixid = SKILLS.ixid!
    expect(hpCostAt(ixid, 1)).toBe(ixid.hpCost)
    expect(hpCostAt(ixid, 3)).toBe(ixid.hpCost! + 2 * ixid.hpCostPerLevel!)
  })
})

describe('resolveSkillEffect', () => {
  it('carries the leveled multiplier and the combat fields', () => {
    const e = resolveSkillEffect(hs('power_strike', 2))!
    expect(e.id).toBe('power_strike')
    expect(e.skillMult).toBeCloseTo(SKILLS.power_strike!.baseMult + SKILLS.power_strike!.perLevel)
    expect(e.spCost).toBe(SKILLS.power_strike!.spCost)
    expect(e.hpCost).toBeUndefined()
  })

  it('carries hpCost for ultimates', () => {
    expect(resolveSkillEffect(hs('ixid', 2))!.hpCost).toBe(hpCostAt(SKILLS.ixid!, 2))
  })

  it('a Lv1 original skill resolves to its pre-leveling numbers', () => {
    const e = resolveSkillEffect(hs('arcane_burst'))!
    expect(e.skillMult).toBe(1.4)
    expect(e.spCost).toBe(50)
    expect(e.target).toBe('all-enemies')
  })

  it('unknown ids resolve to null', () => {
    expect(resolveSkillEffect(hs('nope'))).toBeNull()
  })
})

describe('heroSkillsFromIds', () => {
  it('mints Lv1 / 0 xp skills, dropping unknown ids', () => {
    expect(heroSkillsFromIds(['power_strike', 'nope', 'berserk'])).toEqual([hs('power_strike'), hs('berserk')])
  })
})

describe('awardSkillXp (auto-learn)', () => {
  const next = TUNING.skills.xpToNext

  it('adds one XP per cast and levels up at the threshold', () => {
    const out = awardSkillXp([hs('power_strike')], { power_strike: next[1]! })
    expect(out[0]).toEqual(hs('power_strike', 2, 0))
  })

  it('carries excess XP across several levels', () => {
    const casts = next[1]! + next[2]! + 1
    expect(awardSkillXp([hs('power_strike')], { power_strike: casts })[0]).toEqual(hs('power_strike', 3, 1))
  })

  it('stops at the grade cap and banks no XP there', () => {
    const cap = maxLevelFor('D')
    const out = awardSkillXp([hs('berserk')], { berserk: 999 })
    expect(out[0]).toEqual(hs('berserk', cap, 0))
  })

  it('leaves uncast skills and unknown skills untouched; never mutates input', () => {
    const input = [hs('power_strike', 2, 1), hs('mystery', 1, 0)]
    const copy = JSON.parse(JSON.stringify(input))
    const out = awardSkillXp(input, {})
    expect(out).toEqual(input)
    expect(input).toEqual(copy)
  })
})

describe('resolveMerges', () => {
  it('fuses both inputs at minLevel into the result at Lv1', () => {
    const out = resolveMerges([hs('power_strike'), hs('berserk', 3), hs('composure', 3)])
    expect(out.map((s) => s.id)).toEqual(['power_strike', 'exceed'])
    expect(out[1]).toEqual(hs('exceed'))
  })

  it('does nothing below minLevel or with only one input', () => {
    const below = [hs('berserk', 2), hs('composure', 3)]
    expect(resolveMerges(below)).toEqual(below)
    const single = [hs('berserk', 5)]
    expect(resolveMerges(single)).toEqual(single)
  })

  it('does not double-merge a shared input in one pass (first recipe wins)', () => {
    // berserk feeds both Exceed and Ixid; table order resolves Exceed first.
    const out = resolveMerges([hs('berserk', 4), hs('composure', 4), hs('calmness', 4)])
    expect(out.map((s) => s.id).sort()).toEqual(['calmness', 'exceed'])
  })

  it('a freshly merged result cannot chain into another merge the same pass', () => {
    for (const r of SKILL_MERGES) {
      for (const other of SKILL_MERGES) expect(other.inputs).not.toContain(r.result)
    }
  })

  it('skips a merge whose result the hero already holds', () => {
    const held = [hs('exceed'), hs('berserk', 3), hs('composure', 3)]
    expect(resolveMerges(held)).toEqual(held)
  })
})

describe('skillScore / skillCp', () => {
  it('sums gradeValue × level', () => {
    const gv = TUNING.skills.gradeValue
    const score = skillScore([hs('power_strike', 2), hs('berserk', 1)])
    expect(score).toBe(gv.C! * 2 + gv.D! * 1)
    expect(skillCp([hs('power_strike', 2), hs('berserk', 1)])).toBe(Math.round(score * TUNING.skills.cpPerSkillScore))
  })

  it('is 0 for no skills', () => {
    expect(skillScore([])).toBe(0)
  })
})

describe('diffSkills', () => {
  it('reports level-ups and merges', () => {
    const before = [hs('power_strike', 1), hs('berserk', 3), hs('composure', 3)]
    const after = [hs('power_strike', 2), hs('exceed', 1)]
    expect(diffSkills(H, before, after)).toEqual([
      { kind: 'level-up', heroId: H, skillId: 'power_strike', level: 2 },
      { kind: 'merge', heroId: H, skillId: 'exceed', from: ['berserk', 'composure'] },
    ])
  })

  it('is empty when nothing changed', () => {
    expect(diffSkills(H, [hs('power_strike', 2, 1)], [hs('power_strike', 2, 2)])).toEqual([])
  })
})

describe('learnableSkillIds', () => {
  it('is the original promotion pool, in registry order', () => {
    expect(learnableSkillIds()).toEqual(['power_strike', 'piercing_thrust', 'shadow_flurry', 'thunder_volley', 'arcane_burst'])
  })
})
