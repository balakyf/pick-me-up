/**
 * Scouting (Living Lobby spec §6): what waits on the next floor, how dangerous it is for
 * the party as it stands, and a suggested party that answers it. Pure reads — nothing
 * here changes state or consumes the floor's RNG.
 *
 * The threat bands were calibrated from the playtest bots (40 days × 6 runs): with party
 * CP ÷ floor budget at 1.6 or above no hero died; 1.0–1.6 won ~95% with ~0.5 deaths;
 * 0.6–1.0 won ~88% with ~0.8 deaths; below 0.6 the party lost more than it won and
 * ~3 heroes died an attempt.
 *
 * The scout is honest (spec 2026-10-12 S12): the ratio is the party's real battle units
 * (as playFloor builds them) over the CP of the encounter actually built for this attempt
 * (kind, Doors, mercy director and any Nemesis included), and it names the 1-2 threats
 * that matter and why. src/sim/metrics.test.ts holds the contract: a floor scouted Safe
 * never kills, and Fair floors almost never do.
 */
import { TUNING } from '../tuning'
import { combatPowerForHero } from '../stats'
import { skillCp } from '../skills'
import { engravingCp } from '../engravings'
import { buildEncounter, nemesesOnFloor, nemesisUnitId } from '../tower'
import { ELEMENT_ADVANTAGE } from '../tuning'
import { SKILLS } from '../content'
import { buildCombatUnit } from '../unit'
import { applyBoonsToUnits, climbExtraPct, isMercyCapped, kindForFloor, lastStandPct, sortieBoons } from '../climb'
import type { CombatUnit, Element, EnemyFamily, FloorKind, GameState, HeroId, KeywordTag, Line, OwnedHero, SkillEffect } from '../types'

export type Threat = 'safe' | 'fair' | 'risky' | 'deadly'

export interface ScoutedEnemy {
  name: string
  element: Element
  level: number
  count: number
  family?: EnemyFamily
  keywords: KeywordTag[]
  /** A mission target (defeat / protect / acquire). */
  target: boolean
  /** A death taught the Master this family's weakness (spec 2026-10-12 S23): show its
   *  notes even when the floor is not studied. */
  lesson?: boolean
  /** The element that cuts deepest, when known (the floor is studied, or a lesson). */
  weakness?: Element
}

/** A named threat on the floor and why it matters (spec 2026-10-12 S12). */
export interface ScoutThreat {
  /** The enemy's name (a content string for `t()`; a Nemesis keeps its own name). */
  name: string
  /** Why it is dangerous: one of `THREAT_REASONS` (an English source string for `t()`). */
  why: string
  /** How many of them. */
  count?: number
  /** Its estimated blow on your front line (HP), before crits and variance. */
  hit?: number
}

export interface ScoutReport {
  floor: number
  mission: string
  waves: number
  enemies: ScoutedEnemy[]
  /** The party's real strength: Σ unit CP as the battle builds it (Sanity, favor, gear,
   *  passives, Last Stand, the Memorial and the Sortie's Boons included). */
  partyCp: number
  /** The floor's real strength: Σ CP of the encounter actually built (looming units,
   *  which are outlasted rather than fought, are left out). */
  budget: number
  /** partyCp ÷ budget, the number the threat band reads. */
  ratio: number
  threat: Threat
  /** Deaths an attempt at this ratio cost, on average (from the bots). */
  expectedDeaths: number
  /** The scholars (or an intervention) have read this floor: weaknesses are shown. */
  studied: boolean
  /** Damage types most of the floor shrugs off. */
  immune: { physical: boolean; magic: boolean }
  /** The floor's kind (spec 2026-10-12 S12/S13). */
  kind: FloorKind
  /** The 1-2 named threats and why ("Bone Choir ×3" / "heals each other"). */
  threats: ScoutThreat[]
  /** Heroes that may fall before the party routs; null = fights to the last (a party this
   *  small can still be wiped). */
  rout: number | null
  /** Last Stand bonus to every stat (fraction; 0 = none). */
  lastStandPct: number
  /** The director's mercy cap lowered this floor's budget. */
  mercyCapped: boolean
  /** A Nemesis waiting here ("Mira's Bane"), or null. */
  nemesis: string | null
}

