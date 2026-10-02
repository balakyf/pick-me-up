/** Every track by id. */
import { act1, act2, act3, act4, act5, act6, act7, act8 } from './acts'
import { boss, deathMotif, defeat, victory, wailingWall, worldsEnd } from './events'
import { lobbyDay, lobbyNight, lobbyRain, summon, title } from './scenes'
import type { Track, TrackId } from './types'

export const TRACKS: Record<TrackId, Track> = {
  title,
  'lobby-day': lobbyDay,
  'lobby-night': lobbyNight,
  'lobby-rain': lobbyRain,
  summon,
  'act-1': act1,
  'act-2': act2,
  'act-3': act3,
  'act-4': act4,
  'act-5': act5,
  'act-6': act6,
  'act-7': act7,
  'act-8': act8,
  boss,
  'wailing-wall': wailingWall,
  'worlds-end': worldsEnd,
  victory,
  defeat,
  'death-motif': deathMotif,
}

export type { Track, TrackId } from './types'
