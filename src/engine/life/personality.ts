/**
 * Quanton Life — who a hero IS. A personality is derived from the hero's identity (never
 * stored), so it is stable for the hero's whole life and costs nothing in the save. Canon
 * cameos get authored personalities that override the hash.
 *
 * The background is the hero's life before the summon: 1★ are canon commoners (farmers,
 * carpenters, housewives), 2★ mercenaries/hunters/soldiers, 3★+ knights and mages. It
 * decides job aptitudes, so a 1★ who was a smith back home is a genuinely good smith.
 */
import { hash } from '../rng'
import type { JobId, OwnedHero, HeroClass } from '../types'

export type Voice = 'formal' | 'rough' | 'cheerful' | 'quiet' | 'grim'
export type Chronotype = 'early' | 'normal' | 'owl'
export type Hobby = 'gardening' | 'reading' | 'sparring' | 'music' | 'cards' | 'carving' | 'stargazing' | 'cooking'

export interface Personality {
  diligence: number
  sociability: number
  temper: number
  curiosity: number
  courage: number
  warmth: number
  voice: Voice
  chronotype: Chronotype
  food: string
  hobby: Hobby
  background: string
}

/** A trade or station before the summon, and the jobs it prepared them for (+1/+2). */
export interface Background {
  id: string
  aptitude: Partial<Record<JobId, number>>
}

export const BACKGROUNDS: Record<string, Background> = {
  // 1★ — ordinary people (canon: carpenters, farmers, housewives)
  farmer: { id: 'farmer', aptitude: { gardener: 2, cook: 1 } },
  carpenter: { id: 'carpenter', aptitude: { blacksmith: 1, guard: 1 } },
  baker: { id: 'baker', aptitude: { cook: 2 } },
  smith: { id: 'smith', aptitude: { blacksmith: 2 } },
  fisher: { id: 'fisher', aptitude: { cook: 1, gardener: 1 } },
  weaver: { id: 'weaver', aptitude: { merchant: 1, healer: 1 } },
  shepherd: { id: 'shepherd', aptitude: { gardener: 1, guard: 1 } },
  miller: { id: 'miller', aptitude: { cook: 1, merchant: 1 } },
  herbalist: { id: 'herbalist', aptitude: { healer: 2, gardener: 1 } },
  shopkeeper: { id: 'shopkeeper', aptitude: { merchant: 2 } },
  scribe: { id: 'scribe', aptitude: { scholar: 2 } },
  housekeeper: { id: 'housekeeper', aptitude: { cook: 1, healer: 1 } },
  innkeeper: { id: 'innkeeper', aptitude: { cook: 1, merchant: 1 } },
  // 2★ — mercenaries, hunters, soldiers, informants
  mercenary: { id: 'mercenary', aptitude: { guard: 2, instructor: 1 } },
  hunter: { id: 'hunter', aptitude: { guard: 1, gardener: 1, cook: 1 } },
  soldier: { id: 'soldier', aptitude: { guard: 2, instructor: 1 } },
  informant: { id: 'informant', aptitude: { merchant: 1, scholar: 1 } },
  sailor: { id: 'sailor', aptitude: { cook: 1, guard: 1 } },
  fieldMedic: { id: 'fieldMedic', aptitude: { healer: 2 } },
  // 3★+ — knights, wizards, people with some fame
  knight: { id: 'knight', aptitude: { instructor: 2, guard: 1 } },
  courtMage: { id: 'courtMage', aptitude: { scholar: 2 } },
  priest: { id: 'priest', aptitude: { healer: 2, scholar: 1 } },
  swordMaster: { id: 'swordMaster', aptitude: { instructor: 2 } },
  armorer: { id: 'armorer', aptitude: { blacksmith: 2, instructor: 1 } },
  captain: { id: 'captain', aptitude: { instructor: 1, guard: 2 } },
  sage: { id: 'sage', aptitude: { scholar: 2, healer: 1 } },
}

const BG_BY_STAR: Record<'low' | 'mid' | 'high', string[]> = {
  low: ['farmer', 'carpenter', 'baker', 'smith', 'fisher', 'weaver', 'shepherd', 'miller', 'herbalist', 'shopkeeper', 'scribe', 'housekeeper', 'innkeeper'],
  mid: ['mercenary', 'hunter', 'soldier', 'informant', 'sailor', 'fieldMedic', 'smith', 'herbalist'],
  high: ['knight', 'courtMage', 'priest', 'swordMaster', 'armorer', 'captain', 'sage', 'mercenary'],
}

