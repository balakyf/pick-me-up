/**
 * Which music a scene wants (pure: chooseTrack) and the player that makes it so: one
 * track at a time on the music bus, switching on the playing track's next bar line (or
 * beat) with a short crossfade, never mid-phrase; the summon's layers follow an intensity
 * level without restarting; the death motif plays on top while the battle ducks.
 */
import { ANCHORS } from '../../engine/content'
import { ACTS, actForFloor } from '../../engine/content/acts'
import { getGraph, onAudioResume } from './mixer'
import { Sequencer, TrackVoice, compileChannel, midiToHz, stepsPerBar, switchTime, nextBeatTime, trackSeconds, type NotePlayer } from './sequencer'
import { getSettings } from '../qol/settings'
import { TRACKS, type TrackId } from './tracks'
import { playInstrument } from './voices'

export type MusicScene = 'none' | 'title' | 'lobby' | 'summon' | 'battle' | 'victory' | 'defeat'

/** What a scene asks for; the player picks the track. */
export interface MusicRequest {
  scene: MusicScene
  /** Lobby: the hour's light and the weather. */
  night?: boolean
  rain?: boolean
  /** Battle: the floor fought and whether it is an anchor (a boss). */
  floor?: number
  boss?: boolean
  /** Summon: the reveal's tier (0 = the chamber at rest, 1..5 = the beam's colour). */
  tier?: number
}

/** The old string scenes still work ('lobby', 'battle', 'none'). */
export type Music = MusicScene | MusicRequest

export function asRequest(m: Music): MusicRequest {
  return typeof m === 'string' ? { scene: m } : m
}

/** Is this floor an anchor (an authored boss floor)? */
export function isAnchorFloor(floor: number): boolean {
  return ANCHORS[floor] !== undefined
}

/** The act number (1..8) of a floor. */
export function actNumber(floor: number): number {
  return ACTS.indexOf(actForFloor(Math.max(1, floor))) + 1
}

/** The world ends on F90; from there the anchors play The World's End. */
export const WORLDS_END_FLOOR = 90
const WALL_ACT = 7

