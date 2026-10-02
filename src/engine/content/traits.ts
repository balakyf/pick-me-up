/**
 * Innate traits (lane J · pillar 2, "heroes are people"). Every hero is born with one: the
 * small thing that makes even a 1★ baker worth keeping — Brave, Hot-Blooded, Lucky, an Iron
 * Stomach. A trait is DERIVED, never stored: its family comes from who the hero is (their
 * temperament, `personalityOf`, which is read from identity alone), so it costs nothing in
 * the save and needs no migration; canon cameos have an authored family.
 *
 * Ten families, each with a common and a RARE form (Brave → Lionheart). Which form a hero
 * wears is read from one fixed per-hero roll against a chance that rises with the star
 * (`TUNING.traits.rarePerMille`): a 5★ is far likelier to carry a rare trait than a 1★, and
 * a promotion can awaken a common trait into its rare form but never take it back — the
 * family, and so the person, never changes.
 *
 * Effects are small and contained: keyword tags, relative stat bonuses and flat points the
 * combat unit reads (`unit.ts buildCombatUnit`), and for a few families a light touch on the
 * Living Lobby (hunger, self-practice, a job they are born to). Pure data plus pure reads:
 * integer hashing only (determinism guard).
 */
import { hash } from '../rng'
import { personalityOf, type Personality } from '../life/personality'
import { TUNING } from '../tuning'
import type { DerivedStats, JobId, KeywordTag, OwnedHero } from '../types'

export type TraitFamily = 'courage' | 'temper' | 'steadfast' | 'study' | 'luck' | 'healer' | 'leader' | 'loner' | 'night' | 'stomach'
export type TraitRarity = 'common' | 'rare'

export type TraitId =
  | 'brave'
  | 'lionheart'
  | 'hot_blooded'
  | 'glass_cannon'
  | 'steadfast'
  | 'unbreakable'
  | 'quick_study'
  | 'prodigy'
  | 'lucky'
  | 'fortunes_child'
  | 'healers_hands'
  | 'saints_touch'
  | 'spearhead'
  | 'born_leader'
  | 'lone_wolf'
  | 'one_man_army'
  | 'night_fighter'
  | 'moonblade'
  | 'iron_stomach'
  | 'strong_as_an_ox'

type StatBlock = Partial<Record<keyof DerivedStats, number>>

/** What a trait does in the Living Lobby (all optional, all small). */
export interface TraitLife {
  /** Hunger drains this much slower (0.25 = a quarter slower). */
  hungerSlower?: number
  /** Self-practice in the yard gains this much more (0.5 = half again). */
  practiceMore?: number
  /** Extra aptitude for a job, in background points (a born trade is +1 or +2). */
  aptitude?: Partial<Record<JobId, number>>
}

export interface TraitDef {
  id: TraitId
  family: TraitFamily
  rarity: TraitRarity
  /** English display name (the UI translates). */
  name: string
  /** One line in the canon voice: who this person is. */
  blurb: string
  /** Keyword tags the combat unit carries. */
  keywords?: KeywordTag[]
  /** Relative bonuses to derived stats (0.05 = +5%), before gear (like an engraving's). */
  statPct?: StatBlock
  /** Flat points after the % (statusRes and critPct are percent points). */
  flat?: StatBlock
  /** Relative bonuses that hold only while the hero belongs to no bond group. */
  alonePct?: StatBlock
  life?: TraitLife
}

const ATK = (p: number): StatBlock => ({ pAtk: p, mAtk: p })

