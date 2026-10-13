/**
 * Chiptune sound, synthesised with the Web Audio API — no audio assets, in keeping with
 * the code-generated pixel art. Short square/triangle/noise envelopes for effects and a
 * tiny looping arpeggio per scene. Cosmetic only: no game state rides on it.
 *
 * Silent (no-op) wherever there is no AudioContext (tests, old browsers). Muted state is
 * a per-browser preference in localStorage.
 */

export type Sfx =
  | 'click'
  | 'hit'
  | 'crit'
  | 'miss'
  | 'guard'
  | 'heal'
  | 'death'
  | 'panic'
  | 'victory'
  | 'defeat'
  | 'summon'
  | 'rare'
  | 'legend'
  | 'levelup'
  | 'fail'
  // WP0 (spec 2026-10-12): new cues, simple first-pass synths. Owners refine them.
  | 'reveal'
  | 'coin'
  | 'heroFall'
  | 'unlock'
  | 'boon'
  | 'door'
  | 'stamp'
  | 'saved'
  // WP2: the Decisive Moment's heartbeat.
  | 'decisive'

/** Optional per-call shaping. Omitted = the exact sound as before. */
export interface SfxOpts {
  /** Transpose the whole cue by this many semitones (e.g. rising combo pitch). Default 0. */
  semis?: number
  /** Rarity of the thing being revealed (1..5); used by 'reveal'. Default 1. */
  star?: number
}

// ── Hit variation (WP2) ──────────────────────────────────────────────────────
// A hit is layered: a bright transient (high-passed noise) plus a pitched body, and a
// sub thump on crits. Each hit takes the next of 4 rotating variants (so the same one
// never plays twice in a row) and a ±80-cent detune. Both come from a counter, not
// Math.random, so the sequence is reproducible.

/** Number of rotating hit/crit variants. */
export const HIT_VARIANTS = 4
/** Detune range, ± cents. */
export const HIT_DETUNE_CENTS = 80

/** The variant the n-th hit uses (0..HIT_VARIANTS-1); consecutive hits always differ. */
export function hitVariant(n: number): number {
  return ((Math.floor(n) % HIT_VARIANTS) + HIT_VARIANTS) % HIT_VARIANTS
}

/** The detune (cents, within ±80) the n-th hit uses. */
export function hitDetune(n: number): number {
  // A cheap integer hash of n, folded into [-80, 80].
  let h = Math.imul(Math.floor(n) ^ 0x9e3779b9, 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h % (2 * HIT_DETUNE_CENTS + 1)) - HIT_DETUNE_CENTS
}

/** Body shapes per variant: waveform, start and end notes (relative to the cue's root). */
const HIT_BODY: readonly { type: OscillatorType; from: number; to: number; dur: number }[] = [
  { type: 'square', from: 0, to: -12, dur: 0.08 },
  { type: 'triangle', from: 2, to: -10, dur: 0.09 },
  { type: 'square', from: -2, to: -13, dur: 0.07 },
  { type: 'sawtooth', from: 0, to: -9, dur: 0.075 },
]

let hitCounter = 0

export type Music = 'lobby' | 'battle' | 'none'

const MUTE_KEY = 'pmu.muted'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let musicTimer: ReturnType<typeof setInterval> | null = null
let currentMusic: Music = 'none'
/** Frequency multiplier applied by tone() while one sfx() call is playing (1 = untransposed). */
let pitch = 1

function readMuted(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return true
  }
}

let muted = readMuted()
const listeners = new Set<() => void>()

export function isMuted(): boolean {
  return muted
}

export function onMuteChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setMuted(m: boolean): void {
  muted = m
  try {
    window.localStorage.setItem(MUTE_KEY, m ? '1' : '0')
  } catch {
    /* storage may be unavailable */
  }
  if (master) master.gain.value = m ? 0 : 0.18
  if (m) stopMusic()
  for (const fn of listeners) fn()
}

/** Lazily create the context on first use (browsers require a user gesture first). */
function audio(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined
  if (!Ctor) return null
  try {
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.18
    master.connect(ctx.destination)
  } catch {
    ctx = null
  }
  return ctx
}

