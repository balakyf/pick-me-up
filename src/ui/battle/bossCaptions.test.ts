import { afterEach, describe, expect, it } from 'vitest'
import type { CombatEvent } from '../../engine/types'
import { setLocale } from '../i18n/i18n'
import { BOSS_DURATION, CHARGED_ACT_MS, afterCharged, anyCharge, bossDuration, bossSnap, chargeLine, chargeOn, chargeProgress, chargedCaption, orderCaption, phaseTitle, type BossView } from './bossCaptions'
import { DURATION, eventDuration } from './battleFrames'

afterEach(() => setLocale('en'))

const nameOf = (id: string) => ({ dragon: 'Halgiraf', a: 'Bram', b: 'Islat', m1: 'Rodvick', m2: 'Lazenca' })[id] ?? id
const ev = <T extends CombatEvent = CombatEvent>(e: Record<string, unknown>) => ({ seq: 1, ...e }) as unknown as T
const frame = () => ({ visible: {} as Record<string, boolean>, caption: 'before', boss: undefined as BossView | undefined })

describe('boss captions and timings', () => {
  it('every boss event has a duration (the scene’s record includes them), a charged blow holds longer', () => {
    for (const k of Object.keys(BOSS_DURATION) as (keyof typeof BOSS_DURATION)[]) expect(DURATION[k]).toBe(BOSS_DURATION[k])
    const fire = ev<Extract<CombatEvent, { kind: 'act' }>>({ tick: 9, kind: 'act', actorId: 'dragon', skillId: 'e_dragon_breath', targetId: 'a', charged: true })
    expect(bossDuration(fire)).toBe(CHARGED_ACT_MS)
    expect(eventDuration(fire)).toBe(CHARGED_ACT_MS)
    expect(bossDuration(ev({ tick: 1, kind: 'act', actorId: 'a', skillId: 'basic', targetId: 'dragon' }))).toBeUndefined()
  })

  it('a wind-up says its line, marks its caster and whom it threatens', () => {
    const f = frame()
    const d = bossSnap(ev({ tick: 4, kind: 'telegraph', unitId: 'dragon', skillId: 'e_dragon_breath', firesAtTick: 14, targets: ['a', 'b'] }), nameOf, f)!
    expect(d.caption).toBe('Halgiraf draws a deep breath…')
    expect(f.boss!.charges).toEqual([{ unitId: 'dragon', skillId: 'e_dragon_breath', fromTick: 4, firesAtTick: 14, targets: ['a', 'b'] }])
    expect(chargeOn(f.boss, 'dragon').winding?.skillId).toBe('e_dragon_breath')
    expect(chargeOn(f.boss, 'a').threatened).toHaveLength(1)
    expect(anyCharge(f.boss)).toBe(true)
    // {target}: the one it aims at.
    expect(chargeLine('e_sky_dive', 'Halgiraf', 'Bram')).toBe('Halgiraf folds his wings for a dive at Bram!')
    // French follows.
    setLocale('fr')
    expect(chargeLine('e_dragon_breath', 'Halgiraf', '')).toBe('Halgiraf prend une profonde inspiration…')
  })

  it('the countdown ring fills from the wind-up to the fire', () => {
    expect(chargeProgress({ fromTick: 10, firesAtTick: 20 }, 10)).toBe(0)
    expect(chargeProgress({ fromTick: 10, firesAtTick: 20 }, 15)).toBe(0.5)
    expect(chargeProgress({ fromTick: 10, firesAtTick: 20 }, 25)).toBe(1)
  })

  it('a cancelled move and a fired move take the mark down, and say how it went', () => {
    const f = frame()
    bossSnap(ev({ tick: 4, kind: 'telegraph', unitId: 'dragon', skillId: 'e_dragon_breath', firesAtTick: 14, targets: ['a'] }), nameOf, f)
    const g = { ...f }
    const d = bossSnap(ev({ tick: 6, kind: 'telegraph-end', unitId: 'dragon', skillId: 'e_dragon_breath', reason: 'stunned' }), nameOf, g)!
    expect(d.caption).toBe('Halgiraf is staggered — the Dragon Breath dies in its throat!')
    expect(g.boss!.charges).toEqual([])
    expect(afterCharged(f.boss, 'dragon').charges).toEqual([])
    const fire = ev<Extract<CombatEvent, { kind: 'act' }>>({ tick: 14, kind: 'act', actorId: 'dragon', skillId: 'e_dragon_breath', targetId: 'a', charged: true, answered: 'guard' })
    expect(chargedCaption(fire, nameOf)).toBe('Halgiraf unleashes Dragon Breath — the party has braced for it!')
    expect(chargedCaption({ ...fire, answered: 'protect' }, nameOf)).toBe('Halgiraf unleashes Dragon Breath — the party covers Bram!')
    expect(chargedCaption({ ...fire, answered: undefined }, nameOf)).toBe('Halgiraf unleashes Dragon Breath!')
  })

  it('a phase sets the cinematic and counts the boss’s passed phases; a summon shows its units', () => {
    const f = frame()
    const d = bossSnap(ev({ seq: 30, tick: 40, kind: 'phase', unitId: 'dragon', phase: 1, phases: 1, title: 'Takes flight', line: 'Halgiraf beats his black wings and takes to the sky!' }), nameOf, f)!
    expect(d.caption).toBe('Halgiraf — Takes flight: “Halgiraf beats his black wings and takes to the sky!”')
    expect(f.boss!.phase).toMatchObject({ unitId: 'dragon', phase: 1, seq: 30 })
    expect(f.boss!.passed).toEqual({ dragon: 1 })
    expect(phaseTitle({ phase: 2 })).toBe('Phase 3')
    const s = bossSnap(ev({ tick: 40, kind: 'summon', unitId: 'dragon', enemyIds: ['m1', 'm2'], wave: 1 }), nameOf, f)!
    expect(s.caption).toBe('Halgiraf calls 2 to its side!')
    expect(f.visible).toEqual({ m1: true, m2: true })
  })

  it('every order speaks', () => {
    expect(orderCaption({ tick: 1, kind: 'unleash', allyId: 'a' }, nameOf)).toBe('The Master: “Bram — now, everything you have!”')
    expect(orderCaption({ tick: 1, kind: 'guard' }, nameOf)).toBe('The Master: “Brace yourselves!”')
    expect(orderCaption({ tick: 1, kind: 'guard', onTelegraph: true }, nameOf)).toContain('brace when it winds up')
    expect(orderCaption({ tick: 1, kind: 'hold' }, nameOf)).toBe('The Master: “Save your strength for the big one!”')
    expect(orderCaption({ tick: 1, kind: 'swap', a: 'a', b: 'b' }, nameOf)).toBe('The Master: “Bram, Islat — change places!”')
    expect(orderCaption({ tick: 1, kind: 'focus', enemyId: 'dragon' }, nameOf)).toBe('The Master: “Everyone on Halgiraf!”')
  })
})
