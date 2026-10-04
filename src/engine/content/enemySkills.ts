/**
 * Enemy kits (lane F started them, lane G gave every elite and boss its own): the skills
 * monsters and the Order's officers fight with beside their Strike or Spell. They use the
 * heroes' model (blows, effects, targets — engine/types SkillDef) and are chosen by the same
 * brain; `enemy: true` and `bound` keep them out of every hero's hands.
 *
 * Lane G adds two things a hero's skill never has:
 *  - `cooldown`: the caster's own turns before it can cast it again (a boss has deep SP,
 *    so its rhythm is set here, not by its pool);
 *  - `charge`: a big move wound up a turn ahead — the replay shows a '!', a countdown and
 *    whom it threatens, and the Master can answer it (Guard, Protect, a stun, a kill, a
 *    retreat). `line` is what the replay says as it winds up ({name}: the caster;
 *    {target}: the first one it threatens).
 *
 * Names are canon where the novel names them (Dragon Breath, Iron Blood); the rest are in
 * its voice. French: src/ui/i18n/slices/frEnemyKits.ts.
 */
import type { SkillDef, SkillRegistry } from '../types'

type Kit = Omit<SkillDef, 'id' | 'name' | 'grade' | 'element' | 'spCost' | 'perLevel' | 'trainable' | 'learnable'> &
  Partial<Pick<SkillDef, 'grade' | 'element' | 'spCost'>>

/** An enemy skill: bound, unlearnable, untrainable, level-less. */
function e(id: string, name: string, k: Kit): SkillDef {
  return {
    id,
    name,
    grade: k.grade ?? 'C',
    element: k.element ?? null,
    spCost: k.spCost ?? 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    bound: true,
    enemy: true,
    ...k,
  }
}