/** Every `why` a named threat can carry (English source strings for `t()`). */
export const THREAT_REASONS = {
  nemesis: 'It remembers the hero it killed.',
  looming: 'Too strong to fight: finish before it wakes.',
  lifesteal: 'Heals itself with every blow.',
  aegis: 'Shrugs off the first hits.',
  enrage: 'Grows far deadlier if the fight drags on.',
  frenzy: 'Deadlier when wounded.',
  opener: 'Its first strike lands hard.',
  phased: 'Untouchable while its guards stand.',
  immunePhysical: 'Immune to physical blows.',
  immuneMagic: 'Immune to magic.',
  resist: 'Hard to hurt with one kind of attack.',
  guard: 'Armoured: takes less damage.',
  fast: 'Very fast: acts far more often than its strength suggests.',
  sniper: 'Picks off your weakest hero.',
  assassin: 'Goes after your strongest hero.',
  numbers: 'Strength in numbers.',
  heavy: 'Hits the hardest on this floor.',
} as const

/** A hero's sheet CP (level, skills and engraving; no Sanity, favor or gear). Kept for
 *  rosters and party pickers; the threat ratio reads the real battle units instead. */
export function heroCp(h: OwnedHero): number {
  return combatPowerForHero(h, h.xp.level, skillCp(h.skills) + engravingCp(h.engraving))
}

export function canFight(h: OwnedHero): boolean {
  return h.alive && h.sanity > 0 && h.training === null && h.expedition === null && !h.captiveOf && h.promotion === null
}

export function threatFor(ratio: number): { threat: Threat; expectedDeaths: number } {
  if (ratio >= 1.6) return { threat: 'safe', expectedDeaths: 0 }
  if (ratio >= 1.2) return { threat: 'fair', expectedDeaths: 0.5 }
  if (ratio >= 0.6) return { threat: 'risky', expectedDeaths: 0.8 }
  return { threat: 'deadly', expectedDeaths: 3 }
}

function partyHeroes(state: GameState): OwnedHero[] {
  return state.party.slots.map((id) => (id ? state.heroes[id] : undefined)).filter((h): h is OwnedHero => !!h && canFight(h))
}

/** The battle units `heroes` would field on the current floor, exactly as playFloor builds
 *  them (party lines, Last Stand, the Memorial's plaques, the Sortie's Boons). */
export function scoutUnits(state: GameState, heroes: OwnedHero[]): CombatUnit[] {
  const extra = climbExtraPct(state, state.tower.currentFloor)
  const units = heroes.map((h) => {
    const slot = state.party.slots.indexOf(h.id)
    const line: Line = slot >= 0 ? (state.party.lines[slot] ?? 'front') : 'front'
    return buildCombatUnit(h, line, SKILLS, state.inventory, extra)
  })
  return applyBoonsToUnits(state, units, sortieBoons(state))
}

function isLooming(u: CombatUnit): boolean {
  return u.keywords.some((k) => k.kind === 'looming')
}

/** The element that beats `e`: its vulnerability first, else the element wheel. */
function weaknessOf(e: ScoutedEnemy): Element | undefined {
  for (const k of e.keywords) if (k.kind === 'vulnerable') return k.element
  return (Object.keys(ELEMENT_ADVANTAGE) as Element[]).find((x) => ELEMENT_ADVANTAGE[x] === e.element)
}

/** The move a unit opens with: the strongest skill it can cast at full SP (as combat's
 *  chooseSkill picks it; ties keep array order), else a plain physical strike. */
function openingSkill(u: CombatUnit): SkillEffect {
  let best: SkillEffect | null = null
  for (const sk of u.skills) {
    if (sk.spCost > u.currentSP || (sk.hpCost !== undefined && u.currentHP <= sk.hpCost)) continue
    if (best === null || sk.skillMult > best.skillMult) best = sk
  }
  return best ?? { id: 'basic-attack', name: 'Basic Attack', skillMult: 1, damageType: 'physical', element: null, target: 'single', spCost: 0 }
}

/** An enemy's estimated opening blow on `target`: its opening skill (spec S12), with the
 *  combat formula's attack, element and defence terms (no crit, no variance). */
