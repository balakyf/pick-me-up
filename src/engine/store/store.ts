/**
 * The command reducer — the single seam the UI talks to.
 *
 * `reduce(state, cmd)` is the PURE heart: it maps a Command onto the engine's
 * pure module entry points (account.createAccount, gacha.summon, tower.playFloor)
 * and returns a fresh GameState. It NEVER mutates its input and holds NO state of
 * its own. All the engine's domain rules already live in those modules; the
 * reducer only wires them and validates the command surface (party length, the
 * "state must exist" precondition).
 *
 * `summonWithResult` / `attemptFloorWithResult` are thin pass-throughs that also
 * surface the side payload (the summoned hero / the floor result) the UI wants to
 * show — `reduce` deliberately returns only the next state.
 *
 * `createStore` is the ONE slightly-impure piece: a tiny mutable wrapper that
 * holds the current state, calls `reduce` on dispatch, persists via the injected
 * StoragePort, and notifies subscribers. Persistence is the only side effect; all
 * decisions stay in `reduce`.
 */

import { TUNING } from '../tuning'
import type {
  GameState,
  Command,
  OwnedHero,
  FloorResult,
  FocusDirective,
  StoragePort,
} from '../types'
import { createAccount, persist, hydrate, DEFAULT_SAVE_KEY } from '../account'
import { summon } from '../gacha'
import { playFloor } from '../tower'
import { banquet } from '../kitchen'
import { advanceTime, toWorldTime } from '../time'

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

/** Every command except NEW_ACCOUNT needs an existing account to act on. */
function requireState(state: GameState | null, cmd: Command['type']): GameState {
  if (state === null) {
    throw new Error(`reduce: command '${cmd}' requires an existing account, but state is null`)
  }
  return state
}

/**
 * Validate a SET_PARTY payload. The roster is a FIXED-WIDTH lineup: exactly
 * `partySize` slots, each paired with a line. We reject any other length so the
 * persisted PartyState invariant (slots.length === lines.length === 5) can never
 * be broken through the command surface.
 */
function validateParty(slots: readonly unknown[], lines: readonly unknown[]): void {
  const size = TUNING.account.partySize
  if (slots.length !== size) {
    throw new Error(`reduce: SET_PARTY slots must have length ${size} (got ${slots.length})`)
  }
  if (lines.length !== size) {
    throw new Error(`reduce: SET_PARTY lines must have length ${size} (got ${lines.length})`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// reduce — the pure reducer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply ONE Command to the current state and return the next state. PURE: the
 * input `state` is never mutated; a fresh GameState is always returned (delegated
 * to the engine modules, which themselves return fresh objects).
 *
 * `nowWorld` is the current world-time (real epoch-ms × dilation), supplied by the
 * store edge. Before every command except NEW_ACCOUNT we run a pure advanceTime()
 * catch-up so the clock is current; it defaults to 0, which is always a no-op (a
 * fresh account's lastSeenAtWorld is 0), keeping legacy 2-arg calls identical.
 *
 *   NEW_ACCOUNT   → a brand-new account (state may be null here).
 *   SUMMON        → one Mobius Summon (throws via gacha if gold is insufficient).
 *   SET_PARTY     → replace party.slots / party.lines (validated to length 5).
 *   ATTEMPT_FLOOR → resolve one attempt at the current floor (with optional focus).
 *   TICK          → no-op beyond the advanceTime() catch-up (the explicit clock pump).
 *
 * Every command but NEW_ACCOUNT requires a non-null state; a clear Error is
 * thrown otherwise.
 */
export function reduce(state: GameState | null, cmd: Command, nowWorld: number = 0): GameState {
  if (cmd.type === 'NEW_ACCOUNT') {
    return createAccount(cmd.seed, { now: cmd.now })
  }

  // Every other command acts on an existing account, with world-time advanced first.
  const current = advanceTime(requireState(state, cmd.type), nowWorld)

  switch (cmd.type) {
    case 'SUMMON':
      return summon(current).state

    case 'SET_PARTY': {
      validateParty(cmd.slots, cmd.lines)
      return { ...current, party: { slots: [...cmd.slots], lines: [...cmd.lines] } }
    }

    case 'ATTEMPT_FLOOR':
      return playFloor(current, cmd.focus).state

    case 'TICK':
      return current

    case 'BANQUET':
      return banquet(current)

    case 'ADD_GOLD':
      // Testing-only cheat: grant free gold. Not part of the real economy.
      return { ...current, gold: current.gold + cmd.amount }

    default: {
      // Exhaustiveness guard: a new Command variant must be handled here.
      const exhaustive: never = cmd
      throw new Error(`reduce: unknown command ${JSON.stringify(exhaustive)}`)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Side-output dispatchers (thin pass-throughs that surface the extra payload)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Like dispatching SUMMON through `reduce`, but also returns the summoned hero so
 * the UI can show the pull. Thin pass-through to gacha.summon — throws (via gacha)
 * if gold is insufficient.
 */
export function summonWithResult(state: GameState): { state: GameState; hero: OwnedHero } {
  return summon(state)
}

/**
 * Like dispatching ATTEMPT_FLOOR through `reduce`, but also returns the
 * FloorResult (combat log, gold/XP, fallen heroes) so the UI can show the
 * outcome. Thin pass-through to tower.playFloor.
 */
export function attemptFloorWithResult(
  state: GameState,
  focus?: FocusDirective,
): { state: GameState; result: FloorResult } {
  return playFloor(state, focus)
}

// ─────────────────────────────────────────────────────────────────────────────
// createStore — the mutable wrapper (the only stateful + side-effecting piece)
// ─────────────────────────────────────────────────────────────────────────────

export interface StoreOpts {
  /** Optional persistence backend; when present, every dispatch saves the state. */
  storage?: StoragePort
  /** Persistence key; defaults to the account module's DEFAULT_SAVE_KEY. */
  saveKey?: string
}

export interface Store {
  /** The current state, or null before the first dispatch / load. */
  getState(): GameState | null
  /** Apply a command via reduce, store + persist + notify, return the new state.
   *  `nowReal` is real epoch-ms supplied by the caller (the UI); defaults to 0. */
  dispatch(cmd: Command, nowReal?: number): GameState
  /** Register a listener; returns an unsubscribe function. */
  subscribe(fn: () => void): () => void
  /** Hydrate the current state from storage (null if nothing stored). */
  load(): GameState | null
}

/**
 * Build a small mutable store around the pure `reduce`. It holds the current
 * state, persists through the optional StoragePort after each dispatch, and
 * notifies subscribers. This is the ONLY place that performs a side effect
 * (persist); all decisions stay inside `reduce`.
 */
export function createStore(opts: StoreOpts = {}): Store {
  const storage = opts.storage
  const saveKey = opts.saveKey ?? DEFAULT_SAVE_KEY

  let current: GameState | null = null
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const fn of listeners) fn()
  }

  return {
    getState(): GameState | null {
      return current
    },

    dispatch(cmd: Command, nowReal: number = 0): GameState {
      const next = reduce(current, cmd, toWorldTime(nowReal))
      current = next
      if (storage !== undefined) {
        persist(storage, next, saveKey)
      }
      notify()
      return next
    },

    subscribe(fn: () => void): () => void {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },

    load(): GameState | null {
      const restored = storage !== undefined ? hydrate(storage, saveKey) : null
      current = restored
      notify()
      return restored
    },
  }
}
