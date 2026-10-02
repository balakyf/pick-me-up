import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { buildCombatUnit } from '../unit'
import { aptitude } from '../life'
import { derivePersonality } from '../life/personality'
import { CAMEO_HEROES } from './cameoHeroes'
import { SKILLS } from './skills'
import { TUNING } from '../tuning'
import type { GameState, HeroId, OwnedHero, Star } from '../types'
import { TRAITS, TRAIT_FAMILIES, familyTraits, traitAtStar, traitFamilyOf, traitIsRare, traitOf, traitRankRoll, traitStatPct, type TraitFamily } from './traits'

function stranger(i: number, star: Star = 1, overrides: Partial<OwnedHero> = {}): OwnedHero {
  return {
    id: `h_${String(i).padStart(6, '0')}` as HeroId,
    name: `Lyra Vance${i}`,
    star,
    heroClass: star >= 3 ? 'warrior' : null,
    element: 'fire',
    baseAttrs: { str: 10, agi: 10, vit: 10, int: 10, wil: 10 },
    growthGrades: { str: 3, agi: 3, vit: 3, int: 3, wil: 3 },
    skills: [],
    portraitToken: `#${(i * 2654435761 >>> 8).toString(16).padStart(6, '0').slice(0, 6)}`,
    origin: 'procedural',
    xp: { level: 10, xpIntoLevel: 0, heldXp: 0, atCap: false },
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
    ...overrides,
  }
}

describe('the trait registry', () => {
  it('ten families, each with exactly one common and one rare form (20 traits)', () => {
    expect(Object.keys(TRAITS).length).toBe(20)
    for (const f of TRAIT_FAMILIES) {
      const [c, r] = familyTraits(f)
      expect(c.rarity).toBe('common')
      expect(r.rarity).toBe('rare')
      expect(c.family).toBe(f)
      expect(r.family).toBe(f)
    }
    for (const [id, d] of Object.entries(TRAITS)) expect(d.id).toBe(id)
  })

  it('every effect is small: no stat swings by more than 9 %, no flat bonus above 14 points', () => {
    for (const d of Object.values(TRAITS)) {
      for (const v of Object.values({ ...(d.statPct ?? {}), ...(d.alonePct ?? {}) })) expect(Math.abs(v)).toBeLessThanOrEqual(0.09)
      for (const v of Object.values(d.flat ?? {})) expect(Math.abs(v)).toBeLessThanOrEqual(14)
      expect(d.name.length).toBeGreaterThan(0)
      expect(d.blurb.length).toBeGreaterThan(0)
    }
  })
})