function blowOn(u: CombatUnit, target: CombatUnit | undefined): number {
  if (target === undefined) return 0
  const C = TUNING.combat
  const skill = openingSkill(u)
  const physical = skill.damageType === 'physical'
  const atk = physical ? u.stats.pAtk : u.stats.mAtk
  const def = physical ? target.stats.pDef : target.stats.mDef
  const el = skill.element ?? u.element
  const k = C.defenseKFlat + C.defenseKPerLevel * u.level
  const adv =
    ELEMENT_ADVANTAGE[el] === target.element
      ? C.elementAdvantage
      : ELEMENT_ADVANTAGE[target.element] === el
        ? C.elementDisadvantage
        : 1
  // Its opening move: an OPENER lands its first blow harder.
  let opener = 1
  for (const kw of u.keywords) if (kw.kind === 'opener') opener = Math.max(opener, kw.multiplier)
  return Math.round(atk * skill.skillMult * adv * opener * (k / (k + def)))
}

/** An enemy this much faster than the party's fastest hero acts far more often than its
 *  CP suggests (speed is cheap in CP), so the scout calls it out. */
const FAST_VS_PARTY = 1.5

/** Why this enemy is dangerous: the first reason that applies. `partySpd` is the party's
 *  fastest hero (0 when scouting for no one). */
function reasonFor(u: CombatUnit, count: number, nemesis: boolean, partySpd = 0): string {
  const R = THREAT_REASONS
  if (nemesis) return R.nemesis
  const has = (kind: KeywordTag['kind']) => u.keywords.some((k) => k.kind === kind)
  if (has('looming')) return R.looming
  if (has('lifesteal')) return R.lifesteal
  if (has('aegis')) return R.aegis
  if (has('enrage')) return R.enrage
  if (has('frenzy')) return R.frenzy
  if (has('opener')) return R.opener
  if (has('phased')) return R.phased
  if (partySpd > 0 && u.stats.spd >= partySpd * FAST_VS_PARTY) return R.fast
  for (const k of u.keywords) if (k.kind === 'immune') return k.damageType === 'physical' ? R.immunePhysical : R.immuneMagic
  if (has('resist')) return R.resist
  if (has('guard')) return R.guard
  if (u.unitClass === 'archer' || u.unitClass === 'mage') return R.sniper
  if (u.unitClass === 'thief') return R.assassin
  if (count >= 4) return R.numbers
  return R.heavy
}

/**
 * The 1-2 named threats on a floor: a waiting Nemesis always leads; then the enemy groups
 * carrying the most of the floor's strength (count × CP, weighed up for units far faster
 * than the party), each with the first reason that
 * explains it and its estimated blow on the party's front line.
 */
export function namedThreats(enemies: readonly CombatUnit[], party: readonly CombatUnit[], nemesisIds: ReadonlySet<string>): ScoutThreat[] {
  const front = party.find((u) => u.line === 'front') ?? party[0]
  const partySpd = party.reduce((m, u) => Math.max(m, u.stats.spd), 0)
  const groups = new Map<string, { unit: CombatUnit; count: number; weight: number; nemesis: boolean }>()
  // A unit far faster than the party acts more often than its CP says: weigh it by tempo.
  const tempo = (u: CombatUnit) => (partySpd > 0 ? Math.max(1, u.stats.spd / partySpd) : 1)
  for (const u of enemies) {
    const nemesis = nemesisIds.has(u.id)
    const key = nemesis ? `nem|${u.id}` : `${u.name}|${u.level}`
    const g = groups.get(key)
    if (g) {
      g.count++
      g.weight += u.cp * tempo(u)
    } else groups.set(key, { unit: u, count: 1, weight: u.cp * tempo(u), nemesis })
  }
  return [...groups.values()]
    .sort((a, b) => Number(b.nemesis) - Number(a.nemesis) || b.weight - a.weight)
    .slice(0, 2)
    .map((g) => ({
      name: g.unit.name,
      why: reasonFor(g.unit, g.count, g.nemesis, partySpd),
      count: g.count,
      hit: blowOn(g.unit, front),
    }))
}

/** Scout the current floor for the current party (or `heroes`). The ratio is honest: the
 *  party's real battle units against the encounter actually built for this attempt. */
