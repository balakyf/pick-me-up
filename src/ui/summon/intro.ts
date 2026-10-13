/**
 * Summon Theatre — meeting a person (spec 2026-10-12 S2). A freshly summoned hero is
 * introduced by who they are, not by their stat line: their trade before the summon,
 * what they love, what they do for fun, the trait that stands out, and one line in
 * their own voice.
 *
 * Everything is derived from the hero's identity (`personalityOf`, hash-picked lines),
 * so the same hero always introduces themselves the same way. English is the source
 * text; French lives in frSummon.ts.
 */
import type { OwnedHero } from '../../engine/types'
import { personalityOf, type Personality, type Voice } from '../../engine/life'
import { hashString } from '../pixel/rand'
import { tradeName } from '../life/speech'
import { t } from '../i18n/i18n'

/** Which bank of lines a hero speaks from: 1★ commoners, 2★ sell-swords, 3★+ the famous. */
export type IntroTier = 'humble' | 'seasoned' | 'proud'

export function introTier(star: number): IntroTier {
  return star <= 1 ? 'humble' : star === 2 ? 'seasoned' : 'proud'
}

/**
 * The introduction banks. Placeholders: {name}, {trade} (lower case, never after "a"),
 * {Trade} (capitalised, sentence-initial), {food}, {hobby}.
 */
export const INTRO_LINES: Readonly<Record<IntroTier, Readonly<Record<Voice, readonly string[]>>>> = {
  humble: {
    cheerful: [
      'Hello! I’m {name}! I’ve never been summoned before. Will there be {food}? I’d fight a goblin for {food}.',
      '{name}, at your service! I can’t fight yet, but I can learn. Probably!',
    ],
    formal: [
      '{name}, Master. I was only the village {trade}, but I will not shame you.',
      'Back home my evenings were for {hobby}, not swords. Still — {name}, at your service.',
    ],
    rough: [
      '{name}. Village {trade}. Don’t look at me like that — I’ve chased off wolves with a stick.',
      'Name’s {name}. No sword, no class, no problem. Point me at it.',
    ],
    quiet: ['…{name}. I’ll try not to be a burden.', 'I’m {name}. I don’t know what I can do here. But I’ll stay.'],
    grim: [
      '{name}. The village {trade}, in a tower full of monsters. Someone up there is laughing.',
      '{name}. I know how this story usually ends for people like me. Let’s write a different one.',
    ],
  },
  seasoned: {
    cheerful: [
      '{name}! {Trade} by trade, optimist by nature. Where do we start?',
      'Hi! {name}. Pay me in {food} and I’m yours for life.',
    ],
    formal: [
      '{name}. {Trade} by trade. I have stood in worse places than this, Master.',
      'I served before, Master. I can serve again. {name}, at your command.',
    ],
    rough: ['{name}. I’ve been paid less to fight worse. Where’s the tower?', '{Trade}. Name’s {name}. Don’t make me regret this.'],
    quiet: ['{name}. I watch, I listen, I hit when it counts.', '…{name}. I keep my blade clean and my mouth shut.'],
    grim: ['{name}. I’ve buried friends before. I’d rather not here.', '{name}. Every job ends one way or another. Let’s make this one end well.'],
  },
  proud: {
    cheerful: ['{name}, and yes, I’m as good as I look. Let’s climb!', '{name}! A real tower? With real monsters? Oh, this is wonderful.'],
    formal: ['I am {name}. My blade and my oath are yours, Master.', '{Trade} {name}, answering your call. Let us not waste it.'],
    rough: ['{name}. You got lucky, Master. Try to keep up.', '{name}. Show me the strongest thing in that tower.'],
    quiet: ['{name}. Let the tower learn my name.', '…{name}. Where do you need me?'],
    grim: ['{name}. Towers like this eat heroes. Not this one.', '{name}. I came a long way to die somewhere. It won’t be floor one.'],
  },
}

/**
 * The village trades (`personality.ts` BG_BY_STAR.low). Only these may say "the village
 * {trade}": a 1★ cameo who was a knight or a mercenary back home must not call themselves
 * "the village knight".
 */
const VILLAGE_TRADES: ReadonlySet<string> = new Set([
  'farmer',
  'carpenter',
  'baker',
  'smith',
  'fisher',
  'weaver',
  'shepherd',
  'miller',
  'herbalist',
  'shopkeeper',
  'scribe',
  'housekeeper',
  'innkeeper',
])

/** The lines this hero may speak: their voice's bank, minus the village lines if they were not a villager. */
export function introBank(hero: Pick<OwnedHero, 'id' | 'name' | 'star' | 'heroClass' | 'portraitToken'>, star = hero.star): readonly string[] {
  const p = personalityOf(hero)
  const bank = INTRO_LINES[introTier(star)][p.voice]
  if (VILLAGE_TRADES.has(p.background)) return bank
  const fitting = bank.filter((l) => !/village/i.test(l))
  return fitting.length > 0 ? fitting : bank
}

/** The English key of the line this hero introduces themselves with (stable per hero). */
export function introKey(hero: Pick<OwnedHero, 'id' | 'name' | 'star' | 'heroClass' | 'portraitToken'>, star = hero.star): string {
  const bank = introBank(hero, star)
  return bank[hashString(`intro|${hero.id}`) % bank.length]!
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0]!.toLocaleUpperCase() + s.slice(1)
}

/** The hero's opening line, translated and filled. `star` is the shown star. */
export function introLine(hero: OwnedHero, star = hero.star): string {
  const p = personalityOf(hero)
  const trade = tradeName(p.background)
  return t(introKey(hero, star), {
    name: hero.name,
    trade,
    Trade: capitalise(trade),
    food: t(p.food),
    hobby: t(p.hobby),
  })
}

type TraitKey = 'diligence' | 'sociability' | 'temper' | 'curiosity' | 'courage' | 'warmth'

/** A trait read at its high and low ends. */
export const TRAIT_WORDS: Readonly<Record<TraitKey, readonly [high: string, low: string]>> = {
  diligence: ['Hard worker', 'Easygoing'],
  sociability: ['Life of the party', 'Shy'],
  temper: ['Short fuse', 'Calm'],
  curiosity: ['Curious', 'Set in their ways'],
  courage: ['Fearless', 'Careful'],
  warmth: ['Warm-hearted', 'Guarded'],
}

const TRAIT_ORDER: readonly TraitKey[] = ['courage', 'warmth', 'sociability', 'temper', 'curiosity', 'diligence']

/**
 * The one or two traits that stand out (furthest from the middle, at least 0.15 away),
 * as English keys. Stable for a hero; ties break in a fixed order.
 */
export function standoutTraits(p: Pick<Personality, TraitKey>, max = 2): string[] {
  return TRAIT_ORDER.map((k) => ({ k, d: p[k] - 0.5 }))
    .filter((x) => Math.abs(x.d) >= 0.15)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || TRAIT_ORDER.indexOf(a.k) - TRAIT_ORDER.indexOf(b.k))
    .slice(0, max)
    .map((x) => TRAIT_WORDS[x.k][x.d > 0 ? 0 : 1])
}

/** Everything the reveal shows about the person, translated. */
export interface Persona {
  trade: string
  food: string
  hobby: string
  traits: string[]
  intro: string
}

export function personaOf(hero: OwnedHero, star = hero.star): Persona {
  const p = personalityOf(hero)
  return {
    trade: tradeName(p.background),
    food: t(p.food),
    hobby: t(p.hobby),
    traits: standoutTraits(p).map((k) => t(k)),
    intro: introLine(hero, star),
  }
}
