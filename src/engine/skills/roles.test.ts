/**
 * Lane F · the re-authored kit as data: effects resolve at their level, class-bound
 * unlocks, the new merge and evolution, the trainable support skills, enemy kits.
 */
import { describe, expect, it } from 'vitest'
import { SKILLS, SKILL_EVOLUTIONS, SKILL_MERGES, SKILL_UNLOCKS, CLASS_SKILL, ENEMY_TEMPLATES } from '../content'
import { applyUnlocks, effectAt, foldBattleSkills, learnableSkillIds, resolveMerges, resolveSkillEffect } from './skills'
import { buildEnemyUnit } from '../unit'
import type { HeroSkill } from '../types'

const hs = (id: string, level = 1): HeroSkill => ({ id, level, xp: 0 })

describe('effects resolve at their level', () => {
  it('a skill’s effects and hits ride into the SkillEffect the sim reads', () => {
    const flurry = resolveSkillEffect(hs('shadow_flurry', 1))!
    expect(flurry.hits).toBe(3)
    expect(flurry.skillMult).toBeCloseTo(0.45)
    expect(flurry.effects).toEqual([{ kind: 'dot', dot: 'bleed', from: 'atk', pct: 12, turns: 3, chance: 40 }])
    const shield = resolveSkillEffect(hs('basic_shield', 3))!
    expect(shield.skillMult).toBe(0)
    expect(shield.target).toBe('self')
    expect(shield.effects).toEqual([
      { kind: 'taunt', turns: 2 },
      { kind: 'buff', stat: 'guard', pct: 25 + 4 * 2, turns: 2 },
    ])
  })

  it('magnitudes grow by perLevel, capped at the grade’s level; a stun’s chance grows instead', () => {
    const def = SKILLS.ganggyeok!
    const stun = def.effects![0]!
    expect(effectAt(stun, def, 1)).toEqual({ kind: 'stun', push: 40, chance: 30 })
    expect(effectAt(stun, def, 3)).toEqual({ kind: 'stun', push: 40, chance: 40 })
    // Grade C caps at Lv5: Lv9 reads as Lv5.
    expect(effectAt(stun, def, 9)).toEqual(effectAt(stun, def, 5))
    // An SP drain grows more negative with level.
    expect(effectAt({ kind: 'sp', amount: -10, perLevel: 2 }, def, 3)).toEqual({ kind: 'sp', amount: -14 })
  })

  it('plain skills stay plain (no effects, no hits): a Lv1 Power Strike hits exactly as before', () => {
    const ps = resolveSkillEffect(hs('power_strike'))!
    expect(ps.effects).toBeUndefined()
    expect(ps.hits).toBeUndefined()
    expect(ps.skillMult).toBeCloseTo(1.6)
  })
})

describe('five classes, five kits', () => {
  it('the class skills keep their ids (saves hold them) and now play differently', () => {
    expect(CLASS_SKILL).toEqual({ warrior: 'power_strike', spearman: 'piercing_thrust', thief: 'shadow_flurry', archer: 'thunder_volley', mage: 'arcane_burst' })
    expect(SKILLS.piercing_thrust!.target).toBe('cleave')
    expect(SKILLS.thunder_volley!.effects![0]).toMatchObject({ kind: 'debuff', stat: 'spd' })
    expect(SKILLS.arcane_burst!.effects![0]).toMatchObject({ kind: 'dot', dot: 'element' })
  })

  it('class kits unlock by level for their class only', () => {
    const archer = applyUnlocks([], 8, 0, 'archer').map((s) => s.id)
    expect(archer).toContain('hunters_mark')
    expect(applyUnlocks([], 8, 0, 'warrior').map((s) => s.id)).not.toContain('hunters_mark')
    // Without a class (an old call site), class-bound unlocks never fire.
    expect(applyUnlocks([], 30, 0).map((s) => s.id)).toEqual(['projectile_defense', 'incident'])
    const mage = applyUnlocks([], 24, 0, 'mage').map((s) => s.id)
    expect(mage).toEqual(expect.arrayContaining(['spellbind', 'barrier', 'mending_light']))
    expect(applyUnlocks([], 18, 0, 'spearman').map((s) => s.id)).toContain('war_cry')
    for (const u of SKILL_UNLOCKS) expect(SKILLS[u.skillId], u.skillId).toBeDefined()
  })

  it('the battle fold passes the class through to the unlocks', () => {
    const r = foldBattleSkills('h' as never, [], undefined, { heroLevel: 10, highestCleared: 1, won: true, defeatedTargetTags: [], heroClass: 'thief' })
    expect(r.skills.map((s) => s.id)).toContain('stealthy_movements')
    expect(r.progress).toContainEqual({ kind: 'unlock', heroId: 'h', skillId: 'stealthy_movements' })
  })

  it('anyone can learn to bind a wound or hold a line at the Training Center', () => {
    for (const id of ['first_aid', 'regeneration', 'indomitability', 'basic_shield']) expect(SKILLS[id]!.trainable, id).toBe(true)
    // Promotion still grants only the original innate pool (gacha draws unchanged).
    expect(learnableSkillIds()).toEqual(['power_strike', 'piercing_thrust', 'shadow_flurry', 'thunder_volley', 'arcane_burst'])
  })

  it('First Aid + Regeneration fuse into Field Medicine; Indomitability evolves into Unyielding', () => {
    expect(SKILL_MERGES).toContainEqual({ inputs: ['first_aid', 'regeneration'], minLevel: 3, result: 'field_medicine' })
    expect(resolveMerges([hs('first_aid', 3), hs('regeneration', 3)]).map((s) => s.id)).toEqual(['field_medicine'])
    expect(SKILL_EVOLUTIONS).toContainEqual({ from: 'indomitability', result: 'unyielding' })
  })
})

describe('enemy kits', () => {
  it('a priest heals, a shaman poisons, a knight taunts — riding beside their basic attack', () => {
    const kitOf = (id: string) => buildEnemyUnit(ENEMY_TEMPLATES[id]!, 30, 'e1').skills.map((s) => s.id)
    // (Lane G gave each a fuller kit: the saint shelters, the shaman mends, the knight bashes.)
    expect(kitOf('order_saint')).toEqual(['e_spell', 'e_saints_grace', 'e_sanctuary', 'e_holy_light'])
    expect(kitOf('lizard_shaman')).toEqual(['e_spell', 'e_venom_spit', 'e_swamp_mending'])
    expect(kitOf('knight')).toEqual(['e_basic', 'e_shield_wall', 'e_shield_bash'])
    expect(kitOf('goblin')).toEqual(['e_basic'])
  })

  it('enemy skills are never a hero’s (bound, unlearnable, untrainable)', () => {
    for (const s of Object.values(SKILLS).filter((d) => d.enemy === true)) {
      expect(s.bound).toBe(true)
      expect(s.learnable || s.trainable).toBe(false)
      expect(s.id.startsWith('e_')).toBe(true)
    }
  })
})
