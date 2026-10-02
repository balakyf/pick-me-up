/**
 * Small composing helpers: chord symbols and generators for the accompaniment (bass lines,
 * arpeggios, pads, drum loops) so each track file can spend its lines on the melody.
 * Everything returns pattern text for sequencer.compilePattern. Pure.
 */
import type { DrumInst, FmInst, ToneInst } from './types'

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const
const ROOT: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  add9: [0, 4, 7, 14],
  m9: [0, 3, 7, 10, 14],
  '5': [0, 7],
}

/** A chord symbol ('Am', 'F#m7', 'Bbmaj7', 'G') → root pitch class and intervals. */
export function chord(sym: string): { root: number; tones: number[] } {
  const m = /^([A-G])(#|b)?(.*)$/.exec(sym)
  if (!m) throw new Error(`chord: bad symbol '${sym}'`)
  const root = (ROOT[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12
  const q = QUALITY[m[3] ?? '']
  if (!q) throw new Error(`chord: unknown quality '${m[3]}' in '${sym}'`)
  return { root, tones: q }
}

/** MIDI number → note token ('Eb4'). */
export function tok(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

/** The root of a chord in an octave (C in octave 2 = MIDI 36). */
function rootIn(sym: string, octave: number): number {
  return (octave + 1) * 12 + chord(sym).root
}

/**
 * A bass line: one bar per chord, from a shape whose tokens are chord degrees: `R` root,
 * `3` third, `5` fifth, `7` seventh, `8` the octave, `-` hold, `.` rest, `b` the fifth
 * below, `n` the next chord's root approached from a semitone below (a walk-up).
 */
export function bassLine(chords: string[], shape: string, octave = 2): string {
  const steps = shape.split(/\s+/).filter(Boolean)
  return chords
    .map((sym, i) => {
      const r = rootIn(sym, octave)
      const tones = chord(sym).tones
      const next = chords[(i + 1) % chords.length]!
      return steps
        .map((s) => {
          const acc = s.endsWith('!') ? '!' : s.endsWith('?') ? '?' : ''
          const k = acc ? s.slice(0, -1) : s
          if (k === '-' || k === '.') return k
          if (k === 'R') return tok(r) + acc
          if (k === '8') return tok(r + 12) + acc
          if (k === '3') return tok(r + (tones[1] ?? 4)) + acc
          if (k === '5') return tok(r + (tones[2] ?? 7)) + acc
          if (k === '7') return tok(r + (tones[3] ?? 10)) + acc
          if (k === 'b') return tok(r - 5) + acc
          if (k === 'n') return tok(rootIn(next, octave) - 1) + acc
          throw new Error(`bassLine: bad step '${s}'`)
        })
        .join(' ')
    })
    .join(' | ')
}

/**
 * An arpeggio: one bar per chord; shape tokens are chord-tone indices (0 = root, 1, 2, 3…
 * wrap upward an octave past the chord's size), `-` hold, `.` rest.
 */
export function arpLine(chords: string[], shape: string, octave = 4): string {
  const steps = shape.split(/\s+/).filter(Boolean)
  return chords
    .map((sym) => {
      const r = rootIn(sym, octave)
      const tones = chord(sym).tones
      return steps
        .map((s) => {
          if (s === '-' || s === '.') return s
          const n = Number(s)
          if (!Number.isInteger(n)) throw new Error(`arpLine: bad step '${s}'`)
          const oct = Math.floor(n / tones.length)
          return tok(r + tones[n % tones.length]! + 12 * oct)
        })
        .join(' ')
    })
    .join(' | ')
}

/** Block chords: one chord token per bar held over `len` tokens (`C4+E4+G4 - - -`). */
export function padLine(chords: string[], len: number, octave = 4, rhythm?: string): string {
  return chords
    .map((sym) => {
      const r = rootIn(sym, octave)
      const notes = chord(sym).tones.slice(0, 4).map((i) => tok(r + i)).join('+')
      if (rhythm) return rhythm.split(/\s+/).filter(Boolean).map((s) => (s === 'x' ? notes : s)).join(' ')
      return [notes, ...Array(len - 1).fill('-')].join(' ')
    })
    .join(' | ')
}

/** Repeat a pattern n times. */
export function rep(pattern: string, n: number): string {
  return Array(n).fill(pattern).join(' | ')
}

// ── A palette of instruments ────────────────────────────────────────────────

export const INST = {
  lead: (vol = 0.22, extra: Partial<ToneInst> = {}): ToneInst => ({ kind: 'tone', wave: 'pulse25', vol, a: 0.005, d: 0.12, s: 0.7, r: 0.08, vib: { rate: 5.5, depth: 14, delay: 0.18 }, wet: 0.18, ...extra }),
  softLead: (vol = 0.2, extra: Partial<ToneInst> = {}): ToneInst => ({ kind: 'tone', wave: 'triangle', vol, a: 0.02, d: 0.2, s: 0.75, r: 0.2, vib: { rate: 4.5, depth: 10, delay: 0.25 }, wet: 0.35, ...extra }),
  square: (vol = 0.16, extra: Partial<ToneInst> = {}): ToneInst => ({ kind: 'tone', wave: 'square', vol, a: 0.004, d: 0.1, s: 0.6, r: 0.06, ...extra }),
  thin: (vol = 0.12, extra: Partial<ToneInst> = {}): ToneInst => ({ kind: 'tone', wave: 'pulse12', vol, a: 0.003, d: 0.08, s: 0.45, r: 0.05, ...extra }),
  arp: (vol = 0.09, rate = 32, extra: Partial<ToneInst> = {}): ToneInst => ({ kind: 'tone', wave: 'pulse12', vol, a: 0.002, d: 0.1, s: 0.6, r: 0.05, arp: rate, ...extra }),
  bass: (vol = 0.3, extra: Partial<ToneInst> = {}): ToneInst => ({ kind: 'tone', wave: 'triangle', vol, a: 0.004, d: 0.12, s: 0.8, r: 0.05, ...extra }),
  pluckBass: (vol = 0.26, extra: Partial<ToneInst> = {}): ToneInst => ({ kind: 'tone', wave: 'triangle', vol, a: 0.003, d: 0.18, s: 0.25, r: 0.08, ...extra }),
  sawBass: (vol = 0.13, extra: Partial<ToneInst> = {}): ToneInst => ({ kind: 'tone', wave: 'saw', vol, a: 0.004, d: 0.1, s: 0.7, r: 0.05, lp: 900, ...extra }),
  pad: (vol = 0.07, extra: Partial<ToneInst> = {}): ToneInst => ({ kind: 'tone', wave: 'saw', vol, a: 0.35, d: 0.6, s: 0.8, r: 0.6, lp: 1400, detune: 7, unison: true, wet: 0.45, ...extra }),
  organ: (vol = 0.09, extra: Partial<ToneInst> = {}): ToneInst => ({ kind: 'tone', wave: 'square', vol, a: 0.03, d: 0.2, s: 0.9, r: 0.25, lp: 2200, detune: 5, unison: true, wet: 0.4, ...extra }),
  bell: (vol = 0.12, extra: Partial<FmInst> = {}): FmInst => ({ kind: 'fm', vol, ratio: 3.5, index: 2.2, sustainIndex: 0.1, a: 0.002, d: 0.9, s: 0, r: 0.6, wet: 0.5, ...extra }),
  epiano: (vol = 0.1, extra: Partial<FmInst> = {}): FmInst => ({ kind: 'fm', vol, ratio: 1, index: 1.6, sustainIndex: 0.25, a: 0.004, d: 0.8, s: 0.35, r: 0.4, wet: 0.35, ...extra }),
  fmBass: (vol = 0.22, extra: Partial<FmInst> = {}): FmInst => ({ kind: 'fm', vol, ratio: 0.5, index: 3, sustainIndex: 0.6, a: 0.003, d: 0.2, s: 0.5, r: 0.08, lp: 1200, ...extra }),
  brass: (vol = 0.13, extra: Partial<FmInst> = {}): FmInst => ({ kind: 'fm', vol, ratio: 1, index: 0.6, sustainIndex: 2.2, a: 0.05, d: 0.25, s: 0.8, r: 0.12, carrier: 'triangle', wet: 0.2, ...extra }),
  choir: (vol = 0.08, extra: Partial<FmInst> = {}): FmInst => ({ kind: 'fm', vol, ratio: 2, index: 0.3, sustainIndex: 0.5, a: 0.4, d: 0.6, s: 0.85, r: 0.8, carrier: 'sine', wet: 0.6, ...extra }),
  drums: (vol = 0.5, style: DrumInst['style'] = 'punchy', wet = 0.08): DrumInst => ({ kind: 'drums', vol, style, wet }),
} as const
