/**
 * Event floors (Layer 2 §5.1) — the breathers between regular floors — and the F41/42
 * tournament (§5.4).
 *
 * The tower opens an event (`tower.event`) on an anchor's first clear (bonus), after a
 * battle that cost the main team (recovery), or after F41 (tournament). The climb waits
 * until the Master picks one of its options here.
 *
 * The tournament's rivals are seeded ghost parties tuned against the Master's own party
 * CP (real PvP matchmaking is Layer 4). Tournament fights are NON-LETHAL: no permadeath,
 * no XP, no Sanity change — only the ranking and its rewards.
 *
 * PURE and DETERMINISTIC: every draw comes from rngFor(seed, 'event', floor, …).
 */

import type { CombatLog, CombatUnit, Encounter, GameState, HeroId, MaterialId, OwnedHero } from '../types'
import { TUNING } from '../tuning'
import { ENEMY_TEMPLATES, SKILLS } from '../content'
import { buildCombatUnit, buildEnemyUnit } from '../unit'
import { runBattle } from '../combat'
import { clampSanity } from '../kitchen'
import { summon } from '../gacha'
import { rngFor, hash, chance, pick, type Rng } from '../rng'
import { TOURNAMENT_FORMATS } from '../tower'

const E = TUNING.events
const TT = E.tournament

export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number]

/** Display names for every event option. */
export const EVENT_OPTION_LABEL: Record<string, string> = {
  rest: 'Rest',
  treasure: 'Treasure',
  merchant: 'Merchant',
  gamble: 'Gamble',
  reinforcement: 'Reinforcement',
  battle_royale: 'Battle Royale',
  party_raid: 'Party Raid',
  team: 'Team Game',
  pair: 'Pair Game',
  deathmatch: 'Deathmatch',
}

/** One tournament round's outcome (its log is kept for replay). */
export interface TournamentRound {
  won: boolean
  rivalCp: number
  log: CombatLog
}

/** What resolving an event did (for the results window). */
export interface EventOutcome {
  option: string
  gold: number
  gems: number
  materials: Record<MaterialId, number>
  /** Sanity added (+) or lost (−) by each affected hero. */
  sanity: number
  /** A hero recruited by Reinforcement. */
  recruit?: OwnedHero
  /** Gamble: did it pay off? */
  won?: boolean
  /** Tournament rounds, wins and final placing among 8 entrants. */
  rounds?: TournamentRound[]
  wins?: number
  placing?: number
  note: string
}

/** Gold a Treasure cache holds on a floor. */
export function treasureGold(floor: number): number {
  return E.treasureGoldPerFloor * floor
}

/** Gold the Merchant asks for its bundle. */
export function merchantPrice(): number {
  return E.merchantStones * E.merchantGoldPerStone
}

/** The party's deployable heroes (as the tower deploys them), in slot order. */
function deployable(state: GameState): { hero: OwnedHero; line: CombatUnit['line'] }[] {
  const out: { hero: OwnedHero; line: CombatUnit['line'] }[] = []
  state.party.slots.forEach((id, i) => {
    const h = id ? state.heroes[id] : undefined
    if (h && h.alive && h.sanity > 0 && h.training === null) out.push({ hero: h, line: state.party.lines[i] ?? 'front' })
  })
  return out
}

function addSanity(state: GameState, ids: HeroId[] | 'all', delta: number): GameState {
  const heroes = { ...state.heroes }
  for (const h of Object.values(state.heroes) as OwnedHero[]) {
    if (!h.alive || (ids !== 'all' && !ids.includes(h.id))) continue
    heroes[h.id] = { ...h, sanity: clampSanity(h.sanity + delta) }
  }
  return { ...state, heroes }
}

