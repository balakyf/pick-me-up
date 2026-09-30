/**
 * Tests for the store command reducer + the mutable createStore wrapper.
 *
 * Vitest globals are enabled (describe/it/expect available without import).
 *
 * The bulk of the coverage targets the PURE `reduce`; createStore gets a focused
 * set around its one side effect (persistence) and its subscription plumbing.
 */

import {
  reduce,
  summonWithResult,
  attemptFloorWithResult,
  attemptDailyWithResult,
  resolveEventWithResult,
  createStore,
} from './store'
import { TUNING } from '../tuning'
import { createAccount, MemoryStorage, hydrate, DEFAULT_SAVE_KEY } from '../account'
import { summon } from '../gacha'
import { playFloor } from '../tower'
import { startPromotion, skipPromotion } from '../promotion'
import { attemptDaily } from '../daily'
import { startUpgrade, skipFacility } from '../facilities'
import { craftEquipment, equipItem, unequipItem } from '../equipment'
import { advanceTime } from '../time'
import { levelCapForStar } from '../stats'

/** The engine modules know nothing of Quanton Life; the reducer layers it on top. */
function core(s: GameState): unknown {
  const heroes: Record<string, unknown> = {}
  for (const [id, h] of Object.entries(s.heroes)) {
    const { life: _life, ...rest } = h
    heroes[id] = rest
  }
  const { life: _l, ...rest } = s
  return { ...rest, heroes }
}
import type {
  Command,
  EquipmentId,
  GameState,
  HeroId,
  Line,
  OwnedHero,
  SaveEnvelope,
  Star,
} from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A funded account that can afford several pulls (each costs 3000 gold). */
function fundedAccount(seed: number, gold = 30000): GameState {
  return { ...createAccount(seed), gold }
}

/** Recursively freeze an object so any in-place mutation throws in strict mode. */
function deepFreeze<T>(obj: T): T {
  if (obj !== null && typeof obj === 'object') {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[key])
    }
    Object.freeze(obj)
  }
  return obj
}

// ─────────────────────────────────────────────────────────────────────────────
// reduce — NEW_ACCOUNT
// ─────────────────────────────────────────────────────────────────────────────

