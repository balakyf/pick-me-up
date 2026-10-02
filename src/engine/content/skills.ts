/**
 * Skill registry + merge recipes (Layer 1 §2). The combat sim synthesizes an
 * implicit basic attack for every unit, so a hero's skills are PURELY additive and
 * a cameo may legitimately have none ([]).
 *
 * Each entry is a static SkillDef: a grade (sets the level cap + CP weight) and a
 * level-1 `baseMult` that grows by `perLevel` as the hero casts it (auto-learn).
 * `baseMult` of the original five equals their pre-leveling `skillMult`, so a Lv1
 * cast hits exactly as before.
 *
 * `learnable: false` marks merge-only results (and their canon inputs) that a
 * promotion must not hand out — promotion keeps drawing from the original pool.
 * `trainable: true` marks the canon "trained" skills the Training Center can teach.
 *
 * Element `null` means "inherit the unit's element". Numbers are first-pass tuning
 * shapes; no logic lives here.
 *
 * ROLES (lane F): a skill may carry `effects` (heal, regeneration, shield, buff, debuff,
 * DoT, stun, taunt, SP) and `hits` (a multi-hit), and a support skill (baseMult 0) tends
 * its own side ('self', 'ally-lowest', 'ally-threatened', 'all-allies'). Skill ids never
 * change (saves hold them); only behaviour does. Five classes, five ways to fight:
 * warriors and spearmen hold the front (Basic Shield's taunt, War Cry, a spear that breaks
 * armour), thieves cut fast and open bleeds (Shadow Flurry, Stealthy Movements), archers
 * mark the boss and slow the crowd (Hunter's Mark, Thunder Volley), mages burn, bind, ward
 * and mend (Arcane Burst, Spellbind, Barrier, Mending Light), and anyone can learn to bind a
 * wound (First Aid, Regeneration, Indomitability at the Training Center).
 * `e_*` entries are enemy kits (`enemy: true`): never a hero's.
 */

import type { AchievementDef, EvolutionRecipe, HeroClass, MergeRecipe, SkillRegistry, SkillUnlock } from '../types'