const defs: SkillDef[] = [
  // ── Lane F's light touch (kept; lane G gave them a rhythm) ───────────────────
  e('e_saints_grace', "Saint's Grace", { damageType: 'magic', element: 'light', target: 'ally-lowest', spCost: 30, baseMult: 0, cooldown: 2, effects: [{ kind: 'heal', from: 'mAtk', pct: 40 }] }),
  e('e_venom_spit', 'Venom Spit', { grade: 'D', damageType: 'magic', element: 'earth', target: 'single', spCost: 20, baseMult: 0.6, effects: [{ kind: 'dot', dot: 'poison', from: 'atk', pct: 15, turns: 3 }] }),
  e('e_shield_wall', 'Shield Wall', {
    grade: 'D',
    damageType: 'physical',
    target: 'self',
    spCost: 25,
    baseMult: 0,
    cooldown: 3,
    effects: [
      { kind: 'taunt', turns: 2 },
      { kind: 'buff', stat: 'guard', pct: 25, turns: 2 },
    ],
  }),
  e('e_curse', 'Curse', { damageType: 'magic', element: 'dark', target: 'single', spCost: 25, baseMult: 0.5, cooldown: 2, effects: [{ kind: 'debuff', stat: 'atk', pct: 25, turns: 3 }] }),
  // Halgiraf's breath: wound up, a fire sweep that sets the party burning.
  e('e_dragon_breath', 'Dragon Breath', {
    grade: 'B',
    damageType: 'magic',
    element: 'fire',
    target: 'all-enemies',
    spCost: 40,
    baseMult: 1.7,
    cooldown: 4,
    charge: { turns: 1, line: '{name} draws a deep breath…' },
    effects: [{ kind: 'dot', dot: 'burn', from: 'atk', pct: 8, turns: 2, chance: 50 }],
  }),
  e('e_iron_blood', 'Iron Blood', {
    grade: 'B',
    damageType: 'physical',
    target: 'self',
    spCost: 35,
    baseMult: 0,
    cooldown: 4,
    effects: [
      { kind: 'shield', from: 'maxHP', pct: 15, turns: 3 },
      { kind: 'buff', stat: 'atk', pct: 20, turns: 3 },
    ],
  }),
  e('e_soul_siphon', 'Soul Siphon', { damageType: 'magic', element: 'dark', target: 'single', spCost: 15, baseMult: 0.7, effects: [{ kind: 'sp', amount: -25 }] }),

  // ── Act I · the Prairie ───────────────────────────────────────────────────────
  e('e_rend', 'Rend', { grade: 'E', damageType: 'physical', target: 'single', spCost: 10, baseMult: 0.9, cooldown: 2, effects: [{ kind: 'dot', dot: 'bleed', from: 'atk', pct: 10, turns: 2, chance: 40 }] }),
  e('e_shriek', 'Shriek', { grade: 'E', damageType: 'magic', element: 'wind', target: 'all-enemies', spCost: 15, baseMult: 0.35, cooldown: 3, effects: [{ kind: 'debuff', stat: 'spd', pct: 15, turns: 2, chance: 40 }] }),

  // ── Act II · the Ruins ────────────────────────────────────────────────────────
  e('e_shield_bash', 'Shield Bash', { grade: 'D', damageType: 'physical', target: 'single', spCost: 15, baseMult: 0.8, cooldown: 3, effects: [{ kind: 'stun', push: 40, chance: 25 }] }),
  e('e_ground_slam', 'Ground Slam', { grade: 'D', damageType: 'physical', target: 'front-row', spCost: 20, baseMult: 0.9, cooldown: 3, effects: [{ kind: 'stun', push: 30, chance: 25 }] }),
  e('e_shadow_bolt', 'Shadow Bolt', { grade: 'D', damageType: 'magic', element: 'dark', target: 'single', spCost: 15, baseMult: 1.35, cooldown: 2 }),
  e('e_dark_prayer', 'Dark Prayer', { damageType: 'magic', element: 'dark', target: 'ally-lowest', spCost: 25, baseMult: 0, cooldown: 3, effects: [{ kind: 'heal', from: 'mAtk', pct: 35 }] }),
  e('e_black_rite', 'Black Rite', {
    grade: 'B',
    damageType: 'magic',
    element: 'dark',
    target: 'all-enemies',
    spCost: 30,
    baseMult: 1.5,
    cooldown: 4,
    charge: { turns: 1, line: '{name} begins a black rite…' },
  }),
  e('e_tail_sweep', 'Tail Sweep', { damageType: 'physical', target: 'front-row', spCost: 20, baseMult: 0.9, cooldown: 3, effects: [{ kind: 'stun', push: 35, chance: 30 }] }),
  // Halgiraf in the air: he folds his wings and falls on one hero.
  e('e_sky_dive', 'Sky Dive', {
    grade: 'B',
    damageType: 'physical',
    target: 'single',
    spCost: 30,
    baseMult: 2.4,
    cooldown: 4,
    charge: { turns: 1, line: '{name} folds his wings for a dive at {target}!' },
  }),

  // ── Act III · the Swamp ───────────────────────────────────────────────────────
  e('e_swamp_mending', 'Swamp Mending', { grade: 'D', damageType: 'magic', element: 'water', target: 'ally-lowest', spCost: 20, baseMult: 0, cooldown: 3, effects: [{ kind: 'heal', from: 'mAtk', pct: 35 }] }),
  e('e_trample', 'Trample', { grade: 'D', damageType: 'physical', target: 'cleave', spCost: 15, baseMult: 1.1, cooldown: 2 }),
  e('e_mud_bind', 'Mud Bind', { grade: 'D', damageType: 'physical', target: 'single', spCost: 15, baseMult: 0.7, cooldown: 3, effects: [{ kind: 'debuff', stat: 'spd', pct: 25, turns: 2, chance: 60 }] }),
  e('e_war_bellow', 'War Bellow', { damageType: 'physical', target: 'all-allies', spCost: 25, baseMult: 0, cooldown: 4, effects: [{ kind: 'buff', stat: 'atk', pct: 20, turns: 2 }] }),
  e('e_chief_cleave', "Chief's Cleave", { damageType: 'physical', target: 'cleave', spCost: 20, baseMult: 1.4, cooldown: 2 }),
  e('e_crushing_leap', 'Crushing Leap', {
    grade: 'B',
    damageType: 'physical',
    target: 'single',
    spCost: 30,
    baseMult: 2.2,
    cooldown: 4,
    charge: { turns: 1, line: '{name} crouches to leap at {target}!' },
  }),
  e('e_xyz_barrage', 'XYZ Barrage', { damageType: 'magic', element: 'earth', target: 'single', spCost: 20, baseMult: 0.45, hits: 3, cooldown: 2 }),
  e('e_truth_lance', 'Truth Lance', { damageType: 'magic', element: 'dark', target: 'single', spCost: 20, baseMult: 1.5, cooldown: 2 }),
  e('e_mind_rend', 'Mind Rend', {
    damageType: 'magic',
    element: 'dark',
    target: 'single',
    spCost: 25,
    baseMult: 0.6,
    cooldown: 3,
    effects: [
      { kind: 'sp', amount: -20 },
      { kind: 'debuff', stat: 'atk', pct: 15, turns: 2, chance: 60 },
    ],
  }),
  e('e_arcane_storm', 'Arcane Storm', {
    grade: 'B',
    damageType: 'magic',
    element: 'dark',
    target: 'all-enemies',
    spCost: 35,
    baseMult: 1.4,
    cooldown: 4,
    charge: { turns: 1, line: '{name} gathers a storm of truths…' },
  }),
  e('e_titan_fist', 'Titan Fist', {
    grade: 'B',
    damageType: 'physical',
    element: 'earth',
    target: 'single',
    spCost: 30,
    baseMult: 2.6,
    cooldown: 3,
    charge: { turns: 1, line: '{name} raises a fist the size of a house over {target}…' },
  }),
  e('e_core_ward', 'Core Ward', { damageType: 'magic', element: 'light', target: 'all-allies', spCost: 30, baseMult: 0, cooldown: 4, effects: [{ kind: 'shield', from: 'maxHP', pct: 10, turns: 2 }] }),

  // ── Act IV · the Drowned Coast ────────────────────────────────────────────────
  e('e_frenzied_bite', 'Frenzied Bite', { grade: 'D', damageType: 'physical', target: 'single', spCost: 15, baseMult: 1.0, cooldown: 2, effects: [{ kind: 'dot', dot: 'bleed', from: 'atk', pct: 10, turns: 2, chance: 40 }] }),
  e('e_trident_thrust', 'Trident Thrust', { grade: 'D', damageType: 'physical', target: 'cleave', spCost: 15, baseMult: 1.0, cooldown: 2 }),
  e('e_ink_spray', 'Ink Spray', { grade: 'D', damageType: 'magic', element: 'water', target: 'all-enemies', spCost: 20, baseMult: 0.3, cooldown: 3, effects: [{ kind: 'debuff', stat: 'crit', pct: 15, turns: 2, chance: 50 }] }),
  e('e_guardian_shell', 'Guardian Shell', {
    grade: 'D',
    damageType: 'physical',
    target: 'self',
    spCost: 25,
    baseMult: 0,
    cooldown: 4,
    effects: [
      { kind: 'shield', from: 'maxHP', pct: 15, turns: 2 },
      { kind: 'taunt', turns: 2 },
    ],
  }),
  e('e_constrict', 'Constrict', { damageType: 'physical', target: 'single', spCost: 20, baseMult: 1.1, cooldown: 3, effects: [{ kind: 'stun', push: 50, chance: 40 }] }),
  e('e_tidal_wave', 'Tidal Wave', {
    grade: 'B',
    damageType: 'magic',
    element: 'water',
    target: 'all-enemies',
    spCost: 35,
    baseMult: 1.6,
    cooldown: 4,
    charge: { turns: 1, line: '{name} rears back, and the sea rises with it…' },
    effects: [{ kind: 'debuff', stat: 'spd', pct: 20, turns: 2, chance: 50 }],
  }),
  e('e_dragon_bite', 'Dragon Bite', { damageType: 'physical', target: 'single', spCost: 20, baseMult: 1.3, cooldown: 2, effects: [{ kind: 'dot', dot: 'bleed', from: 'atk', pct: 10, turns: 2, chance: 50 }] }),
  e('e_water_veil', 'Water Veil', {
    damageType: 'magic',
    element: 'water',
    target: 'self',
    spCost: 25,
    baseMult: 0,
    cooldown: 5,
    effects: [
      { kind: 'shield', from: 'maxHP', pct: 12, turns: 2 },
      { kind: 'buff', stat: 'guard', pct: 15, turns: 2 },
    ],
  }),

  // ── Act V · the Order's War ───────────────────────────────────────────────────
  e('e_dark_cleave', 'Dark Cleave', { damageType: 'physical', element: 'dark', target: 'cleave', spCost: 20, baseMult: 1.2, cooldown: 2, effects: [{ kind: 'debuff', stat: 'def', pct: 15, turns: 2, chance: 50 }] }),
  e('e_aimed_shot', 'Aimed Shot', { damageType: 'physical', target: 'single', spCost: 20, baseMult: 1.5, cooldown: 3 }),
  e('e_judgment_flare', 'Judgment Flare', { damageType: 'magic', element: 'light', target: 'all-enemies', spCost: 25, baseMult: 1.0, cooldown: 3, effects: [{ kind: 'dot', dot: 'burn', from: 'atk', pct: 6, turns: 2, chance: 30 }] }),
  e('e_crushing_blow', 'Crushing Blow', {
    grade: 'B',
    damageType: 'physical',
    target: 'single',
    spCost: 30,
    baseMult: 2.6,
    cooldown: 4,
    charge: { turns: 1, line: '{name} hefts his greatsword over {target}…' },
  }),
  e('e_war_roar', 'War Roar', {
    damageType: 'physical',
    target: 'self',
    spCost: 25,
    baseMult: 0,
    cooldown: 4,
    effects: [
      { kind: 'buff', stat: 'atk', pct: 25, turns: 2 },
      { kind: 'taunt', turns: 1 },
    ],
  }),
  e('e_flicker_strikes', 'Flicker Strikes', { damageType: 'physical', element: 'wind', target: 'single', spCost: 20, baseMult: 0.4, hits: 4, cooldown: 2 }),
  e('e_vanishing_step', 'Vanishing Step', {
    damageType: 'physical',
    element: 'wind',
    target: 'self',
    spCost: 20,
    baseMult: 0,
    cooldown: 4,
    effects: [
      { kind: 'buff', stat: 'spd', pct: 30, turns: 2 },
      { kind: 'buff', stat: 'crit', pct: 20, turns: 2 },
    ],
  }),
  e('e_iron_cleave', 'Iron Cleave', { damageType: 'physical', element: 'fire', target: 'front-row', spCost: 20, baseMult: 1.3, cooldown: 2 }),
  e('e_iron_verdict', 'Iron Verdict', {
    grade: 'A',
    damageType: 'physical',
    element: 'fire',
    target: 'all-enemies',
    spCost: 40,
    baseMult: 1.6,
    cooldown: 5,
    charge: { turns: 1, line: '{name} plants his feet — the iron in his blood begins to sing…' },
  }),
  e('e_lightning_step', 'Lightning Step', { damageType: 'physical', element: 'wind', target: 'single', spCost: 20, baseMult: 0.5, hits: 3, cooldown: 2, effects: [{ kind: 'debuff', stat: 'spd', pct: 20, turns: 2, chance: 40 }] }),
  e('e_thunderclap', 'Thunderclap', { damageType: 'magic', element: 'wind', target: 'all-enemies', spCost: 30, baseMult: 0.9, cooldown: 4, effects: [{ kind: 'stun', push: 35, chance: 25 }] }),
  e('e_armor_crush', 'Armor Crush', { damageType: 'physical', element: 'dark', target: 'single', spCost: 20, baseMult: 1.3, cooldown: 2, effects: [{ kind: 'debuff', stat: 'def', pct: 25, turns: 2 }] }),
  e('e_destruction', 'Destruction', {
    grade: 'A',
    damageType: 'physical',
    element: 'dark',
    target: 'all-enemies',
    spCost: 40,
    baseMult: 1.8,
    cooldown: 4,
    charge: { turns: 1, line: '{name} raises his maul — the floor itself cracks…' },
  }),
  e('e_brood_bite', 'Brood Bite', { grade: 'E', damageType: 'physical', element: 'dark', target: 'single', spCost: 10, baseMult: 1.0, cooldown: 2, effects: [{ kind: 'dot', dot: 'poison', from: 'atk', pct: 10, turns: 2, chance: 40 }] }),
  e('e_hatch', 'Hatch', { damageType: 'magic', element: 'dark', target: 'self', spCost: 0, baseMult: 0, cooldown: 3, effects: [{ kind: 'summon', group: 'brood', count: 2 }] }),
  e('e_purge', 'Purge', { damageType: 'magic', element: 'light', target: 'single', spCost: 20, baseMult: 1.2, cooldown: 2, effects: [{ kind: 'sp', amount: -20 }] }),
  e('e_chains_of_faith', 'Chains of Faith', { damageType: 'magic', element: 'light', target: 'single', spCost: 25, baseMult: 0.6, cooldown: 3, effects: [{ kind: 'stun', push: 60, chance: 50 }] }),
  e('e_ranker_slash', "Ranker's Slash", { grade: 'B', damageType: 'physical', element: 'light', target: 'single', spCost: 20, baseMult: 1.5, cooldown: 2 }),
  e('e_counter_stance', 'Counter Stance', {
    grade: 'B',
    damageType: 'physical',
    target: 'self',
    spCost: 25,
    baseMult: 0,
    cooldown: 4,
    effects: [
      { kind: 'buff', stat: 'guard', pct: 30, turns: 2 },
      { kind: 'taunt', turns: 2 },
    ],
  }),
  e('e_sword_rain', 'Sword Rain', {
    grade: 'A',
    damageType: 'physical',
    element: 'light',
    target: 'all-enemies',
    spCost: 40,
    baseMult: 1.7,
    cooldown: 4,
    charge: { turns: 1, line: '{name} raises his blade to the sky…' },
  }),
  e('e_sanctuary', 'Sanctuary', { grade: 'B', damageType: 'magic', element: 'light', target: 'all-allies', spCost: 35, baseMult: 0, cooldown: 4, effects: [{ kind: 'shield', from: 'maxHP', pct: 10, turns: 2 }] }),
  e('e_holy_light', 'Holy Light', { damageType: 'magic', element: 'light', target: 'single', spCost: 20, baseMult: 1.2, cooldown: 2 }),

  // ── Act VI · the Inflection ───────────────────────────────────────────────────
  e('e_chimera_fire', 'Chimera Fire', { damageType: 'magic', element: 'fire', target: 'all-enemies', spCost: 25, baseMult: 0.7, cooldown: 3, effects: [{ kind: 'dot', dot: 'burn', from: 'atk', pct: 6, turns: 2, chance: 30 }] }),
  e('e_wail', 'Wail', { grade: 'D', damageType: 'magic', element: 'dark', target: 'all-enemies', spCost: 20, baseMult: 0.3, cooldown: 4, effects: [{ kind: 'debuff', stat: 'spd', pct: 15, turns: 2, chance: 40 }] }),
  e('e_three_heads', 'Three Heads', { grade: 'B', damageType: 'physical', element: 'fire', target: 'single', spCost: 20, baseMult: 0.6, hits: 3, cooldown: 2 }),
  e('e_inferno', 'Inferno', {
    grade: 'A',
    damageType: 'magic',
    element: 'fire',
    target: 'all-enemies',
    spCost: 40,
    baseMult: 1.7,
    cooldown: 4,
    charge: { turns: 1, line: "All three of {name}'s heads draw breath at once…" },
    effects: [{ kind: 'dot', dot: 'burn', from: 'atk', pct: 8, turns: 2, chance: 60 }],
  }),
  e('e_brood_roar', 'Brood Roar', { damageType: 'physical', target: 'all-allies', spCost: 25, baseMult: 0, cooldown: 5, effects: [{ kind: 'buff', stat: 'atk', pct: 20, turns: 2 }] }),

  // ── Act VII · the Wailing Wall ────────────────────────────────────────────────
  e('e_shard_burst', 'Shard Burst', { grade: 'D', damageType: 'physical', element: 'dark', target: 'all-enemies', spCost: 20, baseMult: 0.4, cooldown: 3 }),
  e('e_null_wave', 'Null Wave', { damageType: 'magic', element: 'dark', target: 'all-enemies', spCost: 25, baseMult: 0.9, cooldown: 3, effects: [{ kind: 'sp', amount: -10 }] }),
  e('e_ragna_blade', 'Ragna Blade', { grade: 'A', damageType: 'physical', element: 'dark', target: 'single', spCost: 25, baseMult: 1.6, cooldown: 2, effects: [{ kind: 'debuff', stat: 'def', pct: 20, turns: 2 }] }),
  e('e_dark_dominion', 'Dark Dominion', {
    grade: 'S',
    damageType: 'magic',
    element: 'dark',
    target: 'all-enemies',
    spCost: 40,
    baseMult: 1.8,
    cooldown: 4,
    charge: { turns: 1, line: '{name} opens his hand, and the dark folds inward…' },
  }),
  e('e_commanders_will', "Commander's Will", { damageType: 'physical', target: 'all-allies', spCost: 30, baseMult: 0, cooldown: 5, effects: [{ kind: 'buff', stat: 'atk', pct: 20, turns: 2 }] }),
  e('e_colossal_slam', 'Colossal Slam', {
    grade: 'A',
    damageType: 'physical',
    element: 'dark',
    target: 'front-row',
    spCost: 35,
    baseMult: 2.2,
    cooldown: 4,
    charge: { turns: 1, line: '{name} lifts both arms high…' },
    effects: [{ kind: 'stun', push: 50 }],
  }),
  e('e_fragment_storm', 'Fragment Storm', { damageType: 'magic', element: 'dark', target: 'all-enemies', spCost: 30, baseMult: 0.8, cooldown: 3 }),

  // ── Act VIII · the Unfinished Floors ──────────────────────────────────────────
  e('e_void_touch', 'Void Touch', { grade: 'D', damageType: 'magic', element: 'dark', target: 'single', spCost: 15, baseMult: 0.9, cooldown: 2, effects: [{ kind: 'sp', amount: -15 }] }),
  e('e_doom_mark', 'Mark of Doom', { grade: 'B', damageType: 'magic', element: 'dark', target: 'single', spCost: 25, baseMult: 0.6, cooldown: 3, effects: [{ kind: 'debuff', stat: 'guard', pct: 25, turns: 3 }] }),
  e('e_call_the_void', 'Call the Void', { grade: 'A', damageType: 'magic', element: 'dark', target: 'self', spCost: 0, baseMult: 0, cooldown: 4, effects: [{ kind: 'summon', group: 'void', count: 2 }] }),
  e('e_end_of_days', 'End of Days', {
    grade: 'S',
    damageType: 'magic',
    element: 'dark',
    target: 'all-enemies',
    spCost: 50,
    baseMult: 2.0,
    cooldown: 5,
    charge: { turns: 1, line: '{name} speaks the last word of the world…' },
  }),
  e('e_architects_decree', "Architect's Decree", { grade: 'A', damageType: 'magic', element: 'light', target: 'single', spCost: 25, baseMult: 1.8, cooldown: 2 }),
  e('e_rewrite', 'Rewrite', { grade: 'A', damageType: 'magic', element: 'light', target: 'all-enemies', spCost: 30, baseMult: 0.5, cooldown: 4, effects: [{ kind: 'debuff', stat: 'atk', pct: 20, turns: 2, chance: 70 }] }),
  e('e_final_draft', 'Final Draft', {
    grade: 'U',
    damageType: 'magic',
    element: 'light',
    target: 'all-enemies',
    spCost: 50,
    baseMult: 2.2,
    cooldown: 5,
    charge: { turns: 1, line: '{name} raises the pen that wrote the tower…' },
  }),

  // ── Lane P · the filler floors' marked leaders (and the first floor that teaches Guard) ──
  e('e_haymaker', 'Haymaker', {
    grade: 'D',
    damageType: 'physical',
    target: 'single',
    spCost: 15,
    baseMult: 1.6,
    cooldown: 4,
    charge: { turns: 1, line: '{name} winds up a huge swing at {target}…' },
  }),
]

export const ENEMY_SKILLS: SkillRegistry = Object.fromEntries(defs.map((d) => [d.id, d]))
