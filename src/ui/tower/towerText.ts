/**
 * Small pure pieces of the Tower screen's wording: where an event floor sits, and why
 * Enter is disabled (so a greyed-out button always explains itself).
 */
import type { GameState, TowerEvent } from '../../engine/types'
import { t } from '../i18n/i18n'

/**
 * Where an event floor sits. A bonus or tournament comes after a clear, so it stands
 * between that floor and the next; a recovery may follow a floor that was lost, and then
 * it stands before the retry.
 */
export function eventWhere(ev: Pick<TowerEvent, 'floor'>, currentFloor: number): string {
  return currentFloor > ev.floor
    ? t('between F{a} and F{b}', { a: ev.floor, b: ev.floor + 1 })
    : t('before you try F{n} again', { n: ev.floor })
}

export type EnterBlock = 'event' | 'party' | null

/** Why the Tower's Enter is disabled, if it is. */
export function enterBlock(state: Pick<GameState, 'tower'>, deployable: boolean): EnterBlock {
  if (state.tower.event !== null) return 'event'
  if (!deployable) return 'party'
  return null
}

/** The visible line (and tooltip) for a disabled Enter. */
export function enterBlockText(block: EnterBlock): string {
  switch (block) {
    case 'event':
      return t('An event floor is waiting above: choose one of its options first.')
    case 'party':
      return t('No one in your party can fight right now. Set the Party Board (heroes in training or broken down sit out).')
    default:
      return ''
  }
}
