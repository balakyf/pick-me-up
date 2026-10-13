import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FR } from './fr'

/**
 * Every literal `t('…')` key in the shipped code has a French entry. (Dynamic keys —
 * content names, tables passed through `t(x)` — are covered by the FR screen smoke test.)
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !p.includes('__fixtures__')) out.push(p)
  }
  return out
}

describe('French covers every literal t() key', () => {
  it('no literal key in src/ui or src/engine is missing from FR', () => {
    const missing: string[] = []
    for (const file of [...walk('src/ui'), ...walk('src/engine')]) {
      if (file.endsWith(join('i18n', 'i18n.ts'))) continue // its doc comment shows t('English text')
      const src = readFileSync(file, 'utf8')
      const re = /\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        if (m[1] === '`' && m[2]!.includes('${')) continue
        const key = m[2]!.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n')
        if (!/[a-zA-Z]{2}/.test(key)) continue
        if (FR[key] === undefined) missing.push(`${file}: ${key}`)
      }
    }
    expect(missing).toEqual([])
  })
})
