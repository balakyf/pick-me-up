/**
 * Layer 3 — Account lifecycle + persistence.
 *
 * Owns THE canonical GameState: how a fresh account is born (createAccount), how
 * it is serialized/restored across schema versions (saveState / loadState /
 * migrate), and the StoragePort plumbing (createStorage / MemoryStorage /
 * persist / hydrate).
 *
 * Everything here is PURE and DETERMINISTIC. The only entropy is the bootstrap
 * `entropySeed` the caller supplies; it is folded into a branded Seed via
 * makeSeed and never re-sampled. No Math.random / Date.now / new Date(): the
 * `now` timestamps are caller-supplied (display only) and default to 0.
 *
 * The starter grant is canon (Layer 3 bootstrap): a fresh account owns exactly
 * one hero — the 'islat_han' cameo (Islat Han, 1★, classless) — auto-placed in
 * the party. Minting the starter does NOT touch the gacha sub-stream: pity and
 * pullCount both stay 0 (the starter is a gift, not a pull).
 */

import { TUNING } from '../tuning'
import type {
  GameState,
  SaveEnvelope,
  WorldGrade,
  HeroId,
  OwnedHero,
  Line,
  StoragePort,
  HeroTemplate,
} from '../types'
import { makeSeed } from '../rng/rng'
import { buildOwnedHeroFromTemplate } from '../gacha'
import { CAMEO_HEROES } from '../content'
import { toWorldTime } from '../time'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** The canon starter cameo template id (Islat Han / Han Seojin / Loki). */
const STARTER_TEMPLATE_ID = 'islat_han'

/** The HeroId allocated to the starter. Deterministic — the starter is never a
 *  gacha draw, so its id is fixed rather than rng-allocated. */
const STARTER_HERO_ID = 'h_000001' as HeroId

/** Default persistence key. Versioned so a future schema can migrate in place. */
export const DEFAULT_SAVE_KEY = 'pmu.save.v1'

/** Typed error thrown by loadState on malformed / incompatible saves. */
export class SaveLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SaveLoadError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createAccount — the canonical fresh GameState
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateAccountOpts {
  accountId?: string
  worldGrade?: WorldGrade
  /** Display-only creation timestamp; never feeds RNG. Defaults to 0. */
  now?: number
}

/** Locate the starter cameo template; the canon set is guaranteed to contain it. */
function findStarterTemplate(): HeroTemplate {
  const template = CAMEO_HEROES.find((t) => t.templateId === STARTER_TEMPLATE_ID)
  if (template === undefined) {
    throw new SaveLoadError(
      `createAccount: starter template '${STARTER_TEMPLATE_ID}' not found in CAMEO_HEROES`,
    )
  }
  return template
}

/**
 * Build a brand-new account's GameState (Layer 3 bootstrap). PURE: a given
 * (entropySeed, opts) always yields a deep-equal GameState.
 *
 * Grants exactly one hero (the starter cameo), auto-placed into party slot 0 on
 * the front line. The starter mint does NOT advance the gacha sub-stream
 * (pity / pullCount stay 0) — it is a gift, not a pull.
 */
