/**
 * The synth voices: pulse waves (12.5 / 25 / 50 % duty), triangle, saw, two-operator FM,
 * and a noise drum kit, each with an ADSR envelope, vibrato, unison detune, a low-pass and
 * a reverb send. Music (the sequencer) and the sound effects (cues.ts) both play through
 * these. Nothing here keeps state between notes except a few per-context caches (the
 * pulse waves, the noise buffers, the reverb impulse), so every note is fire-and-forget.
 */
import type { DrumInst, FmInst, Instrument, ToneInst, Wave } from './tracks/types'
import { midiToHz } from './sequencer'

// ── Per-context caches ──────────────────────────────────────────────────────

const waves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>()

/** A pulse wave of the given duty as a PeriodicWave (Fourier series, 48 harmonics). */
function pulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  let m = waves.get(ctx)
  if (!m) waves.set(ctx, (m = new Map()))
  const key = `pulse${duty}`
  let w = m.get(key)
  if (!w) {
    const N = 48
    const real = new Float32Array(N)
    const imag = new Float32Array(N)
    for (let n = 1; n < N; n++) {
      // A pulse of duty d: a_n = (2 / (n π)) sin(n π d).
      real[n] = 0
      imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty)
    }
    w = ctx.createPeriodicWave(real, imag)
    m.set(key, w)
  }
  return w
}

export function setWave(osc: OscillatorNode, ctx: BaseAudioContext, wave: Wave | 'sine'): void {
  if (wave === 'pulse12') osc.setPeriodicWave(pulseWave(ctx, 0.125))
  else if (wave === 'pulse25') osc.setPeriodicWave(pulseWave(ctx, 0.25))
  else if (wave === 'saw') osc.type = 'sawtooth'
  else osc.type = wave
}

type NoiseKind = 'white' | 'crunch' | 'metal'
const noises = new WeakMap<BaseAudioContext, Map<NoiseKind, AudioBuffer>>()

/**
 * Noise buffers (2 s): white; 'crunch' (sample-and-hold, the 8-bit hiss); 'metal' (a short
 * 93-step LFSR loop, the NES's tonal noise for hats and clangs). Seeded, so they never vary.
 */
export function noiseBuffer(ctx: BaseAudioContext, kind: NoiseKind = 'white'): AudioBuffer {
  let m = noises.get(ctx)
  if (!m) noises.set(ctx, (m = new Map()))
  let b = m.get(kind)
  if (!b) {
    const len = Math.floor(ctx.sampleRate * 2)
    b = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = b.getChannelData(0)
    let seed = 0x2f6b1a3d
    const rnd = () => {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return ((seed >>> 0) / 4294967296) * 2 - 1
    }
    if (kind === 'white') for (let i = 0; i < len; i++) d[i] = rnd()
    else if (kind === 'crunch') {
      let v = 0
      for (let i = 0; i < len; i++) {
        if (i % 4 === 0) v = rnd()
        d[i] = v
      }
    } else {
      // NES short-mode LFSR (tap 6): a 93-step metallic cycle.
      let reg = 1
      const hold = Math.max(1, Math.round(ctx.sampleRate / 22000))
      let v = 1
      for (let i = 0; i < len; i++) {
        if (i % hold === 0) {
          const bit = (reg ^ (reg >> 6)) & 1
          reg = (reg >> 1) | (bit << 14)
          v = reg & 1 ? 0.8 : -0.8
        }
        d[i] = v
      }
    }
    m.set(kind, b)
  }
  return b
}

/** A stereo reverb impulse: 2.4 s of decaying noise with a short pre-delay. */
export function reverbImpulse(ctx: BaseAudioContext, seconds = 2.4): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const b = ctx.createBuffer(2, len, ctx.sampleRate)
  let seed = 0x1234567
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch)
    const pre = Math.floor(ctx.sampleRate * 0.012)
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      const r = (seed / 0x7fffffff) * 2 - 1
      d[i] = i < pre ? 0 : r * Math.pow(1 - i / len, 2.6) * 0.6
    }
  }
  return b
}

// ── Envelope ────────────────────────────────────────────────────────────────

