/**
 * The ribbon over a place the campus has not opened yet (spec 2026-10-12 S3). Locked
 * places are never blocked: their window still opens, as a preview, with this ribbon on
 * top saying what opens it and how close the Master is. Renders nothing for open places.
 */
import type { GameState } from '../../engine/types'
import type { PlaceId } from '../world/lobbyMap'
import { iselBustUrl } from '../pixel/sprites'
import { placeAccess } from './unlocks'
import { t } from '../i18n/i18n'
import './shell.css'

export function PlacePreview({ state, place }: { state: GameState; place: PlaceId }) {
  const access = placeAccess(state, place)
  if (access.open) return null
  const p = access.progress
  return (
    <div className="place-preview" role="note">
      <img className="px place-preview-bust" src={iselBustUrl()} width={32} height={32} alt="" />
      <div>
        <div className="place-preview-title">
          🔒 {t('Preview · {reason}', { reason: access.reason ?? '' })}
          {p && ` (${p.cur}/${p.need})`}
        </div>
        <div className="place-preview-line">{t('Not open yet, Master, but look around all you like.')}</div>
      </div>
    </div>
  )
}
