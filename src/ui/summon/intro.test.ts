import { afterEach, describe, it, expect } from 'vitest'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import { personalityOf } from '../../engine/life'
import { FR_SUMMON } from '../i18n/frSummon'
import { setLocale } from '../i18n/i18n'
import { INTRO_LINES, TRAIT_WORDS, introBank, introKey, introLine, introTier, personaOf, standoutTraits } from './intro'
import type { OwnedHero } from '../../engine/types'

afterEach(() => setLocale('en'))

const heroes = summonMany(createAccount(11), 'normal', 10).heroes

const ALLOWED = new Set(['name', 'trade', 'Trade', 'food', 'hobby'])
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)

describe('meeting a person', () => {
  it('picks the bank by shown star: 1★ humble, 2★ seasoned, 3★+ proud', () => {
    expect([1, 2, 3, 4, 6].map(introTier)).toEqual(['humble', 'seasoned', 'proud', 'proud', 'proud'])
  })

  it('every voice has lines in every bank, and every line has a French translation', () => {
    for (const bank of Object.values(INTRO_LINES)) {
      for (const lines of Object.values(bank)) {
        expect(lines.length).toBeGreaterThanOrEqual(2)
        for (const en of lines) {
          for (const ph of placeholders(en)) expect(ALLOWED.has(ph)).toBe(true)
          expect(placeholders(en)).toContain('name')
          expect(FR_SUMMON[en]).toBeDefined()
        }
      }
    }
    for (const [high, low] of Object.values(TRAIT_WORDS)) {
      expect(FR_SUMMON[high]).toBeDefined()
      expect(FR_SUMMON[low]).toBeDefined()
    }
  })

  it('a hero always introduces themselves the same way, in their own voice', () => {
    for (const h of heroes) {
      const key = introKey(h)
      expect(introKey(h)).toBe(key)
      expect(INTRO_LINES[introTier(h.star)][personalityOf(h).voice]).toContain(key)
      const line = introLine(h)
      expect(line).toContain(h.name)
      expect(line).not.toMatch(/\{\w+\}/)
    }
  })

  it('the persona names the trade, the food, the hobby, and translates', () => {
    const h = heroes.find((x) => x.star === 1) ?? heroes[0]!
    const en = personaOf(h)
    expect(en.trade.length).toBeGreaterThan(0)
    expect(en.food.length).toBeGreaterThan(0)
    expect(en.hobby.length).toBeGreaterThan(0)
    setLocale('fr')
    const fr = personaOf(h)
    expect(fr.intro).toContain(h.name)
    expect(fr.intro).not.toBe(en.intro)
  })

  it('standout traits: the most extreme first, at most two, none when everyone is middling', () => {
    const mid = { diligence: 0.5, sociability: 0.5, temper: 0.5, curiosity: 0.5, courage: 0.5, warmth: 0.5 }
    expect(standoutTraits(mid)).toEqual([])
    expect(standoutTraits({ ...mid, courage: 0.95, warmth: 0.2, temper: 0.7 })).toEqual(['Fearless', 'Guarded'])
    expect(standoutTraits({ ...mid, sociability: 0.1 }, 1)).toEqual(['Shy'])
  })

  it('only villagers call themselves "the village {trade}"', () => {
    // 1★ cameos with grander pasts (Aaron Delcut was a knight, Islat Han a mercenary).
    for (const name of ['Aaron Delcut', 'Islat Han']) {
      for (let i = 0; i < 40; i++) {
        const h = { ...heroes[0]!, id: `probe-${name}-${i}`, name, star: 1 } as OwnedHero
        expect(personalityOf(h).background === 'knight' || personalityOf(h).background === 'mercenary').toBe(true)
        expect(introBank(h).some((l) => /village/i.test(l))).toBe(false)
        expect(introLine(h)).not.toMatch(/village/i)
      }
    }
    // Every 1★ procedural hero is a villager, so the village lines stay in their bank.
    for (let seed = 1; seed <= 30; seed++) {
      for (const h of summonMany(createAccount(seed), 'normal', 10).heroes) {
        if (h.star !== 1 || h.origin !== 'procedural') continue
        expect(introBank(h)).toEqual(INTRO_LINES.humble[personalityOf(h).voice])
      }
    }
  })
})
