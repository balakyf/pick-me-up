/**
 * The results screen's words (lane K): the banner, the line under it, the camp a heavy
 * loss opens (recovery reframed as part of the story: a camp on the stair, the wounded
 * tended, the fallen named) and what waits behind it, and the button. PURE.
 */
import type { FloorResult, TowerEvent } from '../../engine/types'
import { t } from '../i18n/i18n'
import type { ResultMood } from './memorialBand'

/** The word on the banner. */
export function bannerWord(result: Pick<FloorResult, 'cleared' | 'result'>): string {
  if (result.cleared) return t('FLOOR CLEARED')
  const o = result.result.outcome
  return o === 'failed' ? t('MISSION FAILED') : o === 'retreat' ? t('RETREATED') : t('DEFEATED')
}

/** The line under the banner (after "Floor N"). */
export function bannerNote(result: Pick<FloorResult, 'cleared' | 'result'>, mood: ResultMood): string | null {
  if (mood === 'bittersweet') return t('the floor is ours — at a cost')
  const o = result.result.outcome
  if (o === 'failed') return t('the escort fell — the floor must be retried')
  if (o === 'retreat') return t('you pulled them out — everyone standing came home')
  return null
}

export interface CampView {
  kind: TowerEvent['kind']
  icon: string
  title: string
  body: string
  /** What waits behind it (B19's queue), in the camp's words. */
  then: string[]
}

/** The event this attempt opened, told as a story beat; null when none. */
export function campView(event: TowerEvent | null, queue: readonly TowerEvent[] | undefined): CampView | null {
  if (!event) return null
  const then = (queue ?? []).map((q) =>
    q.kind === 'tournament'
      ? t('The tournament will wait until the party has recovered.')
      : q.kind === 'bonus'
        ? t('The floor’s reward waits beyond the camp.')
        : t('Another rest waits beyond this one.'),
  )
  if (event.kind === 'recovery') {
    return {
      kind: 'recovery',
      icon: '⛺',
      title: t('Camp on the stair'),
      body: t('The survivors make camp on the stair by floor {n}. Wounds are dressed, and the fallen are named by the fire.', { n: event.floor }),
      then,
    }
  }
  if (event.kind === 'tournament') return { kind: 'tournament', icon: '🏆', title: t('A tournament gathers between the floors.'), body: '', then }
  return { kind: 'bonus', icon: '✦', title: t('An event floor opens before the next climb.'), body: '', then }
}

/** The button that leaves the results. */
export function continueLabel(result: Pick<FloorResult, 'cleared' | 'event'>): string {
  if (result.event?.kind === 'recovery') return t('To the camp ▸')
  return result.cleared ? t('Onward ▸') : t('Regroup')
}