export const SKILLS: SkillRegistry = {
  // ── Original innate pool (promotion-grantable) ────────────────────────────
  // Warrior single-target power strike (canon "Power Strike").
  power_strike: {
    id: 'power_strike',
    name: 'Power Strike',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 30,
    baseMult: 1.6,
    perLevel: 0.08,
    trainable: false,
    learnable: true,
  },
  // Spearman: a thrust that runs through to the foe behind (a cleave) and cracks the armour
  // of both (−defence) — the breaker the party's blades follow (Muden's "Spear" flavor).
  piercing_thrust: {
    id: 'piercing_thrust',
    name: 'Piercing Thrust',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'cleave',
    spCost: 35,
    baseMult: 1.45,
    perLevel: 0.07,
    trainable: false,
    learnable: true,
    effects: [{ kind: 'debuff', stat: 'def', pct: 20, perLevel: 3, turns: 3 }],
  },
  // Thief: three quick cuts, 0.45 each — each its own roll — and the flurry may open a bleed.
  shadow_flurry: {
    id: 'shadow_flurry',
    name: 'Shadow Flurry',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 25,
    baseMult: 0.45,
    perLevel: 0.02,
    trainable: false,
    learnable: true,
    hits: 3,
    effects: [{ kind: 'dot', dot: 'bleed', from: 'atk', pct: 12, perLevel: 2, turns: 3, chance: 40 }],
  },
  // Archer lightning volley vs all enemies (Nihaku "Thunderbringer"); the shock may slow.
  thunder_volley: {
    id: 'thunder_volley',
    name: 'Thunder Volley',
    grade: 'B',
    damageType: 'physical',
    element: 'wind',
    target: 'all-enemies',
    spCost: 45,
    baseMult: 0.9,
    perLevel: 0.05,
    trainable: false,
    learnable: true,
    effects: [{ kind: 'debuff', stat: 'spd', pct: 15, perLevel: 2, turns: 2, chance: 35 }],
  },
  // Mage elemental nuke vs all enemies; the element lingers (burn, poison or bleed).
  arcane_burst: {
    id: 'arcane_burst',
    name: 'Arcane Burst',
    grade: 'B',
    damageType: 'magic',
    element: null,
    target: 'all-enemies',
    spCost: 50,
    baseMult: 1.4,
    perLevel: 0.07,
    trainable: false,
    learnable: true,
    effects: [{ kind: 'dot', dot: 'element', from: 'atk', pct: 8, perLevel: 1, turns: 2, chance: 35 }],
  },

  // ── Canon trained skills (merge inputs; Islat Han's kit) ──────────────────
  // Two clean cuts, a drilled rhythm (0.6 each).
  basic_swordsmanship: {
    id: 'basic_swordsmanship',
    name: 'Basic Swordsmanship',
    grade: 'E',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 10,
    baseMult: 0.6,
    perLevel: 0.03,
    trainable: true,
    learnable: false,
    hits: 2,
  },
  // The front line's answer: raise the shield and roar — foes must strike the bearer, who
  // takes less while the shield is up (taunt + guard).
  basic_shield: {
    id: 'basic_shield',
    name: 'Basic Shield',
    grade: 'E',
    damageType: 'physical',
    element: null,
    target: 'self',
    spCost: 15,
    baseMult: 0,
    perLevel: 0,
    trainable: true,
    learnable: false,
    effects: [
      { kind: 'taunt', turns: 2 },
      { kind: 'buff', stat: 'guard', pct: 25, perLevel: 4, turns: 2 },
    ],
  },
  // Berserk: +power, loses rationality (canon Lv1-6, +10 stat bonus flavor). A reckless blow,
  // then the frenzy: attack up, defence down, and the caster bleeds (an HP drain).
  berserk: {
    id: 'berserk',
    name: 'Berserk',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 20,
    baseMult: 1.1,
    perLevel: 0.05,
    trainable: true,
    learnable: false,
    effects: [
      { kind: 'buff', stat: 'atk', pct: 30, perLevel: 5, turns: 3, to: 'self' },
      { kind: 'debuff', stat: 'def', pct: 15, turns: 3, to: 'self' },
      { kind: 'dot', dot: 'bleed', from: 'maxHP', pct: 4, turns: 3, to: 'self' },
    ],
  },
  // Composure: a measured, precise strike (canon: learned by synthesizing Tobi) that steadies
  // the hand — crit chance up for a while.
  composure: {
    id: 'composure',
    name: 'Composure',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 15,
    baseMult: 1.0,
    perLevel: 0.05,
    trainable: true,
    learnable: false,
    effects: [{ kind: 'buff', stat: 'crit', pct: 20, perLevel: 4, turns: 3, to: 'self' }],
  },
  // Calmness: a cut taken from a calm guard — the bearer takes less for a while.
  calmness: {
    id: 'calmness',
    name: 'Calmness',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 15,
    baseMult: 1.0,
    perLevel: 0.05,
    trainable: true,
    learnable: false,
    effects: [{ kind: 'buff', stat: 'guard', pct: 15, perLevel: 3, turns: 2, to: 'self' }],
  },
  sword_soul: {
    id: 'sword_soul',
    name: 'Sword Soul',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 25,
    baseMult: 1.45,
    perLevel: 0.07,
    trainable: true,
    learnable: false,
  },
  // Ganggyeok (강격): a crushing heavy blow that may stagger (pushes the foe's turn back).
  ganggyeok: {
    id: 'ganggyeok',
    name: 'Ganggyeok',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 28,
    baseMult: 1.5,
    perLevel: 0.07,
    trainable: true,
    learnable: false,
    effects: [{ kind: 'stun', push: 40, chance: 30, perLevel: 5 }],
  },

  // ── Canon trained passives (never cast; resolved at unit build) ───────────
  // Pain Tolerance (1-5): shrugs off a share of every hit. Max + evolve → Battle Speed.
  pain_tolerance: {
    id: 'pain_tolerance',
    name: 'Pain Tolerance',
    grade: 'E',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: true,
    learnable: false,
    passive: { kind: 'guard', base: 0.04, perLevel: 0.02 },
  },
  // Insight (1-5): reads openings — more critical hits.
  insight: {
    id: 'insight',
    name: 'Insight',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: true,
    learnable: false,
    passive: { kind: 'stat', stat: 'critPct', base: 0.15, perLevel: 0.08 },
  },
  // Flame Resistance (1-3).
  flame_resistance: {
    id: 'flame_resistance',
    name: 'Flame Resistance',
    grade: 'E',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: true,
    learnable: false,
    passive: { kind: 'guard', base: 0.15, perLevel: 0.08, vs: 'fire' },
  },

  // ── Conditional unlocks (canon Lv11 / Lv15 / Lv29 skills) ─────────────────
  // Projectile/Throwing Defense (1-3): canon Lv11 skill, confirmed on floor 10.
  projectile_defense: {
    id: 'projectile_defense',
    name: 'Throwing Defense',
    grade: 'E',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: true,
    learnable: false,
    passive: { kind: 'guard', base: 0.12, perLevel: 0.06, vs: 'ranged' },
  },
  // Siman: canon Lv15 skill, seen on floor 15 — a decisive single cut.
  siman: {
    id: 'siman',
    name: 'Siman',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 32,
    baseMult: 1.75,
    perLevel: 0.09,
    trainable: false,
    learnable: false,
  },
  // Incident: canon Lv29 skill — a sweeping strike across the whole enemy line.
  incident: {
    id: 'incident',
    name: 'Incident',
    grade: 'B',
    damageType: 'physical',
    element: null,
    target: 'all-enemies',
    spCost: 48,
    baseMult: 1.05,
    perLevel: 0.06,
    trainable: false,
    learnable: false,
  },

  // ── Achievement skills (bound: never trained, transferred or copied) ──────
  // Dragon Slayer / Dragon Sal: earned by slaying Halgiraf — bonus vs dragons.
  dragon_slayer: {
    id: 'dragon_slayer',
    name: 'Dragon Slayer',
    grade: 'B',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    bound: true,
    passive: { kind: 'bane', family: 'dragon', base: 0.3, perLevel: 0.1 },
  },
  // Guardian's Oath: earned by bringing Princess Priasis through the F15 escort.
  guardians_oath: {
    id: 'guardians_oath',
    name: "Guardian's Oath",
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    bound: true,
    passive: { kind: 'guard', base: 0.06, perLevel: 0.02 },
  },

  // ── Merge results ─────────────────────────────────────────────────────────
  // Basic Swordsmanship + Basic Shield: the blade strikes from behind the shield (guard up).
  sword_shield_technique: {
    id: 'sword_shield_technique',
    name: 'Sword-Shield Technique',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 25,
    baseMult: 1.55,
    perLevel: 0.07,
    trainable: false,
    learnable: false,
    effects: [{ kind: 'buff', stat: 'guard', pct: 20, perLevel: 3, turns: 2, to: 'self' }],
  },
  // Berserk + Composure → Exceed (canon, Islat Han): the frenzy, mastered — attack and crit up,
  // no blood paid.
  exceed: {
    id: 'exceed',
    name: 'Exceed',
    grade: 'B',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 35,
    baseMult: 1.9,
    perLevel: 0.09,
    trainable: false,
    learnable: false,
    effects: [
      { kind: 'buff', stat: 'atk', pct: 20, perLevel: 3, turns: 2, to: 'self' },
      { kind: 'buff', stat: 'crit', pct: 15, perLevel: 3, turns: 2, to: 'self' },
    ],
  },
  // Berserk + Calmness → Ixid (canon B+, Unique): consumes vitality; can kill at max.
  ixid: {
    id: 'ixid',
    name: 'Ixid',
    grade: 'A',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 20,
    baseMult: 2.6,
    perLevel: 0.15,
    hpCost: 18,
    hpCostPerLevel: 10,
    trainable: false,
    learnable: false,
  },
  // Sword Soul + Ganggyeok → Pathology (canon B, Unique): fixed damage, self-damage.
  pathology: {
    id: 'pathology',
    name: 'Pathology',
    grade: 'A',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 25,
    baseMult: 2.8,
    perLevel: 0.15,
    hpCost: 22,
    hpCostPerLevel: 12,
    trainable: false,
    learnable: false,
  },

  // ── Evolutions (manual, at the Transfer Station) ──────────────────────────
  // Max Pain Tolerance → Battle Speed (canon Lv1).
  battle_speed: {
    id: 'battle_speed',
    name: 'Battle Speed',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 0,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    passive: { kind: 'stat', stat: 'spd', base: 0.08, perLevel: 0.03 },
  },
  // Sword-Shield Technique → Intermediate Sword Technique (canon): two heavy cuts.
  intermediate_sword: {
    id: 'intermediate_sword',
    name: 'Intermediate Sword Technique',
    grade: 'B',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 30,
    baseMult: 0.95,
    perLevel: 0.05,
    trainable: false,
    learnable: false,
    hits: 2,
  },

  // ── Support & tank (lane F: roles) ─────────────────────────────────────────
  // First Aid: bind the worst wound in the party (heal the most hurt ally, % of their max HP).
  first_aid: {
    id: 'first_aid',
    name: 'First Aid',
    grade: 'E',
    damageType: 'physical',
    element: null,
    target: 'ally-lowest',
    spCost: 25,
    baseMult: 0,
    perLevel: 0,
    trainable: true,
    learnable: false,
    effects: [{ kind: 'heal', from: 'maxHP', pct: 18, perLevel: 3 }],
  },
  // Regeneration (canon trained, 1-2): the wounded ally knits back together over three turns.
  regeneration: {
    id: 'regeneration',
    name: 'Regeneration',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'ally-lowest',
    spCost: 26,
    baseMult: 0,
    perLevel: 0,
    trainable: true,
    learnable: false,
    effects: [{ kind: 'regen', from: 'maxHP', pct: 6, perLevel: 1, turns: 3 }],
  },
  // Indomitability (canon trained, "slows bleed/poison"): a will that soaks blows and poisons
  // alike — an absorb shield on the bearer (it takes a DoT's pulse before the HP does).
  indomitability: {
    id: 'indomitability',
    name: 'Indomitability',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'self',
    spCost: 30,
    baseMult: 0,
    perLevel: 0,
    trainable: true,
    learnable: false,
    effects: [{ kind: 'shield', from: 'maxHP', pct: 18, perLevel: 3, turns: 3 }],
  },
  // War Cry (warrior / spearman, Lv18): the whole party hits harder for three turns.
  war_cry: {
    id: 'war_cry',
    name: 'War Cry',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'all-allies',
    spCost: 35,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    effects: [{ kind: 'buff', stat: 'atk', pct: 18, perLevel: 3, turns: 3 }],
  },
  // Hunter's Mark (archer, Lv8): an arrow that marks the toughest foe — everyone hits it harder.
  hunters_mark: {
    id: 'hunters_mark',
    name: "Hunter's Mark",
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'single',
    spCost: 20,
    baseMult: 0.7,
    perLevel: 0.04,
    trainable: false,
    learnable: false,
    effects: [{ kind: 'debuff', stat: 'guard', pct: 20, perLevel: 3, turns: 3 }],
  },
  // Stealthy Movements (canon, thief, Lv10): slip into the shadows — faster, and every
  // opening found.
  stealthy_movements: {
    id: 'stealthy_movements',
    name: 'Stealthy Movements',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'self',
    spCost: 18,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    effects: [
      { kind: 'buff', stat: 'spd', pct: 30, perLevel: 4, turns: 3 },
      { kind: 'buff', stat: 'crit', pct: 20, perLevel: 3, turns: 3 },
    ],
  },
  // Spellbind (mage, Lv8): a binding bolt — the foe loses most of a turn.
  spellbind: {
    id: 'spellbind',
    name: 'Spellbind',
    grade: 'D',
    damageType: 'magic',
    element: null,
    target: 'single',
    spCost: 25,
    baseMult: 0.8,
    perLevel: 0.04,
    trainable: false,
    learnable: false,
    effects: [{ kind: 'stun', push: 60, chance: 60, perLevel: 5 }],
  },
  // Barrier (mage, Lv12): a ward on the friend the foes are lined up on (from the mage's mAtk).
  barrier: {
    id: 'barrier',
    name: 'Barrier',
    grade: 'C',
    damageType: 'magic',
    element: null,
    target: 'ally-threatened',
    spCost: 28,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    effects: [{ kind: 'shield', from: 'mAtk', pct: 70, perLevel: 10, turns: 2 }],
  },
  // Mending Light (mage, Lv24): light over the whole party (heals from the mage's mAtk).
  mending_light: {
    id: 'mending_light',
    name: 'Mending Light',
    grade: 'C',
    damageType: 'magic',
    element: 'light',
    target: 'all-allies',
    spCost: 40,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    effects: [{ kind: 'heal', from: 'mAtk', pct: 28, perLevel: 4 }],
  },
  // First Aid + Regeneration → Field Medicine: bind the wound and keep it closing.
  field_medicine: {
    id: 'field_medicine',
    name: 'Field Medicine',
    grade: 'C',
    damageType: 'physical',
    element: null,
    target: 'ally-lowest',
    spCost: 26,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    effects: [
      { kind: 'heal', from: 'maxHP', pct: 16, perLevel: 3 },
      { kind: 'regen', from: 'maxHP', pct: 4, perLevel: 1, turns: 3 },
    ],
  },
  // Max Indomitability → Unyielding: the shield, and the roar that draws every blow onto it.
  unyielding: {
    id: 'unyielding',
    name: 'Unyielding',
    grade: 'B',
    damageType: 'physical',
    element: null,
    target: 'self',
    spCost: 30,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    effects: [
      { kind: 'shield', from: 'maxHP', pct: 28, perLevel: 4, turns: 3 },
      { kind: 'taunt', turns: 2 },
    ],
  },

  // ── Enemy kits (lane F: a light touch — a priest heals, a shaman poisons, a knight taunts) ──
  e_saints_grace: {
    id: 'e_saints_grace',
    name: "Saint's Grace",
    grade: 'C',
    damageType: 'magic',
    element: 'light',
    target: 'ally-lowest',
    spCost: 30,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    bound: true,
    enemy: true,
    effects: [{ kind: 'heal', from: 'mAtk', pct: 40 }],
  },
  e_venom_spit: {
    id: 'e_venom_spit',
    name: 'Venom Spit',
    grade: 'D',
    damageType: 'magic',
    element: 'earth',
    target: 'single',
    spCost: 20,
    baseMult: 0.6,
    perLevel: 0,
    trainable: false,
    learnable: false,
    bound: true,
    enemy: true,
    effects: [{ kind: 'dot', dot: 'poison', from: 'atk', pct: 15, turns: 3 }],
  },
  e_shield_wall: {
    id: 'e_shield_wall',
    name: 'Shield Wall',
    grade: 'D',
    damageType: 'physical',
    element: null,
    target: 'self',
    spCost: 25,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    bound: true,
    enemy: true,
    effects: [
      { kind: 'taunt', turns: 2 },
      { kind: 'buff', stat: 'guard', pct: 25, turns: 2 },
    ],
  },
  e_curse: {
    id: 'e_curse',
    name: 'Curse',
    grade: 'C',
    damageType: 'magic',
    element: 'dark',
    target: 'single',
    spCost: 25,
    baseMult: 0.5,
    perLevel: 0,
    trainable: false,
    learnable: false,
    bound: true,
    enemy: true,
    effects: [{ kind: 'debuff', stat: 'atk', pct: 25, turns: 3 }],
  },
  e_dragon_breath: {
    id: 'e_dragon_breath',
    name: 'Dragon Breath',
    grade: 'B',
    damageType: 'magic',
    element: 'fire',
    target: 'all-enemies',
    spCost: 40,
    baseMult: 0.8,
    perLevel: 0,
    trainable: false,
    learnable: false,
    bound: true,
    enemy: true,
    effects: [{ kind: 'dot', dot: 'burn', from: 'atk', pct: 8, turns: 2, chance: 50 }],
  },
  e_iron_blood: {
    id: 'e_iron_blood',
    name: 'Iron Blood',
    grade: 'B',
    damageType: 'physical',
    element: null,
    target: 'self',
    spCost: 35,
    baseMult: 0,
    perLevel: 0,
    trainable: false,
    learnable: false,
    bound: true,
    enemy: true,
    effects: [
      { kind: 'shield', from: 'maxHP', pct: 15, turns: 3 },
      { kind: 'buff', stat: 'atk', pct: 20, turns: 3 },
    ],
  },
  e_soul_siphon: {
    id: 'e_soul_siphon',
    name: 'Soul Siphon',
    grade: 'C',
    damageType: 'magic',
    element: 'dark',
    target: 'single',
    spCost: 15,
    baseMult: 0.7,
    perLevel: 0,
    trainable: false,
    learnable: false,
    bound: true,
    enemy: true,
    effects: [{ kind: 'sp', amount: -25 }],
  },
}

