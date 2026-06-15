/**
 * Layer 0 stat model: attribute leveling, derived combat stats, XP/leveling,
 * the rarity↔stat envelope bridge, and Combat Power (CP).
 *
 * All functions are PURE and DETERMINISTIC. Numbers come from TUNING; the
 * formula SHAPES live here (Layer 0 §1.3, §3, §4). Rounding policy is
 * round-half-up via Math.round (Math.round is round-half-up for non-negatives).
 *
 * No transcendental math: the super-linear XP curve is read from the baked
 * XP_TO_NEXT table, and the attribute formula is integer/linear, so nothing
 * here needs Math.pow.
 */

import { TUNING, STAR_ENVELOPES } from '../tuning'
import type {
  GradeLetter,
  PrimaryAttrs,
  GrowthGrades,
  DerivedStats,
  StarEnvelope,
  Star,
  XpProgress,
  Hero,
} from '../types'
import { XP_TO_NEXT } from './xpTable'

// ─────────────────────────────────────────────────────────────────────────────
// Growth grade ↔ letter (canon 0–10 training scale, Layer 0 §1.2)
// ─────────────────────────────────────────────────────────────────────────────

/** Clamp a number into [lo, hi]. */
function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo
  if (value > hi) return hi
  return value
}

/**
 * Banded letter for a 0–10 growth value (Layer 0 §1.2):
 *   F = 0–1, E = 2, D = 3, C = 4, B = 5–6, A = 7–8, S = 9, SS = 10.
 * Value is clamped to [0, 10] first.
 */
export function gradeValueToLetter(value: number): GradeLetter {
  const v = clamp(value, 0, 10)
  if (v <= 1) return 'F'
  if (v === 2) return 'E'
  if (v === 3) return 'D'
  if (v === 4) return 'C'
  if (v <= 6) return 'B'
  if (v <= 8) return 'A'
  if (v === 9) return 'S'
  return 'SS'
}

/**
 * The representative (floor) value of a grade letter's band (Layer 0 §1.2):
 *   F→0, E→2, D→3, C→4, B→5, A→7, S→9, SS→10.
 */
