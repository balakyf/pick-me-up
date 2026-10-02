/**
 * The sound effects, synthesised on demand: every cue is a few enveloped tones and noise
 * bursts on the sfx bus. A blow sounds like its element (fire crackles, water splashes,
 * wind whooshes, earth thuds, light rings, dark growls, steel clanks), with a little detune
 * so a flurry never sounds copy-pasted; statuses, shields, casts, covers and follow-ups
 * each have their own voice, and so do the menus and the summoning circle.
 */
import type { Element } from '../../engine/types'
import { getSettings } from '../qol/settings'
import { getGraph } from './mixer'
import { midiToHz } from './sequencer'
import { playDrop, playFm, playNoise, playTone, type Dest } from './voices'
import type { FmInst, ToneInst, Wave } from './tracks/types'

export type CueName =
  // menus
  | 'click'
  | 'confirm'
  | 'cancel'
  | 'toggle'
  | 'coins'
  // battle
  | 'battle-start'
  | 'hit'
  | 'crit'
  | 'miss'
  | 'guard'
  | 'heal'
  | 'regen'
  | 'shield'
  | 'shield-break'
  | 'status'
  | 'dot'
  | 'death'
  | 'hero-death'
  | 'cast'
  | 'cover'
  | 'followup'
  | 'rivalry'
  | 'weak'
  | 'resist'
  | 'immune'
  | 'wave-start'
  | 'wave-clear'
  | 'panic'
  | 'hp-cost'
  | 'order'
  | 'telegraph'
  | 'phase'
  | 'mission-good'
  | 'mission-bad'
  | 'tick'
  | 'floor-mods'
  // summon
  | 'charge'
  | 'surge'
  | 'flip'
  | 'summon'
  | 'rare'
  | 'legend'
  | 'levelup'
  | 'fail'
  // the old jingles, still callable as effects
  | 'victory'
  | 'defeat'

export interface CueOpts {
  element?: Element
  /** For 'status' / 'dot': the status key ('poison', 'stun', 'atk-up'…). */
  status?: string
  /** Cents. */
  detune?: number
  /** 0..1 scale on the cue's level. */
  gain?: number
  /** Seconds from now. */
  at?: number
  pan?: number
}

const N = (n: number) => midiToHz(n)
const tone = (wave: Wave, vol: number, extra: Partial<ToneInst> = {}): ToneInst => ({ kind: 'tone', wave, vol, a: 0.003, d: 0.08, s: 0.5, r: 0.05, ...extra })
const fm = (vol: number, ratio: number, index: number, extra: Partial<FmInst> = {}): FmInst => ({ kind: 'fm', vol, ratio, index, sustainIndex: 0.2, a: 0.002, d: 0.25, s: 0, r: 0.2, ...extra })

