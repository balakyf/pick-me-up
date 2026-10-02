/**
 * Lane J — the promotion ceremony: a pure preview, the Master's choices (a class of two at
 * 3★, a skill of three), refusals, and the 'potential' growth model.
 */
import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { reduce } from '../store'
import { advanceTime } from '../time'
import { levelCapForStar } from '../stats'
import { makeSeed } from '../rng'
import { CLASS_SKILL, SKILLS, traitOf } from '../content'
import { isConditionalSkill, learnableSkillIds } from '../skills'
import { TUNING } from '../tuning'
import type { GameState, GrowthGrades, HeroClass, HeroId, OwnedHero, Star } from '../types'
import { classOffers, completePromotion, promotionChoiceRefusal, promotionPreview, skipPromotion, startPromotion } from './promotion'

const SEED = makeSeed(4242)
const KEYS = ['str', 'agi', 'vit', 'int', 'wil'] as const

function capped(o: Partial<OwnedHero> = {}): OwnedHero {
  const star = (o.star ?? 2) as Star
  return {
    id: 'h_cer' as HeroId,
    name: 'Maren Ashdown',
    star,
    heroClass: star >= 3 ? 'warrior' : null,
    element: 'water',
    baseAttrs: { str: 9, agi: 8, vit: 10, int: 6, wil: 7 },
    growthGrades: { str: 2, agi: 1, vit: 3, int: 0, wil: 2 },
    skills: [],
    portraitToken: '#3a7bd5',
    origin: 'procedural',
    xp: { level: levelCapForStar(star), xpIntoLevel: 0, heldXp: 0, atCap: true },
    alive: true,
    sanity: 100,
    promotion: null,
    equipment: { weapon: null, armor: null, accessory: null },
    training: null,
    engraving: null,
    favor: 35,
    bondTier: 1,
    ip: 0,
    gift: { last: null, streak: 0 },
    blessed: false,
    expedition: null,
    captiveOf: null,
    bondGroup: null,
    ...o,
  }
}

function stateWith(hero: OwnedHero, gems = 0): GameState {
  const acct = createAccount(4242, { now: 0 })
  return {
    ...acct,
    gems,
    heroes: { [hero.id]: hero },
    materials: { promotionStone: 9999, attrStone_water: 9999, bookOfReverseHeaven: 9 },
  }
}

const granted = (h: OwnedHero) => h.skills.filter((s) => !isConditionalSkill(s.id)).map((s) => s.id)

describe('promotionPreview — pure, seeded, and the truth', () => {
  it('is deterministic and never mutates the hero', () => {
    const h = capped({ star: 3, skills: [{ id: 'power_strike', level: 1, xp: 0 }] })
    const snap = JSON.stringify(h)
    expect(promotionPreview(h, SEED)).toEqual(promotionPreview(h, SEED))
    expect(JSON.stringify(h)).toBe(snap)
  })

  it('shows exactly what completion does: star, cap, grades, bases, class and skill', () => {
    for (let i = 0; i < 30; i++) {
      for (const star of [1, 2, 3, 4, 5, 6] as Star[]) {
        const h = capped({ id: `h_pv${i}` as HeroId, star, skills: star >= 3 ? [{ id: 'power_strike', level: 1, xp: 0 }] : [] })
        const pv = promotionPreview(h, SEED)
        const done = completePromotion(h, SEED)
        expect(done.star).toBe(pv.toStar)
        expect(levelCapForStar(done.star)).toBe(pv.levelCap.to)
        expect(done.growthGrades).toEqual(pv.grades.after)
        expect(done.baseAttrs).toEqual(pv.bases.after)
        expect(done.heroClass).toBe(pv.heroClass)
        expect(granted(done).filter((id) => !granted(h).includes(id))).toEqual(pv.defaultSkill ? [pv.defaultSkill] : [])
        expect(traitOf(done).id).toBe(pv.trait.to)
      }
    }
  })

  it('an engraving evolves in plain sight; an awakening is only a chance', () => {
    const engraved = capped({ star: 4, engraving: { id: 'beast_king_heir', grade: 'B' } })
    expect(promotionPreview(engraved, SEED).engraving).toEqual({ kind: 'evolve', from: { id: 'beast_king_heir', grade: 'B' }, to: { id: 'beast_king_heir', grade: 'A' } })
    expect(promotionPreview(capped({ star: 3 }), SEED).engraving).toEqual({ kind: 'awaken', chancePct: Math.round(TUNING.engravings.promotionAwakenChance * 100) })
    expect(promotionPreview(capped({ star: 1 }), SEED).engraving).toEqual({ kind: 'none' })
  })
})

