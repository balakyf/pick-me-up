/**
 * Lobby ambience (spec 2026-10-12 V9): a time-of-day tint by the real local hour,
 * fireflies at night, drifting leaves by day: never more than 40 particles.
 * Cosmetic only: it reads no game state and no-ops wherever there is no real
 * canvas (jsdom, node).
 *
 * The particles are STATELESS: each one's position is a pure function of
 * (its index, the time, the camera), hashed with `hashString` rather than drawn
 * from Math.random. Nothing is allocated per frame beyond a small array, nothing
 * leaks between frames, and tests can pin exact positions. Particles are anchored
 * in world space and wrap around the viewport, so they drift past as the camera pans.
 */
import { hourOfWorld } from '../../engine/life'
import { toWorldTime } from '../../engine/time'
import { canvasAvailable } from '../pixel/render'
import { hashString } from '../pixel/rand'
import { getPrefs, onPrefsChange } from '../prefs'

/** The camera rectangle in world pixels (unzoomed), as the lobby draw loop sees it. */
export interface AmbienceView {
  camX: number
  camY: number
  /** Viewport width/height in world pixels. */
  w: number
  h: number
}

export interface AmbienceFrame {
  /** Wall-clock ms (Date.now()). The real local hour drives the tint. */
  nowReal: number
  view: AmbienceView
  /** The integer CSS zoom the canvas is shown at. */
  zoom: number
}

/** Hard caps (spec: ≤ 40 particles on screen). */
export const MAX_PARTICLES = 40
export const MAX_FIREFLIES = 24
export const MAX_LEAVES = 16
/** The tint never goes above this alpha: a mood, not a filter (saturation stays capped). */
export const TINT_MAX_ALPHA = 0.12
/** Particles live in a field this much larger than the viewport, so they enter from off-screen. */
const PAD = 24

// ── time of day ──────────────────────────────────────────────────────────────

/** The player's real local hour, 0..24 (fractional). */
export function realHourOf(nowReal: number): number {
  const d = new Date(nowReal)
  return d.getHours() + d.getMinutes() / 60
}

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** Sky tint keyframes by hour: night blue, dawn pink, clear day, golden hour, dusk rose. */
const TINT_KEYS: readonly [number, Rgba][] = [
  [0, { r: 52, g: 72, b: 168, a: 0.1 }],
  [4.5, { r: 70, g: 68, b: 160, a: 0.09 }],
  [6, { r: 255, g: 150, b: 150, a: 0.08 }],
  [7.5, { r: 255, g: 210, b: 160, a: 0.05 }],
  [10, { r: 255, g: 250, b: 235, a: 0 }],
  [15, { r: 255, g: 238, b: 200, a: 0.02 }],
  [17.5, { r: 255, g: 168, b: 80, a: 0.09 }],
  [19.5, { r: 200, g: 92, b: 140, a: 0.1 }],
  [21.5, { r: 52, g: 72, b: 168, a: 0.1 }],
  [24, { r: 52, g: 72, b: 168, a: 0.1 }],
]

/** The sky tint for an hour (0..24), linearly between keyframes; alpha ≤ TINT_MAX_ALPHA. */
export function skyTint(hour: number): Rgba {
  const h = ((hour % 24) + 24) % 24
  let i = 0
  while (i < TINT_KEYS.length - 2 && TINT_KEYS[i + 1]![0] <= h) i++
  const [h0, c0] = TINT_KEYS[i]!
  const [h1, c1] = TINT_KEYS[i + 1]!
  const t = h1 === h0 ? 0 : (h - h0) / (h1 - h0)
  const lerp = (a: number, b: number) => a + (b - a) * t
  return {
    r: Math.round(lerp(c0.r, c1.r)),
    g: Math.round(lerp(c0.g, c1.g)),
    b: Math.round(lerp(c0.b, c1.b)),
    a: Math.min(TINT_MAX_ALPHA, Math.round(lerp(c0.a, c1.a) * 1000) / 1000),
  }
}

/** 0 by day, 1 at night, ramping through dusk (17–20) and dawn (5–7): the lobby's lighting curve. */
export function nightOf(hour: number): number {
  const h = ((hour % 24) + 24) % 24
  if (h >= 7 && h < 17) return 0
  if (h >= 17 && h < 20) return (h - 17) / 3
  if (h >= 5 && h < 7) return 1 - (h - 5) / 2
  return 1
}

/**
 * How night-like the scene is. The visible darkness follows the WORLD clock (the
 * lobby's lights), so that leads; the player's own night adds half weight, so a
 * late-night session still gets a few fireflies.
 */
export function nightness(worldHour: number, realHour: number): number {
  return Math.min(1, Math.max(nightOf(worldHour), 0.5 * nightOf(realHour)))
}

export interface ParticleCounts {
  fireflies: number
  leaves: number
}

/** Fireflies come out with the dark; leaves thin out at night. Always ≤ MAX_PARTICLES. */
export function particleCounts(night: number, still = false): ParticleCounts {
  const n = Math.min(1, Math.max(0, night))
  const fireflies = Math.min(MAX_FIREFLIES, Math.round(MAX_FIREFLIES * n))
  // drifting leaves frozen mid-air read as dirt on the screen, so reduced motion drops them
  const leaves = still ? 0 : Math.min(MAX_LEAVES, Math.round(MAX_LEAVES * (1 - 0.75 * n)))
  return { fireflies, leaves: Math.min(leaves, MAX_PARTICLES - fireflies) }
}

// ── particles ────────────────────────────────────────────────────────────────

export interface Particle {
  kind: 'firefly' | 'leaf'
  /** screen pixel (integer) inside the viewport field */
  x: number
  y: number
  /** 0..1 */
  alpha: number
  color: string
  /** leaves tumble: horizontal (2×1) or vertical (1×2) */
  wide: boolean
}

