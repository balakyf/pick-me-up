import type { Element, HeroClass, Star, OwnedHero } from '../engine/types'
import { combatPowerForHero, gradeValueToLetter } from '../engine/stats'

/** Visual tokens for elements. */
export const ELEMENT_VIS: Record<Element, { glyph: string; color: string; label: string }> = {
  fire: { glyph: '🔥', color: '#ff6b4a', label: 'Fire' },
  water: { glyph: '💧', color: '#4aa3ff', label: 'Water' },
  wind: { glyph: '🍃', color: '#6be29a', label: 'Wind' },
  earth: { glyph: '⛰️', color: '#c8a24a', label: 'Earth' },
  light: { glyph: '☀️', color: '#ffe07a', label: 'Light' },
  dark: { glyph: '🌑', color: '#b07adb', label: 'Dark' },
  physical: { glyph: '⚔️', color: '#cfd3da', label: 'Physical' },
}

export const CLASS_VIS: Record<HeroClass, { glyph: string; label: string }> = {
  warrior: { glyph: '🗡️', label: 'Warrior' },
  spearman: { glyph: '🔱', label: 'Spearman' },
  thief: { glyph: '🥷', label: 'Thief' },
  archer: { glyph: '🏹', label: 'Archer' },
  mage: { glyph: '🔮', label: 'Mage' },
}

export const STAR_COLOR: Record<Star, string> = {
  1: '#9aa3bd',
  2: '#5fd08a',
  3: '#4aa3ff',
  4: '#b07adb',
  5: '#f2c75c',
  6: '#f2a65a',
  7: '#ef5d6b',
}

export function classLabel(c: HeroClass | null): string {
  return c === null ? 'Classless' : CLASS_VIS[c].label
}
export function classGlyph(c: HeroClass | null): string {
  return c === null ? '—' : CLASS_VIS[c].glyph
}

export function cpOf(hero: OwnedHero): number {
  return combatPowerForHero(hero, hero.xp.level)
}

/** Deterministic display color from a hero's portrait token (hex) or id. */
export function portraitColor(hero: { portraitToken?: string; id: string; element: Element }): string {
  const t = hero.portraitToken
  if (t && /^#?[0-9a-fA-F]{6}$/.test(t)) return t.startsWith('#') ? t : `#${t}`
  // Fall back to the element color, lightened by an id-derived hue shift.
  return ELEMENT_VIS[hero.element].color
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export function Stars({ star }: { star: Star }) {
  return (
    <span className="stars" style={{ color: STAR_COLOR[star] }} title={`${star}★`}>
      {'★'.repeat(star)}
    </span>
  )
}

export function ElementBadge({ element }: { element: Element }) {
  const v = ELEMENT_VIS[element]
  return (
    <span className="tag" style={{ color: v.color }} title={v.label}>
      {v.glyph} {v.label}
    </span>
  )
}

export function ClassBadge({ heroClass }: { heroClass: HeroClass | null }) {
  return (
    <span className="tag" title={classLabel(heroClass)}>
      {classGlyph(heroClass)} {classLabel(heroClass)}
    </span>
  )
}

export function Bar({ pct, color }: { pct: number; color: string }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div className="bar">
      <span style={{ width: `${w}%`, background: color }} />
    </div>
  )
}

export function hpColor(pct: number): string {
  if (pct > 55) return '#5fd08a'
  if (pct > 25) return '#f2c75c'
  return '#ef5d6b'
}

export function Portrait({ hero, size = 'card' }: { hero: OwnedHero; size?: 'card' | 'sm' }) {
  const bg = portraitColor(hero)
  if (size === 'sm') {
    return (
      <div className="cp-dot" style={{ background: bg }}>
        {initials(hero.name)}
      </div>
    )
  }
  return (
    <div className="portrait" style={{ background: `linear-gradient(150deg, ${bg}, ${bg}aa)` }}>
      {ELEMENT_VIS[hero.element].glyph}
    </div>
  )
}

/** Grade letters for the five attributes (the canon training-grade readout). */
export function gradeLetters(hero: OwnedHero): Record<string, string> {
  const g = hero.growthGrades
  return {
    STR: gradeValueToLetter(g.str),
    AGI: gradeValueToLetter(g.agi),
    VIT: gradeValueToLetter(g.vit),
    INT: gradeValueToLetter(g.int),
    WIL: gradeValueToLetter(g.wil),
  }
}
