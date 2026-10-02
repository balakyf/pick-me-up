/**
 * The audio graph and its levels.
 *
 *   music tracks ─► musicBus ─► duck ─► musicVol ─┐
 *   death motif / stingers ────────────► musicVol │
 *   music reverb ──────────────────────► musicBus │
 *   sfx cues ─► sfxBus ─► sfxVol ──────────────────┼─► master ─► limiter ─► speakers
 *   lobby ambience ─► ambBus ─► sfxVol             │
 *   sfx reverb ─► sfxBus                           ┘
 *
 * Levels come from the Settings window (master / music / sfx, mute). The context is only
 * created inside a user gesture (browsers refuse otherwise); it is suspended while the tab
 * is hidden and resumed when the Master comes back.
 */
import { getSettings, onSettingsChange, type Settings } from '../qol/settings'
import { reverbImpulse } from './voices'

/** Linear gain at full volume for each bus (the mix's headroom). */
const BASE = { master: 1, music: 0.85, sfx: 0.9 }

/**
 * A 0..100 slider to a gain on a power curve, so the slider feels even to the ear (half
 * way is about -10 dB, not -6 dB). 0 is silence. Pure.
 */
export function sliderGain(pct: number): number {
  const p = Math.max(0, Math.min(100, pct)) / 100
  return p === 0 ? 0 : Math.pow(p, 1.7)
}

/** The three bus levels the settings ask for (mute silences the master). Pure. */
export function busLevels(s: Pick<Settings, 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'muted'>): { master: number; music: number; sfx: number } {
  return {
    master: s.muted ? 0 : sliderGain(s.masterVolume) * BASE.master,
    music: sliderGain(s.musicVolume) * BASE.music,
    sfx: sliderGain(s.sfxVolume) * BASE.sfx,
  }
}

export interface Graph {
  ctx: AudioContext
  master: GainNode
  musicVol: GainNode
  duck: GainNode
  musicBus: GainNode
  musicSend: GainNode
  sfxVol: GainNode
  sfxBus: GainNode
  sfxSend: GainNode
  ambBus: GainNode
}

let graph: Graph | null = null
const readyListeners = new Set<(g: Graph) => void>()

/** The live graph, or null before the first gesture (or where Web Audio is missing). */
export function getGraph(): Graph | null {
  return graph
}

/** Run `fn` once the graph exists (now if it already does). */
export function onGraphReady(fn: (g: Graph) => void): () => void {
  if (graph) fn(graph)
  else readyListeners.add(fn)
  return () => {
    readyListeners.delete(fn)
  }
}

function ctor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
}

export function audioSupported(): boolean {
  return !!ctor()
}

/** Create the context and the graph (call only from a user gesture). */
export function ensureGraph(): Graph | null {
  if (graph) return graph
  const C = ctor()
  if (!C) return null
  try {
    const ctx = new C()
    const g = (v = 1) => {
      const n = ctx.createGain()
      n.gain.value = v
      return n
    }
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -8
    limiter.knee.value = 6
    limiter.ratio.value = 8
    limiter.attack.value = 0.003
    limiter.release.value = 0.2
    const master = g(0)
    master.connect(limiter).connect(ctx.destination)
    const musicVol = g(0)
    musicVol.connect(master)
    const duck = g(1)
    duck.connect(musicVol)
    const musicBus = g(1)
    musicBus.connect(duck)
    const sfxVol = g(0)
    sfxVol.connect(master)
    const sfxBus = g(1)
    sfxBus.connect(sfxVol)
    const ambBus = g(1)
    ambBus.connect(sfxVol)
    // One reverb per bus (so the music's tail ducks with the music).
    const verb = (into: AudioNode, wet: number) => {
      const send = g(1)
      try {
        const conv = ctx.createConvolver()
        conv.buffer = reverbImpulse(ctx)
        const ret = g(wet)
        send.connect(conv).connect(ret).connect(into)
      } catch {
        /* no convolver: the send goes nowhere */
      }
      return send
    }
    const musicSend = verb(musicBus, 0.55)
    const sfxSend = verb(sfxBus, 0.45)
    graph = { ctx, master, musicVol, duck, musicBus, musicSend, sfxVol, sfxBus, sfxSend, ambBus }
    applyLevels(getSettings(), 0)
    wireLifecycle(ctx)
    for (const fn of readyListeners) fn(graph)
    readyListeners.clear()
  } catch {
    graph = null
  }
  return graph
}

