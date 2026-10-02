import { afterEach, describe, expect, it } from 'vitest'
import type { CombatEvent, MissionCode, MissionParams } from '../../engine/types'
import { setLocale } from '../i18n/i18n'
import { MISSION_DURATION, missionCaption, missionDuration } from './missionCaptions'
import { eventDuration } from './battleFrames'
import { attackStyle } from './choreo'
import { popupLook } from './DamagePopups'

type Beat = Extract<CombatEvent, { kind: 'mission' }>
const beat = (code: MissionCode | undefined, params: MissionParams = {}, note = 'A plain note.'): Beat => ({
  seq: 0,
  tick: 0,
  kind: 'mission',
  note,
  ...(code !== undefined ? { code, params } : {}),
})
const names: Record<string, string> = { p: 'the Black Priest', vip: 'Princess Priasis', lv: 'Lv999 Creature' }
const nameOf = (id: string) => names[id] ?? id

afterEach(() => setLocale('en'))

describe('mission captions', () => {
  it('every beat has a caption and a timing', () => {
    const all = Object.keys(MISSION_DURATION) as MissionCode[]
    expect(all).toHaveLength(11)
    for (const code of all) {
      const e = beat(code, { wave: 1, waves: 3, pct: 50, left: 10, steps: 5, distance: 10, unitId: 'p' })
      expect(missionCaption(e, nameOf).length, code).toBeGreaterThan(3)
      expect(missionDuration(e)).toBeGreaterThanOrEqual(800)
      expect(eventDuration(e)).toBe(missionDuration(e))
    }
  })

  it('says what happened, with names and numbers', () => {
    expect(missionCaption(beat('wave-cleared', { wave: 2, waves: 3 }), nameOf)).toBe('Wave 2 of 3 cleared!')
    expect(missionCaption(beat('hold', { pct: 75, left: 50 }), nameOf)).toBe('Almost there — just a little longer!')
    expect(missionCaption(beat('deadline', { pct: 75 }), nameOf)).toBe('Time is running out!')
    expect(missionCaption(beat('escape', { pct: 50 }), nameOf)).toBe('Halfway to the exit!')
    expect(missionCaption(beat('defeated', { unitId: 'p' }), nameOf)).toBe('Objective down — the Black Priest is defeated!')
    expect(missionCaption(beat('escort-low', { unitId: 'vip', pct: 50 }), nameOf)).toBe('Princess Priasis is wounded — keep them safe!')
    expect(missionCaption(beat('escort-low', { unitId: 'vip', pct: 25 }), nameOf)).toBe('Princess Priasis is in grave danger!')
    expect(missionCaption(beat('wakes', { unitId: 'lv' }), nameOf)).toBe('Lv999 Creature wakes…')
    expect(missionCaption(beat('horde-spent', { left: 700 }), nameOf)).toBe('The horde is spent — the floor is held!')
    expect(missionCaption(beat('futile', { unitId: 'p' }), nameOf)).toBe('Nothing we have can touch the Black Priest — fall back!')
  })

  it('a beat from an older log (no code) shows its note', () => {
    expect(missionCaption(beat(undefined, {}, 'The gate opens.'), nameOf)).toBe('The gate opens.')
    expect(missionDuration(beat(undefined))).toBe(900)
  })

  it('speaks French', () => {
    setLocale('fr')
    expect(missionCaption(beat('wave-cleared', { wave: 1, waves: 2 }), nameOf)).toBe('Vague 1 sur 2 repoussée !')
    expect(missionCaption(beat('horde-spent'), nameOf)).toBe('La horde est épuisée — l’étage est tenu !')
  })
})

describe('hit effectiveness popups', () => {
  type Hit = Extract<CombatEvent, { kind: 'hit' }>
  const hit = (o: Partial<Hit> = {}): Hit => ({ seq: 1, tick: 1, kind: 'hit', actorId: 'h', targetId: 'e', amount: 42, crit: false, hpAfter: 50, ...o })
  it('IMMUNE instead of "CRITICAL! 0"', () => {
    expect(popupLook(hit({ amount: 0, crit: true, eff: 'immune' }))).toMatchObject({ text: 'IMMUNE', cls: 'immune', tag: null })
  })
  it('WEAK! and RESIST ride over the number (with CRITICAL! when both)', () => {
    expect(popupLook(hit({ eff: 'weak' }))).toMatchObject({ text: '42', cls: 'weak', tag: 'WEAK!', tagCls: 'weak' })
    expect(popupLook(hit({ eff: 'resist' }))).toMatchObject({ cls: 'resist', tag: 'RESIST', tagCls: 'resist' })
    expect(popupLook(hit({ eff: 'weak', crit: true }))).toMatchObject({ cls: 'crit', tag: 'CRITICAL! WEAK!' })
    expect(popupLook(hit({ eff: 'weak', hpAfter: 0 }))).toMatchObject({ cls: 'kill', tag: 'WEAK!' })
    expect(popupLook(hit())).toMatchObject({ cls: '', tag: null })
  })
})

describe("a caster foe's Spell", () => {
  it('flies as a bolt, whatever the foe is called', () => {
    const foe = { id: 'w', name: 'Wraith', side: 'enemy' as const, line: 'front' as const, unitClass: 'mage' as const, element: 'dark' as const, level: 70, maxHP: 1, maxSP: 0, cp: 1 }
    expect(attackStyle(foe, 'e_spell', 24)).toBe('magic')
    expect(attackStyle(foe, 'e_basic', 24)).toBe('melee')
  })
})
