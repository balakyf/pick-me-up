// @vitest-environment node
/**
 * Lane P in French: every lesson, mission label, escort, the leaders' move, the vault's truth,
 * and every literal the coach and the briefing write has a French entry with the same
 * placeholders; the slice overrides nothing another slice already says differently.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FR } from '../i18n/fr'
import SLICE from '../i18n/slices/frMissions'
import { LESSONS } from './coach'
import { ESCORT_TEMPLATES, MISSION_LABEL } from '../../engine/content/missions'
import { HIDDEN_OBJECTIVES, SKILLS } from '../../engine/content'

const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
function literals(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) out.push(m[1]!.replace(/\\'/g, "'"))
  return out
}

describe('lane P in French', () => {
  it('every lesson, label, escort, move and truth has French with the same placeholders', () => {
    const vault = HIDDEN_OBJECTIVES.find((h) => h.id === 'her_key')!
    const raw: (string | undefined)[] = [
      ...LESSONS.flatMap((l) => [l.title, l.tip]),
      ...Object.values(MISSION_LABEL),
      ...Object.values(ESCORT_TEMPLATES).map((e) => e.name),
      SKILLS.e_haymaker!.name,
      SKILLS.e_haymaker!.charge!.line,
      vault.name,
      vault.hint,
      vault.lore,
    ]
    const all = raw.filter((x): x is string => typeof x === 'string')
    expect(all.length).toBe(raw.length)
    expect(all.filter((s) => !(s in FR))).toEqual([])
    for (const s of all) expect(holes(FR[s]!), s).toEqual(holes(s))
  })

  it('every literal string the coach and the briefing write has French', () => {
    const files = ['qol/CoachTip.tsx', 'qol/Settings.tsx', 'tower/FillerBriefing.tsx', 'tower/missionBrief.ts', 'tower/PreBattleOrders.tsx']
    const missing: string[] = []
    for (const f of files) for (const key of literals(readFileSync(join(__dirname, '..', f), 'utf8'))) if (!(key in FR)) missing.push(`${f}: ${key}`)
    expect(missing).toEqual([])
  })

  it('the slice overrides nothing another slice says differently', () => {
    expect(Object.entries(SLICE).filter(([k, v]) => FR[k] !== v)).toEqual([])
  })
})
