import { describe, it, expect } from 'vitest'
import { BEFORE_IMPORT_KEY, beforeImportSave, commitImport, decodeSaveInput, encodeSaveCode, exportSaveJson, parseImport, SAVE_CODE_PREFIX, saveFileName, undoImport, type SaveStorage } from './saveTransfer'
import { createAccount, DEFAULT_SAVE_KEY, loadState } from '../../engine/account'
import { reduce } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import type { GameState } from '../../engine/types'

function played(): GameState {
  let s: GameState = { ...createAccount(77, { now: Date.UTC(2026, 9, 1) }), gold: TUNING.gacha.normalCostGold * 3 }
  for (let i = 0; i < 3; i++) s = reduce(s, { type: 'SUMMON' })
  // A name with non-ASCII letters survives the code (UTF-8 safe).
  const id = Object.keys(s.heroes)[0] as keyof GameState['heroes']
  return { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, name: 'Élodie Ñoño 🌟' } } }
}

function memStorage(init: Record<string, string> = {}): SaveStorage & { data: Record<string, string> } {
  const data = { ...init }
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) }
}

describe('save export / import', () => {
  it('an export → import round-trip equals the original state (file JSON and code)', () => {
    const s = played()
    const json = exportSaveJson(s, 123)
    const viaFile = parseImport(json)
    expect(viaFile.ok).toBe(true)
    if (viaFile.ok) expect(viaFile.state).toEqual(s)
    const code = encodeSaveCode(json)
    expect(code.startsWith(SAVE_CODE_PREFIX)).toBe(true)
    expect(decodeSaveInput(`  ${code}\n`)).toBe(json)
    const viaCode = parseImport(code)
    expect(viaCode.ok).toBe(true)
    if (viaCode.ok) {
      expect(viaCode.state).toEqual(s)
      expect(loadState(viaCode.json)).toEqual(s)
    }
  })

  it('rejects junk without writing anything', () => {
    expect(parseImport('')).toEqual({ ok: false, error: 'Paste a save code or choose a save file first.' })
    expect(parseImport('PMU1:@@@not-base64@@@').ok).toBe(false)
    expect(parseImport('{"hello": 1}')).toEqual({ ok: false, error: 'That save could not be read. Nothing was changed.' })
    const store = memStorage({ [DEFAULT_SAVE_KEY]: 'current' })
    expect(() => commitImport(store, '{"schemaVersion": 11}')).toThrow()
    expect(store.data).toEqual({ [DEFAULT_SAVE_KEY]: 'current' })
  })

  it('commitImport writes the save and keeps the replaced one aside', () => {
    const r = parseImport(exportSaveJson(played()))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const store = memStorage({ [DEFAULT_SAVE_KEY]: 'the old save' })
    commitImport(store, r.json)
    expect(store.data[BEFORE_IMPORT_KEY]).toBe('the old save')
    expect(loadState(store.data[DEFAULT_SAVE_KEY]!)).toEqual(r.state)
  })

  it('an older-schema save is migrated on import', () => {
    const s = played()
    const { rested, hardcore, stamps, ...metaV10 } = s.meta
    void rested
    void hardcore
    void stamps
    const v10 = JSON.stringify({ schemaVersion: 10, savedAt: 0, state: { ...s, schemaVersion: 10, meta: metaV10 } })
    const r = parseImport(v10)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.state.meta.stamps).toEqual({ count: TUNING.return.stamps.endowed, lastRealDay: -1 })
  })

  it('names the file after the climb', () => {
    expect(saveFileName({ ...played(), tower: { ...played().tower, highestCleared: 12 } }, Date.UTC(2026, 9, 12, 12))).toMatch(/^pick-me-up-F12-2026-10-1\d\.json$/)
  })
})

