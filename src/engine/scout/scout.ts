/**
 * Scouting (Living Lobby spec §6): what waits on the next floor, the party's strength
 * against the encounter actually built, and a suggested party that answers it. Pure reads —
 * nothing here changes state or consumes the floor's RNG.
 *
 * How dangerous the floor is comes from the war-room forecast (forecast.ts), which runs the
 * real fight: the old CP-ratio bands under-read every anchor and the Wall (B1).
 */
import { TUNING } from '../tuning'
import { buildEncounter } from '../tower'
import { fitToDeploy, heroUnfitReason } from '../tower/deploy'
import { heroCpFull, heroUnitFull, type CpContext } from '../unit/trueCp'
import { applyPartyBonuses } from '../challenge/bonds'
import { ELEMENT_ADVANTAGE } from '../tuning'
import type { CombatUnit, DamageType, Element, EnemyFamily, FloorModifierId, GameState, HeroId, KeywordTag, Line, OwnedHero } from '../types'
import { isStudied } from '../codex'
import { FORECAST } from './forecastTuning'

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
  /** The enemy template (the Codex key). */
  templateId?: string
  /** The Enemy Codex already knows its weaknesses (felled often enough, or scouted before). */
  studied: boolean
}

export interface ScoutReport {
  floor: number
  mission: string
  waves: number
  enemies: ScoutedEnemy[]
  partyCp: number
  /** The CP of the encounter actually built (anchor and Wall scaling included). */
  budget: number
  ratio: number
  /** The scholars (or an intervention) have read this floor: weaknesses are shown. */
  studied: boolean
  /** Damage types most of the floor shrugs off. */
  immune: { physical: boolean; magic: boolean }
  /** The floor's conditions (combat depth, F40+). */
  modifiers: FloorModifierId[]
}

export { heroCpFull, heroUnitFull, heroStatsFull, type CpContext } from '../unit/trueCp'

const NO_GEAR: CpContext = { inventory: [] }

/**
 * A hero's CP — the TRUE number combat fields (unit/trueCp.ts): gear, passive and
 * engraving %, favor, the Sanity penalty and withdrawal included. Pass the account (or at
 * least its inventory) for gear to count; without it the hero is read bare-handed.
 */
export function heroCp(h: OwnedHero, state?: CpContext): number {
  return heroCpFull(state ?? NO_GEAR, h)
}

/** The party's CP as the tower would field these heroes: true CP plus the party's bond
 *  set bonuses and the Cursed Shrine's blessing on this floor. */
export function partyCp(state: GameState, heroes: readonly OwnedHero[]): number {
  const units = applyPartyBonuses(heroes.map((h) => heroUnitFull(state, h)), state)
  return units.reduce((n, u) => n + u.cp, 0)
}

/**
 * Can this hero fight right now? With the account `state` this is the deploy rails
 * (tower/deploy.ts: bounty and burnout too); without it only what the hero carries.
 * No rebellion draw — a suggestion, not the attempt.
 */
export function canFight(h: OwnedHero, state?: GameState): boolean {
  return state ? fitToDeploy(state, h, { rebellion: false }).ok : heroUnfitReason(h) === null
}

/** The party heroes who will actually fight the next attempt (the deploy rails, the
 *  rebellion draw included — a rebel won't be there). */
function partyHeroes(state: GameState): OwnedHero[] {
  return state.party.slots
    .map((id) => (id ? state.heroes[id] : undefined))
    .filter((h): h is OwnedHero => !!h && fitToDeploy(state, h).ok)
}

/** Scout the current floor for the current party (or `heroes`). */
export function scoutFloor(state: GameState, heroes: OwnedHero[] = partyHeroes(state)): ScoutReport | null {
  const floor = state.tower.currentFloor
  if (floor > TUNING.tower.sliceTopFloor) return null
  const enc = buildEncounter(state, floor)
  const targets = new Set(
    enc.mission.objectives.flatMap((o) => ('targetTag' in o ? [o.targetTag] : [])),
  )
  const groups = new Map<string, ScoutedEnemy>()
  let immPhys = 0
  let immMagic = 0
  let total = 0
  for (const w of enc.waves) {
    for (const u of w.units) {
      total++
      if (u.keywords.some((k) => (k.kind === 'immune' || k.kind === 'resist') && k.damageType === 'physical')) immPhys++
      if (u.keywords.some((k) => (k.kind === 'immune' || k.kind === 'resist') && k.damageType === 'magic')) immMagic++
      const key = `${u.name}|${u.level}`
      const g = groups.get(key)
      if (g) g.count++
      else
        groups.set(key, {
          name: u.name,
          element: u.element,
          level: u.level,
          count: 1,
          family: u.family,
          keywords: u.keywords,
          target: u.targetTag !== undefined && targets.has(u.targetTag),
          ...(u.templateId !== undefined ? { templateId: u.templateId } : {}),
          studied: u.templateId !== undefined && isStudied(state.codex, u.templateId),
        })
    }
  }
  // The budget is the encounter actually built (an anchor above its floor, the Wall far above).
  const budget = enc.waves.reduce((n, w) => n + w.units.reduce((m, u) => m + u.cp, 0), 0)
  const cp = partyCp(state, heroes)
  const ratio = budget > 0 ? cp / budget : 0
  return {
    floor,
    mission: enc.mission.type,
    waves: enc.waves.length,
    enemies: [...groups.values()],
    partyCp: cp,
    budget,
    ratio: Math.round(ratio * 100) / 100,
    studied: state.meta.peekedFloors.includes(floor),
    immune: { physical: immPhys > total / 2, magic: immMagic > total / 2 },
    modifiers: enc.modifiers ?? [],
  }
}