describe('traitOf — derived, deterministic, never stored', () => {
  it('the same identity always reads the same trait (and copies agree)', () => {
    for (let i = 0; i < 200; i++) {
      const h = stranger(i, ((i % 7) + 1) as Star)
      expect(traitOf(h)).toBe(traitOf({ ...h }))
      expect(traitFamilyOf(h)).toBe(traitFamilyOf({ ...h, star: 5 }))
    }
  })

  it('summoned heroes carry no trait field: the save is untouched', () => {
    let s: GameState = { ...createAccount(23, { now: 0 }), gold: 1_000_000 }
    s = summonMany(s, 'normal', 10).state
    for (const h of Object.values(s.heroes) as OwnedHero[]) {
      // ('portraitToken' spells "trait" inside it — look at the field names themselves.)
      const keys = JSON.stringify(h).match(/"(\w+)":/g) ?? []
      expect(keys.filter((k) => /^"trait/i.test(k))).toEqual([])
      expect(TRAITS[traitOf(h).id]).toBeDefined()
    }
  })

  it('the family never changes with star or class; a promotion can only awaken the rare form', () => {
    for (let i = 0; i < 400; i++) {
      const h = stranger(i)
      const fam = traitFamilyOf(h)
      let wasRare = false
      for (let star = 1; star <= 7; star++) {
        const d = traitAtStar({ ...h, heroClass: star >= 3 ? 'archer' : null }, star)
        expect(d.family).toBe(fam)
        if (wasRare) expect(d.rarity).toBe('rare')
        wasRare = d.rarity === 'rare'
      }
    }
  })

  it('rare traits grow likelier with the star, as tuned (within 4 %)', () => {
    const N = 3000
    const rateAt = (star: number) => {
      let rare = 0
      for (let i = 0; i < N; i++) if (traitIsRare(stranger(i), star)) rare++
      return rare / N
    }
    let prev = -1
    for (const star of [1, 2, 3, 4, 5, 6, 7]) {
      const r = rateAt(star)
      expect(Math.abs(r - TUNING.traits.rarePerMille[star]! / 1000)).toBeLessThan(0.04)
      expect(r).toBeGreaterThan(prev)
      prev = r
    }
    // The roll itself is spread over 0..999.
    const rolls = Array.from({ length: N }, (_, i) => traitRankRoll(stranger(i)))
    expect(Math.min(...rolls)).toBeLessThan(10)
    expect(Math.max(...rolls)).toBeGreaterThan(990)
  })

  it('every family turns up in a crowd, none dominates', () => {
    const counts: Record<string, number> = {}
    const N = 4000
    for (let i = 0; i < N; i++) {
      const f = traitFamilyOf(stranger(i))
      counts[f] = (counts[f] ?? 0) + 1
    }
    for (const f of TRAIT_FAMILIES) {
      expect(counts[f] ?? 0, f).toBeGreaterThan(N * 0.04)
      expect(counts[f] ?? 0, f).toBeLessThan(N * 0.2)
    }
  })

  it('temperament decides: the bold lean Brave, the hot-headed Hot-Blooded, night owls fight at night', () => {
    const lean = (pick: (h: OwnedHero) => boolean, family: TraitFamily) => {
      let inGroup = 0
      let hits = 0
      let outHits = 0
      let out = 0
      for (let i = 0; i < 4000; i++) {
        const h = stranger(i)
        const fam = traitFamilyOf(h)
        if (pick(h)) {
          inGroup++
          if (fam === family) hits++
        } else {
          out++
          if (fam === family) outHits++
        }
      }
      return hits / Math.max(1, inGroup) - outHits / Math.max(1, out)
    }
    expect(lean((h) => derivePersonality(h).courage > 0.65, 'courage')).toBeGreaterThan(0.05)
    expect(lean((h) => derivePersonality(h).temper > 0.65, 'temper')).toBeGreaterThan(0.05)
    expect(lean((h) => derivePersonality(h).chronotype === 'owl', 'night')).toBeGreaterThan(0.05)
    expect(lean((h) => derivePersonality(h).sociability < 0.35, 'loner')).toBeGreaterThan(0.05)
  })

  it('canon cameos wear the family their story gives them', () => {
    const fam = (name: string) => {
      const t = CAMEO_HEROES.find((c) => c.name === name)!
      return traitFamilyOf({ id: `cameo_${t.templateId}`, name: t.name, star: t.star, heroClass: t.heroClass, portraitToken: t.portraitToken } as OwnedHero)
    }
    expect(fam('Islat Han')).toBe('steadfast')
    expect(fam('Jenna Cirai')).toBe('healer')
    expect(fam('Ridigeon')).toBe('temper')
    expect(fam('Kishasha')).toBe('loner')
  })
})

describe('traits in the combat unit', () => {
  /** A hero whose family is `family`, rare or not, at 3★. */
  function wearing(family: TraitFamily, rare: boolean, overrides: Partial<OwnedHero> = {}): OwnedHero {
    for (let i = 0; i < 20000; i++) {
      const h = stranger(i, 3, overrides)
      if (traitFamilyOf(h) === family && traitIsRare(h, 3) === rare) return h
    }
    throw new Error(`no ${family}`)
  }
  /** The unit the tower would field (every stranger shares one stat line, so only the trait differs). */
  const bare = (h: OwnedHero) => buildCombatUnit(h, 'front', SKILLS)

  it('a Glass Cannon hits harder and has less life; a Hot-Blooded hits harder and guards worse', () => {
    const glass = wearing('temper', true)
    const u = bare(glass)
    expect(traitOf(glass).id).toBe('glass_cannon')
    const twin = wearing('steadfast', false) // same stats, keyword-only trait
    const v = bare({ ...twin })
    expect(u.stats.pAtk).toBeGreaterThan(v.stats.pAtk)
    expect(u.stats.maxHP).toBeLessThan(v.stats.maxHP)
    const hot = bare(wearing('temper', false))
    expect(hot.stats.pAtk).toBeGreaterThan(v.stats.pAtk)
    expect(hot.stats.pDef).toBeLessThan(v.stats.pDef)
  })

  it('keywords ride on the unit: Brave a frenzy, Steadfast a guard, Fortune’s Child an aegis, Spearhead an opener', () => {
    expect(bare(wearing('courage', false)).keywords).toContainEqual({ kind: 'frenzy', belowHpPct: 40, multiplier: 1.06 })
    expect(bare(wearing('steadfast', false)).keywords).toContainEqual({ kind: 'guard', reduction: 0.03 })
    expect(bare(wearing('luck', true)).keywords).toContainEqual({ kind: 'aegis', charges: 1 })
    expect(bare(wearing('leader', false)).keywords).toContainEqual({ kind: 'opener', multiplier: 1.15 })
    expect(bare(wearing('night', false)).keywords).toContainEqual({ kind: 'bane', family: 'undead', multiplier: 1.08 })
  })

  it('flat points: Lucky adds crit points, Iron Stomach status resistance', () => {
    const steady = bare(wearing('steadfast', false))
    expect(bare(wearing('luck', false)).stats.critPct).toBe(steady.stats.critPct + 3)
    expect(bare(wearing('stomach', false)).stats.statusRes).toBe(steady.stats.statusRes + 8)
  })

  it('a Lone Wolf is at its best outside a bond group', () => {
    const wolf = wearing('loner', false)
    const alone = bare(wolf)
    const bonded = bare({ ...wolf, bondGroup: 'g1' })
    expect(alone.stats.pAtk).toBeGreaterThan(bonded.stats.pAtk)
    expect(traitStatPct(traitOf(wolf), true)).toEqual({})
  })

  it('a trait adds a small CP term (more for a rare one)', () => {
    expect(TUNING.traits.cp.rare).toBeGreaterThan(TUNING.traits.cp.common)
    expect(TUNING.traits.cp.common).toBeGreaterThan(0)
  })
})

describe('traits in the Living Lobby', () => {
  it("a Healer's Hands is a better healer than the same person would otherwise be", () => {
    let found = 0
    for (let i = 0; i < 6000 && found < 5; i++) {
      const h = stranger(i)
      if (traitOf(h).id !== 'healers_hands') continue
      found++
      // The trait is worth a background point (0.35 aptitude) unless the clamp is reached.
      const apt = aptitude(h, 'healer')
      expect(apt).toBeGreaterThanOrEqual(0.5 + 0.35 - 0.001)
    }
    expect(found).toBe(5)
  })
})
