/**
 * Bonds (canon 인연): heroes summoned already bound to one another — a mercenary band of
 * five, a "gale" company, a pair of twin mages.
 *
 * - A ten-pull can bring a bond group: 2–5 of the pulled heroes arrive together under a
 *   generated name ("the Twin Stars", "the Gale Band"). Pairs are far likelier than
 *   fives; the Advanced crystal binds more often than the Normal pool. The draw is its own
 *   stream (rngFor(seed, 'bond', pool, pullCounter)), so the pulls themselves never change.
 * - Members start as close friends (state.life.relations), so the lobby treats them so.
 * - Set bonus: two or more members in one party fight better (+perExtra stats per member
 *   beyond the first, +fullSet more when the whole group stands together — a group that
 *   has lost someone can never be whole again).
 * - A member's death hits the others harder (griefMult on grief and Sanity).
 *
 * PURE. Imports nothing heavier than the rng so the gacha can call it.
 */
import type { BondGroup, CombatUnit, DerivedStats, Element, GameState, HeroId, OwnedHero, SummonPool } from '../types'
import { rngFor, chance, weightedPick, pick, shuffle } from '../rng/rng'
import { CHALLENGE } from './tuning'
import { challengeOf } from './challenge'

const B = CHALLENGE.bonds

/** Adjectives for bands of 3–5, flavoured by the lead member's element. */
const ADJECTIVES: Record<Element, string[]> = {
  wind: ['Gale', 'Storm'],
  fire: ['Ember', 'Crimson'],
  water: ['Tide', 'Frost'],
  earth: ['Iron', 'Thorn'],
  light: ['Dawn', 'Golden'],
  dark: ['Ashen', 'Moonless'],
  physical: ['Iron', 'Silver'],
}

/** "the Twin {noun}" for pairs. */
export const PAIR_NOUNS = ['Stars', 'Blades', 'Flames', 'Moons', 'Shadows', 'Roses'] as const
/** "the {adj} {noun}" for 3, 4 and 5. */
export const GROUP_NOUNS: Record<3 | 4 | 5, readonly string[]> = {
  3: ['Trio', 'Triad'],
  4: ['Four', 'Wardens'],
  5: ['Band', 'Company', 'Brigade'],
}
/** Every name part the generator can use (the UI translates them). */
export const BOND_WORDS: readonly string[] = [
  'Twin',
  ...new Set([...Object.values(ADJECTIVES).flat(), ...PAIR_NOUNS, ...Object.values(GROUP_NOUNS).flat()]),
]

export function bondName(adj: string, noun: string): string {
  return `the ${adj} ${noun}`
}

/** The bond group a hero belongs to, or null. */
export function bondGroupOf(state: GameState, heroId: HeroId): BondGroup | null {
  const h = state.heroes[heroId]
  if (!h || !h.bondGroup) return null
  return challengeOf(state).bondGroups[h.bondGroup] ?? null
}

function relationKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * After a ten-pull: maybe bind 2–5 of the batch into a named bond group. Deterministic per
 * account + batch (the pool's pull counter after the batch). PURE.
 */
export function bindSummonBatch(state: GameState, batch: readonly OwnedHero[], pool: SummonPool): GameState {
  if (batch.length < 10) return state
  const counter = pool === 'normal' ? state.gacha.pullCount : state.gacha.advPullCount
  let r = rngFor(state.seed, 'bond', pool, counter)
  const roll = chance(r, B.chance[pool])
  r = roll.rng
  if (!roll.value) return state
  const sizeDraw = weightedPick(r, B.sizeWeights)
  r = sizeDraw.rng
  const size = sizeDraw.value
  const order = shuffle(r, batch.map((h) => h.id))
  r = order.rng
  const chosen = new Set(order.value.slice(0, size))
  // Members in summon order (the first one leads and flavours the name).
  const members = batch.map((h) => h.id).filter((id) => chosen.has(id))
  const lead = state.heroes[members[0]!]!

  const ch = challengeOf(state)
  const taken = new Set(Object.values(ch.bondGroups).map((g) => g.name))
  let adj: string
  let nouns: readonly string[]
  if (size === 2) {
    adj = 'Twin'
    nouns = PAIR_NOUNS
  } else {
    const a = pick(r, ADJECTIVES[lead.element])
    r = a.rng
    adj = a.value
    nouns = GROUP_NOUNS[size as 3 | 4 | 5]
  }
  const start = pick(r, nouns)
  const offset = nouns.indexOf(start.value)
  let noun = start.value
  for (let i = 0; i < nouns.length; i++) {
    const n = nouns[(offset + i) % nouns.length]!
    if (!taken.has(bondName(adj, n))) {
      noun = n
      break
    }
  }
  let name = bondName(adj, noun)
  for (let k = 2; taken.has(name); k++) name = `${bondName(adj, noun)} ${k}`

  const id = `bond_${String(Object.keys(ch.bondGroups).length + 1).padStart(4, '0')}`
  const group: BondGroup = { id, name, members, adj, noun }

  const heroes = { ...state.heroes }
  for (const m of members) heroes[m] = { ...heroes[m]!, bondGroup: id }
  const relations = { ...state.life.relations }
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const k = relationKey(members[i]!, members[j]!)
      const cur = relations[k] ?? { affinity: 0, shared: 0 }
      relations[k] = { ...cur, affinity: Math.max(cur.affinity, B.startAffinity) }
    }
  }
  return {
    ...state,
    heroes,
    life: { ...state.life, relations },
    challenge: { ...ch, bondGroups: { ...ch.bondGroups, [id]: group } },
  }
}

/** The set bonus (a stat fraction) for `members` of one group fighting together. */
export function setBonusFor(fighting: number, groupSize: number): number {
  if (fighting < 2) return 0
  return B.perExtra * (fighting - 1) + (fighting >= groupSize ? B.fullSet : 0)
}

/** Each deployed hero's bond set bonus (heroes outside a group, or alone, get 0). */
export function bondBonuses(state: GameState, deployed: readonly HeroId[]): Map<HeroId, number> {
  const groups = challengeOf(state).bondGroups
  const count = new Map<string, number>()
  for (const id of deployed) {
    const g = state.heroes[id]?.bondGroup
    if (g && groups[g]) count.set(g, (count.get(g) ?? 0) + 1)
  }
  const out = new Map<HeroId, number>()
  for (const id of deployed) {
    const g = state.heroes[id]?.bondGroup
    if (!g || !groups[g]) continue
    const pct = setBonusFor(count.get(g) ?? 0, groups[g]!.members.length)
    if (pct > 0) out.set(id, pct)
  }
  return out
}

const SCALED: (keyof DerivedStats)[] = ['maxHP', 'pAtk', 'mAtk', 'pDef', 'mDef']

/** A unit with its HP/attack/defence raised by `pct` (current HP keeps its share). */
export function boostUnit(u: CombatUnit, pct: number): CombatUnit {
  if (pct <= 0) return u
  const stats = { ...u.stats }
  for (const k of SCALED) stats[k] = Math.round(stats[k] * (1 + pct))
  const currentHP = u.currentHP >= u.stats.maxHP ? stats.maxHP : Math.round(u.currentHP * (1 + pct))
  return { ...u, stats, currentHP }
}

/**
 * The tower's hook at unit build: bond set bonuses, plus (on the tower's own floors) the
 * Cursed Shrine's blessing for the floor it was bought for. PURE.
 */
export function applyPartyBonuses(units: CombatUnit[], state: GameState, opts: { blessing?: boolean } = {}): CombatUnit[] {
  const ids = units.map((u) => u.sourceHeroId).filter((id): id is HeroId => id !== undefined)
  const bonds = bondBonuses(state, ids)
  const b = challengeOf(state).blessing
  const bless = opts.blessing !== false && b !== null && b.floor === state.tower.currentFloor ? b.pct : 0
  if (bonds.size === 0 && bless === 0) return units
  return units.map((u) => (u.sourceHeroId === undefined ? u : boostUnit(u, (bonds.get(u.sourceHeroId) ?? 0) + bless)))
}

/** How much harder `mourner` grieves `fallen` (bond siblings grieve ×griefMult). */
export function bondGriefMult(state: GameState, fallen: HeroId, mourner: HeroId): number {
  const a = state.heroes[fallen]?.bondGroup
  return a && a === state.heroes[mourner]?.bondGroup ? B.griefMult : 1
}