/** The registry: common then rare, family by family. */
export const TRAITS: Record<TraitId, TraitDef> = {
  // ── Courage: they fight harder with their back to the wall.
  brave: {
    id: 'brave',
    family: 'courage',
    rarity: 'common',
    name: 'Brave',
    blurb: 'Scared like everyone else. Goes anyway.',
    keywords: [{ kind: 'frenzy', belowHpPct: 40, multiplier: 1.06 }],
    flat: { statusRes: 6 },
  },
  lionheart: {
    id: 'lionheart',
    family: 'courage',
    rarity: 'rare',
    name: 'Lionheart',
    blurb: 'The worse it gets, the steadier the hand.',
    keywords: [{ kind: 'frenzy', belowHpPct: 50, multiplier: 1.12 }],
    flat: { statusRes: 12 },
  },
  // ── Temper: all in, every time.
  hot_blooded: {
    id: 'hot_blooded',
    family: 'temper',
    rarity: 'common',
    name: 'Hot-Blooded',
    blurb: 'Swings first. Thinks about it later, maybe.',
    statPct: { ...ATK(0.04), pDef: -0.03 },
  },
  glass_cannon: {
    id: 'glass_cannon',
    family: 'temper',
    rarity: 'rare',
    name: 'Glass Cannon',
    blurb: 'Hits like a falling tower. Breaks like a teacup.',
    statPct: { ...ATK(0.09), maxHP: -0.06 },
  },
  // ── Diligence: the one who is still standing.
  steadfast: {
    id: 'steadfast',
    family: 'steadfast',
    rarity: 'common',
    name: 'Steadfast',
    blurb: 'Plants their feet and does not move.',
    keywords: [{ kind: 'guard', reduction: 0.03 }],
  },
  unbreakable: {
    id: 'unbreakable',
    family: 'steadfast',
    rarity: 'rare',
    name: 'Unbreakable',
    blurb: 'They have been knocked down before. It did not take.',
    keywords: [{ kind: 'guard', reduction: 0.06 }],
    statPct: { pDef: 0.04 },
  },
  // ── Curiosity: learns everything twice as fast, including how to dodge.
  quick_study: {
    id: 'quick_study',
    family: 'study',
    rarity: 'common',
    name: 'Quick Study',
    blurb: 'Watches once, gets it. Annoying, honestly.',
    statPct: { spd: 0.03 },
    life: { practiceMore: 0.5 },
  },
  prodigy: {
    id: 'prodigy',
    family: 'study',
    rarity: 'rare',
    name: 'Prodigy',
    blurb: 'Some people are simply born for this.',
    statPct: { spd: 0.05 },
    flat: { critPct: 3 },
    life: { practiceMore: 1 },
  },
  // ── Luck: the tower's dice like them.
  lucky: {
    id: 'lucky',
    family: 'luck',
    rarity: 'common',
    name: 'Lucky',
    blurb: 'Finds coins in the dirt. Finds the gap in the armour.',
    flat: { critPct: 3 },
  },
  fortunes_child: {
    id: 'fortunes_child',
    family: 'luck',
    rarity: 'rare',
    name: "Fortune's Child",
    blurb: 'The first blow of every fight somehow misses them.',
    keywords: [{ kind: 'aegis', charges: 1 }],
    flat: { critPct: 4 },
  },
  // ── Warmth: patches people up, themselves included.
  healers_hands: {
    id: 'healers_hands',
    family: 'healer',
    rarity: 'common',
    name: "Healer's Hands",
    blurb: 'Binds a wound mid-swing. Theirs or yours.',
    keywords: [{ kind: 'lifesteal', fraction: 0.03 }],
    life: { aptitude: { healer: 1 } },
  },
  saints_touch: {
    id: 'saints_touch',
    family: 'healer',
    rarity: 'rare',
    name: "Saint's Touch",
    blurb: 'The wounded feel better when they walk in.',
    keywords: [{ kind: 'lifesteal', fraction: 0.06 }],
    statPct: { mDef: 0.04 },
    life: { aptitude: { healer: 2 } },
  },
  // ── Sociability: first through the door, and the others follow.
  spearhead: {
    id: 'spearhead',
    family: 'leader',
    rarity: 'common',
    name: 'Spearhead',
    blurb: 'First through the door, every time.',
    keywords: [{ kind: 'opener', multiplier: 1.15 }],
  },
  born_leader: {
    id: 'born_leader',
    family: 'leader',
    rarity: 'rare',
    name: 'Born Leader',
    blurb: 'People fall in behind them without being asked.',
    keywords: [{ kind: 'opener', multiplier: 1.25 }],
    statPct: { spd: 0.03 },
    life: { aptitude: { instructor: 1 } },
  },
  // ── Solitude: better on their own (a bond group blunts it).
  lone_wolf: {
    id: 'lone_wolf',
    family: 'loner',
    rarity: 'common',
    name: 'Lone Wolf',
    blurb: 'Works best when nobody is watching their back.',
    alonePct: { ...ATK(0.04), spd: 0.02 },
  },
  one_man_army: {
    id: 'one_man_army',
    family: 'loner',
    rarity: 'rare',
    name: 'One-Man Army',
    blurb: 'Send the others home. They have got this.',
    statPct: ATK(0.02),
    alonePct: { ...ATK(0.04), spd: 0.03 },
  },
  // ── Night owls: at home in the dark, and with what lives there.
  night_fighter: {
    id: 'night_fighter',
    family: 'night',
    rarity: 'common',
    name: 'Night-Fighter',
    blurb: 'Sleeps through the day. Sees fine in the dark.',
    keywords: [
      { kind: 'guard', reduction: 0.12, vs: 'dark' },
      { kind: 'bane', family: 'undead', multiplier: 1.08 },
    ],
  },
  moonblade: {
    id: 'moonblade',
    family: 'night',
    rarity: 'rare',
    name: 'Moonblade',
    blurb: 'The restless dead know their name.',
    keywords: [
      { kind: 'guard', reduction: 0.2, vs: 'dark' },
      { kind: 'bane', family: 'undead', multiplier: 1.15 },
      { kind: 'bane', family: 'demon', multiplier: 1.08 },
    ],
  },
  // ── Constitution: eats anything, shrugs off poison.
  iron_stomach: {
    id: 'iron_stomach',
    family: 'stomach',
    rarity: 'common',
    name: 'Iron Stomach',
    blurb: 'Has eaten worse than poison. Ask about the stew.',
    statPct: { maxHP: 0.02 },
    flat: { statusRes: 8 },
    life: { hungerSlower: 0.25 },
  },
  strong_as_an_ox: {
    id: 'strong_as_an_ox',
    family: 'stomach',
    rarity: 'rare',
    name: 'Strong as an Ox',
    blurb: 'Never sick a day in their life. Never.',
    statPct: { maxHP: 0.05 },
    flat: { statusRes: 14 },
    life: { hungerSlower: 0.4 },
  },
}