/** Play a cue on the sfx bus (silent before the first gesture, or when muted). */
export function playCue(name: CueName, opts: CueOpts = {}): void {
  const g = getGraph()
  if (!g || getSettings().muted || g.ctx.state !== 'running') return
  const ctx = g.ctx
  const t = ctx.currentTime + 0.005 + Math.max(0, opts.at ?? 0)
  const v = Math.max(0, Math.min(1.5, opts.gain ?? 1))
  const dt = opts.detune ?? 0
  const d: Dest = { out: g.sfxBus, send: g.sfxSend }
  const pd: Dest = opts.pan ? { out: panned(ctx, g.sfxBus, opts.pan), send: g.sfxSend } : d
  const T = (inst: ToneInst, notes: number[], at: number, dur: number, vel = 1, slideTo?: number) =>
    playTone(ctx, inst, notes, t + at, dur, vel * v, pd, { detune: dt, slideTo })
  const F = (inst: FmInst, notes: number[], at: number, dur: number, vel = 1) => playFm(ctx, inst, notes, t + at, dur, vel * v, pd, dt)
  const Z = (at: number, dur: number, vol: number, o: Parameters<typeof playNoise>[5] = {}) => playNoise(ctx, t + at, dur, vol * v, pd, o)
  const D = (at: number, from: number, to: number, dur: number, vol: number, wave: OscillatorType = 'sine') => playDrop(ctx, t + at, from, to, dur, vol * v, pd, wave)
  const cents = Math.pow(2, dt / 1200)

  switch (name) {
    // ── menus ─────────────────────────────────────────────────────────────
    case 'click':
      return T(tone('pulse25', 0.12, { d: 0.03, s: 0 }), [84], 0, 0.035)
    case 'confirm':
      T(tone('pulse25', 0.12, { s: 0.3 }), [79], 0, 0.05)
      return T(tone('pulse25', 0.12, { s: 0.3 }), [86], 0.045, 0.08)
    case 'cancel':
      T(tone('triangle', 0.18, { s: 0.3 }), [74], 0, 0.05)
      return T(tone('triangle', 0.18, { s: 0.3 }), [67], 0.05, 0.08)
    case 'toggle':
      return T(tone('pulse12', 0.12, { s: 0.2 }), [88], 0, 0.04)
    case 'coins':
      T(tone('square', 0.09, { s: 0.2 }), [88], 0, 0.06)
      T(tone('square', 0.09, { s: 0.3 }), [95], 0.06, 0.16)
      return F(fm(0.05, 3.5, 2), [100], 0.06, 0.25)

    // ── battle ────────────────────────────────────────────────────────────
    case 'battle-start':
      Z(0, 0.45, 0.18, { filter: 'bandpass', freq: 600, freqTo: 3000, q: 0.8, a: 0.2 })
      D(0.4, 150, 45, 0.35, 0.6)
      return Z(0.4, 1.1, 0.12, { filter: 'highpass', freq: 3800, wet: 0.4 })
    case 'hit':
      return hitTimbre(opts.element ?? 'physical', T, Z, D, F, cents)
    case 'crit':
      hitTimbre(opts.element ?? 'physical', T, Z, D, F, cents, 1.25)
      Z(0, 0.16, 0.35, { kind: 'crunch', filter: 'lowpass', freq: 5000 })
      T(tone('pulse25', 0.14, { s: 0.4 }), [83], 0.02, 0.06)
      return T(tone('pulse25', 0.14, { s: 0.4, wet: 0.3 }), [90], 0.07, 0.12)
    case 'miss':
      Z(0, 0.16, 0.12, { filter: 'bandpass', freq: 2400, freqTo: 900, q: 1.5 })
      return T(tone('triangle', 0.12, { s: 0.3 }), [74], 0, 0.12, 1, N(64))
    case 'guard':
      F(fm(0.16, 2.76, 3, { d: 0.35, wet: 0.3 }), [81], 0, 0.3)
      return Z(0, 0.05, 0.2, { kind: 'metal', filter: 'highpass', freq: 3000 })
    case 'heal':
      ;[72, 76, 79, 84].forEach((n, i) => T(tone('triangle', 0.13, { s: 0.4, wet: 0.4 }), [n], i * 0.045, 0.1))
      return F(fm(0.04, 4, 1.2, { wet: 0.5 }), [96], 0.15, 0.3)
    case 'regen':
      return F(fm(0.06, 3, 1, { wet: 0.5 }), [88], 0, 0.25)
    case 'shield':
      F(fm(0.09, 3.01, 1.6, { d: 0.5, wet: 0.5 }), [79], 0, 0.4)
      F(fm(0.07, 3.01, 1.6, { d: 0.5, wet: 0.5 }), [86], 0.06, 0.4)
      return Z(0, 0.3, 0.05, { filter: 'highpass', freq: 6000, a: 0.08 })
    case 'shield-break':
      Z(0, 0.3, 0.25, { kind: 'metal', filter: 'highpass', freq: 2500 })
      ;[91, 86, 81, 74].forEach((n, i) => F(fm(0.06, 3.01, 1.6, { d: 0.12 }), [n], i * 0.035, 0.1))
      return
    case 'status':
      return statusTimbre(opts.status ?? '', T, Z, D, F)
    case 'dot':
      if (opts.status === 'poison') return F(fm(0.07, 0.5, 2.5, { d: 0.1 }), [55], 0, 0.08)
      if (opts.status === 'burn') return Z(0, 0.12, 0.12, { kind: 'crunch', filter: 'bandpass', freq: 3000, q: 0.7 })
      return Z(0, 0.07, 0.14, { filter: 'bandpass', freq: 1500, q: 2 })
    case 'death':
      Z(0, 0.3, 0.3, { kind: 'crunch', filter: 'lowpass', freq: 2500, freqTo: 300 })
      return T(tone('square', 0.13, { s: 0.5, lp: 1800 }), [52], 0, 0.35, 1, N(28))
    case 'hero-death':
      D(0, 120, 40, 0.6, 0.5)
      Z(0, 0.5, 0.2, { filter: 'lowpass', freq: 1200, freqTo: 200 })
      return T(tone('triangle', 0.16, { s: 0.6, wet: 0.5 }), [57], 0.05, 0.7, 1, N(45))
    case 'cast':
      return castTimbre(opts.element ?? 'physical', T, Z, F)
    case 'cover':
      F(fm(0.16, 2.76, 3, { d: 0.4, wet: 0.4 }), [76], 0, 0.3)
      T(tone('pulse25', 0.13, { s: 0.6, wet: 0.3 }), [67], 0.06, 0.1)
      return T(tone('pulse25', 0.13, { s: 0.6, wet: 0.3 }), [74], 0.15, 0.22)
    case 'followup':
      T(tone('pulse25', 0.11, { s: 0.4 }), [76], 0, 0.05)
      return T(tone('pulse25', 0.11, { s: 0.4 }), [83], 0.05, 0.08)
    case 'rivalry':
      return T(tone('square', 0.07, { s: 0.5, lp: 2000 }), [70, 71], 0, 0.22)
    case 'weak':
      T(tone('pulse12', 0.12, { s: 0.4 }), [88], 0.02, 0.05)
      return T(tone('pulse12', 0.12, { s: 0.4, wet: 0.2 }), [95], 0.06, 0.1)
    case 'resist':
      return D(0.01, 180, 90, 0.14, 0.35, 'triangle')
    case 'immune':
      F(fm(0.1, 5.4, 2.2, { d: 0.25 }), [96], 0, 0.2)
      return Z(0, 0.03, 0.15, { kind: 'metal', filter: 'highpass', freq: 5000 })
    case 'wave-start':
      for (let i = 0; i < 6; i++) Z(i * 0.05, 0.06, 0.1 + i * 0.03, { kind: 'crunch', filter: 'bandpass', freq: 1800, q: 0.8 })
      T(tone('pulse25', 0.15, { s: 0.8, wet: 0.3 }), [62], 0.3, 0.14)
      return T(tone('pulse25', 0.15, { s: 0.8, wet: 0.3 }), [69], 0.45, 0.3)
    case 'wave-clear':
      ;[72, 76, 79].forEach((n, i) => T(tone('pulse25', 0.13, { s: 0.6 }), [n], i * 0.08, 0.08))
      return T(tone('pulse25', 0.13, { s: 0.6, wet: 0.4 }), [84], 0.24, 0.3)
    case 'panic':
      return T(tone('square', 0.09, { s: 0.6, vib: { rate: 14, depth: 60 } }), [66], 0, 0.3, 1, N(70))
    case 'hp-cost':
      D(0, 70, 40, 0.14, 0.5)
      return D(0.18, 70, 40, 0.14, 0.4)
    case 'order':
      T(tone('pulse25', 0.13, { s: 0.8, wet: 0.3 }), [67], 0, 0.12)
      return T(tone('pulse25', 0.13, { s: 0.8, wet: 0.3 }), [72], 0.13, 0.25)
    case 'telegraph':
      T(tone('square', 0.1, { s: 0.8 }), [81], 0, 0.09)
      return T(tone('square', 0.1, { s: 0.8 }), [81], 0.16, 0.09)
    case 'phase':
      Z(0, 0.9, 0.3, { kind: 'crunch', filter: 'lowpass', freq: 900, freqTo: 200, a: 0.1 })
      return T(tone('saw', 0.12, { s: 0.8, lp: 900 }), [40, 41], 0, 0.9, 1, N(28))
    case 'mission-good':
      T(tone('triangle', 0.15, { s: 0.5 }), [79], 0, 0.08)
      return T(tone('triangle', 0.15, { s: 0.5, wet: 0.3 }), [84], 0.08, 0.16)
    case 'mission-bad':
      T(tone('square', 0.08, { s: 0.8 }), [70], 0, 0.12)
      return T(tone('square', 0.08, { s: 0.8 }), [65], 0.14, 0.16)
    case 'tick':
      return Z(0, 0.025, 0.12, { kind: 'metal', filter: 'highpass', freq: 4000 })
    case 'floor-mods':
      return F(fm(0.09, 1.41, 2, { d: 1, s: 0.3, wet: 0.6 }), [45, 52, 56], 0, 0.9)

    // ── summon ────────────────────────────────────────────────────────────
    case 'charge':
      T(tone('triangle', 0.15, { s: 0.9 }), [48], 0, 0.8, 1, N(72))
      return Z(0.1, 0.6, 0.08, { filter: 'bandpass', freq: 800, freqTo: 4000, a: 0.3 })
    case 'surge':
      Z(0, 0.14, 0.18, { filter: 'highpass', freq: 2000 })
      return T(tone('square', 0.12, { s: 0.7 }), [72], 0, 0.28, 1, N(84))
    case 'flip':
      Z(0, 0.05, 0.12, { filter: 'highpass', freq: 3000 })
      return T(tone('triangle', 0.15, { s: 0.4 }), [79], 0.03, 0.08)
    case 'summon':
      ;[60, 64, 67, 72].forEach((n, i) => T(tone('triangle', 0.15, { s: 0.5 }), [n], i * 0.07, 0.1))
      return
    case 'levelup':
      ;[72, 79, 84].forEach((n, i) => T(tone('pulse25', 0.13, { s: 0.5 }), [n], i * 0.08, 0.1))
      return
    case 'rare':
      ;[64, 68, 71, 76, 80].forEach((n, i) => T(tone('pulse25', 0.13, { s: 0.5, wet: 0.3 }), [n], i * 0.07, 0.12))
      return F(fm(0.06, 3.5, 2, { wet: 0.5 }), [88], 0.35, 0.5)
    case 'legend':
      ;[67, 71, 74, 79, 83, 86, 91].forEach((n, i) => T(tone('pulse25', 0.13, { s: 0.6, wet: 0.3 }), [n], i * 0.07, 0.16))
      T(tone('triangle', 0.18, { s: 0.8, wet: 0.5 }), [79, 83, 86], 0.5, 0.8)
      Z(0.5, 1.2, 0.12, { filter: 'highpass', freq: 4000, wet: 0.5 })
      return F(fm(0.06, 3.5, 2, { wet: 0.6 }), [98], 0.55, 0.9)
    case 'fail':
      return T(tone('square', 0.11, { s: 0.6 }), [55], 0, 0.3, 1, N(45))
    case 'victory':
      ;[72, 76, 79, 84].forEach((n, i) => T(tone('square', 0.13), [n], i * 0.11, 0.14))
      return T(tone('square', 0.13), [88], 0.46, 0.4)
    case 'defeat':
      ;[67, 63, 60, 55].forEach((n, i) => T(tone('triangle', 0.15), [n], i * 0.18, 0.22))
      return
  }
}

