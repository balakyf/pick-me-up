/** Words for what the Codex knows: enemy families and keyword traits. */
import type { EnemyFamily, KeywordTag } from '../../engine/types'
import { ELEMENT_VIS } from '../bits'
import { t } from '../i18n/i18n'

const FAMILY: Record<EnemyFamily, string> = {
  dragon: 'Dragon',
  undead: 'Undead',
  beast: 'Beast',
  humanoid: 'Humanoid',
  construct: 'Construct',
  aquatic: 'Aquatic',
  demon: 'Demon',
  fragment: 'Fragment',
}

export function familyLabel(f: EnemyFamily | undefined): string {
  return f ? t(FAMILY[f]) : t('Unknown kind')
}

/** One keyword as a short phrase (the scouting report's wording where it exists). */
export function keywordText(k: KeywordTag): string {
  switch (k.kind) {
    case 'immune':
      return t('immune to {what}', { what: t(k.damageType) })
    case 'resist':
      return t('resists {what}', { what: t(k.damageType) })
    case 'guard':
      return k.vs === undefined
        ? t('armoured: −{n}% damage taken', { n: Math.round(k.reduction * 100) })
        : k.vs === 'ranged'
          ? t('shrugs off ranged blows: −{n}%', { n: Math.round(k.reduction * 100) })
          : t('resists {what}', { what: t(ELEMENT_VIS[k.vs].label) })
    case 'vulnerable':
      return t('weak to {what}', { what: t(ELEMENT_VIS[k.element].label) })
    case 'looming':
      return t('too strong to fight — finish first')
    case 'phased':
      return t('shielded until its guard falls')
    case 'enrage':
      return t('enrages after {n} ticks', { n: k.afterTick })
    case 'aegis':
      return t('shrugs off the first {n} hits', { n: k.charges })
    case 'frenzy':
      return t('frenzied below {n}% HP', { n: k.belowHpPct })
    case 'opener':
      return t('its first strike lands hard')
    case 'lifesteal':
      return t('drinks the blood it spills')
    case 'bane':
      return t('slayer of the {what}', { what: familyLabel(k.family) })
  }
}
