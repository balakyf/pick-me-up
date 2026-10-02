/**
 * The music sequencer: look-ahead scheduling on the audio clock.
 *
 * The old loop fired each note from a setInterval, so every note landed whenever the main
 * thread got round to it (it jittered on every battle TICK). Here a light timer only *wakes*
 * the scheduler; every note is placed at an exact AudioContext.currentTime a little ahead
 * of now ("a tale of two clocks"), so timing is sample-accurate however busy the page is.
 *
 * The pure half (timing math, pattern compilation, the scheduling window) is exported and
 * unit-tested; the Sequencer class at the bottom wires it to a live AudioContext.
 */
import type { Channel, Track } from './tracks/types'

// ─────────────────────────────────────────────────────────────────────────────
// Timing math (pure)
// ─────────────────────────────────────────────────────────────────────────────

/** Seconds per sequencer step. */
export function stepSeconds(bpm: number, stepsPerBeat: number): number {
  return 60 / bpm / stepsPerBeat
}

/**
 * When step `i` sounds, in seconds after the track's start. Swing (0..0.5) delays every
 * off-step by that fraction of a step: 0.33 turns straight eighths into a shuffle.
 */
export function stepTime(i: number, bpm: number, stepsPerBeat: number, swing = 0): number {
  const d = stepSeconds(bpm, stepsPerBeat)
  return i * d + (i % 2 === 1 ? swing * d : 0)
}

export function stepsPerBar(track: Pick<Track, 'stepsPerBeat' | 'beatsPerBar'>): number {
  return track.stepsPerBeat * track.beatsPerBar
}

/**
 * The first bar line at or after `now` for a track that started at `start` (seconds on the
 * audio clock). A transition waits for it so the switch lands on the downbeat.
 */
export function nextBarTime(start: number, now: number, bpm: number, stepsPerBeat: number, barSteps: number): number {
  const bar = stepSeconds(bpm, stepsPerBeat) * barSteps
  if (now <= start) return start
  const n = Math.ceil((now - start) / bar - 1e-9)
  return start + n * bar
}

/** The first beat at or after `now` (stingers come in on the beat, not the bar). */
export function nextBeatTime(start: number, now: number, bpm: number): number {
  const beat = 60 / bpm
  if (now <= start) return start
  return start + Math.ceil((now - start) / beat - 1e-9) * beat
}

/**
 * When to switch from the playing track: on its next bar line, unless that is more than
 * `maxWait` seconds away (a slow lullaby), then on its next beat; never sooner than `now`.
 */
export function switchTime(start: number, now: number, bpm: number, stepsPerBeat: number, barSteps: number, maxWait = 1.6): number {
  const bar = nextBarTime(start, now, bpm, stepsPerBeat, barSteps)
  if (bar - now <= maxWait) return bar
  return nextBeatTime(start, now, bpm)
}

/**
 * The scheduling window: which steps fall in [cursor, until) on the audio clock. Returns
 * the steps (index and absolute time) and the advanced cursor. Pure, so the look-ahead is
 * testable without an AudioContext.
 */
export function stepsDue(
  track: Pick<Track, 'bpm' | 'stepsPerBeat' | 'swing'>,
  start: number,
  nextStep: number,
  until: number,
  stopAt = Infinity,
): { steps: { index: number; time: number }[]; nextStep: number } {
  const steps: { index: number; time: number }[] = []
  let i = nextStep
  for (;;) {
    const time = start + stepTime(i, track.bpm, track.stepsPerBeat, track.swing ?? 0)
    if (time >= until || time >= stopAt) break
    steps.push({ index: i, time })
    i++
    if (steps.length > 4096) break // a runaway guard (a suspended clock catching up)
  }
  return { steps, nextStep: i }
}

// ─────────────────────────────────────────────────────────────────────────────
// Patterns (pure): text → note events
// ─────────────────────────────────────────────────────────────────────────────

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** 'C4' → 60, 'F#3' → 54, 'Bb5' → 82. Null when the token is not a note. */
export function noteToMidi(tok: string): number | null {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(tok)
  if (!m) return null
  const pc = PC[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
  return (Number(m[3]) + 1) * 12 + pc
}

export function midiToHz(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12)
}

/** One sounding event of a channel: on `step`, for `len` steps. */
export interface NoteEvent {
  step: number
  len: number
  /** MIDI notes (a chord has several), or a drum letter for the kit. */
  notes: number[]
  drum?: string
  /** 0..1 accent from a trailing '!' (louder) or '?' (ghost). */
  vel: number
}

export interface CompiledChannel {
  events: NoteEvent[]
  /** Length of the pattern in steps (it loops on its own length). */
  length: number
}

/**
 * Compile a pattern. Tokens are separated by spaces; `|` bar lines are ignored. Each token
 * fills `rate` steps: a note (`C4`, `F#3`), a chord (`C4+E4+G4`), a rest (`.`), a hold
 * (`-`, extends the note before), or for drums a letter (`k s h o c t r`). A trailing
 * `!` accents a token, `?` makes it a ghost note.
 */
