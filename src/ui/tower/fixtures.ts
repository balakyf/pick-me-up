/**
 * Hand-built fixtures for the WP4 Tower UI tests (spec 2026-10-12). The climb engine
 * (WP3) is built in parallel, so these shape FloorResults, Doors, Sorties and Boon
 * events directly from the WP0 contract instead of playing floors.
 */
import { createAccount } from '../../engine/account'
import { attemptFloorWithResult } from '../../engine/store'
import type { CombatEvent, CombatLog, CombatUnitInit, FloorResult, GameState, HeroId } from '../../engine/types'

type EventBody = CombatEvent extends infer E ? (E extends unknown ? Omit<E, 'seq' | 'tick'> : never) : never

/** A tiny combat log: 2 heroes (h_a "Mira Vale", h_b "Kael Ash") against 2 goblins. */
export function fixtureLog(events: ({ tick: number } & EventBody)[]): CombatLog {
  const unit = (id: string, name: string, side: 'hero' | 'enemy'): CombatUnitInit => ({
    id,
    name,
    side,
    line: 'front',
    unitClass: null,
    element: 'fire',
    level: 5,
    maxHP: 100,
    maxSP: 10,
    cp: 100,
  })
  return {
    seed: 42,
    floor: 6,
    encounterContext: 'tower',
    unitsInit: [unit('h_a', 'Mira Vale', 'hero'), unit('h_b', 'Kael Ash', 'hero'), unit('e_1', 'Goblin', 'enemy'), unit('e_2', 'Goblin Shaman', 'enemy')],
    events: events.map((e, i) => ({ ...e, seq: i }) as CombatEvent),
    outcome: 'win',
    rngDraws: 0,
  }
}

/** A FloorResult around `log`, with overrides. */
export function fixtureResult(log: CombatLog, over: Partial<FloorResult> = {}): FloorResult {
  return {
    floor: 6,
    cleared: true,
    firstClear: true,
    goldAwarded: 480,
    xpAwarded: 35,
    materialsAwarded: {},
    fallenHeroIds: [],
    skillProgress: [],
    hiddenFound: [],
    event: null,
    loopRollback: false,
    worldEnded: false,
    refusedHeroIds: [],
    worldSaved: false,
    result: {
      outcome: log.outcome,
      ticksElapsed: 20,
      wavesCleared: 1,
      defeatedTargetTags: [],
      reachProgress: 0,
      allyHpPct: {},
      survivorHeroIds: ['h_a', 'h_b'] as HeroId[],
      fallenHeroIds: [],
      skillCasts: {},
      log,
    },
    ...over,
  }
}

/** A fresh account (seed 7: the lone starter clears F1) and its real F1 clear. */
export function clearedF1(): { before: GameState; state: GameState; result: FloorResult } {
  const before = createAccount(7)
  const { state, result } = attemptFloorWithResult(before)
  return { before, state, result }
}

/** `state` standing on F6 after clearing F5, with fields overridden. */
export function atFloor(state: GameState, tower: Partial<GameState['tower']> = {}): GameState {
  return { ...state, tower: { ...state.tower, currentFloor: 6, highestCleared: 5, event: null, ...tower } }
}
