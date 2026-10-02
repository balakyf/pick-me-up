/**
 * Layer 1 §3 — Promotion: the "raise, don't roll" engine.
 *
 * The Normal gacha pool only yields 1–3★, so promotion is the main path upward.
 * A hero sitting at its star's level cap can be promoted: pay materials, wait out
 * a world-time timer, and on completion the hero's star rises one band — its level
 * cap lifts, its base attributes/grades re-roll UPWARD-ONLY (a promotion never
 * weakens a hero), and it gains a skill it didn't have.
 *
 * Everything here is PURE and DETERMINISTIC. The on-complete re-roll is seeded by
 * (accountSeed, heroId, oldStar) so an "offline" promotion that finishes inside
 * `time.advanceTime` replays identically. 6★→7★ is paid with a Book of Reverse Heaven
 * (§3.4) instead of stones. A promotion also evolves the hero's engraving one grade —
 * or, on reaching 4★+ without one, may awaken it (§5.4) — and checks conditional
 * skill unlocks against the newly released levels (§2.2).
 */

import { estateBusy } from '../estate/deploy'
import { TUNING } from '../tuning'
import { envelopeForStar, levelCapForStar, applyXp } from '../stats'
import { rollAttributes } from '../gacha'
import { applyUnlocks, promotionSkillPool } from '../skills'
import { evolveEngraving } from '../engravings'
import { rngFor, pick, chance, weightedPick } from '../rng'
import { ENGRAVINGS } from '../content'
import type {
  GameState,
  OwnedHero,
  HeroId,
  Star,
  Element,
  MaterialId,
  PrimaryAttrs,
  GrowthGrades,
  Seed,
  HeroClass,
} from '../types'

const P = TUNING.lobby.promotion

/** The star a hero would reach by promoting (one above its current). */
export function promotionTargetStar(hero: OwnedHero): Star {
  return (hero.star + 1) as Star
}

/** Material-bucket key for an element's Attribute Stones. */
export function attrStoneId(element: Element): MaterialId {
  return `attrStone_${element}`
}

/** Material cost to promote a hero: Promotion Stones + element Attribute Stones, or —
 *  for 6★→7★ — one Book of Reverse Heaven. */
export function promotionCost(hero: OwnedHero): Record<MaterialId, number> {
  const target = promotionTargetStar(hero)
  if (target === 7) return { [P.bookId]: 1 }
  const stones = P.stoneCost[target] ?? 0
  return {
    promotionStone: stones,
    [attrStoneId(hero.element)]: Math.round(stones / P.attrStoneDivisor),
  }
}

/** Gate: a living hero at its level cap, below the ceiling, with no promotion in flight,
 *  home (not in the Ruins, not held) and not in the middle of a Training Center drill. */
export function canPromote(hero: OwnedHero): boolean {
  return (
    hero.alive &&
    hero.xp.atCap &&
    hero.star < P.maxStar &&
    hero.promotion === null &&
    !hero.expedition &&
    !hero.captiveOf &&
    !hero.training
  )
}

/** True when the account holds enough of every material the promotion costs. */
export function canAfford(state: GameState, hero: OwnedHero): boolean {
  return promotionPayment(state, hero) !== null
}

/**
 * What a promotion actually takes from the storeroom: its cost, with any shortfall of
 * the element-matched Attribute Stones made up 1:1 by Rank Materials (the canon
 * "upgrade stones" — they fit any element). Null when even that can't cover it.
 */
export function promotionPayment(state: GameState, hero: OwnedHero): Record<MaterialId, number> | null {
  const cost = promotionCost(hero)
  const pay: Record<MaterialId, number> = {}
  let rankNeeded = 0
  for (const id of Object.keys(cost)) {
    const need = cost[id]!
    const have = state.materials[id] ?? 0
    if (id.startsWith('attrStone_') && have < need) {
      pay[id] = have
      rankNeeded += need - have
    } else if (have < need) {
      return null
    } else {
      pay[id] = need
    }
  }
  if (rankNeeded > 0) {
    if ((state.materials.rankMaterial ?? 0) < rankNeeded) return null
    pay.rankMaterial = rankNeeded
  }
  return pay
}

/**
 * World-time a promotion to `targetStar` takes, shortened by the Promotion
 * Chamber level (each level cuts a fixed fraction, floored at `minDurationFactor`).
 * A level-0 (un-built) chamber gives the full base duration.
 */
export function promotionDuration(targetStar: number, chamberLevel: number): number {
  const base = P.durationMs[targetStar] ?? 0
  const factor = Math.max(P.minDurationFactor, 1 - P.chamberSpeedupPerLevel * chamberLevel)
  return Math.round(base * factor)
}

/**
 * Begin a promotion: validate the gate + affordability, deduct materials, and set
 * the hero's `promotion.completesAtWorld`. PURE — returns a fresh GameState.
 * Throws on a closed gate or insufficient materials (the same contract gacha uses).
 */
export function startPromotion(state: GameState, heroId: HeroId, nowWorld: number): GameState {
  const hero = state.heroes[heroId]
  if (hero === undefined) throw new Error(`startPromotion: unknown hero ${heroId}`)
  if (!canPromote(hero)) {
    throw new Error(`startPromotion: hero ${heroId} cannot be promoted (cap/ceiling/in-flight)`)
  }
  if (!canAfford(state, hero)) {
    throw new Error(`startPromotion: insufficient materials for ${heroId}`)
  }
  if (estateBusy(state, heroId) === 'is out on a bounty') {
    throw new Error(`startPromotion: hero ${heroId} is out on a bounty`)
  }

  const pay = promotionPayment(state, hero)!
  const materials: Record<MaterialId, number> = { ...state.materials }
  for (const id of Object.keys(pay)) materials[id] = (materials[id] ?? 0) - pay[id]!

  const completesAtWorld =
    nowWorld + promotionDuration(promotionTargetStar(hero), state.facilities.promotionChamber.level)

  return {
    ...state,
    materials,
    heroes: { ...state.heroes, [heroId]: { ...hero, promotion: { completesAtWorld } } },
  }
}

