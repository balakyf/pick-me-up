import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { battleStats, mvpReason } from './battleStats'
import { realLogs } from '../battle/realLogs.testkit'

type Ev = CombatEvent extends infer E ? (E extends unknown ? Omit<E, 'seq' | 'tick'> : never) : never

function unit(id: string, side: 'hero' | 'enemy', maxHP = 100, extra: Partial<CombatUnitInit> = {}): CombatUnitInit {
  return { id, name: id === 'a' ? 'Ana Vel' : id, side, line: 'front', unitClass: null, element: 'physical', level: 1, maxHP, maxSP: 10, cp: 1, ...extra }
}

function log(units: CombatUnitInit[], events: Ev[]): CombatLog {
  return {
    seed: 1,
    floor: 1,
    encounterContext: 'tower',
    unitsInit: units,
    events: events.map((e, i) => ({ seq: i, tick: i, ...e }) as CombatEvent),
    outcome: 'win',
    rngDraws: 0,
  }
}

const UNITS = [unit('a', 'hero'), unit('b', 'hero'), unit('esc', 'hero', 100, { isNpc: true }), unit('x', 'enemy', 50), unit('y', 'enemy', 80)]

describe('battleStats', () => {
  it('credits damage dealt and taken without overkill, and kills to the last blow', () => {
    const s = battleStats(
      log(UNITS, [
        { kind: 'act', actorId: 'a', skillId: 'basic', targetId: 'x' },
        { kind: 'hit', actorId: 'a', targetId: 'x', amount: 30, crit: false, hpAfter: 20 },
        { kind: 'act', actorId: 'b', skillId: 'cleave', targetId: 'x' },
        // 90 rolled, but only 20 HP were left.
        { kind: 'hit', actorId: 'b', targetId: 'x', amount: 90, crit: true, hpAfter: -70 },
        { kind: 'death', unitId: 'x' },
        { kind: 'hit', actorId: 'y', targetId: 'a', amount: 25, crit: false, hpAfter: 75 },
      ]),
    )
    const [a, b] = s.heroes
    expect(s.heroes.map((h) => h.id)).toEqual(['a', 'b']) // the escort is not a hero
    expect(a).toMatchObject({ dealt: 30, taken: 25, kills: 0, crits: 0, casts: 0 })
    expect(b).toMatchObject({ dealt: 20, kills: 1, crits: 1, casts: 1 })
    expect(s.team).toMatchObject({ dealt: 50, taken: 25, kills: 1, crits: 1, casts: 1 })
  })

  it('counts DoT damage and DoT kills for their source', () => {
    const s = battleStats(
      log(UNITS, [
        { kind: 'status', unitId: 'x', status: 'poison', sourceId: 'a', ticks: 3, value: 10 },
        { kind: 'dot', unitId: 'x', status: 'poison', amount: 30, hpAfter: 20, sourceId: 'a' },
        { kind: 'dot', unitId: 'x', status: 'poison', amount: 30, hpAfter: -10, sourceId: 'a' },
        { kind: 'death', unitId: 'x' },
      ]),
    )
    expect(s.heroes[0]).toMatchObject({ dealt: 50, kills: 1 })
  })

  it('a bleed a hero put on itself (Berserk) is not a blow taken', () => {
    const s = battleStats(
      log(UNITS, [
        { kind: 'status', unitId: 'a', status: 'bleed', sourceId: 'a', ticks: 2, value: 5 },
        { kind: 'dot', unitId: 'a', status: 'bleed', amount: 5, hpAfter: 95, sourceId: 'a' },
        { kind: 'hit', actorId: 'y', targetId: 'a', amount: 10, crit: false, hpAfter: 85 },
      ]),
    )
    expect(s.heroes[0]).toMatchObject({ taken: 10, dealt: 0 })
  })

  it('credits heals to the healer (lifesteal to the striker) up to the HP restored, and shield soak to the shield’s caster', () => {
    const s = battleStats(
      log(UNITS, [
        { kind: 'hit', actorId: 'y', targetId: 'a', amount: 60, crit: false, hpAfter: 40 },
        // b heals a for 80, but only 60 were missing.
        { kind: 'heal', unitId: 'a', amount: 80, hpAfter: 100, sourceId: 'b' },
        { kind: 'hit', actorId: 'y', targetId: 'b', amount: 10, crit: false, hpAfter: 90 },
        { kind: 'heal', unitId: 'b', amount: 5, hpAfter: 95 },
        { kind: 'status', unitId: 'a', status: 'shield', sourceId: 'b', ticks: 5, value: 40 },
        { kind: 'shield', unitId: 'a', actorId: 'y', absorbed: 25, left: 15 },
        // An enemy healing an enemy is nobody's credit.
        { kind: 'heal', unitId: 'y', amount: 10, hpAfter: 80, sourceId: 'y' },
      ]),
    )
    const b = s.heroes[1]!
    expect(b.healed).toBe(65)
    expect(b.shielded).toBe(25)
    expect(s.team.healed).toBe(65)
  })

  it('a big move broken by a stun or a kill mid wind-up goes to who broke it; braced ones count as answered', () => {
    const s = battleStats(
      log(UNITS, [
        { kind: 'telegraph', unitId: 'x', skillId: 'slam', firesAtTick: 5, targets: ['a'] },
        { kind: 'status', unitId: 'x', status: 'stun', sourceId: 'b', ticks: 0 },
        { kind: 'telegraph-end', unitId: 'x', skillId: 'slam', reason: 'stunned' },
        { kind: 'telegraph', unitId: 'y', skillId: 'slam', firesAtTick: 9, targets: ['a'] },
        { kind: 'act', actorId: 'y', skillId: 'slam', targetId: 'a', charged: true, answered: 'guard' },
        { kind: 'telegraph', unitId: 'y', skillId: 'slam', firesAtTick: 12, targets: ['b'] },
        { kind: 'hit', actorId: 'a', targetId: 'y', amount: 80, crit: false, hpAfter: 0 },
        { kind: 'telegraph-end', unitId: 'y', skillId: 'slam', reason: 'fell' },
        { kind: 'death', unitId: 'y' },
      ]),
    )
    expect(s.team.bigMoves).toBe(3)
    expect(s.team.answered).toBe(3)
    expect(s.heroes[0]!.broke).toBe(1)
    expect(s.heroes[1]!.broke).toBe(1)
    // A charged blow is not a skill cast of the foe's turn, and never a hero's cast.
    expect(s.team.casts).toBe(0)
  })

  it('tallies orders by kind and the heroes they named', () => {
    const s = battleStats(
      log(UNITS, [
        { kind: 'order', order: { tick: 1, kind: 'focus', enemyId: 'x' } },
        { kind: 'order', order: { tick: 2, kind: 'protect', allyId: 'b' } },
        { kind: 'order', order: { tick: 3, kind: 'swap', a: 'a', b: 'b' } },
      ]),
    )
    expect(s.team.ordersUsed).toBe(3)
    expect(s.team.ordersByKind).toEqual({ focus: 1, protect: 1, swap: 1 })
    expect(s.heroes.map((h) => h.orders)).toEqual([1, 2])
  })

  it('crowns an MVP by shares (a healer can win it), ties to the first fielded, none for an idle fight', () => {
    const healer = battleStats(
      log(UNITS, [
        { kind: 'hit', actorId: 'a', targetId: 'x', amount: 10, crit: false, hpAfter: 40 },
        { kind: 'hit', actorId: 'b', targetId: 'x', amount: 10, crit: false, hpAfter: 30 },
        { kind: 'hit', actorId: 'y', targetId: 'a', amount: 50, crit: false, hpAfter: 50 },
        { kind: 'heal', unitId: 'a', amount: 50, hpAfter: 100, sourceId: 'b' },
      ]),
    )
    expect(healer.mvpId).toBe('b')
    expect(mvpReason(healer)).toBe('healed')
    const tie = battleStats(
      log(UNITS, [
        { kind: 'hit', actorId: 'b', targetId: 'x', amount: 10, crit: false, hpAfter: 40 },
        { kind: 'hit', actorId: 'a', targetId: 'y', amount: 10, crit: false, hpAfter: 70 },
      ]),
    )
    expect(tie.mvpId).toBe('a')
    // A token heal never outweighs the fight's real damage.
    const token = battleStats(
      log(UNITS, [
        { kind: 'hit', actorId: 'a', targetId: 'x', amount: 5, crit: false, hpAfter: 45 },
        { kind: 'hit', actorId: 'b', targetId: 'y', amount: 70, crit: false, hpAfter: 10 },
        { kind: 'hit', actorId: 'y', targetId: 'b', amount: 20, crit: false, hpAfter: 80 },
        { kind: 'heal', unitId: 'b', amount: 15, hpAfter: 95, sourceId: 'a' },
      ]),
    )
    expect(token.mvpId).toBe('b')
    expect(mvpReason(token)).toBe('dealt')
    expect(battleStats(log(UNITS, [])).mvpId).toBeNull()
    expect(mvpReason(battleStats(log(UNITS, [])))).toBeNull()
  })

  it('marks the fallen', () => {
    const s = battleStats(log(UNITS, [{ kind: 'hit', actorId: 'y', targetId: 'b', amount: 120, crit: false, hpAfter: -20 }, { kind: 'death', unitId: 'b' }]))
    expect(s.heroes[1]).toMatchObject({ fell: true, taken: 100 })
  })

  it('on the bots’ real fights: totals add up, damage never exceeds the foes’ HP, every kill is a real foe death', () => {
    for (const l of realLogs()) {
      const s = battleStats(l)
      const foes = l.unitsInit.filter((u) => u.side === 'enemy')
      const foeHp = foes.reduce((n, u) => n + (u.startHP ?? u.maxHP), 0)
      const deaths = l.events.filter((e) => e.kind === 'death' && foes.some((u) => u.id === e.unitId)).length
      expect(s.team.dealt).toBe(s.heroes.reduce((n, h) => n + h.dealt, 0))
      expect(s.team.dealt).toBeLessThanOrEqual(foeHp + foes.reduce((n, u) => n + u.maxHP, 0) * 2) // heals let foes take more
      expect(s.team.kills).toBeLessThanOrEqual(deaths)
      for (const h of s.heroes) {
        for (const k of ['dealt', 'taken', 'healed', 'shielded', 'kills', 'crits', 'casts', 'broke'] as const) expect(h[k]).toBeGreaterThanOrEqual(0)
      }
      if (s.team.dealt > 0) expect(s.mvpId).not.toBeNull()
      // Deterministic: the same log, the same report.
      expect(battleStats(l)).toEqual(s)
    }
  })
})
