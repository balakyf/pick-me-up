import { describe, expect, it } from 'vitest'
import { createAccount } from '../../engine/account'
import { defaultLegacyState } from '../../engine/life'
import type { BattleOrder, HeroId } from '../../engine/types'
import { explainFloor, killersOf, mvpOf } from './explain'
import { fixtureLog, fixtureResult } from './fixtures'

// Mira (h_a) is protected at tick 3; the party focuses the Shaman (e_2) at tick 3.
const log = fixtureLog([
  { tick: 1, kind: 'battle-start', heroIds: ['h_a', 'h_b'], enemyIds: ['e_1', 'e_2'] },
  { tick: 1, kind: 'act', actorId: 'e_1', skillId: 'basic-attack', targetId: 'h_a' },
  { tick: 1, kind: 'hit', actorId: 'e_1', targetId: 'h_a', amount: 30, crit: false, hpAfter: 70 },
  { tick: 2, kind: 'act', actorId: 'e_2', skillId: 'hex', targetId: 'h_a' },
  { tick: 2, kind: 'hit', actorId: 'e_2', targetId: 'h_a', amount: 25, crit: false, hpAfter: 45 },
  { tick: 3, kind: 'act', actorId: 'h_b', skillId: 'basic-attack', targetId: 'e_2' },
  { tick: 3, kind: 'hit', actorId: 'h_b', targetId: 'e_2', amount: 60, crit: true, hpAfter: 40 },
  { tick: 4, kind: 'act', actorId: 'e_1', skillId: 'basic-attack', targetId: 'h_b' },
  { tick: 4, kind: 'hit', actorId: 'e_1', targetId: 'h_b', amount: 20, crit: false, hpAfter: 80 },
  { tick: 5, kind: 'act', actorId: 'h_a', skillId: 'basic-attack', targetId: 'e_2' },
  { tick: 5, kind: 'hit', actorId: 'h_a', targetId: 'e_2', amount: 40, crit: false, hpAfter: 0 },
  { tick: 5, kind: 'death', unitId: 'e_2' },
  { tick: 6, kind: 'act', actorId: 'h_b', skillId: 'basic-attack', targetId: 'e_1' },
  { tick: 6, kind: 'hit', actorId: 'h_b', targetId: 'e_1', amount: 100, crit: false, hpAfter: 0 },
  { tick: 6, kind: 'death', unitId: 'e_1' },
  { tick: 6, kind: 'end', outcome: 'win' },
])

const protect: BattleOrder = { tick: 3, kind: 'protect', allyId: 'h_a' }
const focus: BattleOrder = { tick: 3, kind: 'focus', enemyId: 'e_2' }

describe('mvpOf / killersOf', () => {
  it('credits the last hit before each death', () => {
    expect(killersOf(log)).toEqual({ e_2: 'h_a', e_1: 'h_b' })
  })
  it('picks the hero with the most damage, with first names and kill counts', () => {
    expect(mvpOf(log)).toEqual({ id: 'h_b', name: 'Kael', damage: 160, kills: 1 })
  })
  it('is null when no hero landed anything', () => {
    expect(mvpOf(fixtureLog([{ tick: 1, kind: 'end', outcome: 'wipe' }]))).toBeNull()
  })
})

