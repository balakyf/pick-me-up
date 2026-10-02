import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { ENEMY_TEMPLATES } from '../../engine/content'
import { ANCHORS } from '../../engine/content/anchors'
import { CHALLENGE } from '../../engine/challenge/tuning'
import { FR } from '../i18n/fr'
import { setLocale } from '../i18n/i18n'
import { BOSS_INTRO, bossName, bossShows, FINISHER_MS, INTRO_MS, introTitle, MINOR_INTRO_MS, phasesOf, showHolds, showIn, WAKES_MS } from './bossIntro'
import { beatRanges, buildFrames, frameHold, layout, showHoldsFor } from './battleFrames'

const unit = (id: string, side: 'hero' | 'enemy', extra: Partial<CombatUnitInit> = {}): CombatUnitInit => ({
  id,
  name: side === 'hero' ? `Hero ${id}` : 'Goblin',
  side,
  line: 'front',
  unitClass: side === 'hero' ? 'warrior' : null,
  element: 'fire',
  level: 20,
  maxHP: 1000,
  maxSP: 100,
  cp: 10,
  spd: 50,
  ...extra,
})
const tpl = (id: string): Partial<CombatUnitInit> => ({ templateId: id, name: ENEMY_TEMPLATES[id]!.name })

/** F40 in miniature: two lieutenants at the start, Valention with the second wave, recalling a lieutenant; he falls. */
function f40(): CombatLog {
  const ev: CombatEvent[] = [
    { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['rod', 'laz', 'g1'] },
    { seq: 1, tick: 2, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'g1' },
    { seq: 2, tick: 2, kind: 'hit', actorId: 'h1', targetId: 'g1', amount: 1000, crit: false, hpAfter: 0 },
    { seq: 3, tick: 2, kind: 'death', unitId: 'g1' },
    { seq: 4, tick: 3, kind: 'wave-spawn', wave: 1, enemyIds: ['val'] },
    { seq: 5, tick: 6, kind: 'summon', unitId: 'val', enemyIds: ['rod2'], wave: 1 },
    { seq: 6, tick: 9, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'val' },
    { seq: 7, tick: 9, kind: 'hit', actorId: 'h1', targetId: 'val', amount: 1000, crit: true, hpAfter: 0 },
    { seq: 8, tick: 9, kind: 'death', unitId: 'val' },
    { seq: 9, tick: 9, kind: 'mission', note: 'x wakes…', code: 'wakes', params: { unitId: 'laz' } },
    { seq: 10, tick: 10, kind: 'end', outcome: 'win' },
  ]
  return {
    seed: 7,
    floor: 40,
    encounterContext: 'tower',
    unitsInit: [
      unit('h1', 'hero'),
      unit('rod', 'enemy', tpl('rodvick')),
      unit('laz', 'enemy', tpl('lazenca')),
      unit('g1', 'enemy'),
      unit('val', 'enemy', { ...tpl('valention'), targetTag: 'valention' }),
      unit('rod2', 'enemy', tpl('rodvick')),
    ],
    events: ev,
    outcome: 'win',
    rngDraws: 0,
  }
}

