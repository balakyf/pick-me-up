import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { Element } from '../../engine/types'
import { canvasAvailable } from '../pixel/render'
import {
  burstParams,
  emitCount,
  particleVisible,
  spawnBurst,
  spawnWeather,
  stepParticles,
  WEATHER,
  type BurstKind,
  type Particle,
  type WeatherKind,
} from './battleFx'
import { fxFlash, fxOps, type FxCast } from './skillFx'

/** What the scene can ask of the particle layer. */
export interface FxHandle {
  /** A burst of sparks at (x, y) in stage px; `dir` is the blow's travel (+1 → right). */
  burst(kind: BurstKind, element: Element, x: number, y: number, dir: 1 | -1): void
  /** Hit-stop: hold every particle still for `ms`. */
  freeze(ms: number): void
  /** Lane I: a skill's effect (skillFx.ts) playing over `ms` real milliseconds, after `delay`. */
  skill(cast: FxCast, ms: number, delay?: number): void
}

const MAX_PARTICLES = 500
/** A phone keeps fewer particles in the air (lane I). */
const MAX_PARTICLES_PHONE = 220
/** At most this many skill effects at once (a late fight's casts overlap). */
const MAX_CASTS = 6

interface LiveCast {
  cast: FxCast
  ms: number
  elapsed: number
}

/**
 * The battle's particle layer: act weather drifting over the stage and the sparks of
 * each blow, drawn as whole logical pixels on a canvas that scales with the stage
 * (so it stays crisp and pixelated). No canvas under jsdom — it renders nothing.
 */
export const BattleFxCanvas = forwardRef<
  FxHandle,
  {
    width: number
    height: number
    horizon: number
    weather: WeatherKind
    density: number
    /** A phone: fewer particles at once. */
    phone?: boolean
    /** Full-stage flashes are allowed (the Settings window; reduced motion turns them off). */
    flashes?: boolean
  }
>(function BattleFxCanvas({ width, height, horizon, weather, density, phone = false, flashes = true }, ref) {
  const cv = useRef<HTMLCanvasElement | null>(null)
  const sim = useRef({ weather: [] as Particle[], sparks: [] as Particle[], carry: [] as number[], frozenUntil: 0, casts: [] as LiveCast[] })
  const cfg = useRef({ width, height, horizon, weather, density, phone, flashes })
  cfg.current = { width, height, horizon, weather, density, phone, flashes }
  const cap = () => (cfg.current.phone ? MAX_PARTICLES_PHONE : MAX_PARTICLES)

  useImperativeHandle(ref, () => ({
    burst(kind, element, x, y, dir) {
      const s = sim.current
      const ps = spawnBurst(burstParams(kind, element, dir, Math.max(0.5, cfg.current.density)), x, y, Math.random)
      s.sparks.push(...ps)
      if (s.sparks.length > cap()) s.sparks.splice(0, s.sparks.length - cap())
    },
    freeze(ms) {
      sim.current.frozenUntil = performance.now() + ms
    },
    skill(cast, ms, delay = 0) {
      const s = sim.current
      s.casts.push({ cast, ms: Math.max(120, ms), elapsed: -Math.max(0, delay) })
      if (s.casts.length > MAX_CASTS) s.casts.splice(0, s.casts.length - MAX_CASTS)
    },
  }))

  // Pre-warm the weather so the sky is already full when the scene opens.
  useEffect(() => {
    const s = sim.current
    s.weather = []
    s.carry = []
    const spec = WEATHER[weather]
    for (let t = 0; t < 8; t += 0.1) emit(0.1)
    function emit(dt: number) {
      spec.streams.forEach((st, i) => {
        const { n, carry } = emitCount(st.rate, dt, density, width, s.carry[i] ?? 0)
        s.carry[i] = carry
        for (let k = 0; k < n; k++) s.weather.push(spawnWeather(st, width, height, horizon, Math.random))
      })
      s.weather = stepParticles(s.weather, dt, width, height)
    }
  }, [weather, density, width, height, horizon])

  useEffect(() => {
    if (!canvasAvailable()) return
    const ctx = cv.current?.getContext('2d')
    if (!ctx) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = sim.current
      const c = cfg.current
      if (now >= s.frozenUntil) {
        const spec = WEATHER[c.weather]
        spec.streams.forEach((st, i) => {
          const { n, carry } = emitCount(st.rate, dt, c.density, c.width, s.carry[i] ?? 0)
          s.carry[i] = carry
          for (let k = 0; k < n && s.weather.length < cap(); k++) s.weather.push(spawnWeather(st, c.width, c.height, c.horizon, Math.random))
        })
        s.weather = stepParticles(s.weather, dt, c.width, c.height)
        s.sparks = stepParticles(s.sparks, dt, c.width, c.height)
        for (const lc of s.casts) lc.elapsed += dt * 1000
        s.casts = s.casts.filter((lc) => lc.elapsed < lc.ms)
      }
      ctx.clearRect(0, 0, c.width, c.height)
      for (const list of [s.weather, s.sparks]) {
        for (const p of list) {
          if (!particleVisible(p)) continue
          ctx.globalAlpha = Math.min(1, p.life / Math.min(0.35, p.max * 0.5))
          ctx.fillStyle = p.color
          ctx.fillRect(Math.round(p.x), Math.round(p.y), p.w, p.h)
        }
      }
      // Skills' effects (lane I): whole logical pixels, drawn over the sparks.
      let flash: string | null = null
      for (const lc of s.casts) {
        if (lc.elapsed < 0) continue // a striker still running in
        const t = lc.elapsed / lc.ms
        for (const op of fxOps(lc.cast, t)) {
          ctx.globalAlpha = op.alpha
          ctx.fillStyle = op.color
          ctx.fillRect(op.x, op.y, op.w, op.h)
        }
        flash ??= c.flashes ? fxFlash(lc.cast.profile, t) : null
      }
      if (flash) {
        ctx.globalAlpha = 0.28
        ctx.fillStyle = flash
        ctx.fillRect(0, 0, c.width, c.height)
      }
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={cv} className="px battle-fx" width={width} height={height} aria-hidden="true" />
})
