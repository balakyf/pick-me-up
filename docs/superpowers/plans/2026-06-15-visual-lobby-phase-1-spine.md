# Visual Lobby — Phase 1 (Spine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the deterministic real-time substrate for the lobby — the v2 save schema, a pure `time/` module, and a clock-threaded reducer — with zero change to existing gameplay and the determinism guard staying green.

**Architecture:** The engine stays pure; the wall clock is an *input*. The UI (Phase 2) will read `Date.now()`; here we add the seam: `reduce(state, cmd, nowWorld)` runs a pure `advanceTime()` catch-up before each command, and `store.dispatch(cmd, nowReal)` converts real→world-time and threads it in. New state fields (gems, materials, meta, facilities, dailies, per-hero sanity/promotion) are introduced as one atomic schema bump (v1→v2) with a migration. Phase 1 adds the *shape and plumbing*; later phases add the *logic* that uses them.

**Tech Stack:** TypeScript (strict), Vitest, the existing `src/engine/<domain>/` module pattern, `tuning.ts` for all constants, the `__guards/determinism` test.

**Scope note — this is Phase 1 of 6** (per spec §5: Spine → Scene+MasterLevel → Kitchen+Sanity → Promotion+materials → Daily Dungeons → Tactical+polish). Each later phase gets its own plan, authored once its predecessor lands (later code depends on these modules existing). **Deferred out of Phase 1:** all UI (the `lobby` tab, scene, the `Date.now()` read in `useGame.ts`) → Phase 2; facility-upgrade/promotion/sanity/daily *logic* → their phases. Phase 1 touches **only `src/engine/`**, so it will not collide with the uncommitted test-only `ADD_GOLD` WIP in `App.tsx`/`ui.css`/`store.ts`/`types.ts` — though that WIP touches `store.ts` and `types.ts`, so **commit or stash it before starting** to avoid a messy diff.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/engine/tuning.ts` | Modify | add `time` + `lobby` constant blocks; bump `account.schemaVersion` to 2 |
| `src/engine/types.ts` | Modify | add `FacilityId`, `MaterialId`, `FacilityState`, `MetaState`, `DailiesState`; new `GameState`/`OwnedHero` fields; `TICK` command |
| `src/engine/time/time.ts` | Create | `toWorldTime()` (real→world ms) and `advanceTime()` (pure catch-up) |
| `src/engine/time/index.ts` | Create | re-export the `time` module surface |
| `src/engine/account/account.ts` | Modify | `createAccount` initializes v2 fields; `migrate` gains a v1→v2 step; `assertGameStateShape` learns the new required keys |
| `src/engine/gacha/gacha.ts` | Modify | the two OwnedHero builders set `sanity`/`promotion` |
| `src/engine/store/store.ts` | Modify | `reduce(state, cmd, nowWorld)` runs `advanceTime` + handles `TICK`; `dispatch(cmd, nowReal)` threads the clock |
| `src/engine/time/time.test.ts` | Create | unit tests for `toWorldTime` + `advanceTime` |
| `src/engine/account/account.test.ts` | Modify | add fresh-v2-defaults + v1→v2 migration tests |
| `src/engine/store/store.test.ts` | Modify | add `TICK` + advance-before-command tests |
| various `*.test.ts` | Modify | add the two new fields to hand-built hero/state literals (compiler-pinpointed) |

---

## Task 1: Establish the v2 schema (atomic)

This change is interdependent (types ↔ constructors ↔ migration ↔ fixtures), so it lands as one task that ends green. TDD: write the new behavior tests first, then make them (and the compiler) pass.

**Files:**
- Modify: `src/engine/tuning.ts`, `src/engine/types.ts`, `src/engine/account/account.ts`, `src/engine/gacha/gacha.ts`
- Create: `src/engine/time/time.ts`, `src/engine/time/index.ts`
- Test: `src/engine/account/account.test.ts` (add), plus fixture fixes flagged by `tsc`

- [ ] **Step 1: Write the failing tests** (append to `src/engine/account/account.test.ts`)

```ts
describe('createAccount — v2 fields', () => {
  it('grants the v2 lobby/meta defaults', () => {
    const acct = createAccount(123, { now: 1000 })
    expect(acct.schemaVersion).toBe(2)
    expect(acct.gems).toBe(TUNING.lobby.startingGems)
    expect(acct.materials).toEqual({})
    expect(acct.meta.masterLevel).toBe(1)
    expect(acct.meta.masterXp).toBe(0)
    // lastSeenAtWorld is the creation time in world-time (3x dilation of now=1000).
    expect(acct.meta.lastSeenAtWorld).toBe(3000)
    expect(acct.facilities.kitchen.level).toBe(1)
    expect(acct.facilities.tacticalCenter.level).toBe(1)
    expect(acct.facilities.promotionChamber.level).toBe(0) // locked until ML3 (Phase 4)
    expect(acct.facilities.kitchen.build).toBeNull()
    expect(acct.dailies).toEqual({ attemptsUsed: 0, lastResetWorldDay: 0 })
  })

  it('gives the starter hero full Sanity and no in-progress promotion', () => {
    const acct = createAccount(123)
    const hero = Object.values(acct.heroes)[0]!
    expect(hero.sanity).toBe(TUNING.lobby.sanityMax)
    expect(hero.promotion).toBeNull()
  })
})

