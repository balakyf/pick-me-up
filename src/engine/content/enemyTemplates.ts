/**
 * Enemy archetypes. An enemy IS a Layer 0 unit: tower derives a statline as
 * round(attrMult[attr] * level) per attribute, then runs it through the SAME
 * deriveStats the heroes use. So attrMult is a per-attribute multiplier shaping
 * the archetype's profile; absolute power comes from the floor's level.
 *
 * Profiles (Layer 2 §3.1):
 *  - goblin/wolf/harpy : Prairie (F1-9), low budget, Physical (wolf/harpy fast).
 *  - skeleton/soldier  : Ruins (F11-19); skeleton low HP + Dark, soldier balanced.
 *  - ogre_brute        : high VIT+STR tank.
 *  - dark_mage         : high INT, low VIT.
 *  - beast             : high AGI.
 *  - black_priest      : phased boss (untargetable until the wave is cleared).
 *  - lv999_creature    : enrage puzzle boss (NOT meant to be killed; see anchors).
 *
 * Elements theme by biome: undead -> dark, etc. (feeds the element wheel; Light
 * is the natural counter to the dark bosses).
 */

import type { EnemyTemplate } from '../types'
import { TUNING } from '../tuning'

export const ENEMY_TEMPLATES: Record<string, EnemyTemplate> = {
  // ── Prairie (F1-9) ───────────────────────────────────────────────────────
  goblin: {
    id: 'goblin',
    name: 'Goblin',
    element: 'physical',
    // Low across the board, slightly weighted to STR; the swarm trash mob.
    attrMult: { str: 0.7, agi: 0.6, vit: 0.6, int: 0.3, wil: 0.4 },
  },
  wolf: {
    id: 'wolf',
    name: 'Prairie Wolf',
    element: 'physical',
    // Fast beast: high AGI, modest STR, thin VIT/INT.
    attrMult: { str: 0.7, agi: 1.1, vit: 0.5, int: 0.2, wil: 0.4 },
  },
  harpy: {
    id: 'harpy',
    name: 'Harpy',
    element: 'wind',
    // Flying skirmisher: AGI focus, low VIT, a little INT for shrieks.
    attrMult: { str: 0.6, agi: 1.2, vit: 0.4, int: 0.5, wil: 0.4 },
  },

  // ── Ruins (F11-19) ───────────────────────────────────────────────────────
  skeleton: {
    id: 'skeleton',
    name: 'Skeleton',
    element: 'dark',
    // Undead: numerous, brittle (low VIT/HP), middling STR.
    attrMult: { str: 0.8, agi: 0.7, vit: 0.4, int: 0.3, wil: 0.5 },
  },
  soldier: {
    id: 'soldier',
    name: 'Human Soldier',
    element: 'physical',
    // Balanced trained infantry: solid STR/VIT, decent WIL.
    attrMult: { str: 1.0, agi: 0.8, vit: 1.0, int: 0.4, wil: 0.8 },
  },

  // ── Archetype variants (used by filler / heavier waves) ──────────────────
  ogre_brute: {
    id: 'ogre_brute',
    name: 'Ogre Brute',
    element: 'physical',
    // Tank: huge VIT + STR, sluggish AGI.
    attrMult: { str: 1.6, agi: 0.4, vit: 1.8, int: 0.2, wil: 0.6 },
  },
  dark_mage: {
    id: 'dark_mage',
    name: 'Dark Disciple',
    element: 'dark',
    // Caster: high INT, low VIT/DEF — glass cannon.
    attrMult: { str: 0.3, agi: 0.7, vit: 0.5, int: 1.7, wil: 1.1 },
  },
  beast: {
    id: 'beast',
    name: 'Dire Beast',
    element: 'physical',
    // Pure speed bruiser: very high AGI, solid STR.
    attrMult: { str: 1.0, agi: 1.6, vit: 0.7, int: 0.2, wil: 0.5 },
  },

  // ── Ruins (F11-19) ───────────────────────────────────────────────────────
  // Assassin (canon F15 "soldiers, assassins, mage, knight"): fast, crit-heavy, and
  // hunts the weakest target (archer targeting) — the escort's natural predator.
  assassin: {
    id: 'assassin',
    name: 'Assassin',
    element: 'dark',
    attrMult: { str: 0.9, agi: 1.7, vit: 0.6, int: 0.3, wil: 0.6 },
    unitClass: 'archer',
  },
  // Knight: an elite plate-armoured soldier — slow, very durable.
  knight: {
    id: 'knight',
    name: 'Knight',
    element: 'physical',
    attrMult: { str: 1.3, agi: 0.6, vit: 1.7, int: 0.4, wil: 1.1 },
  },

  // ── Bosses ───────────────────────────────────────────────────────────────
  // Black Priest (canon Taoni F10 special target). Phased: untargetable until all
  // non-phased enemies in the wave are down — the wave must be cleared first.
  black_priest: {
    id: 'black_priest',
    name: 'Black Priest',
    element: 'dark',
    // High everything (boss budget), INT/WIL leaning (a dark caster-priest).
    attrMult: { str: 1.4, agi: 1.2, vit: 2.0, int: 2.2, wil: 2.0 },
    keywords: [{ kind: 'phased' }],
  },
  // Lv999 creature (canon Townia F10 wave 3). A PUZZLE, not a stat-check: it
  // Enrages and is not meant to be killed — clearing the waves + slaying the
  // Black Priest is the win condition. Enrage spikes its output after the
  // configured tick so brute-forcing it is a death trap.
  lv999_creature: {
    id: 'lv999_creature',
    name: 'Lv999 Creature',
    element: 'dark',
    // Catastrophically high everything.
    attrMult: { str: 3.0, agi: 2.5, vit: 4.0, int: 2.5, wil: 3.0 },
    keywords: [{ kind: 'enrage', afterTick: 300, multiplier: 5 }],
  },
  // Halgiraf, the half black dragon (canon F20 boss: "scale immunity … Goddess'
  // Blessing (holy power on weapons) breaks it"). Light is the canon counter; he
  // enrages if the raid drags on. Huge VIT — a raid-sized HP pool.
  halgiraf: {
    id: 'halgiraf',
    name: 'Halgiraf',
    element: 'dark',
    attrMult: { str: 2.2, agi: 0.9, vit: 3.4, int: 1.2, wil: 2.0 },
    keywords: [
      { kind: 'vulnerable', element: 'light' },
      { kind: 'enrage', afterTick: TUNING.tower.f20EnrageTick, multiplier: 2.5 },
    ],
  },
}

/**
 * Hero-side mission NPCs (built like enemies, fielded on the party's side). They
 * never act and are never part of the party — they exist to be protected.
 */
export const ALLY_TEMPLATES: Record<string, EnemyTemplate> = {
  // Princess Priasis (canon Taoni F15 escort target) — fragile.
  priasis: {
    id: 'priasis',
    name: 'Princess Priasis',
    element: 'light',
    attrMult: { str: 0.2, agi: 0.6, vit: 1.1, int: 0.8, wil: 0.9 },
  },
}

// Compile-time sanity: keep f10Waves referenced so this module and the anchors
// share the canon "3 waves" knob from one source.
export const F10_WAVE_COUNT: number = TUNING.tower.f10Waves
