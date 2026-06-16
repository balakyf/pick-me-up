/**
 * Layer 1 §1 — Mobius Summon (Normal pool only, slice scope).
 *
 * The gacha turns gold + the account's seeded RNG sub-stream into a brand-new,
 * never-before-seen hero. Every function is PURE and DETERMINISTIC: randomness is
 * threaded functionally (each draw returns { value, rng }) and the input GameState
 * is never mutated — `summon` returns a fresh state.
 *
 * Canon shape (Layer 1 §1.5):
 *   1. roll star            (Normal rate table §1.2, raised by the Rising Quality Floor §1.3)
 *   2. roll class           (Mage = gacha-only and rare; 1★/2★ → classless)
 *   3. per attribute        roll base + growth grade within the star envelope (Layer 0 §4.2)
 *   4. attach skills/portrait/element
 *   5. (engravings are out of slice)
 *   6. mark hero ID consumed → "infinite, all unique" (§1.4)
 *
 * No transcendental math, no Math.random/Date.now: all entropy flows from
 * rngFor(state.seed, 'gacha', state.gacha.pullCount). Rounding (where needed) is
 * Math.round (round-half-up for non-negatives).
 */

import { TUNING } from '../tuning'
import type {
  Star,
  HeroClass,
  Element,
  PrimaryAttrs,
  GrowthGrades,
  StarEnvelope,
  HeroId,
  Hero,
  OwnedHero,
  HeroTemplate,
  GameState,
} from '../types'
import { envelopeForStar } from '../stats'
import { CAMEO_HEROES, NAME_POOLS, SKILLS } from '../content'
import {
  type Rng,
  type Draw,
  nextInt,
  pick,
  weightedPick,
  chance,
  rngFor,
} from '../rng/rng'

// ─────────────────────────────────────────────────────────────────────────────
// Roll primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roll a Normal-pool star, then apply the Rising Quality Floor (Layer 1 §1.3).
 *
 * The floor is a MINIMUM, not a forced star: we weighted-pick over
 * TUNING.gacha.normalRates and then lift the result to at least 3★ when this pull
 * crosses the dry-streak threshold.
 *
 * `pity` = consecutive dry pulls SO FAR; this pull is the (pity+1)th. When
 * (pity+1) >= normalPityFloor3At the minimum becomes 3★, so the 50th dry pull is
 * guaranteed 3★ (and the max possible run of non-3★ pulls is exactly 50).
 */
export function rollStar(rng: Rng, pity: number): Draw<Star> {
  const entries = Object.entries(TUNING.gacha.normalRates).map(([star, weight]) => ({
    item: Number(star) as Star,
    weight,
  }))
  const { value: rolled, rng: r } = weightedPick(rng, entries)

  let star = rolled
  if (pity + 1 >= TUNING.gacha.normalPityFloor3At && star < 3) {
    star = 3
  }
  return { value: star, rng: r }
}

/** The classed pool: warriors/spearmen/thieves/archers are common, mage is rare. */
const COMMON_CLASSES: readonly HeroClass[] = ['warrior', 'spearman', 'thief', 'archer']

/**
 * Roll a class for a star (Layer 1 §1.5 step 2).
 *   - star < 3 → always classless (null), per canon (1★/2★ have no class).
 *   - star >= 3 → a small TUNING.gacha.mageChance for Mage, else uniform among
 *     warrior/spearman/thief/archer.
 */
export function rollClass(rng: Rng, star: Star): Draw<HeroClass | null> {
  if (star < 3) return { value: null, rng }

  const { value: isMage, rng: r1 } = chance(rng, TUNING.gacha.mageChance)
  if (isMage) return { value: 'mage', rng: r1 }

  return pick(r1, COMMON_CLASSES)
}

/** All seven elements (physical included — it is the neutral / "no element" hero). */
const ELEMENTS: readonly Element[] = [
  'fire',
  'wind',
  'earth',
  'water',
  'light',
  'dark',
  'physical',
]

/** Roll a hero element uniformly. */
export function rollElement(rng: Rng): Draw<Element> {
  return pick(rng, ELEMENTS)
}

/**
 * Roll base attributes + growth grades within a star envelope (Layer 0 §4.2):
 *   - each base attribute uniform in env.baseAttrRange
 *   - each growth grade uniform in [0, env.gradeCeiling]
 * Draws are threaded in a fixed key order so the result is reproducible.
 */
