/**
 * Layer 1 §1 — Mobius Summon: the Normal (gold) and Advanced (gem) pools.
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
 *   4. attach skills/portrait/element (a classed 3★+ arrives with its class skill — no draw)
 *   5. 4★+: class skill + extra skills, a bound exclusive weapon, an engraving (§5.4)
 *   6. mark hero ID consumed → "infinite, all unique" (§1.4)
 *
 * No transcendental math, no Math.random/Date.now: all entropy flows from
 * rngFor(state.seed, 'gacha', pullCount) (Normal) or rngFor(state.seed, 'gacha-adv',
 * advPullCount) (Advanced) — separate streams, so Advanced pulls never disturb the
 * Normal sequence. Only 4★+ rolls take the extra kit/engraving draws, so every Normal
 * (1–3★) pull is byte-identical to before. Rounding is Math.round.
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
  HeroEngraving,
  EquipmentGrade,
  EquipmentItem,
  SummonPool,
} from '../types'
import { envelopeForStar } from '../stats'
import { CAMEO_HEROES, CLASS_SKILL, NAME_POOLS, SKILLS } from '../content'
import { heroSkillsFromIds, learnableSkillIds } from '../skills'
import { rollEngraving } from '../engravings'
import { makeExclusiveWeapon } from '../equipment'
import { bindSummonBatch } from '../challenge/bonds'
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

const ADV = TUNING.gacha.advanced

/**
 * Roll an Advanced-pool star (3★ 80 / 4★ 18 / 5★ 2), then apply its two Rising
 * Quality Floors: the `pityFloor4At`-th pull without a 4★+ is lifted to 4★, and the
 * `pityFloor5At`-th pull without a 5★ is lifted to 5★. One draw.
 */