export const TRAIT_FAMILIES: readonly TraitFamily[] = ['courage', 'temper', 'steadfast', 'study', 'luck', 'healer', 'leader', 'loner', 'night', 'stomach']

/** The family's [common, rare] forms. */
export function familyTraits(family: TraitFamily): [TraitDef, TraitDef] {
  const both = Object.values(TRAITS).filter((d) => d.family === family)
  return [both.find((d) => d.rarity === 'common')!, both.find((d) => d.rarity === 'rare')!]
}

/** Canon cameos carry the family their story gives them. */
const CAMEO_FAMILY: Record<string, TraitFamily> = {
  'Islat Han': 'steadfast',
  'Jenna Cirai': 'healer',
  'Aaron Delcut': 'leader',
  Dika: 'study',
  Ridigeon: 'temper',
  'Muden Nighdelk': 'night',
  'Nihaku Gastfeel': 'steadfast',
  Anasis: 'courage',
  Kishasha: 'loner',
}

/** How much a hero leans toward each family, 0..1, from temperament alone. */
function leanings(p: Personality): Record<TraitFamily, number> {
  return {
    courage: p.courage,
    temper: p.temper,
    steadfast: p.diligence,
    study: p.curiosity,
    luck: 0.5,
    healer: p.warmth,
    leader: p.sociability,
    loner: 1 - p.sociability,
    night: p.chronotype === 'owl' ? 0.9 : p.chronotype === 'early' ? 0.15 : 0.4,
    stomach: p.hobby === 'cooking' ? 0.8 : 0.45,
  }
}

/** A 32-bit avalanche over the FNV hash (its low bits alone are weak for a modulo). */
function mix(h: number): number {
  let x = h >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return x >>> 0
}

type TraitInputs = Pick<OwnedHero, 'id' | 'name' | 'star' | 'heroClass' | 'portraitToken'>

/** The family a hero was born to: a cameo's authored one, else a draw weighted by temperament. */
export function traitFamilyOf(hero: TraitInputs): TraitFamily {
  const authored = CAMEO_FAMILY[hero.name]
  if (authored) return authored
  const lean = leanings(personalityOf(hero))
  const base = TUNING.traits.familyBase
  const weights = TRAIT_FAMILIES.map((f) => {
    const s = Math.round(lean[f] * 10)
    return base + s * s
  })
  let total = 0
  for (const w of weights) total += w
  let roll = mix(hash('trait', hero.id, hero.name, hero.portraitToken)) % total
  for (let i = 0; i < weights.length; i++) {
    if (roll < weights[i]!) return TRAIT_FAMILIES[i]!
    roll -= weights[i]!
  }
  return TRAIT_FAMILIES[TRAIT_FAMILIES.length - 1]!
}

/** The hero's fixed rarity roll, 0..999 (lower is luckier). */
export function traitRankRoll(hero: Pick<OwnedHero, 'id' | 'name' | 'portraitToken'>): number {
  return mix(hash('trait-rank', hero.id, hero.name, hero.portraitToken)) % 1000
}

/** Is the trait in its rare form at this star? */
export function traitIsRare(hero: Pick<OwnedHero, 'id' | 'name' | 'portraitToken'>, star: number): boolean {
  return traitRankRoll(hero) < (TUNING.traits.rarePerMille[star] ?? 0)
}

const memo = new Map<string, TraitDef>()

/** The hero's innate trait (derived from identity and current star; never stored). */
export function traitOf(hero: TraitInputs): TraitDef {
  const key = `${hero.id}|${hero.name}|${hero.portraitToken}|${hero.star}|${hero.heroClass ?? '-'}`
  const hit = memo.get(key)
  if (hit) return hit
  const [common, rare] = familyTraits(traitFamilyOf(hero))
  const def = traitIsRare(hero, hero.star) ? rare : common
  memo.set(key, def)
  return def
}

/** The trait a hero would wear at another star (a promotion's awakening: Brave → Lionheart). */
export function traitAtStar(hero: TraitInputs, star: number): TraitDef {
  return traitOf({ ...hero, star: star as OwnedHero['star'] })
}

/** The relative bonuses a trait grants this hero right now (its alone bonus only when unbonded). */
export function traitStatPct(def: TraitDef, bonded: boolean): StatBlock {
  const out: StatBlock = { ...(def.statPct ?? {}) }
  if (!bonded) for (const [k, v] of Object.entries(def.alonePct ?? {}) as [keyof DerivedStats, number][]) out[k] = (out[k] ?? 0) + v
  return out
}

/** The Living Lobby side of a hero's trait (empty for most). */
export function traitLife(hero: TraitInputs): TraitLife {
  return traitOf(hero).life ?? {}
}
