/**
 * How the welcome-back ledger reads and where each line travels (spec 2026-10-12 S26).
 * Presentation only: turns the engine's AwayVignettes into translated lines, an icon and
 * the lobby place a tap opens.
 */
import type { AwayVignette } from '../../engine/return'
import type { ChronicleEntry, FacilityId, GameState, JobId } from '../../engine/types'
import { JOB_FACILITY } from '../../engine/life'
import { chronicleLine, shortName } from '../life/speech'
import type { PlaceId } from '../world/lobbyMap'
import { facilityPlace } from './lightsOut'
import { t } from '../i18n/i18n'

export function vignetteText(state: GameState, v: AwayVignette): string {
  const a = v.heroIds[0] ? shortName(state, v.heroIds[0]) : ''
  if (v.kind === 'levelUp') {
    const [who, n] = (v.detail ?? 'master:1').split(':')
    return who === 'master' ? t('You reached Master Lv {n}.', { n: n ?? '?' }) : t('{a} grew stronger: now Lv {n}.', { a, n: n ?? '?' })
  }
  if (v.kind === 'completion') {
    const gems = Number((v.detail ?? 'expedition:0').split(':')[1] ?? 0)
    return gems > 0 ? t('{a} came home from the Ruins with {n} gems.', { a, n: gems }) : t('{a} came home from the Ruins.', { a })
  }
  const entry: ChronicleEntry = { at: v.at, kind: v.kind, heroIds: v.heroIds, ...(v.detail !== undefined ? { detail: v.detail } : {}), ...(v.floor !== undefined ? { floor: v.floor } : {}) }
  return chronicleLine(state, entry)
}

export const VIGNETTE_ICON: Record<AwayVignette['kind'], string> = {
  death: '☠',
  revenge: '⚔',
  bequest: '✧',
  closeFriends: '♥',
  friends: '♥',
  arrival: '✦',
  masterwork: '⚒',
  forged: '⚒',
  levelUp: '▲',
  completion: '⟡',
  jobTier: '★',
  mourning: '✿',
  research: '📚',
  grudge: '⚡',
  rivals: '⚡',
  argument: '💢',
  stalled: '⚒',
}

/** Where tapping the line takes the Master. */
export function vignettePlace(v: AwayVignette): PlaceId {
  switch (v.kind) {
    case 'death':
    case 'revenge':
    case 'bequest':
    case 'mourning':
      return 'memorial'
    case 'friends':
    case 'closeFriends':
    case 'grudge':
    case 'rivals':
    case 'argument':
      return 'tavern'
    case 'arrival':
      return 'roster'
    case 'forged':
    case 'masterwork':
    case 'stalled':
      return 'armory'
    case 'research':
      return 'library'
    case 'jobTier': {
      const job = (v.detail ?? 'cook').split(':')[0] as JobId
      const fid: FacilityId | undefined = JOB_FACILITY[job]
      return fid ? facilityPlace(fid) : 'roster'
    }
    case 'levelUp':
      return (v.detail ?? '').startsWith('master') ? 'tower' : 'roster'
    case 'completion':
      return 'rift'
  }
}
