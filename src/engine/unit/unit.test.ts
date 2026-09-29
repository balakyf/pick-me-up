/**
 * Tests for the unit-assembly seam (Hero/Enemy → CombatUnit).
 *
 * Vitest globals are enabled (describe/it/expect available without import).
 * We DO import the functions under test plus the stats/content modules we
 * cross-check against, so the snapshots are derived from the same source of
 * truth the implementation uses — never hand-copied magic numbers.
 */

import {
  basicAttackFor,
  resolveSkills,
  buildCombatUnit,
  buildEnemyUnit,
} from './unit'
import {
  deriveStats,
  deriveStatsForHero,
  deriveMaxSP,
  leveledAttrs,
  combatPower,
} from '../stats'
import { CAMEO_HEROES, ENEMY_TEMPLATES, SKILLS } from '../content'
import { resolveSkillEffect, skillCp } from '../skills'

const lv1 = (id: string) => resolveSkillEffect({ id, level: 1, xp: 0 })!
import { sanityStatMult } from '../kitchen'
import { TUNING } from '../tuning'
import type {
  OwnedHero,
  HeroId,
  HeroTemplate,
  PrimaryAttrs,
  KeywordTag,
  EquipmentItem,
  EquipmentId,
} from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Wrap an authored HeroTemplate into a persisted OwnedHero at a given level. */
function ownedFromTemplate(t: HeroTemplate, level = 1): OwnedHero {
  return {
    id: `h_${t.templateId}` as HeroId,
    name: t.name,
    star: t.star,
    heroClass: t.heroClass,
    element: t.element,
    baseAttrs: t.baseAttrs,
    growthGrades: t.growthGrades,
    skills: t.skillIds.map((id) => ({ id, level: 1, xp: 0 })),
    portraitToken: t.portraitToken,
    origin: 'cameo',
    xp: { level, xpIntoLevel: 0, heldXp: 0, atCap: false },
    alive: true,
    sanity: 100,
    promotion: null,
    equipment: { weapon: null, armor: null, accessory: null },
  }
}