/** The track a request plays, and the intensity of its layers. Pure. */
export function chooseTrack(req: MusicRequest): { id: TrackId | null; intensity: number } {
  switch (req.scene) {
    case 'none':
      return { id: null, intensity: 0 }
    case 'title':
      return { id: 'title', intensity: 0 }
    case 'lobby':
      return { id: req.rain ? 'lobby-rain' : req.night ? 'lobby-night' : 'lobby-day', intensity: 0 }
    case 'summon': {
      // The chamber at rest plays the pad alone; each tier of the beam adds a layer, gold all of them.
      const tier = req.tier ?? 0
      const intensity = tier <= 0 ? 0 : tier <= 2 ? 1 : tier === 3 ? 2 : tier === 4 ? 3 : 4
      return { id: 'summon', intensity }
    }
    case 'battle': {
      const floor = req.floor ?? 1
      const act = actNumber(floor)
      const boss = req.boss ?? isAnchorFloor(floor)
      if (floor >= WORLDS_END_FLOOR && (boss || floor === WORLDS_END_FLOOR)) return { id: 'worlds-end', intensity: 0 }
      if (boss && act === WALL_ACT) return { id: 'wailing-wall', intensity: 0 }
      if (boss) return { id: 'boss', intensity: 0 }
      return { id: `act-${act}` as TrackId, intensity: 0 }
    }
    case 'victory':
      return { id: 'victory', intensity: 0 }
    case 'defeat':
      return { id: 'defeat', intensity: 0 }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The player
// ─────────────────────────────────────────────────────────────────────────────

let seq: Sequencer | null = null
let current: TrackVoice | null = null
let currentId: TrackId | null = null
let intensity = 0
/** The last pitch each channel played (a gliding voice slides from it). */
const lastHz = new WeakMap<object, number>()

const playNote: NotePlayer = (ch, ev, time, stepSec, out) => {
  const g = getGraph()
  if (!g) return
  const tr = ch.transpose ?? 0
  const notes = ev.notes.map((n) => n + tr)
  const gate = ch.inst.kind === 'drums' ? 1 : ch.inst.gate ?? 0.92
  const dur = Math.max(0.03, ev.len * stepSec * gate)
  const prevHz = ch.inst.kind === 'tone' && ch.inst.glide ? lastHz.get(ch) : undefined
  playInstrument(g.ctx, ch.inst, notes, ev.drum, time, dur, ev.vel, { out, send: g.musicSend }, 0, prevHz)
  if (notes.length) lastHz.set(ch, midiToHz(notes[notes.length - 1]!))
}

function sequencer(): Sequencer | null {
  const g = getGraph()
  if (!g) return null
  if (!seq) seq = new Sequencer(g.ctx, playNote)
  return seq
}

/** Start the scheduler again after the context woke (its timer stops when idle). */
onAudioResume(() => seq?.tick())

/**
 * Make `id` the playing track. Same track: only its intensity follows. Otherwise the
 * old one stops at its next bar line (or beat), fading out across the seam, and the new
 * one starts on that line.
 */
export function playTrack(id: TrackId | null, level = 0): void {
  const g = getGraph()
  const s = sequencer()
  if (!g || !s) {
    currentId = id
    intensity = level
    return
  }
  if (id === currentId && current && !current.ended) {
    intensity = level
    current.intensity = level
    return
  }
  if (id === currentId && current?.ended && !TRACKS[id!]?.loop) return // a one-shot already played
  const now = g.ctx.currentTime + 0.03
  const old = current
  const track = id ? TRACKS[id] : null
  let at = now
  if (old && !old.ended) {
    const ot = old.track
    const entry = track?.entry ?? 'bar'
    at =
      entry === 'now'
        ? now
        : entry === 'beat'
          ? nextBeatTime(old.start, now, ot.bpm)
          : switchTime(old.start, now, ot.bpm, ot.stepsPerBeat, stepsPerBar(ot))
    fadeOut(old, at, track ? 0.25 : 0.8)
  }
  currentId = id
  intensity = level
  current = null
  if (!track) return
  const gain = g.ctx.createGain()
  const level0 = track.gain ?? 1
  const fadeIn = track.fadeIn ?? (track.loop ? 0.6 : 0)
  gain.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : level0, at)
  if (fadeIn > 0) gain.gain.exponentialRampToValueAtTime(level0, at + fadeIn)
  gain.connect(g.musicBus)
  for (const ch of track.channels) compileChannel(ch)
  current = new TrackVoice(track, at, gain, level)
  s.add(current)
}

function fadeOut(v: TrackVoice, at: number, over: number): void {
  const g = getGraph()
  if (!g) return
  v.stopAt = at
  const p = v.gain.gain
  // Hold whatever level the automation reaches at the switch (a track still fading in keeps
  // its ramp up to there); plain cancelScheduledValues would drop an unfinished fade-in and
  // silence the old track at once.
  if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(at)
  else {
    p.cancelScheduledValues(at)
    p.setValueAtTime(Math.max(0.0001, p.value), at)
  }
  p.exponentialRampToValueAtTime(0.0001, at + over)
  const gain = v.gain
  setTimeout(() => {
    try {
      gain.disconnect()
    } catch {
      /* gone */
    }
  }, (at - g.ctx.currentTime + over + 2.5) * 1000)
}

/** Stop the music now (mute): a quick fade. */
export function stopTrack(): void {
  const g = getGraph()
  if (current && g) fadeOut(current, g.ctx.currentTime, 0.15)
  current = null
  currentId = null
}

/** The stingers still sounding, by track (a second death fades the first motif out). */
const stingers = new Map<TrackId, TrackVoice>()

/** Play a one-shot over the current music (the death motif), on the music level but past the duck. */
export function playStinger(id: TrackId): void {
  const g = getGraph()
  const s = sequencer()
  if (!g || !s || getSettings().muted) return
  // Two heroes falling close together: the motif starts again for the second, it never
  // plays twice over itself out of step.
  const prev = stingers.get(id)
  if (prev && !prev.ended) fadeOut(prev, g.ctx.currentTime, 0.3)
  const track = TRACKS[id]
  const gain = g.ctx.createGain()
  gain.gain.value = track.gain ?? 1
  gain.connect(g.musicVol)
  const v = new TrackVoice(track, g.ctx.currentTime + 0.04, gain, 0)
  stingers.set(id, v)
  s.add(v)
  setTimeout(() => {
    try {
      gain.disconnect()
    } catch {
      /* gone */
    }
  }, (trackSeconds(track) + 2.5) * 1000)
}

/** For the dev hook and tests: what the player holds. */
export function playerState(): { track: TrackId | null; intensity: number; scheduled: boolean } {
  return { track: currentId, intensity, scheduled: !!current && !current.ended }
}

/** Seconds into the current track (for the dev hook). */
export function trackClock(): number | null {
  const g = getGraph()
  return g && current ? g.ctx.currentTime - current.start : null
}
