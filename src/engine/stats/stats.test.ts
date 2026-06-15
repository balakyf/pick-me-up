import {
  gradeValueToLetter,
  gradeLetterToValue,
  attributeAtLevel,
  leveledAttrs,
  deriveStats,
  deriveStatsForHero,
  deriveMaxSP,
  xpToNext,
  cumulativeXpToLevel,
  levelCapForStar,
  envelopeForStar,
  applyXp,
  combatPower,
  combatPowerForHero,
} from './stats'
import { TUNING, STAR_ENVELOPES } from '../tuning'
import { XP_TO_NEXT } from './xpTable'
import type {
  GradeLetter,
  PrimaryAttrs,
  GrowthGrades,
  Hero,
  XpProgress,
  Star,
  HeroId,
} from '../types'

// Han's canon statline (Layer 0 §6.1) — the marquee derived-stat fixture.
const HAN_ATTRS: PrimaryAttrs = { str: 62, agi: 57, vit: 58, int: 10, wil: 30 }
const HAN_DERIVED = {
  maxHP: 746,
  pAtk: 165,
  mAtk: 24,
  pDef: 71,
  mDef: 36,
  spd: 74,
  critPct: 14,
  evaPct: 6,
  accPct: 96,
  statusRes: 6,
} as const

function makeHero(overrides: Partial<Hero> = {}): Hero {
  const base: Hero = {
    id: 'h_000001' as HeroId,
    name: 'Test Hero',
    star: 3,
    heroClass: 'warrior',
    element: 'physical',
    baseAttrs: { str: 18, agi: 10, vit: 12, int: 5, wil: 8 },
    growthGrades: { str: 9, agi: 5, vit: 6, int: 2, wil: 4 },
    skillIds: [],
    portraitToken: 'tok',
    origin: 'procedural',
  }
  return { ...base, ...overrides }
}

function freshXp(level = 1): XpProgress {
  return { level, xpIntoLevel: 0, heldXp: 0, atCap: false }
}

describe('gradeValueToLetter', () => {
  it('maps each band per Layer 0 §1.2', () => {
    expect(gradeValueToLetter(0)).toBe('F')
    expect(gradeValueToLetter(1)).toBe('F')
    expect(gradeValueToLetter(2)).toBe('E')
    expect(gradeValueToLetter(3)).toBe('D')
    expect(gradeValueToLetter(4)).toBe('C')
    expect(gradeValueToLetter(5)).toBe('B')
    expect(gradeValueToLetter(6)).toBe('B')
    expect(gradeValueToLetter(7)).toBe('A')
    expect(gradeValueToLetter(8)).toBe('A')
    expect(gradeValueToLetter(9)).toBe('S')
    expect(gradeValueToLetter(10)).toBe('SS')
  })

  it('clamps out-of-range values to [0, 10]', () => {
    expect(gradeValueToLetter(-5)).toBe('F')
    expect(gradeValueToLetter(0.5)).toBe('F')
    expect(gradeValueToLetter(100)).toBe('SS')
  })

  it('handles fractional values within a band', () => {
    expect(gradeValueToLetter(5.5)).toBe('B')
    expect(gradeValueToLetter(7.9)).toBe('A')
  })
})

