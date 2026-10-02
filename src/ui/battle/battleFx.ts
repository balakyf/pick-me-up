/**
 * Battle juice as pure data + math: the weather of each act, the colour of a hit's
 * sparks, the particle stepper, the stage fit and the keyboard map. The canvas and
 * the DOM live in BattleScene / BattleFxCanvas; everything here is unit-tested.
 * Presentation only — randomness comes from an injected `rnd` (Math.random in the
 * UI), never from the engine.
 */
import type { Element } from '../../engine/types'
import { actForFloor } from '../../engine/content/acts'

// ── Weather ──────────────────────────────────────────────────────────────────

export type WeatherKind =
  | 'pollen'
  | 'dust'
  | 'rain'
  | 'spray'
  | 'embers'
  | 'ash'
  | 'darksnow'
  | 'glitch'
  | 'motes'
  | 'sunmotes'

/** One stream of weather particles. Velocities are logical px / second. */
export interface WeatherStream {
  /** Particles per second on a 384px-wide stage at full density. */
  rate: number
  colors: readonly string[]
  vx: readonly [number, number]
  vy: readonly [number, number]
  /** Lifetime in seconds. */
  life: readonly [number, number]
  /** Particle size in logical px [w, h]. */
  size: readonly [number, number]
  /** Where new particles appear. */
  from: 'top' | 'anywhere' | 'ground'
  /** Horizontal wobble amplitude (px/s) — leaves and snow flutter. */
  sway?: number
  /** Blink in and out (sparks, glitches). */
  twinkle?: boolean
}

export interface WeatherSpec {
  kind: WeatherKind
  streams: readonly WeatherStream[]
}

export const WEATHER: Record<WeatherKind, WeatherSpec> = {
  // Act I: pollen and the odd leaf on the prairie wind.
  pollen: {
    kind: 'pollen',
    streams: [
      { rate: 7, colors: ['#fff6c0', '#f4e060'], vx: [8, 18], vy: [-3, 5], life: [5, 9], size: [1, 1], from: 'anywhere', sway: 6, twinkle: true },
      { rate: 1.2, colors: ['#6aa84a', '#8ac85a', '#c8a04a'], vx: [18, 30], vy: [6, 14], life: [6, 10], size: [2, 1], from: 'top', sway: 14 },
    ],
  },
  // Act II: dust motes hanging in the grey light of the ruins.
  dust: {
    kind: 'dust',
    streams: [{ rate: 6, colors: ['#d8d0c0', '#b0a898'], vx: [-3, 5], vy: [-2, 3], life: [5, 9], size: [1, 1], from: 'anywhere', sway: 3, twinkle: true }],
  },
  // Act III: rain on the swamp (the mist is a backdrop layer).
  rain: {
    kind: 'rain',
    streams: [{ rate: 70, colors: ['#9ab8c8', '#c8dce8'], vx: [-22, -16], vy: [210, 260], life: [1.2, 1.4], size: [1, 4], from: 'top' }],
  },
  // Act IV: slanting storm rain and sea spray whipped off the waves.
  spray: {
    kind: 'spray',
    streams: [
      { rate: 45, colors: ['#a8c8e0', '#d8ecf8'], vx: [-70, -55], vy: [200, 240], life: [1.2, 1.4], size: [1, 3], from: 'top' },
      { rate: 10, colors: ['#e8f6ff', '#9ad4ff'], vx: [-40, -20], vy: [-40, -20], life: [0.6, 1.2], size: [1, 1], from: 'ground' },
    ],
  },
  // Act V (and burning anchors): embers rising from the fires, a little smoke.
  embers: {
    kind: 'embers',
    streams: [
      { rate: 10, colors: ['#ffb040', '#ff7a2a', '#ffe07a'], vx: [4, 14], vy: [-26, -12], life: [3, 6], size: [1, 1], from: 'ground', sway: 8, twinkle: true },
      { rate: 1.5, colors: ['#5a5058', '#6a6068'], vx: [6, 12], vy: [-10, -5], life: [5, 8], size: [2, 2], from: 'ground', sway: 3 },
    ],
  },
  // Act VI: ash falling out of a crimson sky.
  ash: {
    kind: 'ash',
    streams: [{ rate: 14, colors: ['#8a8480', '#b8b0a8', '#4a4448'], vx: [-6, 6], vy: [10, 22], life: [8, 14], size: [1, 1], from: 'top', sway: 10 }],
  },
  // Act VII: dark snow from the Wall, with violet sparks crackling off the crystal.
  darksnow: {
    kind: 'darksnow',
    streams: [
      { rate: 16, colors: ['#5a4a9a', '#3a2e6a', '#8a7ae0'], vx: [-8, 4], vy: [12, 24], life: [8, 12], size: [1, 1], from: 'top', sway: 12 },
      { rate: 3, colors: ['#d8c8ff', '#ffffff'], vx: [-30, 30], vy: [-30, 10], life: [0.2, 0.5], size: [1, 1], from: 'anywhere', twinkle: true },
    ],
  },
  // Act VIII: the world glitches — flickering bars of torn texture.
  glitch: {
    kind: 'glitch',
    streams: [
      { rate: 9, colors: ['#ff3aff', '#3affff', '#ffffff'], vx: [0, 0], vy: [0, 0], life: [0.08, 0.25], size: [18, 1], from: 'anywhere', twinkle: true },
      { rate: 5, colors: ['#ff3aff', '#3affff'], vx: [-2, 2], vy: [-8, -2], life: [1, 2], size: [1, 1], from: 'anywhere', twinkle: true },
    ],
  },
  // The Egg's vault, the depths: slow floating motes.
  motes: {
    kind: 'motes',
    streams: [{ rate: 5, colors: ['#e8a0b0', '#ffd0d8', '#b07adb'], vx: [-4, 4], vy: [-8, -2], life: [4, 8], size: [1, 1], from: 'anywhere', sway: 5, twinkle: true }],
  },
  // The summit: golden light motes above the cloud sea.
  sunmotes: {
    kind: 'sunmotes',
    streams: [{ rate: 6, colors: ['#fff6e0', '#ffe07a'], vx: [3, 9], vy: [-6, -1], life: [4, 8], size: [1, 1], from: 'anywhere', sway: 4, twinkle: true }],
  },
}

