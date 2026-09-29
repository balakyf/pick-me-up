/**
 * Authored set-piece anchor floors. tower builds an Encounter from an AnchorDef:
 * each AnchorWaveSpec group becomes round(attrMult * (mobLevel + levelBonus))
 * enemies, chained as waves (clearing one spawns the next).
 *
 * Act I: F5 (Survival), F10 (Defense). Act II: F15 (Escort), F20 (Subjugation).
 * Acts III–VIII (F25–F100): the canon Townia/Taoni logs where they exist (F25 Escape,
 * F30 Explore, F35 Capture, F40 the loop gate, F41 Chase, F42 Darkan, F45 Delivery,
 * F50 Complex, F80 Pryos), authored set-pieces between them. Above F20 the tower
 * raises an anchor's levels until it meets its floor's power budget (see tower).
 * Every wave templateId MUST exist in ENEMY_TEMPLATES and every ally templateId in
 * ALLY_TEMPLATES (asserted in tests).
 */

import type { AnchorDef } from '../types'
import { TUNING } from '../tuning'

export const ANCHORS: Record<number, AnchorDef> = {
  // ── F5: Survival ───────────────────────────────────────────────────────────
  // Canon: "Survive the invading goblins for 30 minutes." The waves keep
  // attacking; success is OUTLASTING them for f5SurviveTicks (the timer), not
  // annihilation. Two moderate Prairie waves.
  5: {
    floor: 5,
    missionType: 'Survival',
    objectives: [{ kind: 'survive', ticks: TUNING.tower.f5SurviveTicks }],
    timer: TUNING.tower.f5SurviveTicks,
    waves: [
      [
        { templateId: 'goblin', count: 4 },
        { templateId: 'wolf', count: 2 },
      ],
      [
        { templateId: 'goblin', count: 3 },
        { templateId: 'harpy', count: 2 },
        { templateId: 'wolf', count: 1 },
      ],
    ],
  },

  // ── F10: Defense ─────────────────────────────────────────────────────────
  // FUSES the two canon F10 logs per bible Open-Q2 (the Townia & Taoni floor logs
  // are reconciled as one account's floor): Townia's "Stop the fall of the city —
  // 3 waves, last = Lv999 creature" + Taoni's "Defense, special: exterminate the
  // Black Priest". So F10 = Defend 3 waves AND Defeat(black_priest).
  //
  // PUZZLE, not stat-check: wave 3 contains the Lv999 creature (Enrage) which is
  // NOT meant to be killed. Success = clear the 3 waves + defeat the (phased)
  // Black Priest. The Black Priest is phased: untargetable until the rest of its
  // wave (incl. the Lv999 creature is intended to be outlasted/escaped) is down.
  10: {
    floor: 10,
    missionType: 'Defense',
    objectives: [
      { kind: 'defend', waves: TUNING.tower.f10Waves },
      { kind: 'defeat', targetTag: 'black_priest' },
    ],
    timer: null,
    waves: [
      // Wave 1 — the city's outer line: goblin raiders + undead vanguard.
      [
        { templateId: 'goblin', count: 3 },
        { templateId: 'skeleton', count: 1 },
      ],
      // Wave 2 — heavier push: brute + a dark caster.
      [
        { templateId: 'ogre_brute', count: 1 },
        { templateId: 'dark_mage', count: 1 },
      ],
      // Wave 3 — the finale: the unkillable Lv999 creature (Enrage puzzle) AND the
      // phased Black Priest (the Defeat target). Slay the Priest; do NOT chase the
      // Lv999.
      [
        {
          templateId: 'lv999_creature',
          count: 1,
          levelBonus: 50,
          keywords: [{ kind: 'enrage', afterTick: 300, multiplier: 5 }, { kind: 'looming' }],
        },
        // The Priest's acolyte shields him (he is phased until it falls).
        { templateId: 'skeleton', count: 1 },
        {
          templateId: 'black_priest',
          count: 1,
          levelBonus: 10,
          targetTag: 'black_priest',
          keywords: [{ kind: 'phased' }],
        },
      ],
    ],
  },

  // ── F15: Escort ────────────────────────────────────────────────────────────
  // Canon Taoni F15: "Escort Princess Priasis — 15-min limit before assassination";
  // Townia F15 Guard: "soldiers, assassins, mage, knight". Keep Priasis alive until
  // the window closes. Assassins hunt the weakest target — her — so the party must
  // cut them down first. If she falls, the mission FAILS (no clear).
  15: {
    floor: 15,
    missionType: 'Escort',
    objectives: [
      { kind: 'survive', ticks: TUNING.tower.f15SurviveTicks },
      { kind: 'protect', targetTag: 'priasis' },
    ],
    timer: TUNING.tower.f15SurviveTicks,
    allies: [{ templateId: 'priasis', line: 'back', targetTag: 'priasis', levelBonus: 4 }],
    waves: [
      [
        { templateId: 'soldier', count: 3 },
        { templateId: 'assassin', count: 2 },
      ],
      [
        { templateId: 'assassin', count: 3 },
        { templateId: 'knight', count: 1 },
        { templateId: 'dark_mage', count: 1 },
      ],
    ],
  },

  // ── F20: Subjugation — the half black dragon Halgiraf ─────────────────────
  // Canon F20 boss. His guard falls first; then the dragon (light-vulnerable,
  // enrages late). Defeat(halgiraf) is the win condition.
  20: {
    floor: 20,
    missionType: 'Subjugation',
    objectives: [{ kind: 'defeat', targetTag: 'halgiraf' }],
    timer: null,
    // The raid boss's first-clear drop: the Book of Reverse Heaven (6★→7★, §3.4).
    firstClearDrops: { bookOfReverseHeaven: 1 },
    // Canon: the tower ballista breaks Halgiraf's scales (Layer 3 §C2 minigame).
    minigame: 'ballista',
    waves: [
      [
        { templateId: 'soldier', count: 2 },
        { templateId: 'skeleton', count: 1 },
      ],
      [
        { templateId: 'halgiraf', count: 1, levelBonus: 8, targetTag: 'halgiraf' },
        { templateId: 'dark_mage', count: 1 },
      ],
    ],
  },

  // ══ Act III — The Swamp ═══════════════════════════════════════════════════
  // Canon Taoni F25: "[Escape] protect Priasis and escape"; Townia: soldiers, lizardmen + chief.
  25: {
    floor: 25,
    missionType: 'Escape',
    objectives: [
      { kind: 'reach', distance: TUNING.tower.f25EscapeDistance },
      { kind: 'protect', targetTag: 'priasis' },
    ],
    timer: null,
    allies: [{ templateId: 'priasis', line: 'back', targetTag: 'priasis', levelBonus: 8 }],
    waves: [
      [
        { templateId: 'lizardman', count: 3 },
        { templateId: 'lizard_rider', count: 2 },
      ],
      [
        { templateId: 'lizard_chief', count: 1, levelBonus: 6 },
        { templateId: 'lizard_shaman', count: 2 },
      ],
    ],
  },
  // Canon F30: "[Explore] destroy the ancient stone statue via the Void Key"; Townia boss
  // Truth Seeker Kurushahr + XYZ Mage Golems. The statue is phased until its cores fall.
  30: {
    floor: 30,
    missionType: 'Explore',
    objectives: [{ kind: 'defeat', targetTag: 'stone_statue' }],
    timer: null,
    waves: [
      [
        { templateId: 'mage_golem', count: 3 },
        { templateId: 'kurushahr', count: 1, levelBonus: 6, targetTag: 'kurushahr' },
      ],
      [
        { templateId: 'stone_statue', count: 1, levelBonus: 10, targetTag: 'stone_statue' },
        { templateId: 'crystal_core', count: 2, levelBonus: 2 },
      ],
    ],
  },

  // ══ Act IV — The Drowned Coast ════════════════════════════════════════════
  // Canon F35: "[Capture] steal the blue jewel guarded by god-dragon Ctaat". Taking the
  // jewel wins at once, so the hidden Hunt of the Water God means felling Kthat FIRST.
  35: {
    floor: 35,
    missionType: 'Capture',
    objectives: [{ kind: 'acquire', targetTag: 'blue_jewel' }],
    timer: null,
    minigame: 'ballista',
    waves: [
      [
        { templateId: 'merman', count: 3 },
        { templateId: 'shark', count: 2 },
      ],
      [
        { templateId: 'jewel_guardian', count: 1, levelBonus: 6, targetTag: 'blue_jewel' },
        { templateId: 'kthat', count: 1, levelBonus: 12, targetTag: 'kthat' },
        { templateId: 'kraken', count: 1, levelBonus: 4 },
      ],
    ],
  },

  // ══ Act V — The Order's War ═══════════════════════════════════════════════
  // Canon F40: Valention of Iron Blood with Rodvick (strength) and Lazenca (speed). The
  // gate of the F36–40 loop: failing here drops the room back to F31.
  40: {
    floor: 40,
    missionType: 'Conquest',
    objectives: [{ kind: 'defeat', targetTag: 'valention' }],
    timer: null,
    waves: [
      [
        { templateId: 'rodvick', count: 1, levelBonus: 4 },
        { templateId: 'lazenca', count: 1, levelBonus: 4 },
        { templateId: 'order_soldier', count: 3 },
      ],
      [
        { templateId: 'valention', count: 1, levelBonus: 10, targetTag: 'valention' },
        { templateId: 'dark_knight', count: 2 },
      ],
    ],
  },
  // Canon F41: [Chase] hunt the scattered soldiers; Versace of Silver Lightning.
  41: {
    floor: 41,
    missionType: 'Chase',
    objectives: [{ kind: 'defeat', targetTag: 'versace' }],
    timer: TUNING.tower.f41ChaseTicks,
    waves: [
      [
        { templateId: 'order_soldier', count: 3 },
        { templateId: 'versace', count: 1, levelBonus: 8, targetTag: 'versace' },
      ],
    ],
  },
  // Canon F42: Darkan of Destruction, 3rd guard division commander.
  42: {
    floor: 42,
    missionType: 'Subjugation',
    objectives: [{ kind: 'defeat', targetTag: 'darkan' }],
    timer: null,
    waves: [
      [
        { templateId: 'dark_knight', count: 2 },
        { templateId: 'demon_marksman', count: 2 },
      ],
      [{ templateId: 'darkan', count: 1, levelBonus: 10, targetTag: 'darkan' }],
    ],
  },
  // Canon Taoni F45: "[Delivery] deliver the 'key' to a special NPC".
  45: {
    floor: 45,
    missionType: 'Delivery',
    objectives: [
      { kind: 'reach', distance: TUNING.tower.f45DeliveryDistance },
      { kind: 'protect', targetTag: 'key_bearer' },
    ],
    timer: null,
    allies: [{ templateId: 'key_bearer', line: 'mid', targetTag: 'key_bearer', levelBonus: 6 }],
    waves: [
      [
        { templateId: 'demon_marksman', count: 3 },
        { templateId: 'order_soldier', count: 2 },
      ],
      [
        { templateId: 'dark_knight', count: 2 },
        { templateId: 'order_mage', count: 2 },
      ],
    ],
  },
  // Canon Taoni F50: "[Complex] protect the object and destroy the 'Egg'".
  50: {
    floor: 50,
    missionType: 'Complex',
    objectives: [
      { kind: 'protect', targetTag: 'sealed_object' },
      { kind: 'defeat', targetTag: 'the_egg' },
    ],
    timer: null,
    allies: [{ templateId: 'sealed_object', line: 'back', targetTag: 'sealed_object', levelBonus: 10 }],
    waves: [
      [
        { templateId: 'egg_brood', count: 4 },
        { templateId: 'the_egg', count: 1, levelBonus: 12, targetTag: 'the_egg' },
      ],
    ],
  },
  55: {
    floor: 55,
    missionType: 'Defense',
    objectives: [{ kind: 'defend', waves: 3 }],
    timer: null,
    waves: [
      [
        { templateId: 'order_soldier', count: 4 },
        { templateId: 'order_mage', count: 1 },
      ],
      [
        { templateId: 'dark_knight', count: 2 },
        { templateId: 'demon_marksman', count: 2 },
      ],
      [
        { templateId: 'order_inquisitor', count: 1, levelBonus: 10 },
        { templateId: 'order_mage', count: 2 },
      ],
    ],
  },
  // Canon: the Book of Reverse Heaven is "dropped after defeating El Cid" — a raid boss.
  60: {
    floor: 60,
    missionType: 'Raid',
    objectives: [{ kind: 'defeat', targetTag: 'el_cid' }],
    timer: null,
    firstClearDrops: { bookOfReverseHeaven: 1 },
    waves: [
      [
        { templateId: 'dark_knight', count: 3 },
        { templateId: 'order_mage', count: 2 },
      ],
      [{ templateId: 'el_cid', count: 1, levelBonus: 16, targetTag: 'el_cid' }],
    ],
  },
  65: {
    floor: 65,
    missionType: 'Survival',
    objectives: [{ kind: 'survive', ticks: TUNING.tower.f65SurviveTicks }],
    timer: TUNING.tower.f65SurviveTicks,
    waves: [
      [
        { templateId: 'order_soldier', count: 4 },
        { templateId: 'demon_marksman', count: 2 },
      ],
      [
        { templateId: 'order_saint', count: 1, levelBonus: 12 },
        { templateId: 'dark_knight', count: 2 },
      ],
    ],
  },

  // ══ Act VI — The Inflection ═══════════════════════════════════════════════
  70: {
    floor: 70,
    missionType: 'Subjugation',
    objectives: [{ kind: 'defeat', targetTag: 'chimera_matriarch' }],
    timer: null,
    waves: [
      [
        { templateId: 'chimera', count: 3 },
        { templateId: 'wraith', count: 2 },
      ],
      [{ templateId: 'chimera_matriarch', count: 1, levelBonus: 16, targetTag: 'chimera_matriarch' }],
    ],
  },
  75: {
    floor: 75,
    missionType: 'Domination',
    objectives: [{ kind: 'defend', waves: 4 }],
    timer: null,
    waves: [
      [{ templateId: 'chimera', count: 3 }],
      [{ templateId: 'wraith', count: 3 }],
      [
        { templateId: 'dark_knight', count: 2 },
        { templateId: 'demon_marksman', count: 2 },
      ],
      [
        { templateId: 'chimera', count: 2 },
        { templateId: 'wraith', count: 2 },
      ],
    ],
  },

  // ══ Act VII — The Wailing Wall ════════════════════════════════════════════
  // Canon F80: the Fragment Series for ALL accounts; Taonier's boss Pryos Al Ragna.
  80: {
    floor: 80,
    missionType: 'Conquest',
    objectives: [{ kind: 'defeat', targetTag: 'pryos' }],
    timer: null,
    waves: [
      [
        { templateId: 'fragment_shard', count: 3 },
        { templateId: 'fragment_knight', count: 2 },
      ],
      [
        { templateId: 'fragment_warden', count: 2 },
        { templateId: 'fragment_knight', count: 2 },
      ],
      [{ templateId: 'pryos', count: 1, levelBonus: 40, targetTag: 'pryos' }],
    ],
  },
  85: {
    floor: 85,
    missionType: 'Conquest',
    objectives: [{ kind: 'defeat', targetTag: 'fragment_colossus' }],
    timer: null,
    minigame: 'ballista',
    waves: [
      [
        { templateId: 'fragment_warden', count: 2 },
        { templateId: 'fragment_shard', count: 3 },
      ],
      [{ templateId: 'fragment_colossus', count: 1, levelBonus: 60, targetTag: 'fragment_colossus' }],
    ],
  },

  // ══ Act VIII — The Unfinished Floors ══════════════════════════════════════
  // Canon: clearing F90 unconditionally destroys the world.
  90: {
    floor: 90,
    missionType: 'Conquest',
    objectives: [{ kind: 'defeat', targetTag: 'herald_of_end' }],
    timer: null,
    waves: [
      [
        { templateId: 'abyss_knight', count: 2 },
        { templateId: 'void_spawn', count: 3 },
      ],
      [{ templateId: 'herald_of_end', count: 1, levelBonus: 80, targetTag: 'herald_of_end' }],
    ],
  },
  95: {
    floor: 95,
    missionType: 'Survival',
    objectives: [{ kind: 'survive', ticks: TUNING.tower.f95SurviveTicks }],
    timer: TUNING.tower.f95SurviveTicks,
    waves: [
      [
        { templateId: 'void_spawn', count: 4 },
        { templateId: 'abyss_knight', count: 2 },
      ],
      [
        { templateId: 'fragment_colossus', count: 1, levelBonus: 30 },
        { templateId: 'void_spawn', count: 3 },
      ],
    ],
  },
  // F100: the summit.
  100: {
    floor: 100,
    missionType: 'Conquest',
    objectives: [{ kind: 'defeat', targetTag: 'tell' }],
    timer: null,
    waves: [
      [
        { templateId: 'abyss_knight', count: 3 },
        { templateId: 'fragment_warden', count: 2 },
      ],
      [{ templateId: 'tell', count: 1, levelBonus: 120, targetTag: 'tell' }],
    ],
  },
}