describe('migrate — v1 → v2', () => {
  it('upgrades a v1 save with safe defaults', () => {
    const v2 = createAccount(777, { now: 1000 })
    // Synthesize an OLD v1 save by stripping the v2-only fields and stamping v1.
    const heroesV1 = Object.fromEntries(
      Object.entries(v2.heroes).map(([id, h]) => {
        const { sanity, promotion, ...rest } = h as Record<string, unknown>
        return [id, rest]
      }),
    )
    const { gems, materials, meta, facilities, dailies, ...stateV1 } =
      v2 as unknown as Record<string, unknown>
    const v1Json = JSON.stringify({
      schemaVersion: 1,
      savedAt: 0,
      state: { ...stateV1, schemaVersion: 1, heroes: heroesV1 },
    })

    const restored = loadState(v1Json)

    expect(restored.schemaVersion).toBe(2)
    expect(restored.gems).toBe(TUNING.lobby.startingGems)
    expect(restored.facilities.promotionChamber.level).toBe(0)
    expect(restored.meta.masterLevel).toBe(1)
    expect(restored.meta.lastSeenAtWorld).toBe(3000) // toWorldTime(createdAt=1000)
    expect(restored.dailies.attemptsUsed).toBe(0)
    const hero = Object.values(restored.heroes)[0]!
    expect(hero.sanity).toBe(TUNING.lobby.sanityMax)
    expect(hero.promotion).toBeNull()
  })
})
```

Note: `loadState` is already imported in this test file via `../account`. If not, add it to the existing import.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/engine/account/account.test.ts`
Expected: FAIL — `acct.gems`/`meta`/`facilities` undefined; `migrate` throws "no migration path from version 1".

- [ ] **Step 3: Add the tuning constants** (`src/engine/tuning.ts`)

In the `account` block, change `schemaVersion: 1` to `schemaVersion: 2`. Add these two top-level blocks inside `TUNING` (e.g. after `economy`):

```ts
  time: {
    /** Real→world-time dilation (canon: 1 Earth day = 3 world days). */
    worldTimeFactor: 3,
  },

  lobby: {
    /** Fresh-account premium currency. */
    startingGems: 0,
    /** Sanity is per-hero, 0..100; heroes summon at full. */
    sanityMax: 100,
    /** Facilities present at account creation. 0 = locked / not yet built. */
    facilityStartLevels: { kitchen: 1, promotionChamber: 0, tacticalCenter: 1 },
  },
```

- [ ] **Step 4: Add the v2 types** (`src/engine/types.ts`)

Add near the domain enums:

```ts
export type FacilityId = 'kitchen' | 'promotionChamber' | 'tacticalCenter'

/** Material bucket key, e.g. 'promotionStone', 'attrStone_fire', 'rankMaterial'. */
export type MaterialId = string
```

Add the new interfaces (near `GachaState`/`RngCursors`):

