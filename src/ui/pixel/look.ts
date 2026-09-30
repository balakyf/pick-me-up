/**
 * Hero "look": the visual genome of a hero — a pure function of its identity.
 *
 * Canon → visuals (see the pixel-art direction spec §3): 1★ are ordinary people,
 * 2★ rough mercenaries, 3★+ carry a class kit (plate, mail + tabard, leathers +
 * quiver, robe + collar, mask + scarf). Stars then escalate the regalia: 3★ a waist
 * sash, 4★ a cape, 5★ gold trim + a chest gem (+ circlet), 6★ a faint aura, 7★ a
 * glowing, twinkling aura. The element tints trims/gems; a cameo's portraitToken
 * becomes its signature cloth colour.
 *
 * Two random streams: the FACE (skin, hair, eyes, marks) is rolled from identity
 * alone, the KIT from identity + outfit — so a promotion re-dresses a hero (and
 * visibly upgrades them) without ever changing who they are.
 */
import type { Element, HeroClass, Star } from '../../engine/types'
import { hex, type RGBA } from './bitmap'
import {
  CLASS_CLOTH,
  ELEMENT_RAMP,
  EYES,
  GOLD,
  HAIR,
  LEATHER,
  SKIN,
  STEEL,
  rampFrom,
  tame,
  ramp,
  type Ramp,
} from './palette'
import { hashString, seededRand } from './rand'

export type HairStyle = 'short' | 'spiky' | 'long' | 'ponytail' | 'bob' | 'buzz' | 'bun'
export type Outfit = 'peasant' | 'merc' | 'warrior' | 'spearman' | 'thief' | 'archer' | 'mage' | 'master'
export type Headgear = 'none' | 'helm' | 'plumedHelm' | 'hood' | 'hat' | 'bandana' | 'circlet'
export type FaceMark = 'none' | 'freckles' | 'scar' | 'beard' | 'mole' | 'patch'
export type Weapon = 'none' | 'sword' | 'spear' | 'staff' | 'bow' | 'daggers' | 'club'

export interface HeroLook {
  skin: Ramp
  hair: Ramp
  hairStyle: HairStyle
  eyes: RGBA
  outfit: Outfit
  cloth: Ramp
  /** trousers / under-layer */
  cloth2: Ramp
  metal: Ramp
  accent: Ramp
  headgear: Headgear
  weapon: Weapon
  shield: boolean
  cape: Ramp | null
  trim: boolean
  apron: boolean
  mark: FaceMark
  /** 3★+: a coloured waist sash (knot + tail) */
  sash?: boolean
  /** 5★+: a gem brooch on the chest */
  gem?: boolean
  /** 6★ faint aura outline, 7★ a strong glow with twinkling sparkles */
  aura?: 0 | 1 | 2
  /** rogues: the scarf pulled up over the lower face */
  mask?: boolean
}

export interface LookSource {
  id: string
  name: string
  star: Star
  heroClass: HeroClass | null
  element: Element
  portraitToken?: string
}

const HAIR_STYLES: HairStyle[] = ['short', 'spiky', 'long', 'ponytail', 'bob', 'buzz', 'bun']

