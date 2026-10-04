// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FR } from '../i18n/fr'
import { ACT_STORY_AFTER, ANCHOR_STORY, BOSS_LINES, EPILOGUE, POST_WALL_STORY, PRIASIS_ARC } from '../../engine/content/story'
import { ALLY_TEMPLATES } from '../../engine/content'
import SLICE from '../i18n/slices/frEndgame'
import { DIFFICULTY_LABEL } from './endingText'

function strings(v: unknown, key = ''): string[] {
  if (typeof v === 'string') return ['id', 'speaker', 'voice', 'from', 'when'].includes(key) ? [] : [v]
  if (Array.isArray(v)) return v.flatMap((x) => strings(x))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => strings(x, k))
  return []
}
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

function literals(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) out.push(m[1]!.replace(/\\'/g, "'"))
  for (const m of src.matchAll(/\btn\([^,]+,\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'/g)) out.push(m[1]!.replace(/\\'/g, "'"), m[2]!.replace(/\\'/g, "'"))
  return out
}

describe('the endgame in French (lane O)', () => {
  it('every endgame story line has French, with the same placeholders', () => {
    const echoes = Object.entries(BOSS_LINES).filter(([id]) => id.startsWith('echo_')).map(([, v]) => v)
    const all = [
      ...strings(POST_WALL_STORY),
      ...strings(ACT_STORY_AFTER),
      ...strings(EPILOGUE),
      ...strings(echoes),
      ...strings(ANCHOR_STORY[80]),
      ...strings(PRIASIS_ARC.filter((b) => b.id.startsWith('summit_'))),
      ...Object.values(DIFFICULTY_LABEL),
      ALLY_TEMPLATES.siege_ram!.name,
      ALLY_TEMPLATES.al_ragna_banner!.name,
    ]
    const missing = all.filter((s) => !(s in FR))
    expect(missing).toEqual([])
    for (const s of all) expect(holes(FR[s]!), s).toEqual(holes(s))
  })

  it('every literal string the ending screens write has French', () => {
    const dir = __dirname
    const missing: string[] = []
    const files = readdirSync(dir).filter((f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.includes('.test.'))
    for (const f of files) for (const key of literals(readFileSync(join(dir, f), 'utf8'))) if (!(key in FR)) missing.push(`${f}: ${key}`)
    expect(missing).toEqual([])
  })

  it('the slice has no empty entries, keeps its placeholders, and overrides no other slice', () => {
    for (const [k, v] of Object.entries(SLICE)) {
      expect(v.trim().length, k).toBeGreaterThan(0)
      expect(holes(v), k).toEqual(holes(k))
    }
    const clash = Object.entries(SLICE).filter(([k, v]) => FR[k] !== v)
    expect(clash).toEqual([])
  })
})
