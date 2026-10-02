import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FR } from '../i18n/fr'

/** Every literal t('…') in the battle-readability pieces has its French (frBattleRead.ts and friends). */
const FILES = [
  'objectives.ts',
  'ObjectiveHud.tsx',
  'ObjectiveMark.tsx',
  'TurnStrip.tsx',
  'StageBanners.tsx',
  'ElementsHint.tsx',
  'elementsHint.ts',
  'HpBar.tsx',
  'popupStyle.ts',
]

describe('battle readability: French', () => {
  it('has an entry for every string', () => {
    const missing: string[] = []
    for (const f of FILES) {
      const src = readFileSync(join(__dirname, f), 'utf8')
      for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) {
        const key = m[1]!.replace(/\\'/g, "'")
        if (!(key in FR)) missing.push(`${f}: ${key}`)
      }
    }
    expect(missing).toEqual([])
  })
})