/** Attack to `peak`, decay to `peak × s`, hold until `t0 + dur`, release over `r`. Returns the end. */
export function envelope(g: AudioParam, t0: number, dur: number, peak: number, a = 0.005, d = 0.1, s = 0.7, r = 0.08): number {
  const floor = 0.0001
  const attackEnd = t0 + Math.max(0.001, a)
  const sustain = Math.max(floor, peak * s)
  g.cancelScheduledValues(t0)
  g.setValueAtTime(floor, t0)
  g.exponentialRampToValueAtTime(Math.max(floor, peak), attackEnd)
  const decayEnd = Math.min(t0 + Math.max(dur, a), attackEnd + Math.max(0.001, d))
  if (s <= 0.0001) {
    g.exponentialRampToValueAtTime(floor, attackEnd + Math.max(0.01, d))
    return attackEnd + Math.max(0.01, d) + 0.02
  }
  g.exponentialRampToValueAtTime(sustain, decayEnd)
  const relStart = Math.max(decayEnd, t0 + dur)
  g.setValueAtTime(sustain, relStart)
  g.exponentialRampToValueAtTime(floor, relStart + Math.max(0.01, r))
  return relStart + Math.max(0.01, r) + 0.02
}

export interface Dest {
  out: AudioNode
  /** The reverb send (optional). */
  send?: AudioNode | null
}

/** Wire a voice's final gain to the output, through an optional pan, plus its reverb send. */
function route(ctx: BaseAudioContext, node: AudioNode, dest: Dest, wet = 0, pan = 0): AudioNode[] {
  const made: AudioNode[] = []
  let last: AudioNode = node
  if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    last.connect(p)
    last = p
    made.push(p)
  }
  last.connect(dest.out)
  if (wet > 0 && dest.send) {
    const s = ctx.createGain()
    s.gain.value = wet
    last.connect(s)
    s.connect(dest.send)
    made.push(s)
  }
  return made
}

function cleanup(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect()
      } catch {
        /* already gone */
      }
    }
  }
}

// ── Pitched voices ──────────────────────────────────────────────────────────

/** Play a tone instrument: one note, a chord, or an arpeggiated chord. */
export function playTone(
  ctx: BaseAudioContext,
  inst: ToneInst,
  notes: number[],
  t0: number,
  dur: number,
  vel: number,
  dest: Dest,
  opts: { detune?: number; slideTo?: number; prevHz?: number } = {},
): void {
  if (notes.length === 0) return
  const arp = inst.arp && notes.length > 1
  const voices = arp ? [notes] : notes.map((n) => [n])
  const peak = (inst.vol * vel) / Math.sqrt(voices.length)
  for (const seq of voices) {
    const g = ctx.createGain()
    const end = envelope(g.gain, t0, dur, peak, inst.a, inst.d, inst.s, inst.r)
    let head: AudioNode = g
    const nodes: AudioNode[] = [g]
    if (inst.lp) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = inst.lp
      f.Q.value = 0.7
      g.connect(f)
      head = f
      nodes.push(f)
    }
    nodes.push(...route(ctx, head, dest, inst.wet ?? 0, inst.pan ?? 0))
    const oscs: OscillatorNode[] = []
    const det = (inst.detune ?? 0) + (opts.detune ?? 0)
    const count = inst.unison ? 2 : 1
    for (let u = 0; u < count; u++) {
      const o = ctx.createOscillator()
      setWave(o, ctx, inst.wave)
      o.detune.value = u === 0 ? det : (opts.detune ?? 0) - (inst.detune ?? 0)
      const f0 = midiToHz(seq[0]!)
      if (inst.glide && opts.prevHz) {
        o.frequency.setValueAtTime(opts.prevHz, t0)
        o.frequency.exponentialRampToValueAtTime(f0, t0 + inst.glide)
      } else o.frequency.setValueAtTime(f0, t0)
      if (arp) {
        const stepT = 1 / inst.arp!
        let k = 1
        for (let t = t0 + stepT; t < t0 + dur; t += stepT, k++) o.frequency.setValueAtTime(midiToHz(seq[k % seq.length]!), t)
      }
      if (opts.slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur)
      o.connect(g)
      oscs.push(o)
    }
    if (inst.vib && inst.vib.depth > 0 && dur > (inst.vib.delay ?? 0) + 0.05) {
      const lfo = ctx.createOscillator()
      const lg = ctx.createGain()
      lfo.frequency.value = inst.vib.rate
      const vStart = t0 + (inst.vib.delay ?? 0)
      lg.gain.setValueAtTime(0, t0)
      lg.gain.setValueAtTime(0, vStart)
      lg.gain.linearRampToValueAtTime(inst.vib.depth, vStart + 0.15)
      lfo.connect(lg)
      for (const o of oscs) lg.connect(o.detune)
      lfo.start(t0)
      lfo.stop(end)
      nodes.push(lfo, lg)
    }
    for (const o of oscs) {
      o.start(t0)
      o.stop(end)
    }
    cleanup(oscs[0]!, [...nodes, ...oscs])
  }
}