describe('the choices', () => {
  it('a classless hero reaching 3★ is offered two common classes, the chamber’s own among them', () => {
    let saw = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const h = capped({ id: `h_cl${i}` as HeroId, star: 2 })
      const offers = classOffers(h, SEED)
      expect(offers.length).toBe(2)
      expect(new Set(offers).size).toBe(2)
      for (const c of offers) expect(['warrior', 'spearman', 'thief', 'archer']).toContain(c)
      // Without a choice the chamber picks — and its pick is on the table.
      expect(offers).toContain(completePromotion(h, SEED).heroClass)
      saw = new Set([...saw, ...offers])
    }
    expect(saw.size).toBe(4)
    // Nobody else chooses a class.
    expect(classOffers(capped({ star: 1 }), SEED)).toEqual([])
    expect(classOffers(capped({ star: 3 }), SEED)).toEqual([])
  })

  it('the chosen class is taken up, and its signature skill learned', () => {
    const h = capped({ star: 2 })
    for (const c of classOffers(h, SEED)) {
      const s = startPromotion(stateWith(h), h.id, 0, { heroClass: c })
      expect(s.heroes[h.id]!.promotion).toMatchObject({ heroClass: c })
      const done = completePromotion(s.heroes[h.id]!, SEED)
      expect(done.heroClass).toBe(c)
      expect(granted(done)).toContain(CLASS_SKILL[c])
      expect(promotionPreview(h, SEED, { heroClass: c }).skillOffers).toEqual([CLASS_SKILL[c]])
    }
  })

  it('a hero who knows their class skill chooses one of three learnable skills, and learns it', () => {
    const h = capped({ star: 3, skills: [{ id: 'power_strike', level: 1, xp: 0 }] })
    const pv = promotionPreview(h, SEED)
    expect(pv.skillOffers.length).toBe(TUNING.ceremony.skillOffers)
    expect(new Set(pv.skillOffers).size).toBe(pv.skillOffers.length)
    expect(pv.skillOffers[0]).toBe(pv.defaultSkill)
    for (const id of pv.skillOffers) {
      expect(learnableSkillIds()).toContain(id)
      expect(SKILLS[id]!.learnable).toBe(true)
      const s = startPromotion(stateWith(h), h.id, 0, { skillId: id })
      const done = completePromotion(s.heroes[h.id]!, SEED)
      expect(granted(done)).toContain(id)
      expect(granted(done).length).toBe(granted(h).length + 1)
    }
  })

  it('the skill choice never moves the rest of the roll (grades, bases, engraving)', () => {
    const h = capped({ star: 3, skills: [{ id: 'power_strike', level: 1, xp: 0 }] })
    const outs = promotionPreview(h, SEED).skillOffers.map((id) => completePromotion({ ...h, promotion: { completesAtWorld: 0, skillId: id } }, SEED))
    for (const o of outs) {
      expect(o.growthGrades).toEqual(outs[0]!.growthGrades)
      expect(o.baseAttrs).toEqual(outs[0]!.baseAttrs)
      expect(o.engraving).toEqual(outs[0]!.engraving)
    }
  })

  it('refuses what is not on offer, as Error("startPromotion: …")', () => {
    const two = capped({ star: 2 })
    const notOffered = (['warrior', 'spearman', 'thief', 'archer', 'mage'] as HeroClass[]).find((c) => !classOffers(two, SEED).includes(c))!
    expect(() => startPromotion(stateWith(two), two.id, 0, { heroClass: notOffered })).toThrow(/^startPromotion: .*not on offer/)
    expect(() => startPromotion(stateWith(two), two.id, 0, { heroClass: 'mage' })).toThrow(/^startPromotion: /)
    const one = capped({ star: 1 })
    expect(() => startPromotion(stateWith(one), one.id, 0, { heroClass: 'warrior' })).toThrow(/^startPromotion: .*does not choose a class/)
    const three = capped({ star: 3, skills: [{ id: 'power_strike', level: 1, xp: 0 }] })
    const off = learnableSkillIds().find((id) => !promotionPreview(three, SEED).skillOffers.includes(id) && id !== 'power_strike')!
    expect(() => startPromotion(stateWith(three), three.id, 0, { skillId: off })).toThrow(/^startPromotion: skill .* is not on offer/)
    expect(() => startPromotion(stateWith(three), three.id, 0, { skillId: 'power_strike' })).toThrow(/not on offer/)
    expect(promotionChoiceRefusal(three, SEED, {})).toBeNull()
  })

  it('PROMOTE_HERO carries the choices through reduce, the timer and a gem skip', () => {
    const h = capped({ star: 2 })
    const c = classOffers(h, SEED).find((x) => x !== completePromotion(h, SEED).heroClass)!
    const s0 = stateWith(h, 500)
    const s1 = reduce(s0, { type: 'PROMOTE_HERO', heroId: h.id, heroClass: c }, 0)
    expect(s1.heroes[h.id]!.promotion?.heroClass).toBe(c)
    // …completed by the clock…
    const later = advanceTime(s1, s1.heroes[h.id]!.promotion!.completesAtWorld + 1)
    expect(later.heroes[h.id]!.heroClass).toBe(c)
    expect(later.heroes[h.id]!.promotion).toBeNull()
    // …or by gems.
    const skipped = skipPromotion(s1, h.id)
    expect(skipped.heroes[h.id]!.heroClass).toBe(c)
    // A bad choice through reduce is the same refusal.
    expect(() => reduce(s0, { type: 'PROMOTE_HERO', heroId: h.id, skillId: 'nope' }, 0)).toThrow(/^startPromotion: /)
    // And with no choice, nothing rides on the timer (old saves and old commands read the same).
    const plain = reduce(s0, { type: 'PROMOTE_HERO', heroId: h.id }, 0)
    expect(Object.keys(plain.heroes[h.id]!.promotion!)).toEqual(['completesAtWorld'])
  })

  it('a chosen skill learned some other way before the bell falls back to the chamber’s', () => {
    const h = capped({ star: 3, skills: [{ id: 'power_strike', level: 1, xp: 0 }] })
    const pv = promotionPreview(h, SEED)
    const pickId = pv.skillOffers[1]!
    const learnedMeanwhile: OwnedHero = { ...h, skills: [...h.skills, { id: pickId, level: 1, xp: 0 }], promotion: { completesAtWorld: 0, skillId: pickId } }
    const done = completePromotion(learnedMeanwhile, SEED)
    expect(granted(done).filter((id) => id === pickId).length).toBe(1)
  })
})