describe('gradeLetterToValue', () => {
  it('returns each band floor per Layer 0 §1.2', () => {
    expect(gradeLetterToValue('F')).toBe(0)
    expect(gradeLetterToValue('E')).toBe(2)
    expect(gradeLetterToValue('D')).toBe(3)
    expect(gradeLetterToValue('C')).toBe(4)
    expect(gradeLetterToValue('B')).toBe(5)
    expect(gradeLetterToValue('A')).toBe(7)
    expect(gradeLetterToValue('S')).toBe(9)
    expect(gradeLetterToValue('SS')).toBe(10)
  })

  it('round-trips letter -> value -> letter for canonical floors', () => {
    const letters: GradeLetter[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS']
    for (const letter of letters) {
      expect(gradeValueToLetter(gradeLetterToValue(letter))).toBe(letter)
    }
  })
})

describe('attributeAtLevel', () => {
  it('matches the §6.2 worked examples (pinned)', () => {
    expect(attributeAtLevel(18, 9, 40)).toBeCloseTo(228.6, 5)
    expect(attributeAtLevel(18, 3, 40)).toBeCloseTo(88.2, 5)
  })

  it('returns base at level 1 (no growth applied)', () => {
    expect(attributeAtLevel(50, 10, 1)).toBe(50)
    expect(attributeAtLevel(7, 0, 1)).toBe(7)
  })

  it('grade 0 never grows', () => {
    expect(attributeAtLevel(12, 0, 99)).toBe(12)
  })

  it('is linear in level and grade with G = growthG', () => {
    // base + grade*(L-1)*G
    expect(attributeAtLevel(0, 1, 2)).toBeCloseTo(TUNING.stats.growthG, 10)
    expect(attributeAtLevel(0, 2, 3)).toBeCloseTo(2 * 2 * TUNING.stats.growthG, 10)
  })
})

describe('leveledAttrs', () => {
  it('applies attributeAtLevel to all five attributes, unrounded', () => {
    const base: PrimaryAttrs = { str: 10, agi: 8, vit: 12, int: 4, wil: 6 }
    const grades: GrowthGrades = { str: 5, agi: 3, vit: 7, int: 1, wil: 2 }
    const out = leveledAttrs(base, grades, 10)
    const G = TUNING.stats.growthG
    expect(out.str).toBeCloseTo(10 + 5 * 9 * G, 10)
    expect(out.agi).toBeCloseTo(8 + 3 * 9 * G, 10)
    expect(out.vit).toBeCloseTo(12 + 7 * 9 * G, 10)
    expect(out.int).toBeCloseTo(4 + 1 * 9 * G, 10)
    expect(out.wil).toBeCloseTo(6 + 2 * 9 * G, 10)
  })

  it('returns base attrs at level 1', () => {
    const base: PrimaryAttrs = { str: 10, agi: 8, vit: 12, int: 4, wil: 6 }
    const grades: GrowthGrades = { str: 5, agi: 3, vit: 7, int: 1, wil: 2 }
    expect(leveledAttrs(base, grades, 1)).toEqual(base)
  })

  it('does not mutate inputs', () => {
    const base: PrimaryAttrs = { str: 10, agi: 8, vit: 12, int: 4, wil: 6 }
    const grades: GrowthGrades = { str: 5, agi: 3, vit: 7, int: 1, wil: 2 }
    const baseCopy = { ...base }
    const gradesCopy = { ...grades }
    leveledAttrs(base, grades, 40)
    expect(base).toEqual(baseCopy)
    expect(grades).toEqual(gradesCopy)
  })
})

describe('deriveStats', () => {
  it("matches Han's canon statline (Layer 0 §6.1, pinned)", () => {
    expect(deriveStats(HAN_ATTRS)).toEqual(HAN_DERIVED)
  })

  it('rounds every output half-up', () => {
    // critPct = 5 + 57*0.15 = 13.55 -> 14 ; accPct = 90 + 57*0.1 = 95.7 -> 96
    const s = deriveStats(HAN_ATTRS)
    expect(s.critPct).toBe(14)
    expect(s.accPct).toBe(96)
    expect(s.evaPct).toBe(6) // 5.7 -> 6
  })

  it('caps critPct at critCap', () => {
    const d = TUNING.stats.derived
    // Need 5 + agi*0.15 to exceed 60 -> agi > ~366
    const s = deriveStats({ str: 0, agi: 1000, vit: 0, int: 0, wil: 0 })
    expect(s.critPct).toBe(d.critCap)
  })

  it('caps evaPct at evaCap', () => {
    const d = TUNING.stats.derived
    const s = deriveStats({ str: 0, agi: 1000, vit: 0, int: 0, wil: 0 })
    expect(s.evaPct).toBe(d.evaCap)
  })

  it('caps statusRes at statusResCap', () => {
    const d = TUNING.stats.derived
    const s = deriveStats({ str: 0, agi: 0, vit: 0, int: 0, wil: 1000 })
    expect(s.statusRes).toBe(d.statusResCap)
  })

  it('uses every derived coefficient (zero attrs give flats only)', () => {
    const d = TUNING.stats.derived
    const s = deriveStats({ str: 0, agi: 0, vit: 0, int: 0, wil: 0 })
    expect(s.maxHP).toBe(d.hpFlat)
    expect(s.pAtk).toBe(0)
    expect(s.mAtk).toBe(0)
    expect(s.pDef).toBe(0)
    expect(s.mDef).toBe(0)
    expect(s.spd).toBe(d.spdFlat)
    expect(s.critPct).toBe(d.critFlat)
    expect(s.evaPct).toBe(0)
    expect(s.accPct).toBe(d.accFlat)
    expect(s.statusRes).toBe(0)
  })
})

describe('deriveStatsForHero', () => {
  it('levels the hero attrs then derives', () => {
    const hero = makeHero({
      baseAttrs: HAN_ATTRS,
      growthGrades: { str: 0, agi: 0, vit: 0, int: 0, wil: 0 },
    })
    // Grades all 0 -> attrs identical to base at any level -> Han's statline.
    expect(deriveStatsForHero(hero, 50)).toEqual(HAN_DERIVED)
  })

  it('equals deriveStats(leveledAttrs(...))', () => {
    const hero = makeHero()
    const lvl = 40
    const expected = deriveStats(
      leveledAttrs(hero.baseAttrs, hero.growthGrades, lvl),
    )
    expect(deriveStatsForHero(hero, lvl)).toEqual(expected)
  })
})

describe('deriveMaxSP', () => {
  it('computes flat + perWil * leveledWil, rounded', () => {
    expect(deriveMaxSP(30)).toBe(
      Math.round(TUNING.combat.spFlat + TUNING.combat.spPerWil * 30),
    )
    expect(deriveMaxSP(0)).toBe(TUNING.combat.spFlat)
  })

  it('rounds fractional leveled WIL', () => {
    // 100 + 2 * 30.7 = 161.4 -> 161
    expect(deriveMaxSP(30.7)).toBe(161)
  })
})

describe('xpToNext', () => {
  it('matches pinned table values', () => {
    expect(xpToNext(1)).toBe(25)
    expect(xpToNext(2)).toBe(115)
    expect(xpToNext(3)).toBe(280)
    expect(xpToNext(10)).toBe(3962)
    expect(xpToNext(40)).toBe(83651)
    expect(xpToNext(80)).toBe(384360)
    expect(xpToNext(99)).toBe(614239)
  })

  it('reads XP_TO_NEXT[level-1]', () => {
    for (let l = 1; l <= TUNING.xp.maxLevel; l++) {
      expect(xpToNext(l)).toBe(XP_TO_NEXT[l - 1])
    }
  })

  it('covers up to maxLevel', () => {
    expect(() => xpToNext(TUNING.xp.maxLevel)).not.toThrow()
    expect(typeof xpToNext(TUNING.xp.maxLevel)).toBe('number')
  })

  it('throws below 1 or above maxLevel', () => {
    expect(() => xpToNext(0)).toThrow()
    expect(() => xpToNext(-1)).toThrow()
    expect(() => xpToNext(TUNING.xp.maxLevel + 1)).toThrow()
  })
})

describe('cumulativeXpToLevel', () => {
  it('is 0 at level 1', () => {
    expect(cumulativeXpToLevel(1)).toBe(0)
  })

  it('sums xpToNext(1..level-1)', () => {
    expect(cumulativeXpToLevel(2)).toBe(xpToNext(1))
    expect(cumulativeXpToLevel(3)).toBe(xpToNext(1) + xpToNext(2))
    expect(cumulativeXpToLevel(4)).toBe(25 + 115 + 280)
  })

  it('agrees with an independent running sum at several levels', () => {
    let running = 0
    for (let l = 1; l <= 100; l++) {
      expect(cumulativeXpToLevel(l)).toBe(running)
      running += xpToNext(l)
    }
  })

  it('throws out of range', () => {
    expect(() => cumulativeXpToLevel(0)).toThrow()
    expect(() => cumulativeXpToLevel(TUNING.xp.maxLevel + 1)).toThrow()
  })
})

describe('levelCapForStar / envelopeForStar', () => {
  it('returns the canon per-star caps 10/20/40/60/80/99/150 (pinned)', () => {
    expect(levelCapForStar(1)).toBe(10)
    expect(levelCapForStar(2)).toBe(20)
    expect(levelCapForStar(3)).toBe(40)
    expect(levelCapForStar(4)).toBe(60)
    expect(levelCapForStar(5)).toBe(80)
    expect(levelCapForStar(6)).toBe(99)
    expect(levelCapForStar(7)).toBe(150)
  })

  it('envelopeForStar returns the STAR_ENVELOPES entry', () => {
    for (let s = 1 as Star; s <= 7; s = (s + 1) as Star) {
      expect(envelopeForStar(s)).toEqual(STAR_ENVELOPES[s])
    }
  })
})

describe('applyXp', () => {
  it('advances from level 1 to level 2 with exactly the threshold (pinned)', () => {
    const out = applyXp(freshXp(1), 25, 1)
    expect(out.level).toBe(2)
    expect(out.xpIntoLevel).toBe(0)
    expect(out.heldXp).toBe(0)
    expect(out.atCap).toBe(false)
  })

  it('caps at the star cap (10) with heldXp > 0 and atCap true on huge XP (pinned)', () => {
    const out = applyXp(freshXp(1), 100_000_000, 1)
    expect(out.level).toBe(10)
    expect(out.xpIntoLevel).toBe(0)
    expect(out.atCap).toBe(true)
    expect(out.heldXp).toBeGreaterThan(0)
  })

  it('holds the exact overflow past the cap', () => {
    // XP to climb 1->cap(10) is cumulativeXpToLevel(10).
    const toCap = cumulativeXpToLevel(10)
    const out = applyXp(freshXp(1), toCap + 5000, 1)
    expect(out.level).toBe(10)
    expect(out.heldXp).toBe(5000)
    expect(out.atCap).toBe(true)
  })

  it('lands exactly at the cap with zero held when XP is exact', () => {
    const toCap = cumulativeXpToLevel(10)
    const out = applyXp(freshXp(1), toCap, 1)
    expect(out.level).toBe(10)
    expect(out.heldXp).toBe(0)
    expect(out.atCap).toBe(true)
  })

  it('accumulates XP partway into a level without leveling', () => {
    const out = applyXp(freshXp(1), 10, 1)
    expect(out.level).toBe(1)
    expect(out.xpIntoLevel).toBe(10)
    expect(out.heldXp).toBe(0)
    expect(out.atCap).toBe(false)
  })

  it('respects existing xpIntoLevel when leveling', () => {
    // Sitting at level 1 with 10 xp; xpToNext(1)=25; add 20 -> total 30 -> level 2 with 5 into.
    const out = applyXp({ level: 1, xpIntoLevel: 10, heldXp: 0, atCap: false }, 20, 1)
    expect(out.level).toBe(2)
    expect(out.xpIntoLevel).toBe(5)
    expect(out.heldXp).toBe(0)
    expect(out.atCap).toBe(false)
  })

  it('climbs multiple levels in one grant', () => {
    // xpToNext: 1->25, 2->115, 3->280. 25+115 = 140 -> reaches level 3 exactly.
    const out = applyXp(freshXp(1), 140, 3)
    expect(out.level).toBe(3)
    expect(out.xpIntoLevel).toBe(0)
    expect(out.atCap).toBe(false)
  })

  it('all further XP is held once already at cap', () => {
    const atCap: XpProgress = { level: 10, xpIntoLevel: 0, heldXp: 0, atCap: true }
    const out = applyXp(atCap, 999, 1)
    expect(out.level).toBe(10)
    expect(out.xpIntoLevel).toBe(0)
    expect(out.heldXp).toBe(999)
    expect(out.atCap).toBe(true)
  })

  it('zero gained is a no-op (but normalizes a not-yet-capped state)', () => {
    const out = applyXp(freshXp(1), 0, 1)
    expect(out.level).toBe(1)
    expect(out.xpIntoLevel).toBe(0)
    expect(out.heldXp).toBe(0)
    expect(out.atCap).toBe(false)
  })

  it('does not mutate the input', () => {
    const input = freshXp(1)
    const snapshot = { ...input }
    applyXp(input, 50_000, 1)
    expect(input).toEqual(snapshot)
  })

  it('throws on negative gained', () => {
    expect(() => applyXp(freshXp(1), -1, 1)).toThrow()
  })

  it('respects a higher star cap (3star -> 40)', () => {
    const out = applyXp(freshXp(1), 100_000_000, 3)
    expect(out.level).toBe(40)
    expect(out.atCap).toBe(true)
  })
})

describe('combatPower', () => {
  it("matches Han's CP = 481 (Layer 0 §6.1, pinned)", () => {
    expect(combatPower(HAN_DERIVED)).toBe(481)
  })

  it('adds skillScore directly and rounds', () => {
    expect(combatPower(HAN_DERIVED, 19)).toBe(481 + 19)
  })

  it('weights match TUNING.cp.weights', () => {
    const w = TUNING.cp.weights
    const stats = HAN_DERIVED
    const expected = Math.round(
      stats.maxHP * w.maxHP +
        stats.pAtk * w.pAtk +
        stats.mAtk * w.mAtk +
        stats.pDef * w.pDef +
        stats.mDef * w.mDef +
        stats.spd * w.spd +
        stats.critPct * w.critMult * w.critWeight,
    )
    expect(combatPower(stats)).toBe(expected)
  })

  it('defaults skillScore to 0', () => {
    expect(combatPower(HAN_DERIVED)).toBe(combatPower(HAN_DERIVED, 0))
  })
})

describe('combatPowerForHero', () => {
  it('equals combatPower(deriveStatsForHero(...))', () => {
    const hero = makeHero()
    const lvl = 40
    expect(combatPowerForHero(hero, lvl, 12)).toBe(
      combatPower(deriveStatsForHero(hero, lvl), 12),
    )
  })

  it('reproduces Han via a grade-0 hero', () => {
    const hero = makeHero({
      baseAttrs: HAN_ATTRS,
      growthGrades: { str: 0, agi: 0, vit: 0, int: 0, wil: 0 },
    })
    expect(combatPowerForHero(hero, 80)).toBe(481)
  })

  it('grows CP with level for a positive-grade hero', () => {
    const hero = makeHero()
    expect(combatPowerForHero(hero, 40)).toBeGreaterThan(
      combatPowerForHero(hero, 1),
    )
  })
})