```ts
export interface FacilityState {
  /** 0 = locked / not yet built. */
  level: number
  /** An in-progress upgrade; null when idle. completesAtWorld is world-time ms. */
  build: { toLevel: number; completesAtWorld: number } | null
}

export interface MetaState {
  masterLevel: number
  masterXp: number
  /** World-time ms of the last advanceTime() catch-up. */
  lastSeenAtWorld: number
}

export interface DailiesState {
  attemptsUsed: number
  /** World-day index of the last reset (floor(worldMs / worldDayMs)). */
  lastResetWorldDay: number
}
```

Add the new fields to `GameState` (after `gold: number`):

```ts
  gems: number
  materials: Record<MaterialId, number>
  meta: MetaState
  facilities: Record<FacilityId, FacilityState>
  dailies: DailiesState
```

Add to `OwnedHero` (after `alive: boolean`):

```ts
  /** 0..100; drains in the tower, regens in the lobby (Phase 3). */
  sanity: number
  /** In-progress promotion timer; null when not promoting (Phase 4). */
  promotion: { completesAtWorld: number } | null
```

Add the `TICK` command to the `Command` union:

```ts
  | { type: 'TICK' }
```

- [ ] **Step 5: Create the `time/` module** (`src/engine/time/time.ts`)

```ts
/**
 * World-time: the engine's deterministic clock. The wall clock never enters the
 * engine — callers pass real epoch-ms in, and we scale it by the canon dilation.
 * advanceTime() is the pure catch-up the store runs before each command; in the
 * spine it only advances the high-water mark, and later phases hang timer
 * completion / Sanity regen / daily resets off it.
 */
import { TUNING } from '../tuning'
import type { GameState } from '../types'

/** Convert real epoch-ms to world-time ms (canon 3× dilation). Pure. */
export function toWorldTime(realMs: number): number {
  return realMs * TUNING.time.worldTimeFactor
}

/**
 * Fast-forward the account to world-time `nowWorld`. Monotonic: never moves the
 * clock backward (a stale/smaller nowWorld is a no-op). Pure — returns the same
 * reference when nothing changes so existing reducers stay referentially stable.
 */
export function advanceTime(state: GameState, nowWorld: number): GameState {
  if (nowWorld <= state.meta.lastSeenAtWorld) return state
  return { ...state, meta: { ...state.meta, lastSeenAtWorld: nowWorld } }
}
```

Create `src/engine/time/index.ts`:

```ts
export { toWorldTime, advanceTime } from './time'
```

- [ ] **Step 6: Initialize v2 fields in `createAccount`** (`src/engine/account/account.ts`)

Add the import at the top (with the other engine imports):

```ts
import { toWorldTime } from '../time'
```

In the object `createAccount` returns, add the new fields (place `gems`…`dailies` right after `gold`):

```ts
    gold: TUNING.economy.startingGold,
    gems: TUNING.lobby.startingGems,
    materials: {},
    meta: { masterLevel: 1, masterXp: 0, lastSeenAtWorld: toWorldTime(opts?.now ?? 0) },
    facilities: {
      kitchen: { level: TUNING.lobby.facilityStartLevels.kitchen, build: null },
      promotionChamber: { level: TUNING.lobby.facilityStartLevels.promotionChamber, build: null },
      tacticalCenter: { level: TUNING.lobby.facilityStartLevels.tacticalCenter, build: null },
    },
    dailies: { attemptsUsed: 0, lastResetWorldDay: 0 },
```

- [ ] **Step 7: Set the per-hero fields in the gacha builders** (`src/engine/gacha/gacha.ts`)

In **both** `buildOwnedHeroFromTemplate` and `buildOwnedHero`, extend the returned object:

```ts
  return {
    ...hero,
    xp: { level: 1, xpIntoLevel: 0, heldXp: 0, atCap: false },
    alive: true,
    sanity: TUNING.lobby.sanityMax,
    promotion: null,
  }
```

- [ ] **Step 8: Add the v1→v2 migration** (`src/engine/account/account.ts`)

Add the import for `OwnedHero`/`GameState` if not already present (both are imported already). Add the helper above `migrate`:

