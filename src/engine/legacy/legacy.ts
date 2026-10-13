/**
 * Legacy of the fallen: Echoes, New Arrivals and the Memorial's plaques (spec 2026-10-12
 * S21-S23). Owner: WP5. Values live in `TUNING.legacy`.
 *
 * - A hero who falls leaves an Echo (`lifeReact` queues it in `life.legacy.pending`). The
 *   Master passes it to an heir with BEQUEATH_ECHO: +10% of the fallen's best stat, plus a
 *   skill fragment (+1 level) when the heir knows the fallen's signature skill.
 * - A battle that thins the roster below five leaves a New Arrival token; CLAIM_RECRUIT
 *   spends it on a free Normal pull of at least 2★.
 * - Every grave on the obelisk lifts the party a little ("the tower remembers").
 *
 * Randomness: stream `rngFor(state.seed, 'nemesis', heroId)` only (see records.ts).
 * Writes only under `life` and `hero.life` (plus the recruit's arrival through `summon`).
 * PURE: fresh objects, inputs never mutated.
 */
import { summon } from '../gacha'
import { addMemory, dayOfSlot, newHeroLife, slotOf } from '../life/life'
import { TUNING } from '../tuning'
import type { Echo, GameState, HeroId, HeroLife, OwnedHero, Star } from '../types'
import { echoesOf } from './echo'
import { canInherit, heirOptions } from './records'

export * from './echo'
export * from './records'

const LG = TUNING.legacy

/** Memory weight of carrying a friend's Echo (one of the strongest things a hero remembers). */
const INHERITED_WEIGHT = 85

// ─────────────────────────────────────────────────────────────────────────────
// BEQUEATH_ECHO
// ─────────────────────────────────────────────────────────────────────────────

/** Why `heirId` cannot take `fallenId`'s Echo right now (a player-facing sentence), or null. */
export function bequeathRefusal(state: GameState, fallenId: HeroId, heirId: HeroId): string | null {
  const pending = state.life.legacy.pending.find((p) => p.fallenId === fallenId)
  if (!pending) return 'That echo has already been passed on.'
  const heir = state.heroes[heirId]
  if (!heir || !heir.alive) return 'Only the living can carry an echo.'
  if (heir.captiveOf) return 'A captive cannot take an echo.'
  if (!canInherit(heir)) return 'That hero already carries all the echoes they can.'
  if (!heirOptions(state, pending).includes(heirId)) return 'That hero is not among the suggested heirs.'
  return null
}

/** BEQUEATH_ECHO: pass `fallenId`'s pending Echo to the living heir `heirId`. PURE; throws when refused. */
export function bequeathEcho(state: GameState, fallenId: HeroId, heirId: HeroId, nowWorld: number = 0): GameState {
  const why = bequeathRefusal(state, fallenId, heirId)
  if (why !== null) throw new Error(`bequeathEcho: ${why}`)
  const pending = state.life.legacy.pending.find((p) => p.fallenId === fallenId)!
  const heir = state.heroes[heirId]!
  const at = Math.max(nowWorld, state.meta.lastSeenAtWorld)
  const day = dayOfSlot(slotOf(at))

  const echo: Echo = {
    fromHeroId: pending.fallenId,
    fromName: pending.fallenName,
    stat: pending.stat,
    pct: pending.pct,
    ...(pending.skillId !== undefined ? { skillId: pending.skillId } : {}),
    at,
  }
  const src = heir.life ?? newHeroLife(day)
  const life: HeroLife = {
    ...src,
    needs: { ...src.needs },
    jobXp: { ...src.jobXp },
    doing: { ...src.doing },
    memories: [...src.memories],
    echoes: [...echoesOf(heir), echo],
  }
  addMemory(life, { kind: 'inherited', day, other: pending.fallenId, floor: pending.floor, weight: INHERITED_WEIGHT })

  const chronicle = [...state.life.chronicle, { at, kind: 'bequest' as const, heroIds: [heirId, pending.fallenId], floor: pending.floor }].slice(
    -TUNING.life.chronicleMax,
  )
  return {
    ...state,
    heroes: { ...state.heroes, [heirId]: { ...heir, life } },
    life: {
      ...state.life,
      chronicle,
      legacy: { ...state.life.legacy, pending: state.life.legacy.pending.filter((p) => p.fallenId !== fallenId) },
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAIM_RECRUIT
// ─────────────────────────────────────────────────────────────────────────────

/** Why a New Arrival cannot be claimed (a player-facing sentence), or null. */
export function recruitRefusal(state: GameState): string | null {
  return state.life.legacy.recruitTokens > 0 ? null : 'No one is waiting at the bell.'
}

/**
 * Spend a New Arrival token: one free Normal pull lifted to at least `recruit.minStar`.
 * Funded and charged like the mercy pull, so the Master's gold is unchanged. PURE; throws
 * when refused. Returns the newcomer too (for the reveal).
 */
export function claimRecruitWithHero(state: GameState): { state: GameState; hero: OwnedHero } {
  const why = recruitRefusal(state)
  if (why !== null) throw new Error(`claimRecruit: ${why}`)
  const cost = TUNING.gacha.normalCostGold
  const funded: GameState = { ...state, gold: state.gold + cost }
  const res = summon(funded, { minStar: LG.recruit.minStar as Star })
  return {
    hero: res.hero,
    state: {
      ...res.state,
      gold: state.gold,
      life: { ...res.state.life, legacy: { ...res.state.life.legacy, recruitTokens: state.life.legacy.recruitTokens - 1 } },
    },
  }
}

/** CLAIM_RECRUIT: spend a New Arrival token on a free Normal pull at minStar 2. PURE; throws when refused. */
export function claimRecruit(state: GameState, nowWorld: number = 0): GameState {
  void nowWorld
  return claimRecruitWithHero(state).state
}