export function scoutFloor(state: GameState, heroes: OwnedHero[] = partyHeroes(state)): ScoutReport | null {
  const floor = state.tower.currentFloor
  if (floor > TUNING.tower.sliceTopFloor) return null
  const kind = kindForFloor(state, floor)
  const enc = buildEncounter(state, floor)
  const targets = new Set(enc.mission.objectives.flatMap((o) => ('targetTag' in o ? [o.targetTag] : [])))
  const studied = state.meta.peekedFloors.includes(floor)
  const lessons = new Set(state.life.legacy?.lessons ?? [])
  const groups = new Map<string, ScoutedEnemy>()
  const all: CombatUnit[] = []
  let immPhys = 0
  let immMagic = 0
  let total = 0
  let foeCp = 0
  for (const w of enc.waves) {
    for (const u of w.units) {
      total++
      all.push(u)
      if (!isLooming(u)) foeCp += u.cp
      if (u.keywords.some((k) => (k.kind === 'immune' || k.kind === 'resist') && k.damageType === 'physical')) immPhys++
      if (u.keywords.some((k) => (k.kind === 'immune' || k.kind === 'resist') && k.damageType === 'magic')) immMagic++
      const key = `${u.name}|${u.level}`
      const g = groups.get(key)
      if (g) g.count++
      else {
        const e: ScoutedEnemy = {
          name: u.name,
          element: u.element,
          level: u.level,
          count: 1,
          family: u.family,
          keywords: u.keywords,
          target: u.targetTag !== undefined && targets.has(u.targetTag),
        }
        if (u.family !== undefined && lessons.has(u.family)) e.lesson = true
        if (studied || e.lesson) {
          const weak = weaknessOf(e)
          if (weak !== undefined) e.weakness = weak
        }
        groups.set(key, e)
      }
    }
  }
  const units = scoutUnits(state, heroes)
  const partyCp = units.reduce((n, u) => n + u.cp, 0)
  const ratio = foeCp > 0 ? partyCp / foeCp : 0
  const nemeses = nemesesOnFloor(state, floor)
  const routAt = enc.routAfterDeaths
  return {
    floor,
    mission: enc.mission.type,
    waves: enc.waves.length,
    enemies: [...groups.values()],
    partyCp,
    budget: foeCp,
    ratio: Math.round(ratio * 100) / 100,
    ...threatFor(ratio),
    studied,
    immune: { physical: immPhys > total / 2, magic: immMagic > total / 2 },
    kind,
    threats: namedThreats(all, units, new Set(nemeses.map(nemesisUnitId))),
    rout: routAt !== undefined && heroes.length > routAt ? routAt : null,
    lastStandPct: lastStandPct(state, floor),
    mercyCapped: isMercyCapped(state, floor, kind),
    nemesis: nemeses[0]?.name ?? null,
  }
}

/** Heroes whose element beats most of the floor. */
function advantaged(h: OwnedHero, enemyElements: Element[]): boolean {
  const beats = ELEMENT_ADVANTAGE[h.element]
  if (!beats) return false
  return enemyElements.filter((e) => e === beats).length > enemyElements.length / 3
}

function bulk(h: OwnedHero): number {
  const cls = h.heroClass
  const role = cls === 'warrior' || cls === 'spearman' ? 2 : cls === 'thief' ? 1 : 0
  return role * 1e9 + heroCp(h)
}

/**
 * The party a careful Master would send: the strongest heroes fit to fight (rested — at
 * least `minSanity`), counter-picked against the floor (mages against the physically
 * immune, blades against the magic-immune, element advantage as a tiebreak), sturdiest
 * in front and the frail at the back.
 */
export function suggestParty(state: GameState, minSanity = 40): { slots: (HeroId | null)[]; lines: Line[] } {
  const size = TUNING.account.partySize
  const report = scoutFloor(state, [])
  const elems = report ? report.enemies.flatMap((e) => Array.from({ length: e.count }, () => e.element)) : []
  const score = (h: OwnedHero) => heroCp(h) * (advantaged(h, elems) ? 1.25 : 1)
  const fit = Object.values(state.heroes)
    .filter((h) => canFight(h) && h.sanity >= minSanity)
    .sort((a, b) => score(b) - score(a))
  const picked: OwnedHero[] = []
  const take = (pred: (h: OwnedHero) => boolean, n: number) => {
    for (const h of fit) if (picked.length < size && n > 0 && pred(h) && !picked.includes(h)) (picked.push(h), n--)
  }
  if (report?.immune.physical) take((h) => h.heroClass === 'mage', 2)
  if (report?.immune.magic) take((h) => h.heroClass !== 'mage', 3)
  take(() => true, size)
  const byBulk = [...picked].sort((a, b) => bulk(b) - bulk(a))
  return {
    slots: Array.from({ length: size }, (_, i) => byBulk[i]?.id ?? null),
    lines: ['front', 'front', 'mid', 'back', 'back'],
  }
}
