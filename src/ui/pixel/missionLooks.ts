/**
 * Lane P: the filler missions' escorts, as people (the HeroLook the battle and the briefing
 * draw them with). Keyed by the ally template's display name, like Priasis and the Key Bearer
 * in `sprites.ts`.
 */
import { hex } from './bitmap'
import { ELEMENT_RAMP, GOLD, HAIR, SKIN, STEEL, ramp } from './palette'
import type { HeroLook } from './look'

/** A refugee of the Ruins: a hood, a patched travelling coat. */
export function refugeeLook(): HeroLook {
  return {
    skin: SKIN[1]!,
    hair: HAIR[2]!,
    hairStyle: 'bob',
    eyes: hex('#3a2a1a'),
    outfit: 'peasant',
    cloth: ramp('#3a3a42', '#6a6a72', '#9a9aa2'),
    cloth2: ramp('#4a3020', '#7a5030', '#a87a50'),
    metal: STEEL,
    accent: GOLD,
    headgear: 'hood',
    weapon: 'none',
    shield: false,
    cape: null,
    trim: false,
    apron: false,
    mark: 'none',
  }
}

/** A pearl diver of the Drowned Coast: sea-blue wraps, bare-headed. */
export function pearlDiverLook(): HeroLook {
  return {
    skin: SKIN[3]!,
    hair: HAIR[0]!,
    hairStyle: 'ponytail',
    eyes: hex('#1a4a6a'),
    outfit: 'peasant',
    cloth: ramp('#1a4a6a', '#2a7aa0', '#7ac0e0'),
    cloth2: ramp('#2a3a4a', '#4a6a7a', '#8aa8b8'),
    metal: STEEL,
    accent: ELEMENT_RAMP.water,
    headgear: 'none',
    weapon: 'none',
    shield: false,
    cape: null,
    trim: false,
    apron: false,
    mark: 'none',
  }
}

/** A deserter from the Order: its colours torn off, the black coat kept. */
export function deserterLook(): HeroLook {
  return {
    skin: SKIN[2]!,
    hair: HAIR[5]!,
    hairStyle: 'short',
    eyes: hex('#2a2a2a'),
    outfit: 'peasant',
    cloth: ramp('#1a1a22', '#34343e', '#5a5a66'),
    cloth2: ramp('#3a1a1a', '#5a2a2a', '#8a4a4a'),
    metal: STEEL,
    accent: ELEMENT_RAMP.dark,
    headgear: 'none',
    weapon: 'none',
    shield: false,
    cape: null,
    trim: false,
    apron: false,
    mark: 'none',
  }
}

/** The escorts' looks by display name (merged into sprites.ts's ALLY_LOOKS). */
export const MISSION_ALLY_LOOKS: Record<string, () => HeroLook> = {
  Refugee: refugeeLook,
  'Pearl Diver': pearlDiverLook,
  'Order Deserter': deserterLook,
}
