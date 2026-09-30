import type { MaterialId, OwnedHero } from '../../engine/types'
import { Portrait, classGlyph, cpOf, ELEMENT_VIS } from '../bits'
import { BondBadge } from '../bond/BondBadge'
import { t } from '../i18n/i18n'

/** Material ids as the challenge windows show them. */
const MAT_LABEL: Record<string, string> = {
  promotionStone: '🪨 Stones',
  rankMaterial: '📦 Rank Mat',
  bookOfReverseHeaven: '📕 Book of Reverse Heaven',
  reverseHeavenPage: '📄 Page of Reverse Heaven',
}

export function matLabel(id: MaterialId): string {
  if (MAT_LABEL[id] !== undefined) return t(MAT_LABEL[id]!)
  if (id.startsWith('attrStone_')) {
    const el = id.slice('attrStone_'.length) as keyof typeof ELEMENT_VIS
    return `🔹 ${t('{el} Attribute Stone', { el: ELEMENT_VIS[el] ? t(ELEMENT_VIS[el].label) : el })}`
  }
  return id
}

/** "+3 🪨 Stones · +20 💎" */
export function lootLine(loot: { gold?: number; gems?: number; materials?: Record<MaterialId, number> }): string {
  const parts: string[] = []
  if (loot.gold) parts.push(`${loot.gold > 0 ? '+' : ''}${loot.gold.toLocaleString()} ◆`)
  if (loot.gems) parts.push(`+${loot.gems} 💎`)
  for (const [k, n] of Object.entries(loot.materials ?? {})) parts.push(`+${n} ${matLabel(k)}`)
  return parts.join(' · ')
}

/** A compact, clickable hero chip for the pickers (portrait, name, class, CP, bond). */
export function HeroChip({
  hero,
  onClick,
  selected,
  tag,
  disabled,
}: {
  hero: OwnedHero
  onClick?: () => void
  selected?: boolean
  tag?: string
  disabled?: boolean
}) {
  return (
    <button className={`hero-chip ${selected ? 'sel' : ''}`} onClick={onClick} disabled={disabled} title={hero.name}>
      <Portrait hero={hero} size="sm" />
      <span className="hc-body">
        <span className="hc-name">
          {hero.name.split(' ')[0]} <span className="hc-star">{hero.star}★</span>
        </span>
        <span className="hc-meta">
          {classGlyph(hero.heroClass)} {ELEMENT_VIS[hero.element].glyph} · {cpOf(hero).toLocaleString()}
          {hero.sanity < 40 && <span className="hc-tired"> · {t('Sanity')} {Math.round(hero.sanity)}</span>}
        </span>
        <BondBadge hero={hero} />
      </span>
      {tag && <span className="hc-tag">{tag}</span>}
    </button>
  )
}
