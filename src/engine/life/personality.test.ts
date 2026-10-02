import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { completePromotion } from '../promotion'
import { CAMEO_HEROES } from '../content/cameoHeroes'
import type { GameState, OwnedHero } from '../types'
import { BACKGROUNDS, backgroundPool, derivePersonality, personalityOf } from './personality'

function heroes(): { s: GameState; list: OwnedHero[] } {
  let s: GameState = { ...createAccount(17, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  return { s, list: Object.values(s.heroes) as OwnedHero[] }
}

describe('personalityOf depends only on its inputs (B25)', () => {
  it('a promoted hero reads exactly what a fresh process would — whatever was asked before', () => {
    const { s, list } = heroes()
    for (const h of list) {
      // Ask about the hero first at its summon star (this is what poisoned the old cache)…
      const before = personalityOf(h)
      expect(before).toEqual(derivePersonality(h))
      // …then promote twice (a classless hero may take up a class on the way).
      let p = completePromotion({ ...h, xp: { ...h.xp, atCap: true } }, s.seed)
      p = completePromotion({ ...p, xp: { ...p.xp, atCap: true } }, s.seed)
      expect(personalityOf(p)).toEqual(derivePersonality(p))
      // (A canon cameo keeps its authored past whatever class it grows into.)
      if (h.origin !== 'cameo') expect(backgroundPool(p.star, p.heroClass)).toContain(personalityOf(p).background)
      // Asking about the old self again still answers for the old self.
      expect(personalityOf(h)).toEqual(before)
    }
  })

  it('the same hero object (or a copy) always answers the same', () => {
    const { list } = heroes()
    const h = list[0]!
    expect(personalityOf(h)).toEqual(personalityOf({ ...h }))
    expect(personalityOf(h)).toBe(personalityOf({ ...h }))
  })

  it('every background a hero can draw is a known one', () => {
    for (const star of [1, 2, 3, 4, 5, 6, 7]) {
      for (const cls of [null, 'warrior', 'spearman', 'thief', 'archer', 'mage'] as const) {
        for (const bg of backgroundPool(star, cls)) expect(BACKGROUNDS[bg]).toBeDefined()
      }
    }
  })
})

describe('canon cameos (B47)', () => {
  it('a classed cameo’s authored background is one their class could have had', () => {
    for (const t of CAMEO_HEROES) {
      const hero = { id: `cameo_${t.templateId}`, name: t.name, star: t.star, heroClass: t.heroClass, portraitToken: t.portraitToken } as OwnedHero
      const bg = personalityOf(hero).background
      expect(BACKGROUNDS[bg], `${t.name}: ${bg}`).toBeDefined()
      if (t.heroClass !== null && t.star >= 3) expect(backgroundPool(t.star, t.heroClass), `${t.name}: ${bg}`).toContain(bg)
    }
  })
})
