import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FR } from '../i18n/fr'
import { FR_BATTLE } from '../i18n/frBattle'

/** Every literal `t('…')` key in the battle UI sources. */
function battleKeys(): string[] {
  const dir = join(__dirname)
  const files = readdirSync(dir).filter((f) => /\.(tsx|ts)$/.test(f) && !/\.test\.tsx?$/.test(f))
  const keys = new Set<string>()
  const re = /\bt\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8')
    for (const m of src.matchAll(re)) keys.add(m[2]!.replace(/\\(.)/g, '$1'))
  }
  return [...keys].sort()
}

describe('battle UI French coverage', () => {
  it('every literal battle string has a French entry', () => {
    const keys = battleKeys()
    expect(keys.length).toBeGreaterThan(40)
    const missing = keys.filter((k) => !(k in FR))
    expect(missing).toEqual([])
  })

  it('frBattle entries keep their placeholders and use French spacing before ? ! :', () => {
    for (const [en, fr] of Object.entries(FR_BATTLE)) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
      expect(ph(fr), en).toEqual(ph(en))
      expect(/[^\s][?!:](\s|$)/.test(fr.replace(/\{\w+\}/g, 'x').replace(/▸/g, '')), `${en} → ${fr}`).toBe(false)
    }
  })
})
