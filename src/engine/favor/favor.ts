/**
 * Favorability (Layer 3 §C1) — heroes are real people. Favor 0..100 in five tiers:
 * Wary · Neutral · Warm · Devoted · Bonded. It nudges combat (a Wary hero also ignores
 * the Master's focus), rises with victories, banquets and gifts, falls when the hero
 * watches an ally die or be synthesized, and — Wary and broken together — can make a
 * hero refuse to fight at all.
 *
 * Gifts follow the canon "repetitive gifts lower favorability": each hero has a seeded
 * liked and disliked category; giving the same gift again decays it until it sours.
 *
 * Reaching Devoted, then Bonded, for the first time grants Intervention Points
 * (Layer 3 §D2). PURE and DETERMINISTIC (preferences come from a hash of the hero id).
 */

import type { GameState, HeroId, OwnedHero } from '../types'
import { TUNING } from '../tuning'
import { hash } from '../rng'

const F = TUNING.favor
const IV = TUNING.intervention

export type GiftCategory = 'sweets' | 'flowers' | 'books' | 'wine' | 'arms' | 'trinkets'
export const GIFT_CATEGORIES: readonly GiftCategory[] = ['sweets', 'flowers', 'books', 'wine', 'arms', 'trinkets']

export interface GiftDef {
  id: string
  name: string
  category: GiftCategory
  /** Favor gained before preference/repeat modifiers. */
  favor: number
  gold: number
  gems: number
}

/** The gift catalogue: everyday gifts cost gold; high-rank gifts cost gems (canon). */
export const GIFTS: Record<string, GiftDef> = {
  honey_cake: { id: 'honey_cake', name: 'Honey Cake', category: 'sweets', favor: 4, gold: 200, gems: 0 },
  wildflowers: { id: 'wildflowers', name: 'Wildflowers', category: 'flowers', favor: 4, gold: 200, gems: 0 },
  old_tome: { id: 'old_tome', name: 'Old Tome', category: 'books', favor: 5, gold: 300, gems: 0 },
  red_wine: { id: 'red_wine', name: 'Red Wine', category: 'wine', favor: 6, gold: 400, gems: 0 },
  whetstone: { id: 'whetstone', name: 'Fine Whetstone', category: 'arms', favor: 5, gold: 300, gems: 0 },
  glow_stick: { id: 'glow_stick', name: 'Glow Stick', category: 'trinkets', favor: 4, gold: 250, gems: 0 },
  star_jewel: { id: 'star_jewel', name: 'Star Jewel', category: 'trinkets', favor: 15, gold: 0, gems: 30 },
  heirloom_blade: { id: 'heirloom_blade', name: 'Heirloom Blade', category: 'arms', favor: 25, gold: 0, gems: 60 },
}

/** Tier index 0..4 (Wary … Bonded). */
export function favorTier(favor: number): number {
  const i = F.tierCeilings.findIndex((c) => favor <= c)
  return i === -1 ? F.tierCeilings.length : i
}

export function favorTierName(favor: number): string {
  return F.tierNames[favorTier(favor)]!
}

/** Combat stat multiplier for a favor value. */
export function favorStatMult(favor: number): number {
  return F.statMult[favorTier(favor)]!
}

/** A Wary hero ignores the Master's focus directive. */
export function isDefiant(favor: number): boolean {
  return favorTier(favor) === 0
}

/** The hero's seeded liked and disliked gift categories (never the same). */
export function giftPreferences(heroId: HeroId): { liked: GiftCategory; disliked: GiftCategory } {
  const h = hash(0x51f7, 'gift', heroId as string)
  const liked = GIFT_CATEGORIES[h % GIFT_CATEGORIES.length]!
  const offset = 1 + (Math.floor(h / GIFT_CATEGORIES.length) % (GIFT_CATEGORIES.length - 1))
  const disliked = GIFT_CATEGORIES[(GIFT_CATEGORIES.indexOf(liked) + offset) % GIFT_CATEGORIES.length]!
  return { liked, disliked }
}

/**
 * Set a hero's favor (clamped). Crossing into Devoted or Bonded for the first time
 * pays Intervention Points, once each (`bondTier` remembers the highest tier).
 */
export function withFavor(hero: OwnedHero, favor: number): OwnedHero {
  const next = Math.max(0, Math.min(F.max, Math.round(favor)))
  const tier = favorTier(next)
  let ip = hero.ip
  let bondTier = hero.bondTier
  if (tier > bondTier) {
    if (bondTier < 3 && tier >= 3) ip += IV.devotedBonus
    if (bondTier < 4 && tier >= 4) ip += IV.bondedBonus
    bondTier = tier
  }
  return { ...hero, favor: next, bondTier, ip }
}

/** Favor a gift would change on this hero right now (preference + repeat decay). */
export function giftDelta(hero: OwnedHero, giftId: string): number {
  const gift = GIFTS[giftId]
  if (!gift) return 0
  const pref = giftPreferences(hero.id)
  const repeat = hero.gift.last === giftId ? hero.gift.streak : 0
  if (repeat >= F.repeatSour) return -F.sourLoss
  let v = gift.favor
  if (gift.category === pref.liked) v *= F.likedMult
  for (let i = 0; i < repeat; i++) v *= F.repeatDecay
  if (gift.category === pref.disliked) v = -F.dislikedLoss
  return Math.round(v)
}

/** Give a gift: pay for it, then apply the favor change. Throws when refused. PURE. */
export function giveGift(state: GameState, heroId: HeroId, giftId: string): GameState {
  const hero = state.heroes[heroId]
  const gift = GIFTS[giftId]
  if (!hero || !hero.alive) throw new Error('giveGift: that hero cannot receive gifts')
  if (!gift) throw new Error(`giveGift: unknown gift ${giftId}`)
  if (state.gold < gift.gold) throw new Error('giveGift: not enough gold')
  if (state.gems < gift.gems) throw new Error('giveGift: not enough gems')
  const delta = giftDelta(hero, giftId)
  const streak = hero.gift.last === giftId ? hero.gift.streak + 1 : 1
  const given = withFavor({ ...hero, gift: { last: giftId, streak } }, hero.favor + delta)
  return {
    ...state,
    gold: state.gold - gift.gold,
    gems: state.gems - gift.gems,
    heroes: { ...state.heroes, [heroId]: given },
  }
}

/** Add favor to several heroes (living only). */
export function shiftFavor(state: GameState, ids: readonly HeroId[] | 'all', delta: number): GameState {
  if (delta === 0) return state
  const heroes = { ...state.heroes }
  for (const h of Object.values(state.heroes) as OwnedHero[]) {
    if (!h.alive || (ids !== 'all' && !ids.includes(h.id))) continue
    heroes[h.id] = withFavor(h, h.favor + delta)
  }
  return { ...state, heroes }
}

/**
 * Chance a hero refuses to deploy: only a Wary hero whose Sanity is below the rebellion
 * line; it grows with how low both are. 0 for everyone else (no RNG is drawn for them).
 */
export function rebellionChance(hero: OwnedHero): number {
  if (favorTier(hero.favor) !== 0 || hero.sanity >= F.rebellionSanity) return 0
  const gap = (F.tierCeilings[0]! - hero.favor + (F.rebellionSanity - hero.sanity)) / 100
  return Math.max(0, Math.min(0.9, gap * F.rebellionScale))
}
