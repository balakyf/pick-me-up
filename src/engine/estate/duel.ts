/**
 * Tryout duels in the Training Yard (canon: Edith vs Usher, Velkist taking Aaron's seat).
 * The Master hosts a bout between two heroes; it is fought with the real combat engine
 * (hero A on the left, hero B on the right), but nobody dies — a duel ends at the first
 * knockdown. Both earn a little XP and bruises; the winner takes the Master's purse (a
 * small gold sink); and the pair's feelings move: rivals come out respecting each other,
 * or bitter; friends enjoy the spar.
 *
 * PURE and deterministic: the bout's seed folds the account's duel count, so the UI can
 * replay exactly the fight the reducer resolved (`duelBattle` on the same state).
 */
import { SKILLS } from '../content'
import { runBattle } from '../combat'
import { buildCombatUnit } from '../unit'
import { floatStream, hash } from '../rng'
import { applyXp, xpToNext } from '../stats'
import { TUNING } from '../tuning'
import { addMasterXp } from '../master'
import type { BattleResult, CombatUnit, DuelRecord, Encounter, GameState, HeroId, OwnedHero } from '../types'
import { addMemory, relationKey } from '../life/life'
import { personalityOf } from '../life/personality'
import { DUEL } from './constants'
import { onBounty } from './bounty'
import { isBurntOut, markAttention } from './trauma'
import { worldDay } from './weather'

const R = TUNING.life.relation

export function duelPurse(state: GameState, a: HeroId, b: HeroId): number {
  const la = state.heroes[a]?.xp.level ?? 1
  const lb = state.heroes[b]?.xp.level ?? 1
  return DUEL.purseBase + DUEL.purseLevel * (la + lb)
}

/** Tryouts left today. */
export function duelsLeft(state: GameState, nowWorld = state.meta.lastSeenAtWorld): number {
  const d = state.estate?.duels
  if (!d || d.day !== worldDay(nowWorld)) return DUEL.perDay
  return Math.max(0, DUEL.perDay - d.today)
}

function busy(state: GameState, h: OwnedHero): boolean {
  return Boolean(h.training || h.promotion || h.expedition || h.captiveOf || onBounty(state, h.id) || isBurntOut(state, h.id))
}

/** Why these two can't duel now, or null. */
export function duelRefusal(state: GameState, a: HeroId, b: HeroId): string | null {
  if (a === b) return 'A hero cannot duel themselves.'
  const ha = state.heroes[a]
  const hb = state.heroes[b]
  if (!ha || !hb || !ha.alive || !hb.alive) return 'Both duellists must be alive.'
  if (busy(state, ha) || busy(state, hb)) return 'One of them is busy elsewhere.'
  if (ha.sanity < 10 || hb.sanity < 10) return 'One of them is in no state to fight.'
  if (duelsLeft(state) <= 0) return 'No more tryouts today — the yard needs raking.'
  if (state.gold < duelPurse(state, a, b)) return 'Not enough gold for the purse.'
  return null
}

function encounterOf(units: CombatUnit[], floor: number): Encounter {
  return { floor, mission: { type: 'Duel', objectives: [{ kind: 'annihilate' }], timer: null }, waves: [{ units }], encounterContext: 'tower', label: 'duel' }
}

/** The bout itself: A as the hero side, B across the sand. */
export function duelBattle(state: GameState, a: HeroId, b: HeroId): BattleResult {
  const ha = state.heroes[a]!
  const hb = state.heroes[b]!
  const ua = buildCombatUnit(ha, 'front', SKILLS, state.inventory)
  const ub0 = buildCombatUnit(hb, 'front', SKILLS, state.inventory)
  // The opponent stands on the enemy side (no hero link: nobody's permadeath is at stake).
  const { sourceHeroId: _drop, ...rest } = ub0
  void _drop
  const ub: CombatUnit = { ...rest, side: 'enemy', targetTag: `duel_${b}` }
  const total = state.estate?.duels?.total ?? 0
  return runBattle([ua], encounterOf([ub], Math.max(1, state.tower.currentFloor)), hash(state.seed, 'duel', a, b, total))
}