function addMaterials(state: GameState, mats: Record<MaterialId, number>): GameState {
  const materials = { ...state.materials }
  for (const [id, n] of Object.entries(mats)) materials[id] = (materials[id] ?? 0) + n
  return { ...state, materials }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tournament (canon F41/42): three rounds against seeded ghost parties
// ─────────────────────────────────────────────────────────────────────────────

const RIVAL_POOL = ['soldier', 'knight', 'dark_mage', 'assassin', 'order_soldier', 'order_mage', 'dark_knight', 'demon_marksman']
const RIVAL_LINES: CombatUnit['line'][] = ['front', 'front', 'mid', 'back', 'back']

/** A rival squad of `size` whose total CP is as close as possible to `targetCp`. */
function rivalSquad(rng: Rng, size: number, targetCp: number, tag: string): { units: CombatUnit[]; rng: Rng } {
  let r = rng
  const ids: string[] = []
  for (let i = 0; i < size; i++) {
    const d = pick(r, RIVAL_POOL)
    r = d.rng
    ids.push(d.value)
  }
  const build = (level: number) =>
    ids.map((id, i) => buildEnemyUnit(ENEMY_TEMPLATES[id]!, level, `${tag}_${i}`, { line: RIVAL_LINES[i] ?? 'back' }))
  const cp = (units: CombatUnit[]) => units.reduce((n, u) => n + u.cp, 0)
  // Binary search the level whose squad CP meets the target.
  let lo = 1
  let hi = 400
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (cp(build(mid)) < targetCp) lo = mid + 1
    else hi = mid
  }
  return { units: build(lo), rng: r }
}

function encounterOf(units: CombatUnit[][], floor: number, objectives: Encounter['mission']['objectives'], timer: number | null): Encounter {
  return {
    floor,
    mission: { type: 'Tournament', objectives, timer },
    waves: units.map((u) => ({ units: u })),
    encounterContext: 'tower',
    label: 'tournament',
  }
}

/**
 * Run one tournament format for the Master's party. Deathmatch fields the strongest
 * hero, Pair Game the top two, the rest the whole party. Team/Pair/Deathmatch: three
 * rounds against rivals at rising CP ratios. Battle Royale: one fight against all three
 * rival squads in succession (each squad beaten counts). Party Raid: one timed fight
 * against a raid boss (each third of its HP counts). NON-LETHAL. PURE.
 */
export function runTournament(state: GameState, format: TournamentFormat): { rounds: TournamentRound[]; wins: number } {
  const entrants = deployable(state)
  if (entrants.length === 0) throw new Error('tournament: no deployable heroes in the party')
  const units = entrants.map((e) => buildCombatUnit(e.hero, e.line, SKILLS, state.inventory))
  const byCp = [...units].sort((a, b) => b.cp - a.cp)
  const field = format === 'deathmatch' ? byCp.slice(0, 1) : format === 'pair' ? byCp.slice(0, 2) : units
  const fieldCp = field.reduce((n, u) => n + u.cp, 0)
  const floor = state.tower.event?.floor ?? 41
  let r = rngFor(state.seed, 'event', floor, format)
  const rounds: TournamentRound[] = []

  if (format === 'battle_royale') {
    const squads: CombatUnit[][] = []
    for (const [i, ratio] of TT.rivalCpRatios.entries()) {
      const sq = rivalSquad(r, field.length, fieldCp * ratio, `br${i}`)
      r = sq.rng
      squads.push(sq.units)
    }
    const res = runBattle(field, encounterOf(squads, floor, [{ kind: 'annihilate' }], null), hash(state.seed, 'event', floor, format))
    const wins = Math.min(3, res.wavesCleared)
    for (let i = 0; i < 3; i++) {
      rounds.push({ won: i < wins, rivalCp: squads[i]!.reduce((n, u) => n + u.cp, 0), log: res.log })
    }
    return { rounds, wins }
  }

  if (format === 'party_raid') {
    const boss = rivalSquad(r, 1, fieldCp * 1.6, 'raid')
    const bossUnit: CombatUnit = { ...boss.units[0]!, name: 'Raid Colossus', targetTag: 'raid_boss' }
    const res = runBattle(
      field,
      encounterOf([[bossUnit]], floor, [{ kind: 'defeat', targetTag: 'raid_boss' }], TT.raidTicks),
      hash(state.seed, 'event', floor, format),
    )
    let hp = bossUnit.stats.maxHP
    for (const e of res.log.events) if (e.kind === 'hit' && e.targetId === bossUnit.id) hp = e.hpAfter
    const dealt = Math.min(1, (bossUnit.stats.maxHP - Math.max(0, hp)) / bossUnit.stats.maxHP)
    const wins = res.outcome === 'win' ? 3 : Math.min(2, Math.floor(dealt * 3))
    for (let i = 0; i < 3; i++) rounds.push({ won: i < wins, rivalCp: bossUnit.cp, log: res.log })
    return { rounds, wins }
  }

  for (const [i, ratio] of TT.rivalCpRatios.entries()) {
    const sq = rivalSquad(r, field.length, fieldCp * ratio, `${format}${i}`)
    r = sq.rng
    const res = runBattle(field, encounterOf([sq.units], floor, [{ kind: 'annihilate' }], null), hash(state.seed, 'event', floor, format, i))
    rounds.push({ won: res.outcome === 'win', rivalCp: sq.units.reduce((n, u) => n + u.cp, 0), log: res.log })
  }
  return { rounds, wins: rounds.filter((x) => x.won).length }
}

