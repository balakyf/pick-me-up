// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FR } from '../i18n/fr'
import { ISEL_CLOSE } from './memorialBand'

/** Every literal t('…') in lane K's pieces, and every line Isel speaks, has French. */
const FILES = [
  'results/ResultsScreen.tsx',
  'results/resultsText.ts',
  'results/memorialBand.ts',
  'results/skillProgress.ts',
  'title/TitleScreen.tsx',
  'qol/SaveErrorNotice.tsx',
  'tower/EventPanel.tsx',
]

function literals(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) out.push(m[1]!.replace(/\\'/g, "'"))
  return out
}

describe('results, memorial, camp and title: French', () => {
  it('has an entry for every string the screens write', () => {
    const missing: string[] = []
    for (const f of FILES) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      for (const key of literals(src)) if (!(key in FR)) missing.push(`${f}: ${key}`)
    }
    // The MVP reasons are data, translated where they are shown.
    const screen = readFileSync(join(__dirname, 'ResultsScreen.tsx'), 'utf8')
    const block = screen.slice(screen.indexOf('const REASON'), screen.indexOf('}', screen.indexOf('const REASON')))
    for (const m of block.matchAll(/: '((?:[^'\\]|\\.)*)'/g)) if (!(m[1]! in FR)) missing.push(`REASON: ${m[1]}`)
    expect(missing).toEqual([])
  })

  it('has every line Isel speaks over the fallen, and the camp notes', () => {
    // (Isel's eulogy lines are lane M's, checked in ui/story/story.i18n.test.ts.)
    const lines: string[] = [...Object.values(ISEL_CLOSE).flat()]
    lines.push('The survivors make camp on the stair. Wounds are dressed, and the fallen are named by the fire.')
    lines.push('A stranger finds the camp and asks to climb with you.')
    expect(lines.filter((l) => !(l in FR))).toEqual([])
  })
})
