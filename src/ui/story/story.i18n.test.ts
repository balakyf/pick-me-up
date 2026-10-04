// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FR } from '../i18n/fr'
import * as STORY from '../../engine/content/story'
import SLICE from '../i18n/slices/frStory'
import { EULOGY_CLOSE, EULOGY_TRAIT, EULOGY_WHO } from './eulogy'

/** Every string in a nested value (objects, arrays), except the data's ids and enums. */
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
  return out
}

describe('the story in French (lane M)', () => {
  const all = [...strings(STORY), ...strings(EULOGY_WHO), ...strings(EULOGY_TRAIT), ...strings(EULOGY_CLOSE)]

  it('every line of the story has French, with the same placeholders', () => {
    expect(all.length).toBeGreaterThan(200)
    const missing = all.filter((s) => !(s in FR))
    expect(missing).toEqual([])
    for (const s of all) expect(holes(FR[s]!), s).toEqual(holes(s))
  })

  it('every literal string the story screens write has French', () => {
    const dir = __dirname
    const missing: string[] = []
    for (const f of readdirSync(dir).filter((f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.includes('.test.'))) {
      for (const key of literals(readFileSync(join(dir, f), 'utf8'))) if (!(key in FR)) missing.push(`${f}: ${key}`)
    }
    expect(missing).toEqual([])
  })

  it('the slice translates only what it should: no other slice is overridden with a different word', () => {
    // fr.ts merges slices in file-name order; a key that already exists elsewhere must agree.
    const clash = Object.entries(SLICE).filter(([k, v]) => FR[k] !== v)
    expect(clash).toEqual([])
  })
})
