// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FR } from '../i18n/fr'
import LATE from '../i18n/slices/frLateSystems'
import { GUILDS } from '../../engine/pvp'
import { PVP_UNFIT_WORDS, invasionCard, raidCard } from './pvpModel'
import { NOTE_PATTERNS } from './pvpText'

/** Every literal t('…') in lane Q's pieces, and every word they show from data, has French. */
const FILES = [
  'pvpPanels.tsx',
  'pvp/RaidSheet.tsx',
  'pvp/CaptiveBoard.tsx',
  'pvp/GuildScreens.tsx',
  'pvp/InvasionAlarm.tsx',
  'pvp/RivalCardView.tsx',
  'pvp/pvpText.ts',
  'life/lifePanels.tsx',
  'challenge/RaidPlanner.tsx',
  'challenge/WeeklyTrial.tsx',
  'battle/battleFrames.ts',
]

function literals(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) out.push(m[1]!.replace(/\\'/g, "'"))
  return out
}

describe('late systems: French', () => {
  it('has an entry for every string the screens write', () => {
    const missing: string[] = []
    for (const f of FILES) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      for (const key of literals(src)) if (!(key in FR)) missing.push(`${f}: ${key}`)
    }
    expect(missing).toEqual([])
  })

  it('has the data the screens translate: cards, refusals, guilds, log notes, kickers', () => {
    const rv = { id: 'r1_1', name: 'Wolf_1', guildId: 'kaiser', whale: true, floor: 10, cpRatio: 1, rating: 1000 }
    const words = [
      ...PVP_UNFIT_WORDS,
      invasionCard({ worldDay: 1, direction: 'in', rival: 'x', won: true, goldDelta: 0, note: '' }).line,
      invasionCard({ worldDay: 1, direction: 'in', rival: 'x', won: true, goldDelta: 0, note: '', guildId: 'unity' }).line,
      raidCard(rv, 'raid').line,
      raidCard(rv, 'counter', 'A').line,
      ...GUILDS.flatMap((g) => [g.name, g.blurb]),
      ...NOTE_PATTERNS.map(([, k]) => k),
      'Invasion', 'Raid', 'Counter-raid', 'Server war', 'Guild raid',
      'The whole guild strikes it this week. Every blow counts.',
      'Three squads. Win two and the war is yours.',
      'The team is full.', 'The defense is full.', 'Not allowed by this week’s rule.', 'Cannot enter the trial now.',
      'Pick at least one hero.', 'A raiding team is at most five heroes.', 'A hero can only go once.', 'Someone on the team cannot go right now.',
      'that hero is not held', 'the crack is closed', 'no one in the party can go', 'Guild Colossus',
    ]
    expect(words.filter((w) => !(w in FR))).toEqual([])
  })

  it('keeps every placeholder and no empty entry', () => {
    for (const [k, v] of Object.entries(LATE)) {
      expect(v.trim(), k).not.toBe('')
      const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      expect(ph(v), k).toEqual(ph(k))
    }
  })
})
