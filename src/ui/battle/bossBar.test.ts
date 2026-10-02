import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { ENEMY_TEMPLATES } from '../../engine/content'
import { TUNING } from '../../engine/tuning'
import { setLocale } from '../i18n/i18n'
import { bossBarView, type BarField } from './bossBar'

const unit = (id: string, side: 'hero' | 'enemy', extra: Partial<CombatUnitInit> = {}): CombatUnitInit => ({
  id,
  name: side === 'hero' ? `Hero ${id}` : 'Goblin',
  side,
  line: 'front',
  unitClass: null,
  element: 'dark',
  level: 30,
  maxHP: 1000,
  maxSP: 100,
  cp: 10,
  ...extra,
})
const tpl = (id: string): Partial<CombatUnitInit> => ({ templateId: id, name: ENEMY_TEMPLATES[id]!.name })

function logOf(floor: number, enemies: CombatUnitInit[], events: CombatEvent[], mission?: CombatLog['mission']): CombatLog {
  return { seed: 1, floor, encounterContext: 'tower', unitsInit: [unit('h1', 'hero'), ...enemies], events, outcome: 'win', rngDraws: 0, mission }
}
const field = (over: Partial<BarField> = {}): BarField => ({ hp: {}, dead: {}, ...over })
const byIdOf = (log: CombatLog) => Object.fromEntries(log.unitsInit.map((u) => [u.id, u]))

