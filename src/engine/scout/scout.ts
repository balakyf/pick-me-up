/**
 * Scouting (Living Lobby spec §6): what waits on the next floor, how dangerous it is for
 * the party as it stands, and a suggested party that answers it. Pure reads — nothing
 * here changes state or consumes the floor's RNG.
 *
 * The threat bands were calibrated from the playtest bots (40 days × 6 runs): with party
 * CP ÷ floor budget at 1.6 or above no hero died; 1.0–1.6 won ~95% with ~0.5 deaths;
 * 0.6–1.0 won ~88% with ~0.8 deaths; below 0.6 the party lost more than it won and
 * ~3 heroes died an attempt.
 */
import { TUNING } from '../tuning'
import { buildEncounter, floorPower } from '../tower'
import { fitToDeploy, heroUnfitReason } from '../tower/deploy'
import { heroCpFull, heroUnitFull, type CpContext } from '../unit/trueCp'
import { applyPartyBonuses } from '../challenge/bonds'
import { ELEMENT_ADVANTAGE } from '../tuning'
import type { Element, EnemyFamily, FloorModifierId, GameState, HeroId, KeywordTag, Line, OwnedHero } from '../types'
import { isStudied } from '../codex'

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
  budget: number
  ratio: number
  threat: Threat
  /** Deaths an attempt at this ratio cost, on average (from the bots). */
  expectedDeaths: number
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

export function threatFor(ratio: number): { threat: Threat; expectedDeaths: number } {
  if (ratio >= 1.6) return { threat: 'safe', expectedDeaths: 0 }
  if (ratio >= 1.0) return { threat: 'fair', expectedDeaths: 0.5 }
  if (ratio >= 0.6) return { threat: 'risky', expectedDeaths: 0.8 }
  return { threat: 'deadly', expectedDeaths: 3 }
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
  const worldMult = TUNING.tower.worldMult[state.worldGrade]
  const budget = floorPower(floor, worldMult)
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
    ...threatFor(ratio),
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
  // True CP (gear, favor, Sanity…), computed once per hero.
  const cps = new Map<HeroId, number>()
  const cpOf = (h: OwnedHero) => cps.get(h.id) ?? (cps.set(h.id, heroCpFull(state, h)), cps.get(h.id)!)
  const score = (h: OwnedHero) => cpOf(h) * (advantaged(h, elems) ? 1.25 : 1)
  // Fit by the deploy rails, the rebellion draw included: a rebel would not answer.
  const fit = (Object.values(state.heroes) as OwnedHero[])
    .filter((h) => h.sanity >= minSanity && fitToDeploy(state, h).ok)
    .sort((a, b) => score(b) - score(a))
  const picked: OwnedHero[] = []
  const take = (pred: (h: OwnedHero) => boolean, n: number) => {
    for (const h of fit) if (picked.length < size && n > 0 && pred(h) && !picked.includes(h)) (picked.push(h), n--)
  }
  if (report?.immune.physical) take((h) => h.heroClass === 'mage', 2)
  if (report?.immune.magic) take((h) => h.heroClass !== 'mage', 3)
  take(() => true, size)
  const byBulk = [...picked].sort((a, b) => bulk(b, cpOf(b)) - bulk(a, cpOf(a)))
  return {
    slots: Array.from({ length: size }, (_, i) => byBulk[i]?.id ?? null),
    lines: ['front', 'front', 'mid', 'back', 'back'],
  }
}
