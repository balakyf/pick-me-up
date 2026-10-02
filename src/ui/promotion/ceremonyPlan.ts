/**
 * The promotion ceremony as pure data (lane J): which promotions just completed (so the
 * overlay can play them), what changed in each (grades, class, skill, engraving, trait), and
 * the beats the overlay plays them in. Presentation only — the engine already decided.
 */
import type { GameState, GrowthGrades, HeroEngraving, HeroId, OwnedHero } from '../../engine/types'
import { gradeValueToLetter } from '../../engine/stats'
import { traitOf, type TraitId } from '../../engine/content/traits'

/** A promotion that just completed: the hero before and after. */
export interface CompletedPromotion {
  heroId: HeroId
  before: OwnedHero
  after: OwnedHero
}

/**
 * The promotions that completed between two snapshots: a living hero whose star rose. The
 * chamber's timer (or a gem skip) is the only way a star rises, so no other change counts.
 */
export function detectPromotions(prev: GameState | null, next: GameState | null): CompletedPromotion[] {
  if (!prev || !next || prev === next || prev.accountId !== next.accountId) return []
  const out: CompletedPromotion[] = []
  for (const id of Object.keys(next.heroes) as HeroId[]) {
    const before = prev.heroes[id]
    const after = next.heroes[id]!
    if (!before || !after.alive) continue
    if (after.star > before.star && before.promotion !== null) out.push({ heroId: id, before, after })
  }
  return out.sort((a, b) => b.after.star - a.after.star || (a.heroId < b.heroId ? -1 : 1))
}

const ATTRS: [keyof GrowthGrades, string][] = [
  ['str', 'STR'],
  ['agi', 'AGI'],
  ['vit', 'VIT'],
  ['int', 'INT'],
  ['wil', 'WIL'],
]

/** One growth grade, before and after (letters and values). */
export interface GradeRow {
  key: keyof GrowthGrades
  label: string
  from: number
  to: number
  fromLetter: string
  toLetter: string
  delta: number
}

export function gradeRows(before: GrowthGrades, after: GrowthGrades): GradeRow[] {
  return ATTRS.map(([key, label]) => ({
    key,
    label,
    from: before[key],
    to: after[key],
    fromLetter: gradeValueToLetter(before[key]),
    toLetter: gradeValueToLetter(after[key]),
    delta: after[key] - before[key],
  }))
}

/** What the promotion changed, beyond the star. */
export interface CeremonyChanges {
  grades: GradeRow[]
  newClass: OwnedHero['heroClass'] | null
  newSkills: string[]
  engraving: { kind: 'evolved'; from: HeroEngraving; to: HeroEngraving } | { kind: 'awakened'; to: HeroEngraving } | null
  trait: { from: TraitId; to: TraitId } | null
}

export function ceremonyChanges(before: OwnedHero, after: OwnedHero): CeremonyChanges {
  const known = new Set(before.skills.map((s) => s.id))
  const fromTrait = traitOf(before).id
  const toTrait = traitOf(after).id
  return {
    grades: gradeRows(before.growthGrades, after.growthGrades),
    newClass: before.heroClass === null && after.heroClass !== null ? after.heroClass : null,
    newSkills: after.skills.map((s) => s.id).filter((id) => !known.has(id)),
    engraving:
      after.engraving === null
        ? null
        : before.engraving === null
          ? { kind: 'awakened', to: after.engraving }
          : before.engraving.grade !== after.engraving.grade
            ? { kind: 'evolved', from: before.engraving, to: after.engraving }
            : null,
    trait: fromTrait !== toTrait ? { from: fromTrait, to: toTrait } : null,
  }
}

export type CeremonyBeat = 'open' | 'stars' | 'grades' | 'class' | 'skill' | 'engraving' | 'trait' | 'done'

/** The beats, in order: only the ones this promotion has something to show for. */
export function ceremonyBeats(c: CeremonyChanges): CeremonyBeat[] {
  const out: CeremonyBeat[] = ['open', 'stars', 'grades']
  if (c.newClass) out.push('class')
  if (c.newSkills.length > 0) out.push('skill')
  if (c.engraving) out.push('engraving')
  if (c.trait) out.push('trait')
  out.push('done')
  return out
}

/** ms each beat holds before the next (reduced motion: everything at once). */
export function beatHold(beat: CeremonyBeat, reducedMotion: boolean): number {
  if (reducedMotion) return 0
  switch (beat) {
    case 'open':
      return 700
    case 'stars':
      return 1100
    case 'grades':
      return 1300
    case 'done':
      return 0
    default:
      return 1000
  }
}

/** A grade ticking up: the value shown `ms` into its beat (integer steps, `perStep` ms each). */
export function tickingValue(from: number, to: number, ms: number, perStep = 160): number {
  if (to <= from) return to
  return Math.min(to, from + Math.floor(ms / perStep))
}
