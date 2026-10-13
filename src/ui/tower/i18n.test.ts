/**
 * Every player-facing string WP4 renders has French (spec 2026-10-12 §4.0.5). The test
 * reads the Tower UI sources, pulls every literal `t('…')` key plus the display tables
 * passed to `t()` by variable, and looks each one up in the merged FR dictionary.
 *
 * The floor-kind names are the climb's own words: WP3's frClimb owns their French, so
 * frTower must not define them (the duplicate-key guard would fail at merge). Until WP3
 * lands they may be missing here, and only they may be.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { FR } from '../i18n/fr'
import { FR_TOWER } from '../i18n/frTower'
import { DOOR_TITLE, KIND_LABEL, REWARD_LABEL } from './kinds'
import { THREAT_LABEL } from './ScoutCard'

/** Keys whose French belongs to WP3's frClimb. */
const CLIMB_OWNED = ['Tutorial', 'Breather', 'Path', 'Elite', 'Cache', 'Boss', 'A fair fight. Standard rewards.']

const ui = join(__dirname, '..')
const sources = [
  join(ui, 'TowerScreen.tsx'),
  join(ui, 'ResultsScreen.tsx'),
  ...readdirSync(__dirname)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.|fixtures/.test(f))
    .map((f) => join(__dirname, f)),
]

function literalKeys(): string[] {
  const keys: string[] = []
  for (const file of sources) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) keys.push(m[2]!.replace(/\\(['"])/g, '$1'))
  }
  return keys
}

describe('Tower UI French', () => {
  it('finds the keys it checks', () => {
    const keys = literalKeys()
    expect(keys.length).toBeGreaterThan(150)
    expect(keys).toContain('Toward the next summon')
  })

  it('every literal t() key and display label has French (or is the climb’s to translate)', () => {
    const tables = [...Object.values(KIND_LABEL), ...Object.values(DOOR_TITLE), ...Object.values(REWARD_LABEL), ...Object.values(THREAT_LABEL)]
    const missing = [...new Set([...literalKeys(), ...tables])].filter((k) => FR[k] === undefined && !CLIMB_OWNED.includes(k))
    expect(missing).toEqual([])
  })

  it('leaves the climb’s own words to frClimb', () => {
    expect(CLIMB_OWNED.filter((k) => k in FR_TOWER)).toEqual([])
  })
})
