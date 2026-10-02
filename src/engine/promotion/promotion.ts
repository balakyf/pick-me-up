/**
 * Layer 1 §3 — Promotion: the "raise, don't roll" engine, and (lane J) its ceremony.
 *
 * The Normal gacha pool only yields 1–3★, so promotion is the main path upward.
 * A hero sitting at its star's level cap can be promoted: pay materials, wait out
 * a world-time timer, and on completion the hero's star rises one band — its level
 * cap lifts, its growth grades rise (never fall), its base attributes re-roll
 * UPWARD-ONLY, and it gains a skill it didn't have.
 *
 * The ceremony: before a stone is paid, `promotionPreview` shows exactly what will happen
 * (the grades after, the bases, the engraving, the trait that may awaken) and what the Master
 * may choose — the class a classless hero takes up at 3★ (one of two) and the skill it
 * learns (one of three). The choices ride on the promotion timer; with none, the chamber
 * chooses as it always did.
 *
 * Growth (TUNING.ceremony.growth): 'potential' — every grade rises by one and one seeded
 * grade by one more, so a summoned S-grade stays special and a raised 1★ keeps the shape it
 * was born with — or 'reroll', the old upward-only re-roll in the new envelope (which washed
 * the summon roll out: a 1★ raised to 5★ out-graded a summoned 5★).
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
import { traitAtStar, traitOf, type TraitId } from '../content/traits'
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
  HeroEngraving,
  AttrKey,
} from '../types'

const P = TUNING.lobby.promotion
const C = TUNING.ceremony

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

// ─────────────────────────────────────────────────────────────────────────────
// The ceremony: what a promotion will do, and what the Master may choose
// ─────────────────────────────────────────────────────────────────────────────

const ATTR_KEYS = ['str', 'agi', 'vit', 'int', 'wil'] as const

/** Per-attribute max(old, new) — the upward-only rule for both bases and grades. */
function mergeUpward<T extends PrimaryAttrs | GrowthGrades>(old: T, rolled: T): T {
  const out = {} as T
  for (const k of ATTR_KEYS) out[k] = Math.max(old[k], rolled[k]) as T[typeof k]
  return out
}

/** The classes a classless hero can grow into (mage is gacha-only, canon). */
const CLASS_CHANGE_OPTIONS: readonly HeroClass[] = ['warrior', 'spearman', 'thief', 'archer']

/** The Master's choices at the ceremony (both optional: the chamber chooses otherwise). */
export interface PromotionChoice {
  heroClass?: HeroClass
  skillId?: string
}

/** What the chamber knows about a promotion before a single stone is paid. */
export interface PromotionPreview {
  heroId: HeroId
  fromStar: Star
  toStar: Star
  levelCap: { from: number; to: number }
  /** Growth grades before and after; `bonusAttr` is the grade that rose one more (potential
   *  model), null under the re-roll model or when every grade is at the new ceiling. */
  grades: { before: GrowthGrades; after: GrowthGrades; bonusAttr: AttrKey | null }
  /** Base attributes before and after the upward-only re-roll in the new envelope. */
  bases: { before: PrimaryAttrs; after: PrimaryAttrs }
  /** A classless hero reaching the class-change star picks one of these ([] otherwise). */
  classOffers: HeroClass[]
  /** The class the hero holds after the promotion (the chosen one, or the chamber's). */
  heroClass: HeroClass | null
  /** The skills on offer for that class; one is learned ([] when none is left). A lone offer
   *  is the class's signature skill, which a classed hero always learns first. */
  skillOffers: string[]
  /** The skill learned when the Master does not choose. */
  defaultSkill: string | null
  /** The engraving: evolves one grade, may awaken (a chance — the outcome stays a secret), or
   *  nothing happens. */
  engraving: { kind: 'evolve'; from: HeroEngraving; to: HeroEngraving } | { kind: 'awaken'; chancePct: number } | { kind: 'none' }
  /** The innate trait before and after (a rare form may awaken with the star). */
  trait: { from: TraitId; to: TraitId }
}