```ts
/** v1 → v2: introduce the lobby/meta/economy fields with safe defaults. */
function migrateV1toV2(envelope: SaveEnvelope): SaveEnvelope {
  const s = envelope.state as unknown as Record<string, unknown>
  const oldHeroes = s.heroes as Record<string, OwnedHero>
  const heroes: Record<string, OwnedHero> = {}
  for (const [id, hero] of Object.entries(oldHeroes)) {
    heroes[id] = { ...hero, sanity: TUNING.lobby.sanityMax, promotion: null }
  }
  const createdAt = typeof s.createdAt === 'number' ? s.createdAt : 0
  return {
    schemaVersion: 2,
    savedAt: envelope.savedAt,
    state: {
      ...(s as unknown as GameState),
      schemaVersion: 2,
      heroes,
      gems: TUNING.lobby.startingGems,
      materials: {},
      meta: { masterLevel: 1, masterXp: 0, lastSeenAtWorld: toWorldTime(createdAt) },
      facilities: {
        kitchen: { level: TUNING.lobby.facilityStartLevels.kitchen, build: null },
        promotionChamber: { level: TUNING.lobby.facilityStartLevels.promotionChamber, build: null },
        tacticalCenter: { level: TUNING.lobby.facilityStartLevels.tacticalCenter, build: null },
      },
      dailies: { attemptsUsed: 0, lastResetWorldDay: 0 },
    },
  }
}
```

Replace the body of `migrate` (keep the same signature) with a stepwise chain:

```ts
export function migrate(envelope: SaveEnvelope, fromVersion: number): SaveEnvelope {
  const current = TUNING.account.schemaVersion
  if (fromVersion === current) return envelope
  if (fromVersion > current) {
    throw new SaveLoadError(
      `migrate: save schemaVersion ${fromVersion} is newer than engine ${current}`,
    )
  }
  let env = envelope
  let v = fromVersion
  if (v === 1) {
    env = migrateV1toV2(env)
    v = 2
  }
  if (v !== current) {
    throw new SaveLoadError(`migrate: no migration path from version ${fromVersion}`)
  }
  return env
}
```

Add the new keys to the `required` list in `assertGameStateShape` so a malformed v2 save is rejected:

```ts
    'gold',
    'gems',
    'materials',
    'meta',
    'facilities',
    'dailies',
    'heroes',
```

- [ ] **Step 9: Fix test fixtures the compiler flags**

Run: `npm run typecheck`
Expected: errors (TS2741 "Property 'sanity' is missing…" / "Property 'gems' is missing…") at every **hand-built** `OwnedHero` or `GameState` literal in test files. Known sites: `src/engine/unit/unit.test.ts` (`makeWarrior` and similar hero builders) and `src/engine/gacha/gacha.test.ts` (`makeState`); the compiler lists any others (e.g. in `combat.test.ts`, `tower.test.ts`, `stats.test.ts`).

For each flagged **OwnedHero literal**, add:
```ts
  sanity: 100,
  promotion: null,
```
For each flagged **GameState literal** (not those built via `createAccount`/spread, which are already correct), add:
```ts
  gems: 0,
  materials: {},
  meta: { masterLevel: 1, masterXp: 0, lastSeenAtWorld: 0 },
  facilities: {
    kitchen: { level: 1, build: null },
    promotionChamber: { level: 0, build: null },
    tacticalCenter: { level: 1, build: null },
  },
  dailies: { attemptsUsed: 0, lastResetWorldDay: 0 },
```
Repeat `npm run typecheck` until it is clean. (Snapshot-style tests that do `JSON.parse(JSON.stringify(x))` then `toEqual` compare an object to a clone of *itself* — they need no change.)

- [ ] **Step 10: Run typecheck + the full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests pass, including the new `createAccount — v2 fields` and `migrate — v1 → v2` tests and the `engine determinism guard` (the `time/` module uses only multiplication — no banned constructs).

- [ ] **Step 11: Commit**

