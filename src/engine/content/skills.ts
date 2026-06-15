/**
 * Skill registry (slice subset). The combat sim synthesizes an implicit basic
 * attack for every unit, so a hero's authored skillIds are PURELY additive and a
 * cameo may legitimately have none ([]). This registry holds a few innate,
 * canon-flavored skills that some authored cameos reference.
 *
 * Element `null` means "inherit the unit's element" (see types.ts SkillEffect).
 * Numbers are first-pass tuning shapes; no logic lives here.
 */

import type { SkillRegistry } from '../types'

/**
 * The authored skill table. Keyed by SkillEffect.id; cameo.skillIds index into
 * this map. Kept deliberately small for the slice.
 */
export const SKILLS: SkillRegistry = {
  // Warrior single-target power strike (canon "Power Strike").
  power_strike: {
    id: 'power_strike',
    name: 'Power Strike',
    skillMult: 1.6,
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 30,
  },
  // Spear thrust hitting a single front target hard (Muden's "Spear" flavor).
  piercing_thrust: {
    id: 'piercing_thrust',
    name: 'Piercing Thrust',
    skillMult: 1.7,
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 35,
  },
  // Thief multi-strike flurry (King's-Eyes scout flavor).
  shadow_flurry: {
    id: 'shadow_flurry',
    name: 'Shadow Flurry',
    skillMult: 1.25,
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 25,
  },
  // Archer lightning volley vs all enemies (Nihaku "Thunderbringer").
  thunder_volley: {
    id: 'thunder_volley',
    name: 'Thunder Volley',
    skillMult: 0.9,
    damageType: 'physical',
    element: 'wind',
    target: 'all-enemies',
    spCost: 45,
  },
  // Mage elemental nuke vs all enemies.
  arcane_burst: {
    id: 'arcane_burst',
    name: 'Arcane Burst',
    skillMult: 1.4,
    damageType: 'magic',
    element: null,
    target: 'all-enemies',
    spCost: 50,
  },
}