describe('the boss bar (lane I)', () => {
  setLocale('en')

  it('is empty until a boss steps onto the field', () => {
    const log = logOf(20, [unit('g', 'enemy'), unit('hal', 'enemy', tpl('halgiraf'))], [
      { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['g'] },
      { seq: 1, tick: 5, kind: 'wave-spawn', wave: 1, enemyIds: ['hal'] },
    ])
    expect(bossBarView(log, byIdOf(log), field(), 1)).toBeNull()
    const v = bossBarView(log, byIdOf(log), field({ hp: { hal: 400 } }), 2)!
    expect(v.unitId).toBe('hal')
    expect(v.name).toBe('Halgiraf')
    expect(v.epithet).toBe('The Half Black Dragon')
    expect(v.hpPct).toBe(40)
  })

  it("marks lane G's phases and lights those passed", () => {
    const log = logOf(100, [unit('tell', 'enemy', tpl('tell'))], [{ seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['tell'] }])
    const v = bossBarView(log, byIdOf(log), field({ boss: { passed: { tell: 2 } } }), 1)!
    expect(v.phases.map((p) => [p.atHpPct, p.title, p.passed])).toEqual([
      [75, 'The First Draft', true],
      [50, 'The Second Draft', true],
      [25, 'The Last Draft', false],
    ])
  })

  it('counts aegis charges: what it came with, plus its phases, less each blow turned', () => {
    // Pryos: 3 charges, +2 at each seal.
    const ev: CombatEvent[] = [
      { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['p'] },
      { seq: 1, tick: 2, kind: 'guard', actorId: 'h1', targetId: 'p' },
      { seq: 2, tick: 3, kind: 'guard', actorId: 'h1', targetId: 'p' },
      { seq: 3, tick: 4, kind: 'phase', unitId: 'p', phase: 1, phases: 2, title: 'The Second Seal' },
    ]
    const log = logOf(80, [unit('p', 'enemy', tpl('pryos'))], ev)
    expect(bossBarView(log, byIdOf(log), field(), 1)!.aegis).toBe(3)
    expect(bossBarView(log, byIdOf(log), field(), 3)!.aegis).toBe(1)
    expect(bossBarView(log, byIdOf(log), field({ boss: { passed: { p: 1 } } }), 4)!.aegis).toBe(3)
  })

  it('a blow that lands proves the aegis gone (the subverted Herald has none)', () => {
    const ev: CombatEvent[] = [
      { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['he'] },
      { seq: 1, tick: 2, kind: 'hit', actorId: 'h1', targetId: 'he', amount: 50, crit: false, hpAfter: 950 },
    ]
    const log = logOf(90, [unit('he', 'enemy', tpl('herald_of_end'))], ev)
    expect(bossBarView(log, byIdOf(log), field(), 1)!.aegis).toBeGreaterThan(0)
    expect(bossBarView(log, byIdOf(log), field(), 2)!.aegis).toBe(0)
  })

  it('runs the enrage clock down, then says the boss is enraged', () => {
    const at = TUNING.tower.f20EnrageTick
    const ev: CombatEvent[] = [
      { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['hal'] },
      { seq: 1, tick: Math.round(at / 2), kind: 'miss', actorId: 'h1', targetId: 'hal' },
      { seq: 2, tick: at + 5, kind: 'miss', actorId: 'h1', targetId: 'hal' },
    ]
    const log = logOf(20, [unit('hal', 'enemy', tpl('halgiraf'))], ev)
    const mid = bossBarView(log, byIdOf(log), field(), 2)!
    expect(mid.timer).toMatchObject({ kind: 'enrage', label: 'Enrage' })
    expect(mid.timer!.left).toBeCloseTo(0.5, 1)
    expect(mid.enraged).toBeNull()
    const late = bossBarView(log, byIdOf(log), field(), 3)!
    expect(late.timer).toBeNull()
    expect(late.enraged).toBe(2.5)
    // a phase that turns it for good (El Cid's ×1.3) shows at once
    const cid = logOf(60, [unit('c', 'enemy', tpl('el_cid'))], [{ seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['c'] }])
    expect(bossBarView(cid, byIdOf(cid), field({ boss: { passed: { c: 1 } } }), 1)!.enraged).toBe(1.3)
  })

  it("follows the mission's target, and names a looming foe's enrage beside it (F10)", () => {
    const ev: CombatEvent[] = [{ seq: 0, tick: 10, kind: 'wave-spawn', wave: 2, enemyIds: ['lv', 'bp'] }]
    const log = logOf(10, [unit('lv', 'enemy', tpl('lv999_creature')), unit('bp', 'enemy', { ...tpl('black_priest'), targetTag: 'black_priest' })], ev)
    const v = bossBarView(log, byIdOf(log), field(), 1)!
    expect(v.unitId).toBe('bp')
    expect(v.timer).toMatchObject({ kind: 'enrage', label: 'Lv999 Creature enrages' })
    // the creature shows its own level
    const lv = bossBarView(log, byIdOf(log), field({ dead: { bp: true } }), 1)!
    expect(lv.unitId).toBe('lv')
    expect(lv.level).toBe(999)
  })

  it("shows the mission's deadline when there is no enrage, and stays on a fallen boss, empty", () => {
    const ev: CombatEvent[] = [
      { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['v'] },
      { seq: 1, tick: 50, kind: 'death', unitId: 'v' },
    ]
    const log = logOf(41, [unit('v', 'enemy', tpl('versace'))], ev, { type: 'Chase', objectives: [{ kind: 'defeat', targetTag: 'versace' }], timerTicks: 200, waves: 1 })
    const v = bossBarView(log, byIdOf(log), field({ hp: { v: 0 }, dead: { v: true } }), 2)!
    expect(v.timer).toMatchObject({ kind: 'deadline' })
    expect(v.timer!.left).toBeCloseTo(0.75, 2)
    expect(v.dead).toBe(true)
    expect(v.hpPct).toBe(0)
  })

  it("the guild's stand-in Colossus carries none of its template's keywords", () => {
    const g = unit('gb', 'enemy', { templateId: 'fragment_colossus', name: 'Guild Colossus' })
    const log = logOf(60, [g], [{ seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['gb'] }], { type: 'Guild Raid', objectives: [], timerTicks: 300, waves: 1 })
    const v = bossBarView(log, byIdOf(log), field(), 1)!
    expect(v.name).toBe('Guild Colossus')
    expect(v.timer?.kind).toBe('deadline')
    expect(v.aegis).toBe(0)
  })
})
