/**
 * The words for why a hero stays behind (engine/tower/deploy.ts → DeployReason), for the
 * Enter sheet, the results screen and any picker. Pure; every string goes through t().
 */
import type { DeployReason } from '../engine/types'
import { t } from './i18n/i18n'

/** A short status phrase ("is burnt out and resting"), to follow a hero's name. */
export function deployReasonText(reason: DeployReason | 'empty'): string {
  switch (reason) {
    case 'dead':
      return t('has fallen')
    case 'captive':
      return t('is held captive')
    case 'expedition':
      return t('is away in the Ruins')
    case 'promotion':
      return t('is in the Promotion Chamber')
    case 'training':
      return t('is drilling in the Training Center')
    case 'bounty':
      return t('is out on a bounty')
    case 'burnout':
      return t('is burnt out and resting')
    case 'exhausted':
      return t('has broken down (Sanity 0)')
    case 'rebellion':
      return t('refuses your order (Wary and broken)')
    case 'empty':
      return t('empty slot')
  }
}

/** What would bring the hero back (the fix, not the symptom). */
export function deployReasonFix(reason: DeployReason | 'empty'): string {
  switch (reason) {
    case 'dead':
      return t('Take them off the board.')
    case 'captive':
      return t('Ransom or rescue them.')
    case 'expedition':
      return t('Wait for the expedition to return.')
    case 'promotion':
      return t('Wait for the promotion to finish, or skip it.')
    case 'training':
      return t('Wait for the drill to finish, or skip it.')
    case 'bounty':
      return t('Wait for the bounty to come home.')
    case 'burnout':
      return t('Let them rest.')
    case 'exhausted':
      return t('Let them rest, or hold a banquet.')
    case 'rebellion':
      return t('Win back their trust: rest, gifts, a banquet.')
    case 'empty':
      return t('Put a hero in the slot.')
  }
}
