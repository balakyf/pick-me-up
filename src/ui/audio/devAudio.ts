/**
 * A window hook for checking the audio without ears (dev builds and `?dev=1`):
 * `window.__pmuAudio.state()` says whether the context runs, which track the scene asked
 * for and which one plays, its layers, the bus levels, the duck and the ambience mix.
 * `window.__pmuAudio.cue('hit', { element: 'fire' })` plays a cue.
 */
import { devToolsEnabled } from '../qol/devTools'
import { getSettings } from '../qol/settings'
import { ambienceLevels } from './useLobbyAudio'
import { busLevels, contextState, getGraph, isDucked } from './mixer'
import { playerState, trackClock } from './music'
import { TRACKS } from './tracks'
import { sfx, wantedMusic, wantedTrack } from './sound'
import type { CueName, CueOpts } from './cues'

export interface AudioDevState {
  context: string
  wanted: ReturnType<typeof wantedMusic>
  wantedTrack: string | null
  playing: string | null
  playingTitle: string | null
  intensity: number
  scheduled: boolean
  clock: number | null
  levels: { master: number; music: number; sfx: number }
  liveGains: { master: number; music: number; sfx: number; duck: number } | null
  ducked: boolean
  ambience: ReturnType<typeof ambienceLevels>
}

export function audioDevState(): AudioDevState {
  const p = playerState()
  const g = getGraph()
  return {
    context: contextState(),
    wanted: wantedMusic(),
    wantedTrack: wantedTrack(),
    playing: p.track,
    playingTitle: p.track ? TRACKS[p.track].title : null,
    intensity: p.intensity,
    scheduled: p.scheduled,
    clock: trackClock(),
    levels: busLevels(getSettings()),
    liveGains: g ? { master: g.master.gain.value, music: g.musicVol.gain.value, sfx: g.sfxVol.gain.value, duck: g.duck.gain.value } : null,
    ducked: isDucked(),
    ambience: ambienceLevels(),
  }
}

export function installAudioDevHook(): void {
  if (typeof window === 'undefined' || !devToolsEnabled()) return
  ;(window as unknown as { __pmuAudio: unknown }).__pmuAudio = {
    state: audioDevState,
    cue: (name: CueName, opts?: CueOpts) => sfx(name, opts),
  }
}