function tokenColor(token: string | undefined): RGBA | null {
  if (token && /^#?[0-9a-fA-F]{6}$/.test(token)) return hex(token.startsWith('#') ? token : `#${token}`)
  return null
}

function outfitFor(star: Star, heroClass: HeroClass | null): Outfit {
  if (heroClass !== null) return heroClass
  return star <= 1 ? 'peasant' : 'merc'
}

export function lookForHero(h: LookSource): HeroLook {
  // The face: identity only (never depends on class or stars).
  const face = seededRand(hashString(`${h.id}|${h.name}`))
  // Common hair colours dominate; fantasy tints (teal/rose) are rare.
  const hairIdx = face.chance(0.12) ? face.int(7, HAIR.length - 1) : face.int(0, 6)
  const skin = face.pick(SKIN)
  const hairStyle = face.pick(HAIR_STYLES)
  const eyes = face.pick(EYES)
  const mark: FaceMark = face.chance(0.45) ? face.pick(['freckles', 'scar', 'beard', 'mole', 'patch'] as const) : 'none'
  const cloth2 = face.pick([LEATHER, ramp('#2a2430', '#3e3648', '#5a5068'), ramp('#3a2e1e', '#5a4a2e', '#7a6644')])

  const outfit = outfitFor(h.star, h.heroClass)
  // The kit: identity + outfit, so a class change re-rolls gear but not the face.
  const r = seededRand(hashString(`${h.id}|${h.name}|kit|${outfit}`))
  const accent = ELEMENT_RAMP[h.element]
  const token = tokenColor(h.portraitToken)
  const baseCloth = CLASS_CLOTH[outfit]!
  // Every summoned hero carries its own token colour; classed heroes wear it
  // proudly, commoners in a washed-out, earthy version.
  const cloth = token
    ? h.star >= 3
      ? rampFrom(tame(token, 0.3, 0.62, 0.32, 0.5))
      : rampFrom(tame(token, 0.12, 0.3, 0.3, 0.45))
    : baseCloth

  let headgear: Headgear = 'none'
  let weapon: Weapon = 'none'
  let shield = false
  let mask = false
  switch (outfit) {
    case 'peasant':
      headgear = r.chance(0.2) ? 'bandana' : 'none'
      break
    case 'merc':
      weapon = r.pick(['club', 'daggers', 'sword'] as const)
      headgear = r.chance(0.3) ? 'bandana' : 'none'
      break
    case 'warrior':
      weapon = 'sword'
      shield = r.chance(0.7)
      headgear = r.chance(0.45) ? 'helm' : 'none'
      break
    case 'spearman':
      weapon = 'spear'
      headgear = r.chance(0.55) ? 'plumedHelm' : 'none'
      break
    case 'thief':
      weapon = 'daggers'
      headgear = r.pick(['hood', 'hood', 'bandana', 'none'] as const)
      mask = r.chance(0.75)
      break
    case 'archer':
      weapon = 'bow'
      headgear = r.chance(0.55) ? 'hood' : 'none'
      break
    case 'mage':
      weapon = 'staff'
      headgear = r.pick(['hat', 'hat', 'hood', 'none'] as const)
      break
    case 'master':
      break
  }
  const apron = outfit === 'peasant' && r.chance(0.5)
  if (h.star >= 5 && headgear === 'none') headgear = 'circlet'

  const capeColor = h.star >= 5 ? ramp('#5a0e1e', '#9a1a2e', '#d0404a') : rampFrom(accent.d)

  return {
    skin,
    hair: HAIR[hairIdx]!,
    hairStyle,
    eyes,
    outfit,
    cloth,
    cloth2,
    metal: STEEL,
    accent,
    headgear,
    weapon,
    shield,
    cape: h.star >= 4 ? capeColor : null,
    trim: h.star >= 5,
    apron,
    mark,
    sash: h.star >= 3,
    gem: h.star >= 5,
    aura: h.star >= 7 ? 2 : h.star >= 6 ? 1 : 0,
    mask,
  }
}

/** The player's own avatar: a long dark coat, no weapon — a commander, not a fighter. */
export function lookForMaster(accountId: string): HeroLook {
  const r = seededRand(hashString(`master|${accountId}`))
  return {
    skin: r.pick(SKIN.slice(0, 4)),
    hair: HAIR[r.int(0, 4)]!,
    hairStyle: r.pick(['short', 'spiky', 'bob', 'ponytail'] as const),
    eyes: r.pick(EYES),
    outfit: 'master',
    cloth: CLASS_CLOTH.master!,
    cloth2: ramp('#1e1a24', '#2e2838', '#4a4058'),
    metal: STEEL,
    accent: ELEMENT_RAMP.light,
    headgear: 'none',
    weapon: 'none',
    shield: false,
    cape: null,
    trim: true,
    apron: false,
    mark: 'none',
  }
}


/** Isel, the lobby fairy (canon: one per world, the Master's relay). */
export function iselLook(): HeroLook {
  return {
    skin: SKIN[4]!,
    hair: ramp('#2a8aa8', '#7ae0ff', '#d8faff'),
    hairStyle: 'long',
    eyes: hex('#2a8aa8'),
    outfit: 'mage',
    cloth: ramp('#2a8a78', '#8ae0c8', '#d8fff0'),
    cloth2: ramp('#2a8a78', '#8ae0c8', '#d8fff0'),
    metal: STEEL,
    accent: ELEMENT_RAMP.light,
    headgear: 'circlet',
    weapon: 'none',
    shield: false,
    cape: null,
    trim: true,
    apron: false,
    mark: 'none',
  }
}

/** Princess Priasis (canon Taoni F15 escort target): gold hair, white-and-gold gown. */
export function priasisLook(): HeroLook {
  return {
    skin: SKIN[4]!,
    hair: HAIR[4]!,
    hairStyle: 'long',
    eyes: hex('#2a6ab8'),
    outfit: 'mage',
    cloth: ramp('#a8a0b8', '#ece6f4', '#ffffff'),
    cloth2: ramp('#a8a0b8', '#ece6f4', '#ffffff'),
    metal: STEEL,
    accent: ELEMENT_RAMP.light,
    headgear: 'circlet',
    weapon: 'none',
    shield: false,
    cape: ramp('#6a1424', '#9a1a2e', '#d0404a'),
    trim: true,
    apron: false,
    mark: 'none',
  }
}

/** The F45 courier carrying the key (a plain traveller with a satchel). */
export function keyBearerLook(): HeroLook {
  return {
    skin: SKIN[2]!,
    hair: HAIR[1]!,
    hairStyle: 'short',
    eyes: hex('#5a3418'),
    outfit: 'peasant',
    cloth: ramp('#4a3a1e', '#7a6a3a', '#a8985a'),
    cloth2: ramp('#4a2a1a', '#7a4a2a', '#a8703e'),
    metal: STEEL,
    accent: GOLD,
    headgear: 'hood',
    weapon: 'none',
    shield: false,
    cape: null,
    trim: false,
    apron: false,
    mark: 'none',
  }
}
