/**
 * Mood marks over heroes on the campus (lane L): a tear for the grieving, a storm cloud for
 * a hero caught up in a camp incident, a spark for the inspired. Deterministic Bitmaps in
 * the emote bubble's shape (props.drawEmote); render.ts caches and draws them.
 */
import { createBitmap, hex, outline, rect, roundRect, set, vline, hline, type Bitmap } from '../pixel/bitmap'
import { INK } from '../pixel/palette'
import type { GameState, OwnedHero } from '../../engine/types'
import { incidentFor, lifeOf, moraleOf } from '../../engine/life'

export type MoodKind = 'tear' | 'storm' | 'spark'

export function drawMood(kind: MoodKind): Bitmap {
  const b = createBitmap(11, 11)
  roundRect(b, 0, 0, 11, 8, hex('#fff6e0'))
  set(b, 4, 8, hex('#fff6e0'))
  set(b, 5, 9, hex('#fff6e0'))
  switch (kind) {
    case 'tear': {
      const c = hex('#5a8ae0')
      set(b, 5, 1, c)
      hline(b, 4, 2, 3, c)
      rect(b, 3, 3, 5, 3, c)
      hline(b, 4, 6, 3, c)
      set(b, 4, 3, hex('#cfe0ff'))
      break
    }
    case 'storm': {
      const cloud = hex('#6a6a80')
      rect(b, 2, 2, 7, 2, cloud)
      rect(b, 3, 1, 3, 1, cloud)
      const bolt = hex('#f2c75c')
      set(b, 6, 4, bolt)
      set(b, 5, 5, bolt)
      set(b, 6, 5, bolt)
      set(b, 5, 6, bolt)
      break
    }
    case 'spark': {
      const g = hex('#f2c75c')
      vline(b, 5, 1, 6, g)
      hline(b, 2, 4, 7, g)
      set(b, 4, 3, g)
      set(b, 6, 3, g)
      set(b, 4, 5, g)
      set(b, 6, 5, g)
      break
    }
  }
  return outline(b, INK)
}

/** Grief at/above this shows a tear over the hero. */
export const TEAR_AT = 25

/** The mood mark a hero wears right now, or null (an incident first, then grief, then joy). */
export function moodFor(state: GameState, hero: OwnedHero): MoodKind | null {
  if (incidentFor(state, hero.id)) return 'storm'
  if (lifeOf(hero).grief >= TEAR_AT) return 'tear'
  if (moraleOf(state, hero.id).band === 'inspired') return 'spark'
  return null
}
