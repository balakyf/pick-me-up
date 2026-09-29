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
  HeroId,
  FacilityId,
  FloorResult,
  FocusDirective,
  StoragePort,
  EquipmentId,
} from '../types'
import { createAccount, persist, hydrate, DEFAULT_SAVE_KEY } from '../account'
import { summon, summonMany } from '../gacha'
import { transferSkill, fuseSkill } from '../transfer'
import { resolveEvent, type EventOutcome } from '../events'
import { giveGift } from '../favor'
import { intervene } from '../intervention'
import { upgradeEquipment } from '../minigames'
import { buyPackage, claimLogin, claimMonthly } from '../shop'
import { openCrack, dispatchRuins } from '../rift'
import {
  raidRival,
  ransomHero,
  counterRaid,
  releaseCaptive,
  synthesizeCaptive,
  setDefense,
  joinGuild,
  leaveGuild,
  claimGuildAid,
  guildRaid,
  serverWar,
} from '../pvp'
import { playFloor } from '../tower'
import { banquet } from '../kitchen'
import { startPromotion, skipPromotion } from '../promotion'
import { synthesize } from '../synthesis'
import { craftEquipment, equipItem, unequipItem } from '../equipment'
import { startUpgrade, skipFacility } from '../facilities'
import { startTraining, skipTraining } from '../training'
import { attemptDaily, type DailyResult } from '../daily'
import { advanceTime, toWorldTime } from '../time'
import { assignJob, lifeOf, lifeReact } from '../life'

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
  // Quanton Life: the waiting room reacts to what changed (graves, grief, memories).
  if (cmd.type === 'ATTEMPT_FLOOR') {
    const current = advanceTime(requireState(state, cmd.type), nowWorld)
    if (current.meta.deleted) throw new Error('reduce: this waiting room has greyed and been deleted — start a new Master')
    const r = playFloor(current, cmd.focus, cmd.ballista, cmd.subvert)
    return lifeReact(state, r.state, cmd, nowWorld, r.result)
  }
  return lifeReact(state, reduceCore(state, cmd, nowWorld), cmd, nowWorld)
}