/** One enveloped tone. */
function tone(freq: number, dur: number, type: OscillatorType, at = 0, vol = 1, slideTo?: number): void {
  const a = audio()
  if (!a || !master || muted) return
  const t0 = a.currentTime + at
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq * pitch, t0)
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo * pitch), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** A burst of noise (hits, deaths). `highpass` (Hz) thins it into a bright transient. */
function noise(dur: number, at = 0, vol = 0.6, highpass?: number): void {
  const a = audio()
  if (!a || !master || muted) return
  const len = Math.max(1, Math.floor(a.sampleRate * dur))
  const buf = a.createBuffer(1, len, a.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = a.createBufferSource()
  const g = a.createGain()
  g.gain.value = vol
  src.buffer = buf
  if (highpass !== undefined && typeof a.createBiquadFilter === 'function') {
    const f = a.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = highpass
    src.connect(f).connect(g).connect(master)
  } else src.connect(g).connect(master)
  src.start(a.currentTime + at)
}

/** The layered hit: transient + body (+ sub on a crit), in the rotating variant. */
function layeredHit(root: number, crit: boolean): void {
  const n = hitCounter++
  const v = HIT_BODY[hitVariant(n)]!
  const keep = pitch
  pitch = keep * 2 ** (hitDetune(n) / 1200)
  try {
    noise(0.015, 0, crit ? 0.8 : 0.55, 2400) // transient
    tone(NOTE(root + v.from), v.dur, v.type, 0, crit ? 0.5 : 0.4, NOTE(root + v.to)) // body
    if (crit) {
      tone(NOTE(root + 24 + v.from), 0.06, 'square', 0.01, 0.35) // the crit's bright ring
      tone(NOTE(root + 36 + v.from), 0.1, 'square', 0.05, 0.35)
    }
  } finally {
    pitch = keep
  }
  // The sub thump carries weight; it is never transposed (a rising combo stays heavy).
  if (crit) {
    const p = pitch
    pitch = 1
    try {
      tone(55, 0.15, 'sine', 0, 0.6, 35)
    } finally {
      pitch = p
    }
  }
}

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12)

/** Play a sound effect. `opts.semis` transposes it; `opts.star` shapes 'reveal'. */
export function sfx(name: Sfx, opts?: SfxOpts): void {
  const semis = opts?.semis ?? 0
  pitch = semis === 0 ? 1 : 2 ** (semis / 12)
  try {
    play(name, Math.min(5, Math.max(1, Math.round(opts?.star ?? 1))))
  } finally {
    pitch = 1
  }
}

