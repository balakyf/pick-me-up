/**
 * The lobby's ambience mix, pure: where the camera is, the hour and the weather in; how
 * loud each bed is and where it sits in the stereo field out. The forge clangs near the
 * Armory, the kitchen hearth crackles, rain and wind follow the weather (muffled under a
 * roof), crickets sing on fair nights out of winter, thunder rolls in a storm.
 * useLobbyAmbience.ts turns the mix into sound.
 */
import type { Season, Weather } from '../../engine/estate'

export interface AmbSource {
  kind: 'forge' | 'hearth'
  /** World pixels (the source's centre). */
  x: number
  y: number
}

export interface AmbInput {
  /** The camera's centre in world pixels, and the view's width (world pixels). */
  cx: number
  cy: number
  viewW: number
  sources: readonly AmbSource[]
  hour: number
  weather: Weather
  season: Season
  /** The Master stands inside a building (its roof is lifted). */
  indoors: boolean
}

export interface AmbLevel {
  gain: number
  pan: number
}

export interface AmbMix {
  forge: AmbLevel
  hearth: AmbLevel
  rain: number
  wind: number
  crickets: number
  /** Rumbles now and then (a storm). */
  thunder: boolean
  /** Outdoor beds through a wall (a low-pass). */
  muffled: boolean
}

/** How far (world px) a positional source carries: about 14 tiles. */
export const HEAR_RADIUS = 14 * 16

/** Night for the crickets: dusk to dawn. */
export function isNight(hour: number): boolean {
  return hour >= 19.5 || hour < 5.5
}

/** Gain and pan of the nearest source of a kind. Pure. */
export function positional(cx: number, cy: number, viewW: number, sources: readonly AmbSource[], kind: AmbSource['kind']): AmbLevel {
  let best: AmbLevel = { gain: 0, pan: 0 }
  for (const s of sources) {
    if (s.kind !== kind) continue
    const d = Math.hypot(s.x - cx, s.y - cy)
    const near = Math.max(0, 1 - d / HEAR_RADIUS)
    const gain = near * near
    if (gain > best.gain) best = { gain, pan: Math.max(-1, Math.min(1, (s.x - cx) / Math.max(1, viewW / 2))) * 0.8 }
  }
  return { gain: round(best.gain), pan: round(best.pan) }
}

const RAIN: Record<Weather, number> = { clear: 0, cloudy: 0, rain: 0.7, storm: 1, fog: 0, snow: 0 }
const WIND: Record<Weather, number> = { clear: 0.08, cloudy: 0.22, rain: 0.3, storm: 0.85, fog: 0.15, snow: 0.5 }

/** The whole mix. Pure. */
export function ambienceMix(i: AmbInput): AmbMix {
  const wall = i.indoors ? 0.35 : 1
  const night = isNight(i.hour)
  const fair = i.weather === 'clear' || i.weather === 'cloudy' || i.weather === 'fog'
  return {
    forge: positional(i.cx, i.cy, i.viewW, i.sources, 'forge'),
    hearth: positional(i.cx, i.cy, i.viewW, i.sources, 'hearth'),
    rain: round(RAIN[i.weather] * wall),
    wind: round(WIND[i.weather] * wall),
    crickets: night && fair && i.season !== 'winter' ? round(0.5 * wall) : 0,
    thunder: i.weather === 'storm',
    muffled: i.indoors,
  }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}