export function createAccount(entropySeed: number, opts?: CreateAccountOpts): GameState {
  const seed = makeSeed(entropySeed)

  const template = findStarterTemplate()
  const starter: OwnedHero = buildOwnedHeroFromTemplate(template, STARTER_HERO_ID)

  // Auto-place the starter into slot 0; the other four slots are empty.
  const slots: (HeroId | null)[] = [STARTER_HERO_ID, null, null, null, null]
  const lines: Line[] = ['front', 'front', 'mid', 'back', 'back']

  return {
    schemaVersion: TUNING.account.schemaVersion,
    accountId: opts?.accountId ?? TUNING.account.defaultAccountId,
    seed,
    worldGrade: opts?.worldGrade ?? 'C',
    createdAt: opts?.now ?? 0,
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
    heroes: { [STARTER_HERO_ID]: starter },
    consumedHeroIds: [STARTER_HERO_ID],
    usedNames: [],
    consumedTemplateIds: [STARTER_TEMPLATE_ID],
    party: { slots, lines },
    tower: { currentFloor: 1, highestCleared: 0, attemptIndex: 0 },
    gacha: { pity: 0, pullCount: 0 },
    rng: { combatCounter: 0 },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Save / load / migrate
// ─────────────────────────────────────────────────────────────────────────────

/** Serialize a GameState into a versioned SaveEnvelope JSON string. */
export function saveState(state: GameState, now?: number): string {
  const envelope: SaveEnvelope = {
    schemaVersion: TUNING.account.schemaVersion,
    savedAt: now ?? 0,
    state,
  }
  return JSON.stringify(envelope)
}

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

/**
 * Migrate a SaveEnvelope from `fromVersion` up to the current schema version.
 * Identity when already current; otherwise apply each version's upgrade step in
 * sequence (v1 → v2 → …). An older version with no registered path is rejected.
 */
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

/** Shape-check the minimum fields a GameState must carry to be load-safe. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function assertGameStateShape(state: unknown): asserts state is GameState {
  if (!isPlainObject(state)) {
    throw new SaveLoadError('loadState: envelope.state is missing or not an object')
  }
  const required = [
    'schemaVersion',
    'accountId',
    'seed',
    'worldGrade',
    'createdAt',
    'gold',
    'gems',
    'materials',
    'meta',
    'facilities',
    'dailies',
    'heroes',
    'consumedHeroIds',
    'usedNames',
    'consumedTemplateIds',
    'party',
    'tower',
    'gacha',
    'rng',
  ] as const
  for (const key of required) {
    if (!(key in state)) {
      throw new SaveLoadError(`loadState: state is missing required field '${key}'`)
    }
  }
}

/**
 * Parse a SaveEnvelope JSON string back into a GameState. Throws a typed
 * SaveLoadError on unparseable JSON, a malformed envelope, or a state missing
 * required fields. Runs migrate, then re-brands the seed via makeSeed.
 */
export function loadState(json: string): GameState {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new SaveLoadError('loadState: input is not valid JSON')
  }

  if (!isPlainObject(parsed)) {
    throw new SaveLoadError('loadState: envelope is not an object')
  }
  if (typeof parsed.schemaVersion !== 'number') {
    throw new SaveLoadError('loadState: envelope is missing a numeric schemaVersion')
  }
  if (!('state' in parsed)) {
    throw new SaveLoadError('loadState: envelope is missing state')
  }

  const migrated = migrate(parsed as unknown as SaveEnvelope, parsed.schemaVersion)

  const state = migrated.state
  assertGameStateShape(state)

  // Re-apply the Seed brand so the in-memory value carries the brand again
  // (JSON.parse strips it to a plain number).
  return { ...state, seed: makeSeed(state.seed as unknown as number) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage plumbing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrap a StoragePort backend. The slice has no cross-cutting concern to inject,
 * so this is a transparent pass-through — it returns the backend as-is, letting
 * callers depend on a single factory seam for future decoration (logging, etc.).
 */
export function createStorage(backend: StoragePort): StoragePort {
  return backend
}

/** In-memory StoragePort backed by a Map. Used by tests and headless runs where
 *  no real localStorage exists. */
export class MemoryStorage implements StoragePort {
  private readonly map = new Map<string, string>()

  read(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }

  write(key: string, value: string): void {
    this.map.set(key, value)
  }

  clear(key: string): void {
    this.map.delete(key)
  }
}

/** Serialize and write a GameState under `key`. */
export function persist(
  storage: StoragePort,
  state: GameState,
  key: string = DEFAULT_SAVE_KEY,
  now?: number,
): void {
  storage.write(key, saveState(state, now))
}

/** Read and deserialize a GameState from `key`; null if nothing is stored. */
export function hydrate(storage: StoragePort, key: string = DEFAULT_SAVE_KEY): GameState | null {
  const json = storage.read(key)
  return json !== null ? loadState(json) : null
}