/** The seeded draws a promotion makes, in stream order (shared by preview and completion). */
function promotionDraws(hero: OwnedHero, accountSeed: Seed, heroClass: HeroClass | null) {
  const newStar = promotionTargetStar(hero)
  let rng = rngFor(accountSeed, 'promotion', hero.id, hero.star)
  const rolled = rollAttributes(rng, envelopeForStar(newStar))
  rng = rolled.rng
  const known = new Set(hero.skills.map((s) => s.id))
  const missing = promotionSkillPool(heroClass, known)
  let defaultSkill: string | null = null
  if (missing.length > 0) {
    const drew = pick(rng, missing)
    rng = drew.rng
    defaultSkill = drew.value
  }
  // The other offers come from a stream of their own (the chamber's own draw stays first,
  // so the main stream — and an engraving's awakening after it — never moves).
  const offers: string[] = defaultSkill === null ? [] : [defaultSkill]
  let r2 = rngFor(accountSeed, 'promotion-offer', hero.id, hero.star)
  while (offers.length < C.skillOffers) {
    const left = missing.filter((id) => !offers.includes(id))
    if (left.length === 0) break
    const d = pick(r2, left)
    r2 = d.rng
    offers.push(d.value)
  }
  return { newStar, rolled, rng, defaultSkill, offers }
}

/** The chamber's own class for a classless hero (what it takes when the Master does not choose). */
function chamberClass(hero: OwnedHero, accountSeed: Seed): HeroClass {
  return pick(rngFor(accountSeed, 'class-change', hero.id), CLASS_CHANGE_OPTIONS).value
}

/** The classes offered to a classless hero reaching the class-change star: the chamber's own
 *  pick and one more, in the usual class order ([] for everyone else). */
export function classOffers(hero: OwnedHero, accountSeed: Seed): HeroClass[] {
  if (hero.heroClass !== null || promotionTargetStar(hero) < P.classChangeStar) return []
  const chamber = chamberClass(hero, accountSeed)
  if (C.classOffers < 2) return [chamber]
  const other = pick(rngFor(accountSeed, 'class-offer', hero.id), CLASS_CHANGE_OPTIONS.filter((c) => c !== chamber)).value
  return CLASS_CHANGE_OPTIONS.filter((c) => c === chamber || c === other)
}

/** The class a promotion leaves the hero with, given an optional choice. */
function classAfter(hero: OwnedHero, accountSeed: Seed, choice?: HeroClass): HeroClass | null {
  const offers = classOffers(hero, accountSeed)
  if (offers.length === 0) return hero.heroClass
  if (choice !== undefined && offers.includes(choice)) return choice
  return chamberClass(hero, accountSeed)
}

/** Growth after a promotion: 'potential' (+1 a grade, one seeded grade +1 more) or the old
 *  upward-only re-roll. Never lower than before, never above the new ceiling. */
function grownGrades(hero: OwnedHero, accountSeed: Seed, rolledGrades: GrowthGrades): { grades: GrowthGrades; bonusAttr: AttrKey | null } {
  if (C.growth === 'reroll') return { grades: mergeUpward(hero.growthGrades, rolledGrades), bonusAttr: null }
  const ceiling = envelopeForStar(promotionTargetStar(hero)).gradeCeiling
  const open = ATTR_KEYS.filter((k) => hero.growthGrades[k] + C.gradePerPromotion < ceiling)
  const bonusAttr = open.length > 0 ? pick(rngFor(accountSeed, 'promotion-potential', hero.id, hero.star), open).value : null
  const grades = { ...hero.growthGrades }
  for (const k of ATTR_KEYS) {
    const gain = C.gradePerPromotion + (k === bonusAttr ? C.bonusGrade : 0)
    grades[k] = Math.max(hero.growthGrades[k], Math.min(ceiling, hero.growthGrades[k] + gain))
  }
  return { grades, bonusAttr }
}

/**
 * Everything a promotion will do, before it is paid for: the new star and cap, the grades
 * and bases after, the classes and skills on offer (for the chosen class), the engraving and
 * the trait. PURE and seeded exactly as `completePromotion` is, so what the chamber shows is
 * what happens — only an engraving's awakening stays a secret, shown as its chance.
 */
export function promotionPreview(hero: OwnedHero, accountSeed: Seed, choice: PromotionChoice = {}): PromotionPreview {
  const heroClass = classAfter(hero, accountSeed, choice.heroClass)
  const d = promotionDraws(hero, accountSeed, heroClass)
  const { grades, bonusAttr } = grownGrades(hero, accountSeed, d.rolled.grades)
  const engraving: PromotionPreview['engraving'] =
    hero.engraving !== null
      ? { kind: 'evolve', from: hero.engraving, to: evolveEngraving(hero.engraving) }
      : d.newStar >= 4
        ? { kind: 'awaken', chancePct: Math.round(TUNING.engravings.promotionAwakenChance * 100) }
        : { kind: 'none' }
  return {
    heroId: hero.id,
    fromStar: hero.star,
    toStar: d.newStar,
    levelCap: { from: levelCapForStar(hero.star), to: levelCapForStar(d.newStar) },
    grades: { before: hero.growthGrades, after: grades, bonusAttr },
    bases: { before: hero.baseAttrs, after: mergeUpward(hero.baseAttrs, d.rolled.baseAttrs) },
    classOffers: classOffers(hero, accountSeed),
    heroClass,
    skillOffers: d.offers,
    defaultSkill: d.defaultSkill,
    engraving,
    trait: { from: traitOf(hero).id, to: traitAtStar({ ...hero, heroClass }, d.newStar).id },
  }
}