/** Placing among the 8 entrants by rounds won (3 wins = champion). */
export function tournamentPlacing(wins: number): number {
  return [8, 4, 2, 1][Math.max(0, Math.min(3, wins))]!
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the open event with one of its options, closing it. Throws when no event is
 * open, the option isn't offered, or the Merchant can't be paid. PURE.
 */
export function resolveEvent(state: GameState, option: string): { state: GameState; outcome: EventOutcome } {
  const ev = state.tower.event
  if (ev === null) throw new Error('resolveEvent: no event floor is open')
  if (!ev.options.includes(option)) throw new Error(`resolveEvent: '${option}' is not offered here`)
  const floor = ev.floor
  const outcome: EventOutcome = { option, gold: 0, gems: 0, materials: {}, sanity: 0, note: '' }
  let next: GameState = state

  switch (option) {
    case 'rest':
      next = addSanity(next, 'all', E.restSanity)
      outcome.sanity = E.restSanity
      outcome.note = 'The heroes rest by a quiet fire. Nerves settle.'
      break
    case 'treasure':
      outcome.gold = treasureGold(floor)
      outcome.materials = { promotionStone: E.treasureStones }
      outcome.note = 'A cache left behind by an earlier party.'
      break
    case 'merchant': {
      const price = merchantPrice()
      if (next.gold < price) throw new Error(`resolveEvent: the merchant wants ${price} gold`)
      next = { ...next, gold: next.gold - price }
      outcome.gold = -price
      outcome.materials = { promotionStone: E.merchantStones }
      outcome.note = 'A wandering merchant trades stones for gold.'
      break
    }
    case 'gamble': {
      const roll = chance(rngFor(state.seed, 'event', floor, 'gamble'), E.gambleChance)
      outcome.won = roll.value
      if (roll.value) {
        outcome.gold = treasureGold(floor) * E.gambleWinMult
        outcome.materials = { promotionStone: E.treasureStones * E.gambleWinMult }
        outcome.note = 'The sealed door opens onto a vault.'
      } else {
        const party = deployable(next).map((d) => d.hero.id)
        next = addSanity(next, party, -E.gambleSanity)
        outcome.sanity = -E.gambleSanity
        outcome.note = 'The door was a trap. The party staggers back, shaken.'
      }
      break
    }
    case 'reinforcement': {
      const cost = TUNING.gacha.normalCostGold
      const pulled = summon({ ...next, gold: next.gold + cost })
      next = { ...pulled.state, gold: next.gold }
      outcome.recruit = pulled.hero
      outcome.note = 'A new hero answers the call.'
      break
    }
    default: {
      const format = option as TournamentFormat
      const { rounds, wins } = runTournament(next, format)
      outcome.rounds = rounds
      outcome.wins = wins
      outcome.placing = tournamentPlacing(wins)
      outcome.gold = TT.goldByWins[wins]!
      outcome.gems = TT.gemsByWins[wins]!
      if (TT.stonesByWins[wins]! > 0) outcome.materials = { promotionStone: TT.stonesByWins[wins]! }
      outcome.note = wins === 3 ? 'Champion of the tournament!' : `Placed ${outcome.placing}${wins === 2 ? 'nd' : 'th'} of 8.`
    }
  }

  if (option !== 'merchant') next = { ...next, gold: next.gold + outcome.gold }
  next = { ...addMaterials(next, outcome.materials), gems: next.gems + outcome.gems }
  return { state: { ...next, tower: { ...next.tower, event: null } }, outcome }
}
