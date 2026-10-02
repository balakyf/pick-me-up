/**
 * Track data: chiptune composed in code. A Track is a tempo and a few channels; each
 * channel is an instrument and a text pattern (see sequencer.compilePattern). The voices
 * (voices.ts) turn instruments into Web Audio nodes. Pure data, no audio here.
 */

export type Wave = 'pulse12' | 'pulse25' | 'square' | 'triangle' | 'saw' | 'sine'

/** A pitched voice. Times in seconds; `s` is the sustain level (0..1). */
export interface ToneInst {
  kind: 'tone'
  wave: Wave
  vol: number
  a?: number
  d?: number
  s?: number
  r?: number
  /** Vibrato: rate (Hz) and depth (cents), starting `delay` s into the note. */
  vib?: { rate: number; depth: number; delay?: number }
  /** Cents of detune; with `unison`, a second voice this far the other way (a chorus). */
  detune?: number
  unison?: boolean
  /** A chord token is arpeggiated at this rate (Hz) instead of struck together. */
  arp?: number
  /** Glide from the previous note (s). */
  glide?: number
  /** Low-pass cutoff (Hz) for a softer voice. */
  lp?: number
  /** Share of the reverb send (0..1). */
  wet?: number
  /** Pan -1..1. */
  pan?: number
  /** Gate: the note sounds this fraction of its length (staccato < 1). */
  gate?: number
}

/** Two-operator FM: an electric piano, a bell, a croaky bass, a brass stab. */
export interface FmInst {
  kind: 'fm'
  vol: number
  /** Modulator frequency = carrier × ratio. */
  ratio: number
  /** Modulation depth (× the carrier frequency) at the attack, decaying to `index * sustainIndex`. */
  index: number
  sustainIndex?: number
  a?: number
  d?: number
  s?: number
  r?: number
  carrier?: 'sine' | 'triangle' | 'square'
  wet?: number
  pan?: number
  gate?: number
  lp?: number
}

/** The drum kit: k kick, s snare, h hat, o open hat, c crash, t tom, r rim/clap, l low tom. */
export interface DrumInst {
  kind: 'drums'
  vol: number
  /** 'nes' = short metallic noise; 'soft' = brushes (lobby). */
  style?: 'punchy' | 'nes' | 'soft'
  wet?: number
}

export type Instrument = ToneInst | FmInst | DrumInst

export interface Channel {
  inst: Instrument
  pattern: string
  /** Steps per token (2 = each token an eighth on a sixteenth grid). Default 1. */
  rate?: number
  /** Semitones added to every note. */
  transpose?: number
  /** Plays only at this intensity or above (the summon's rising tiers). */
  minLevel?: number
  /** Plays only up to this intensity. */
  maxLevel?: number
}

export type TrackId =
  | 'title'
  | 'lobby-day'
  | 'lobby-night'
  | 'lobby-rain'
  | 'summon'
  | 'act-1'
  | 'act-2'
  | 'act-3'
  | 'act-4'
  | 'act-5'
  | 'act-6'
  | 'act-7'
  | 'act-8'
  | 'boss'
  | 'wailing-wall'
  | 'worlds-end'
  | 'victory'
  | 'defeat'
  | 'death-motif'

export interface Track {
  id: TrackId
  /** Shown by the dev hook ("what is playing"). */
  title: string
  bpm: number
  /** 4 = a sixteenth-note grid; 3 = triplets / 6-8. */
  stepsPerBeat: number
  beatsPerBar: number
  /** Off-step delay, 0..0.5 of a step. */
  swing?: number
  loop: boolean
  /** How the track comes in over another: on the next bar (default), the next beat, or now. */
  entry?: 'bar' | 'beat' | 'now'
  /** Fade-in seconds when it starts (default 0.6 for loops, 0 for one-shots). */
  fadeIn?: number
  /** Overall level (default 1). */
  gain?: number
  channels: Channel[]
}
