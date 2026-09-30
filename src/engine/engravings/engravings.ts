/**
 * Engravings / Imprints (Layer 1 §5.4) — the 4★+ identity layer.
 *
 * A hero's engraving is `{ id, grade }`; its effect is authored data (content/engravings)
 * resolved at unit build into keyword tags + % stat bonuses. Every 4★+ summon carries
 * one (True Black Dragon's Blood is the canon 2% among them); a hero promoted into 4★+
 * may awaken one; every promotion of an engraved hero evolves it one grade (C→B→A→S).
 *
 * PURE and DETERMINISTIC: randomness is threaded through the caller's Rng.
 */

import type { EngravingEffect, EngravingGrade, HeroEngraving, Star } from '../types'
import { ENGRAVINGS, ENGRAVING_GRADES } from '../content'
import { TUNING } from '../tuning'
import { weightedPick, type Draw, type Rng } from '../rng'

const EN = TUNING.engravings

/** The effect an engraving grants at its grade; null for an unknown id. */
export function engravingEffect(e: HeroEngraving | null): EngravingEffect | null {
  if (e === null) return null
  const def = ENGRAVINGS[e.id]
  return def ? def.byGrade[e.grade] : null
}

/** One grade up (S stays S). */
export function nextEngravingGrade(g: EngravingGrade): EngravingGrade {
  const i = ENGRAVING_GRADES.indexOf(g)
  return ENGRAVING_GRADES[Math.min(ENGRAVING_GRADES.length - 1, i + 1)]!
}

/** Engraving evolution (각인 진화): the same engraving, one grade higher. */
export function evolveEngraving(e: HeroEngraving): HeroEngraving {
  return { id: e.id, grade: nextEngravingGrade(e.grade) }
}

/** The CP an engraving adds to its bearer's unit. */
export function engravingCp(e: HeroEngraving | null): number {
  if (e === null || ENGRAVINGS[e.id] === undefined) return 0
  return EN.cp[e.grade] ?? 0
}

/** Summon grade weights as weightedPick entries. */
function gradeEntries(): { item: EngravingGrade; weight: number }[] {
  return Object.entries(EN.summonGradeWeights).map(([g, weight]) => ({ item: g as EngravingGrade, weight }))
}

/**
 * Roll a summoned hero's engraving: which one (by authored weight), then its grade
 * (summon grade weights; a 5★ is lifted one grade). Two draws, fixed order.
 */
export function rollEngraving(rng: Rng, star: Star): Draw<HeroEngraving> {
  const which = weightedPick(
    rng,
    Object.values(ENGRAVINGS).map((d) => ({ item: d.id, weight: d.weight })),
  )
  const grade = weightedPick(which.rng, gradeEntries())
  const g = star >= 5 ? nextEngravingGrade(grade.value) : grade.value
  return { value: { id: which.value, grade: g }, rng: grade.rng }
}

/** Display name of an engraving id. */
export function engravingName(id: string): string {
  return ENGRAVINGS[id]?.name ?? id
}
