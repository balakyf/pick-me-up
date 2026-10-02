/**
 * PvP (Layer 4 §1–2): invasions through the Crack of Time, and the KIDNAP-CHAIN.
 *
 * Canon: the open crack exposes a lobby to raiders who loot storerooms and kidnap
 * heroes, "later enslaved or synthesized"; heroes below Lv40 are protected. So PvP
 * NEVER kills directly:
 *   - a defeated defender below Lv40 takes a permanent penalty (−1 to its best grade);
 *   - a defeated defender at Lv40+ is CAPTURED — held for ransom until a deadline, when
 *     the captor synthesizes it (the only PvP permadeath, routed through synthesis);
 *   - the Master can ransom the hero or counter-raid the captor before then.
 * Outgoing raids mirror it: a win loots the rival's storeroom and may take a Lv40+
 * defender captive, to be ransomed back or (the dark path) synthesized into your own.
 *
 * Every rival is a seeded ghost Master (see rivals.ts). PURE and DETERMINISTIC.
 */

import type { Captive, CombatUnit, Encounter, GameState, GrowthGrades, HeroId, InvasionRecord, OwnedHero, Star } from '../types'
import { TUNING } from '../tuning'
import { SKILLS } from '../content'
import { buildCombatUnit } from '../unit'
import { runBattle } from '../combat'
import { rivalSquad } from '../events'
import { deployParty, fitToDeploy } from '../tower/deploy'
import { worldDayIndex } from '../daily'
import { tacticalFocusBonus } from '../tactical'
import { clampSanity } from '../kitchen'
import { withFavor } from '../favor'
import { rngFor, hash, chance, nextFloat, pick } from '../rng'
import { findRival, raidTargets, sectorRivals, guildById, type RivalMaster } from './rivals'

const P = TUNING.pvp
const WORLD_DAY_MS = 24 * 3_600_000
const ATTR_KEYS = ['str', 'agi', 'vit', 'int', 'wil'] as const

export function worldWeek(nowWorld: number): number {
  return Math.floor(worldDayIndex(nowWorld) / 7)
}

/** Can this hero fight in PvP right now (home, alive, not held, not busy — the deploy rails:
 *  no bounty, no burnout, Sanity above 0)? No rebellion draw: that is the tower's. */
export function pvpReady(state: GameState, h: OwnedHero | undefined): h is OwnedHero {
  return fitToDeploy(state, h, { rebellion: false }).ok
}

/** The heroes that would fight for `slots` (in order), as combat units. */
function unitsFor(state: GameState, slots: readonly (HeroId | null)[], lines = state.party.lines): { units: CombatUnit[]; ids: HeroId[] } {
  const { units, ids } = deployParty(state, (h, line) => buildCombatUnit(h, line, SKILLS, state.inventory), { rebellion: false }, slots, lines)
  return { units, ids }
}

/** The defense roster: the preset slots, or the party where they are empty. */
export function defenseSlots(state: GameState): (HeroId | null)[] {
  const preset = state.pvp.defense
  return preset.some((id) => id !== null) ? preset : state.party.slots
}

function cpOf(units: readonly CombatUnit[]): number {
  return units.reduce((n, u) => n + u.cp, 0)
}

function encounterOf(units: CombatUnit[], floor: number): Encounter {
  return { floor, mission: { type: 'PvP', objectives: [{ kind: 'annihilate' }], timer: null }, waves: [{ units }], encounterContext: 'tower', label: 'pvp' }
}

function pushLog(state: GameState, rec: InvasionRecord): GameState['pvp'] {
  return { ...state.pvp, log: [rec, ...state.pvp.log].slice(0, 12) }
}