/** Auto-merge table (Layer 1 §2.4). Order is the deterministic resolution order. */
export const SKILL_MERGES: readonly MergeRecipe[] = [
  { inputs: ['berserk', 'composure'], minLevel: 3, result: 'exceed' },
  { inputs: ['berserk', 'calmness'], minLevel: 3, result: 'ixid' },
  { inputs: ['sword_soul', 'ganggyeok'], minLevel: 3, result: 'pathology' },
  { inputs: ['basic_swordsmanship', 'basic_shield'], minLevel: 3, result: 'sword_shield_technique' },
  { inputs: ['first_aid', 'regeneration'], minLevel: 3, result: 'field_medicine' },
]

/** Manual-only evolutions (Transfer Station): `from` at max level → `result` at Lv1. */
export const SKILL_EVOLUTIONS: readonly EvolutionRecipe[] = [
  { from: 'pain_tolerance', result: 'battle_speed' },
  { from: 'sword_shield_technique', result: 'intermediate_sword' },
  { from: 'indomitability', result: 'unyielding' },
]

/** Conditional unlocks (canon: Throwing Defense Lv11 · Siman Lv15 on F15 · Incident Lv29), and
 *  the class kits (lane F): an archer's Mark, a thief's Stealthy Movements, a mage's
 *  Spellbind, Barrier and Mending Light, a front-liner's War Cry. */
