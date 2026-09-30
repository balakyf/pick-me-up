/** Player-facing names, icons and one-line rules for the floor modifiers. */
import type { FloorModifierId } from '../../engine/types'
import { DEPTH } from '../../engine/depth'
import { t } from '../i18n/i18n'

const M = DEPTH.mods
const pct = (x: number) => Math.round(x * 100)

export const MODIFIER_ICON: Record<FloorModifierId, string> = {
  fog: '🌫',
  bloodMoon: '🌕',
  holyGround: '✚',
  miasma: '☠',
  gale: '🌪',
  frost: '❄',
}

const NAME: Record<FloorModifierId, string> = {
  fog: 'Fog',
  bloodMoon: 'Blood Moon',
  holyGround: 'Holy Ground',
  miasma: 'Miasma',
  gale: 'Gale',
  frost: 'Frost',
}

export function modifierName(m: FloorModifierId): string {
  return `${MODIFIER_ICON[m]} ${t(NAME[m])}`
}

export function modifierRule(m: FloorModifierId): string {
  switch (m) {
    case 'fog':
      return t('Every blow has a {n}% chance to miss — both sides.', { n: pct(M.fogMiss) })
    case 'bloodMoon':
      return t('Enemies deal +{n}% damage and enrage sooner.', { n: pct(M.bloodMoonDamage) })
    case 'holyGround':
      return t('Light strikes +{n}%, dark strikes −{n}%.', { n: pct(M.holyGround) })
    case 'miasma':
      return t('All healing is halved.')
    case 'gale':
      return t('Everyone acts {n}% faster.', { n: pct(M.galeSpeed - 1) })
    case 'frost':
      return t('Fire strikes −{n}%, water strikes +{n}%.', { n: pct(M.frost) })
  }
}