const ACT_WEATHER: Record<string, WeatherKind> = {
  prairie: 'pollen',
  ruins: 'dust',
  swamp: 'rain',
  coast: 'spray',
  order: 'embers',
  inflection: 'ash',
  wall: 'darksnow',
  void: 'glitch',
}

/** The weather over a floor's battle: the act's, except where an anchor burns or glows. */
export function weatherForFloor(floor: number): WeatherKind {
  if (floor < 1 || floor > 100) return 'motes' // the tower's depths (tournaments)
  if (floor === 10 || floor === 20 || floor === 90) return 'embers' // the falling city, the lair, the world's end
  if (floor === 50) return 'motes' // the Egg's vault
  if (floor === 100) return 'sunmotes'
  return ACT_WEATHER[actForFloor(floor).id] ?? 'dust'
}

/** How many particles one stream spawns over `dt` seconds (carry keeps the fraction). */
export function emitCount(rate: number, dt: number, density: number, width: number, carry: number): { n: number; carry: number } {
  const exact = carry + rate * density * (width / 384) * dt
  const n = Math.floor(exact)
  return { n, carry: exact - n }
}

// ── Particles ────────────────────────────────────────────────────────────────

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** Seconds left / total. */
  life: number
  max: number
  color: string
  w: number
  h: number
  /** Downward acceleration, px/s². */
  g: number
  sway: number
  phase: number
  twinkle: boolean
}

export type Rnd = () => number
const lerp = (r: Rnd, [a, b]: readonly [number, number]) => a + (b - a) * r()
const pick = <T>(r: Rnd, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length]!

/** One weather particle for a stage `w`×`h` with its horizon at `horizon`. */
export function spawnWeather(s: WeatherStream, w: number, h: number, horizon: number, r: Rnd): Particle {
  const x = r() * w
  const y = s.from === 'top' ? -4 - r() * 20 : s.from === 'ground' ? horizon + r() * (h - horizon) : r() * h
  const life = lerp(r, s.life)
  return {
    x,
    y,
    vx: lerp(r, s.vx),
    vy: lerp(r, s.vy),
    life,
    max: life,
    color: pick(r, s.colors),
    w: s.size[0],
    h: s.size[1],
    g: 0,
    sway: s.sway ?? 0,
    phase: r() * Math.PI * 2,
    twinkle: !!s.twinkle,
  }
}

