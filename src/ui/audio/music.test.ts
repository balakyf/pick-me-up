import { describe, expect, it } from 'vitest'
import { musicKey, pushMusic, pushMusicEntry } from './useSound'
import { isMuted, playMusic, setMuted, wantedMusic, wantedTrack } from './sound'
import { actNumber, chooseTrack, isAnchorFloor } from './music'

describe('which track a scene plays', () => {
  it('the title, the lobby by day, night and rain (rain wins over the night)', () => {
    expect(chooseTrack({ scene: 'title' }).id).toBe('title')
    expect(chooseTrack({ scene: 'lobby' }).id).toBe('lobby-day')
    expect(chooseTrack({ scene: 'lobby', night: true }).id).toBe('lobby-night')
    expect(chooseTrack({ scene: 'lobby', rain: true }).id).toBe('lobby-rain')
    expect(chooseTrack({ scene: 'lobby', night: true, rain: true }).id).toBe('lobby-rain')
    expect(chooseTrack({ scene: 'none' }).id).toBeNull()
  })

  it('one battle theme per act, from the floor', () => {
    const filler: Record<number, string> = { 3: 'act-1', 12: 'act-2', 22: 'act-3', 32: 'act-4', 37: 'act-5', 72: 'act-6', 83: 'act-7', 93: 'act-8' }
    for (const [floor, id] of Object.entries(filler)) {
      expect(isAnchorFloor(Number(floor))).toBe(false)
      expect(chooseTrack({ scene: 'battle', floor: Number(floor) }).id).toBe(id)
    }
    expect([1, 10, 11, 20, 21, 30, 31, 35, 36, 69, 70, 79, 80, 89, 90, 100].map(actNumber)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8])
  })

  it('anchors get the boss theme; the Wall’s anchors the Wailing Wall; F90 and after the world’s end', () => {
    expect(chooseTrack({ scene: 'battle', floor: 10 }).id).toBe('boss')
    expect(chooseTrack({ scene: 'battle', floor: 60 }).id).toBe('boss')
    expect(chooseTrack({ scene: 'battle', floor: 80 }).id).toBe('wailing-wall')
    expect(chooseTrack({ scene: 'battle', floor: 85 }).id).toBe('wailing-wall')
    expect(chooseTrack({ scene: 'battle', floor: 90 }).id).toBe('worlds-end')
    expect(chooseTrack({ scene: 'battle', floor: 95, boss: true }).id).toBe('worlds-end')
    // A caller can say a floor is not a boss fight (an event battle on an anchor floor).
    expect(chooseTrack({ scene: 'battle', floor: 10, boss: false }).id).toBe('act-1')
  })

  it('the summon’s layers rise with the beam’s tier', () => {
    expect([0, 1, 2, 3, 4, 5].map((tier) => chooseTrack({ scene: 'summon', tier }))).toEqual([
      { id: 'summon', intensity: 0 },
      { id: 'summon', intensity: 1 },
      { id: 'summon', intensity: 1 },
      { id: 'summon', intensity: 2 },
      { id: 'summon', intensity: 3 },
      { id: 'summon', intensity: 4 },
    ])
  })

  it('the jingles', () => {
    expect(chooseTrack({ scene: 'victory' }).id).toBe('victory')
    expect(chooseTrack({ scene: 'defeat' }).id).toBe('defeat')
  })
})

describe('scene music', () => {
  it('a battle plays over the lobby and the lobby theme comes back after', () => {
    const popLobby = pushMusic({ scene: 'lobby', night: true })
    expect(wantedTrack()).toBe('lobby-night')
    const popBattle = pushMusic({ scene: 'battle', floor: 12 })
    expect(wantedTrack()).toBe('act-2')
    popBattle()
    expect(wantedTrack()).toBe('lobby-night')
    popBattle() // twice is harmless
    expect(wantedTrack()).toBe('lobby-night')
    popLobby()
    expect(wantedTrack()).toBeNull()
  })

  it('popping a scene underneath leaves the top one playing', () => {
    const a = pushMusic('lobby')
    const b = pushMusic('battle')
    a()
    expect(wantedTrack()).toBe('act-1')
    b()
    expect(wantedTrack()).toBeNull()
  })

  it('an entry retargets in place: the battle turns into its jingle; an entry under it waits', () => {
    const lobby = pushMusicEntry({ scene: 'lobby' })
    const battle = pushMusicEntry({ scene: 'battle', floor: 80 })
    expect(wantedTrack()).toBe('wailing-wall')
    battle.set({ scene: 'victory' })
    expect(wantedTrack()).toBe('victory')
    // The hour turns in the lobby underneath: nothing changes until the battle closes.
    lobby.set({ scene: 'lobby', night: true })
    expect(wantedTrack()).toBe('victory')
    battle.pop()
    expect(wantedTrack()).toBe('lobby-night')
    lobby.pop()
    expect(wantedTrack()).toBeNull()
  })

  it('equal requests share a key; a different hour, floor or tier does not', () => {
    expect(musicKey('lobby')).toBe(musicKey({ scene: 'lobby' }))
    expect(musicKey({ scene: 'lobby', night: true })).not.toBe(musicKey({ scene: 'lobby' }))
    expect(musicKey({ scene: 'battle', floor: 3 })).not.toBe(musicKey({ scene: 'battle', floor: 4 }))
    expect(musicKey({ scene: 'summon', tier: 3 })).not.toBe(musicKey({ scene: 'summon', tier: 4 }))
  })

  it('muting keeps the wanted track, so unmuting can restart it (B12)', () => {
    const was = isMuted()
    playMusic({ scene: 'battle', floor: 5 })
    setMuted(true)
    expect(isMuted()).toBe(true)
    expect(wantedTrack()).toBe('boss')
    setMuted(false)
    expect(wantedTrack()).toBe('boss')
    expect(wantedMusic()).toEqual({ scene: 'battle', floor: 5 })
    setMuted(was)
    playMusic('none')
  })
})