describe('reduce — NEW_ACCOUNT', () => {
  it('creates a fresh account from null state with the canon starter', () => {
    const state = reduce(null, { type: 'NEW_ACCOUNT', seed: 42 })
    expect(Object.keys(state.heroes)).toHaveLength(1)
    const [hero] = Object.values(state.heroes) as OwnedHero[]
    expect(hero.name).toBe('Islat Han')
    expect(hero.star).toBe(1)
    expect(state.gold).toBe(TUNING.economy.startingGold)
    expect(state.tower.currentFloor).toBe(1)
  })

  it('deep-equals account.createAccount for the same seed (delegation, not reimplementation)', () => {
    const viaReduce = reduce(null, { type: 'NEW_ACCOUNT', seed: 777 })
    expect(viaReduce).toEqual(createAccount(777, { now: undefined }))
  })

  it('forwards the optional now timestamp to createdAt', () => {
    const state = reduce(null, { type: 'NEW_ACCOUNT', seed: 1, now: 12345 })
    expect(state.createdAt).toBe(12345)
  })

  it('ignores any incoming state and starts fresh', () => {
    const existing = fundedAccount(5)
    const fresh = reduce(existing, { type: 'NEW_ACCOUNT', seed: 9 })
    expect(fresh).toEqual(createAccount(9, { now: undefined }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// reduce — SUMMON
// ─────────────────────────────────────────────────────────────────────────────

describe('reduce — SUMMON', () => {
  it('deducts the Normal cost (3000) and adds exactly one hero', () => {
    const before = fundedAccount(11, 9000)
    const heroCountBefore = Object.keys(before.heroes).length
    const after = reduce(before, { type: 'SUMMON' })

    expect(after.gold).toBe(before.gold - TUNING.gacha.normalCostGold)
    expect(after.gold).toBe(9000 - 3000)
    expect(Object.keys(after.heroes)).toHaveLength(heroCountBefore + 1)
  })

  it('advances the gacha sub-stream (pullCount +1) and updates pity', () => {
    const before = fundedAccount(11, 9000)
    const after = reduce(before, { type: 'SUMMON' })
    expect(after.gacha.pullCount).toBe(before.gacha.pullCount + 1)
    // pity is either reset to 0 (3+ star) or incremented by 1 (dry) — never unchanged-from-undefined.
    expect([0, before.gacha.pity + 1]).toContain(after.gacha.pity)
  })

  it('records the new hero id in consumedHeroIds', () => {
    const before = fundedAccount(11, 9000)
    const after = reduce(before, { type: 'SUMMON' })
    const newId = Object.keys(after.heroes).find((id) => !(id in before.heroes)) as HeroId
    expect(newId).toBeDefined()
    expect(after.consumedHeroIds).toContain(newId)
  })

  it('matches gacha.summon(state).state exactly (delegation)', () => {
    const before = fundedAccount(11, 9000)
    expect(core(reduce(before, { type: 'SUMMON' }))).toEqual(core(summon(before).state))
  })

  it('throws when gold is insufficient (let gacha throw)', () => {
    const broke = { ...createAccount(11), gold: TUNING.gacha.normalCostGold - 1 }
    expect(() => reduce(broke, { type: 'SUMMON' })).toThrow()
  })

  it('throws when state is null', () => {
    expect(() => reduce(null, { type: 'SUMMON' })).toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// reduce — SET_PARTY
// ─────────────────────────────────────────────────────────────────────────────

describe('reduce — SET_PARTY', () => {
  it('updates slots and lines', () => {
    const before = createAccount(3)
    const starterId = before.party.slots[0] as HeroId
    const slots: (HeroId | null)[] = [null, starterId, null, null, null]
    const lines: Line[] = ['mid', 'front', 'back', 'back', 'mid']
    const after = reduce(before, { type: 'SET_PARTY', slots, lines })
    expect(after.party.slots).toEqual(slots)
    expect(after.party.lines).toEqual(lines)
  })

  it('copies the input arrays (does not alias the command payload)', () => {
    const before = createAccount(3)
    const slots: (HeroId | null)[] = [null, null, null, null, null]
    const lines: Line[] = ['front', 'front', 'mid', 'back', 'back']
    const after = reduce(before, { type: 'SET_PARTY', slots, lines })
    expect(after.party.slots).not.toBe(slots)
    expect(after.party.lines).not.toBe(lines)
  })

  it('leaves the rest of the state untouched', () => {
    const before = createAccount(3)
    const after = reduce(before, {
      type: 'SET_PARTY',
      slots: [null, null, null, null, null],
      lines: ['front', 'front', 'mid', 'back', 'back'],
    })
    expect(after.gold).toBe(before.gold)
    expect(after.heroes).toEqual(before.heroes)
    expect(after.tower).toEqual(before.tower)
    expect(after.gacha).toEqual(before.gacha)
  })

  it('throws when slots length != partySize', () => {
    const before = createAccount(3)
    expect(() =>
      reduce(before, {
        type: 'SET_PARTY',
        slots: [null, null, null] as (HeroId | null)[],
        lines: ['front', 'front', 'mid', 'back', 'back'],
      }),
    ).toThrow()
  })

  it('throws when lines length != partySize', () => {
    const before = createAccount(3)
    expect(() =>
      reduce(before, {
        type: 'SET_PARTY',
        slots: [null, null, null, null, null],
        lines: ['front', 'front'] as Line[],
      }),
    ).toThrow()
  })

  it('throws when state is null', () => {
    expect(() =>
      reduce(null, {
        type: 'SET_PARTY',
        slots: [null, null, null, null, null],
        lines: ['front', 'front', 'mid', 'back', 'back'],
      }),
    ).toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// reduce — ATTEMPT_FLOOR
// ─────────────────────────────────────────────────────────────────────────────

describe('reduce — ATTEMPT_FLOOR', () => {
  it('advances the tower on a win (new account, floor 1, starter party)', () => {
    const before = createAccount(7) // floor 1, starter alone — reliably clears F1
    const { result } = playFloor(before)
    expect(result.cleared).toBe(true) // sanity: this seed wins

    const after = reduce(before, { type: 'ATTEMPT_FLOOR' })
    expect(after.tower.currentFloor).toBe(before.tower.currentFloor + 1)
    expect(after.tower.highestCleared).toBe(before.tower.currentFloor)
    expect(after.tower.attemptIndex).toBe(0)
    // First clear awards gold.
    expect(after.gold).toBeGreaterThan(before.gold)
  })

  it('matches tower.playFloor(state).state exactly (delegation)', () => {
    const before = createAccount(7)
    expect(core(reduce(before, { type: 'ATTEMPT_FLOOR' }))).toEqual(core(playFloor(before).state))
  })

  it('threads the optional focus directive through to tower', () => {
    const before = createAccount(7)
    const focus = { focusEnemyId: 'e1_w0_0' }
    expect(core(reduce(before, { type: 'ATTEMPT_FLOOR', focus }))).toEqual(core(playFloor(before, focus).state))
  })

  it('throws when state is null', () => {
    expect(() => reduce(null, { type: 'ATTEMPT_FLOOR' })).toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// reduce — purity (never mutates the input)
// ─────────────────────────────────────────────────────────────────────────────

describe('reduce — purity', () => {
  it('does not mutate a deep-frozen input on SUMMON', () => {
    const before = deepFreeze(fundedAccount(11, 9000))
    let after!: GameState
    expect(() => {
      after = reduce(before, { type: 'SUMMON' })
    }).not.toThrow()
    expect(after).not.toBe(before)
  })

  it('does not mutate a deep-frozen input on SET_PARTY', () => {
    const before = deepFreeze(createAccount(3))
    let after!: GameState
    expect(() => {
      after = reduce(before, {
        type: 'SET_PARTY',
        slots: [null, null, null, null, null],
        lines: ['front', 'front', 'mid', 'back', 'back'],
      })
    }).not.toThrow()
    expect(after).not.toBe(before)
    expect(after.party).not.toBe(before.party)
  })

  it('does not mutate a deep-frozen input on ATTEMPT_FLOOR', () => {
    const before = deepFreeze(createAccount(7))
    let after!: GameState
    expect(() => {
      after = reduce(before, { type: 'ATTEMPT_FLOOR' })
    }).not.toThrow()
    expect(after).not.toBe(before)
  })

  it('returns a new object distinct from the input', () => {
    const before = createAccount(3)
    const after = reduce(before, {
      type: 'SET_PARTY',
      slots: [null, null, null, null, null],
      lines: ['front', 'front', 'mid', 'back', 'back'],
    })
    expect(after).not.toBe(before)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// side-output dispatchers
// ─────────────────────────────────────────────────────────────────────────────

describe('summonWithResult / attemptFloorWithResult', () => {
  it('summonWithResult returns the summoned hero alongside the new state', () => {
    const before = fundedAccount(11, 9000)
    const { state, hero } = summonWithResult(before)
    expect(state.gold).toBe(before.gold - TUNING.gacha.normalCostGold)
    expect(hero).toBeDefined()
    expect(state.heroes[hero.id]).toEqual(hero)
    // The state half matches reduce's SUMMON result.
    expect(state).toEqual(reduce(before, { type: 'SUMMON' }))
  })

  it('attemptFloorWithResult returns the FloorResult alongside the new state', () => {
    const before = createAccount(7)
    const { state, result } = attemptFloorWithResult(before)
    expect(result.floor).toBe(before.tower.currentFloor)
    expect(result.result.log).toBeDefined()
    expect(state).toEqual(reduce(before, { type: 'ATTEMPT_FLOOR' }))
  })

  it('attemptFloorWithResult forwards focus', () => {
    const before = createAccount(7)
    const focus = { focusEnemyId: 'e1_w0_0' }
    const { state } = attemptFloorWithResult(before, focus)
    expect(core(state)).toEqual(core(playFloor(before, focus).state))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// determinism — a mini playthrough replays identically
// ─────────────────────────────────────────────────────────────────────────────

describe('reduce — mini-playthrough determinism', () => {
  /**
   * A fixed command list driving a full little loop from a fresh account.
   * Ordering keeps every command feasible: the account starts with exactly one
   * pull's worth of gold (3000), so we clear a floor (which awards gold) before
   * the second SUMMON, and SET_PARTY is interleaved to exercise it.
   */
  const program: Command[] = [
    { type: 'NEW_ACCOUNT', seed: 20260615 },
    { type: 'SUMMON' }, // spends the starting 3000 → gold 0
    { type: 'ATTEMPT_FLOOR' }, // first clear of F1 → +300 gold
    { type: 'ATTEMPT_FLOOR' }, // clear F2 → more gold
    { type: 'ATTEMPT_FLOOR' }, // clear F3 → more gold (now affordable)
    { type: 'SET_PARTY', slots: [null, null, null, null, null], lines: ['front', 'front', 'mid', 'back', 'back'] },
    { type: 'ATTEMPT_FLOOR' }, // empty party → wipe (no advance), exercises a loss
  ]

  function run(cmds: Command[]): GameState | null {
    let state: GameState | null = null
    for (const cmd of cmds) state = reduce(state, cmd)
    return state
  }

  it('running the same command list twice yields deep-equal final state', () => {
    expect(run(program)).toEqual(run(program))
  })

  it('a different seed yields a different final state', () => {
    const other: Command[] = [{ type: 'NEW_ACCOUNT', seed: 99 }, ...program.slice(1)]
    expect(run(program)).not.toEqual(run(other))
  })

  it('intermediate steps are reproducible (gold trajectory is identical)', () => {
    function golds(cmds: Command[]): number[] {
      const out: number[] = []
      let state: GameState | null = null
      for (const cmd of cmds) {
        state = reduce(state, cmd)
        out.push(state.gold)
      }
      return out
    }
    expect(golds(program)).toEqual(golds(program))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// createStore — the mutable wrapper
// ─────────────────────────────────────────────────────────────────────────────

describe('createStore', () => {
  it('starts with null state', () => {
    const store = createStore()
    expect(store.getState()).toBeNull()
  })

  it('dispatch applies reduce, stores, and returns the new state', () => {
    const store = createStore()
    const state = store.dispatch({ type: 'NEW_ACCOUNT', seed: 1 })
    expect(store.getState()).toBe(state)
    expect(state).toEqual(createAccount(1, { now: undefined }))
  })

  it('threads state across dispatches (the held state is the reduce input)', () => {
    const store = createStore()
    store.dispatch({ type: 'NEW_ACCOUNT', seed: 1 })
    const after = store.dispatch({ type: 'SUMMON' })
    // The pull is paid out of the starting grant.
    expect(after.gold).toBe(TUNING.economy.startingGold - TUNING.gacha.normalCostGold)
    expect(Object.keys(after.heroes)).toHaveLength(2)
  })

  it('persists after dispatch and load() restores an equal state (MemoryStorage)', () => {
    const storage = new MemoryStorage()
    const store = createStore({ storage })
    const dispatched = store.dispatch({ type: 'NEW_ACCOUNT', seed: 2024 })

    // It actually wrote to the storage backend.
    expect(storage.read(DEFAULT_SAVE_KEY)).not.toBeNull()
    expect(hydrate(storage)).toEqual(dispatched)

    // A fresh store over the SAME storage restores it via load().
    const reloaded = createStore({ storage })
    expect(reloaded.getState()).toBeNull()
    const restored = reloaded.load()
    expect(restored).toEqual(dispatched)
    expect(reloaded.getState()).toEqual(dispatched)
  })

  it('persists under a custom saveKey', () => {
    const storage = new MemoryStorage()
    const store = createStore({ storage, saveKey: 'custom.save' })
    const dispatched = store.dispatch({ type: 'NEW_ACCOUNT', seed: 5 })
    expect(storage.read('custom.save')).not.toBeNull()
    expect(storage.read(DEFAULT_SAVE_KEY)).toBeNull()

    const reloaded = createStore({ storage, saveKey: 'custom.save' })
    expect(reloaded.load()).toEqual(dispatched)
  })

  it('forwards the saved timestamp through persist (savedAt defaults to 0)', () => {
    const storage = new MemoryStorage()
    const store = createStore({ storage })
    store.dispatch({ type: 'NEW_ACCOUNT', seed: 1 })
    const envelope = JSON.parse(storage.read(DEFAULT_SAVE_KEY) as string) as SaveEnvelope
    expect(envelope.savedAt).toBe(0)
  })

  it('does not persist when no storage is configured (load returns null)', () => {
    const store = createStore()
    store.dispatch({ type: 'NEW_ACCOUNT', seed: 1 })
    expect(store.load()).toBeNull()
    // load() with no storage resets current to null.
    expect(store.getState()).toBeNull()
  })

  it('notifies subscribers on dispatch and on load; unsubscribe stops notifications', () => {
    const storage = new MemoryStorage()
    const store = createStore({ storage })
    let count = 0
    const unsub = store.subscribe(() => {
      count++
    })

    store.dispatch({ type: 'NEW_ACCOUNT', seed: 1 })
    expect(count).toBe(1)

    store.load()
    expect(count).toBe(2)

    unsub()
    store.dispatch({ type: 'SUMMON' })
    expect(count).toBe(2) // no further notifications after unsubscribe
  })

  it('a full store-driven loop equals the equivalent pure reduce chain', () => {
    const program: Command[] = [
      { type: 'NEW_ACCOUNT', seed: 31337 },
      { type: 'SUMMON' },
      { type: 'ATTEMPT_FLOOR' },
    ]
    const store = createStore({ storage: new MemoryStorage() })
    let last!: GameState
    for (const cmd of program) last = store.dispatch(cmd)

    let pure: GameState | null = null
    for (const cmd of program) pure = reduce(pure, cmd)

    expect(last).toEqual(pure)
    expect(store.getState()).toEqual(pure)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// World-time clock threading + TICK
// ─────────────────────────────────────────────────────────────────────────────

describe('reduce — clock + TICK', () => {
  it('TICK advances lastSeenAtWorld to nowWorld', () => {
    const before = createAccount(1) // lastSeenAtWorld = 0
    const after = reduce(before, { type: 'TICK' }, 5000)
    expect(after.meta.lastSeenAtWorld).toBe(5000)
  })

  it('TICK is monotonic — a stale nowWorld does not move the clock back', () => {
    const a = reduce(createAccount(1), { type: 'TICK' }, 5000)
    const b = reduce(a, { type: 'TICK' }, 3000)
    expect(b.meta.lastSeenAtWorld).toBe(5000)
  })

  it('runs advanceTime before other commands (SET_PARTY carries the new clock)', () => {
    const before = createAccount(1)
    const after = reduce(
      before,
      { type: 'SET_PARTY', slots: [...before.party.slots], lines: [...before.party.lines] },
      8000,
    )
    expect(after.meta.lastSeenAtWorld).toBe(8000)
  })

  it('defaults nowWorld to 0 — existing 2-arg calls are unchanged (no-op advance)', () => {
    const before = createAccount(1)
    expect(reduce(before, { type: 'TICK' })).toBe(before) // referential no-op
  })
})

describe('createStore — clock threading', () => {
  it('dispatch converts real ms to world-time and advances the clock', () => {
    const store = createStore({ storage: new MemoryStorage() })
    store.dispatch({ type: 'NEW_ACCOUNT', seed: 1, now: 0 })
    store.dispatch({ type: 'TICK' }, 1000) // real 1000 → world 3000
    expect(store.getState()!.meta.lastSeenAtWorld).toBe(3000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Promotion commands (PROMOTE_HERO / SKIP_TIMER)
// ─────────────────────────────────────────────────────────────────────────────

/** A funded account holding one at-cap, promotable hero with ample materials. */
function promotableState(seed = 5): GameState {
  const acct = createAccount(seed)
  const star: Star = 3
  const hero: OwnedHero = {
    id: 'h_promo' as HeroId,
    name: 'Promo',
    star,
    heroClass: 'warrior',
    element: 'fire',
    baseAttrs: { str: 12, agi: 12, vit: 12, int: 12, wil: 12 },
    growthGrades: { str: 2, agi: 2, vit: 2, int: 2, wil: 2 },
    skills: [],
    portraitToken: '#fff',
    origin: 'procedural',
    xp: { level: levelCapForStar(star), xpIntoLevel: 0, heldXp: 0, atCap: true },
    alive: true,
    sanity: 100,
    promotion: null,
    equipment: { weapon: null, armor: null, accessory: null },
    training: null,
    engraving: null,
    favor: 35,
    bondTier: 1,
    ip: 0,
    gift: { last: null, streak: 0 },
    blessed: false,
    expedition: null,
    captiveOf: null,
  }
  return { ...acct, heroes: { [hero.id]: hero }, materials: { promotionStone: 999, attrStone_fire: 999 }, gems: 200 }
}

describe('reduce — PROMOTE_HERO', () => {
  it('starts the promotion (delegates to startPromotion at the world clock)', () => {
    const before = promotableState()
    const after = reduce(before, { type: 'PROMOTE_HERO', heroId: 'h_promo' as HeroId }, 0)
    expect(after).toEqual(startPromotion(before, 'h_promo' as HeroId, 0))
    expect(after.heroes['h_promo' as HeroId]!.promotion).not.toBeNull()
  })

  it('throws when the hero cannot be promoted', () => {
    const before = createAccount(1) // starter is a 1★ not at cap
    const starterId = Object.keys(before.heroes)[0] as HeroId
    expect(() => reduce(before, { type: 'PROMOTE_HERO', heroId: starterId }, 0)).toThrow()
  })
})

describe('reduce — SKIP_TIMER', () => {
  it('gem-skips an in-flight promotion (delegates to skipPromotion)', () => {
    const promoting = startPromotion(promotableState(), 'h_promo' as HeroId, 0)
    const after = reduce(promoting, { type: 'SKIP_TIMER', kind: 'promotion', id: 'h_promo' }, 0)
    expect(core(after)).toEqual(core(skipPromotion(promoting, 'h_promo' as HeroId)))
    expect(after.heroes['h_promo' as HeroId]!.star).toBe(4)
    expect(after.heroes['h_promo' as HeroId]!.promotion).toBeNull()
  })

  it('throws when skipping a promotion that is not in flight', () => {
    const before = promotableState() // promotable but not yet promoting
    expect(() => reduce(before, { type: 'SKIP_TIMER', kind: 'promotion', id: 'h_promo' }, 0)).toThrow()
  })

  it('throws on the facility kind (facility timers are not in this slice)', () => {
    const before = promotableState()
    expect(() => reduce(before, { type: 'SKIP_TIMER', kind: 'facility', id: 'kitchen' }, 0)).toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Daily Dungeon command (ATTEMPT_DAILY)
// ─────────────────────────────────────────────────────────────────────────────

/** A daily-unlocked account with a strong hero deployed (clears the floor-1 daily). */
function dailyReadyState(seed = 5): GameState {
  const acct = createAccount(seed)
  const hero: OwnedHero = {
    id: 'h_str' as HeroId,
    name: 'Crusher',
    star: 6 as Star,
    heroClass: 'warrior',
    element: 'fire',
    baseAttrs: { str: 100, agi: 100, vit: 100, int: 100, wil: 100 },
    growthGrades: { str: 10, agi: 10, vit: 10, int: 10, wil: 10 },
    skills: [],
    portraitToken: '#fff',
    origin: 'procedural',
    xp: { level: 80, xpIntoLevel: 0, heldXp: 0, atCap: false },
    alive: true,
    sanity: 100,
    promotion: null,
    equipment: { weapon: null, armor: null, accessory: null },
    training: null,
    engraving: null,
    favor: 35,
    bondTier: 1,
    ip: 0,
    gift: { last: null, streak: 0 },
    blessed: false,
    expedition: null,
    captiveOf: null,
  }
  return {
    ...acct,
    heroes: { [hero.id]: hero },
    party: { slots: [hero.id, null, null, null, null], lines: ['front', 'front', 'mid', 'back', 'back'] },
    tower: { currentFloor: 2, highestCleared: 1, attemptIndex: 0, event: null, loop: null, hiddenFound: [], worldEnded: false, worldSaved: false },
  }
}

describe('reduce — ATTEMPT_DAILY', () => {
  it('delegates to attemptDaily at the advanced world clock', () => {
    const before = dailyReadyState()
    const nowWorld = 1000
    const after = reduce(before, { type: 'ATTEMPT_DAILY' }, nowWorld)
    expect(after).toEqual(attemptDaily(advanceTime(before, nowWorld), nowWorld).state)
    expect(after.dailies.attemptsUsed).toBe(1)
  })

  it('throws when dailies are still locked (no tower progress)', () => {
    const locked = createAccount(1) // highestCleared 0
    expect(() => reduce(locked, { type: 'ATTEMPT_DAILY' }, 1000)).toThrow()
  })
})

describe('attemptDailyWithResult', () => {
  it('matches the reduce state path and surfaces the result for the same timestamp', () => {
    const before = dailyReadyState()
    const { state, result } = attemptDailyWithResult(before, 1000)
    expect(state).toEqual(reduce(before, { type: 'ATTEMPT_DAILY' }, 3000)) // real 1000 → world 3000
    expect(result.dungeon.id).toBeTruthy()
    expect(typeof result.cleared).toBe('boolean')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Facility upgrades (UPGRADE_FACILITY / SKIP_TIMER facility)
// ─────────────────────────────────────────────────────────────────────────────

/** An account with Master Level high enough to upgrade the Kitchen, well-funded. */
function upgradableState(): GameState {
  const acct = createAccount(5)
  return { ...acct, gold: 1_000_000, gems: 200, meta: { ...acct.meta, masterLevel: 5 } }
}

describe('reduce — UPGRADE_FACILITY', () => {
  it('starts the build (delegates to startUpgrade at the world clock)', () => {
    const before = upgradableState()
    const after = reduce(before, { type: 'UPGRADE_FACILITY', facility: 'kitchen' }, 0)
    expect(after).toEqual(startUpgrade(before, 'kitchen', 0))
    expect(after.facilities.kitchen.build).not.toBeNull()
  })

  it('throws when the facility is gated (level already at Master Level)', () => {
    const acct = createAccount(1) // ML 1, kitchen level 1 → gated
    expect(() => reduce(acct, { type: 'UPGRADE_FACILITY', facility: 'kitchen' }, 0)).toThrow()
  })
})

describe('reduce — SKIP_TIMER facility', () => {
  it('gem-skips an in-flight facility build (delegates to skipFacility)', () => {
    const building = startUpgrade(upgradableState(), 'kitchen', 0)
    const after = reduce(building, { type: 'SKIP_TIMER', kind: 'facility', id: 'kitchen' }, 0)
    expect(after).toEqual(skipFacility(building, 'kitchen'))
    expect(after.facilities.kitchen.level).toBe(2)
    expect(after.facilities.kitchen.build).toBeNull()
  })

  it('throws when skipping a facility with no build in flight', () => {
    expect(() => reduce(upgradableState(), { type: 'SKIP_TIMER', kind: 'facility', id: 'kitchen' }, 0)).toThrow()
  })
})

describe('reduce — SYNTHESIZE', () => {
  /** Two-hero account at the synthesis unlock Master Level. */
  function synthState(): GameState {
    const base = createAccount(42)
    const [starter] = Object.values(base.heroes) as OwnedHero[]
    const second: OwnedHero = { ...starter!, id: 'h_second' as HeroId, name: 'Second' }
    return {
      ...base,
      heroes: { [starter!.id]: starter!, [second.id]: second },
      meta: { ...base.meta, masterLevel: TUNING.lobby.synthesis.unlockMasterLevel },
    }
  }

  it('salvage renders a sacrifice into materials and permadeaths it', () => {
    const state = synthState()
    const sacId = 'h_second' as HeroId
    const after = reduce(state, { type: 'SYNTHESIZE', mode: 'salvage', survivorId: null, sacrificeIds: [sacId] })
    expect(after.heroes[sacId]!.alive).toBe(false)
    expect((after.materials['promotionStone'] ?? 0)).toBeGreaterThan(0)
  })

  it('throws when the chamber is locked (Master Level too low)', () => {
    const locked = { ...synthState(), meta: { ...synthState().meta, masterLevel: 1 } }
    expect(() =>
      reduce(locked, { type: 'SYNTHESIZE', mode: 'salvage', survivorId: null, sacrificeIds: ['h_second' as HeroId] }),
    ).toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Equipment commands (CRAFT_EQUIPMENT / EQUIP_ITEM / UNEQUIP_ITEM)
// ─────────────────────────────────────────────────────────────────────────────

/** A Smithy-unlocked, funded account (mirrors equipment.test.ts's smithAccount). */
function smithReadyState(ml = 6): GameState {
  const base = createAccount(1)
  return {
    ...base,
    gold: 999_999,
    materials: { promotionStone: 999 },
    meta: { ...base.meta, masterLevel: ml },
  }
}

describe('reduce — CRAFT_EQUIPMENT', () => {
  it('forges an item into inventory (delegates to craftEquipment)', () => {
    const before = smithReadyState(6)
    const after = reduce(before, { type: 'CRAFT_EQUIPMENT', slot: 'weapon' })
    expect(after).toEqual(craftEquipment(before, 'weapon'))
    expect(after.inventory).toHaveLength(1)
    expect(after.inventory[0]!.slot).toBe('weapon')
  })

  it('threads the command slot through (an armor command lands an armor item)', () => {
    const before = smithReadyState(6)
    const after = reduce(before, { type: 'CRAFT_EQUIPMENT', slot: 'armor' })
    expect(after.inventory[0]!.slot).toBe('armor')
  })

  it('throws when the Smithy is locked (Master Level too low)', () => {
    const locked = smithReadyState(TUNING.lobby.equipment.unlockMasterLevel - 1)
    expect(() => reduce(locked, { type: 'CRAFT_EQUIPMENT', slot: 'weapon' })).toThrow(/Smithy/)
  })

  it('throws when state is null', () => {
    expect(() => reduce(null, { type: 'CRAFT_EQUIPMENT', slot: 'weapon' })).toThrow(/existing account/)
  })
})

describe('reduce — EQUIP_ITEM / UNEQUIP_ITEM', () => {
  /** A smith-ready account holding exactly one forged weapon. */
  function withForgedWeapon(): { state: GameState; hid: HeroId; itemId: EquipmentId } {
    let state = smithReadyState(6)
    state = reduce(state, { type: 'CRAFT_EQUIPMENT', slot: 'weapon' })
    const hid = Object.keys(state.heroes)[0] as HeroId
    const itemId = state.inventory[0]!.id
    return { state, hid, itemId }
  }

  it('equips an owned item onto a hero (delegates to equipItem)', () => {
    const { state, hid, itemId } = withForgedWeapon()
    const after = reduce(state, { type: 'EQUIP_ITEM', heroId: hid, itemId })
    expect(after).toEqual(equipItem(state, hid, itemId))
    expect(after.heroes[hid]!.equipment.weapon).toBe(itemId)
  })

  it('unequips a slot back to null (delegates to unequipItem)', () => {
    const { state, hid, itemId } = withForgedWeapon()
    const equipped = reduce(state, { type: 'EQUIP_ITEM', heroId: hid, itemId })
    const after = reduce(equipped, { type: 'UNEQUIP_ITEM', heroId: hid, slot: 'weapon' })
    expect(after).toEqual(unequipItem(equipped, hid, 'weapon'))
    expect(after.heroes[hid]!.equipment.weapon).toBeNull()
  })

  it('throws when equipping onto an unknown hero', () => {
    const { state, itemId } = withForgedWeapon()
    expect(() =>
      reduce(state, { type: 'EQUIP_ITEM', heroId: 'nope' as HeroId, itemId }),
    ).toThrow(/unknown hero/)
  })

  it('throws when state is null', () => {
    expect(() =>
      reduce(null, { type: 'EQUIP_ITEM', heroId: 'x' as HeroId, itemId: 'eq_1' as EquipmentId }),
    ).toThrow(/existing account/)
    expect(() =>
      reduce(null, { type: 'UNEQUIP_ITEM', heroId: 'x' as HeroId, slot: 'weapon' }),
    ).toThrow(/existing account/)
  })
})

describe('reduce — Layer 1 completion commands', () => {
  it('SUMMON { pool: advanced, count: 10 } pays gems once and adds ten heroes', () => {
    const s0 = { ...createAccount(3), gems: TUNING.gacha.advanced.tenPullGems }
    const s1 = reduce(s0, { type: 'SUMMON', pool: 'advanced', count: 10 })
    expect(s1.gems).toBe(0)
    expect(Object.keys(s1.heroes).length).toBe(Object.keys(s0.heroes).length + 10)
  })

  it('a bare SUMMON is still one Normal pull', () => {
    const s0 = createAccount(3)
    expect(core(reduce(s0, { type: 'SUMMON' }))).toEqual(core(summon(s0).state))
  })

  it('TRANSFER_SKILL and FUSE_SKILL route to the Transfer Station', () => {
    const base = createAccount(4)
    const starter = Object.keys(base.heroes)[0] as HeroId
    const other = { ...base.heroes[starter]!, id: 'h_other' as HeroId, name: 'Other', skills: [] }
    const s0: GameState = {
      ...base,
      gold: 100_000,
      heroes: { ...base.heroes, [other.id]: other },
      facilities: { ...base.facilities, transferStation: { level: 1, build: null } },
    }
    const s1 = reduce(s0, { type: 'TRANSFER_SKILL', donorId: starter, recipientId: other.id, skillId: 'berserk' })
    expect(s1.heroes[other.id]!.skills.map((s) => s.id)).toEqual(['berserk'])
    expect(() => reduce(s1, { type: 'FUSE_SKILL', heroId: other.id, result: 'exceed' })).toThrow(/fuseSkill/)
  })
})

describe('reduce — RESOLVE_EVENT', () => {
  it('closes the open event and applies its option; resolveEventWithResult reports it', () => {
    const base = createAccount(8)
    const s0: GameState = { ...base, tower: { ...base.tower, event: { kind: 'bonus', floor: 5, options: ['rest', 'treasure', 'merchant', 'gamble'] } } }
    const s1 = reduce(s0, { type: 'RESOLVE_EVENT', option: 'treasure' })
    expect(s1.tower.event).toBeNull()
    expect(s1.gold).toBeGreaterThan(s0.gold)
    const r = resolveEventWithResult(s0, 'treasure')
    expect(r.state).toEqual(s1)
    expect(r.outcome.option).toBe('treasure')
  })
})

describe('reduce — Layer 3 commands', () => {
  it('route gifts, logins, packages and the crack through the reducer', () => {
    const base = createAccount(9)
    const id = Object.keys(base.heroes)[0] as HeroId
    let s = reduce({ ...base, gold: 10_000 }, { type: 'GIVE_GIFT', heroId: id, giftId: 'honey_cake' })
    expect(s.heroes[id]!.gift.last).toBe('honey_cake')
    s = reduce(s, { type: 'CLAIM_LOGIN' })
    expect(s.meta.login.streak).toBe(1)
    s = reduce(s, { type: 'BUY_PACKAGE', packageId: 'pouch' })
    expect(s.meta.wallet.purchases.pouch).toBe(1)
    expect(() => reduce(s, { type: 'OPEN_CRACK' })).toThrow(/Master Lv 20/)
    expect(() => reduce(s, { type: 'INTERVENE', heroId: id, action: 'peek' })).toThrow(/Devoted/)
  })
})