/** Spark colours per element: bright core → the element's colour → its shadow. */
export const SPARK_COLORS: Record<Element, readonly string[]> = {
  fire: ['#fff6c0', '#ffb040', '#ff6b4a', '#b8321e'],
  water: ['#e8f6ff', '#9ad4ff', '#4aa3ff', '#1e5ab0'],
  wind: ['#f0fff4', '#b0ffcc', '#6be29a', '#2a8a52'],
  earth: ['#fff0c0', '#f0d48a', '#c8a24a', '#7a5a1e'],
  light: ['#ffffff', '#fffbd0', '#ffe07a', '#d4a02a'],
  dark: ['#f0e0ff', '#d8a8ff', '#b07adb', '#5a2a8a'],
  physical: ['#ffffff', '#eef0f4', '#cfd3da', '#8e94aa'],
}

export const HEAL_COLORS: readonly string[] = ['#e8fff0', '#b8f5c8', '#5fd08a']
export const GUARD_COLORS: readonly string[] = ['#ffffff', '#b4c8e8', '#6a8ac8']

export type BurstKind = 'hit' | 'crit' | 'kill' | 'heal' | 'guard'

export interface BurstParams {
  count: number
  colors: readonly string[]
  /** Launch speed range, px/s. */
  speed: readonly [number, number]
  life: readonly [number, number]
  gravity: number
  /** Launch angle spread around `angle` (radians); 2π = all directions. */
  angle: number
  spread: number
  size: number
  sway: number
  twinkle: boolean
}

/**
 * Burst parameters for one impact. `dir` is +1 when the blow travels to the right
 * (sparks fly on through the target), −1 to the left. `density` scales the count
 * (reduced motion).
 */
export function burstParams(kind: BurstKind, element: Element, dir: 1 | -1, density = 1): BurstParams {
  const through = dir > 0 ? 0 : Math.PI
  const n = (k: number) => Math.max(kind === 'heal' ? 3 : 4, Math.round(k * density))
  switch (kind) {
    case 'heal':
      return { count: n(10), colors: HEAL_COLORS, speed: [4, 14], life: [0.6, 1.1], gravity: -30, angle: -Math.PI / 2, spread: Math.PI / 2, size: 1, sway: 10, twinkle: true }
    case 'guard':
      return { count: n(8), colors: GUARD_COLORS, speed: [40, 80], life: [0.2, 0.4], gravity: 60, angle: through + Math.PI, spread: Math.PI / 1.5, size: 1, sway: 0, twinkle: false }
    case 'crit':
      return { count: n(26), colors: SPARK_COLORS[element], speed: [60, 170], life: [0.35, 0.7], gravity: 220, angle: through, spread: Math.PI * 2, size: 2, sway: 0, twinkle: false }
    case 'kill':
      return { count: n(18), colors: SPARK_COLORS[element], speed: [50, 130], life: [0.35, 0.65], gravity: 200, angle: through, spread: Math.PI * 1.4, size: 1, sway: 0, twinkle: false }
    default:
      return { count: n(11), colors: SPARK_COLORS[element], speed: [40, 110], life: [0.25, 0.5], gravity: 240, angle: through, spread: Math.PI, size: 1, sway: 0, twinkle: false }
  }
}

/** The particles of one burst at (x, y). */
export function spawnBurst(p: BurstParams, x: number, y: number, r: Rnd): Particle[] {
  const out: Particle[] = []
  for (let i = 0; i < p.count; i++) {
    const a = p.angle + (r() - 0.5) * p.spread
    const v = lerp(r, p.speed)
    const life = lerp(r, p.life)
    // The first few are the bright core, a pixel bigger than the rest.
    const size = i < 3 ? p.size + 1 : p.size
    out.push({
      x: x + (r() - 0.5) * 6,
      y: y + (r() - 0.5) * 6,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life,
      max: life,
      color: i < 2 ? p.colors[0]! : pick(r, p.colors),
      w: size,
      h: size,
      g: p.gravity,
      sway: p.sway,
      phase: r() * Math.PI * 2,
      twinkle: p.twinkle,
    })
  }
  return out
}

/** Advance particles by `dt` seconds in place; returns the survivors. */
export function stepParticles(ps: Particle[], dt: number, w: number, h: number): Particle[] {
  const out: Particle[] = []
  for (const p of ps) {
    p.life -= dt
    if (p.life <= 0) continue
    p.vy += p.g * dt
    p.phase += dt * 2
    p.x += (p.vx + Math.sin(p.phase) * p.sway) * dt
    p.y += p.vy * dt
    // Weather that leaves the stage is gone; wrap sideways so a windy stream stays even.
    if (p.y > h + 8 || p.y < -30) continue
    if (p.x < -24) p.x += w + 40
    else if (p.x > w + 24) p.x -= w + 40
    out.push(p)
  }
  return out
}

