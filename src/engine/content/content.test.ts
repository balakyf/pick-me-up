import { CAMEO_HEROES } from './cameoHeroes'
import { NAME_POOLS } from './namePools'
import { ENEMY_TEMPLATES } from './enemyTemplates'
import { ANCHORS } from './anchors'
import { SKILLS } from './skills'
import { STAR_ENVELOPES, TUNING } from '../tuning'
import type {
  AttrKey,
  HeroClass,
  Star,
  KeywordTag,
  AnchorWaveSpec,
} from '../types'

const ATTR_KEYS: AttrKey[] = ['str', 'agi', 'vit', 'int', 'wil']
const VALID_CLASSES: HeroClass[] = ['warrior', 'spearman', 'thief', 'archer', 'mage']

// ─────────────────────────────────────────────────────────────────────────────
// Cameo heroes
// ─────────────────────────────────────────────────────────────────────────────

describe('CAMEO_HEROES', () => {
  it('has a meaningful canon roster (~7 entries)', () => {
    expect(CAMEO_HEROES.length).toBeGreaterThanOrEqual(7)
  })

  it('has unique templateIds', () => {
    const ids = CAMEO_HEROES.map((c) => c.templateId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique names', () => {
    const names = CAMEO_HEROES.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every cameo is envelope-valid: baseAttrs in range, grades within ceiling', () => {
    for (const cameo of CAMEO_HEROES) {
      const env = STAR_ENVELOPES[cameo.star as Star]
      expect(env).toBeDefined()
      const [min, max] = env.baseAttrRange
      for (const k of ATTR_KEYS) {
        const v = cameo.baseAttrs[k]
        expect(Number.isInteger(v), `${cameo.templateId}.baseAttrs.${k} integer`).toBe(true)
        expect(v, `${cameo.templateId}.baseAttrs.${k} >= ${min}`).toBeGreaterThanOrEqual(min)
        expect(v, `${cameo.templateId}.baseAttrs.${k} <= ${max}`).toBeLessThanOrEqual(max)
        const g = cameo.growthGrades[k]
        expect(Number.isInteger(g), `${cameo.templateId}.growthGrades.${k} integer`).toBe(true)
        expect(g, `${cameo.templateId}.growthGrades.${k} >= 0`).toBeGreaterThanOrEqual(0)
        expect(g, `${cameo.templateId}.growthGrades.${k} <= ${env.gradeCeiling}`).toBeLessThanOrEqual(
          env.gradeCeiling,
        )
      }
    }
  })

  it('all star < 3 cameos are classless (heroClass === null)', () => {
    for (const cameo of CAMEO_HEROES) {
      if (cameo.star < 3) {
        expect(cameo.heroClass, `${cameo.templateId} (★${cameo.star}) must be classless`).toBe(null)
      }
    }
  })

  it('any star >= 3 cameo with a class uses a valid HeroClass', () => {
    for (const cameo of CAMEO_HEROES) {
      if (cameo.heroClass !== null) {
        expect(cameo.star, `${cameo.templateId} has a class so star>=3`).toBeGreaterThanOrEqual(3)
        expect(VALID_CLASSES).toContain(cameo.heroClass)
      }
    }
  })

  it('every star is a valid Star (1..7)', () => {
    for (const cameo of CAMEO_HEROES) {
      expect([1, 2, 3, 4, 5, 6, 7]).toContain(cameo.star)
    }
  })

  it("includes the protagonist starter 'islat_han' (★1, classless, physical)", () => {
    const islat = CAMEO_HEROES.find((c) => c.templateId === 'islat_han')
    expect(islat).toBeDefined()
    expect(islat!.name).toBe('Islat Han')
    expect(islat!.star).toBe(1)
    expect(islat!.heroClass).toBe(null)
    expect(islat!.element).toBe('physical')
  })

  it('Islat Han is rolled near the TOP of the 1★ band (viable starter)', () => {
    const islat = CAMEO_HEROES.find((c) => c.templateId === 'islat_han')!
    const env = STAR_ENVELOPES[1]
    const max = env.baseAttrRange[1]
    // Decent str/agi/vit and grades at the ceiling for the physical attributes.
    expect(islat.baseAttrs.str).toBe(max)
    expect(islat.baseAttrs.agi).toBeGreaterThanOrEqual(max - 2)
    expect(islat.baseAttrs.vit).toBeGreaterThanOrEqual(max - 2)
    expect(islat.growthGrades.str).toBe(env.gradeCeiling)
    expect(islat.growthGrades.agi).toBe(env.gradeCeiling)
    expect(islat.growthGrades.vit).toBe(env.gradeCeiling)
  })

  it('does NOT include Sirris (the out-of-slice inflation hero)', () => {
    for (const cameo of CAMEO_HEROES) {
      expect(cameo.templateId.toLowerCase()).not.toContain('sirris')
      expect(cameo.templateId.toLowerCase()).not.toContain('sirres')
      expect(cameo.name.toLowerCase()).not.toContain('sirris')
      expect(cameo.name.toLowerCase()).not.toContain('sirres')
    }
  })

  it('every cameo has a deterministic portraitToken', () => {
    for (const cameo of CAMEO_HEROES) {
      expect(typeof cameo.portraitToken).toBe('string')
      expect(cameo.portraitToken.length).toBeGreaterThan(0)
    }
  })

  it('every cameo skillId resolves to a registered SKILL', () => {
    for (const cameo of CAMEO_HEROES) {
      for (const sid of cameo.skillIds) {
        expect(SKILLS[sid], `${cameo.templateId} references unknown skill ${sid}`).toBeDefined()
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Name pools
// ─────────────────────────────────────────────────────────────────────────────

describe('NAME_POOLS', () => {
  it('has >= 30 first and >= 30 last names', () => {
    expect(NAME_POOLS.first.length).toBeGreaterThanOrEqual(30)
    expect(NAME_POOLS.last.length).toBeGreaterThanOrEqual(30)
  })

  it('has no duplicate or empty names', () => {
    for (const key of ['first', 'last'] as const) {
      const pool = NAME_POOLS[key]
      expect(new Set(pool).size, `${key} pool unique`).toBe(pool.length)
      for (const n of pool) expect(n.trim().length).toBeGreaterThan(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Skills
// ─────────────────────────────────────────────────────────────────────────────

describe('SKILLS', () => {
  it('every entry is keyed by its own id and well-formed', () => {
    for (const [key, skill] of Object.entries(SKILLS)) {
      expect(skill.id).toBe(key)
      expect(skill.name.length).toBeGreaterThan(0)
      // Passives are never cast, so they carry no multiplier.
      if (skill.passive === undefined) expect(skill.baseMult).toBeGreaterThan(0)
      expect(skill.perLevel).toBeGreaterThanOrEqual(0)
      expect(['F', 'E', 'D', 'C', 'B', 'A', 'S', 'U']).toContain(skill.grade)
      expect(['physical', 'magic']).toContain(skill.damageType)
      expect(['single', 'all-enemies']).toContain(skill.target)
      expect(skill.spCost).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Enemy templates
// ─────────────────────────────────────────────────────────────────────────────

function hasKeyword(keywords: KeywordTag[] | undefined, kind: KeywordTag['kind']): boolean {
  return (keywords ?? []).some((k) => k.kind === kind)
}

describe('ENEMY_TEMPLATES', () => {
  it('contains the required Prairie + Ruins templates', () => {
    for (const id of ['goblin', 'wolf', 'harpy', 'skeleton', 'soldier']) {
      expect(ENEMY_TEMPLATES[id], `missing ${id}`).toBeDefined()
    }
  })

  it('every template is keyed by its own id with a full attrMult', () => {
    for (const [key, t] of Object.entries(ENEMY_TEMPLATES)) {
      expect(t.id).toBe(key)
      expect(t.name.length).toBeGreaterThan(0)
      for (const k of ATTR_KEYS) {
        expect(typeof t.attrMult[k], `${key}.attrMult.${k}`).toBe('number')
        expect(t.attrMult[k], `${key}.attrMult.${k} >= 0`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('black_priest is a phased boss', () => {
    const bp = ENEMY_TEMPLATES.black_priest
    expect(bp).toBeDefined()
    expect(bp.element).toBe('dark')
    expect(hasKeyword(bp.keywords, 'phased')).toBe(true)
  })

  it('lv999_creature is an enrage boss with the configured afterTick/multiplier', () => {
    const lv = ENEMY_TEMPLATES.lv999_creature
    expect(lv).toBeDefined()
    expect(hasKeyword(lv.keywords, 'enrage')).toBe(true)
    const enrage = lv.keywords!.find((k) => k.kind === 'enrage')
    expect(enrage).toEqual({ kind: 'enrage', afterTick: 300, multiplier: 5 })
  })

  it('goblin is low across the board; ogre_brute is a high VIT+STR tank', () => {
    const gob = ENEMY_TEMPLATES.goblin
    for (const k of ATTR_KEYS) expect(gob.attrMult[k]).toBeLessThan(1)
    const ogre = ENEMY_TEMPLATES.ogre_brute
    expect(ogre.attrMult.vit).toBeGreaterThan(1)
    expect(ogre.attrMult.str).toBeGreaterThan(1)
    expect(ogre.attrMult.vit).toBeGreaterThan(ogre.attrMult.agi)
  })

  it('dark_mage is high INT / low VIT; beast is high AGI', () => {
    const mage = ENEMY_TEMPLATES.dark_mage
    expect(mage.attrMult.int).toBeGreaterThan(mage.attrMult.vit)
    expect(mage.attrMult.int).toBeGreaterThan(1)
    const beast = ENEMY_TEMPLATES.beast
    const others = ATTR_KEYS.filter((k) => k !== 'agi').map((k) => beast.attrMult[k])
    for (const v of others) expect(beast.attrMult.agi).toBeGreaterThan(v)
  })

  it('bosses are high everything relative to a goblin', () => {
    const gob = ENEMY_TEMPLATES.goblin
    for (const id of ['black_priest', 'lv999_creature']) {
      const boss = ENEMY_TEMPLATES[id]
      for (const k of ATTR_KEYS) {
        expect(boss.attrMult[k], `${id}.${k} > goblin.${k}`).toBeGreaterThan(gob.attrMult[k])
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Anchors
// ─────────────────────────────────────────────────────────────────────────────

function allWaveSpecs(floor: number): AnchorWaveSpec[] {
  return ANCHORS[floor].waves.flat()
}

describe('ANCHORS', () => {
  it('defines F5 and F10', () => {
    expect(ANCHORS[5]).toBeDefined()
    expect(ANCHORS[10]).toBeDefined()
    expect(ANCHORS[5].floor).toBe(5)
    expect(ANCHORS[10].floor).toBe(10)
  })

  it('F5 is a Survival mission with a survive objective + timer = f5SurviveTicks', () => {
    const f5 = ANCHORS[5]
    expect(f5.missionType).toBe('Survival')
    expect(f5.timer).toBe(TUNING.tower.f5SurviveTicks)
    expect(f5.objectives).toEqual([{ kind: 'survive', ticks: TUNING.tower.f5SurviveTicks }])
    expect(f5.waves.length).toBeGreaterThanOrEqual(2)
  })

  it('F10 is a Defense mission with defend + defeat(black_priest) objectives', () => {
    const f10 = ANCHORS[10]
    expect(f10.missionType).toBe('Defense')
    expect(f10.timer).toBe(null)
    const defend = f10.objectives.find((o) => o.kind === 'defend')
    const defeat = f10.objectives.find((o) => o.kind === 'defeat')
    expect(defend).toEqual({ kind: 'defend', waves: TUNING.tower.f10Waves })
    expect(defeat).toEqual({ kind: 'defeat', targetTag: 'black_priest' })
  })

  it('F10 has exactly 3 waves (canon) matching f10Waves', () => {
    expect(ANCHORS[10].waves.length).toBe(3)
    expect(ANCHORS[10].waves.length).toBe(TUNING.tower.f10Waves)
  })

  it("F10 wave 3 contains the Lv999 (enrage) AND the phased Black Priest target", () => {
    const wave3 = ANCHORS[10].waves[2]
    const lv = wave3.find((g) => g.templateId === 'lv999_creature')
    const bp = wave3.find((g) => g.templateId === 'black_priest')
    expect(lv, 'wave 3 has lv999_creature').toBeDefined()
    expect(bp, 'wave 3 has black_priest').toBeDefined()
    expect(hasKeyword(lv!.keywords, 'enrage')).toBe(true)
    expect(hasKeyword(bp!.keywords, 'phased')).toBe(true)
    expect(bp!.targetTag).toBe('black_priest')
  })

  it('every anchor wave templateId exists in ENEMY_TEMPLATES', () => {
    for (const floor of Object.keys(ANCHORS).map(Number)) {
      for (const spec of allWaveSpecs(floor)) {
        expect(ENEMY_TEMPLATES[spec.templateId], `F${floor} unknown template ${spec.templateId}`).toBeDefined()
        expect(spec.count).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('the F10 defeat target references an enemy template that exists', () => {
    const defeat = ANCHORS[10].objectives.find((o) => o.kind === 'defeat') as {
      kind: 'defeat'
      targetTag: string
    }
    expect(ENEMY_TEMPLATES[defeat.targetTag]).toBeDefined()
  })
})