/** Set the bus levels (smoothly, so a dragged slider never clicks). */
export function applyLevels(s: Settings, glide = 0.06): void {
  if (!graph) return
  const { ctx, master, musicVol, sfxVol } = graph
  const lv = busLevels(s)
  const t = ctx.currentTime
  for (const [node, v] of [
    [master, lv.master],
    [musicVol, lv.music],
    [sfxVol, lv.sfx],
  ] as const) {
    node.gain.cancelScheduledValues(t)
    if (glide <= 0) node.gain.setValueAtTime(v, t)
    else node.gain.setTargetAtTime(v, t, glide / 3)
  }
}

onSettingsChange((s) => applyLevels(s))

// ── Ducking (a hero's death moment) ─────────────────────────────────────────

let duckedUntil = 0

/**
 * Pull the music down to `level` for `hold` seconds, then let it back up over `release`.
 * Overlapping ducks extend each other.
 */
export function duckMusic(level = 0.22, hold = 2.4, attack = 0.18, release = 1.2): void {
  if (!graph) return
  const { ctx, duck } = graph
  const t = ctx.currentTime
  const end = Math.max(duckedUntil, t + attack + hold)
  duckedUntil = end
  duck.gain.cancelScheduledValues(t)
  duck.gain.setValueAtTime(duck.gain.value, t)
  duck.gain.linearRampToValueAtTime(level, t + attack)
  duck.gain.setValueAtTime(level, end)
  duck.gain.linearRampToValueAtTime(1, end + release)
}

/** True while a duck holds the music down (the dev hook reports it). */
export function isDucked(): boolean {
  return !!graph && graph.ctx.currentTime < duckedUntil
}

/** Lift any duck at once (a battle closing mid-moment). */
export function releaseDuck(): void {
  if (!graph) return
  const { ctx, duck } = graph
  duckedUntil = 0
  duck.gain.cancelScheduledValues(ctx.currentTime)
  duck.gain.setTargetAtTime(1, ctx.currentTime, 0.1)
}

// ── Lifecycle: hidden tabs sleep ────────────────────────────────────────────

const resumeListeners = new Set<() => void>()

/** Called whenever the context starts running again (the music player restarts its timer). */
export function onAudioResume(fn: () => void): () => void {
  resumeListeners.add(fn)
  return () => {
    resumeListeners.delete(fn)
  }
}

/** Resume the context (after a gesture, unmute or the tab coming back). */
export function resumeAudio(): void {
  const g = graph
  if (!g || g.ctx.state === 'closed') return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (g.ctx.state === 'running') {
    for (const fn of resumeListeners) fn()
    return
  }
  void g.ctx.resume().then(
    () => {
      for (const fn of resumeListeners) fn()
    },
    () => {},
  )
}

function wireLifecycle(ctx: AudioContext): void {
  if (typeof document === 'undefined') return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void ctx.suspend().catch(() => {})
    else resumeAudio()
  })
  window.addEventListener('focus', () => resumeAudio())
  // Some browsers suspend on their own (an interrupted phone call): pick it back up on focus.
  ctx.addEventListener?.('statechange', () => {
    if (ctx.state === 'running') for (const fn of resumeListeners) fn()
  })
}

/** For the dev hook: the context's state ('none' before the first gesture). */
export function contextState(): AudioContextState | 'none' {
  return graph ? graph.ctx.state : 'none'
}