/** Whether a twinkling particle is lit this instant. */
export function particleVisible(p: Particle): boolean {
  if (!p.twinkle) return true
  return Math.sin(p.phase * 3 + p.max * 7) > -0.4
}

// ── Stage fit ────────────────────────────────────────────────────────────────

export const STAGE_H = 216
export const STAGE_MIN_W = 384
/** The widest the stage grows (logical px) before it letterboxes. */
export const STAGE_MAX_W = 576

/**
 * Size the stage for the room available: the zoom (an integer when one fills
 * nearly as well, else a crisp quarter step) and the logical width, which widens
 * past 384 on wide screens so the backdrop fills the screen instead of bars.
 */
export function fitStage(availW: number, availH: number, minW: number = STAGE_MIN_W): { zoom: number; width: number } {
  // A phone may crop the canon to the stretch the units stand on (`minW` < 384) and zoom in.
  const need = Math.max(160, Math.min(STAGE_MIN_W, minW))
  const raw = Math.min(availW / need, availH / STAGE_H)
  let zoom: number
  if (raw < 1) zoom = Math.max(0.5, Math.floor(raw * 100) / 100)
  else if (Math.floor(raw) >= raw * 0.9) zoom = Math.floor(raw)
  // Under 2× an eighth step keeps a phone's units as big as the room allows.
  else zoom = raw < 2 ? Math.floor(raw * 8) / 8 : Math.floor(raw * 4) / 4
  const width = Math.max(need, Math.min(STAGE_MAX_W, Math.floor(availW / zoom)))
  return { zoom, width }
}

/** How the battle lays itself out: windows under the stage, a phone held upright, or one on its side. */
export type BattleLayout = 'wide' | 'narrow' | 'beside'

export function battleLayout(vw: number, vh: number): BattleLayout {
  if (hudBeside(vw, vh)) return 'beside'
  return vw < 700 && vh > vw ? 'narrow' : 'wide'
}

/** A phone held upright draws the two sides in toward the middle so it can zoom in. */
export const NARROW_SQUEEZE = 0.82

/** Whether the windows go beside the stage rather than under it (short landscape screens). */
export function hudBeside(vw: number, vh: number): boolean {
  return vh < 520 && vw >= 640 && vw > vh * 1.3
}

// ── Keyboard ─────────────────────────────────────────────────────────────────

export type BattleKeyAction =
  | { kind: 'pause' }
  | { kind: 'speed'; speed: 1 | 2 | 4 }
  | { kind: 'skip' }
  | { kind: 'focus' }
  | { kind: 'protect' }
  | { kind: 'unleash' }
  | { kind: 'guard' }
  | { kind: 'hold' }
  | { kind: 'swap' }
  | { kind: 'retreat' }
  | { kind: 'escape' }
  | { kind: 'continue' }

/** The key legends shown on the buttons (the English source; French via t()). */
export const BATTLE_KEYS = {
  pause: 'Space',
  speed1: '1',
  speed2: '2',
  speed4: '3',
  skip: 'S',
  focus: 'F',
  protect: 'P',
  unleash: 'U',
  guard: 'G',
  hold: 'H',
  swap: 'X',
  retreat: 'R',
  close: 'Esc',
} as const

/**
 * Map a keydown to a battle action. `ended`: the replay has reached its end (only
 * Continue / Esc make sense then). Modified keys (Ctrl/Alt/Meta) are the browser's.
 */
export function battleKeyAction(
  e: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; repeat?: boolean },
  ended: boolean,
): BattleKeyAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (ended) {
    if (k === 'Escape' || k === 'Enter') return { kind: 'continue' }
    return null
  }
  if (e.repeat && k !== 'Escape') return null
  switch (k) {
    case ' ':
    case 'Spacebar':
      return { kind: 'pause' }
    case '1':
      return { kind: 'speed', speed: 1 }
    case '2':
      return { kind: 'speed', speed: 2 }
    case '3':
      return { kind: 'speed', speed: 4 }
    case 's':
    case 'Enter':
      return { kind: 'skip' }
    case 'f':
      return { kind: 'focus' }
    case 'p':
      return { kind: 'protect' }
    case 'u':
      return { kind: 'unleash' }
    case 'g':
      return { kind: 'guard' }
    case 'h':
      return { kind: 'hold' }
    case 'x':
      return { kind: 'swap' }
    case 'r':
      return { kind: 'retreat' }
    case 'Escape':
      return { kind: 'escape' }
    default:
      return null
  }
}

/** Whether a key event comes from somewhere the player is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}