export function compilePattern(pattern: string, rate = 1, drums = false): CompiledChannel {
  const toks = pattern.split(/\s+/).filter((t) => t !== '' && t !== '|')
  const events: NoteEvent[] = []
  let step = 0
  let open: NoteEvent | null = null
  for (const raw of toks) {
    let tok = raw
    let vel = 0.8
    if (tok.endsWith('!')) {
      vel = 1
      tok = tok.slice(0, -1)
    } else if (tok.endsWith('?')) {
      vel = 0.45
      tok = tok.slice(0, -1)
    }
    if (tok === '-') {
      if (open) open.len += rate
    } else if (tok === '.') {
      open = null
    } else if (drums) {
      // Several drums at once: 'k+h'.
      for (const d of tok.split('+')) events.push({ step, len: rate, notes: [], drum: d, vel })
      open = null
    } else {
      const notes = tok.split('+').map(noteToMidi)
      if (notes.some((n) => n === null)) throw new Error(`compilePattern: bad token '${raw}'`)
      open = { step, len: rate, notes: notes as number[], vel }
      events.push(open)
    }
    step += rate
  }
  return { events, length: step }
}

/** Compile every channel of a track once (cached on the track object). */
const compiled = new WeakMap<Channel, CompiledChannel>()
export function compileChannel(ch: Channel): CompiledChannel {
  let c = compiled.get(ch)
  if (!c) {
    c = compilePattern(ch.pattern, ch.rate ?? 1, ch.inst.kind === 'drums')
    compiled.set(ch, c)
  }
  return c
}

/** The track's length in steps: its longest channel (shorter ones loop under it). */
export function trackLength(track: Track): number {
  return Math.max(1, ...track.channels.map((c) => compileChannel(c).length))
}

/** The events of a channel that start on absolute step `i` (the channel loops). */
export function eventsAt(ch: CompiledChannel, i: number): NoteEvent[] {
  if (ch.length === 0) return []
  const s = i % ch.length
  return ch.events.filter((e) => e.step === s)
}

/** Seconds a track lasts once through. */
export function trackSeconds(track: Track): number {
  return stepTime(trackLength(track), track.bpm, track.stepsPerBeat, 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// The live sequencer
// ─────────────────────────────────────────────────────────────────────────────

/** Plays one note event at an exact time (voices.ts does the synthesis). */
export type NotePlayer = (ch: Channel, ev: NoteEvent, time: number, stepSec: number, out: AudioNode) => void

/** How far ahead notes are placed (s), and how often the scheduler wakes (ms). */
export const LOOKAHEAD_S = 0.18
export const WAKE_MS = 30

/** One track playing (or queued) on the audio clock, through its own gain node. */
export class TrackVoice {
  readonly length: number
  nextStep = 0
  /** No notes at or after this time (a switch away, or the end of a one-shot). */
  stopAt = Infinity
  ended = false
  constructor(
    readonly track: Track,
    readonly start: number,
    readonly gain: GainNode,
    public intensity = 0,
  ) {
    this.length = trackLength(track)
  }

  /** Schedule everything due before `until`. */
  pump(until: number, play: NotePlayer): void {
    if (this.ended) return
    const limit = this.track.loop ? this.stopAt : Math.min(this.stopAt, this.start + stepTime(this.length, this.track.bpm, this.track.stepsPerBeat, 0))
    const { steps, nextStep } = stepsDue(this.track, this.start, this.nextStep, until, limit)
    const sec = stepSeconds(this.track.bpm, this.track.stepsPerBeat)
    for (const s of steps) {
      for (const ch of this.track.channels) {
        if ((ch.minLevel ?? 0) > this.intensity) continue
        if (ch.maxLevel !== undefined && ch.maxLevel < this.intensity) continue
        for (const ev of eventsAt(compileChannel(ch), s.index)) play(ch, ev, s.time, sec, this.gain)
      }
    }
    this.nextStep = nextStep
    if (!this.track.loop && this.nextStep >= this.length) this.ended = true
    if (until >= this.stopAt) this.ended = true
  }
}

/**
 * The scheduler: wakes every WAKE_MS and asks each live voice for the notes due in the
 * next LOOKAHEAD_S. The timer only decides *when to look*; notes are placed on the audio
 * clock, so a late wake costs nothing as long as it is within the look-ahead.
 */
export class Sequencer {
  private voices = new Set<TrackVoice>()
  private timer: ReturnType<typeof setInterval> | null = null
  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly play: NotePlayer,
  ) {}

  add(v: TrackVoice): void {
    this.voices.add(v)
    this.tick()
    this.ensureTimer()
  }

  remove(v: TrackVoice): void {
    this.voices.delete(v)
  }

  /** Schedule what is due now (also called by the timer). */
  tick(): void {
    const until = this.ctx.currentTime + LOOKAHEAD_S
    for (const v of this.voices) {
      v.pump(until, this.play)
      if (v.ended) this.voices.delete(v)
    }
    if (this.voices.size === 0) this.stopTimer()
  }

  private ensureTimer(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => this.tick(), WAKE_MS)
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  stopAll(): void {
    this.voices.clear()
    this.stopTimer()
  }

  get size(): number {
    return this.voices.size
  }
}
