import type { DerivedStats, Element, HeroClass, Star, OwnedHero } from '../engine/types'
import { gradeValueToLetter } from '../engine/stats'
import { heroBustUrl } from './pixel/sprites'
import { ENGRAVINGS, SKILLS } from '../engine/content'
import { maxLevelFor } from '../engine/skills'
import { t } from './i18n/i18n'
import { heroCpFull, heroStatsFull, type CpContext } from '../engine/unit/trueCp'
import { peekState } from './useGame'

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
  return c === null ? t('Classless') : t(CLASS_VIS[c].label)
}
export function classGlyph(c: HeroClass | null): string {
  return c === null ? '—' : CLASS_VIS[c].glyph
}

/**
 * Display CP — the TRUE number the combat unit carries (gear, passives, engraving %,
 * favor, the Sanity penalty: engine/unit/trueCp). Pass the account for gear to count;
 * without it, the live store's account is used when this very hero belongs to it.
 */
export function cpOf(hero: OwnedHero, state?: CpContext | null): number {
  return heroCpFull(cpContextFor(hero, state), hero)
}

/** The combat stats the hero would fight with (gear and every modifier), as `cpOf` reads. */
export function statsOf(hero: OwnedHero, state?: CpContext | null): DerivedStats {
  return heroStatsFull(cpContextFor(hero, state), hero)
}

/** Bare-handed (one shared object, so heroCpFull's memo can hit). */
const NO_GEAR: CpContext = { inventory: [] }

function cpContextFor(hero: OwnedHero, state?: CpContext | null): CpContext {
  if (state) return state
  const live = peekState()
  return live && live.heroes[hero.id] === hero ? live : NO_GEAR
}

/** A hero's engraving/imprint (4★+ identity layer) as a small graded badge. */
export function EngravingBadge({ hero }: { hero: OwnedHero }) {
  if (hero.engraving === null) return null
  const def = ENGRAVINGS[hero.engraving.id]
  if (!def) return null
  return (
    <div className={`engraving grade-${hero.engraving.grade}`} title={`${t(def.name)} (${hero.engraving.grade}) — ${t(def.blurb)}`}>
      <span className="engr-grade">{hero.engraving.grade}</span>
      <span className="engr-name">❖ {t(def.name)}</span>
    </div>
  )
}

/** A hero's skills as `name · grade · Lv N` chips (read-only, Layer 1 §2). */
export function SkillList({ hero, max }: { hero: OwnedHero; max?: number }) {
  const shown = max !== undefined ? hero.skills.slice(0, max) : hero.skills
  if (hero.skills.length === 0) return <div className="skill-list empty-skills">{t('No skills yet')}</div>
  return (
    <div className="skill-list">
      {shown.map((s) => {
        const def = SKILLS[s.id]
        if (!def) return null
        const cap = maxLevelFor(def.grade)
        return (
          <div
            key={s.id}
            className={`skill-chip grade-${def.grade} ${def.passive ? 'passive' : ''}`}
            title={`${t(def.name)} · ${t('grade')} ${def.grade} · Lv ${s.level}/${cap}${def.passive ? ' · ' + t('passive') : ''}${def.bound ? ' · ' + t('achievement (bound)') : ''}`}
          >
            <span className="skill-grade">{def.grade}</span>
            <span className="skill-name">{t(def.name)}</span>
            <span className="skill-lv">Lv {s.level}</span>
            {def.hpCost !== undefined && <span className="skill-hp" title={t('Costs HP to cast')}>♥</span>}
            {def.bound && <span className="skill-bound" title={t('Achievement skill — bound to this hero')}>✦</span>}
          </div>
        )
      })}
      {max !== undefined && hero.skills.length > max && <div className="skill-more">{t('+{n} more', { n: hero.skills.length - max })}</div>}
    </div>
  )
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
    <span className="tag" style={{ color: v.color }} title={t(v.label)}>
      {v.glyph} {t(v.label)}
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

/** Element-tinted backdrop behind a hero's pixel bust. */
function portraitBg(hero: OwnedHero): string {
  const c = ELEMENT_VIS[hero.element].color
  return `linear-gradient(180deg, ${c}55 0%, #120e2c 85%)`
}

export function Portrait({ hero, size = 'card' }: { hero: OwnedHero; size?: 'card' | 'sm' }) {
  const src = heroBustUrl(hero)
  if (size === 'sm') {
    return (
      <div className="cp-dot" style={{ background: portraitBg(hero) }} title={hero.name}>
        {src ? <img className="px" src={src} alt="" /> : initials(hero.name)}
      </div>
    )
  }
  return (
    <div className={`portrait${hero.star >= 7 ? ' aura-glow' : ''}`} style={{ background: portraitBg(hero) }}>
      {src ? <img className="px" src={src} alt={hero.name} /> : <span>{initials(hero.name)}</span>}
      <span className="p-el">{ELEMENT_VIS[hero.element].glyph}</span>
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