/** Two-operator FM: a modulator on the carrier's frequency, its depth decaying. */
export function playFm(ctx: BaseAudioContext, inst: FmInst, notes: number[], t0: number, dur: number, vel: number, dest: Dest, detune = 0): void {
  const peak = (inst.vol * vel) / Math.sqrt(Math.max(1, notes.length))
  for (const n of notes) {
    const f = midiToHz(n) * Math.pow(2, detune / 1200)
    const car = ctx.createOscillator()
    car.type = inst.carrier ?? 'sine'
    car.frequency.value = f
    const mod = ctx.createOscillator()
    mod.type = 'sine'
    mod.frequency.value = f * inst.ratio
    const mg = ctx.createGain()
    const i0 = f * inst.index
    const i1 = Math.max(0.0001, f * inst.index * (inst.sustainIndex ?? 0.3))
    mg.gain.setValueAtTime(Math.max(0.0001, i0), t0)
    mg.gain.exponentialRampToValueAtTime(i1, t0 + Math.max(0.02, (inst.a ?? 0) + (inst.d ?? 0.3)))
    mod.connect(mg).connect(car.frequency)
    const g = ctx.createGain()
    const end = envelope(g.gain, t0, dur, peak, inst.a, inst.d, inst.s, inst.r)
    car.connect(g)
    let head: AudioNode = g
    const nodes: AudioNode[] = [g, mg]
    if (inst.lp) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = inst.lp
      g.connect(lp)
      head = lp
      nodes.push(lp)
    }
    nodes.push(...route(ctx, head, dest, inst.wet ?? 0, inst.pan ?? 0))
    car.start(t0)
    mod.start(t0)
    car.stop(end)
    mod.stop(end)
    cleanup(car, [...nodes, car, mod])
  }
}

// ── Noise and drums ─────────────────────────────────────────────────────────

/** A burst of noise through a filter, with its own envelope. */
export function playNoise(
  ctx: BaseAudioContext,
  t0: number,
  dur: number,
  vol: number,
  dest: Dest,
  opts: { kind?: NoiseKind; filter?: BiquadFilterType; freq?: number; q?: number; freqTo?: number; a?: number; wet?: number; pan?: number; rate?: number } = {},
): void {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, opts.kind ?? 'white')
  if (opts.rate) src.playbackRate.value = opts.rate
  const g = ctx.createGain()
  const floor = 0.0001
  g.gain.setValueAtTime(floor, t0)
  g.gain.exponentialRampToValueAtTime(Math.max(floor, vol), t0 + (opts.a ?? 0.002))
  g.gain.exponentialRampToValueAtTime(floor, t0 + dur)
  let head: AudioNode = src
  const nodes: AudioNode[] = [g]
  if (opts.filter) {
    const f = ctx.createBiquadFilter()
    f.type = opts.filter
    f.frequency.setValueAtTime(opts.freq ?? 1000, t0)
    if (opts.freqTo) f.frequency.exponentialRampToValueAtTime(opts.freqTo, t0 + dur)
    f.Q.value = opts.q ?? 1
    src.connect(f)
    head = f
    nodes.push(f)
  }
  head.connect(g)
  nodes.push(...route(ctx, g, dest, opts.wet ?? 0, opts.pan ?? 0))
  // Start somewhere along the buffer so repeated hits don't sound identical.
  const offset = ((t0 * 7919) % 1.5 + 1.5) % 1.5
  src.start(t0, offset, dur + 0.05)
  cleanup(src, [...nodes, src])
}

