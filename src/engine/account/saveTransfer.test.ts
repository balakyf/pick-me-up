/**
 * Tests for save export / import (the portable save file and the clipboard save code).
 */

import { createAccount, loadState, saveState, SaveLoadError } from './account'
import { decodeSaveCode, encodeSaveCode, exportSave, importSave } from './saveTransfer'
import { TUNING } from '../tuning'
import type { GameState, HeroId } from '../types'

function withAccentedHero(s: GameState): GameState {
  const id = Object.keys(s.heroes)[0] as HeroId
  return { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, name: 'Élodie Brûlé’s “Ω” 勇者' } } }
}

describe('exportSave / importSave', () => {
  it('round-trips a save through the JSON file', () => {
    const s = createAccount(4242, { now: 1000 })
    const back = importSave(exportSave(s, 5))
    expect(back).toEqual(loadState(saveState(s)))
  })

  it('round-trips through the base64 save code, accents and all', () => {
    const s = withAccentedHero(createAccount(9))
    const code = encodeSaveCode(exportSave(s))
    expect(code).toMatch(/^[A-Za-z0-9+/]+=*$/)
    const back = importSave(code)
    expect(Object.values(back.heroes)[0]!.name).toBe('Élodie Brûlé’s “Ω” 勇者')
    expect(back).toEqual(loadState(saveState(s)))
  })

  it('tolerates whitespace, line breaks and the URL-safe alphabet in a pasted code', () => {
    const s = createAccount(10)
    const code = encodeSaveCode(exportSave(s)).replace(/\+/g, '-').replace(/\//g, '_')
    const wrapped = `  ${code.match(/.{1,60}/g)!.join('\n')}  \n`
    expect(importSave(wrapped)).toEqual(loadState(saveState(s)))
  })

  it('base64 encoding matches the standard for every padding length', () => {
    expect(encodeSaveCode('a')).toBe('YQ==')
    expect(encodeSaveCode('ab')).toBe('YWI=')
    expect(encodeSaveCode('abc')).toBe('YWJj')
    expect(decodeSaveCode('YWI')).toBe('ab')
  })

  it('rejects empty input, garbage, and a code that is not a save', () => {
    expect(() => importSave('')).toThrow(SaveLoadError)
    expect(() => importSave('   ')).toThrow(/nothing to import/)
    expect(() => importSave('not a save!!')).toThrow(/not a save file or save code/)
    expect(() => importSave(encodeSaveCode('hello world'))).toThrow(/not a save file/)
    expect(() => importSave('{"schemaVersion": 3')).toThrow(/not valid JSON/)
    expect(() => importSave('{"hello": 1}')).toThrow(/schemaVersion/)
    expect(() => importSave(JSON.stringify({ schemaVersion: TUNING.account.schemaVersion, savedAt: 0, state: { gold: 1 } }))).toThrow(
      /missing required field/,
    )
  })

  it('refuses a save from a newer build', () => {
    const env = JSON.parse(exportSave(createAccount(1))) as { schemaVersion: number }
    env.schemaVersion = TUNING.account.schemaVersion + 1
    expect(() => importSave(JSON.stringify(env))).toThrow(/newer than engine/)
  })

  it('migrates an export from an older schema version', () => {
    const now = createAccount(777, { now: 1000 })
    // An old v1 export: strip the post-v1 fields and stamp v1 (as account.test does).
    const heroesV1 = Object.fromEntries(
      Object.entries(now.heroes).map(([id, h]) => {
        const { sanity, promotion, ...rest } = h as unknown as Record<string, unknown>
        return [id, rest]
      }),
    )
    const { gems, materials, meta, facilities, dailies, ...stateV1 } = now as unknown as Record<string, unknown>
    const v1 = JSON.stringify({ schemaVersion: 1, savedAt: 0, state: { ...stateV1, schemaVersion: 1, heroes: heroesV1 } })

    const fromFile = importSave(v1)
    const fromCode = importSave(encodeSaveCode(v1))
    expect(fromFile.schemaVersion).toBe(TUNING.account.schemaVersion)
    expect(fromFile.gems).toBe(TUNING.lobby.startingGems)
    expect(fromCode).toEqual(fromFile)
  })
})