function play(name: Sfx, star: number): void {
  switch (name) {
    case 'click':
      return tone(NOTE(84), 0.04, 'square', 0, 0.3)
    case 'hit':
      return layeredHit(52, false)
    case 'crit':
      return layeredHit(52, true)
    case 'miss':
      return tone(NOTE(72), 0.12, 'triangle', 0, 0.3, NOTE(60))
    case 'guard':
      return tone(NOTE(90), 0.18, 'triangle', 0, 0.5)
    case 'heal':
      tone(NOTE(72), 0.08, 'triangle', 0, 0.4)
      return tone(NOTE(79), 0.12, 'triangle', 0.07, 0.4)
    case 'death':
      noise(0.25, 0, 0.4)
      return tone(NOTE(48), 0.4, 'square', 0, 0.4, NOTE(30))
    case 'panic':
      return tone(NOTE(66), 0.2, 'square', 0, 0.25, NOTE(70))
    case 'victory':
      ;[72, 76, 79, 84].forEach((n, i) => tone(NOTE(n), 0.14, 'square', i * 0.11, 0.45))
      return tone(NOTE(88), 0.4, 'square', 0.46, 0.45)
    case 'defeat':
      ;[67, 63, 60, 55].forEach((n, i) => tone(NOTE(n), 0.22, 'triangle', i * 0.18, 0.5))
      return
    case 'summon':
      ;[60, 64, 67, 72].forEach((n, i) => tone(NOTE(n), 0.1, 'triangle', i * 0.07, 0.4))
      return
    case 'rare':
      ;[64, 68, 71, 76, 80].forEach((n, i) => tone(NOTE(n), 0.12, 'square', i * 0.07, 0.4))
      return
    case 'legend':
      ;[67, 71, 74, 79, 83, 86, 91].forEach((n, i) => tone(NOTE(n), 0.16, 'square', i * 0.07, 0.45))
      return tone(NOTE(79), 0.6, 'triangle', 0.5, 0.5)
    case 'levelup':
      ;[72, 79, 84].forEach((n, i) => tone(NOTE(n), 0.1, 'square', i * 0.08, 0.4))
      return
    case 'fail':
      return tone(NOTE(55), 0.3, 'square', 0, 0.35, NOTE(45))
    case 'reveal': {
      // One more rising note per star; 4★+ rings out, 5★ adds a low bell.
      const notes = [64, 67, 71, 76, 79, 83].slice(0, star + 1)
      notes.forEach((n, i) => tone(NOTE(n), 0.1, star >= 3 ? 'square' : 'triangle', i * 0.06, 0.4))
      if (star >= 4) tone(NOTE(notes[notes.length - 1]! + 5), 0.5, 'triangle', notes.length * 0.06, 0.45)
      if (star >= 5) tone(NOTE(55), 0.8, 'triangle', notes.length * 0.06, 0.35)
      return
    }
    case 'coin':
      tone(NOTE(88), 0.05, 'square', 0, 0.3)
      return tone(NOTE(93), 0.12, 'square', 0.05, 0.3)
    case 'heroFall': {
      // A hero's permanent death: a low thud, then a slow minor bell that sinks.
      // Nothing like the quick 'death' an enemy gets.
      const p = pitch
      pitch = 1
      try {
        tone(70, 0.35, 'sine', 0, 0.7, 38)
      } finally {
        pitch = p
      }
      noise(0.12, 0, 0.2)
      tone(NOTE(57), 1.1, 'triangle', 0.12, 0.42, NOTE(52))
      tone(NOTE(60), 1.0, 'triangle', 0.14, 0.3, NOTE(55))
      tone(NOTE(64), 0.9, 'triangle', 0.5, 0.22, NOTE(57))
      return tone(NOTE(45), 1.4, 'sine', 0.5, 0.35, NOTE(40))
    }
    case 'unlock':
      ;[67, 72, 76, 79].forEach((n, i) => tone(NOTE(n), 0.1, 'square', i * 0.07, 0.35))
      return tone(NOTE(84), 0.35, 'triangle', 0.3, 0.4)
    case 'boon':
      ;[76, 83, 88].forEach((n, i) => tone(NOTE(n), 0.18, 'triangle', i * 0.09, 0.4))
      return
    case 'door':
      noise(0.12, 0.04, 0.2)
      return tone(NOTE(40), 0.28, 'square', 0, 0.3, NOTE(47))
    case 'stamp':
      noise(0.05, 0, 0.6)
      return tone(NOTE(45), 0.09, 'square', 0, 0.45, NOTE(38))
    case 'saved':
      ;[79, 84, 91].forEach((n, i) => tone(NOTE(n), 0.08, 'square', i * 0.05, 0.4))
      return tone(NOTE(90), 0.3, 'triangle', 0.16, 0.45)
    case 'decisive': {
      // Two heartbeats under a held, uneasy fifth: time has stopped.
      const p = pitch
      pitch = 1
      try {
        tone(62, 0.12, 'sine', 0, 0.7, 45)
        tone(58, 0.16, 'sine', 0.2, 0.6, 40)
        tone(62, 0.12, 'sine', 0.75, 0.55, 45)
        tone(58, 0.16, 'sine', 0.95, 0.45, 40)
      } finally {
        pitch = p
      }
      tone(NOTE(69), 0.9, 'triangle', 0.05, 0.18)
      return tone(NOTE(75), 0.9, 'triangle', 0.05, 0.12)
    }
  }
}

/** A looping four-bar arpeggio per scene (stops on 'none' or mute). */
const THEMES: Record<Exclude<Music, 'none'>, { notes: number[]; step: number; type: OscillatorType; bass: number[] }> = {
  lobby: { notes: [60, 64, 67, 72, 67, 64, 62, 65, 69, 74, 69, 65], step: 0.28, type: 'triangle', bass: [36, 36, 38, 41] },
  battle: { notes: [57, 60, 64, 60, 57, 60, 65, 64, 62, 59, 62, 64], step: 0.16, type: 'square', bass: [33, 33, 29, 31] },
}

export function playMusic(m: Music): void {
  if (m === currentMusic) return
  stopMusic()
  currentMusic = m
  if (m === 'none' || muted || !audio()) return
  const theme = THEMES[m]
  let i = 0
  const tick = () => {
    tone(NOTE(theme.notes[i % theme.notes.length]!), theme.step * 0.9, theme.type, 0, 0.12)
    if (i % 3 === 0) tone(NOTE(theme.bass[Math.floor(i / 3) % theme.bass.length]!), theme.step * 2.6, 'triangle', 0, 0.16)
    i++
  }
  tick()
  musicTimer = setInterval(tick, theme.step * 1000)
}

export function stopMusic(): void {
  if (musicTimer !== null) clearInterval(musicTimer)
  musicTimer = null
  currentMusic = 'none'
}

/** Resume the context after a user gesture (browsers start it suspended). */
export function unlockAudio(): void {
  const a = audio()
  if (a && a.state === 'suspended') void a.resume()
}