/** Why a ceremony choice cannot stand (without the function prefix), or null when it can. */
export function promotionChoiceRefusal(hero: OwnedHero, accountSeed: Seed, choice: PromotionChoice): string | null {
  if (choice.heroClass !== undefined) {
    const offers = classOffers(hero, accountSeed)
    if (offers.length === 0) return `hero ${hero.id} does not choose a class at this promotion`
    if (!offers.includes(choice.heroClass)) return `the ${choice.heroClass} class is not on offer for hero ${hero.id}`
  }
  if (choice.skillId !== undefined) {
    const pv = promotionPreview(hero, accountSeed, choice)
    if (!pv.skillOffers.includes(choice.skillId)) return `skill ${choice.skillId} is not on offer for hero ${hero.id}`
  }
  return null
}

/**
 * Begin a promotion: validate the gate + affordability (and the ceremony's choices against
 * `promotionPreview`'s offers), deduct materials, and set the hero's `promotion` timer with the
 * choices riding on it. PURE — returns a fresh GameState. Throws on a closed gate, a choice
 * that is not on offer, or insufficient materials (the same contract gacha uses).
 */
export function startPromotion(state: GameState, heroId: HeroId, nowWorld: number, choice: PromotionChoice = {}): GameState {
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
  const refusal = promotionChoiceRefusal(hero, state.seed, choice)
  if (refusal !== null) throw new Error(`startPromotion: ${refusal}`)

  const pay = promotionPayment(state, hero)!
  const materials: Record<MaterialId, number> = { ...state.materials }
  for (const id of Object.keys(pay)) materials[id] = (materials[id] ?? 0) - pay[id]!

  const completesAtWorld =
    nowWorld + promotionDuration(promotionTargetStar(hero), state.facilities.promotionChamber.level)

  return {
    ...state,
    materials,
    heroes: {
      ...state.heroes,
      [heroId]: {
        ...hero,
        promotion: {
          completesAtWorld,
          ...(choice.heroClass !== undefined ? { heroClass: choice.heroClass } : {}),
          ...(choice.skillId !== undefined ? { skillId: choice.skillId } : {}),
        },
      },
    },
  }
}

/**
 * Resolve a completed promotion (deterministic, seeded). Raises the star one band, lifts the
 * level cap (releasing any held XP into new levels), grows the grades, re-rolls the bases
 * UPWARD-ONLY in the new envelope, and grants one skill the hero lacked — the Master's pick
 * when one rides on the timer. Clears the in-flight timer. PURE — returns a fresh OwnedHero.
 */
export function completePromotion(hero: OwnedHero, accountSeed: Seed, highestCleared = 0): OwnedHero {
  const choice: PromotionChoice = { heroClass: hero.promotion?.heroClass, skillId: hero.promotion?.skillId }
  // Class change (canon: Islat Han, "Warrior class (formerly Novice)"): a classless hero
  // reaching 3★ takes up a common class — the Master's pick of two, else the chamber's. Never
  // mage — mages come only from the gacha. Its own rng stream.
  const heroClass = classAfter(hero, accountSeed, choice.heroClass)
  const d = promotionDraws(hero, accountSeed, heroClass)
  let rng = d.rng
  const newStar = d.newStar
  const baseAttrs = mergeUpward(hero.baseAttrs, d.rolled.baseAttrs)
  const growthGrades = grownGrades(hero, accountSeed, d.rolled.grades).grades

  // Grant one skill the hero does not already know, at Lv1: its class's signature skill
  // first, else a learnable skill (no-op if it knows them all) — the Master's pick of the
  // offers when they made one (a pick it has since learned some other way falls back to the
  // chamber's). Merge-only skills are never handed out by promotion.
  let skills = hero.skills
  const learn = choice.skillId !== undefined && d.offers.includes(choice.skillId) ? choice.skillId : d.defaultSkill
  if (learn !== null) skills = [...hero.skills, { id: learn, level: 1, xp: 0 }]

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
        Object.values(ENGRAVINGS).map((e) => ({ item: e.id, weight: e.weight })),
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
  skills = applyUnlocks(skills, xp.level, highestCleared, heroClass)

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
