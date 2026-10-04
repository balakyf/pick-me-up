import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../../engine/types'
import { seasonAt, weatherAt } from '../../engine/estate'
import { hourOfWorld } from '../../engine/life'
import { toWorldTime } from '../../engine/time'
import { PROPS, TILE } from '../world/lobbyMap'
import { siteRooms } from '../world/sites'
import { ESTATE_SPOTS } from '../world/estateLayer'
import { getSettings, onSettingsChange } from '../qol/settings'
import { useBattleOpen } from '../qol/windowRegistry'
import { ambienceMix, isNight, type AmbMix, type AmbSource } from './ambience'
import { getGraph, onGraphReady, type Graph } from './mixer'
import { playDrop, playFm, playNoise, noiseBuffer, type Dest } from './voices'
import { useMusic } from './useSound'

/** What LobbyWorld's frame loop tells the ambience (world pixels). */
export interface LobbyView {
  camX: number
  camY: number
  VW: number
  VH: number
  indoors: boolean
}

/** The lobby's light and weather for the music. */
function lobbyMood(st: GameState | null): { night: boolean; rain: boolean } {
  if (!st) return { night: false, rain: false }
  const now = toWorldTime(Date.now())
  const w = weatherAt(st.seed, now)
  return { night: isNight(hourOfWorld(now)), rain: w === 'rain' || w === 'storm' }
}

/**
 * The music of the camp (the App's base scene): the title before any account, then the
 * lobby's day, night or rain theme as the world clock and the weather turn (read every
 * few seconds). The Tower, Party Board and Registry keep the camp's theme under them.
 */
