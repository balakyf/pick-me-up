/**
 * Doors (spec 2026-10-12 S13, WP4): after a clear the next floor offers two Doors, each
 * with a kind icon, a reward icon and a one-line scout preview. Choosing dispatches
 * CHOOSE_DOOR (the parent does that). Isel explains the Skull door the first time.
 *
 * Smoke-test hygiene: no door button contains "Enter" or "Treasure" (the Cache door is
 * labelled "Cache").
 */
import { useMemo } from 'react'
import type { Door, GameState } from '../../engine/types'
import { scoutFloor, type ScoutReport } from '../../engine/scout'
import { t } from '../i18n/i18n'
import { iselCoach } from '../world/lines'
import { iselBustUrl } from '../pixel/sprites'
import { DOOR_TITLE, KIND_ICON, REWARD_ICON, REWARD_LABEL, doorBlurb, isFightKind, worldMultOf } from './kinds'
import { THREAT_COLOR, THREAT_LABEL } from './ScoutCard'

/** GUIDE_STEP recorded once Isel has explained the Skull door. */
export const DOORS_GUIDE_STEP = 'doors'

/** Scout the current floor as if `door` were chosen (a pure read; null when it can't be scouted). */
export function previewDoor(state: GameState, door: Door): ScoutReport | null {
  if (!isFightKind(door.kind)) return null
  try {
    return scoutFloor({ ...state, tower: { ...state.tower, kind: door.kind, doors: null } })
  } catch {
    return null
  }
}

export function DoorPicker({
  state,
  onChoose,
  onSeenGuide,
  compact = false,
}: {
  state: GameState
  onChoose: (index: number) => void
  /** Isel's Skull-door explanation was acknowledged. */
  onSeenGuide?: () => void
  /** Inside the results card: no frame, tighter cards. */
  compact?: boolean
}) {
  const doors = state.tower.doors ?? []
  const floor = state.tower.currentFloor
  const previews = useMemo(() => doors.map((d) => previewDoor(state, d)), [state, doors])
  if (doors.length === 0) return null
  const explain = !state.life.guide.done.includes(DOORS_GUIDE_STEP) && doors.some((d) => d.kind === 'elite')
  return (
    <div className={`door-picker ${compact ? 'compact' : 'pframe'}`} role="group" aria-label={t('Choose the next door')}>
      <div className="event-head">
        <span className="event-kind">{t('Choose the next door')}</span>
        <span className="muted">{t('Floor {n}', { n: floor })}</span>
      </div>
      {explain && (
        <div className="isel-tip">
          <img className="px" src={iselBustUrl()} width={32} height={32} alt="" />
          <div className="isel-tip-body">
            <b>Isel</b>
            <span>
              {iselCoach('doors')}
            </span>
            {onSeenGuide && (
              <button className="pbtn sm ghost" onClick={onSeenGuide}>
                {t('Got it')}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="door-row">
        {doors.map((d, i) => {
          const p = previews[i]
          return (
            <button key={`${i}|${d.kind}`} className={`door-card door-${d.kind}`} onClick={() => onChoose(i)}>
              <span className="door-arch" aria-hidden="true">
                {KIND_ICON[d.kind]}
              </span>
              <span className="door-title">{t(DOOR_TITLE[d.kind])}</span>
              <span className="door-reward" title={t(REWARD_LABEL[d.reward])}>
                {REWARD_ICON[d.reward]} {t(REWARD_LABEL[d.reward])}
              </span>
              <span className="door-blurb">{doorBlurb(d, floor, worldMultOf(state))}</span>
              {p ? (
                <span className="door-scout">
                  <span style={{ color: THREAT_COLOR[p.threat] }}>{t(THREAT_LABEL[p.threat])}</span>
                  <span className="muted"> · {t('party ×{r}', { r: p.ratio.toFixed(1) })}</span>
                  {p.nemesis && <span className="door-nemesis"> · ☠ {p.nemesis}</span>}
                </span>
              ) : (
                <span className="door-scout door-safe">✓ {t('No fight on this floor.')}</span>
              )}
            </button>
          )
        })}
      </div>
      {!compact && (
        <div className="muted small door-default">
          {t('No choice made? The party takes the {door}.', { door: t(DOOR_TITLE[doors[0]!.kind]) })}
        </div>
      )}
    </div>
  )
}