type TFn = (inst: ToneInst, notes: number[], at: number, dur: number, vel?: number, slideTo?: number) => void
type ZFn = (at: number, dur: number, vol: number, o?: Parameters<typeof playNoise>[5]) => void
type DFn = (at: number, from: number, to: number, dur: number, vol: number, wave?: OscillatorType) => void
type FFn = (inst: FmInst, notes: number[], at: number, dur: number, vel?: number) => void

/** A blow, in its element's voice. `k` scales (a crit hits harder). */
function hitTimbre(el: Element, T: TFn, Z: ZFn, D: DFn, F: FFn, cents: number, k = 1): void {
  switch (el) {
    case 'fire':
      Z(0, 0.18 * k, 0.32 * k, { kind: 'crunch', filter: 'bandpass', freq: 2600 * cents, freqTo: 700, q: 0.8 })
      return D(0, 220 * cents, 70, 0.14, 0.35 * k, 'square')
    case 'water':
      Z(0, 0.16, 0.22 * k, { filter: 'lowpass', freq: 3000, freqTo: 600 })
      F(fm(0.12 * k, 0.5, 4, { d: 0.12 }), [64], 0, 0.1)
      return D(0.02, 600 * cents, 180, 0.1, 0.18 * k, 'sine')
    case 'wind':
      Z(0, 0.16, 0.24 * k, { filter: 'bandpass', freq: 900 * cents, freqTo: 4200, q: 2 })
      return T(tone('pulse12', 0.08 * k, { s: 0.3 }), [86], 0.04, 0.05)
    case 'earth':
      D(0, 130 * cents, 45, 0.22, 0.6 * k, 'triangle')
      return Z(0, 0.12, 0.28 * k, { kind: 'crunch', filter: 'lowpass', freq: 900 })
    case 'light':
      F(fm(0.12 * k, 3.5, 2, { d: 0.3, wet: 0.35 }), [88], 0, 0.2)
      return Z(0, 0.05, 0.15 * k, { filter: 'highpass', freq: 5000 })
    case 'dark':
      T(tone('saw', 0.1 * k, { s: 0.4, lp: 900 }), [45], 0, 0.16, 1, midiToHz(33))
      return Z(0, 0.12, 0.2 * k, { kind: 'metal', filter: 'lowpass', freq: 1400 })
    case 'physical':
    default:
      Z(0, 0.07, 0.4 * k, { filter: 'lowpass', freq: 3500 })
      return T(tone('square', 0.14 * k, { s: 0.4 }), [52], 0, 0.08, 1, midiToHz(40))
  }
}