/** Heroes whose element beats most of the floor. */
function advantaged(h: OwnedHero, enemyElements: Element[]): boolean {
  const beats = ELEMENT_ADVANTAGE[h.element]
  if (!beats) return false
  return enemyElements.filter((e) => e === beats).length > enemyElements.length / 3
}

function bulk(h: OwnedHero, cp: number): number {
  const cls = h.heroClass
  const role = cls === 'warrior' || cls === 'spearman' ? 2 : cls === 'thief' ? 1 : 0
  return role * 1e9 + cp
}

/** How a floor stands against each damage type, and what its boss fears. */
export interface FloorRead {
  /** Share of the floor (boss weighted) that shrugs off each damage type (immune 1, resist ½). */
  shrugs: Record<DamageType, number>
  /** Elements on the floor, one per enemy. */
  elements: Element[]
  /** The mission's boss (a defeat/acquire target), if any. */
  boss: { element: Element; weakTo: Element[]; immune: DamageType[] } | null
}

const shrugsOff = (u: CombatUnit, t: DamageType): number =>
  u.keywords.some((k) => k.kind === 'immune' && k.damageType === t) ? 1 : u.keywords.some((k) => k.kind === 'resist' && k.damageType === t) ? 0.5 : 0

/** Read a floor's encounter for counter-picking (pure). */
export function readFloor(state: GameState, floor = state.tower.currentFloor): FloorRead | null {
  if (floor > TUNING.tower.sliceTopFloor) return null
  const enc = buildEncounter(state, floor)
  const tags = new Set(enc.mission.objectives.flatMap((o) => (o.kind === 'defeat' || o.kind === 'acquire' ? [o.targetTag] : [])))
  const units = enc.waves.flatMap((w) => w.units)
  const bossUnit = units.find((u) => u.targetTag !== undefined && tags.has(u.targetTag))
  let weight = 0
  const shrugs: Record<DamageType, number> = { physical: 0, magic: 0 }
  for (const u of units) {
    const w = u === bossUnit ? FORECAST.bossWeight : 1
    weight += w
    shrugs.physical += w * shrugsOff(u, 'physical')
    shrugs.magic += w * shrugsOff(u, 'magic')
  }
  if (weight > 0) {
    shrugs.physical /= weight
    shrugs.magic /= weight
  }
  return {
    shrugs,
    elements: units.map((u) => u.element),
    boss: bossUnit
      ? {
          element: bossUnit.element,
          weakTo: bossUnit.keywords.flatMap((k) => (k.kind === 'vulnerable' ? [k.element] : [])),
          immune: bossUnit.keywords.flatMap((k) => (k.kind === 'immune' ? [k.damageType] : [])),
        }
      : null,
  }
}

/**
 * The party a careful Master would send: the strongest heroes fit to fight (rested — at
 * least `minSanity`), ranked by TRUE CP with a bonus for the heroes who exploit the boss
 * (its weakness, element advantage) and the floor, counter-picked once a damage type is
 * shrugged off by a quarter of the floor or more (the boss counts thrice): mages against
 * the physically immune, blades against the magic-immune. Sturdiest in front, the frail at
 * the back.
 */
export function suggestParty(state: GameState, minSanity = 40): { slots: (HeroId | null)[]; lines: Line[] } {
  const size = TUNING.account.partySize
  const read = readFloor(state)
  const elems = read?.elements ?? []
  // True CP (gear, favor, Sanity…), computed once per hero.
  const cps = new Map<HeroId, number>()
  const cpOf = (h: OwnedHero) => cps.get(h.id) ?? (cps.set(h.id, heroCpFull(state, h)), cps.get(h.id)!)
  const boss = read?.boss ?? null
  const score = (h: OwnedHero) => {
    let s = cpOf(h)
    if (advantaged(h, elems)) s *= FORECAST.floorAdvantageMult
    if (boss) {
      if (boss.weakTo.includes(h.element)) s *= FORECAST.bossWeakMult
      else if (ELEMENT_ADVANTAGE[h.element] === boss.element) s *= FORECAST.bossAdvantageMult
    }
    return s
  }
  // Fit by the deploy rails, the rebellion draw included: a rebel would not answer.
  const fit = (Object.values(state.heroes) as OwnedHero[])
    .filter((h) => h.sanity >= minSanity && fitToDeploy(state, h).ok)
    .sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1))
  const picked: OwnedHero[] = []
  const take = (pred: (h: OwnedHero) => boolean, n: number) => {
    for (const h of fit) if (picked.length < size && n > 0 && pred(h) && !picked.includes(h)) (picked.push(h), n--)
  }
  const want = (share: number, bossImmune: boolean) =>
    share < FORECAST.counterShare && !bossImmune ? 0 : Math.max(bossImmune ? 2 : 1, Math.min(size - 1, Math.round(size * share) + 1))
  const mages = want(read?.shrugs.physical ?? 0, !!boss?.immune.includes('physical'))
  const blades = want(read?.shrugs.magic ?? 0, !!boss?.immune.includes('magic'))
  // The harder wall first, then the other; the rest by score.
  if (mages >= blades) {
    take((h) => h.heroClass === 'mage', mages)
    take((h) => h.heroClass !== 'mage', blades)
  } else {
    take((h) => h.heroClass !== 'mage', blades)
    take((h) => h.heroClass === 'mage', mages)
  }
  take(() => true, size)
  const byBulk = [...picked].sort((a, b) => bulk(b, cpOf(b)) - bulk(a, cpOf(a)))
  return {
    slots: Array.from({ length: size }, (_, i) => byBulk[i]?.id ?? null),
    lines: ['front', 'front', 'mid', 'back', 'back'],
  }
}
