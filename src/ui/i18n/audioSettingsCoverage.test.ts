import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FR } from './fr'
import FR_AUDIO_SETTINGS from './slices/frAudioSettings'

/**
 * Every literal t('…') in the Settings window, the menus and keys that reach it, and the
 * places lane H wrapped, has a French entry (a forgotten string would show in English in
 * a French game).
 */
const FILES = ['qol/Settings.tsx', 'qol/KeyboardHelp.tsx', 'App.tsx', 'bits.tsx', 'kit.tsx']

/** The first argument of every t('…') / t("…") / t(`…`) call with a plain literal. */
export function literalKeys(src: string): string[] {
  const out: string[] = []
  const re = /\bt\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
  for (const m of src.matchAll(re)) {
    const raw = m[2]!
    if (m[1] === '`' && raw.includes('${')) continue
    out.push(raw.replace(/\\(['"`\\])/g, '$1'))
  }
  return out
}

describe('French coverage for the settings and audio slice', () => {
  it('finds the literals it should', () => {
    expect(literalKeys(`t('A {n}', { n }) + t("B") + t(\`C\`) + t(\`D \${x}\`) + tn(1, 'x', 'y') + t('it\\'s')`)).toEqual(['A {n}', 'B', 'C', "it's"])
  })

  for (const f of FILES) {
    it(`every t() literal in ${f} has French`, () => {
      const src = readFileSync(resolve(__dirname, '..', f), 'utf8')
      const keys = literalKeys(src)
      expect(keys.length).toBeGreaterThan(0)
      expect(keys.filter((k) => FR[k] === undefined)).toEqual([])
    })
  }

  it('the slice is merged and keeps its placeholders', () => {
    for (const [en, fr] of Object.entries(FR_AUDIO_SETTINGS)) {
      expect(FR[en]).toBe(fr)
      const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join()
      expect(ph(fr), en).toBe(ph(en))
    }
  })
})
