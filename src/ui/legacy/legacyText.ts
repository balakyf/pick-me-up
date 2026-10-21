/**
 * Words for the legacy of the fallen (spec 2026-10-12 S21-S23): what an Echo gives, who
 * an heir is to the fallen, what a death taught. Presentation only; every line goes
 * through `t()` (French in frLegacy.ts).
 */
import type { Echo, EchoStat, Element, GameState, HeroId, Nemesis, OwnedHero, PendingEcho } from '../../engine/types'
import { SKILLS } from '../../engine/content'
import { bondOf, relationKey } from '../../engine/life'
import { counterElement, fragmentTakes, parseRevenantName, type FallenKiller } from '../../engine/legacy'
import { getLocale, t } from '../i18n/i18n'

/** Stat names, reusing the hero card's labels (already translated). */
export const STAT_LABEL: Record<EchoStat, string> = {
  maxHP: 'HP',
  pAtk: 'P.ATK',
  mAtk: 'M.ATK',
  pDef: 'P.DEF',
  mDef: 'M.DEF',
  spd: 'SPD',
}

/** Enemy families, as a lesson names them. */
export const FAMILY_LABEL: Record<string, string> = {
  humanoid: 'Humanoids',
  beast: 'Beasts',
  undead: 'The undead',
  dragon: 'Dragons',
  construct: 'Constructs',
  aquatic: 'Sea creatures',
  demon: 'Demons',
  fragment: 'Fragments',
}

const ELEMENT_GLYPH: Record<Element, string> = {
  fire: '🔥',
  water: '💧',
  wind: '🍃',
  earth: '⛰️',
  light: '☀️',
  dark: '🌑',
  physical: '⚔️',
}

/** A fraction as a percentage number for a sentence: 0.025 → "2.5" ("2,5" in French). */
export function pctNum(fraction: number): string {
  const s = String(Math.round(fraction * 1000) / 10)
  return getLocale() === 'fr' ? s.replace('.', ',') : s
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name
}

/** "+10% P.ATK" */
export function statGift(stat: EchoStat, pct: number): string {
  return t('+{pct}% {stat}', { pct: Math.round(pct * 100), stat: t(STAT_LABEL[stat]) })
}

/** A skill's display name (falls back to the id). */
export function skillName(id: string): string {
  return t(SKILLS[id]?.name ?? id)
}

/** What an Echo gives, in one line: "+10% P.ATK · Power Strike +1 if known". */
export function echoGift(e: Pick<Echo | PendingEcho, 'stat' | 'pct' | 'skillId'>): string {
  const stat = statGift(e.stat, e.pct)
  return e.skillId ? `${stat} · ${t('{skill} +1 if known', { skill: skillName(e.skillId) })}` : stat
}

/** What this heir in particular would get from the Echo ("+10% P.ATK · Power Strike +1"). */
export function giftFor(heir: OwnedHero, p: Pick<PendingEcho, 'stat' | 'pct' | 'skillId'>): string {
  const stat = statGift(p.stat, p.pct)
  return fragmentTakes(heir, p.skillId) ? `${stat} · ${t('{skill} +1', { skill: skillName(p.skillId!) })}` : stat
}

/** Who the heir was to the fallen: "Closest friend", "Their friend", "Fought beside them". */
export function heirBond(state: GameState, fallenId: HeroId, heirId: HeroId): string {
  const aff = state.life.relations[relationKey(fallenId, heirId)]?.affinity ?? 0
  const b = bondOf(aff)
  if (b === 'closeFriend') return t('Closest friend')
  if (b === 'friend') return t('Their friend')
  if (b === 'rival' || b === 'grudge') return t('Their old rival')
  // Only a hero who stood in the party can truly be said to have fought beside them.
  return state.party.slots.includes(heirId) ? t('Fought beside them') : t('A fellow hero')
}

/** "Mira’s Bane" */
export function baneName(n: Pick<Nemesis, 'heroName'>): string {
  return t('{name}’s Bane', { name: firstName(n.heroName) })
}

/** How to answer a killer: "Skeleton 🌑: answer it with ☀️." (null for physical foes). */
export function counterHint(enemy: string, el: Element): string | null {
  const c = counterElement(el)
  if (c === null) return null
  return t('{enemy} {el}: answer it with {counter}.', { enemy: t(enemy), el: ELEMENT_GLYPH[el], counter: ELEMENT_GLYPH[c] })
}

/** What a death taught: "Humanoids: the scout now points out their weakness. Knight ⛰️: answer it with 🍃." */
export function lessonLine(killer: Pick<FallenKiller, 'family' | 'element' | 'name'>): string {
  const parts: string[] = []
  if (killer.family !== undefined) parts.push(t('{family}: the scout now points out their weakness.', { family: t(FAMILY_LABEL[killer.family] ?? killer.family) }))
  const hint = counterHint(killer.name, killer.element)
  if (hint) parts.push(hint)
  return parts.join(' ')
}

/**
 * An enemy's display name: a revenant ("Mira's Bane", as the engine names the unit) through
 * the translated `baneName`, anything else through `t()` (content strings).
 */
export function enemyName(name: string): string {
  const hero = parseRevenantName(name)
  return hero !== null ? baneName({ heroName: hero }) : t(name)
}

/** Where a waiting Bane is: "waits on floor 14", or "still at large" once the climb passed it. */
export function baneWhere(state: GameState, n: Nemesis): string {
  if (n.status === 'avenged') return t('Avenged at last')
  return n.revengeFloor >= state.tower.currentFloor ? t('waits on floor {n}', { n: n.revengeFloor }) : t('still at large in the tower')
}
