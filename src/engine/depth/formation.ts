/**
 * Formation (combat depth §2): what a hero's line does for them. PURE lookups — combat
 * applies them, the UI explains them. Only heroes hold lines; enemies are unaffected.
 */
import type { HeroClass, Line } from '../types'
import { DEPTH } from './depthTuning'

const F = DEPTH.formation

export type ClassFamily = 'melee' | 'thief' | 'ranged' | 'none'

export function classFamily(cls: HeroClass | null): ClassFamily {
  if (cls === 'warrior' || cls === 'spearman') return 'melee'
  if (cls === 'thief') return 'thief'
  if (cls === 'archer' || cls === 'mage') return 'ranged'
  return 'none'
}

/** Damage-dealt multiplier for a hero of this class on this line. */
export function lineDamageMult(cls: HeroClass | null, line: Line): number {
  return F.dealt[classFamily(cls)][line]
}

/** Lines are neighbours when they are the same or one step apart (front–mid, mid–back). */
export function adjacentLines(a: Line, b: Line): boolean {
  const idx = { front: 0, mid: 1, back: 2 } as const
  return Math.abs(idx[a] - idx[b]) <= 1
}

/** The best line for a class family (for hints). */
export function bestLine(cls: HeroClass | null): Line | null {
  const fam = classFamily(cls)
  if (fam === 'none') return null
  const d = F.dealt[fam]
  return (['front', 'mid', 'back'] as const).reduce((best, l) => (d[l] > d[best] ? l : best), 'front' as Line)
}

/** One hero's formation effect as data (the UI turns this into words). */
export interface FormationNote {
  line: Line
  /** Damage dealt, e.g. +8 or −15 (%). 0 = neutral. */
  dealtPct: number
  /** The line's defensive effect in this party (null = none). */
  shelter: 'backCover' | 'midSupport' | null
  /** A mid-line hero heals better. */
  supportHeal: boolean
}

/**
 * The formation effect of every filled slot in a lineup (heroes only). `backCover` needs a
 * front-line ally; the front line's `midSupport` needs a mid-line ally.
 */
export function formationNotes(members: readonly { heroClass: HeroClass | null; line: Line }[]): FormationNote[] {
  const hasFront = members.some((m) => m.line === 'front')
  const hasMid = members.some((m) => m.line === 'mid')
  return members.map((m) => ({
    line: m.line,
    dealtPct: Math.round((lineDamageMult(m.heroClass, m.line) - 1) * 100),
    shelter: m.line === 'back' && hasFront ? 'backCover' : m.line === 'front' && hasMid ? 'midSupport' : null,
    supportHeal: m.line === 'mid',
  }))
}