describe('explainFloor', () => {
  it('explains Protect: no enemy touched the protected hero after the order', () => {
    const r = explainFloor(fixtureResult(log), [protect])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ kind: 'protect', icon: '🛡' })
    expect(r[0]!.text).toBe('Protect: no enemy touched Mira after your order.')
  })

  it('explains Protect when the hero still fell', () => {
    const r = explainFloor(fixtureResult(log, { fallenHeroIds: ['h_a' as HeroId] }), [protect])
    expect(r[0]!.text).toBe('Protect: Mira fell anyway, once the line around them broke.')
  })

  it('counts the hits a protected hero still took', () => {
    const r = explainFloor(fixtureResult(log), [{ tick: 4, kind: 'protect', allyId: 'h_b' }])
    expect(r[0]!.text).toBe('Protect: Kael took a single hit after your order and came home.')
  })

  it('explains Focus: the target fell before it could act again', () => {
    const r = explainFloor(fixtureResult(log), [focus])
    expect(r[0]).toMatchObject({ kind: 'focus', text: 'Focus: Goblin Shaman fell before it could act again.' })
  })

  it('explains Focus on a target that held out', () => {
    const lone = fixtureLog(log.events.filter((e) => !(e.kind === 'death' && e.unitId === 'e_2')))
    const r = explainFloor(fixtureResult(lone), [focus])
    expect(r[0]!.text).toBe('Focus: Goblin Shaman held out against the whole party.')
  })

  it('names each order once, in the order given', () => {
    const r = explainFloor(fixtureResult(log), [focus, protect, { ...protect, tick: 5 }])
    expect(r.map((x) => x.kind)).toEqual(['focus', 'protect'])
  })

  it('explains a Retreat by who came home', () => {
    const res = fixtureResult(log)
    const r = explainFloor({ ...res, result: { ...res.result, outcome: 'retreat', survivorHeroIds: ['h_a' as HeroId] } }, [
      { tick: 4, kind: 'retreat' },
    ])
    expect(r[0]).toMatchObject({ kind: 'retreat', text: 'Retreat: you called it, and 1 hero came home.' })
  })

  it('explains the Skull door and its stones', () => {
    const r = explainFloor(fixtureResult(log, { kind: 'elite', materialsAwarded: { promotionStone: 2 } }))
    expect(r).toEqual([{ kind: 'door', icon: '💀', text: 'Skull door: ×2 gold and +2 stones.' }])
    // One stone is "+1 stone", not "+1 stones" (playtest 2026-10-13).
    const one = explainFloor(fixtureResult(log, { kind: 'elite', materialsAwarded: { promotionStone: 1 } }))
    expect(one[0]!.text).toBe('Skull door: ×2 gold and +1 stone.')
  })

  it('explains a Breather clear', () => {
    expect(explainFloor(fixtureResult(log, { kind: 'breather' }))[0]!.kind).toBe('door')
  })

  it('explains a Rout by how many fell', () => {
    const res = fixtureResult(log, { cleared: false, routed: true, fallenHeroIds: ['h_a', 'h_b'] as HeroId[] })
    const r = explainFloor(res)
    expect(r).toEqual([{ kind: 'rout', icon: '⚑', text: 'Rout: the party fled after 2 fell.' }])
  })

  it('explains a Rout with nobody lost without counting the fallen', () => {
    const res = fixtureResult(log, { cleared: false, routed: true, fallenHeroIds: [] })
    expect(explainFloor(res)).toEqual([{ kind: 'rout', icon: '⚑', text: 'Rout: the line broke, and the party fled.' }])
  })

  it('explains a wipe that was not a rout', () => {
    const res = fixtureResult(log, { cleared: false, fallenHeroIds: ['h_a', 'h_b'] as HeroId[] })
    const r = explainFloor({ ...res, result: { ...res.result, outcome: 'wipe' } })
    expect(r.map((x) => x.kind)).toEqual(['wipe'])
  })

  it('names Last Stand and revenge', () => {
    const base = createAccount(3)
    const state = {
      ...base,
      life: {
        ...base.life,
        legacy: {
          ...defaultLegacyState(),
          nemeses: [
            {
              id: 'nem_1',
              templateId: 'goblin',
              name: 'Mira’s Bane',
              element: 'fire' as const,
              level: 7,
              heroId: 'h_x' as HeroId,
              heroName: 'Mira',
              diedFloor: 3,
              revengeFloor: 6,
              status: 'avenged' as const,
            },
          ],
        },
      },
    }
    const r = explainFloor(fixtureResult(log, { lastStandPct: 0.15, nemesisDefeated: ['nem_1'] }), [], state)
    expect(r.map((x) => x.text)).toEqual([
      'Last Stand: +15% to every stat, because the roster is thin.',
      'Revenge: Mira’s Bane fell, and Mira is avenged.',
    ])
  })

  it('is empty for a plain Path clear with no orders', () => {
    expect(explainFloor(fixtureResult(log, { kind: 'path' }))).toEqual([])
  })
})

describe('Because… a Pull back (the withdraw order)', () => {
  const pulled: BattleOrder = { tick: 3, kind: 'withdraw', allyId: 'h_a' }
  it('says the hero came home shaken, with the Sanity the engine took, after the Saved line', () => {
    const r = explainFloor(fixtureResult(log, { shaken: [{ heroId: 'h_a' as HeroId, sanity: 19.6 }] }), [pulled], undefined, ['h_a'])
    expect(r.map((x) => x.kind)).toEqual(['saved', 'withdraw'])
    expect(r[1]!.text).toBe('Pulled back: Mira came home shaken (−20 Sanity).')
  })
  it('says nothing of it when the engine reports no shaken hero', () => {
    expect(explainFloor(fixtureResult(log), [pulled])).toEqual([])
  })
})