/** A rival's defense (or raid) squad, sized to `size`, at `cp`; whales are brittle. */
function ghostParty(state: GameState, rival: RivalMaster, size: number, cp: number, salt: string): CombatUnit[] {
  const { units } = rivalSquad(rngFor(state.seed, 'ghost', rival.id, salt), Math.max(1, size), cp, `${rival.id}_${salt}`)
  // Whale rosters are strong but broken: low Sanity, so they panic (Layer 3 §C1 / §D3).
  return rival.whale ? units.map((u) => ({ ...u, sanity: P.whaleSanity })) : units
}

// ─────────────────────────────────────────────────────────────────────────────
// Outgoing raids
// ─────────────────────────────────────────────────────────────────────────────

export interface RaidOutcome {
  rival: RivalMaster
  won: boolean
  gold: number
  stones: number
  captive: Captive | null
  logSeed: number
  log: ReturnType<typeof runBattle>['log']
}

/** Why this raid can't happen now, or null. */
export function raidRefusal(state: GameState, rivalId: string, nowWorld: number): string | null {
  if (!state.meta.crackOpen) return 'The Crack of Time and Space is closed.'
  const week = worldWeek(nowWorld)
  const rival = raidTargets(state, week).find((r) => r.id === rivalId)
  if (!rival) return 'That Master is not in reach this week.'
  if (state.pvp.raidWeek === week && state.pvp.raided.includes(rivalId)) return 'You already raided them this week.'
  if (unitsFor(state, state.party.slots).units.length === 0) return 'No one in the party can go.'
  return null
}

