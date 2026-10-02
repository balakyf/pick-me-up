/**
 * Chiptune sound, synthesised with the Web Audio API — no audio assets, in keeping with
 * the code-generated pixel art. Cosmetic only: no game state rides on it.
 *
 * This is the small public face of the audio system:
 *  - `sfx(name, opts)` plays a cue (cues.ts);
 *  - `playMusic(request)` says what the scene wants (music.ts picks the track: the title,
 *    the lobby by day / night / rain, the summon with its tiers, an act's battle theme,
 *    a boss, the Wailing Wall, the world's end, the victory and defeat jingles);
 *  - mute and the levels live in the Settings window (qol/settings.ts);
 *  - `unlockAudio()` wakes the context on the first gesture.
 *
 * Silent (no-op) wherever there is no AudioContext (tests, old browsers).
 */
import { getSettings, onSettingsChange, updateSettings } from '../qol/settings'
import { playCue, type CueName, type CueOpts } from './cues'
import { ensureGraph, getGraph, onAudioResume, resumeAudio } from './mixer'
import { asRequest, chooseTrack, playTrack, stopTrack, type Music, type MusicRequest } from './music'
import type { TrackId } from './tracks'

export type Sfx = CueName
export type { Music, MusicRequest } from './music'

/** Play a sound effect. */
export function sfx(name: Sfx, opts?: CueOpts): void {
  playCue(name, opts)
}

// ── Mute (kept for the old callers; the Settings window owns it now) ─────────

export function isMuted(): boolean {
  return getSettings().muted
}

export function setMuted(m: boolean): void {
  updateSettings({ muted: m })
}

const muteListeners = new Set<() => void>()
let lastMuted = isMuted()
onSettingsChange((s) => {
  if (s.muted === lastMuted) return
  lastMuted = s.muted
  // Muting stops the track (the wish is kept); unmuting starts the scene's track again.
  syncMusic()
  for (const fn of muteListeners) fn()
})

export function onMuteChange(fn: () => void): () => void {
  muteListeners.add(fn)
  return () => {
    muteListeners.delete(fn)
  }
}

// ── Music ────────────────────────────────────────────────────────────────────

/** What the scene on screen asked for (kept while muted or before the first gesture). */
let wanted: MusicRequest = { scene: 'none' }

/** Ask for a scene's music. It plays now if sound is on and the context runs; otherwise it
 *  waits for unmute or the first gesture (unlockAudio). */
export function playMusic(m: Music): void {
  wanted = asRequest(m)
  syncMusic()
}

/** The request the scene made (whether or not it can play yet). */
export function wantedMusic(): MusicRequest {
  return wanted
}

/** The track the scene wants (null = silence). */
export function wantedTrack(): TrackId | null {
  return chooseTrack(wanted).id
}

/** Bring the player in line with the wish, the mute and the context. */
function syncMusic(): void {
  if (isMuted()) {
    stopTrack()
    return
  }
  // Never create the context here: browsers only allow it after a gesture (unlockAudio).
  const g = getGraph()
  if (!g) return
  const { id, intensity } = chooseTrack(wanted)
  playTrack(id, intensity)
}

onAudioResume(syncMusic)

export function stopMusic(): void {
  stopTrack()
}

/** Wake the audio after a user gesture (browsers start it suspended). */
export function unlockAudio(): void {
  // Already awake: nothing to do (this runs on every click and key press).
  if (getGraph()?.ctx.state === 'running') return
  if (!ensureGraph()) return
  resumeAudio()
  syncMusic()
}
