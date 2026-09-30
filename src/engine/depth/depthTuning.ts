/**
 * Combat depth tuning (spec 2026-09-30-combat-depth): relationship synergy, formation,
 * floor modifiers and the Enemy Codex. Kept in its own block so the shared TUNING table
 * stays untouched; every number here is deliberately modest (a few percent, a sometimes).
 */
export const DEPTH = {
  bonds: {
    /** COVER (close friends): chance a neighbour intercepts a killing blow, once per pair a
     *  battle — base at the close-friend threshold, + perAffinity per point above it. */
    coverBase: 0.25,
    coverPerAffinity: 0.006,
    coverMax: 0.5,
    /** FOLLOW-UP: chance a friend adds a strike when their friend hits, and its power
     *  (× the friend's basic attack). */
    followUpFriend: 0.1,
    followUpCloseFriend: 0.18,
    followUpMult: 0.5,
    /** RIVALS (and grudges) deal a little more while the other stands — competing for kills… */
    rivalDamage: 0.08,
    /** …and sometimes ignore a Focus order to chase their own target. */
    rivalIgnoreFocus: 0.2,
    /** GRUDGE: a small accuracy penalty (miss chance) fighting beside the one they resent. */
    grudgeMiss: 0.05,
  },
  formation: {
    /** Damage dealt by line, per class family (heroes only — monsters don't hold lines). */
    dealt: {
      melee: { front: 1, mid: 0.95, back: 0.85 }, // warrior, spearman
      thief: { front: 1, mid: 1, back: 0.9 },
      ranged: { front: 0.85, mid: 1, back: 1.08 }, // archer, mage
      none: { front: 1, mid: 1, back: 1 }, // classless
    },
    /** A back-line hero takes this much damage while any front-line ally stands. */
    backCover: 0.88,
    /** A front-line hero takes this much while a mid-line ally stands (the support line)… */
    midSupportTaken: 0.95,
    /** …and a mid-line hero's healing (lifesteal) is multiplied by this. */
    midSupportHeal: 1.2,
  },
  mods: {
    /** Floor modifiers roll from this floor (never on anchors). */
    fromFloor: 40,
    /** Chance a floor has one modifier; from `deepFrom`, `twoChance` of those rolls have two. */
    oneChance: 0.45,
    deepFrom: 60,
    twoChance: 0.12,
    /** FOG: every blow has this extra chance to miss (both sides). */
    fogMiss: 0.1,
    /** BLOOD MOON: enemies deal +X, and enrage timers run at ×enrage. */
    bloodMoonDamage: 0.15,
    bloodMoonEnrage: 0.75,
    /** HOLY GROUND: light ×(1+X), dark ×(1−X). */
    holyGround: 0.3,
    /** MIASMA: healing ×X. */
    miasmaHeal: 0.5,
    /** GALE: every unit's action gauge fills ×X. */
    galeSpeed: 1.25,
    /** FROST: fire ×(1−X), water ×(1+X). */
    frost: 0.25,
  },
  codex: {
    /** Felling a template this many times studies it (its weaknesses are known). */
    studyAfterDefeats: 3,
    /** Distinct floors remembered per entry. */
    maxFloors: 12,
  },
} as const
