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
  // the summon reveal: the pillar rises, surges a tier (the tease), the card turns
  | 'charge'
  | 'surge'
  | 'flip'

export type Music = 'lobby' | 'battle' | 'none'

const MUTE_KEY = 'pmu.muted'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let musicTimer: ReturnType<typeof setInterval> | null = null
let currentMusic: Music = 'none'

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
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** A burst of noise (hits, deaths). */
function noise(dur: number, at = 0, vol = 0.6): void {
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
  src.connect(g).connect(master)
  src.start(a.currentTime + at)
}

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12)

/** Play a sound effect. */
export function sfx(name: Sfx): void {
  switch (name) {
    case 'click':
      return tone(NOTE(84), 0.04, 'square', 0, 0.3)
    case 'hit':
      noise(0.06, 0, 0.5)
      return tone(NOTE(52), 0.08, 'square', 0, 0.4, NOTE(40))
    case 'crit':
      noise(0.1, 0, 0.7)
      tone(NOTE(76), 0.06, 'square', 0, 0.5)
      return tone(NOTE(88), 0.1, 'square', 0.05, 0.5)
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
    case 'charge':
      tone(NOTE(48), 0.8, 'triangle', 0, 0.35, NOTE(72))
      return noise(0.5, 0.1, 0.12)
    case 'surge':
      noise(0.12, 0, 0.3)
      return tone(NOTE(72), 0.28, 'square', 0, 0.4, NOTE(84))
    case 'flip':
      noise(0.05, 0, 0.25)
      return tone(NOTE(79), 0.08, 'triangle', 0.03, 0.35)
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