```bash
git add src/engine/tuning.ts src/engine/types.ts src/engine/time src/engine/account/account.ts src/engine/gacha/gacha.ts src/engine/**/*.test.ts
git commit -m "feat(lobby): v2 save schema + time module (Phase 1.1)

Add the lobby/meta/economy state shape (gems, materials, meta,
facilities, dailies; per-hero sanity + promotion), a pure time/ module
(toWorldTime + advanceTime), and the v1->v2 migration. Engine-only; no
behavior change yet.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Thread the clock through reduce + store; add TICK

**Files:**
- Modify: `src/engine/store/store.ts`
- Test: `src/engine/store/store.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `src/engine/store/store.test.ts`)

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine/store/store.test.ts -t "clock"`
Expected: FAIL — `reduce` takes 2 args / has no `TICK` case; `dispatch` takes 1 arg.

- [ ] **Step 3: Update `reduce`** (`src/engine/store/store.ts`)

Add the import:
```ts
import { advanceTime, toWorldTime } from '../time'
```

Replace `reduce` with the clock-threaded version (NEW_ACCOUNT handled before the time-advance, since it has no prior state):

```ts
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

    default: {
      const exhaustive: never = cmd
      throw new Error(`reduce: unknown command ${JSON.stringify(exhaustive)}`)
    }
  }
}
```

- [ ] **Step 4: Update `dispatch` to read the clock at the (store) edge** (`src/engine/store/store.ts`)

In the `Store` interface, change the signature:
```ts
  /** Apply a command via reduce, store + persist + notify, return the new state.
   *  `nowReal` is real epoch-ms supplied by the caller (the UI); defaults to 0. */
  dispatch(cmd: Command, nowReal?: number): GameState
```

In `createStore`'s returned object, update `dispatch`:
```ts
    dispatch(cmd: Command, nowReal: number = 0): GameState {
      const next = reduce(current, cmd, toWorldTime(nowReal))
      current = next
      if (storage !== undefined) {
        persist(storage, next, saveKey)
      }
      notify()
      return next
    },
```

(Note: `store.ts` calls `toWorldTime` — a pure import — not `Date.now()`, so the determinism guard stays green. The actual `Date.now()` read is wired in the UI in Phase 2.)

- [ ] **Step 5: Run the full suite**

Run: `npm run typecheck && npm test`
Expected: clean + all green. Existing 2-arg `reduce`/`dispatch` calls still compile (params default to 0) and behave identically (`advanceTime(state, 0)` is a no-op because `createAccount` sets `lastSeenAtWorld` to `toWorldTime(0) = 0`). The determinism guard passes (`store.ts` has no `Date.now`).

- [ ] **Step 6: Commit**

```bash
git add src/engine/store/store.ts src/engine/store/store.test.ts
git commit -m "feat(lobby): thread world-time through reduce + store; add TICK (Phase 1.2)

reduce(state, cmd, nowWorld) runs a pure advanceTime() before each
command; store.dispatch(cmd, nowReal) converts real->world-time. TICK
is the explicit catch-up command. Engine stays Date.now-free.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done-When (Phase 1 acceptance)

- `npm run typecheck` clean; `npm test` all green (302 prior + the new time/migration/clock tests).
- The `engine determinism guard` test passes — no `Date.now`/`Math.random`/transcendental in `src/engine` (the clock is a parameter; the real read lands in the UI in Phase 2).
- A fresh account and a migrated v1 save both carry the full v2 shape with the documented defaults.
- No gameplay behavior changed: summon, party, and tower flows are identical (the new fields are inert until later phases).

## Self-review (done while writing)

- **Spec coverage:** matches spec §1 (time architecture) + §2 (state model, commands, migration) for the Phase-1 slice. The clock *read* (spec said "store reads Date.now") is corrected to the UI edge and deferred to Phase 2 — noted, not dropped.
- **Type consistency:** `FacilityId`, `MaterialId`, `FacilityState`, `MetaState`, `DailiesState`, and the `facilities` keys (`kitchen`/`promotionChamber`/`tacticalCenter`) are used identically in types, tuning, `createAccount`, and `migrateV1toV2`.
- **No placeholders:** every code step shows complete code; the one compiler-guided step (fixtures) specifies exact field values and the discovery command.
