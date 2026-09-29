/**
 * The curated 16-bit palette. Every material is a 3-step ramp (shadow / base /
 * light) so sprites shade consistently; one universal outline ink binds them.
 */
import type { Element } from '../../engine/types'
import { hex, mix, type RGBA } from './bitmap'

export interface Ramp {
  /** shadow */
  d: RGBA
  /** base */
  m: RGBA
  /** light */
  l: RGBA
}

export const INK = hex('#1b1225') // universal outline
const DEEP = hex('#20143a') // shadows lean cool-violet (dark-fantasy mood)
const WARM_WHITE = hex('#fff6e0')

export function ramp(d: string, m: string, l: string): Ramp {
  return { d: hex(d), m: hex(m), l: hex(l) }
}

/**
 * Pull an arbitrary colour into the palette's comfort zone: keep its hue, clamp
 * saturation and lightness so a random portraitToken never renders neon.
 */
export function tame(c: RGBA, satLo: number, satHi: number, litLo: number, litHi: number): RGBA {
  const r = ((c >>> 24) & 255) / 255
  const g = ((c >>> 16) & 255) / 255
  const b = ((c >>> 8) & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  const l0 = (max + min) / 2
  const d = max - min
  let s0 = 0
  if (d > 0) {
    s0 = d / (1 - Math.abs(2 * l0 - 1))
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = Math.min(satHi, Math.max(satLo, s0))
  const l = Math.min(litHi, Math.max(litLo, l0))
  const C = (1 - Math.abs(2 * l - 1)) * s
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - C / 2
  const [rr, gg, bb] =
    h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X]
  const to = (v: number) => Math.round((v + m) * 255)
  return (((to(rr) << 24) | (to(gg) << 16) | (to(bb) << 8) | 255) >>> 0)
}

/** Derive a ramp from one base colour (used for portraitToken cloth). */
export function rampFrom(base: RGBA): Ramp {
  return { d: mix(base, DEEP, 0.42), m: base, l: mix(base, WARM_WHITE, 0.32) }
}

export const SKIN: Ramp[] = [
  ramp('#c98a6b', '#f2c6a0', '#ffe2c4'),
  ramp('#b87450', '#e3a878', '#f6c79c'),
  ramp('#9a5c3c', '#c98758', '#e3a878'),
  ramp('#6e3f2a', '#9a5c3c', '#bd7a52'),
  ramp('#d59a86', '#f8d8c4', '#fff0e4'),
  ramp('#523024', '#7a4a34', '#9a6448'),
]

export const HAIR: Ramp[] = [
  ramp('#141018', '#2a2230', '#4a3e58'), // black
  ramp('#2e1a12', '#4e3020', '#74492e'), // dark brown
  ramp('#5a3418', '#86532a', '#b07a40'), // brown
  ramp('#6e2412', '#a8401e', '#d0683a'), // auburn
  ramp('#a87a28', '#e0b44a', '#f8e08a'), // blonde
  ramp('#9a9ab0', '#d6d6e4', '#ffffff'), // platinum
  ramp('#5a5a70', '#8e8ea6', '#c0c0d4'), // silver/ash
  ramp('#7a1426', '#b82a3a', '#e05a5a'), // crimson
  ramp('#1a2a5a', '#2e4a8e', '#5a7ac0'), // blue-black
  ramp('#2a5a4a', '#3e8a6e', '#6ec09a'), // teal (rare)
  ramp('#7a3a6e', '#b85aa0', '#e08ac8'), // rose (rare)
]

export const EYES: RGBA[] = ['#2a3a8e', '#3a6e2e', '#5a3418', '#1b1225', '#7a2a8e', '#a8401e'].map(hex)

export const LEATHER = ramp('#4a2a1a', '#7a4a2a', '#a8703e')
export const LINEN = ramp('#8e7a5e', '#c8b490', '#ece0c0')
export const STEEL = ramp('#4a4e62', '#8e94aa', '#d6dcec')
export const GOLD = ramp('#8a5a12', '#d4a02a', '#ffe07a')
export const WOOD = ramp('#4a2a14', '#7a4a24', '#a8703a')
export const BONE = ramp('#8e8672', '#d0c8aa', '#f4eed8')
export const WHITE: RGBA = hex('#fff6e0')

/** Element accent ramps (trim, gems, magic). */
export const ELEMENT_RAMP: Record<Element, Ramp> = {
  fire: ramp('#8e1e12', '#e8553b', '#ffb070'),
  water: ramp('#123a8e', '#3f8fe0', '#9ad4ff'),
  wind: ramp('#1a6e3e', '#4fcf8a', '#b0ffcc'),
  earth: ramp('#6e4a12', '#c99a45', '#f0d48a'),
  light: ramp('#a8801a', '#f5d86b', '#fffbd0'),
  dark: ramp('#3a1a5e', '#9a5ad0', '#d8a8ff'),
  physical: ramp('#4a4e62', '#c9ccd6', '#ffffff'),
}

/** Default cloth for each class when the hero token doesn't override it. */
export const CLASS_CLOTH: Record<string, Ramp> = {
  peasant: ramp('#5a4a2e', '#8e7650', '#b8a074'),
  merc: ramp('#3a2e2a', '#5e4a3e', '#86705c'),
  warrior: ramp('#5a1a1e', '#9a2e2e', '#cc5a4a'),
  spearman: ramp('#1a2e5a', '#2e4e8e', '#5a7ec0'),
  thief: ramp('#1e1e2e', '#34344e', '#56567a'),
  archer: ramp('#1e4a2a', '#346e3a', '#5a9a5a'),
  mage: ramp('#2e1a5e', '#4e2e9a', '#7a5ad0'),
  master: ramp('#1a1a2e', '#2a2a48', '#46467a'),
}

/** UI-facing solid colours (mirrors ui.css tokens for canvas-drawn HUD bits). */
export const UI = {
  gold: hex('#f2c75c'),
  hp: hex('#5fd08a'),
  hpMid: hex('#f2c75c'),
  hpLow: hex('#ef5d6b'),
}
