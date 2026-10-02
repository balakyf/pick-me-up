import { describe, expect, it } from 'vitest'
import { pushMusic } from './useSound'
import { isMuted, playMusic, setMuted, wantedTrack } from './sound'

describe('scene music', () => {
  it('a battle plays over the lobby and the lobby theme comes back after', () => {
    const popLobby = pushMusic('lobby')
    expect(wantedTrack()).toBe('lobby')
    const popBattle = pushMusic('battle')
    expect(wantedTrack()).toBe('battle')
    popBattle()
    expect(wantedTrack()).toBe('lobby')
    popBattle() // twice is harmless
    expect(wantedTrack()).toBe('lobby')
    popLobby()
    expect(wantedTrack()).toBe('none')
  })

  it('popping a scene underneath leaves the top one playing', () => {
    const a = pushMusic('lobby')
    const b = pushMusic('battle')
    a()
    expect(wantedTrack()).toBe('battle')
    b()
    expect(wantedTrack()).toBe('none')
  })

  it('muting keeps the wanted track, so unmuting can restart it', () => {
    const was = isMuted()
    playMusic('battle')
    setMuted(true)
    expect(wantedTrack()).toBe('battle')
    setMuted(false)
    expect(wantedTrack()).toBe('battle')
    setMuted(was)
    playMusic('none')
  })
})
