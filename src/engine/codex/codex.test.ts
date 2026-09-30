import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { reduce } from '../store'
import { TUNING } from '../tuning'
import { ENEMY_TEMPLATES } from '../content'
import { playFloor } from '../tower'
import { attemptDaily } from '../daily'
import { scoutFloor } from '../scout'
import { DEPTH } from '../depth/depthTuning'
import type { CombatLog, CombatUnitInit, GameState } from '../types'
import { actOfTemplate, codexTemplates, defaultCodex, intelOf, isStudied, recordBattle, weakElementOf } from './codex'

const init = (id: string, side: 'hero' | 'enemy', templateId?: string): CombatUnitInit => ({
  id,
  name: id,
  side,
  line: 'front',
  unitClass: null,
  element: 'physical',
  level: 1,
  maxHP: 10,
  maxSP: 0,
  cp: 1,
  ...(templateId ? { templateId } : {}),
})

/** Two goblins and a wolf in wave 0, a harpy in a wave that never came. */
function log(deaths: string[], floor = 3): CombatLog {
  return {
    seed: 1,
    floor,
    encounterContext: 'tower',
    unitsInit: [init('h1', 'hero'), init('g1', 'enemy', 'goblin'), init('g2', 'enemy', 'goblin'), init('w1', 'enemy', 'wolf'), init('hp', 'enemy', 'harpy'), init('x', 'enemy')],
    events: [
      { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['g1', 'g2', 'w1', 'x'] },
      ...deaths.map((unitId, i) => ({ seq: i + 1, tick: 5, kind: 'death' as const, unitId })),
      { seq: 99, tick: 9, kind: 'end', outcome: 'win' },
    ],
    outcome: 'win',
    rngDraws: 0,
  }
}

function roster(seed: number, n = 6): GameState {
  let s: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  return s
}

describe('recordBattle', () => {
  it('counts a meeting once per battle and every kill; unspawned waves were never met', () => {
    const c = recordBattle(defaultCodex(), log(['g1', 'g2']))
    expect(c.entries.goblin).toEqual({ seen: 1, defeated: 2, studied: false, floors: [3] })
    expect(c.entries.wolf).toEqual({ seen: 1, defeated: 0, studied: false, floors: [3] })
    expect(c.entries.harpy).toBeUndefined()
    expect(Object.keys(c.entries)).toHaveLength(2) // the template-less unit is ignored
  })

  it('studies an enemy after enough kills, or at once on a scouted floor', () => {
    let c = defaultCodex()
    c = recordBattle(c, log(['g1', 'g2']))
    expect(isStudied(c, 'goblin')).toBe(false)
    c = recordBattle(c, log(['g1'], 4))
    expect(c.entries.goblin!.defeated).toBe(DEPTH.codex.studyAfterDefeats)
    expect(isStudied(c, 'goblin')).toBe(true)
    expect(c.entries.goblin!.floors).toEqual([3, 4])
    expect(isStudied(c, 'wolf')).toBe(false)
    expect(isStudied(recordBattle(defaultCodex(), log([]), { studied: true }), 'wolf')).toBe(true)
  })

  it('is pure, and a battle without template enemies changes nothing', () => {
    const c0 = defaultCodex()
    const before = JSON.stringify(c0)
    recordBattle(c0, log(['g1']))
    expect(JSON.stringify(c0)).toBe(before)
    const pvp: CombatLog = { ...log([]), unitsInit: [init('h1', 'hero'), init('e1', 'enemy')] }
    expect(recordBattle(c0, pvp)).toBe(c0)
  })
})

describe('the codex fills in from battles', () => {
  it('a tower floor records the enemies met there', () => {
    const s = roster(1)
    const { state, result } = playFloor(s)
    const met = new Set(result.result.log.unitsInit.filter((u) => u.side === 'enemy').map((u) => u.templateId))
    expect(Object.keys(state.codex.entries).sort()).toEqual([...met].sort())
    for (const e of Object.values(state.codex.entries)) {
      expect(e.seen).toBe(1)
      expect(e.floors).toEqual([1])
    }
  })

  it('a scouted floor studies its enemies, and the scouting report says so next time', () => {
    const s0 = roster(2)
    const s = { ...s0, meta: { ...s0.meta, peekedFloors: [1] } }
    const { state } = playFloor(s)
    for (const e of Object.values(state.codex.entries)) expect(e.studied).toBe(true)
    // back on F1 (say, a wipe): the report marks them studied
    const again = { ...state, tower: { ...state.tower, currentFloor: 1 }, meta: { ...state.meta, peekedFloors: [] } }
    const r = scoutFloor(again)!
    expect(r.enemies.every((e) => e.studied && e.templateId !== undefined)).toBe(true)
  })

  it('the daily dungeon records too', () => {
    const s0 = roster(3)
    const s = { ...s0, tower: { ...s0.tower, highestCleared: TUNING.lobby.daily.unlockHighestCleared + 2 } }
    const { state } = attemptDaily(s, 0)
    expect(Object.keys(state.codex.entries).length).toBeGreaterThan(0)
  })
})

describe('codex intel', () => {
  it('knows the wheel counter and keyword weaknesses', () => {
    expect(weakElementOf('fire')).toBe('water')
    expect(weakElementOf('physical')).toBeNull()
    const vuln = Object.values(ENEMY_TEMPLATES).find((t) => t.keywords?.some((k) => k.kind === 'vulnerable'))!
    const k = vuln.keywords!.find((x) => x.kind === 'vulnerable')!
    expect(intelOf(vuln).weakTo).toContain(k.kind === 'vulnerable' ? k.element : null)
    const imm = Object.values(ENEMY_TEMPLATES).find((t) => t.keywords?.some((x) => x.kind === 'immune'))!
    expect(intelOf(imm).immune.length).toBeGreaterThan(0)
  })

  it('files every template under the act where it is first met', () => {
    expect(actOfTemplate('goblin')).toBe('prairie')
    expect(actOfTemplate('shark')).toBe('coast')
    expect(actOfTemplate('halgiraf')).toBe('ruins')
    const all = codexTemplates()
    expect(all).toHaveLength(Object.keys(ENEMY_TEMPLATES).length)
    expect(all[0]!.id).toBe('goblin')
  })
})
