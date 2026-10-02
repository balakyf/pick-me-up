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
    family: 'humanoid',
    element: 'physical',
    // Low across the board, slightly weighted to STR; the swarm trash mob.
    attrMult: { str: 0.7, agi: 0.6, vit: 0.6, int: 0.3, wil: 0.4 },
  },
  wolf: {
    id: 'wolf',
    name: 'Prairie Wolf',
    family: 'beast',
    element: 'physical',
    // Fast beast: high AGI, modest STR, thin VIT/INT.
    attrMult: { str: 0.7, agi: 1.1, vit: 0.5, int: 0.2, wil: 0.4 },
  },
  harpy: {
    id: 'harpy',
    name: 'Harpy',
    family: 'beast',
    element: 'wind',
    // Flying skirmisher: AGI focus, low VIT, a little INT for shrieks.
    attrMult: { str: 0.6, agi: 1.2, vit: 0.4, int: 0.5, wil: 0.4 },
  },

  // ── Ruins (F11-19) ───────────────────────────────────────────────────────
  skeleton: {
    id: 'skeleton',
    name: 'Skeleton',
    family: 'undead',
    element: 'dark',
    // Undead: numerous, brittle (low VIT/HP), middling STR.
    attrMult: { str: 0.8, agi: 0.7, vit: 0.4, int: 0.3, wil: 0.5 },
  },
  soldier: {
    id: 'soldier',
    name: 'Human Soldier',
    family: 'humanoid',
    element: 'physical',
    // Balanced trained infantry: solid STR/VIT, decent WIL.
    attrMult: { str: 1.0, agi: 0.8, vit: 1.0, int: 0.4, wil: 0.8 },
  },

  // ── Archetype variants (used by filler / heavier waves) ──────────────────
  ogre_brute: {
    id: 'ogre_brute',
    name: 'Ogre Brute',
    family: 'humanoid',
    element: 'physical',
    // Tank: huge VIT + STR, sluggish AGI.
    attrMult: { str: 1.6, agi: 0.4, vit: 1.8, int: 0.2, wil: 0.6 },
  },
  // The side room's Mimic (challenge/rooms.ts): "a chest that breathes". Its own template
  // so it is drawn as a chest and logged as itself in the Codex; it keeps the ogre's
  // statline, so a Mimic fight resolves exactly as it did when it borrowed the ogre.
  mimic: {
    id: 'mimic',
    name: 'Mimic',
    family: 'construct',
    element: 'physical',
    attrMult: { str: 1.6, agi: 0.4, vit: 1.8, int: 0.2, wil: 0.6 },
  },
  dark_mage: {
    id: 'dark_mage',
    name: 'Dark Disciple',
    family: 'humanoid',
    element: 'dark',
    // Caster: high INT, low VIT/DEF — glass cannon.
    attrMult: { str: 0.3, agi: 0.7, vit: 0.5, int: 1.7, wil: 1.1 },
  },
  beast: {
    id: 'beast',
    name: 'Dire Beast',
    family: 'beast',
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
    family: 'humanoid',
    element: 'dark',
    attrMult: { str: 0.9, agi: 1.7, vit: 0.6, int: 0.3, wil: 0.6 },
    unitClass: 'archer',
  },
  // Knight: an elite plate-armoured soldier — slow, very durable.
  knight: {
    id: 'knight',
    name: 'Knight',
    family: 'humanoid',
    element: 'physical',
    attrMult: { str: 1.3, agi: 0.6, vit: 1.7, int: 0.4, wil: 1.1 },
  },

  // ── Bosses ───────────────────────────────────────────────────────────────
  // Black Priest (canon Taoni F10 special target). Phased: untargetable until all
  // non-phased enemies in the wave are down — the wave must be cleared first.
  black_priest: {
    id: 'black_priest',
    name: 'Black Priest',
    family: 'humanoid',
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
    // It is fielded far below 999 (anchors.ts levelBonus); the name is the truth the UI shows.
    displayLevel: 999,
    // Catastrophically high everything.
    attrMult: { str: 3.0, agi: 2.5, vit: 4.0, int: 2.5, wil: 3.0 },
    keywords: [{ kind: 'enrage', afterTick: 300, multiplier: 5 }, { kind: 'looming' }],
  },
  // Halgiraf, the half black dragon (canon F20 boss: "scale immunity … Goddess'
  // Blessing (holy power on weapons) breaks it"). Light is the canon counter; he
  // enrages if the raid drags on. Huge VIT — a raid-sized HP pool.
  halgiraf: {
    id: 'halgiraf',
    name: 'Halgiraf',
    family: 'dragon',
    element: 'dark',
    attrMult: { str: 2.2, agi: 0.9, vit: 3.4, int: 1.2, wil: 2.0 },
    keywords: [
      { kind: 'vulnerable', element: 'light' },
      { kind: 'enrage', afterTick: TUNING.tower.f20EnrageTick, multiplier: 2.5 },
    ],
  },

  // ══ Act III — The Swamp (F21–29; F25 Escape, F30 Explore) ══════════════════
  lizardman: {
    id: 'lizardman',
    name: 'Lizardman Fighter',
    family: 'humanoid',
    element: 'water',
    attrMult: { str: 1.1, agi: 0.9, vit: 1.1, int: 0.3, wil: 0.7 },
  },
  lizard_shaman: {
    id: 'lizard_shaman',
    name: 'Lizardman Shaman',
    family: 'humanoid',
    element: 'water',
    attrMult: { str: 0.3, agi: 0.8, vit: 0.6, int: 1.6, wil: 1.2 },
    unitClass: 'mage',
  },
  lizard_rider: {
    id: 'lizard_rider',
    name: 'Lizardman Rider',
    family: 'humanoid',
    element: 'earth',
    attrMult: { str: 1.1, agi: 1.5, vit: 0.8, int: 0.2, wil: 0.6 },
  },
  mud_golem: {
    id: 'mud_golem',
    name: 'Mud Golem',
    family: 'construct',
    element: 'earth',
    attrMult: { str: 1.3, agi: 0.3, vit: 2.0, int: 0.1, wil: 0.9 },
  },
  lizard_chief: {
    id: 'lizard_chief',
    name: 'Lizardman Chief',
    family: 'humanoid',
    element: 'water',
    attrMult: { str: 2.0, agi: 1.1, vit: 2.2, int: 0.6, wil: 1.4 },
  },
  mage_golem: {
    id: 'mage_golem',
    name: 'XYZ Mage Golem',
    family: 'construct',
    element: 'earth',
    attrMult: { str: 0.4, agi: 0.5, vit: 1.6, int: 1.5, wil: 1.2 },
    unitClass: 'mage',
  },
  // Truth Seeker Kurushahr (canon F30 boss).
  kurushahr: {
    id: 'kurushahr',
    name: 'Kurushahr',
    family: 'humanoid',
    element: 'dark',
    attrMult: { str: 0.6, agi: 1.2, vit: 1.8, int: 2.6, wil: 2.0 },
    unitClass: 'mage',
  },
  // The Ancient Stone Statue (canon F30: a 300m giant; magic-immune; phased until its
  // crystal cores fall).
  stone_statue: {
    id: 'stone_statue',
    name: 'Ancient Stone Statue',
    family: 'construct',
    element: 'earth',
    attrMult: { str: 2.4, agi: 0.4, vit: 4.0, int: 1.0, wil: 2.2 },
    keywords: [{ kind: 'immune', damageType: 'magic' }, { kind: 'phased' }],
  },
  crystal_core: {
    id: 'crystal_core',
    name: 'Crystal Core',
    family: 'construct',
    element: 'light',
    attrMult: { str: 0.5, agi: 0.6, vit: 1.4, int: 1.8, wil: 1.0 },
    unitClass: 'mage',
  },

  // ══ Act IV — The Drowned Coast (F31–35; F35 Capture) ═══════════════════════
  shark: {
    id: 'shark',
    name: 'Man-eater Shark',
    family: 'aquatic',
    element: 'water',
    attrMult: { str: 1.3, agi: 1.4, vit: 0.9, int: 0.2, wil: 0.5 },
    unitClass: 'thief',
  },
  merman: {
    id: 'merman',
    name: 'Tainted Merman',
    family: 'aquatic',
    element: 'water',
    attrMult: { str: 1.0, agi: 1.0, vit: 1.0, int: 0.8, wil: 0.8 },
  },
  kraken_spawn: {
    id: 'kraken_spawn',
    name: 'Kraken Spawn',
    family: 'aquatic',
    element: 'water',
    attrMult: { str: 0.9, agi: 0.7, vit: 1.4, int: 0.6, wil: 0.9 },
  },
  guardian_golem: {
    id: 'guardian_golem',
    name: 'Guardian Golem',
    family: 'construct',
    element: 'earth',
    attrMult: { str: 1.4, agi: 0.3, vit: 2.2, int: 0.2, wil: 1.2 },
  },
  kraken: {
    id: 'kraken',
    name: 'Kraken',
    family: 'aquatic',
    element: 'water',
    attrMult: { str: 1.9, agi: 0.6, vit: 3.0, int: 1.0, wil: 1.6 },
  },
  // Carries the blue jewel (canon F35 "steal the blue jewel").
  jewel_guardian: {
    id: 'jewel_guardian',
    name: 'Jewel Guardian',
    family: 'construct',
    element: 'water',
    attrMult: { str: 1.2, agi: 0.5, vit: 2.4, int: 0.8, wil: 1.6 },
  },
  // The water dragon Kthat / god-dragon Ctaat (canon F34/35; hidden "Hunt of the Water God").
  kthat: {
    id: 'kthat',
    name: 'Water Dragon Kthat',
    family: 'dragon',
    element: 'water',
    attrMult: { str: 2.4, agi: 1.2, vit: 3.4, int: 1.8, wil: 2.2 },
    keywords: [{ kind: 'vulnerable', element: 'wind' }],
  },

  // ══ Act V — The Order's War (F36–69; the F36–40 loop) ══════════════════════
  order_soldier: {
    id: 'order_soldier',
    name: 'Order Soldier',
    family: 'humanoid',
    element: 'physical',
    attrMult: { str: 1.1, agi: 0.9, vit: 1.1, int: 0.4, wil: 0.9 },
  },
  dark_knight: {
    id: 'dark_knight',
    name: 'Dark Knight',
    family: 'humanoid',
    element: 'dark',
    attrMult: { str: 1.4, agi: 0.6, vit: 1.7, int: 0.4, wil: 1.2 },
  },
  demon_marksman: {
    id: 'demon_marksman',
    name: "Demon's Marksman",
    family: 'demon',
    element: 'fire',
    attrMult: { str: 1.2, agi: 1.5, vit: 0.7, int: 0.5, wil: 0.6 },
    unitClass: 'archer',
  },
  order_mage: {
    id: 'order_mage',
    name: 'Order Battlemage',
    family: 'humanoid',
    element: 'light',
    attrMult: { str: 0.3, agi: 0.8, vit: 0.7, int: 1.8, wil: 1.3 },
    unitClass: 'mage',
  },
  // Canon F40 mini-bosses: Rodvick (strength) and Lazenca (speed).
  rodvick: {
    id: 'rodvick',
    name: 'Rodvick',
    family: 'humanoid',
    element: 'physical',
    attrMult: { str: 2.6, agi: 0.8, vit: 2.2, int: 0.3, wil: 1.2 },
  },
  lazenca: {
    id: 'lazenca',
    name: 'Lazenca',
    family: 'humanoid',
    element: 'wind',
    attrMult: { str: 1.5, agi: 2.8, vit: 1.1, int: 0.4, wil: 0.9 },
    unitClass: 'thief',
  },
  // Canon F40 boss: Valention of Iron Blood.
  valention: {
    id: 'valention',
    name: 'Valention of Iron Blood',
    family: 'humanoid',
    element: 'fire',
    attrMult: { str: 2.8, agi: 1.2, vit: 3.2, int: 0.8, wil: 2.2 },
    keywords: [{ kind: 'guard', reduction: 0.15 }],
  },
  // Canon F41: Versace of Silver Lightning, the last Order executive — very fast.
  versace: {
    id: 'versace',
    name: 'Versace of Silver Lightning',
    family: 'humanoid',
    element: 'wind',
    attrMult: { str: 1.6, agi: 3.2, vit: 1.6, int: 0.8, wil: 1.2 },
    unitClass: 'thief',
  },
  // Canon F42: Darkan of Destruction, 3rd guard division commander.
  darkan: {
    id: 'darkan',
    name: 'Darkan of Destruction',
    family: 'humanoid',
    element: 'dark',
    attrMult: { str: 3.0, agi: 1.0, vit: 3.0, int: 1.0, wil: 2.0 },
    keywords: [{ kind: 'frenzy', belowHpPct: 50, multiplier: 1.4 }],
  },
  // Canon F45 enemies escort nothing; F50's Egg and its brood.
  egg_brood: {
    id: 'egg_brood',
    name: 'Egg Brood',
    family: 'demon',
    element: 'dark',
    attrMult: { str: 1.0, agi: 1.3, vit: 0.8, int: 0.6, wil: 0.6 },
  },
  the_egg: {
    id: 'the_egg',
    name: 'The Egg',
    family: 'demon',
    element: 'dark',
    attrMult: { str: 0.1, agi: 0.1, vit: 4.0, int: 0.1, wil: 3.0 },
    keywords: [{ kind: 'phased' }, { kind: 'vulnerable', element: 'light' }],
  },
  order_inquisitor: {
    id: 'order_inquisitor',
    name: 'Order Inquisitor',
    family: 'humanoid',
    element: 'light',
    attrMult: { str: 1.0, agi: 1.0, vit: 2.4, int: 2.4, wil: 2.2 },
    unitClass: 'mage',
  },
  // Canon: the Book of Reverse Heaven "dropped after defeating El Cid" — a fallen ranker.
  el_cid: {
    id: 'el_cid',
    name: 'El Cid, the Fallen Ranker',
    family: 'humanoid',
    element: 'light',
    attrMult: { str: 3.2, agi: 1.6, vit: 3.6, int: 1.4, wil: 2.6 },
    keywords: [{ kind: 'aegis', charges: 2 }, { kind: 'enrage', afterTick: 600, multiplier: 2 }],
  },
  order_saint: {
    id: 'order_saint',
    name: "The Order's Saint",
    family: 'humanoid',
    element: 'light',
    attrMult: { str: 0.8, agi: 1.0, vit: 3.0, int: 2.8, wil: 3.0 },
    unitClass: 'mage',
    keywords: [{ kind: 'lifesteal', fraction: 0.2 }],
  },

  // ══ Act VI — The Inflection (F70–79) ═══════════════════════════════════════
  chimera: {
    id: 'chimera',
    name: 'Chimera',
    family: 'beast',
    element: 'fire',
    attrMult: { str: 1.5, agi: 1.3, vit: 1.4, int: 1.0, wil: 0.9 },
  },
  wraith: {
    id: 'wraith',
    name: 'Wraith',
    family: 'undead',
    element: 'dark',
    attrMult: { str: 0.6, agi: 1.4, vit: 0.9, int: 1.7, wil: 1.4 },
    unitClass: 'mage',
    // Steel passes half-through a wraith: mages (or Light) are the answer, but a party
    // without one is slowed, not locked out of a whole act.
    keywords: [{ kind: 'resist', damageType: 'physical', reduction: 0.75 }, { kind: 'vulnerable', element: 'light' }],
  },
  chimera_matriarch: {
    id: 'chimera_matriarch',
    name: 'Chimera Matriarch',
    family: 'beast',
    element: 'fire',
    attrMult: { str: 3.0, agi: 1.6, vit: 3.6, int: 1.6, wil: 2.0 },
    keywords: [{ kind: 'frenzy', belowHpPct: 40, multiplier: 1.6 }],
  },

  // ══ Act VII — The Wailing Wall (F80–89): the Fragment Series, for every account ══
  fragment_shard: {
    id: 'fragment_shard',
    name: 'Fragment Shard',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 1.2, agi: 1.4, vit: 0.9, int: 1.2, wil: 1.0 },
    keywords: [{ kind: 'guard', reduction: 0.1 }],
  },
  fragment_knight: {
    id: 'fragment_knight',
    name: 'Fragment Knight',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 1.7, agi: 0.9, vit: 2.0, int: 0.6, wil: 1.4 },
    keywords: [{ kind: 'immune', damageType: 'magic' }],
  },
  fragment_warden: {
    id: 'fragment_warden',
    name: 'Fragment Warden',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 0.5, agi: 1.0, vit: 1.3, int: 2.2, wil: 1.8 },
    unitClass: 'mage',
    keywords: [{ kind: 'immune', damageType: 'physical' }],
  },
  // Canon: Taonier's F80 boss, its highest leader.
  pryos: {
    id: 'pryos',
    name: 'Pryos Al Ragna',
    family: 'humanoid',
    element: 'dark',
    attrMult: { str: 3.4, agi: 1.8, vit: 4.0, int: 2.4, wil: 3.0 },
    keywords: [{ kind: 'aegis', charges: 3 }, { kind: 'vulnerable', element: 'light' }],
  },
  fragment_colossus: {
    id: 'fragment_colossus',
    name: 'Fragment Colossus',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 3.6, agi: 0.6, vit: 5.0, int: 1.2, wil: 3.0 },
    keywords: [{ kind: 'guard', reduction: 0.25 }, { kind: 'enrage', afterTick: 700, multiplier: 2.5 }],
  },

  // ══ Act VIII — The Unfinished Floors (F90–100) ══════════════════════════════
  void_spawn: {
    id: 'void_spawn',
    name: 'Void Spawn',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 1.4, agi: 1.6, vit: 1.1, int: 1.4, wil: 1.1 },
  },
  abyss_knight: {
    id: 'abyss_knight',
    name: 'Abyss Knight',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 2.0, agi: 1.0, vit: 2.4, int: 0.8, wil: 1.8 },
    keywords: [{ kind: 'guard', reduction: 0.15 }],
  },
  // F90: clearing it destroys the world (canon).
  herald_of_end: {
    id: 'herald_of_end',
    name: 'Herald of the End',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 3.8, agi: 2.0, vit: 4.6, int: 3.0, wil: 3.4 },
    keywords: [{ kind: 'aegis', charges: 3 }, { kind: 'enrage', afterTick: 800, multiplier: 3 }],
  },
  // F100: the summit — the architect of the tower.
  tell: {
    id: 'tell',
    name: 'Tell, the Architect',
    family: 'humanoid',
    element: 'light',
    attrMult: { str: 4.0, agi: 2.6, vit: 5.2, int: 4.0, wil: 4.0 },
    keywords: [{ kind: 'aegis', charges: 4 }, { kind: 'lifesteal', fraction: 0.15 }, { kind: 'frenzy', belowHpPct: 30, multiplier: 1.8 }],
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
  // F45 Delivery: the special NPC's courier, carrying the key.
  key_bearer: {
    id: 'key_bearer',
    name: 'Key Bearer',
    element: 'physical',
    attrMult: { str: 0.3, agi: 0.9, vit: 1.4, int: 0.4, wil: 0.8 },
  },
  // F50 Complex: the object to protect — inert, but sturdy.
  sealed_object: {
    id: 'sealed_object',
    name: 'Sealed Object',
    element: 'light',
    attrMult: { str: 0.1, agi: 0.1, vit: 2.4, int: 0.1, wil: 1.6 },
  },
}

// Compile-time sanity: keep f10Waves referenced so this module and the anchors
// share the canon "3 waves" knob from one source.
export const F10_WAVE_COUNT: number = TUNING.tower.f10Waves
