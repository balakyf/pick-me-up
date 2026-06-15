/**
 * Tests for Layer 3 account lifecycle + persistence.
 *
 * Vitest globals are enabled (describe/it/expect available without import).
 */

import {
  createAccount,
  saveState,
  loadState,
  migrate,
  createStorage,
  MemoryStorage,
  persist,
  hydrate,
  SaveLoadError,
  DEFAULT_SAVE_KEY,
} from './account'
import { TUNING } from '../tuning'
import { makeSeed } from '../rng/rng'
import type { GameState, OwnedHero, HeroId, SaveEnvelope } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// createAccount — starter grant + defaults
// ─────────────────────────────────────────────────────────────────────────────

describe('createAccount — starter grant', () => {
  it('grants exactly ONE hero', () => {
    const acct = createAccount(1)
    expect(Object.keys(acct.heroes)).toHaveLength(1)
  })

  it('the starter is Islat Han, star 1, classless', () => {
    const acct = createAccount(1)
    const [hero] = Object.values(acct.heroes) as OwnedHero[]
    expect(hero.name).toBe('Islat Han')
    expect(hero.star).toBe(1)
    expect(hero.heroClass).toBeNull()
    expect(hero.origin).toBe('cameo')
    expect(hero.alive).toBe(true)
    expect(hero.xp).toEqual({ level: 1, xpIntoLevel: 0, heldXp: 0, atCap: false })
  })

  it("the starter's id is in consumedHeroIds and 'islat_han' in consumedTemplateIds", () => {
    const acct = createAccount(1)
    const [hero] = Object.values(acct.heroes) as OwnedHero[]
    expect(acct.consumedHeroIds).toContain(hero.id)
    expect(acct.consumedTemplateIds).toContain('islat_han')
  })

  it('auto-places the starter into party.slots[0] on the front line', () => {
    const acct = createAccount(1)
    const [hero] = Object.values(acct.heroes) as OwnedHero[]
    expect(acct.party.slots[0]).toBe(hero.id)
    expect(acct.party.slots.slice(1)).toEqual([null, null, null, null])
    expect(acct.party.lines).toEqual(['front', 'front', 'mid', 'back', 'back'])
    expect(acct.party.lines[0]).toBe('front')
  })

  it('uses a fixed deterministic starter HeroId h_000001', () => {
    const acct = createAccount(42)
    expect(acct.party.slots[0]).toBe('h_000001')
    expect(acct.heroes['h_000001' as HeroId]).toBeDefined()
    expect(acct.consumedHeroIds).toEqual(['h_000001'])
  })
})

describe('createAccount — defaults', () => {
  it('applies canon defaults', () => {
    const acct = createAccount(1)
    expect(acct.accountId).toBe('46631913')
    expect(acct.accountId).toBe(TUNING.account.defaultAccountId)
    expect(acct.worldGrade).toBe('C')
    expect(acct.gold).toBe(3000)
    expect(acct.gold).toBe(TUNING.economy.startingGold)
    expect(acct.tower.currentFloor).toBe(1)
    expect(acct.tower.highestCleared).toBe(0)
    expect(acct.tower.attemptIndex).toBe(0)
    expect(acct.gacha.pity).toBe(0)
    expect(acct.gacha.pullCount).toBe(0)
    expect(acct.rng.combatCounter).toBe(0)
    expect(acct.usedNames).toEqual([])
    expect(acct.schemaVersion).toBe(TUNING.account.schemaVersion)
    expect(acct.createdAt).toBe(0)
  })

  it('the starter mint does NOT touch pullCount or pity (both stay 0)', () => {
    const acct = createAccount(999)
    expect(acct.gacha.pity).toBe(0)
    expect(acct.gacha.pullCount).toBe(0)
  })

  it('seed is a branded makeSeed of the entropy', () => {
    const acct = createAccount(777)
    expect(acct.seed).toBe(makeSeed(777))
  })

  it('honors opts overrides', () => {
    const acct = createAccount(1, { accountId: 'abc', worldGrade: 'S', now: 12345 })
    expect(acct.accountId).toBe('abc')
    expect(acct.worldGrade).toBe('S')
    expect(acct.createdAt).toBe(12345)
  })
})

