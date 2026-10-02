// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FR } from '../i18n/fr'
import { ENEMY_SKILLS, ENEMY_TEMPLATES } from '../../engine/content'
import type { PhaseKeyword } from '../../engine/types'

/** Every literal t('…') in lane G's pieces, and every name and line its content authors, has French. */
const FILES = [
  'battle/bossCaptions.ts',
  'battle/Telegraph.tsx',
  'battle/PhaseCinematic.tsx',
  'battle/OrderBar.tsx',
  'battle/BattleControls.tsx',
  'battle/battleFrames.ts',
  'tower/PreBattleOrders.tsx',
  'tower/warRoomText.ts',
  'tower/ForecastPanel.tsx',
  'qol/KeyboardHelp.tsx',
  'codex/codexText.ts',
  'skillText.ts',
]

function literals(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) out.push(m[1]!.replace(/\\'/g, "'"))
  for (const m of src.matchAll(/\btn\([^,]+,\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'/g)) out.push(m[1]!.replace(/\\'/g, "'"), m[2]!.replace(/\\'/g, "'"))
  return out
}

describe('enemy kits, telegraphs, phases and orders 2.0: French', () => {
  it('has an entry for every string the screens write', () => {
    const missing: string[] = []
    for (const f of FILES) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      for (const key of literals(src)) if (!(key in FR)) missing.push(`${f}: ${key}`)
    }
    // The keyboard help's rows are data, not t() calls.
    const help = readFileSync(join(__dirname, '..', 'qol/KeyboardHelp.tsx'), 'utf8')
    for (const m of help.matchAll(/\], '((?:[^'\\]|\\.)*)'\]/g)) if (!(m[1]! in FR)) missing.push(`KeyboardHelp row: ${m[1]}`)
    for (const m of help.matchAll(/title: '((?:[^'\\]|\\.)*)'/g)) if (!(m[1]! in FR)) missing.push(`KeyboardHelp title: ${m[1]}`)
    expect(missing).toEqual([])
  })

  it('has every enemy skill name, wind-up line, phase title and line, and enemy name', () => {
    const missing: string[] = []
    for (const s of Object.values(ENEMY_SKILLS)) {
      if (!(s.name in FR)) missing.push(`skill ${s.name}`)
      if (s.charge?.line !== undefined && !(s.charge.line in FR)) missing.push(`line ${s.charge.line}`)
    }
    for (const t of Object.values(ENEMY_TEMPLATES)) {
      for (const k of (t.keywords ?? []).filter((x): x is PhaseKeyword => x.kind === 'phase')) {
        if (k.title !== undefined && !(k.title in FR)) missing.push(`title ${k.title}`)
        if (k.line !== undefined && !(k.line in FR)) missing.push(`phase line ${k.line}`)
      }
      if (t.id.startsWith('echo_') && !(t.name in FR)) missing.push(`name ${t.name}`)
    }
    expect(missing).toEqual([])
  })
})