export function rollAdvancedStar(rng: Rng, pity4: number, pity5: number): Draw<Star> {
  const entries = Object.entries(ADV.rates).map(([star, weight]) => ({ item: Number(star) as Star, weight }))
  const { value: rolled, rng: r } = weightedPick(rng, entries)
  let star = rolled
  if (pity4 + 1 >= ADV.pityFloor4At && star < 4) star = 4
  if (pity5 + 1 >= ADV.pityFloor5At) star = 5
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
 *
 * First names spread out: a drawn first name already worn more often than the
 * least-worn one slides to the next least-worn first name in the pool, so a roster
 * doesn't hold two Lyras while another first name is still unused. The slide spends
 * no extra rng.
 */
export function makeProceduralName(rng: Rng, usedNames: string[]): Draw<string> {
  const used = new Set(usedNames)
  const firstCount = new Map<string, number>()
  for (const n of usedNames) {
    const first = n.split(' ')[0]!
    firstCount.set(first, (firstCount.get(first) ?? 0) + 1)
  }
  const pool = NAME_POOLS.first
  const least = Math.min(...pool.map((f) => firstCount.get(f) ?? 0))
  let r = rng
  for (let attempt = 0; attempt < 1000; attempt++) {
    const f = nextInt(r, 0, pool.length - 1)
    let i = f.value
    while ((firstCount.get(pool[i]!) ?? 0) > least) i = (i + 1) % pool.length
    const l = pick(f.rng, NAME_POOLS.last)
    r = l.rng
    const name = `${pool[i]!} ${l.value}`
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
  return buildOwnedHero(hero, template.engraving ? { ...template.engraving } : null)
}

/** The Layer 3 per-hero fields every fresh (or v7-migrated) hero starts with. */
export function HERO_V8_DEFAULTS(): Pick<OwnedHero, 'favor' | 'bondTier' | 'ip' | 'gift' | 'blessed' | 'expedition' | 'captiveOf' | 'bondGroup'> {
  const favor = TUNING.favor.start
  const bondTier = TUNING.favor.tierCeilings.findIndex((c) => favor <= c)
  return { favor, bondTier, ip: 0, gift: { last: null, streak: 0 }, blessed: false, expedition: null, captiveOf: null, bondGroup: null }
}

/** Build a fresh OwnedHero around an already-assembled static Hero: its innate
 *  skillIds become Lv1 HeroSkills (schema v4). */
function buildOwnedHero(hero: Hero, engraving: HeroEngraving | null = null): OwnedHero {
  const { skillIds, ...identity } = hero
  return {
    ...identity,
    skills: heroSkillsFromIds(skillIds),
    xp: { level: 1, xpIntoLevel: 0, heldXp: 0, atCap: false },
    alive: true,
    sanity: TUNING.lobby.sanityMax,
    promotion: null,
    equipment: { weapon: null, armor: null, accessory: null },
    training: null,
    engraving,
    ...HERO_V8_DEFAULTS(),
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
  /** 4★+: the grade of the bound exclusive weapon the hero arrives with. */
  weaponGrade?: EquipmentGrade
}

/**
 * The 4★+ arrival kit (Layer 1 §4.2 "arrives with"): the class skill plus
 * `extraSkills[star]` learnable skills (drawn without replacement), and an
 * engraving when the hero has none. Draw order: skills, then engraving.
 */
function rollHighStarKit(
  rng: Rng,
  hero: OwnedHero,
): Draw<OwnedHero> {
  let r = rng
  const known = new Set(hero.skills.map((s) => s.id))
  const skills = hero.skills.map((s) => ({ ...s }))
  const signature = hero.heroClass !== null ? CLASS_SKILL[hero.heroClass] : undefined
  if (signature !== undefined && !known.has(signature)) {
    skills.push({ id: signature, level: 1, xp: 0 })
    known.add(signature)
  }
  for (let i = 0; i < (ADV.extraSkills[hero.star] ?? 0); i++) {
    const pool = learnableSkillIds().filter((id) => !known.has(id))
    if (pool.length === 0) break
    const d = pick(r, pool)
    r = d.rng
    skills.push({ id: d.value, level: 1, xp: 0 })
    known.add(d.value)
  }
  let engraving = hero.engraving
  if (engraving === null) {
    const e = rollEngraving(r, hero.star)
    r = e.rng
    engraving = e.value
  }
  return { value: { ...hero, skills, engraving }, rng: r }
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
  return rollHeroOfStar(starDraw.rng, starDraw.value, consumedHeroIds, consumedTemplateIds, usedNames)
}

/**
 * Resolve everything after the star roll: cameo-or-procedural, the procedural
 * identity, and (4★+ only) the arrival kit + exclusive-weapon grade. PURE.
 */
export function rollHeroOfStar(
  rng: Rng,
  star: Star,
  consumedHeroIds: string[],
  consumedTemplateIds: string[],
  usedNames: string[],
): Draw<RollResult> {
  const drawn = rollBaseHero(rng, star, consumedHeroIds, consumedTemplateIds, usedNames)
  if (star < 4) return drawn
  const kit = rollHighStarKit(drawn.rng, drawn.value.hero)
  return {
    value: { ...drawn.value, hero: kit.value, weaponGrade: ADV.weaponGrade[star] as EquipmentGrade },
    rng: kit.rng,
  }
}

/** The skills a procedural hero is summoned with: its class's signature skill, if classed. */
export function startingSkillIds(heroClass: HeroClass | null): string[] {
  return heroClass !== null ? [CLASS_SKILL[heroClass]] : []
}

function rollBaseHero(
  rng: Rng,
  star: Star,
  consumedHeroIds: string[],
  consumedTemplateIds: string[],
  usedNames: string[],
): Draw<RollResult> {
  let r = rng

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
    // A classed hero (3★+) arrives knowing its class's signature skill (lane J). No draw:
    // every Normal pull's stream is unchanged; 4★+ kits already start with it.
    skillIds: startingSkillIds(classDraw.value),
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

/** Currency cost of `count` pulls from a pool (the Advanced 10-pull is discounted). */
export function summonCost(pool: SummonPool, count: number): { gold: number; gems: number } {
  if (pool === 'normal') return { gold: TUNING.gacha.normalCostGold * count, gems: 0 }
  return { gold: 0, gems: count === 10 ? ADV.tenPullGems : ADV.costGems * count }
}

/** Fold one resolved roll into the state (hero, consumed ids, exclusive weapon). */
function admit(state: GameState, roll: RollResult): { state: GameState; hero: OwnedHero } {
  let hero = roll.hero
  let inventory = state.inventory
  if (roll.weaponGrade !== undefined) {
    const item: EquipmentItem = makeExclusiveWeapon(inventory, hero, roll.weaponGrade)
    inventory = [...inventory, item]
    hero = { ...hero, equipment: { ...hero.equipment, weapon: item.id } }
  }
  return {
    hero,
    state: {
      ...state,
      inventory,
      heroes: { ...state.heroes, [hero.id]: hero },
      consumedHeroIds: sortedInsert(state.consumedHeroIds, hero.id),
      consumedTemplateIds:
        roll.consumedTemplateId !== undefined
          ? sortedInsert(state.consumedTemplateIds, roll.consumedTemplateId)
          : [...state.consumedTemplateIds],
      usedNames: roll.usedName !== undefined ? sortedInsert(state.usedNames, roll.usedName) : [...state.usedNames],
    },
  }
}

/** One Advanced pull against `state` (no payment). */
function advancedPull(state: GameState): { state: GameState; hero: OwnedHero } {
  const g = state.gacha
  const rng = rngFor(state.seed, 'gacha-adv', g.advPullCount)
  const starDraw = rollAdvancedStar(rng, g.advPity4, g.advPity5)
  const star = starDraw.value
  const { value: roll } = rollHeroOfStar(
    starDraw.rng,
    star,
    state.consumedHeroIds,
    state.consumedTemplateIds,
    state.usedNames,
  )
  // Whale-bait inflation (Layer 3 §D3, canon Sirris): after a dry streak a 3★ may be
  // SHOWN as a 4★. Its own stream; the engine always uses the true star.
  if (star === 3 && g.advPity4 >= TUNING.shop.baitPity) {
    const bait = chance(rngFor(state.seed, 'gacha-bait', g.advPullCount), TUNING.shop.baitChance)
    if (bait.value) roll.hero = { ...roll.hero, displayStar: 4 }
  }
  const admitted = admit(state, roll)
  return {
    hero: admitted.hero,
    state: {
      ...admitted.state,
      gacha: {
        ...g,
        advPity4: star >= 4 ? 0 : g.advPity4 + 1,
        advPity5: star >= 5 ? 0 : g.advPity5 + 1,
        advPullCount: g.advPullCount + 1,
      },
    },
  }
}

/**
 * Perform `count` pulls from a pool, paying up front (the Advanced 10-pull at its
 * discount). PURE. Throws when the account cannot afford the whole batch.
 */
/**
 * The mercy pull: a Master with no living hero and not enough gold for a Normal pull
 * gets one for free, so a wiped roster can never lock the game.
 */
export function mercySummonAvailable(state: GameState): boolean {
  const anyone = (Object.values(state.heroes) as OwnedHero[]).some((h) => h.alive && !h.captiveOf)
  return !anyone && state.gold < TUNING.gacha.normalCostGold
}

export function summonMany(
  state: GameState,
  pool: SummonPool = 'normal',
  count: number = 1,
): { state: GameState; heroes: OwnedHero[] } {
  if (!Number.isInteger(count) || count < 1) throw new Error(`summon: invalid count ${count}`)
  // The canon tutorial draw: a new Master's first Normal ten-pull is free.
  if (pool === 'normal' && count === 10 && tutorialPullAvailable(state)) {
    const funded: GameState = {
      ...state,
      gold: state.gold + summonCost('normal', 10).gold,
      life: { ...state.life, guide: { ...state.life.guide, tutorialPull: true } },
    }
    return summonMany(funded, 'normal', 10)
  }
  // The Mobius crystal holds a limited charge of Advanced pulls per world-day.
  if (pool === 'advanced') {
    const left = crystalChargeLeft(state)
    if (count > left) throw new Error(`summon: the Mobius crystal needs to recharge (${left} Advanced pulls left today)`)
  }
  if (pool === 'normal' && count === 1 && mercySummonAvailable(state)) {
    const res = summon({ ...state, gold: state.gold + TUNING.gacha.normalCostGold })
    return { state: res.state, heroes: [res.hero] }
  }
  const cost = summonCost(pool, count)
  if (state.gold < cost.gold) throw new Error(`summon: insufficient gold (have ${state.gold}, need ${cost.gold})`)
  if (state.gems < cost.gems) throw new Error(`summon: insufficient gems (have ${state.gems}, need ${cost.gems})`)
  const heroes: OwnedHero[] = []
  if (pool === 'normal') {
    let cur = state
    for (let i = 0; i < count; i++) {
      const res = summon(cur)
      heroes.push(res.hero)
      cur = res.state
    }
    return withBond(cur, heroes, pool)
  }
  let cur: GameState = { ...state, gems: state.gems - cost.gems }
  for (let i = 0; i < count; i++) {
    const res = advancedPull(cur)
    heroes.push(res.hero)
    cur = res.state
  }
  const day = worldDayOf(state)
  cur = { ...cur, life: { ...cur.life, crystal: { day, advancedPulls: crystalOwed(state.life.crystal, day) + count } } }
  return withBond(cur, heroes, pool)
}

/** A ten-pull may arrive as a bond group (tower challenges); the heroes carry their bond. */
function withBond(state: GameState, heroes: OwnedHero[], pool: SummonPool): { state: GameState; heroes: OwnedHero[] } {
  const next = bindSummonBatch(state, heroes, pool)
  return next === state ? { state, heroes } : { state: next, heroes: heroes.map((h) => next.heroes[h.id] ?? h) }
}

/** The free tutorial ten-pull is still waiting. */
export function tutorialPullAvailable(state: GameState): boolean {
  return TUNING.gacha.tutorialTenPull && !state.life.guide.tutorialPull
}

function worldDayOf(state: GameState): number {
  return Math.floor(state.meta.lastSeenAtWorld / (TUNING.life.slotMs * TUNING.life.slotsPerDay))
}

/**
 * Advanced pulls the crystal owes back as of world-day `day`: the pulls taken, less what
 * it has recharged since the last pull (`rechargePerDay` a world-day).
 */
function crystalOwed(crystal: GameState['life']['crystal'], day: number): number {
  const rate = TUNING.gacha.advanced.rechargePerDay
  return Math.max(0, crystal.advancedPulls - Math.floor(rate * Math.max(0, day - crystal.day)))
}

/** Advanced pulls the crystal holds right now (whale pacing): a full charge of `dailyCharge`,
 *  refilling steadily, so a ten-pull waits for a full crystal. */
export function crystalChargeLeft(state: GameState): number {
  return Math.max(0, TUNING.gacha.advanced.dailyCharge - crystalOwed(state.life.crystal, worldDayOf(state)))
}

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

  // Nudge probability (an Intervention, Layer 3 §D2): a second star roll from its own
  // stream, keep the better. Without a nudge this is exactly rollSummon's draw order.
  const first = rollStar(rng, state.gacha.pity)
  let star = first.value
  if (state.meta.nudge) {
    const alt = rollStar(rngFor(state.seed, 'gacha-nudge', state.gacha.pullCount), state.gacha.pity).value
    if (alt > star) star = alt
  }
  const { value: roll } = rollHeroOfStar(first.rng, star, state.consumedHeroIds, state.consumedTemplateIds, state.usedNames)

  const admitted = admit({ ...state, gold: state.gold - cost }, roll)
  const nextState: GameState = {
    ...admitted.state,
    meta: state.meta.nudge ? { ...admitted.state.meta, nudge: false } : admitted.state.meta,
    gacha: {
      ...state.gacha,
      pity: roll.star >= 3 ? 0 : state.gacha.pity + 1,
      pullCount: state.gacha.pullCount + 1,
    },
  }

  return { state: nextState, hero: admitted.hero }
}
