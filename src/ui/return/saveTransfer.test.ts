import { describe, it, expect } from 'vitest'
import { BEFORE_IMPORT_KEY, commitImport, decodeSaveInput, encodeSaveCode, exportSaveJson, parseImport, SAVE_CODE_PREFIX, saveFileName, type SaveStorage } from './saveTransfer'
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
