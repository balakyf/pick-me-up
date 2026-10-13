import { describe, expect, it } from 'vitest'
import { createAccount } from '../../engine/account'
import type { FloorKind } from '../../engine/types'
import { DOOR_TITLE, KIND_LABEL, boonIcon, boonText, cacheGold, currentKind, doorBlurb, humanizeId, isFightKind } from './kinds'
import { atFloor } from './fixtures'

const KINDS: FloorKind[] = ['tutorial', 'breather', 'path', 'elite', 'rest', 'cache', 'boss']

describe('floor kinds as the player sees them', () => {
  it('fights every kind but Rest and Cache', () => {
    expect(KINDS.filter(isFightKind)).toEqual(['tutorial', 'breather', 'path', 'elite', 'boss'])
  })

  it('reads the current kind from the climb, refining the default Path by the floor', () => {
    const s = createAccount(2)
    expect(currentKind(atFloor(s, { currentFloor: 1, kind: 'path' }))).toBe('tutorial')
    expect(currentKind(atFloor(s, { currentFloor: 10, kind: 'path' }))).toBe('boss')
    expect(currentKind(atFloor(s, { currentFloor: 6, kind: 'path' }))).toBe('path')
    expect(currentKind(atFloor(s, { currentFloor: 6, kind: 'elite' }))).toBe('elite')
    expect(currentKind(atFloor(s, { currentFloor: 11, kind: 'breather' }))).toBe('breather')
  })

  it('labels the Elite door the Skull and the Cache door "Cache"', () => {
    expect(DOOR_TITLE.elite).toBe('Skull')
    expect(DOOR_TITLE.cache).toBe('Cache')
    expect(KIND_LABEL.elite).toBe('Elite')
  })

  it('never puts smoke-test trigger words on a door (first-match button clicks)', () => {
    const forbidden = /Enter|Treasure|Menu|Advanced|Banquet|Summon ×10|Claim \+50|Captives|Honey Cake/
    for (const k of KINDS) {
      expect(DOOR_TITLE[k]).not.toMatch(forbidden)
      expect(doorBlurb({ kind: k, reward: 'gold' }, 7)).not.toMatch(forbidden)
    }
  })

  it('prices the Cache door by floor', () => {
    expect(doorBlurb({ kind: 'cache', reward: 'gold' }, 7)).toContain(cacheGold(7).toLocaleString())
  })
})

describe('boons as the player sees them', () => {
  it('has an icon for each of the twelve, in either id style, and a fallback', () => {
    expect(boonIcon('volley')).toBe('🏹')
    expect(boonIcon('iron_vow')).toBe('🛡')
    expect(boonIcon('unknown')).toBe('✦')
  })
  it('falls back to a readable name before the Boon list exists', () => {
    expect(humanizeId('huntersMark')).toBe('Hunters Mark')
    expect(humanizeId('second_wind')).toBe('Second Wind')
    expect(boonText('calmMind').name).toBe('Calm Mind')
  })
})