export function gradeLetterToValue(letter: GradeLetter): number {
  switch (letter) {
    case 'F':
      return 0
    case 'E':
      return 2
    case 'D':
      return 3
    case 'C':
      return 4
    case 'B':
      return 5
    case 'A':
      return 7
    case 'S':
      return 9
    case 'SS':
      return 10
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Attribute leveling (Layer 0 §1.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw (unrounded) attribute at a level:
 *   attribute(L) = base + grade × (L − 1) × G.
 * Caller decides when to round (deriveStats does the rounding downstream).
 */
export function attributeAtLevel(base: number, grade: number, level: number): number {
  return base + grade * (level - 1) * TUNING.stats.growthG
}

/** Apply attributeAtLevel to all five primary attributes (unrounded). */
export function leveledAttrs(
  base: PrimaryAttrs,
  grades: GrowthGrades,
  level: number,
): PrimaryAttrs {
  return {
    str: attributeAtLevel(base.str, grades.str, level),
    agi: attributeAtLevel(base.agi, grades.agi, level),
    vit: attributeAtLevel(base.vit, grades.vit, level),
    int: attributeAtLevel(base.int, grades.int, level),
    wil: attributeAtLevel(base.wil, grades.wil, level),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived combat stats (Layer 0 §1.3) — every output rounded (round-half-up)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The combat-facing statline derived from primary attributes (Layer 0 §1.3).
 * Uses every TUNING.stats.derived coefficient. All outputs Math.round-ed.
 */
export function deriveStats(attrs: PrimaryAttrs): DerivedStats {
  const d = TUNING.stats.derived
  const { str, agi, vit, int, wil } = attrs

  const maxHP = vit * d.hpPerVit + d.hpFlat
  const pAtk = str * d.pAtkPerStr + agi * d.pAtkPerAgi
  const mAtk = int * d.mAtkPerInt
  const pDef = vit * d.pDefPerVit + str * d.pDefPerStr
  const mDef = wil * d.mDefPerWil + int * d.mDefPerInt
  const spd = d.spdFlat + agi * d.spdPerAgi
  const critPct = Math.min(d.critFlat + agi * d.critPerAgi, d.critCap)
  const evaPct = Math.min(agi * d.evaPerAgi, d.evaCap)
  const accPct = d.accFlat + agi * d.accPerAgi
  const statusRes = Math.min(wil * d.statusResPerWil, d.statusResCap)

  return {
    maxHP: Math.round(maxHP),
    pAtk: Math.round(pAtk),
    mAtk: Math.round(mAtk),
    pDef: Math.round(pDef),
    mDef: Math.round(mDef),
    spd: Math.round(spd),
    critPct: Math.round(critPct),
    evaPct: Math.round(evaPct),
    accPct: Math.round(accPct),
    statusRes: Math.round(statusRes),
  }
}

/** Level a hero's attributes then derive its combat statline. */
export function deriveStatsForHero(hero: Hero, level: number): DerivedStats {
  return deriveStats(leveledAttrs(hero.baseAttrs, hero.growthGrades, level))
}

/** Max SP pool from leveled WIL (Layer 0 / combat): flat + perWil × WIL. */
export function deriveMaxSP(leveledWil: number): number {
  return Math.round(TUNING.combat.spFlat + TUNING.combat.spPerWil * leveledWil)
}

// ─────────────────────────────────────────────────────────────────────────────
// XP & leveling (Layer 0 §3)
// ─────────────────────────────────────────────────────────────────────────────

/** XP required to advance from `level` to `level+1`. Reads the baked table. */
export function xpToNext(level: number): number {
  if (level < 1 || level > TUNING.xp.maxLevel) {
    throw new RangeError(
      `xpToNext: level ${level} out of range [1, ${TUNING.xp.maxLevel}]`,
    )
  }
  return XP_TO_NEXT[level - 1]
}

/** Total XP to reach `level` from level 1. cumulativeXpToLevel(1) === 0. */
export function cumulativeXpToLevel(level: number): number {
  if (level < 1 || level > TUNING.xp.maxLevel) {
    throw new RangeError(
      `cumulativeXpToLevel: level ${level} out of range [1, ${TUNING.xp.maxLevel}]`,
    )
  }
  let total = 0
  for (let l = 1; l < level; l++) {
    total += xpToNext(l)
  }
  return total
}

// ─────────────────────────────────────────────────────────────────────────────
// Rarity → stat envelope bridge (Layer 0 §4.2)
// ─────────────────────────────────────────────────────────────────────────────

/** The hard level cap for a star (Layer 0 §3.1). */
export function levelCapForStar(star: Star): number {
  return STAR_ENVELOPES[star].levelCap
}

/** The full stat envelope for a star (Layer 0 §4.2). */
export function envelopeForStar(star: Star): StarEnvelope {
  return STAR_ENVELOPES[star]
}

/**
 * Advance XP progress across level thresholds, STOPPING at the star level cap.
 *
 * Once the cap is reached, xpIntoLevel is frozen at 0 and any further/overflow
 * XP accumulates in heldXp (the canon "Lv.???" held-XP state, released later by
 * Promotion). atCap reflects whether the hero is sitting at the cap.
 *
 * Pure: never mutates `current`; always returns a fresh XpProgress.
 * Requires gained >= 0.
 */
export function applyXp(current: XpProgress, gained: number, star: Star): XpProgress {
  if (gained < 0) {
    throw new RangeError(`applyXp: gained must be >= 0, got ${gained}`)
  }

  const cap = levelCapForStar(star)

  let level = current.level
  let xpIntoLevel = current.xpIntoLevel
  let heldXp = current.heldXp
  let remaining = gained

  // If already at (or past) the cap, all incoming XP is held.
  if (level >= cap) {
    return {
      level: cap,
      xpIntoLevel: 0,
      heldXp: heldXp + remaining,
      atCap: true,
    }
  }

  // Climb through level thresholds until XP runs out or we hit the cap.
  while (level < cap) {
    const need = xpToNext(level) - xpIntoLevel
    if (remaining < need) {
      xpIntoLevel += remaining
      remaining = 0
      break
    }
    // Consume the rest of this level and advance.
    remaining -= need
    level += 1
    xpIntoLevel = 0
  }

  if (level >= cap) {
    // Hit the cap: freeze progress and hold any overflow.
    return {
      level: cap,
      xpIntoLevel: 0,
      heldXp: heldXp + remaining,
      atCap: true,
    }
  }

  return {
    level,
    xpIntoLevel,
    heldXp,
    atCap: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Combat Power (Layer 0 §4.1) — display / matchmaking only, never a sim input
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One display/matchmaking number (Layer 0 §4.1). NEVER a combat input.
 *   CP = MaxHP×wHP + P.ATK×wPAtk + M.ATK×wMAtk + P.DEF×wPDef + M.DEF×wMDef
 *      + SPD×wSpd + (CRIT% × critMult)×critWeight + skillScore
 * Rounded (round-half-up).
 */
export function combatPower(stats: DerivedStats, skillScore = 0): number {
  const w = TUNING.cp.weights
  const cp =
    stats.maxHP * w.maxHP +
    stats.pAtk * w.pAtk +
    stats.mAtk * w.mAtk +
    stats.pDef * w.pDef +
    stats.mDef * w.mDef +
    stats.spd * w.spd +
    stats.critPct * w.critMult * w.critWeight +
    skillScore
  return Math.round(cp)
}

/** Combat Power for a hero at a level (derive stats, then CP). */
export function combatPowerForHero(hero: Hero, level: number, skillScore = 0): number {
  return combatPower(deriveStatsForHero(hero, level), skillScore)
}