/** A hand-made warrior OwnedHero (not from content) for the core assertions. */
function makeWarrior(overrides: Partial<OwnedHero> = {}): OwnedHero {
  return {
    id: 'h_test_001' as HeroId,
    name: 'Tester',
    star: 3,
    heroClass: 'warrior',
    element: 'fire',
    baseAttrs: { str: 20, agi: 15, vit: 18, int: 8, wil: 12 },
    growthGrades: { str: 5, agi: 4, vit: 5, int: 2, wil: 3 },
    skills: [{ id: 'power_strike', level: 1, xp: 0 }],
    portraitToken: '#ffffff',
    origin: 'procedural',
    xp: { level: 7, xpIntoLevel: 0, heldXp: 0, atCap: false },
    alive: true,
    sanity: 100,
    promotion: null,
    equipment: { weapon: null, armor: null, accessory: null },
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// basicAttackFor
// ─────────────────────────────────────────────────────────────────────────────

describe('basicAttackFor', () => {
  it('produces the canonical implicit basic attack', () => {
    const hero = makeWarrior()
    const basic = basicAttackFor(hero)
    expect(basic).toEqual({
      id: 'basic',
      name: 'Attack',
      skillMult: 1.0,
      damageType: 'physical',
      element: 'fire',
      target: 'single',
      spCost: 0,
    })
  })

  it('deals magic damage for a mage', () => {
    const mage = makeWarrior({ heroClass: 'mage', element: 'water' })
    const basic = basicAttackFor(mage)
    expect(basic.damageType).toBe('magic')
    expect(basic.element).toBe('water')
  })

  it('deals physical damage for every non-mage class and the classless', () => {
    const classes = ['warrior', 'spearman', 'thief', 'archer', null] as const
    for (const c of classes) {
      const h = makeWarrior({ heroClass: c })
      expect(basicAttackFor(h).damageType).toBe('physical')
    }
  })

  it('carries the hero element, costs no SP, single target', () => {
    const h = makeWarrior({ element: 'dark' })
    const b = basicAttackFor(h)
    expect(b.element).toBe('dark')
    expect(b.spCost).toBe(0)
    expect(b.target).toBe('single')
    expect(b.skillMult).toBe(1.0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveSkills
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveSkills', () => {
  it('maps present ids to their Lv1 effects in order', () => {
    const effects = resolveSkills(['power_strike', 'arcane_burst'], SKILLS)
    expect(effects).toEqual([lv1('power_strike'), lv1('arcane_burst')])
  })

  it('a Lv1 skill keeps its pre-leveling numbers (baseMult = old skillMult)', () => {
    const [ps] = resolveSkills(['power_strike'], SKILLS)
    expect(ps!.skillMult).toBe(1.6)
    expect(ps!.spCost).toBe(30)
  })

  it('skips unknown ids', () => {
    const effects = resolveSkills(['power_strike', 'does_not_exist', 'shadow_flurry'], SKILLS)
    expect(effects).toEqual([lv1('power_strike'), lv1('shadow_flurry')])
  })

  it('returns [] for an empty id list', () => {
    expect(resolveSkills([], SKILLS)).toEqual([])
  })

  it('returns [] when nothing resolves against an empty registry', () => {
    expect(resolveSkills(['power_strike'], {})).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildCombatUnit
// ─────────────────────────────────────────────────────────────────────────────

describe('buildCombatUnit', () => {
  it('builds a battle-ready hero unit with full HP/SP and correct identity', () => {
    const hero = makeWarrior()
    const unit = buildCombatUnit(hero, 'front', SKILLS)

    const level = hero.xp.level
    const stats = deriveStatsForHero(hero, level)
    const leveled = leveledAttrs(hero.baseAttrs, hero.growthGrades, level)
    const expectedMaxSP = deriveMaxSP(leveled.wil)

    expect(unit.level).toBe(level)
    expect(unit.stats).toEqual(stats)
    expect(unit.maxSP).toBe(expectedMaxSP)
    expect(unit.currentHP).toBe(stats.maxHP)
    expect(unit.currentSP).toBe(expectedMaxSP)
    expect(unit.actionGauge).toBe(0)
    expect(unit.alive).toBe(true)
    // CP = stat CP + the skills' CP term (Layer 1 §2.5).
    expect(unit.cp).toBe(combatPower(stats, skillCp(hero.skills)))
    expect(unit.side).toBe('hero')
    expect(unit.unitClass).toBe('warrior')
    expect(unit.line).toBe('front')
    expect(unit.element).toBe('fire')
    expect(unit.id).toBe('h_test_001')
    expect(unit.name).toBe('Tester')
    expect(unit.sourceHeroId).toBe(hero.id)
    expect(unit.keywords).toEqual([])
    expect(unit.targetTag).toBeUndefined()
  })

  it("starts skills with a 'basic' attack, then resolves authored skills", () => {
    const hero = makeWarrior()
    const unit = buildCombatUnit(hero, 'mid', SKILLS)
    expect(unit.skills[0].id).toBe('basic')
    expect(unit.skills.some((s) => s.id === 'basic')).toBe(true)
    expect(unit.skills).toEqual([basicAttackFor(hero), lv1('power_strike')])
  })

  it('resolves leveled skills: a higher skill level raises the multiplier and the CP', () => {
    const lo = buildCombatUnit(makeWarrior({ skills: [{ id: 'power_strike', level: 1, xp: 0 }] }), 'front', SKILLS)
    const hi = buildCombatUnit(makeWarrior({ skills: [{ id: 'power_strike', level: 4, xp: 0 }] }), 'front', SKILLS)
    expect(hi.skills[1]!.skillMult).toBeGreaterThan(lo.skills[1]!.skillMult)
    expect(hi.cp).toBeGreaterThan(lo.cp)
  })

  it("a mage hero's synthesized basic attack is magic", () => {
    const mage = makeWarrior({ heroClass: 'mage', skills: [{ id: 'arcane_burst', level: 1, xp: 0 }] })
    const unit = buildCombatUnit(mage, 'back', SKILLS)
    const basic = unit.skills.find((s) => s.id === 'basic')
    expect(basic).toBeDefined()
    expect(basic?.damageType).toBe('magic')
  })

  it('defaults to an empty registry (only the basic attack survives)', () => {
    const hero = makeWarrior({ skills: [{ id: 'power_strike', level: 1, xp: 0 }] })
    const unit = buildCombatUnit(hero, 'front')
    expect(unit.skills.map((s) => s.id)).toEqual(['basic'])
  })

  it('respects the hero level when deriving stats (higher level → more HP)', () => {
    const lo = buildCombatUnit(makeWarrior({ xp: { level: 1, xpIntoLevel: 0, heldXp: 0, atCap: false } }), 'front', SKILLS)
    const hi = buildCombatUnit(makeWarrior({ xp: { level: 20, xpIntoLevel: 0, heldXp: 0, atCap: false } }), 'front', SKILLS)
    expect(hi.level).toBe(20)
    expect(hi.stats.maxHP).toBeGreaterThan(lo.stats.maxHP)
  })

  it('builds Islat Han (canon protagonist starter) successfully', () => {
    const template = CAMEO_HEROES.find((h) => h.templateId === 'islat_han')
    expect(template).toBeDefined()
    const islat = ownedFromTemplate(template!, 1)
    const unit = buildCombatUnit(islat, 'front', SKILLS)

    expect(unit.name).toBe('Islat Han')
    expect(unit.side).toBe('hero')
    expect(unit.unitClass).toBeNull() // classless 1★ tutorial hero
    expect(unit.element).toBe('physical')
    expect(unit.currentHP).toBe(unit.stats.maxHP)
    expect(unit.currentHP).toBeGreaterThan(0)
    expect(unit.cp).toBeGreaterThan(0)
    // Classless → physical basic attack, plus his authored power_strike.
    expect(unit.skills[0].id).toBe('basic')
    expect(unit.skills[0].damageType).toBe('physical')
    expect(unit.skills.map((s) => s.id)).toContain('power_strike')
    expect(unit.sourceHeroId).toBe(islat.id)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildCombatUnit — equipment (Layer 1 §5.4 combat assembly)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildCombatUnit — equipment', () => {
  /** A forged weapon fixture (override any field). */
  function weapon(over: Partial<EquipmentItem> = {}): EquipmentItem {
    return {
      id: 'eq_w1' as EquipmentId,
      slot: 'weapon',
      grade: 'A',
      name: 'A Blade',
      statBonus: { pAtk: 50, mAtk: 50 },
      ...over,
    }
  }

  /** A fresh warrior with `item` worn in its matching slot. */
  function gearedWarrior(item: EquipmentItem, over: Partial<OwnedHero> = {}): OwnedHero {
    const equipment: OwnedHero['equipment'] = { weapon: null, armor: null, accessory: null }
    equipment[item.slot] = item.id
    return makeWarrior({ equipment, ...over })
  }

  it('adds the equipment flat block on top of the Sanity-adjusted base stats', () => {
    const item = weapon({ statBonus: { pAtk: 40, maxHP: 200 } })
    // Low Sanity reduces the base — gear must add flat ON TOP, unscaled by morale.
    const bare = buildCombatUnit(makeWarrior({ sanity: 10 }), 'front', SKILLS)
    const geared = buildCombatUnit(gearedWarrior(item, { sanity: 10 }), 'front', SKILLS, [item])
    expect(geared.stats.pAtk).toBe(bare.stats.pAtk + 40)
    expect(geared.stats.maxHP).toBe(bare.stats.maxHP + 200)
    expect(geared.currentHP).toBe(geared.stats.maxHP) // full HP off the boosted pool
  })

  it('lets a weapon override the unit element and its basic attack element', () => {
    const item = weapon({ element: 'water' }) // worn by a fire hero
    const unit = buildCombatUnit(gearedWarrior(item), 'front', SKILLS, [item])
    expect(unit.element).toBe('water')
    const basic = unit.skills.find((s) => s.id === 'basic')
    expect(basic?.element).toBe('water')
  })

  it('appends equipment keywords to the unit', () => {
    const kw: KeywordTag = { kind: 'vulnerable', element: 'water' }
    const item = weapon({ keywords: [kw] })
    const unit = buildCombatUnit(gearedWarrior(item), 'front', SKILLS, [item])
    expect(unit.keywords).toContainEqual(kw)
  })

  it('recomputes CP from the post-gear stats (gear raises CP)', () => {
    const item = weapon({ statBonus: { pAtk: 100, mAtk: 100 } })
    const bare = buildCombatUnit(makeWarrior(), 'front', SKILLS)
    const geared = buildCombatUnit(gearedWarrior(item), 'front', SKILLS, [item])
    expect(geared.cp).toBe(combatPower(geared.stats, skillCp(gearedWarrior(item).skills)))
    expect(geared.cp).toBeGreaterThan(bare.cp)
  })

  it('is unchanged when the hero has no equipment (empty inventory default)', () => {
    const hero = makeWarrior()
    const bare = buildCombatUnit(hero, 'front', SKILLS)
    const withEmpty = buildCombatUnit(hero, 'front', SKILLS, [])
    expect(withEmpty).toEqual(bare)
    expect(bare.element).toBe('fire')
    expect(bare.keywords).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Low-Sanity stat penalty (Layer 3 §3.2) — applied at unit assembly so the
// frozen snapshot combat reads is already weakened.
// ─────────────────────────────────────────────────────────────────────────────

const SC = TUNING.lobby.combat

describe('sanityStatMult', () => {
  it('is 1 at/above the minor threshold', () => {
    expect(sanityStatMult(100)).toBe(1)
    expect(sanityStatMult(SC.minorThreshold)).toBe(1)
  })
  it('is the minor multiplier in [majorThreshold, minorThreshold)', () => {
    expect(sanityStatMult(SC.minorThreshold - 1)).toBe(SC.minorMult)
    expect(sanityStatMult(SC.majorThreshold)).toBe(SC.minorMult)
  })
  it('is the major multiplier below the major threshold', () => {
    expect(sanityStatMult(SC.majorThreshold - 1)).toBe(SC.majorMult)
    expect(sanityStatMult(0)).toBe(SC.majorMult)
  })
})

describe('buildCombatUnit — Sanity penalty', () => {
  it('full Sanity → stats identical to the un-penalized derivation', () => {
    const hero = makeWarrior({ sanity: 100 })
    const unit = buildCombatUnit(hero, 'front', SKILLS)
    expect(unit.stats).toEqual(deriveStatsForHero(hero, hero.xp.level))
  })

  it('scales magnitude stats by the minor multiplier in the minor band', () => {
    const hero = makeWarrior({ sanity: 45 })
    const base = deriveStatsForHero(hero, hero.xp.level)
    const unit = buildCombatUnit(hero, 'front', SKILLS)
    expect(unit.stats.pAtk).toBe(Math.round(base.pAtk * SC.minorMult))
    expect(unit.stats.maxHP).toBe(Math.round(base.maxHP * SC.minorMult))
    expect(unit.stats.spd).toBe(Math.round(base.spd * SC.minorMult))
  })

  it('scales by the major multiplier below the major threshold', () => {
    const hero = makeWarrior({ sanity: 10 })
    const base = deriveStatsForHero(hero, hero.xp.level)
    const unit = buildCombatUnit(hero, 'front', SKILLS)
    expect(unit.stats.mDef).toBe(Math.round(base.mDef * SC.majorMult))
  })

  it('leaves percentage stats (crit/eva/acc/statusRes) untouched', () => {
    const hero = makeWarrior({ sanity: 10 })
    const base = deriveStatsForHero(hero, hero.xp.level)
    const unit = buildCombatUnit(hero, 'front', SKILLS)
    expect(unit.stats.critPct).toBe(base.critPct)
    expect(unit.stats.evaPct).toBe(base.evaPct)
    expect(unit.stats.accPct).toBe(base.accPct)
    expect(unit.stats.statusRes).toBe(base.statusRes)
  })

  it('stamps the hero Sanity onto the combat unit (for the panic check)', () => {
    expect(buildCombatUnit(makeWarrior({ sanity: 22 }), 'front', SKILLS).sanity).toBe(22)
  })

  it('lowers CP when Sanity is low (penalized stats flow into CP)', () => {
    const full = buildCombatUnit(makeWarrior({ sanity: 100 }), 'front', SKILLS)
    const low = buildCombatUnit(makeWarrior({ sanity: 10 }), 'front', SKILLS)
    expect(low.cp).toBeLessThan(full.cp)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildEnemyUnit
// ─────────────────────────────────────────────────────────────────────────────

describe('buildEnemyUnit', () => {
  it('builds a goblin at level 9 with positive stats and enemy identity', () => {
    const goblin = ENEMY_TEMPLATES.goblin
    const unit = buildEnemyUnit(goblin, 9, 'e_goblin_0')

    const effLevel = 9
    const attrs: PrimaryAttrs = {
      str: Math.round(goblin.attrMult.str * effLevel),
      agi: Math.round(goblin.attrMult.agi * effLevel),
      vit: Math.round(goblin.attrMult.vit * effLevel),
      int: Math.round(goblin.attrMult.int * effLevel),
      wil: Math.round(goblin.attrMult.wil * effLevel),
    }
    const stats = deriveStats(attrs)

    expect(unit.side).toBe('enemy')
    expect(unit.unitClass).toBeNull()
    expect(unit.level).toBe(9)
    expect(unit.id).toBe('e_goblin_0')
    expect(unit.name).toBe('Goblin')
    expect(unit.element).toBe('physical')
    expect(unit.line).toBe('front') // default line
    expect(unit.stats).toEqual(stats)
    expect(unit.maxSP).toBe(deriveMaxSP(attrs.wil))
    expect(unit.currentHP).toBe(stats.maxHP)
    expect(unit.currentSP).toBe(unit.maxSP)
    expect(unit.actionGauge).toBe(0)
    expect(unit.alive).toBe(true)
    expect(unit.cp).toBe(combatPower(stats))
    expect(unit.stats.maxHP).toBeGreaterThan(0)
    expect(unit.cp).toBeGreaterThan(0)
  })

  it('synthesizes a single physical Strike basic attack and NO sourceHeroId', () => {
    const unit = buildEnemyUnit(ENEMY_TEMPLATES.goblin, 9, 'e_goblin_1')
    expect(unit.skills).toHaveLength(1)
    expect(unit.skills[0]).toEqual({
      id: 'e_basic',
      name: 'Strike',
      skillMult: 1.0,
      damageType: 'physical',
      element: 'physical',
      target: 'single',
      spCost: 0,
    })
    expect(unit.sourceHeroId).toBeUndefined()
  })

  it('defaults targetTag to the template id', () => {
    const unit = buildEnemyUnit(ENEMY_TEMPLATES.wolf, 5, 'e_wolf_0')
    expect(unit.targetTag).toBe('wolf')
  })

  it('honors an explicit targetTag override', () => {
    const unit = buildEnemyUnit(ENEMY_TEMPLATES.goblin, 9, 'e_g', { targetTag: 'boss_goblin' })
    expect(unit.targetTag).toBe('boss_goblin')
  })

  it('carries the black_priest template phased keyword', () => {
    const priest = ENEMY_TEMPLATES.black_priest
    const unit = buildEnemyUnit(priest, 10, 'e_priest_0')
    expect(unit.keywords).toContainEqual({ kind: 'phased' })
  })

  it('appends opts.keywords after the template keywords', () => {
    const extra: KeywordTag = { kind: 'enrage', afterTick: 100, multiplier: 2 }
    const unit = buildEnemyUnit(ENEMY_TEMPLATES.black_priest, 10, 'e_priest_1', {
      keywords: [extra],
    })
    expect(unit.keywords).toEqual([{ kind: 'phased' }, extra])
  })

  it('applies levelBonus to the effective level (tougher boss)', () => {
    const base = buildEnemyUnit(ENEMY_TEMPLATES.ogre_brute, 10, 'e_ogre_0')
    const buffed = buildEnemyUnit(ENEMY_TEMPLATES.ogre_brute, 10, 'e_ogre_1', { levelBonus: 5 })
    expect(buffed.level).toBe(15)
    expect(buffed.stats.maxHP).toBeGreaterThan(base.stats.maxHP)

    // The buffed statline must equal a build at the raw effective level.
    const effAttrs: PrimaryAttrs = {
      str: Math.round(ENEMY_TEMPLATES.ogre_brute.attrMult.str * 15),
      agi: Math.round(ENEMY_TEMPLATES.ogre_brute.attrMult.agi * 15),
      vit: Math.round(ENEMY_TEMPLATES.ogre_brute.attrMult.vit * 15),
      int: Math.round(ENEMY_TEMPLATES.ogre_brute.attrMult.int * 15),
      wil: Math.round(ENEMY_TEMPLATES.ogre_brute.attrMult.wil * 15),
    }
    expect(buffed.stats).toEqual(deriveStats(effAttrs))
  })

  it('honors an explicit line', () => {
    const unit = buildEnemyUnit(ENEMY_TEMPLATES.dark_mage, 12, 'e_dm_0', { line: 'back' })
    expect(unit.line).toBe('back')
  })

  it('carries no keywords for a plain template', () => {
    const unit = buildEnemyUnit(ENEMY_TEMPLATES.goblin, 9, 'e_g2')
    expect(unit.keywords).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Determinism
// ─────────────────────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('buildCombatUnit is deterministic (same inputs → deep-equal unit)', () => {
    const a = buildCombatUnit(makeWarrior(), 'front', SKILLS)
    const b = buildCombatUnit(makeWarrior(), 'front', SKILLS)
    expect(a).toEqual(b)
  })

  it('buildEnemyUnit is deterministic (same inputs → deep-equal unit)', () => {
    const a = buildEnemyUnit(ENEMY_TEMPLATES.black_priest, 10, 'e_x', {
      line: 'mid',
      levelBonus: 2,
      keywords: [{ kind: 'enrage', afterTick: 50, multiplier: 3 }],
      targetTag: 'priest',
    })
    const b = buildEnemyUnit(ENEMY_TEMPLATES.black_priest, 10, 'e_x', {
      line: 'mid',
      levelBonus: 2,
      keywords: [{ kind: 'enrage', afterTick: 50, multiplier: 3 }],
      targetTag: 'priest',
    })
    expect(a).toEqual(b)
  })

  it('does not mutate its inputs', () => {
    const hero = makeWarrior()
    const heroSnapshot = JSON.parse(JSON.stringify(hero))
    buildCombatUnit(hero, 'front', SKILLS)
    expect(hero).toEqual(heroSnapshot)

    const tmpl = ENEMY_TEMPLATES.black_priest
    const tmplSnapshot = JSON.parse(JSON.stringify(tmpl))
    buildEnemyUnit(tmpl, 10, 'e_y', { keywords: [{ kind: 'phased' }] })
    expect(tmpl).toEqual(tmplSnapshot)
  })
})