/** A skill's charge-up before it fires: a rising sweep in its element's colour. */
function castTimbre(el: Element, T: TFn, Z: ZFn, F: FFn): void {
  const base: Record<Element, number> = { fire: 55, water: 60, wind: 64, earth: 48, light: 67, dark: 50, physical: 57 }
  const n = base[el] ?? 57
  T(tone(el === 'dark' ? 'saw' : el === 'earth' ? 'triangle' : 'pulse25', 0.09, { a: 0.18, s: 0.9, lp: el === 'dark' ? 1500 : undefined, wet: 0.3 }), [n], 0, 0.3, 1, midiToHz(n + 12))
  if (el === 'fire') Z(0, 0.3, 0.1, { kind: 'crunch', filter: 'bandpass', freq: 1200, freqTo: 3200, a: 0.2 })
  else if (el === 'wind' || el === 'water') Z(0, 0.3, 0.08, { filter: 'bandpass', freq: 600, freqTo: 3000, q: 1.5, a: 0.2 })
  else if (el === 'light') F(fm(0.05, 4, 1.5, { a: 0.15, d: 0.3, wet: 0.5 }), [n + 24], 0.1, 0.3)
  else Z(0, 0.3, 0.06, { filter: 'lowpass', freq: 800, freqTo: 2400, a: 0.2 })
}

