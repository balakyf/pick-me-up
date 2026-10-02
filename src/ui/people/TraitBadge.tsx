/**
 * A hero's innate trait as a small chip (lane J): the name, a rare trait in gold, and the
 * whole story in the tooltip (the line in their voice, then what it does). `full` writes the
 * effects under the chip (the hero profile, the summon card).
 */
import type { OwnedHero } from '../../engine/types'
import { traitOf, type TraitDef } from '../../engine/content/traits'
import { t } from '../i18n/i18n'
import { traitEffects, traitRarityLabel, traitTooltip } from './traitText'
import './people.css'

export function TraitChip({ def, compact = false, className }: { def: TraitDef; compact?: boolean; className?: string }) {
  return (
    <span className={`trait-chip trait-${def.rarity}${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`} title={traitTooltip(def)}>
      <span className="trait-glyph" aria-hidden>
        {def.rarity === 'rare' ? '✦' : '✧'}
      </span>
      <span className="trait-name">{t(def.name)}</span>
      <span className="sr-only">{` · ${traitRarityLabel(def)}: ${traitEffects(def)}`}</span>
    </span>
  )
}

/** The hero's trait chip (and, with `full`, its line and effects beneath). */
export function TraitBadge({ hero, compact, full = false }: { hero: OwnedHero; compact?: boolean; full?: boolean }) {
  const def = traitOf(hero)
  if (!full) return <TraitChip def={def} compact={compact} />
  return (
    <div className={`trait-block trait-${def.rarity}`}>
      <div className="trait-head">
        <TraitChip def={def} />
        <span className="trait-rarity">{traitRarityLabel(def)}</span>
      </div>
      <div className="trait-blurb">“{t(def.blurb)}”</div>
      <div className="trait-effects">{traitEffects(def)}</div>
    </div>
  )
}