export function rollAttributes(
  rng: Rng,
  env: StarEnvelope,
): { baseAttrs: PrimaryAttrs; grades: GrowthGrades; rng: Rng } {
  const [minBase, maxBase] = env.baseAttrRange

  const s = nextInt(rng, minBase, maxBase)
  const a = nextInt(s.rng, minBase, maxBase)
  const v = nextInt(a.rng, minBase, maxBase)
  const i = nextInt(v.rng, minBase, maxBase)
  const w = nextInt(i.rng, minBase, maxBase)

  const gs = nextInt(w.rng, 0, env.gradeCeiling)
  const ga = nextInt(gs.rng, 0, env.gradeCeiling)
  const gv = nextInt(ga.rng, 0, env.gradeCeiling)
  const gi = nextInt(gv.rng, 0, env.gradeCeiling)
  const gw = nextInt(gi.rng, 0, env.gradeCeiling)

  return {
    baseAttrs: { str: s.value, agi: a.value, vit: v.value, int: i.value, wil: w.value },
    grades: { str: gs.value, agi: ga.value, vit: gv.value, int: gi.value, wil: gw.value },
    rng: gw.rng,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Identity allocation (no-dupe, Layer 1 §1.4)
// ─────────────────────────────────────────────────────────────────────────────

/** Zero-pad a non-negative integer to 6 digits (no Math.pow / no transcendentals). */
function pad6(n: number): string {
  let s = String(n)
  while (s.length < 6) s = '0' + s
  return s
}

/**
 * Allocate a unique, prefixed, zero-padded HeroId (e.g. 'h_000123') not already
 * present in `consumedHeroIds`. Uniqueness is enforced by a membership check; we
 * never depend on the iteration ORDER of the consumed set for logic. A new
 * candidate is drawn from the rng until one is free (collisions are astronomically
 * rare given a 32-bit space against a tiny consumed set).
 */
export function allocateHeroId(consumedHeroIds: string[], rng: Rng): Draw<HeroId> {
  const used = new Set(consumedHeroIds)
  let r = rng
  // Draw within [0, 999999] so the id is always exactly 6 digits ('h_000123').
  // Loop is bounded in practice; capped to keep it provably terminating.
  for (let attempt = 0; attempt < 100000; attempt++) {
    const d = nextInt(r, 0, 999999)
    r = d.rng
    const id = `h_${pad6(d.value)}`
    if (!used.has(id)) {
      return { value: id as HeroId, rng: r }
    }
  }
  throw new Error('allocateHeroId: could not find a free HeroId')
}

/**
 * Mint a procedural name by combining NAME_POOLS (first + last), ensuring it is
 * not already in `usedNames`. Re-rolls on collision; deterministic per rng.
 */
export function makeProceduralName(rng: Rng, usedNames: string[]): Draw<string> {
  const used = new Set(usedNames)
  let r = rng
  for (let attempt = 0; attempt < 1000; attempt++) {
    const f = pick(r, NAME_POOLS.first)
    const l = pick(f.rng, NAME_POOLS.last)
    r = l.rng
    const name = `${f.value} ${l.value}`
    if (!used.has(name)) {
      return { value: name, rng: r }
    }
  }
  throw new Error('makeProceduralName: could not find a free name after 1000 attempts')
}

/** Deterministic 6-char hex portrait token from the rng (no art assets exist). */
function rollPortraitToken(rng: Rng): Draw<string> {
  const HEX = '0123456789abcdef'
  let r = rng
  let token = '#'
  for (let i = 0; i < 6; i++) {
    const d = nextInt(r, 0, 15)
    r = d.rng
    token += HEX[d.value]
  }
  return { value: token, rng: r }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero construction
// ─────────────────────────────────────────────────────────────────────────────

/** Filter a hero's authored skillIds down to ones the SKILLS registry knows. */
function validSkillIds(skillIds: readonly string[]): string[] {
  return skillIds.filter((id) => Object.prototype.hasOwnProperty.call(SKILLS, id))
}

/**
 * Build the persisted OwnedHero from an authored cameo template + a freshly
 * allocated HeroId. Exported for the account starter grant (Layer 3 bootstrap).
 * The runtime state is the canon fresh-hero baseline: Lv1, no XP, alive.
 */
export function buildOwnedHeroFromTemplate(template: HeroTemplate, id: HeroId): OwnedHero {
  const hero: Hero = {
    id,
    name: template.name,
    star: template.star,
    heroClass: template.heroClass,
    element: template.element,
    baseAttrs: { ...template.baseAttrs },
    growthGrades: { ...template.growthGrades },
    skillIds: validSkillIds(template.skillIds),
    portraitToken: template.portraitToken,
    origin: 'cameo',
  }
  return {
    ...hero,
    xp: { level: 1, xpIntoLevel: 0, heldXp: 0, atCap: false },
    alive: true,
    sanity: TUNING.lobby.sanityMax,
    promotion: null,
    equipment: { weapon: null, armor: null, accessory: null },
  }
}

/** Build a fresh OwnedHero around an already-assembled static Hero. */
function buildOwnedHero(hero: Hero): OwnedHero {
  return {
    ...hero,
    xp: { level: 1, xpIntoLevel: 0, heldXp: 0, atCap: false },
    alive: true,
    sanity: TUNING.lobby.sanityMax,
    promotion: null,
    equipment: { weapon: null, armor: null, accessory: null },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal roll result (used by summon + test helpers)
// ─────────────────────────────────────────────────────────────────────────────

/** The result of resolving one summon's RNG, before state is rebuilt. */
export interface RollResult {
  hero: OwnedHero
  star: Star
  /** Set when a cameo template was consumed; undefined for procedural heroes. */
  consumedTemplateId?: string
  /** Set for procedural heroes whose minted name must be recorded; undefined for cameos. */
  usedName?: string
}

/** Insert a value into a copy of `arr` and return it kept sorted (stable round-trips). */
function sortedInsert(arr: readonly string[], value: string): string[] {
  return [...arr, value].sort()
}

/**
 * Resolve one summon from an explicit rng + the relevant state slices. PURE and
 * gold-agnostic — `summon` wraps this with the gold check and state rebuild, and
 * tests call it directly to drive many pulls without funding the account.
 */
export function rollSummon(
  rng: Rng,
  pity: number,
  consumedHeroIds: string[],
  consumedTemplateIds: string[],
  usedNames: string[],
): Draw<RollResult> {
  const starDraw = rollStar(rng, pity)
  const star = starDraw.value
  let r = starDraw.rng

  // Decide CAMEO vs PROCEDURAL. A cameo is eligible only if it matches the rolled
  // star and has not yet been consumed on this account.
  const consumedTemplates = new Set(consumedTemplateIds)
  const eligible = CAMEO_HEROES.filter(
    (t) => t.star === star && !consumedTemplates.has(t.templateId),
  )

  if (eligible.length > 0) {
    const cameoDraw = chance(r, TUNING.gacha.cameoChance)
    r = cameoDraw.rng
    if (cameoDraw.value) {
      // Pick a deterministic eligible cameo (eligible preserves authored order).
      const picked = pick(r, eligible)
      r = picked.rng
      const idDraw = allocateHeroId(consumedHeroIds, r)
      r = idDraw.rng
      const hero = buildOwnedHeroFromTemplate(picked.value, idDraw.value)
      return {
        value: { hero, star, consumedTemplateId: picked.value.templateId },
        rng: r,
      }
    }
  }

  // Procedural path: roll class, attributes, name, element, portrait.
  const classDraw = rollClass(r, star)
  r = classDraw.rng

  const attrDraw = rollAttributes(r, envelopeForStar(star))
  r = attrDraw.rng

  const elemDraw = rollElement(r)
  r = elemDraw.rng

  const nameDraw = makeProceduralName(r, usedNames)
  r = nameDraw.rng

  const portraitDraw = rollPortraitToken(r)
  r = portraitDraw.rng

  const idDraw = allocateHeroId(consumedHeroIds, r)
  r = idDraw.rng

  const hero: Hero = {
    id: idDraw.value,
    name: nameDraw.value,
    star,
    heroClass: classDraw.value,
    element: elemDraw.value,
    baseAttrs: attrDraw.baseAttrs,
    growthGrades: attrDraw.grades,
    skillIds: [],
    portraitToken: portraitDraw.value,
    origin: 'procedural',
  }

  return {
    value: { hero: buildOwnedHero(hero), star, usedName: nameDraw.value },
    rng: r,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public summon (Layer 1 §1) — the only entry the store command surface uses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Perform one Normal Mobius Summon. PURE: never mutates `state`; returns a fresh
 * GameState plus the new hero.
 *
 * Throws if state.gold < TUNING.gacha.normalCostGold.
 *
 * State transition:
 *   - gold        -= normalCostGold
 *   - heroes[id]   = the new OwnedHero
 *   - consumedHeroIds + (consumedTemplateIds | usedNames) appended, kept SORTED
 *   - pity         = star >= 3 ? 0 : pity + 1   (Rising Quality Floor payout)
 *   - pullCount   += 1                          (advances the gacha sub-stream)
 */
export function summon(state: GameState): { state: GameState; hero: OwnedHero } {
  const cost = TUNING.gacha.normalCostGold
  if (state.gold < cost) {
    throw new Error(
      `summon: insufficient gold (have ${state.gold}, need ${cost})`,
    )
  }

  // The gacha sub-stream is a pure function of (seed, 'gacha', pullCount).
  const rng = rngFor(state.seed, 'gacha', state.gacha.pullCount)

  const { value: roll } = rollSummon(
    rng,
    state.gacha.pity,
    state.consumedHeroIds,
    state.consumedTemplateIds,
    state.usedNames,
  )

  const hero = roll.hero

  const consumedHeroIds = sortedInsert(state.consumedHeroIds, hero.id)
  const consumedTemplateIds =
    roll.consumedTemplateId !== undefined
      ? sortedInsert(state.consumedTemplateIds, roll.consumedTemplateId)
      : [...state.consumedTemplateIds]
  const usedNames =
    roll.usedName !== undefined
      ? sortedInsert(state.usedNames, roll.usedName)
      : [...state.usedNames]

  const nextState: GameState = {
    ...state,
    gold: state.gold - cost,
    heroes: { ...state.heroes, [hero.id]: hero },
    consumedHeroIds,
    consumedTemplateIds,
    usedNames,
    gacha: {
      pity: roll.star >= 3 ? 0 : state.gacha.pity + 1,
      pullCount: state.gacha.pullCount + 1,
    },
  }

  return { state: nextState, hero }
}