export const SKILL_UNLOCKS: readonly SkillUnlock[] = [
  { skillId: 'projectile_defense', minLevel: 11 },
  { skillId: 'siman', minLevel: 15, minFloorCleared: 15 },
  { skillId: 'incident', minLevel: 29 },
  { skillId: 'hunters_mark', minLevel: 8, classes: ['archer'] },
  { skillId: 'spellbind', minLevel: 8, classes: ['mage'] },
  { skillId: 'stealthy_movements', minLevel: 10, classes: ['thief'] },
  { skillId: 'barrier', minLevel: 12, classes: ['mage'] },
  { skillId: 'war_cry', minLevel: 18, classes: ['warrior', 'spearman'] },
  { skillId: 'mending_light', minLevel: 24, classes: ['mage'] },
]

/** Achievement skills, earned by every deployed survivor of a won battle that meets the condition. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'slay_halgiraf', skillId: 'dragon_slayer', label: 'Slew Halgiraf', condition: { kind: 'defeat', targetTag: 'halgiraf' } },
  { id: 'escort_priasis', skillId: 'guardians_oath', label: 'Brought Priasis home', condition: { kind: 'clearFloor', floor: 15 } },
]

/** Each class's signature skill — promotion grants it first, and 4★+ summons arrive with it. */
export const CLASS_SKILL: Readonly<Record<HeroClass, string>> = {
  warrior: 'power_strike',
  spearman: 'piercing_thrust',
  thief: 'shadow_flurry',
  archer: 'thunder_volley',
  mage: 'arcane_burst',
}
