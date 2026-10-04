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
 *
 * `caster: true` marks the INT-built templates (Dark Disciple, Black Priest, the
 * shamans, golems and Order mages, Kurushahr, Wraiths, the Fragment Warden): their
 * basic attack is a Spell — magic from their mAtk against a hero's mDef — instead of
 * a Strike through their thin pAtk (unit.ts `enemyBasicAttack`).
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
    kit: ['e_rend'],
  },
  harpy: {
    id: 'harpy',
    name: 'Harpy',
    family: 'beast',
    element: 'wind',
    // Flying skirmisher: AGI focus, low VIT, a little INT for shrieks.
    attrMult: { str: 0.6, agi: 1.2, vit: 0.4, int: 0.5, wil: 0.4 },
    kit: ['e_shriek'],
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
    kit: ['e_shield_bash'],
  },

  // ── Archetype variants (used by filler / heavier waves) ──────────────────
  ogre_brute: {
    id: 'ogre_brute',
    name: 'Ogre Brute',
    family: 'humanoid',
    element: 'physical',
    // Tank: huge VIT + STR, sluggish AGI.
    attrMult: { str: 1.6, agi: 0.4, vit: 1.8, int: 0.2, wil: 0.6 },
    kit: ['e_ground_slam'],
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
    caster: true,
    kit: ['e_shadow_bolt'],
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
    // Lane G: an assassin's first cut is the deepest.
    keywords: [{ kind: 'opener', multiplier: 1.5 }],
  },
  // Knight: an elite plate-armoured soldier — slow, very durable.
  knight: {
    id: 'knight',
    name: 'Knight',
    family: 'humanoid',
    element: 'physical',
    attrMult: { str: 1.3, agi: 0.6, vit: 1.7, int: 0.4, wil: 1.1 },
    kit: ['e_shield_wall', 'e_shield_bash'],
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
    caster: true,
    keywords: [{ kind: 'phased' }],
    // Lane G: he curses, he mends his acolytes, and he winds up a black rite over the party.
    kit: ['e_curse', 'e_dark_prayer', 'e_black_rite'],
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
      {
        kind: 'phase',
        atHpPct: 50,
        title: 'Takes flight',
        line: 'Halgiraf beats his black wings and takes to the sky!',
        addKeywords: [{ kind: 'guard', reduction: 0.4, vs: 'melee' }],
        skills: ['e_sky_dive'],
        spdPct: 15,
      },
    ],
    // Lane G: the breath is wound up (a telegraph); at half HP he takes to the air — blades
    // can barely reach him, and he dives on the hero he picks.
    kit: ['e_dragon_breath', 'e_tail_sweep'],
  },

  // ══ Act III — The Swamp (F21–29; F25 Escape, F30 Explore) ══════════════════
  lizardman: {
    id: 'lizardman',
    name: 'Lizardman Fighter',
    family: 'humanoid',
    element: 'water',
    attrMult: { str: 1.1, agi: 0.9, vit: 1.1, int: 0.3, wil: 0.7 },
    // Lane G: cold blood runs hot when it is cornered.
    keywords: [{ kind: 'frenzy', belowHpPct: 35, multiplier: 1.3 }],
  },
  lizard_shaman: {
    id: 'lizard_shaman',
    name: 'Lizardman Shaman',
    family: 'humanoid',
    element: 'water',
    attrMult: { str: 0.3, agi: 0.8, vit: 0.6, int: 1.6, wil: 1.2 },
    caster: true,
    unitClass: 'mage',
    kit: ['e_venom_spit', 'e_swamp_mending'],
  },
  lizard_rider: {
    id: 'lizard_rider',
    name: 'Lizardman Rider',
    family: 'humanoid',
    element: 'earth',
    attrMult: { str: 1.1, agi: 1.5, vit: 0.8, int: 0.2, wil: 0.6 },
    kit: ['e_trample'],
  },
  mud_golem: {
    id: 'mud_golem',
    name: 'Mud Golem',
    family: 'construct',
    element: 'earth',
    attrMult: { str: 1.3, agi: 0.3, vit: 2.0, int: 0.1, wil: 0.9 },
    kit: ['e_mud_bind'],
  },
  lizard_chief: {
    id: 'lizard_chief',
    name: 'Lizardman Chief',
    family: 'humanoid',
    element: 'water',
    attrMult: { str: 2.0, agi: 1.1, vit: 2.2, int: 0.6, wil: 1.4 },
    kit: ['e_chief_cleave', 'e_war_bellow', 'e_crushing_leap'],
  },
  mage_golem: {
    id: 'mage_golem',
    name: 'XYZ Mage Golem',
    family: 'construct',
    element: 'earth',
    attrMult: { str: 0.4, agi: 0.5, vit: 1.6, int: 1.5, wil: 1.2 },
    caster: true,
    unitClass: 'mage',
    kit: ['e_xyz_barrage'],
  },
  // Truth Seeker Kurushahr (canon F30 boss).
  kurushahr: {
    id: 'kurushahr',
    name: 'Kurushahr',
    family: 'humanoid',
    element: 'dark',
    attrMult: { str: 0.6, agi: 1.2, vit: 1.8, int: 2.6, wil: 2.0 },
    caster: true,
    unitClass: 'mage',
    kit: ['e_truth_lance', 'e_mind_rend', 'e_arcane_storm'],
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
    kit: ['e_titan_fist'],
  },
  crystal_core: {
    id: 'crystal_core',
    name: 'Crystal Core',
    family: 'construct',
    element: 'light',
    attrMult: { str: 0.5, agi: 0.6, vit: 1.4, int: 1.8, wil: 1.0 },
    caster: true,
    unitClass: 'mage',
    kit: ['e_core_ward'],
  },

  // ══ Act IV — The Drowned Coast (F31–35; F35 Capture) ═══════════════════════
  shark: {
    id: 'shark',
    name: 'Man-eater Shark',
    family: 'aquatic',
    element: 'water',
    attrMult: { str: 1.3, agi: 1.4, vit: 0.9, int: 0.2, wil: 0.5 },
    unitClass: 'thief',
    kit: ['e_frenzied_bite'],
  },
  merman: {
    id: 'merman',
    name: 'Tainted Merman',
    family: 'aquatic',
    element: 'water',
    attrMult: { str: 1.0, agi: 1.0, vit: 1.0, int: 0.8, wil: 0.8 },
    kit: ['e_trident_thrust'],
  },
  kraken_spawn: {
    id: 'kraken_spawn',
    name: 'Kraken Spawn',
    family: 'aquatic',
    element: 'water',
    attrMult: { str: 0.9, agi: 0.7, vit: 1.4, int: 0.6, wil: 0.9 },
    kit: ['e_ink_spray'],
  },
  guardian_golem: {
    id: 'guardian_golem',
    name: 'Guardian Golem',
    family: 'construct',
    element: 'earth',
    attrMult: { str: 1.4, agi: 0.3, vit: 2.2, int: 0.2, wil: 1.2 },
    kit: ['e_guardian_shell'],
  },
  kraken: {
    id: 'kraken',
    name: 'Kraken',
    family: 'aquatic',
    element: 'water',
    attrMult: { str: 1.9, agi: 0.6, vit: 3.0, int: 1.0, wil: 1.6 },
    kit: ['e_constrict', 'e_ink_spray'],
  },
  // Carries the blue jewel (canon F35 "steal the blue jewel").
  jewel_guardian: {
    id: 'jewel_guardian',
    name: 'Jewel Guardian',
    family: 'construct',
    element: 'water',
    attrMult: { str: 1.2, agi: 0.5, vit: 2.4, int: 0.8, wil: 1.6 },
    kit: ['e_guardian_shell'],
  },
  // The water dragon Kthat / god-dragon Ctaat (canon F34/35; hidden "Hunt of the Water God").
  kthat: {
    id: 'kthat',
    name: 'Water Dragon Kthat',
    family: 'dragon',
    element: 'water',
    attrMult: { str: 2.4, agi: 1.2, vit: 3.4, int: 1.8, wil: 2.2 },
    keywords: [
      { kind: 'vulnerable', element: 'wind' },
      {
        kind: 'phase',
        atHpPct: 40,
        title: 'The Water God stirs',
        line: "Kthat's eyes go white — something older looks out of them.",
        addKeywords: [{ kind: 'enrage', afterTick: 0, multiplier: 1.25 }],
        cleanse: true,
      },
    ],
    kit: ['e_dragon_bite', 'e_tidal_wave', 'e_water_veil'],
  },

  // ══ Act V — The Order's War (F36–69; the F36–40 loop) ══════════════════════
  order_soldier: {
    id: 'order_soldier',
    name: 'Order Soldier',
    family: 'humanoid',
    element: 'physical',
    attrMult: { str: 1.1, agi: 0.9, vit: 1.1, int: 0.4, wil: 0.9 },
    kit: ['e_shield_bash'],
  },
  dark_knight: {
    id: 'dark_knight',
    name: 'Dark Knight',
    family: 'humanoid',
    element: 'dark',
    attrMult: { str: 1.4, agi: 0.6, vit: 1.7, int: 0.4, wil: 1.2 },
    kit: ['e_dark_cleave', 'e_shield_wall'],
  },
  demon_marksman: {
    id: 'demon_marksman',
    name: "Demon's Marksman",
    family: 'demon',
    element: 'fire',
    attrMult: { str: 1.2, agi: 1.5, vit: 0.7, int: 0.5, wil: 0.6 },
    unitClass: 'archer',
    // Lane G: the Demon's Marksman opens with a shot aimed before the fight began.
    keywords: [{ kind: 'opener', multiplier: 1.6 }],
    kit: ['e_aimed_shot'],
  },
  order_mage: {
    id: 'order_mage',
    name: 'Order Battlemage',
    family: 'humanoid',
    element: 'light',
    attrMult: { str: 0.3, agi: 0.8, vit: 0.7, int: 1.8, wil: 1.3 },
    caster: true,
    unitClass: 'mage',
    kit: ['e_judgment_flare'],
  },
  // Canon F40 mini-bosses: Rodvick (strength) and Lazenca (speed).
  rodvick: {
    id: 'rodvick',
    name: 'Rodvick',
    family: 'humanoid',
    element: 'physical',
    attrMult: { str: 2.6, agi: 0.8, vit: 2.2, int: 0.3, wil: 1.2 },
    kit: ['e_crushing_blow', 'e_war_roar'],
  },
  lazenca: {
    id: 'lazenca',
    name: 'Lazenca',
    family: 'humanoid',
    element: 'wind',
    attrMult: { str: 1.5, agi: 2.8, vit: 1.1, int: 0.4, wil: 0.9 },
    unitClass: 'thief',
    kit: ['e_flicker_strikes', 'e_vanishing_step'],
  },
  // Canon F40 boss: Valention of Iron Blood.
  valention: {
    id: 'valention',
    name: 'Valention of Iron Blood',
    family: 'humanoid',
    element: 'fire',
    attrMult: { str: 2.8, agi: 1.2, vit: 3.2, int: 0.8, wil: 2.2 },
    keywords: [
      { kind: 'guard', reduction: 0.15 },
      {
        kind: 'phase',
        atHpPct: 50,
        title: 'The Iron Guard',
        line: 'Rodvick! Lazenca! To me — the Order does not fall here!',
        addKeywords: [{ kind: 'aegis', charges: 1 }],
        summonWave: 'officers',
      },
    ],
    kit: ['e_iron_blood', 'e_iron_cleave', 'e_iron_verdict'],
  },
  // Canon F41: Versace of Silver Lightning, the last Order executive — very fast.
  versace: {
    id: 'versace',
    name: 'Versace of Silver Lightning',
    family: 'humanoid',
    element: 'wind',
    attrMult: { str: 1.6, agi: 3.2, vit: 1.6, int: 0.8, wil: 1.2 },
    unitClass: 'thief',
    keywords: [
      {
        kind: 'phase',
        atHpPct: 50,
        title: 'Silver Lightning',
        line: "You're slow. Let me show you fast.",
        spdPct: 30,
      },
    ],
    kit: ['e_lightning_step', 'e_thunderclap'],
  },
  // Canon F42: Darkan of Destruction, 3rd guard division commander.
  darkan: {
    id: 'darkan',
    name: 'Darkan of Destruction',
    family: 'humanoid',
    element: 'dark',
    attrMult: { str: 3.0, agi: 1.0, vit: 3.0, int: 1.0, wil: 2.0 },
    keywords: [{ kind: 'frenzy', belowHpPct: 50, multiplier: 1.4 }],
    kit: ['e_armor_crush', 'e_destruction'],
  },
  // Canon F45 enemies escort nothing; F50's Egg and its brood.
  egg_brood: {
    id: 'egg_brood',
    name: 'Egg Brood',
    family: 'demon',
    element: 'dark',
    attrMult: { str: 1.0, agi: 1.3, vit: 0.8, int: 0.6, wil: 0.6 },
    kit: ['e_brood_bite'],
  },
  the_egg: {
    id: 'the_egg',
    name: 'The Egg',
    family: 'demon',
    element: 'dark',
    attrMult: { str: 0.1, agi: 0.1, vit: 4.0, int: 0.1, wil: 3.0 },
    keywords: [
      { kind: 'phased' },
      { kind: 'vulnerable', element: 'light' },
      {
        kind: 'phase',
        atHpPct: 50,
        title: 'The shell cracks',
        line: 'Something inside the Egg screams — and the brood answers.',
        summonWave: 'brood2',
      },
    ],
    // Lane G: it hatches its brood (the brood shields it again: it is phased behind them).
    kit: ['e_hatch'],
  },
  order_inquisitor: {
    id: 'order_inquisitor',
    name: 'Order Inquisitor',
    family: 'humanoid',
    element: 'light',
    attrMult: { str: 1.0, agi: 1.0, vit: 2.4, int: 2.4, wil: 2.2 },
    caster: true,
    unitClass: 'mage',
    // Lane G: the Order's heretic-hunter — every blow on a human lands harder.
    keywords: [{ kind: 'bane', family: 'humanoid', multiplier: 1.25 }],
    kit: ['e_purge', 'e_chains_of_faith'],
  },
  // Canon: the Book of Reverse Heaven "dropped after defeating El Cid" — a fallen ranker.
  el_cid: {
    id: 'el_cid',
    name: 'El Cid, the Fallen Ranker',
    family: 'humanoid',
    element: 'light',
    attrMult: { str: 3.2, agi: 1.6, vit: 3.6, int: 1.4, wil: 2.6 },
    keywords: [
      { kind: 'aegis', charges: 2 },
      { kind: 'enrage', afterTick: 600, multiplier: 2 },
      {
        kind: 'phase',
        atHpPct: 50,
        title: 'No longer holding back',
        line: '…Fine. I will stop holding back.',
        addKeywords: [{ kind: 'enrage', afterTick: 0, multiplier: 1.3 }],
        spdPct: 25,
        cleanse: true,
      },
    ],
    kit: ['e_ranker_slash', 'e_counter_stance', 'e_sword_rain'],
  },
  order_saint: {
    id: 'order_saint',
    name: "The Order's Saint",
    family: 'humanoid',
    element: 'light',
    attrMult: { str: 0.8, agi: 1.0, vit: 3.0, int: 2.8, wil: 3.0 },
    caster: true,
    unitClass: 'mage',
    keywords: [{ kind: 'lifesteal', fraction: 0.2 }],
    kit: ['e_saints_grace', 'e_sanctuary', 'e_holy_light'],
  },

  // ══ Act VI — The Inflection (F70–79) ═══════════════════════════════════════
  chimera: {
    id: 'chimera',
    name: 'Chimera',
    family: 'beast',
    element: 'fire',
    attrMult: { str: 1.5, agi: 1.3, vit: 1.4, int: 1.0, wil: 0.9 },
    kit: ['e_chimera_fire'],
  },
  wraith: {
    id: 'wraith',
    name: 'Wraith',
    family: 'undead',
    element: 'dark',
    attrMult: { str: 0.6, agi: 1.4, vit: 0.9, int: 1.7, wil: 1.4 },
    caster: true,
    unitClass: 'mage',
    // Steel passes half-through a wraith: mages (or Light) are the answer, but a party
    // without one is slowed, not locked out of a whole act.
    keywords: [{ kind: 'resist', damageType: 'physical', reduction: 0.75 }, { kind: 'vulnerable', element: 'light' }],
    kit: ['e_soul_siphon', 'e_wail'],
  },
  chimera_matriarch: {
    id: 'chimera_matriarch',
    name: 'Chimera Matriarch',
    family: 'beast',
    element: 'fire',
    attrMult: { str: 3.0, agi: 1.6, vit: 3.6, int: 1.6, wil: 2.0 },
    keywords: [{ kind: 'frenzy', belowHpPct: 40, multiplier: 1.6 }],
    kit: ['e_three_heads', 'e_inferno', 'e_brood_roar'],
  },

  // ══ Act VII — The Wailing Wall (F80–89): the Fragment Series, for every account ══
  fragment_shard: {
    id: 'fragment_shard',
    name: 'Fragment Shard',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 1.2, agi: 1.4, vit: 0.9, int: 1.2, wil: 1.0 },
    keywords: [{ kind: 'guard', reduction: 0.1 }],
    kit: ['e_shard_burst'],
  },
  fragment_knight: {
    id: 'fragment_knight',
    name: 'Fragment Knight',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 1.7, agi: 0.9, vit: 2.0, int: 0.6, wil: 1.4 },
    keywords: [{ kind: 'immune', damageType: 'magic' }],
    kit: ['e_shield_wall'],
  },
  fragment_warden: {
    id: 'fragment_warden',
    name: 'Fragment Warden',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 0.5, agi: 1.0, vit: 1.3, int: 2.2, wil: 1.8 },
    caster: true,
    unitClass: 'mage',
    keywords: [{ kind: 'immune', damageType: 'physical' }],
    kit: ['e_null_wave'],
  },
  // Canon: Taonier's F80 boss, its highest leader.
  pryos: {
    id: 'pryos',
    name: 'Pryos Al Ragna',
    family: 'humanoid',
    element: 'dark',
    attrMult: { str: 3.4, agi: 1.8, vit: 4.0, int: 2.4, wil: 3.0 },
    keywords: [
      { kind: 'aegis', charges: 3 },
      { kind: 'vulnerable', element: 'light' },
      { kind: 'phase', atHpPct: 66, title: 'The Second Seal', line: 'A seal breaks — and another closes over me.', addKeywords: [{ kind: 'aegis', charges: 2 }] },
      { kind: 'phase', atHpPct: 33, title: 'The Last Seal', line: 'Taonier, watch. This is how a leader falls: standing.', addKeywords: [{ kind: 'aegis', charges: 2 }], spdPct: 15 },
    ],
    kit: ['e_ragna_blade', 'e_dark_dominion', 'e_commanders_will'],
  },
  fragment_colossus: {
    id: 'fragment_colossus',
    name: 'Fragment Colossus',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 3.6, agi: 0.6, vit: 5.0, int: 1.2, wil: 3.0 },
    keywords: [{ kind: 'guard', reduction: 0.25 }, { kind: 'enrage', afterTick: 700, multiplier: 2.5 }],
    kit: ['e_colossal_slam', 'e_fragment_storm'],
  },

  // ══ Act VIII — The Unfinished Floors (F90–100) ══════════════════════════════
  void_spawn: {
    id: 'void_spawn',
    name: 'Void Spawn',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 1.4, agi: 1.6, vit: 1.1, int: 1.4, wil: 1.1 },
    kit: ['e_void_touch'],
  },
  abyss_knight: {
    id: 'abyss_knight',
    name: 'Abyss Knight',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 2.0, agi: 1.0, vit: 2.4, int: 0.8, wil: 1.8 },
    keywords: [{ kind: 'guard', reduction: 0.15 }],
    kit: ['e_dark_cleave', 'e_shield_wall'],
  },
  // F90: clearing it destroys the world (canon).
  herald_of_end: {
    id: 'herald_of_end',
    name: 'Herald of the End',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 3.8, agi: 2.0, vit: 4.6, int: 3.0, wil: 3.4 },
    keywords: [
      { kind: 'aegis', charges: 3 },
      { kind: 'enrage', afterTick: 800, multiplier: 3 },
      {
        kind: 'phase',
        atHpPct: 50,
        title: 'The Last Word',
        line: 'Every world ends. Yours is only the next.',
        addKeywords: [{ kind: 'aegis', charges: 2 }],
        skills: ['e_end_of_days'],
        spdPct: 15,
      },
    ],
    // Lane G: it marks a hero for doom and calls the void to its side; at half, the last word.
    kit: ['e_doom_mark', 'e_call_the_void'],
  },
  // F100: the summit — the architect of the tower.
  tell: {
    id: 'tell',
    name: 'Tell, the Architect',
    family: 'humanoid',
    element: 'light',
    attrMult: { str: 4.0, agi: 2.6, vit: 5.2, int: 4.0, wil: 4.0 },
    keywords: [
      { kind: 'aegis', charges: 4 },
      { kind: 'lifesteal', fraction: 0.15 },
      { kind: 'frenzy', belowHpPct: 30, multiplier: 1.8 },
      // Lane G: three drafts — each calls back the echoes of anchors the Master already beat.
      { kind: 'phase', atHpPct: 75, title: 'The First Draft', line: 'Do you remember the dragon? I wrote him for you.', summonWave: 'echo1' },
      { kind: 'phase', atHpPct: 50, title: 'The Second Draft', line: 'Every victory you had, I wrote first.', summonWave: 'echo2', addKeywords: [{ kind: 'aegis', charges: 2 }] },
      { kind: 'phase', atHpPct: 25, title: 'The Last Draft', line: 'Then let the last page burn.', summonWave: 'echo3', spdPct: 20 },
    ],
    kit: ['e_architects_decree', 'e_rewrite', 'e_final_draft'],
  },

  // Lane G — the echoes Tell calls back in his three drafts: anchors the Master already beat,
  // drawn again in the Architect's light (spectral, weaker, without their seals).
  echo_halgiraf: {
    id: 'echo_halgiraf',
    name: 'Echo of Halgiraf',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 1.5, agi: 0.8, vit: 2.0, int: 0.9, wil: 1.4 },
    kit: ['e_dragon_breath', 'e_tail_sweep'],
  },
  echo_el_cid: {
    id: 'echo_el_cid',
    name: 'Echo of El Cid',
    family: 'fragment',
    element: 'light',
    attrMult: { str: 2.0, agi: 1.2, vit: 2.0, int: 1.0, wil: 1.6 },
    kit: ['e_ranker_slash', 'e_sword_rain'],
  },
  echo_valention: {
    id: 'echo_valention',
    name: 'Echo of Valention',
    family: 'fragment',
    element: 'fire',
    attrMult: { str: 1.8, agi: 0.9, vit: 2.2, int: 0.6, wil: 1.4 },
    kit: ['e_iron_cleave', 'e_iron_blood'],
  },
  echo_pryos: {
    id: 'echo_pryos',
    name: 'Echo of Pryos',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 2.1, agi: 1.3, vit: 2.2, int: 1.6, wil: 1.8 },
    kit: ['e_ragna_blade'],
  },
  echo_herald: {
    id: 'echo_herald',
    name: 'Echo of the Herald',
    family: 'fragment',
    element: 'dark',
    attrMult: { str: 2.2, agi: 1.4, vit: 2.4, int: 2.0, wil: 2.0 },
    kit: ['e_doom_mark'],
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
  // Lane O · F80, the Siege of the Wailing Wall: the ram the Master's army drives at the gate.
  // If it breaks, the siege fails. An object: iron-shod, slow, very hard to stop.
  siege_ram: {
    id: 'siege_ram',
    name: 'Siege Ram',
    element: 'physical',
    attrMult: { str: 0.1, agi: 0.1, vit: 3.2, int: 0.1, wil: 2.2 },
  },
  // Lane O · F86, Taonier's Last Banner: the Al Ragna standard the Wall's defenders left behind.
  al_ragna_banner: {
    id: 'al_ragna_banner',
    name: 'Al Ragna Banner',
    element: 'light',
    attrMult: { str: 0.1, agi: 0.1, vit: 2.6, int: 0.1, wil: 1.8 },
  },
}

// Compile-time sanity: keep f10Waves referenced so this module and the anchors
// share the canon "3 waves" knob from one source.
export const F10_WAVE_COUNT: number = TUNING.tower.f10Waves