/** Raid a sector rival's lobby with the party. Non-lethal. Throws when refused. PURE. */
export function raidRival(state: GameState, rivalId: string, nowWorld: number): { state: GameState; outcome: RaidOutcome } {
  const refusal = raidRefusal(state, rivalId, nowWorld)
  if (refusal !== null) throw new Error(`raidRival: ${refusal}`)
  const week = worldWeek(nowWorld)
  const rival = raidTargets(state, week).find((r) => r.id === rivalId)!
  const { units, ids } = unitsFor(state, state.party.slots)
  const defense = ghostParty(state, rival, units.length, cpOf(units) * rival.cpRatio * (rival.whale ? P.whaleCpMult : 1), `def${week}`)
  const seed = hash(state.seed, 'raid', rivalId, week)
  const res = runBattle(units, encounterOf(defense, rival.floor), seed)
  const won = res.outcome === 'win'

  let captive: Captive | null = null
  let gold = 0
  let stones = 0
  if (won) {
    gold = P.lootGoldPerFloor * rival.floor
    stones = P.lootStones
    // A fallen Lv40+ defender may be carried off (below Lv40 is protected, canon).
    const eligible = defense.filter((u) => u.level >= P.protectionLevel)
    const roll = chance(rngFor(state.seed, 'kidnap', rivalId, week), P.kidnapChance)
    if (eligible.length > 0 && roll.value) {
      const u = pick(roll.rng, eligible).value
      const star = Math.max(3, Math.min(6, Math.round(u.level / 25) + 2)) as Star
      const g = Math.min(10, Math.max(1, Math.round(u.level / 12)))
      captive = {
        id: `cap_${rivalId}_${week}`,
        name: `${u.name} of ${rival.name}`,
        star,
        level: u.level,
        element: u.element,
        growthGrades: { str: g, agi: g, vit: g, int: g, wil: g },
        fromMaster: rival.name,
        ransomGold: u.level * P.ransomGoldPerLevel,
        ransomGems: star * P.ransomGemsPerStar,
      }
    }
  }

  // The raiders come home a little shaken; no one dies in PvP.
  const heroes = { ...state.heroes }
  for (const id of ids) heroes[id] = { ...heroes[id]!, sanity: clampSanity(heroes[id]!.sanity - P.raidSanity) }
  const materials = { ...state.materials, promotionStone: (state.materials.promotionStone ?? 0) + stones }
  const raided = state.pvp.raidWeek === week ? [...state.pvp.raided, rivalId] : [rivalId]
  const next: GameState = { ...state, heroes, materials, gold: state.gold + gold }
  const rec: InvasionRecord = {
    worldDay: worldDayIndex(nowWorld),
    direction: 'out',
    rival: rival.name,
    won,
    goldDelta: gold,
    note: won ? (captive ? `raided them and took ${captive.name} captive` : 'raided their storeroom') : 'were driven back',
  }
  return {
    outcome: { rival, won, gold, stones, captive, logSeed: seed, log: res.log },
    state: {
      ...next,
      pvp: {
        ...pushLog(next, rec),
        rating: state.pvp.rating + (won ? P.ratingWin : -P.ratingLoss),
        raided,
        raidWeek: week,
        captives: captive ? [...state.pvp.captives, captive] : state.pvp.captives,
      },
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Captives (the dark path)
// ─────────────────────────────────────────────────────────────────────────────

/** Let a captive's Master ransom them back. */
export function releaseCaptive(state: GameState, captiveId: string): GameState {
  const c = state.pvp.captives.find((x) => x.id === captiveId)
  if (!c) throw new Error('releaseCaptive: no such captive')
  return {
    ...state,
    gold: state.gold + c.ransomGold,
    gems: state.gems + c.ransomGems,
    pvp: { ...state.pvp, captives: state.pvp.captives.filter((x) => x.id !== captiveId) },
  }
}

/**
 * Synthesize a captive into one of your heroes (canon: kidnapped heroes are "later
 * synthesized"): an upward-only grade transfer at η, the survivor's Sanity cost, and the
 * whole roster's favor drops — they know what you did.
 */
export function synthesizeCaptive(state: GameState, captiveId: string, survivorId: HeroId): GameState {
  const c = state.pvp.captives.find((x) => x.id === captiveId)
  const s = state.heroes[survivorId]
  if (!c) throw new Error('synthesizeCaptive: no such captive')
  if (!s || !s.alive || s.captiveOf) throw new Error('synthesizeCaptive: that hero cannot receive it')
  const grades: GrowthGrades = { ...s.growthGrades }
  for (const k of ATTR_KEYS) {
    if (c.growthGrades[k] > grades[k]) grades[k] = Math.min(10, grades[k] + Math.ceil((c.growthGrades[k] - grades[k]) * P.captiveEta))
  }
  const heroes = { ...state.heroes }
  heroes[survivorId] = { ...s, growthGrades: grades, sanity: clampSanity(s.sanity - TUNING.lobby.synthesis.survivorSanityCost) }
  for (const h of Object.values(heroes) as OwnedHero[]) {
    if (h.alive) heroes[h.id] = withFavor(heroes[h.id]!, heroes[h.id]!.favor - P.captiveFavorLoss)
  }
  return { ...state, heroes, pvp: { ...state.pvp, captives: state.pvp.captives.filter((x) => x.id !== captiveId) } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Incoming invasions (resolved offline, inside advanceTime)
// ─────────────────────────────────────────────────────────────────────────────

/** One invasion on world-day `day`, seen by the Master at `nowWorld`. */
function invasion(state: GameState, day: number, nowWorld: number): GameState {
  const rivals = sectorRivals(state)
  let r = rngFor(state.seed, 'invader', day)
  const pickR = pick(r, rivals)
  r = pickR.rng
  const raider = pickR.value
  const { units: rawDefense } = unitsFor(state, defenseSlots(state))
  // The Tactical Center coordinates the defense: defenders strike harder by its bonus.
  // Guards on the watchtower stiffen it further (Quanton Life jobs).
  const bonus = 1 + tacticalFocusBonus(state.facilities.tacticalCenter.level) + (state.life?.guardPower ?? 0) * TUNING.life.jobs.guardDefensePerPower
  const defense = rawDefense.map((u) => ({ ...u, stats: { ...u.stats, pAtk: Math.round(u.stats.pAtk * bonus), mAtk: Math.round(u.stats.mAtk * bonus) } }))
  const ratio = nextFloat(r)
  const [lo, hi] = P.rivalCpRange as [number, number]
  const cp = Math.max(100, cpOf(defense)) * (lo + ratio.value * (hi - lo)) * (raider.whale ? P.whaleCpMult : 1)
  const attackers = ghostParty(state, raider, Math.max(3, defense.length), cp, `inv${day}`)
  const now = day * WORLD_DAY_MS
  const shieldUntil = now + P.shieldMs

  const res = defense.length > 0 ? runBattle(defense, encounterOf(attackers, raider.floor), hash(state.seed, 'invasion', day)) : null
  if (res !== null && res.outcome === 'win') {
    const rec: InvasionRecord = { worldDay: day, direction: 'in', rival: raider.name, won: true, goldDelta: 0, note: 'raided you — the defense held' }
    return { ...state, pvp: { ...pushLog(state, rec), shieldUntil, rating: state.pvp.rating + P.ratingWin } }
  }

  // The defense fell: the storeroom is looted and the fallen are taken or scarred.
  const fallen = res?.fallenHeroIds ?? []
  const goldLoss = Math.floor(state.gold * P.storeLoss)
  const materials: Record<string, number> = {}
  for (const [k, v] of Object.entries(state.materials)) materials[k] = v - Math.floor(v * P.storeLoss)
  const heroes = { ...state.heroes }
  const taken: string[] = []
  for (const id of fallen) {
    const h = heroes[id]!
    if (h.xp.level < P.protectionLevel) {
      // Hero Protection: a permanent penalty, never capture (canon, below Lv40).
      const best = ATTR_KEYS.reduce((a, k) => (h.growthGrades[k] > h.growthGrades[a] ? k : a), 'str' as (typeof ATTR_KEYS)[number])
      heroes[id] = { ...h, growthGrades: { ...h.growthGrades, [best]: Math.max(0, h.growthGrades[best] - 1) } }
    } else {
      heroes[id] = {
        ...h,
        captiveOf: {
          master: raider.name,
          rivalId: raider.id,
          ransomGold: h.xp.level * P.ransomGoldPerLevel,
          ransomGems: h.star * P.ransomGemsPerStar,
          // The clock starts when the Master can answer it: an absent Master always
          // gets the full window to ransom or rescue.
          deadlineWorld: Math.max(now, nowWorld) + P.captiveMs,
        },
      }
      taken.push(h.name)
    }
  }
  const rec: InvasionRecord = {
    worldDay: day,
    direction: 'in',
    rival: raider.name,
    won: false,
    goldDelta: -goldLoss,
    note: taken.length > 0 ? `raided you and carried off ${taken.join(', ')}` : 'raided you and looted the storeroom',
  }
  const next: GameState = { ...state, heroes, materials, gold: state.gold - goldLoss }
  return { ...next, pvp: { ...pushLog(next, rec), shieldUntil, rating: state.pvp.rating - P.ratingLoss } }
}

/**
 * Roll the invasions of every world-day since the last roll (at most the last
 * `invasionLookbackDays`), while the crack is open and no shield is up. Then any captive
 * whose deadline passed is synthesized by its captor (permadeath). PURE.
 */
export function resolveInvasions(state: GameState, nowWorld: number): GameState {
  let s = state
  const today = worldDayIndex(nowWorld)
  if (s.meta.crackOpen && today > s.pvp.lastInvasionDay) {
    const from = Math.max(s.pvp.lastInvasionDay + 1, today - P.invasionLookbackDays + 1)
    for (let day = from; day <= today; day++) {
      if (day * WORLD_DAY_MS < s.pvp.shieldUntil) continue
      if (!chance(rngFor(s.seed, 'invade', day), P.invasionChance).value) continue
      s = invasion(s, day, nowWorld)
    }
    s = { ...s, pvp: { ...s.pvp, lastInvasionDay: today } }
  }
  // The clock runs out on captured heroes: their captor synthesizes them.
  let heroes = s.heroes
  let log = s.pvp.log
  for (const h of Object.values(s.heroes) as OwnedHero[]) {
    if (h.alive && h.captiveOf && h.captiveOf.deadlineWorld <= nowWorld) {
      heroes = { ...heroes, [h.id]: { ...h, alive: false, captiveOf: null } }
      log = [
        { worldDay: today, direction: 'in' as const, rival: h.captiveOf.master, won: false, goldDelta: 0, note: `synthesized ${h.name}` },
        ...log,
      ].slice(0, 12)
    }
  }
  return heroes === s.heroes ? s : { ...s, heroes, pvp: { ...s.pvp, log } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Getting a captured hero back
// ─────────────────────────────────────────────────────────────────────────────

/** Pay the ransom for a captured hero. */
export function ransomHero(state: GameState, heroId: HeroId): GameState {
  const h = state.heroes[heroId]
  const hold = h?.captiveOf
  if (!h || !h.alive || !hold) throw new Error('ransomHero: that hero is not held')
  if (state.gold < hold.ransomGold || state.gems < hold.ransomGems) throw new Error('ransomHero: you cannot pay the ransom')
  return {
    ...state,
    gold: state.gold - hold.ransomGold,
    gems: state.gems - hold.ransomGems,
    heroes: { ...state.heroes, [heroId]: { ...h, captiveOf: null } },
  }
}

/** Counter-raid the captor's lobby with the party to free a captured hero. */
export function counterRaid(state: GameState, heroId: HeroId, nowWorld: number): { state: GameState; won: boolean } {
  const h = state.heroes[heroId]
  const hold = h?.captiveOf
  if (!h || !h.alive || !hold) throw new Error('counterRaid: that hero is not held')
  if (!state.meta.crackOpen) throw new Error('counterRaid: the crack is closed')
  const { units, ids } = unitsFor(state, state.party.slots)
  if (units.length === 0) throw new Error('counterRaid: no one in the party can go')
  const captor = findRival(state, hold.rivalId) ?? { id: hold.rivalId, name: hold.master, guildId: '', whale: false, floor: state.tower.highestCleared, cpRatio: 1, rating: 1000 }
  const defense = ghostParty(state, captor, units.length, cpOf(units) * P.counterCpMult * (captor.whale ? P.whaleCpMult : 1), `counter${hold.deadlineWorld}`)
  const won = runBattle(units, encounterOf(defense, captor.floor), hash(state.seed, 'counter', heroId, hold.deadlineWorld)).outcome === 'win'
  const heroes = { ...state.heroes }
  for (const id of ids) heroes[id] = { ...heroes[id]!, sanity: clampSanity(heroes[id]!.sanity - P.raidSanity) }
  if (won) heroes[heroId] = { ...heroes[heroId]!, captiveOf: null }
  const rec: InvasionRecord = {
    worldDay: worldDayIndex(nowWorld),
    direction: 'out',
    rival: captor.name,
    won,
    goldDelta: 0,
    note: won ? `stormed their lobby and freed ${h.name}` : `failed to free ${h.name}`,
  }
  const next: GameState = { ...state, heroes }
  return { won, state: { ...next, pvp: { ...pushLog(next, rec), rating: state.pvp.rating + (won ? P.ratingWin : -P.ratingLoss) } } }
}

/** Set the preset defense roster (length 5; living heroes only). */
export function setDefense(state: GameState, slots: readonly (HeroId | null)[]): GameState {
  if (slots.length !== TUNING.account.partySize) throw new Error('setDefense: the defense needs 5 slots')
  for (const id of slots) if (id !== null && !state.heroes[id]?.alive) throw new Error('setDefense: only the living can defend')
  return { ...state, pvp: { ...state.pvp, defense: [...slots] } }
}

export { guildById }
