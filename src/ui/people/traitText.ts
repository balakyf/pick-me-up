/**
 * An innate trait in words (lane J): its name, its line, and what it does — read straight
 * from the trait's data (content/traits.ts), so the words can never drift from the numbers.
 * Pure presentation helpers; every string goes through t().
 */
import type { DerivedStats, KeywordTag } from '../../engine/types'
import { TRAITS, traitOf, type TraitDef, type TraitId } from '../../engine/content/traits'
import type { OwnedHero } from '../../engine/types'
import { t } from '../i18n/i18n'

type StatBlock = Partial<Record<keyof DerivedStats, number>>

const pct = (v: number) => Math.round(v * 100)
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

const ELEMENT_WORD: Record<string, string> = {
  fire: 'fire',
  water: 'water',
  wind: 'wind',
  earth: 'earth',
  light: 'light',
  dark: 'shadow',
  physical: 'physical',
}

const FAMILY_WORD: Record<string, string> = {
  undead: 'the restless dead',
  demon: 'demons',
  dragon: 'dragons',
  beast: 'beasts',
  humanoid: 'people',
  construct: 'constructs',
  aquatic: 'sea creatures',
  fragment: 'Fragments',
}

function keywordLine(k: KeywordTag): string | null {
  switch (k.kind) {
    case 'frenzy':
      return t('+{n}% damage below {hp}% HP', { n: pct(k.multiplier - 1), hp: k.belowHpPct })
    case 'guard':
      if (k.vs === undefined) return t('takes {n}% less damage', { n: pct(k.reduction) })
      if (k.vs === 'ranged' || k.vs === 'melee') return t('takes {n}% less damage', { n: pct(k.reduction) })
      return t('takes {n}% less {element} damage', { n: pct(k.reduction), element: t(ELEMENT_WORD[k.vs] ?? k.vs) })
    case 'bane':
      return t('+{n}% damage to {family}', { n: pct(k.multiplier - 1), family: t(FAMILY_WORD[k.family] ?? k.family) })
    case 'aegis':
      return k.charges === 1 ? t('the first blow of a fight misses them') : t('the first {n} blows of a fight miss them', { n: k.charges })
    case 'opener':
      return t('their first blow of a fight deals +{n}%', { n: pct(k.multiplier - 1) })
    case 'lifesteal':
      return t('heals {n}% of the damage they deal', { n: pct(k.fraction) })
    default:
      return null
  }
}

function statLines(block: StatBlock): string[] {
  const out: string[] = []
  const b = { ...block }
  // Physical and magic attack move together on every trait: one "ATK".
  if (b.pAtk !== undefined && b.pAtk === b.mAtk) {
    out.push(t('ATK {n}%', { n: signed(pct(b.pAtk)) }))
    delete b.pAtk
    delete b.mAtk
  }
  const label: Partial<Record<keyof DerivedStats, string>> = {
    maxHP: 'HP',
    pAtk: 'P.ATK',
    mAtk: 'M.ATK',
    pDef: 'DEF',
    mDef: 'M.DEF',
    spd: 'SPD',
    critPct: 'CRIT',
    statusRes: 'status resistance',
  }
  for (const [k, v] of Object.entries(b) as [keyof DerivedStats, number][]) {
    out.push(t('{stat} {n}%', { stat: t(label[k] ?? k), n: signed(pct(v)) }))
  }
  return out
}

function flatLines(block: StatBlock): string[] {
  const out: string[] = []
  if (block.critPct) out.push(t('+{n} crit chance', { n: block.critPct }))
  if (block.statusRes) out.push(t('+{n} status resistance (steadier nerves)', { n: block.statusRes }))
  return out
}

/** What the trait does in a fight, as short phrases. */
export function traitCombatLines(def: TraitDef): string[] {
  const out: string[] = []
  for (const k of def.keywords ?? []) {
    const line = keywordLine(k)
    if (line) out.push(line)
  }
  out.push(...statLines(def.statPct ?? {}), ...flatLines(def.flat ?? {}))
  if (def.alonePct) out.push(t('outside a bond group: {list}', { list: statLines(def.alonePct).join(', ') }))
  return out
}

const JOB_WORD: Record<string, string> = { healer: 'healer', instructor: 'instructor', cook: 'cook' }

/** What the trait does in the Living Lobby (empty for most). */
export function traitLifeLines(def: TraitDef): string[] {
  const out: string[] = []
  const life = def.life
  if (!life) return out
  if (life.hungerSlower) out.push(t('gets hungry {n}% more slowly', { n: pct(life.hungerSlower) }))
  if (life.practiceMore) out.push(t('practises skills {n}% faster in the yard', { n: pct(life.practiceMore) }))
  for (const [job, n] of Object.entries(life.aptitude ?? {})) {
    if (n) out.push(t('a natural {job} (+{n} aptitude)', { job: t(JOB_WORD[job] ?? job), n }))
  }
  return out
}

/** Every effect, one line (the tooltip body). */
export function traitEffects(def: TraitDef): string {
  const lines = [...traitCombatLines(def), ...traitLifeLines(def)]
  const line = lines.join(' · ')
  return line.charAt(0).toUpperCase() + line.slice(1)
}

/** "Rare trait" / "Trait". */
export function traitRarityLabel(def: TraitDef): string {
  return def.rarity === 'rare' ? t('Rare trait') : t('Trait')
}

/** The full tooltip: name, rarity, the line in the hero's voice, then what it does. */
export function traitTooltip(def: TraitDef): string {
  return `${t(def.name)} · ${traitRarityLabel(def)}\n“${t(def.blurb)}”\n${traitEffects(def)}`
}

/** The trait of a hero, by id or hero (convenience for views). */
export function traitFor(hero: OwnedHero): TraitDef {
  return traitOf(hero)
}

/** Registry filter options: every trait, common forms first, by translated name. */
export function traitFilterOptions(): { id: TraitId; label: string; rare: boolean }[] {
  return (Object.values(TRAITS) as TraitDef[])
    .map((d) => ({ id: d.id, label: t(d.name), rare: d.rarity === 'rare' }))
    .sort((a, b) => Number(a.rare) - Number(b.rare) || a.label.localeCompare(b.label))
}