/** A status taking hold. */
function statusTimbre(status: string, T: TFn, Z: ZFn, D: DFn, F: FFn): void {
  if (status === 'poison') {
    F(fm(0.08, 0.5, 3, { d: 0.12 }), [57], 0, 0.1)
    return F(fm(0.08, 0.5, 3, { d: 0.12 }), [52], 0.1, 0.12)
  }
  if (status === 'bleed') {
    Z(0, 0.09, 0.25, { filter: 'highpass', freq: 2500 })
    return D(0.02, 300, 120, 0.12, 0.25, 'triangle')
  }
  if (status === 'burn') {
    for (let i = 0; i < 4; i++) Z(i * 0.04, 0.05, 0.14, { kind: 'crunch', filter: 'bandpass', freq: 2200 + i * 500, q: 1 })
    return
  }
  if (status === 'stun') {
    // Tweeting birds round the head.
    for (let i = 0; i < 4; i++) T(tone('pulse12', 0.08, { s: 0.6 }), [i % 2 ? 91 : 88], i * 0.07, 0.05)
    return
  }
  if (status === 'taunt') {
    T(tone('saw', 0.09, { s: 0.8, lp: 1100, a: 0.03 }), [45], 0, 0.28)
    return T(tone('saw', 0.09, { s: 0.8, lp: 1100 }), [52], 0.12, 0.25)
  }
  if (status === 'shield') return
  if (status === 'regen') return F(fm(0.06, 3, 1, { wet: 0.5 }), [88], 0, 0.25)
  if (status.endsWith('-up')) {
    ;[67, 71, 74].forEach((n, i) => T(tone('pulse25', 0.09, { s: 0.5 }), [n], i * 0.05, 0.06))
    return
  }
  if (status.endsWith('-down')) {
    ;[74, 70, 67].forEach((n, i) => T(tone('triangle', 0.12, { s: 0.5 }), [n], i * 0.06, 0.07))
    return
  }
  return T(tone('pulse25', 0.08), [76], 0, 0.06)
}

function panned(ctx: AudioContext, out: AudioNode, pan: number): AudioNode {
  if (typeof ctx.createStereoPanner !== 'function') return out
  const p = ctx.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  p.connect(out)
  setTimeout(() => {
    try {
      p.disconnect()
    } catch {
      /* gone */
    }
  }, 3000)
  return p
}