const LEAF_COLORS = ['#6e8e34', '#9aaa44', '#c08038', '#94582a'] as const
const FIREFLY_COLOR = '#f2ff9a'

function unit(h: number): number {
  return (h >>> 8) / 16777216
}

function wrap(v: number, size: number): number {
  return ((v % size) + size) % size
}

/**
 * Every particle on screen at time `t` (seconds). `still` (reduced motion) pins
 * them in place and stops the fireflies pulsing.
 */
export function ambienceParticles(t: number, view: AmbienceView, counts: ParticleCounts, still = false): Particle[] {
  const out: Particle[] = []
  const fw = view.w + 2 * PAD
  const fh = view.h + 2 * PAD
  const time = still ? 0 : t
  for (let i = 0; i < counts.fireflies; i++) {
    const a = hashString(`firefly|${i}|a`)
    const b = hashString(`firefly|${i}|b`)
    const p1 = unit(a) * 6.283
    const p2 = unit(b) * 6.283
    const bx = (a % 4096) + 10 * Math.sin(time * (0.21 + unit(b) * 0.2) + p1) + 4 * Math.sin(time * 0.53 + p2)
    const by = (b % 4096) + 6 * Math.sin(time * (0.27 + unit(a) * 0.15) + p2) - time * 1.5
    const glow = Math.sin(time * (1.1 + unit(a ^ b) * 1.4) + p1)
    out.push({
      kind: 'firefly',
      x: Math.round(wrap(bx - view.camX, fw) - PAD),
      y: Math.round(wrap(by - view.camY, fh) - PAD),
      alpha: still ? 0.7 : Math.round((0.25 + 0.75 * Math.max(0, glow) * Math.max(0, glow)) * 100) / 100,
      color: FIREFLY_COLOR,
      wide: true,
    })
  }
  for (let i = 0; i < counts.leaves; i++) {
    const a = hashString(`leaf|${i}|a`)
    const b = hashString(`leaf|${i}|b`)
    const fall = 6 + unit(a) * 7 // px/s
    const wind = 3 + unit(b) * 6 // a gentle breeze to the right
    const sway = Math.sin(time * (1.1 + unit(b)) + unit(a) * 6.283)
    const bx = (a % 4096) + wind * time + 3 * sway
    const by = (b % 4096) + fall * time
    out.push({
      kind: 'leaf',
      x: Math.round(wrap(bx - view.camX, fw) - PAD),
      y: Math.round(wrap(by - view.camY, fh) - PAD),
      alpha: 0.85,
      color: LEAF_COLORS[(a >>> 3) % LEAF_COLORS.length]!,
      wide: sway > -0.2, // the tumble: flat most of the time, edge-on as it turns
    })
  }
  return out
}

// ── drawing ──────────────────────────────────────────────────────────────────

/** The bits of CanvasRenderingContext2D the ambience uses (a test can pass a recorder). */
export type AmbienceCtx = Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle' | 'globalAlpha' | 'globalCompositeOperation'>

export interface AmbienceOverrides {
  realHour?: number
  worldHour?: number
  still?: boolean
}

let reducedMotion: boolean | null = null
function prefersStill(): boolean {
  if (reducedMotion === null) {
    reducedMotion = getPrefs().reducedMotion
    onPrefsChange((p) => {
      reducedMotion = p.reducedMotion
    })
  }
  return reducedMotion
}

/** Draw the tint and particles; returns how many particles were drawn. Pure apart from `ctx`. */
export function renderAmbience(ctx: AmbienceCtx, frame: AmbienceFrame, o: AmbienceOverrides = {}): number {
  const { view } = frame
  const realHour = o.realHour ?? realHourOf(frame.nowReal)
  const worldHour = o.worldHour ?? hourOfWorld(toWorldTime(frame.nowReal))
  const still = o.still ?? false
  const prevAlpha = ctx.globalAlpha
  const prevOp = ctx.globalCompositeOperation

  const tint = skyTint(realHour)
  if (tint.a > 0) {
    ctx.globalAlpha = 1
    ctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},${tint.a})`
    ctx.fillRect(0, 0, view.w, view.h)
  }

  // seconds into the day: keeps the trig arguments small (precision), at the cost
  // of one invisible reshuffle at midnight
  const parts = ambienceParticles((frame.nowReal / 1000) % 86_400, view, particleCounts(nightness(worldHour, realHour), still), still)
  for (const p of parts) {
    if (p.x < -2 || p.y < -2 || p.x > view.w + 2 || p.y > view.h + 2) continue
    if (p.kind === 'firefly') {
      // a soft plus of light around a bright core, added onto the night
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = p.color
      ctx.globalAlpha = p.alpha * 0.35
      ctx.fillRect(p.x - 1, p.y, 3, 1)
      ctx.fillRect(p.x, p.y - 1, 1, 3)
      ctx.globalAlpha = p.alpha
      ctx.fillRect(p.x, p.y, 1, 1)
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = p.color
      ctx.globalAlpha = p.alpha
      ctx.fillRect(p.x, p.y, p.wide ? 2 : 1, p.wide ? 1 : 2)
    }
  }
  ctx.globalAlpha = prevAlpha
  ctx.globalCompositeOperation = prevOp
  return parts.length
}

/** Called once per lobby frame, after the day/night lights and before the vignette. */
export function drawAmbience(ctx: CanvasRenderingContext2D, frame: AmbienceFrame): void {
  if (!canvasAvailable() || !ctx || typeof ctx.fillRect !== 'function') return
  try {
    renderAmbience(ctx, frame, { still: prefersStill() })
  } catch {
    // cosmetic: never let ambience break the lobby loop
  }
}
