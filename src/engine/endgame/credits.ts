/**
 * The credits (lane O): who the epilogue's roll names, read straight off the save. The
 * fallen are exactly the Memorial's graves (battle, synthesis and captors alike: every
 * hero this world took), in the order they fell; the survivors are the living roster; the
 * legends are the fallen of earlier worlds. PURE.
 */
import type { FallenRecord, GameState, Legend, OwnedHero, WorldFate } from '../types'
import { endgameOf, fateOf } from './endgame'

export interface CreditsStats {
  cycle: number
  fate: WorldFate | null
  /** World-day the fate was sealed (null before F90). */
  day: number | null
  highestCleared: number
  /** Every hero who ever answered the crystal (the starter and every summon). */
  heroesCalled: number
  summons: number
  fallen: number
  survivors: number
  truths: number
  masterLevel: number
}

export interface Credits {
  fallen: FallenRecord[]
  survivors: OwnedHero[]
  legends: Legend[]
  stats: CreditsStats
}

/** The roll for this world. */
export function creditsOf(state: GameState): Credits {
  const eg = endgameOf(state)
  const fallen = [...(state.life?.memorial ?? [])].sort((a, b) => a.day - b.day || a.floor - b.floor || (a.heroId < b.heroId ? -1 : a.heroId > b.heroId ? 1 : 0))
  const survivors = (Object.values(state.heroes) as OwnedHero[])
    .filter((h) => h.alive)
    .sort((a, b) => b.star - a.star || b.xp.level - a.xp.level || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const g = state.gacha
  return {
    fallen,
    survivors,
    legends: [...eg.legends].sort((a, b) => a.cycle - b.cycle || a.day - b.day),
    stats: {
      cycle: eg.cycle,
      fate: fateOf(state),
      day: eg.fate?.day ?? null,
      highestCleared: state.tower.highestCleared,
      heroesCalled: state.consumedHeroIds.length,
      summons: (g.pullCount ?? 0) + (g.advPullCount ?? 0),
      fallen: fallen.length,
      survivors: survivors.length,
      truths: state.tower.hiddenFound.length,
      masterLevel: state.meta.masterLevel,
    },
  }
}