describe('createAccount — determinism', () => {
  it('createAccount(777) deep-equals createAccount(777)', () => {
    expect(createAccount(777)).toEqual(createAccount(777))
  })

  it('createAccount(777) differs from createAccount(778)', () => {
    expect(createAccount(777)).not.toEqual(createAccount(778))
  })

  it('seeds differ even though the rest of the state shape matches', () => {
    const a = createAccount(777)
    const b = createAccount(778)
    expect(a.seed).not.toBe(b.seed)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// save / load round-trip
// ─────────────────────────────────────────────────────────────────────────────

/** Mutate a deep copy of an account into a mid-game state for round-trip tests. */
function midGameOf(acct: GameState): GameState {
  const copy: GameState = JSON.parse(JSON.stringify(acct))
  copy.seed = acct.seed // re-brand after the deep copy strips it
  const fakeId = 'h_000777' as HeroId
  const fakeHero: OwnedHero = {
    id: fakeId,
    name: 'Test Dummy',
    star: 2,
    heroClass: null,
    element: 'fire',
    baseAttrs: { str: 10, agi: 8, vit: 9, int: 7, wil: 6 },
    growthGrades: { str: 3, agi: 2, vit: 3, int: 2, wil: 2 },
    skillIds: [],
    portraitToken: '#abcdef',
    origin: 'procedural',
    xp: { level: 5, xpIntoLevel: 40, heldXp: 0, atCap: false },
    alive: true,
  }
  copy.heroes[fakeId] = fakeHero
  copy.tower.currentFloor = 7
  copy.tower.highestCleared = 6
  copy.tower.attemptIndex = 2
  copy.gacha.pity = 13
  copy.gacha.pullCount = 13
  copy.gold = 0
  copy.consumedHeroIds = [...copy.consumedHeroIds, 'h_000777'].sort()
  copy.consumedTemplateIds = [...copy.consumedTemplateIds, 'dika'].sort()
  copy.usedNames = ['Test Dummy']
  copy.rng.combatCounter = 4
  return copy
}

describe('save / load round-trip', () => {
  it('round-trips a FRESH account deep-equal', () => {
    const acct = createAccount(123)
    const restored = loadState(saveState(acct))
    expect(restored).toEqual(acct)
  })

  it('round-trips a MID-GAME account deep-equal', () => {
    const mid = midGameOf(createAccount(123))
    const restored = loadState(saveState(mid))
    expect(restored).toEqual(mid)
  })

  it('preserves the branded Seed as a number value across the round-trip', () => {
    const acct = createAccount(0xdeadbeef)
    const restored = loadState(saveState(acct))
    expect(restored.seed).toBe(acct.seed)
    expect(restored.seed).toBe(makeSeed(0xdeadbeef))
  })

  it('saveState writes the current schemaVersion and the supplied savedAt', () => {
    const acct = createAccount(1)
    const envelope = JSON.parse(saveState(acct, 555)) as SaveEnvelope
    expect(envelope.schemaVersion).toBe(TUNING.account.schemaVersion)
    expect(envelope.savedAt).toBe(555)
  })

  it('saveState defaults savedAt to 0', () => {
    const envelope = JSON.parse(saveState(createAccount(1))) as SaveEnvelope
    expect(envelope.savedAt).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// loadState error handling
// ─────────────────────────────────────────────────────────────────────────────

describe('loadState — error handling', () => {
  it("loadState('{bad') throws", () => {
    expect(() => loadState('{bad')).toThrow()
  })

  it("loadState('{}') throws", () => {
    expect(() => loadState('{}')).toThrow()
  })

  it('throws a typed SaveLoadError on bad JSON', () => {
    expect(() => loadState('{bad')).toThrow(SaveLoadError)
  })

  it('throws when the envelope state is missing a required field', () => {
    const acct = createAccount(1)
    const envelope = JSON.parse(saveState(acct)) as { schemaVersion: number; savedAt: number; state: Record<string, unknown> }
    const state = envelope.state as Partial<Record<string, unknown>>
    delete state.tower
    expect(() => loadState(JSON.stringify(envelope))).toThrow(SaveLoadError)
  })

  it('throws when the envelope has no state', () => {
    expect(() => loadState(JSON.stringify({ schemaVersion: 1, savedAt: 0 }))).toThrow(SaveLoadError)
  })

  it('throws when schemaVersion is from the future', () => {
    const acct = createAccount(1)
    const envelope = JSON.parse(saveState(acct)) as SaveEnvelope
    envelope.schemaVersion = TUNING.account.schemaVersion + 1
    expect(() => loadState(JSON.stringify(envelope))).toThrow(SaveLoadError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// migrate
// ─────────────────────────────────────────────────────────────────────────────

describe('migrate', () => {
  it('is identity when fromVersion === current', () => {
    const envelope: SaveEnvelope = {
      schemaVersion: TUNING.account.schemaVersion,
      savedAt: 0,
      state: createAccount(1),
    }
    expect(migrate(envelope, TUNING.account.schemaVersion)).toBe(envelope)
  })

  it('throws for an unknown older version (empty chain in v1)', () => {
    const envelope: SaveEnvelope = {
      schemaVersion: TUNING.account.schemaVersion,
      savedAt: 0,
      state: createAccount(1),
    }
    expect(() => migrate(envelope, 0)).toThrow(SaveLoadError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// storage plumbing
// ─────────────────────────────────────────────────────────────────────────────

describe('storage — createStorage / MemoryStorage / persist / hydrate', () => {
  it('createStorage returns a usable StoragePort (pass-through)', () => {
    const backend = new MemoryStorage()
    const storage = createStorage(backend)
    storage.write('k', 'v')
    expect(storage.read('k')).toBe('v')
  })

  it('MemoryStorage read returns null for missing keys and supports clear', () => {
    const s = new MemoryStorage()
    expect(s.read('missing')).toBeNull()
    s.write('k', 'v')
    expect(s.read('k')).toBe('v')
    s.clear('k')
    expect(s.read('k')).toBeNull()
  })

  it('persist + hydrate via MemoryStorage returns an equal account', () => {
    const storage = createStorage(new MemoryStorage())
    const acct = createAccount(2024)
    persist(storage, acct)
    const restored = hydrate(storage)
    expect(restored).toEqual(acct)
  })

  it('persist + hydrate round-trips a mid-game account', () => {
    const storage = new MemoryStorage()
    const mid = midGameOf(createAccount(2024))
    persist(storage, mid)
    expect(hydrate(storage)).toEqual(mid)
  })

  it('hydrate returns null when nothing is stored (no real localStorage present)', () => {
    const storage = new MemoryStorage()
    expect(hydrate(storage)).toBeNull()
  })

  it('persist defaults to DEFAULT_SAVE_KEY and respects a custom key', () => {
    const storage = new MemoryStorage()
    const acct = createAccount(1)
    persist(storage, acct)
    expect(storage.read(DEFAULT_SAVE_KEY)).not.toBeNull()
    persist(storage, acct, 'custom.key')
    expect(hydrate(storage, 'custom.key')).toEqual(acct)
    expect(hydrate(storage, 'absent.key')).toBeNull()
  })

  it('persist forwards the savedAt timestamp', () => {
    const storage = new MemoryStorage()
    persist(storage, createAccount(1), DEFAULT_SAVE_KEY, 9000)
    const envelope = JSON.parse(storage.read(DEFAULT_SAVE_KEY) as string) as SaveEnvelope
    expect(envelope.savedAt).toBe(9000)
  })
})