describe("growth: the 'potential' model", () => {
  const sum = (g: GrowthGrades) => KEYS.reduce((n, k) => n + g[k], 0)

  it('every grade rises by one and one more by two, within the new ceiling', () => {
    if (TUNING.ceremony.growth !== 'potential') return
    const h = capped({ star: 3, growthGrades: { str: 2, agi: 1, vit: 3, int: 0, wil: 2 } })
    const pv = promotionPreview(h, SEED)
    expect(pv.grades.bonusAttr).not.toBeNull()
    for (const k of KEYS) expect(pv.grades.after[k] - h.growthGrades[k]).toBe(k === pv.grades.bonusAttr ? 2 : 1)
    // At the ceiling a grade simply stays.
    const top = capped({ star: 6, growthGrades: { str: 10, agi: 10, vit: 9, int: 10, wil: 10 } })
    const after = promotionPreview(top, SEED).grades.after
    expect(after).toEqual({ str: 10, agi: 10, vit: 10, int: 10, wil: 10 })
  })

  it('a summoned S-grade stays special: a 1★ raised to 5★ rarely reaches S, where a summoned 5★ often does', () => {
    if (TUNING.ceremony.growth !== 'potential') return
    let withS = 0
    let total = 0
    const N = 80
    for (let i = 0; i < N; i++) {
      let h = capped({ id: `h_rs${i}` as HeroId, star: 1, growthGrades: { str: i % 4, agi: (i >> 1) % 4, vit: (i >> 2) % 4, int: (i >> 3) % 4, wil: i % 3 } })
      for (let k = 0; k < 4; k++) h = { ...completePromotion(h, SEED), xp: { ...h.xp, atCap: true } }
      expect(h.star).toBe(5)
      if (KEYS.some((k) => h.growthGrades[k] >= 9)) withS++
      total += sum(h.growthGrades)
    }
    // A summoned 5★ rolls each grade uniformly in 0..9: 1 − 0.9⁵ ≈ 41 % carry an S.
    expect(withS / N).toBeLessThan(0.3)
    // …while the raise is still worth it: about six a grade (a summoned 5★ averages 4.5).
    expect(total / N / 5).toBeGreaterThan(5)
  })

  it('never lowers a grade', () => {
    for (let i = 0; i < 50; i++) {
      for (const star of [1, 2, 3, 4, 5, 6] as Star[]) {
        const env = ({ 1: 3, 2: 4, 3: 6, 4: 8, 5: 9, 6: 10 } as Record<number, number>)[star]!
        const g = { str: i % (env + 1), agi: (i * 3) % (env + 1), vit: (i * 7) % (env + 1), int: (i * 5) % (env + 1), wil: env }
        const h = capped({ id: `h_nl${i}` as HeroId, star, growthGrades: g })
        const after = promotionPreview(h, SEED).grades.after
        for (const k of KEYS) expect(after[k]).toBeGreaterThanOrEqual(g[k])
      }
    }
  })
})