/** Class-leaning backgrounds for classed heroes (a mage was never a shepherd). */
const BG_BY_CLASS: Partial<Record<HeroClass, string[]>> = {
  mage: ['courtMage', 'sage', 'scribe', 'priest'],
  warrior: ['knight', 'soldier', 'armorer', 'mercenary', 'captain'],
  spearman: ['soldier', 'captain', 'knight', 'hunter'],
  archer: ['hunter', 'informant', 'sailor', 'mercenary'],
  thief: ['informant', 'mercenary', 'sailor', 'shopkeeper'],
}

export const FOODS = ['stew', 'fresh bread', 'roast boar', 'honey cakes', 'grilled fish', 'spiced soup', 'apple pie', 'cheese', 'dumplings', 'meat pies'] as const
const HOBBIES: Hobby[] = ['gardening', 'reading', 'sparring', 'music', 'cards', 'carving', 'stargazing', 'cooking']
const VOICES: Voice[] = ['formal', 'rough', 'cheerful', 'quiet', 'grim']

/** Canon cameos: authored temperament (overrides the hash where set). */
const CAMEO: Record<string, Partial<Personality>> = {
  'Islat Han': { diligence: 0.95, courage: 0.9, temper: 0.35, warmth: 0.55, sociability: 0.4, voice: 'rough', background: 'mercenary', hobby: 'sparring', chronotype: 'early' },
  'Jenna Cirai': { warmth: 0.8, sociability: 0.7, voice: 'cheerful', background: 'fieldMedic', hobby: 'cooking' },
  'Aaron Delcut': { diligence: 0.8, courage: 0.8, voice: 'formal', background: 'knight', hobby: 'sparring' },
  Dika: { curiosity: 0.9, voice: 'quiet', background: 'sage', hobby: 'reading', chronotype: 'owl' },
  Ridigeon: { temper: 0.8, courage: 0.9, voice: 'rough', background: 'mercenary', hobby: 'cards' },
  'Muden Nighdelk': { warmth: 0.3, curiosity: 0.8, voice: 'grim', background: 'courtMage', hobby: 'stargazing', chronotype: 'owl' },
  'Nihaku Gastfeel': { diligence: 0.9, voice: 'formal', background: 'swordMaster', hobby: 'carving' },
  Anasis: { sociability: 0.85, warmth: 0.75, voice: 'cheerful', background: 'priest', hobby: 'music' },
  Kishasha: { temper: 0.7, sociability: 0.3, voice: 'quiet', background: 'hunter', hobby: 'gardening' },
}

/** 0..1 from a hash (integer arithmetic only — determinism guard). */
function unit(h: number): number {
  return (h >>> 0) / 4294967296
}

const cache = new Map<string, Personality>()

export function personalityOf(hero: Pick<OwnedHero, 'id' | 'name' | 'star' | 'heroClass' | 'portraitToken'>): Personality {
  const key = `${hero.id}|${hero.name}`
  const hit = cache.get(key)
  if (hit) return hit
  const r = (salt: string) => unit(hash('persona', hero.id, hero.name, hero.portraitToken, salt))
  // Traits cluster around the middle (average of two draws) — few people are extreme.
  const trait = (salt: string) => Math.round(((r(salt) + r(salt + '2')) / 2) * 100) / 100
  const tier = hero.star <= 1 ? 'low' : hero.star === 2 ? 'mid' : 'high'
  const classPool = hero.heroClass ? BG_BY_CLASS[hero.heroClass] : undefined
  const pool = classPool && hero.star >= 3 ? classPool : BG_BY_STAR[tier]
  const chrono = r('chrono')
  const base: Personality = {
    diligence: trait('dil'),
    sociability: trait('soc'),
    temper: trait('tem'),
    curiosity: trait('cur'),
    courage: trait('cou'),
    warmth: trait('war'),
    voice: VOICES[Math.floor(r('voice') * VOICES.length)]!,
    chronotype: chrono < 0.2 ? 'early' : chrono > 0.8 ? 'owl' : 'normal',
    food: FOODS[Math.floor(r('food') * FOODS.length)]!,
    hobby: HOBBIES[Math.floor(r('hobby') * HOBBIES.length)]!,
    background: pool[Math.floor(r('bg') * pool.length)]!,
  }
  const p = { ...base, ...(CAMEO[hero.name] ?? {}) }
  cache.set(key, p)
  return p
}

/** Pair chemistry −1..1: some people simply click (symmetric, stable). */
export function chemistry(a: string, b: string): number {
  const [x, y] = a < b ? [a, b] : [b, a]
  return unit(hash('chem', x, y)) * 2 - 1
}