/** A pitch-dropping body (kick, tom, thud). */
export function playDrop(ctx: BaseAudioContext, t0: number, from: number, to: number, dur: number, vol: number, dest: Dest, wave: OscillatorType = 'sine', wet = 0): void {
  const o = ctx.createOscillator()
  o.type = wave
  o.frequency.setValueAtTime(from, t0)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur * 0.6)
  const g = ctx.createGain()
  g.gain.setValueAtTime(Math.max(0.0001, vol), t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g)
  const nodes = route(ctx, g, dest, wet)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
  cleanup(o, [g, o, ...nodes])
}

/** One drum of the kit. */
export function playDrum(ctx: BaseAudioContext, inst: DrumInst, drum: string, t0: number, vel: number, dest: Dest): void {
  const v = inst.vol * vel
  const soft = inst.style === 'soft'
  const nes = inst.style === 'nes'
  const wet = inst.wet ?? 0
  switch (drum) {
    case 'k':
      playDrop(ctx, t0, soft ? 110 : 165, soft ? 50 : 44, soft ? 0.22 : 0.3, v * (soft ? 0.7 : 1), dest)
      if (!soft) playNoise(ctx, t0, 0.012, v * 0.25, dest, { filter: 'highpass', freq: 2500 })
      return
    case 's':
      if (soft) return playNoise(ctx, t0, 0.22, v * 0.22, dest, { filter: 'bandpass', freq: 2600, q: 0.6, a: 0.02, wet })
      playNoise(ctx, t0, nes ? 0.12 : 0.17, v * 0.5, dest, { kind: nes ? 'crunch' : 'white', filter: 'bandpass', freq: 1900, q: 0.8, wet })
      playDrop(ctx, t0, 230, 150, 0.08, v * 0.35, dest, 'triangle')
      return
    case 'h':
      return playNoise(ctx, t0, soft ? 0.05 : 0.035, v * (soft ? 0.12 : 0.2), dest, { kind: nes ? 'metal' : 'white', filter: 'highpass', freq: soft ? 5000 : 7200 })
    case 'o':
      return playNoise(ctx, t0, 0.24, v * 0.17, dest, { kind: nes ? 'metal' : 'white', filter: 'highpass', freq: 6500, wet })
    case 'c':
      return playNoise(ctx, t0, 1.3, v * 0.24, dest, { filter: 'highpass', freq: 3800, wet: Math.max(wet, 0.3) })
    case 't':
      return playDrop(ctx, t0, 220, 120, 0.22, v * 0.6, dest, 'triangle', wet)
    case 'l':
      return playDrop(ctx, t0, 140, 70, 0.3, v * 0.7, dest, 'triangle', wet)
    case 'r':
      // A clap: three quick bursts and a tail.
      for (let i = 0; i < 3; i++) playNoise(ctx, t0 + i * 0.011, 0.02, v * 0.3, dest, { filter: 'bandpass', freq: 1300, q: 1.2 })
      return playNoise(ctx, t0 + 0.033, 0.12, v * 0.25, dest, { filter: 'bandpass', freq: 1200, q: 0.9, wet })
    default:
      return
  }
}

/** Play any instrument (music channels and sfx cues share this). */
export function playInstrument(
  ctx: BaseAudioContext,
  inst: Instrument,
  notes: number[],
  drum: string | undefined,
  t0: number,
  dur: number,
  vel: number,
  dest: Dest,
  detune = 0,
  prevHz?: number,
): void {
  if (inst.kind === 'drums') {
    if (drum) for (const d of drum.split('+')) playDrum(ctx, inst, d, t0, vel, dest)
  } else if (inst.kind === 'fm') playFm(ctx, inst, notes, t0, dur, vel, dest, detune)
  else playTone(ctx, inst, notes, t0, dur, vel, dest, { detune, prevHz })
}
