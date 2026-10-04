/**
 * The New Cycle (lane O): once this world's fate is sealed at F90, the Master may begin
 * again on a fresh, harder world. Tell's last word foreshadows it ("Back to the first
 * floor. I will write you a new world.").
 *
 * What carries over, exactly (and nothing else):
 *  - the Master: level and XP, minigame skills, the login streak, the simulated wallet and
 *    monthly pass (money spent is never lost), and the gems in hand;
 *  - the Enemy Codex (the Master remembers every foe);
 *  - the onboarding steps already learned (`step:` guide keys; the free tutorial pull comes
 *    again, the story of the new world is new);
 *  - the guild membership and the PvP rating;
 *  - the legends: the fallen of the world just finished (statues first, then the deepest),
 *    added to the legends of the worlds before it;
 *  - the history of every finished world, and the cycle counter (+1).
 *
 * Everything else — heroes, gold, materials, gear, buildings, the tower — starts fresh, on
 * a world whose tower is harder by `ENDGAME.cycle.powerStep` per cycle (`cycleMult`).
 * The new world's seed is derived from the old one, so the cycle replays deterministically.
 * PURE.
 */
import type { CycleRecord, FallenRecord, GameState, Legend } from '../types'
import { createAccount } from '../account/account'
import { defaultLifeState } from '../life/life'
import { hash } from '../rng/rng'
import { endgameOf, fateOf } from './endgame'
import { ENDGAME } from './tuning'

/** Why a New Cycle can't begin now, or null. */
export function newCycleRefusal(state: GameState): string | null {
  if (fateOf(state) === null) return 'This world has not reached its end: the ninetieth floor decides it first.'
  return null
}

/** The fallen of this world who become legends of the next (statues first, then the deepest). */
export function legendsOf(state: GameState, cycle: number): Legend[] {
  const statues = new Set<string>(state.estate?.statues ?? [])
  const graves: FallenRecord[] = [...(state.life?.memorial ?? [])]
  const ranked = graves
    .map((g) => ({ ...g, cycle, statue: statues.has(g.heroId) }))
    .sort((a, b) => Number(b.statue) - Number(a.statue) || Math.max(b.bestFloor, b.floor) - Math.max(a.bestFloor, a.floor) || a.day - b.day || (a.heroId < b.heroId ? -1 : 1))
  return ranked.slice(0, ENDGAME.cycle.legendsCarried)
}

/** The record of the world just finished. */
export function cycleRecord(state: GameState): CycleRecord {
  const eg = endgameOf(state)
  const living = Object.values(state.heroes).filter((h) => h.alive).length
  return {
    cycle: eg.cycle,
    fate: fateOf(state)!,
    day: eg.fate?.day ?? 0,
    highestCleared: state.tower.highestCleared,
    fallen: (state.life?.memorial ?? []).length,
    survivors: living,
    truths: state.tower.hiddenFound.length,
    masterLevel: state.meta.masterLevel,
  }
}

/** Begin the next world. Throws `newCycle: …` when the fate is not sealed. */
export function newCycle(state: GameState): GameState {
  const refusal = newCycleRefusal(state)
  if (refusal !== null) throw new Error(`newCycle: ${refusal}`)
  const eg = endgameOf(state)
  const cycle = eg.cycle + 1
  const nowWorld = state.meta.lastSeenAtWorld
  const fresh = createAccount(hash(state.seed, 'cycle', cycle), { accountId: state.accountId, worldGrade: state.worldGrade })
  const legends = [...eg.legends, ...legendsOf(state, eg.cycle)].slice(-ENDGAME.cycle.legendsMax)
  const life = defaultLifeState(nowWorld)
  const steps = (state.life?.guide?.done ?? []).filter((k) => k.startsWith('step:'))
  return {
    ...fresh,
    createdAt: state.createdAt,
    gems: state.gems,
    meta: {
      ...fresh.meta,
      masterLevel: state.meta.masterLevel,
      masterXp: state.meta.masterXp,
      lastSeenAtWorld: nowWorld,
      login: state.meta.login,
      monthly: state.meta.monthly,
      wallet: state.meta.wallet,
      skill: state.meta.skill,
    },
    pvp: { ...fresh.pvp, rating: state.pvp.rating, guild: state.pvp.guild },
    life: { ...life, guide: { ...life.guide, done: steps } },
    codex: state.codex,
    endgame: { cycle, history: [...eg.history, cycleRecord(state)], legends },
  }
}