describe('boss intros (lane I)', () => {
  it('every anchor boss, raid boss and echo has a card, and every card names a real template', () => {
    for (const id of Object.keys(BOSS_INTRO)) expect(ENEMY_TEMPLATES[id], id).toBeDefined()
    // Every foe an anchor's mission names has a card (the F35 jewel's bearer as a lieutenant).
    for (const def of Object.values(ANCHORS))
      for (const g of def.waves.flat()) if (g.targetTag !== undefined && ENEMY_TEMPLATES[g.templateId]) expect(BOSS_INTRO[g.templateId], `F${def.floor} ${g.templateId}`).toBeDefined()
    for (const tag of Object.values(CHALLENGE.raids.bosses)) expect(BOSS_INTRO[tag]?.tier, tag).toBe('boss')
    for (const id of Object.keys(ENEMY_TEMPLATES).filter((k) => k.startsWith('echo_'))) expect(BOSS_INTRO[id]?.tier, id).toBe('echo')
    for (const id of ['el_cid', 'versace', 'valention', 'pryos', 'herald_of_end', 'tell']) expect(BOSS_INTRO[id]?.tier).toBe('boss')
  })

  it('reads as NAME · EPITHET, translated, and a renamed unit keeps its own name', () => {
    setLocale('en')
    expect(introTitle({ name: 'El Cid, the Fallen Ranker', templateId: 'el_cid' })).toEqual({ name: 'El Cid', epithet: 'The Fallen Ranker' })
    expect(bossName({ name: 'Guild Colossus', templateId: 'fragment_colossus' })).toBe('Guild Colossus')
    setLocale('fr')
    expect(introTitle({ name: 'El Cid, the Fallen Ranker', templateId: 'el_cid' })).toEqual({ name: 'El Cid', epithet: 'Le Classé déchu' })
    setLocale('en')
  })

  it("knows a boss's phases from lane G's keywords", () => {
    expect(phasesOf('tell').map((p) => p.atHpPct)).toEqual([75, 50, 25])
    expect(phasesOf('pryos').map((p) => p.title)).toEqual(['The Second Seal', 'The Last Seal'])
    expect(phasesOf('goblin')).toEqual([])
  })

  it('plays a card when a boss first appears, a finisher when it falls and a moment when the creature wakes', () => {
    const log = f40()
    const byId = Object.fromEntries(log.unitsInit.map((u) => [u.id, u]))
    const shows = bossShows(log, byId)
    // the lieutenants come in together at the start (a smaller card)
    expect(shows.get(0)).toEqual({ kind: 'intro', units: ['rod', 'laz'], tier: 'lieutenant' })
    expect(shows.get(4)).toEqual({ kind: 'intro', units: ['val'], tier: 'boss' })
    // Rodvick recalled is not introduced twice
    expect(shows.has(5)).toBe(false)
    expect(shows.get(8)).toEqual({ kind: 'finisher', unitId: 'val' })
    expect(shows.get(9)).toEqual({ kind: 'wakes', unitId: 'laz' })
    // a goblin's death is no show
    expect(shows.has(3)).toBe(false)
    expect(showIn(shows, 6, 9)).toEqual({ at: 8, show: { kind: 'finisher', unitId: 'val' } })
    expect(showIn(shows, -1, -1)).toBeNull()
  })

  it('each show holds its beat longer, scaled by the replay speed', () => {
    const log = f40()
    const byId = Object.fromEntries(log.unitsInit.map((u) => [u.id, u]))
    const holds = showHoldsFor(log, byId)
    expect(holds).toEqual(showHolds(bossShows(log, byId), beatRanges(log, byId)))
    expect(holds.get(0)).toBe(MINOR_INTRO_MS)
    expect(holds.get(4)).toBe(INTRO_MS)
    const frames = buildFrames(log, byId, (id) => id)
    const valFrame = frames.find((f) => f.from === 4)!
    const plain = frameHold(valFrame, log.events, byId, { speed: 1 })
    expect(frameHold(valFrame, log.events, byId, { speed: 1, shows: holds })).toBe(plain + INTRO_MS)
    expect(frameHold(valFrame, log.events, byId, { speed: 4, shows: holds })).toBe((plain + INTRO_MS) / 4)
    const killFrame = frames.find((f) => f.from <= 8 && f.to >= 8)!
    expect(holds.get(killFrame.from)).toBe(FINISHER_MS)
    expect(WAKES_MS).toBeGreaterThan(0)
  })

  it('a rank holding a towering boss stands abreast instead of stacking bodies', () => {
    const log = f40()
    const sizes: Record<string, { w: number; h: number }> = { val: { w: 62, h: 72 }, rod2: { w: 44, h: 50 } }
    const size = (id: string) => sizes[id] ?? { w: 24, h: 32 }
    const plain = layout(log)
    const roomy = layout(log, 1, size)
    // without sizes: one column; with them, Valention fronts and Rodvick stands behind him
    expect(plain.val!.x).toBe(plain.rod2!.x + (plain.val!.x - plain.rod2!.x))
    expect(roomy.val!.x - roomy.rod2!.x).toBeGreaterThanOrEqual(30)
    expect(roomy.rod2!.x - size('rod2').w / 2).toBeGreaterThanOrEqual(0)
    // heroes are untouched
    expect(roomy.h1).toEqual(plain.h1)
  })
})

describe('boss presentation: French', () => {
  const FILES = ['battle/bossIntro.ts', 'battle/bossBar.ts', 'battle/BossBar.tsx', 'battle/BossIntro.tsx']
  it('has every literal string and every name and epithet on the cards', () => {
    const missing: string[] = []
    for (const f of FILES) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) {
        const key = m[1]!.replace(/\\'/g, "'")
        if (!(key in FR)) missing.push(`${f}: ${key}`)
      }
    }
    for (const c of Object.values(BOSS_INTRO)) {
      if (!(c.name in FR)) missing.push(`name ${c.name}`)
      if (!(c.epithet in FR)) missing.push(`epithet ${c.epithet}`)
    }
    expect(missing).toEqual([])
  })
})
