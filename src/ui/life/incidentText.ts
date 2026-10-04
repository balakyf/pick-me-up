/**
 * The words for a camp incident still waiting on the Master (lane L): what is happening,
 * the two answers, and what each tends to do. Pure; every string goes through t().
 */
import type { CampIncident, GameState, LifePlace } from '../../engine/types'
import { t } from '../i18n/i18n'
import { placeName, shortName } from './speech'

export interface IncidentPrompt {
  text: string
  intervene: string
  let: string
  hint: string
}

export function incidentPrompt(state: GameState, inc: CampIncident): IncidentPrompt {
  const [a, b] = inc.heroIds
  const A = a ? shortName(state, a) : ''
  const B = b ? shortName(state, b) : ''
  switch (inc.kind) {
    case 'brawl':
      return {
        text: t('{a} and {b} are at each other’s throats at the {place}.', { a: A, b: B, place: placeName((inc.detail ?? 'hall') as LifePlace) }),
        intervene: t('Step in'),
        let: t('Let them settle it'),
        hint: t('Stepping in is safe. Left alone, a fight sometimes clears the air — more often it makes things worse.'),
      }
    case 'nightTraining':
      return {
        text: t('{a} has snuck out to the yard to train in the dark.', { a: A }),
        intervene: t('Send them to bed'),
        let: t('Let them train'),
        hint: t('A night of training is worth some XP, but they will be tired tomorrow.'),
      }
    case 'homesick':
      return {
        text: t('{a} is homesick, staring at the crystal that brought them here.', { a: A }),
        intervene: t('Sit with them'),
        let: t('Give them space'),
        hint: t('A little company now steadies them; left alone, they sink a little.'),
      }
    default:
      return { text: t('Something is happening in the camp.'), intervene: t('Step in'), let: t('Let it be'), hint: '' }
  }
}

/** "settles itself in about 3 h" (world hours on the camp's clock). */
export function incidentDeadline(state: GameState, inc: CampIncident): string {
  const slots = Math.max(1, inc.untilSlot - state.life.slot)
  const hours = Math.max(1, Math.round(slots / 2))
  return t('Left alone, it settles itself in about {n} h.', { n: hours })
}