describe('import validation runs the save, not just its top-level keys (review #14)', () => {
  const now = Date.UTC(2026, 9, 12, 12)
  type Loose = Record<string, unknown>
  const fresh = () => JSON.parse(JSON.stringify(played())) as Loose
  const damages: [string, (s: Loose) => void][] = [
    ['life deleted', (s) => void delete s.life],
    ['meta emptied', (s) => void (s.meta = {})],
    ['tower emptied', (s) => void (s.tower = {})],
    ['life.unlocks dropped', (s) => void delete (s.life as Loose).unlocks],
    ['party.slots not a list', (s) => void ((s.party as Loose).slots = 'x')],
    ['a facility missing', (s) => void delete (s.facilities as Loose).kitchen],
    ['a hero missing its xp', (s) => void delete (Object.values(s.heroes as Loose)[0] as Loose).xp],
    ['a floor that is not a floor', (s) => void ((s.tower as Loose).currentFloor = 0)],
    ['the gold gone', (s) => void (s.gold = null)],
  ]

  it.each(damages)('refuses a save with %s, and commitImport writes nothing', (_name, damage) => {
    const s = fresh()
    damage(s)
    const json = JSON.stringify({ schemaVersion: TUNING.account.schemaVersion, savedAt: 0, state: s })
    expect(parseImport(json, now).ok).toBe(false)
    const store = memStorage({ [DEFAULT_SAVE_KEY]: 'current' })
    expect(() => commitImport(store, json, now)).toThrow()
    expect(store.data).toEqual({ [DEFAULT_SAVE_KEY]: 'current' })
  })

  it('still accepts an older schema the migrations fill in', () => {
    const s = played()
    const { rested, hardcore, stamps, ...metaV10 } = s.meta
    void rested
    void hardcore
    void stamps
    const { kind, doors, sortie, ...towerV10 } = s.tower
    void kind
    void doors
    void sortie
    const v10 = JSON.stringify({ schemaVersion: 10, savedAt: 0, state: { ...s, schemaVersion: 10, meta: metaV10, tower: towerV10 } })
    expect(parseImport(v10, now).ok).toBe(true)
  })

  it('refuses a save that has greyed', () => {
    const dead = { ...played(), meta: { ...played().meta, deleted: true } }
    expect(parseImport(exportSaveJson(dead), now)).toEqual({ ok: false, error: 'That save has greyed and cannot be restored.' })
  })
})

describe('the save an import replaced can be brought back (review #16)', () => {
  const now = Date.UTC(2026, 9, 12, 12)
  const acct = (seed: number, gold: number) => exportSaveJson({ ...createAccount(seed, { now: Date.UTC(2026, 9, 1) }), gold })

  it('a second import in a row keeps the original pre-import save, not the first import', () => {
    const original = acct(1, 111)
    const store = memStorage({ [DEFAULT_SAVE_KEY]: original })
    commitImport(store, acct(2, 222), now)
    expect(store.data[BEFORE_IMPORT_KEY]).toBe(original)
    commitImport(store, acct(2, 333), now)
    expect(store.data[BEFORE_IMPORT_KEY]).toBe(original)
    expect(loadState(store.data[DEFAULT_SAVE_KEY]!).gold).toBe(333)
  })

  it('undoing the import swaps the two saves back (and can itself be undone)', () => {
    const original = acct(1, 111)
    const store = memStorage({ [DEFAULT_SAVE_KEY]: original })
    commitImport(store, acct(2, 222), now)
    expect(beforeImportSave(store, now)?.state.gold).toBe(111)
    undoImport(store, now)
    expect(store.data[DEFAULT_SAVE_KEY]).toBe(original)
    expect(loadState(store.data[BEFORE_IMPORT_KEY]!).gold).toBe(222)
    // After an undo, the next import keeps aside the save on screen (the original).
    commitImport(store, acct(3, 444), now)
    expect(store.data[BEFORE_IMPORT_KEY]).toBe(original)
  })

  it('a save played on its own (not an import) is what the next import keeps aside', () => {
    const store = memStorage({ [DEFAULT_SAVE_KEY]: acct(1, 111) })
    commitImport(store, acct(2, 222), now)
    // The Master starts a new game and plays it, then imports again: the new game is kept.
    const newGame = acct(5, 555)
    store.data[DEFAULT_SAVE_KEY] = newGame
    commitImport(store, acct(6, 666), now)
    expect(store.data[BEFORE_IMPORT_KEY]).toBe(newGame)
  })

  it('an imported save played on for days is kept aside by the next import (not lost for the old backup)', () => {
    const original = acct(1, 111)
    const store = memStorage({ [DEFAULT_SAVE_KEY]: original })
    commitImport(store, acct(2, 222), now)
    // Days of play on the imported account (same account, new progress) …
    const later = now + 3 * 24 * 3_600_000
    const playedOn = exportSaveJson({ ...createAccount(2, { now: Date.UTC(2026, 9, 1) }), gold: 9_999 }, later)
    store.data[DEFAULT_SAVE_KEY] = playedOn
    // … then another code of that account (or any other) is imported.
    commitImport(store, acct(2, 333), later)
    expect(store.data[BEFORE_IMPORT_KEY]).toBe(playedOn)
  })

  it('no backup, or an unreadable one, reads as null', () => {
    expect(beforeImportSave(memStorage(), now)).toBeNull()
    expect(beforeImportSave(memStorage({ [BEFORE_IMPORT_KEY]: 'junk' }), now)).toBeNull()
  })
})