/** Host the duel: pay the purse, fight, and settle what it means. Throws when refused. */
export function hostDuel(state: GameState, a: HeroId, b: HeroId, nowWorld: number): GameState {
  const refusal = duelRefusal(state, a, b)
  if (refusal) throw new Error(`hostDuel: ${refusal}`)
  const at = Math.max(nowWorld, state.meta.lastSeenAtWorld)
  const day = worldDay(at)
  const res = duelBattle(state, a, b)
  const winner: HeroId | null = res.outcome === 'win' ? a : res.outcome === 'wipe' ? b : null
  const loser = winner === a ? b : winner === b ? a : null
  const e = state.estate
  const total = e.duels?.total ?? 0

  // Feelings: rivals may come out respecting each other — or bitter.
  const key = relationKey(a, b)
  const rel = state.life.relations[key] ?? { affinity: 0, shared: 0 }
  const pa = personalityOf(state.heroes[a]!)
  const pb = personalityOf(state.heroes[b]!)
  const rnd = floatStream(state.seed, 'duel-mood', total)
  let mood: DuelRecord['mood']
  if (rel.affinity <= R.rival) {
    const grace = (pa.warmth + pb.warmth) / 2 + rnd() * 0.4 - ((pa.temper + pb.temper) / 2) * 0.5
    mood = grace > 0.35 ? 'respect' : 'bitter'
  } else {
    const sore = loser ? personalityOf(state.heroes[loser]!).temper : 0
    mood = sore > 0.65 && rnd() < 0.4 ? 'bitter' : 'friendly'
  }
  const delta = mood === 'respect' ? DUEL.respect : mood === 'bitter' ? DUEL.bitter : DUEL.friendly
  const affinity = Math.max(-100, Math.min(100, Math.round((rel.affinity + delta) * 10) / 10))

  const heroes = { ...state.heroes }
  for (const id of [a, b]) {
    const h = heroes[id]!
    const share = DUEL.xpShare + (id === winner ? DUEL.winShare : 0)
    const gain = Math.max(1, Math.round(xpToNext(h.xp.level) * share))
    const life = h.life ? { ...h.life, memories: [...h.life.memories] } : undefined
    const other = id === a ? b : a
    if (life) addMemory(life, { kind: 'duel', day, other, detail: `${winner === null ? 'draw' : winner === id ? 'won' : 'lost'}:${mood}`, weight: mood === 'friendly' ? 25 : 40 })
    heroes[id] = {
      ...h,
      xp: applyXp(h.xp, gain, h.star),
      sanity: Math.max(0, Math.round((h.sanity - DUEL.sanityCost) * 100) / 100),
      ...(life ? { life } : {}),
    }
  }
  const last: DuelRecord = { a, b, winner, day, mood }
  let attention = markAttention(e.attention ?? [], a, day, 0.5)
  attention = markAttention(attention, b, day, 0.5)
  return {
    ...state,
    gold: state.gold - duelPurse(state, a, b),
    heroes,
    life: {
      ...state.life,
      relations: { ...state.life.relations, [key]: { ...rel, affinity } },
      chronicle: [...state.life.chronicle, { at, kind: 'duel' as const, heroIds: winner === b ? [b, a] : [a, b], detail: `${winner === null ? 'draw' : 'won'}:${mood}` }].slice(
        -TUNING.life.chronicleMax,
      ),
    },
    estate: {
      ...e,
      attention,
      duels: { day, today: e.duels?.day === day ? e.duels.today + 1 : 1, total: total + 1, last },
    },
    // Judging a tryout teaches the Master a little (B21).
    meta: addMasterXp(state.meta, TUNING.lobby.master.xpPerDuel),
  }
}