const ATTR_KEYS = ['str', 'agi', 'vit', 'int', 'wil'] as const

/** Per-attribute max(old, new) — the upward-only rule for both bases and grades. */
function mergeUpward<T extends PrimaryAttrs | GrowthGrades>(old: T, rolled: T): T {
  const out = {} as T
  for (const k of ATTR_KEYS) out[k] = Math.max(old[k], rolled[k]) as T[typeof k]
  return out
}

/**
 * Resolve a completed promotion (deterministic, seeded). Raises the star one band,
 * lifts the level cap (releasing any held XP into new levels), merges a fresh roll
 * in the new envelope UPWARD-ONLY into the hero's bases/grades, and grants one skill
 * the hero lacked. Clears the in-flight timer. PURE — returns a fresh OwnedHero.
 */
/** The classes a classless hero can grow into (mage is gacha-only, canon). */
const CLASS_CHANGE_OPTIONS: readonly HeroClass[] = ['warrior', 'spearman', 'thief', 'archer']

export function completePromotion(hero: OwnedHero, accountSeed: Seed, highestCleared = 0): OwnedHero {
  const newStar = promotionTargetStar(hero)
  let rng = rngFor(accountSeed, 'promotion', hero.id, hero.star)

  const rolled = rollAttributes(rng, envelopeForStar(newStar))
  rng = rolled.rng
  const baseAttrs = mergeUpward(hero.baseAttrs, rolled.baseAttrs)
  const growthGrades = mergeUpward(hero.growthGrades, rolled.grades)

  // Class change (canon: Islat Han, "Warrior class (formerly Novice)"): a classless hero
  // reaching 3★ takes up a common class. Never mage — mages come only from the gacha.
  // Its own rng stream, so every other promotion draw is unchanged.
  let heroClass = hero.heroClass
  if (heroClass === null && newStar >= TUNING.lobby.promotion.classChangeStar) {
    heroClass = pick(rngFor(accountSeed, 'class-change', hero.id), CLASS_CHANGE_OPTIONS).value
  }

  // Grant one skill the hero does not already know, at Lv1: its class's signature skill
  // first, else a learnable skill (no-op if it knows them all). Merge-only skills are
  // never handed out by promotion.
  let skills = hero.skills
  const known = new Set(hero.skills.map((s) => s.id))
  const missing = promotionSkillPool(heroClass, known)
  if (missing.length > 0) {
    const drew = pick(rng, missing)
    rng = drew.rng
    skills = [...hero.skills, { id: drew.value, level: 1, xp: 0 }]
  }

  // Engraving evolution (각인 진화): one grade up; a hero reaching 4★+ without one may
  // awaken a grade-C engraving. The awaken draws come last, so earlier rolls are stable.
  let engraving = hero.engraving
  if (engraving !== null) {
    engraving = evolveEngraving(engraving)
  } else if (newStar >= 4) {
    const awaken = chance(rng, TUNING.engravings.promotionAwakenChance)
    rng = awaken.rng
    if (awaken.value) {
      const which = weightedPick(
        rng,
        Object.values(ENGRAVINGS).map((d) => ({ item: d.id, weight: d.weight })),
      )
      rng = which.rng
      engraving = { id: which.value, grade: 'C' }
    }
  }

  // Lift the cap and release held XP into the newly available levels.
  const xp = applyXp(
    { level: hero.xp.level, xpIntoLevel: hero.xp.xpIntoLevel, heldXp: 0, atCap: false },
    hero.xp.heldXp,
    newStar,
  )
  skills = applyUnlocks(skills, xp.level, highestCleared)

  // Rank deepens the hero's connection with the Master: Intervention Points (Layer 3 §D2).
  const ip = (hero.ip ?? 0) + TUNING.intervention.perPromotion
  // The chamber shows the truth (B41): a whale-bait display star does not survive a promotion
  // (left in place, a twice-promoted bait hero would show LESS than their real star).
  const { displayStar: _shown, ...rest } = hero
  void _shown
  return { ...rest, heroClass, star: newStar, baseAttrs, growthGrades, skills, xp, engraving, ip, promotion: null }
}

/**
 * Gem pay-to-skip: spend `skipGemCost` to resolve an in-flight promotion NOW
 * instead of waiting out the timer. PURE — returns a fresh GameState. Throws when
 * the hero has no promotion in flight or the account can't afford the gems.
 */
export function skipPromotion(state: GameState, heroId: HeroId): GameState {
  const hero = state.heroes[heroId]
  if (hero === undefined) throw new Error(`skipPromotion: unknown hero ${heroId}`)
  if (hero.promotion === null) throw new Error(`skipPromotion: hero ${heroId} has no promotion in flight`)
  if (state.gems < P.skipGemCost) {
    throw new Error(`skipPromotion: insufficient gems (have ${state.gems}, need ${P.skipGemCost})`)
  }

  return {
    ...state,
    gems: state.gems - P.skipGemCost,
    heroes: { ...state.heroes, [heroId]: completePromotion(hero, state.seed, state.tower.highestCleared) },
  }
}