export function useCampMusic(state: GameState | null): void {
  const [mood, setMood] = useState(() => lobbyMood(state))
  const stRef = useRef(state)
  stRef.current = state
  useEffect(() => {
    const id = setInterval(() => {
      const m = lobbyMood(stRef.current)
      setMood((old) => (old.night === m.night && old.rain === m.rain ? old : m))
    }, 4000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => setMood(lobbyMood(state)), [state?.accountId]) // eslint-disable-line react-hooks/exhaustive-deps
  useMusic(state === null ? { scene: 'title' } : { scene: 'lobby', night: mood.night, rain: mood.rain })
}

/**
 * The lobby's positional ambience (forge, hearth, rain, wind, crickets, thunder) around
 * the camera. LobbyWorld calls the returned `feed` from its frame loop (it only stores the
 * view; the mix is recomputed four times a second).
 */
export function useLobbyAudio(state: GameState): (v: LobbyView) => void {
  const stRef = useRef(state)
  stRef.current = state
  // A replayed battle over the lobby has the stage to itself: the ambience steps out.
  const battleOpen = useBattleOpen()
  const battleRef = useRef(battleOpen)
  battleRef.current = battleOpen
  const view = useRef<LobbyView | null>(null)
  useEffect(() => {
    let amb: Ambience | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    const start = (g: Graph) => {
      if (amb) return
      amb = lastAmbience = new Ambience(g)
      timer = setInterval(() => {
        const v = view.current
        if (!amb || !v) return
        if (getSettings().muted || battleRef.current || g.ctx.state !== 'running') return amb.silence()
        amb.update(mixFor(stRef.current, v))
      }, 250)
    }
    const offReady = onGraphReady(start)
    const offSettings = onSettingsChange((s) => {
      if (s.muted) amb?.silence()
    })
    return () => {
      offReady()
      offSettings()
      if (timer) clearInterval(timer)
      amb?.dispose()
      if (lastAmbience === amb) lastAmbience = null
      amb = null
    }
  }, [])

  const feed = useRef((v: LobbyView) => {
    view.current = v
  })
  return feed.current
}

/** The sources on the campus: the forge and anvils (when the Armory stands and a smith works), the hearths. */
function sourcesFor(st: GameState): AmbSource[] {
  const out: AmbSource[] = []
  const sites = siteRooms(st)
  // The forge rings while a smith is at the anvil (lane L: the ambience follows the heroes).
  const hammering = Object.values(st.heroes).some((h) => h.alive && h.life?.job === 'blacksmith' && h.life.doing.kind === 'work' && !h.life.doing.stalled)
  for (const p of PROPS) {
    const x = (p.x + p.w / 2) * TILE
    const y = (p.y + 0.5) * TILE
    if ((p.kind === 'forge' || p.kind === 'anvil') && !sites.has('armory') && hammering) out.push({ kind: 'forge', x, y })
    else if (p.kind === 'hearth' && !sites.has('kitchen')) out.push({ kind: 'hearth', x, y })
  }
  if ((st.estate?.decor?.hearth ?? 0) >= 1) {
    const [hx, hy] = ESTATE_SPOTS.hearth
    out.push({ kind: 'hearth', x: (hx + 0.5) * TILE, y: (hy + 0.5) * TILE })
  }
  return out
}

let srcCache: { st: GameState | null; out: AmbSource[] } = { st: null, out: [] }

function mixFor(st: GameState, v: LobbyView): AmbMix {
  if (srcCache.st !== st) srcCache = { st, out: sourcesFor(st) }
  const now = toWorldTime(Date.now())
  return ambienceMix({
    cx: v.camX + v.VW / 2,
    cy: v.camY + v.VH / 2,
    viewW: v.VW,
    sources: srcCache.out,
    hour: hourOfWorld(now),
    weather: weatherAt(st.seed, now),
    season: seasonAt(now),
    indoors: v.indoors,
  })
}

/**
 * The live beds: rain and wind are looping filtered noise; the hearth is a low rumble
 * with crackles; the forge, the crickets and the thunder are events scheduled now and
 * then while their level is up. Everything rides the ambience bus (under the sfx level).
 */
class Ambience {
  private out: GainNode
  private rain: { g: GainNode; lp: BiquadFilterNode; src: AudioBufferSourceNode }
  private wind: { g: GainNode; bp: BiquadFilterNode; src: AudioBufferSourceNode; lfo: OscillatorNode }
  private hearth: { g: GainNode; pan: StereoPannerNode | null; src: AudioBufferSourceNode }
  private mix: AmbMix | null = null
  private next = { forge: 0, cricket: 0, crackle: 0, thunder: 0 }
  private eventTimer: ReturnType<typeof setInterval>

  constructor(private readonly g: Graph) {
    const ctx = g.ctx
    this.out = ctx.createGain()
    this.out.gain.value = 1
    this.out.connect(g.ambBus)
    const loop = (kind: 'white' | 'crunch') => {
      const s = ctx.createBufferSource()
      s.buffer = noiseBuffer(ctx, kind)
      s.loop = true
      s.start()
      return s
    }
    // Rain: a hiss through a low-pass that closes indoors.
    {
      const src = loop('white')
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 2800
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 400
      const gn = ctx.createGain()
      gn.gain.value = 0
      src.connect(hp).connect(lp).connect(gn).connect(this.out)
      this.rain = { g: gn, lp, src }
    }
    // Wind: band-passed noise whose centre wanders on a slow LFO.
    {
      const src = loop('white')
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 500
      bp.Q.value = 2.5
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.13
      const depth = ctx.createGain()
      depth.gain.value = 280
      lfo.connect(depth).connect(bp.frequency)
      lfo.start()
      const gn = ctx.createGain()
      gn.gain.value = 0
      src.connect(bp).connect(gn).connect(this.out)
      this.wind = { g: gn, bp, src, lfo }
    }
    // Hearth: a warm low rumble (the crackles are events).
    {
      const src = loop('crunch')
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 320
      const gn = ctx.createGain()
      gn.gain.value = 0
      const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null
      src.connect(lp).connect(gn)
      if (pan) gn.connect(pan).connect(this.out)
      else gn.connect(this.out)
      this.hearth = { g: gn, pan, src }
    }
    this.eventTimer = setInterval(() => this.events(), 100)
  }

  update(m: AmbMix): void {
    this.mix = m
    const t = this.g.ctx.currentTime
    const set = (p: AudioParam, v: number, tc = 0.4) => p.setTargetAtTime(v, t, tc)
    set(this.rain.g.gain, m.rain * 0.16)
    set(this.rain.lp.frequency, m.muffled ? 700 : 2800, 0.2)
    set(this.wind.g.gain, m.wind * 0.12)
    set(this.hearth.g.gain, m.hearth.gain * 0.22, 0.2)
    if (this.hearth.pan) set(this.hearth.pan.pan, m.hearth.pan, 0.2)
  }

  silence(): void {
    this.mix = null
    const t = this.g.ctx.currentTime
    for (const n of [this.rain.g, this.wind.g, this.hearth.g]) n.gain.setTargetAtTime(0, t, 0.1)
  }

  /** Events while their bed is up: clangs, chirps, crackles, thunder. */
  private events(): void {
    const m = this.mix
    if (!m || getGraph() !== this.g || this.g.ctx.state !== 'running') return
    const ctx = this.g.ctx
    const now = ctx.currentTime
    const dest = (pan: number): Dest => {
      if (typeof ctx.createStereoPanner !== 'function' || pan === 0) return { out: this.out, send: this.g.sfxSend }
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      p.connect(this.out)
      setTimeout(() => p.disconnect(), 3000)
      return { out: p, send: this.g.sfxSend }
    }
    if (m.forge.gain > 0.02 && now >= this.next.forge) {
      // Hammer on the anvil: a ring, sometimes two quick strikes.
      const d = dest(m.forge.pan)
      const v = 0.16 * m.forge.gain
      const strikes = Math.random() < 0.35 ? 2 : 1
      for (let i = 0; i < strikes; i++) {
        const at = now + 0.02 + i * 0.22
        playFm(ctx, { kind: 'fm', vol: v, ratio: 2.76, index: 3.5, sustainIndex: 0.08, a: 0.001, d: 0.6, s: 0, r: 0.5, wet: 0.25 }, [74 + Math.floor(Math.random() * 3)], at, 0.5, 1, d)
        playNoise(ctx, at, 0.04, v * 1.2, d, { kind: 'metal', filter: 'highpass', freq: 2500 })
      }
      this.next.forge = now + 1.3 + Math.random() * 1.6
    }
    if (m.hearth.gain > 0.02 && now >= this.next.crackle) {
      const d = dest(m.hearth.pan)
      playNoise(ctx, now + 0.01, 0.02 + Math.random() * 0.03, 0.12 * m.hearth.gain, d, { kind: 'crunch', filter: 'bandpass', freq: 1500 + Math.random() * 2500, q: 1.5 })
      this.next.crackle = now + 0.08 + Math.random() * 0.45
    }
    if (m.crickets > 0.02 && now >= this.next.cricket) {
      // A cricket: a few fast pulses of a high, thin tone.
      const pan = Math.random() * 1.4 - 0.7
      const d = dest(pan)
      const f = 4200 + Math.random() * 500
      const pulses = 3 + Math.floor(Math.random() * 3)
      for (let i = 0; i < pulses; i++) {
        const o = ctx.createOscillator()
        o.frequency.value = f
        const gn = ctx.createGain()
        const at = now + 0.02 + i * 0.045
        gn.gain.setValueAtTime(0.0001, at)
        gn.gain.exponentialRampToValueAtTime(0.03 * m.crickets, at + 0.008)
        gn.gain.exponentialRampToValueAtTime(0.0001, at + 0.03)
        o.connect(gn).connect(d.out)
        o.start(at)
        o.stop(at + 0.04)
        o.onended = () => gn.disconnect()
      }
      this.next.cricket = now + 0.5 + Math.random() * 1.3
    }
    if (m.thunder && now >= this.next.thunder) {
      if (this.next.thunder > 0) {
        playNoise(ctx, now + 0.05, 2.6, 0.22 * (m.muffled ? 0.5 : 1), dest(0), { filter: 'lowpass', freq: 380, freqTo: 90, a: 0.25, wet: 0.5 })
        playDrop(ctx, now + 0.05, 70, 35, 1.6, 0.25, dest(0))
      }
      this.next.thunder = now + 12 + Math.random() * 16
    }
  }

  dispose(): void {
    clearInterval(this.eventTimer)
    const t = this.g.ctx.currentTime
    this.out.gain.setTargetAtTime(0, t, 0.15)
    const nodes = [this.rain.src, this.wind.src, this.hearth.src, this.wind.lfo]
    setTimeout(() => {
      for (const n of nodes) {
        try {
          n.stop()
        } catch {
          /* already stopped */
        }
      }
      try {
        this.out.disconnect()
      } catch {
        /* gone */
      }
    }, 800)
  }

  /** For the dev hook. */
  levels(): AmbMix | null {
    return this.mix
  }
}

let lastAmbience: Ambience | null = null

/** The ambience levels right now (the dev hook reads them). */
export function ambienceLevels(): AmbMix | null {
  return lastAmbience?.levels() ?? null
}