function reduceCore(state: GameState | null, cmd: Command, nowWorld: number): GameState {
  if (cmd.type === 'NEW_ACCOUNT') return createAccount(cmd.seed, { now: cmd.now })

  // Every other command acts on an existing account, with world-time advanced first.
  const current = advanceTime(requireState(state, cmd.type), nowWorld)
  // A deleted account (six months at zero PI) only keeps its clock running.
  if (current.meta.deleted && cmd.type !== 'TICK') {
    throw new Error('reduce: this waiting room has greyed and been deleted — start a new Master')
  }

  switch (cmd.type) {
    case 'SUMMON':
      return summonMany(current, cmd.pool ?? 'normal', cmd.count ?? 1).state

    case 'SET_PARTY': {
      validateParty(cmd.slots, cmd.lines)
      return { ...current, party: { slots: [...cmd.slots], lines: [...cmd.lines] } }
    }

    case 'ATTEMPT_FLOOR':
      return playFloor(current, cmd.focus, cmd.ballista, cmd.subvert).state

    case 'TICK':
      return current

    case 'BANQUET':
      return banquet(current)

    case 'PROMOTE_HERO':
      return startPromotion(current, cmd.heroId, nowWorld)

    case 'UPGRADE_FACILITY':
      return startUpgrade(current, cmd.facility, nowWorld)

    case 'SKIP_TIMER':
      return cmd.kind === 'promotion'
        ? skipPromotion(current, cmd.id as HeroId)
        : cmd.kind === 'training'
          ? skipTraining(current, cmd.id as HeroId)
          : skipFacility(current, cmd.id as FacilityId)

    case 'TRAIN_SKILL':
      return startTraining(current, cmd.heroId, cmd.skillId, nowWorld)

    case 'ATTEMPT_DAILY':
      return attemptDaily(current, nowWorld).state

    case 'SYNTHESIZE':
      return synthesize(current, cmd, nowWorld)

    case 'CRAFT_EQUIPMENT':
      return craftEquipment(current, cmd.slot)

    case 'EQUIP_ITEM':
      return equipItem(current, cmd.heroId, cmd.itemId)

    case 'UNEQUIP_ITEM':
      return unequipItem(current, cmd.heroId, cmd.slot)

    case 'TRANSFER_SKILL':
      return transferSkill(current, cmd.donorId, cmd.recipientId, cmd.skillId)

    case 'FUSE_SKILL':
      return fuseSkill(current, cmd.heroId, cmd.result)

    case 'RESOLVE_EVENT':
      return resolveEvent(current, cmd.option).state

    case 'GIVE_GIFT':
      return giveGift(current, cmd.heroId, cmd.giftId)

    case 'INTERVENE':
      return intervene(current, cmd.heroId, cmd.action)

    case 'UPGRADE_EQUIPMENT':
      return upgradeEquipment(current, cmd.itemId, cmd.performance).state

    case 'BUY_PACKAGE':
      return buyPackage(current, cmd.packageId, nowWorld)

    case 'CLAIM_LOGIN':
      return claimLogin(current, nowWorld)

    case 'CLAIM_MONTHLY':
      return claimMonthly(current, nowWorld)

    case 'OPEN_CRACK':
      return openCrack(current, nowWorld)

    case 'DISPATCH_RUINS':
      return dispatchRuins(current, cmd.heroIds, nowWorld)

    case 'SET_DEFENSE':
      return setDefense(current, cmd.slots)

    case 'RAID_RIVAL':
      return raidRival(current, cmd.rivalId, nowWorld).state

    case 'RANSOM_HERO':
      return ransomHero(current, cmd.heroId)

    case 'COUNTER_RAID':
      return counterRaid(current, cmd.heroId, nowWorld).state

    case 'RELEASE_CAPTIVE':
      return releaseCaptive(current, cmd.captiveId)

    case 'SYNTHESIZE_CAPTIVE':
      return synthesizeCaptive(current, cmd.captiveId, cmd.survivorId)

    case 'JOIN_GUILD':
      return joinGuild(current, cmd.guildId)

    case 'LEAVE_GUILD':
      return leaveGuild(current)

    case 'CLAIM_GUILD_AID':
      return claimGuildAid(current, nowWorld)

    case 'GUILD_RAID':
      return guildRaid(current, nowWorld).state

    case 'SERVER_WAR':
      return serverWar(current, nowWorld).state

    case 'ASSIGN_JOB':
      return assignJob(current, cmd.heroId, cmd.job, lifeOf)

    case 'SET_FORGE_ORDER':
      return { ...current, life: { ...current.life, forge: { ...current.life.forge, order: cmd.order } } }

    case 'READ_LETTER':
      return {
        ...current,
        life: {
          ...current.life,
          letterReadAt: Math.max(nowWorld, current.meta.lastSeenAtWorld),
          tally: { jobGold: 0, meals: 0, forged: 0, trainXp: 0, research: 0, healed: 0 },
        },
      }

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
  const r = summon(state)
  const next = lifeReact(state, r.state, { type: 'SUMMON' }, 0)
  return { state: next, hero: next.heroes[r.hero.id]! }
}

/**
 * Like dispatching SUMMON { pool, count }, but also returns every hero pulled (a
 * 10-pull shows ten). Throws when the batch is unaffordable.
 */
export function summonBatchWithResult(
  state: GameState,
  pool: 'normal' | 'advanced',
  count: 1 | 10,
): { state: GameState; heroes: OwnedHero[] } {
  const r = summonMany(state, pool, count)
  const next = lifeReact(state, r.state, { type: 'SUMMON', pool, count }, 0)
  return { state: next, heroes: r.heroes.map((h) => next.heroes[h.id] ?? h) }
}

/**
 * Like dispatching ATTEMPT_FLOOR through `reduce`, but also returns the
 * FloorResult (combat log, gold/XP, fallen heroes) so the UI can show the
 * outcome. Thin pass-through to tower.playFloor.
 */
export function attemptFloorWithResult(
  state: GameState,
  focus?: FocusDirective,
  ballista?: number,
  subvert?: boolean,
): { state: GameState; result: FloorResult } {
  const r = playFloor(state, focus, ballista, subvert)
  return { state: lifeReact(state, r.state, { type: 'ATTEMPT_FLOOR', focus, ballista, subvert }, 0, r.result), result: r.result }
}

/** Like RAID_RIVAL, but also returns the raid's outcome (loot, captive, battle log). */
export function raidWithResult(state: GameState | null, rivalId: string, nowReal = 0) {
  const nowWorld = toWorldTime(nowReal)
  return raidRival(advanceTime(requireState(state, 'RAID_RIVAL'), nowWorld), rivalId, nowWorld)
}

/** Like GUILD_RAID / SERVER_WAR, but also returns the outcome for the UI. */
export function guildRaidWithResult(state: GameState | null, nowReal = 0) {
  const nowWorld = toWorldTime(nowReal)
  return guildRaid(advanceTime(requireState(state, 'GUILD_RAID'), nowWorld), nowWorld)
}
export function serverWarWithResult(state: GameState | null, nowReal = 0) {
  const nowWorld = toWorldTime(nowReal)
  return serverWar(advanceTime(requireState(state, 'SERVER_WAR'), nowWorld), nowWorld)
}

/**
 * Like dispatching UPGRADE_EQUIPMENT, but also reports whether the forge succeeded and
 * at what odds. Runs the same advanceTime catch-up `reduce` does.
 */
export function upgradeEquipmentWithResult(
  state: GameState | null,
  itemId: EquipmentId,
  performance?: number,
  nowReal = 0,
): { state: GameState; success: boolean; odds: number } {
  return upgradeEquipment(advanceTime(requireState(state, 'UPGRADE_EQUIPMENT'), toWorldTime(nowReal)), itemId, performance)
}

/**
 * Like dispatching ATTEMPT_DAILY through `reduce`, but also returns the
 * DailyResult (combat log + weekday rewards) for the UI. Runs the same
 * advanceTime(nowWorld) catch-up `reduce` does, so calling this and dispatching
 * ATTEMPT_DAILY with the SAME real timestamp yields identical results.
 */
export function attemptDailyWithResult(
  state: GameState | null,
  nowReal = 0,
): { state: GameState; result: DailyResult } {
  const nowWorld = toWorldTime(nowReal)
  return attemptDaily(advanceTime(requireState(state, 'ATTEMPT_DAILY'), nowWorld), nowWorld)
}

/**
 * Like dispatching RESOLVE_EVENT, but also returns what the event did (tournament
 * rounds, loot, a recruit) for the UI. Runs the same advanceTime catch-up `reduce` does.
 */
export function resolveEventWithResult(
  state: GameState | null,
  option: string,
  nowReal = 0,
): { state: GameState; outcome: EventOutcome } {
  return resolveEvent(advanceTime(requireState(state, 'RESOLVE_EVENT'), toWorldTime(nowReal)), option)
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
