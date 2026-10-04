/**
 * The filler floor's briefing (lane P): the anchors have lane M's story card; the floors
 * between them now have one too — the mission, what wins it, what loses it, and a line of the
 * act's story. It sits where the anchor briefing does, above the forecast.
 */
import type { Encounter, GameState } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { allyBustUrl, iselBustUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'
import { missionIcon } from './floorNames'
import { fillerBrief } from './missionBrief'
import '../story/story.css'
import './missions.css'

export function FillerBriefing({ state, encounter, names }: { state: GameState; encounter: Encounter | null; names: Record<string, string> }) {
  const floor = state.tower.currentFloor
  if (floor > TUNING.tower.sliceTopFloor) return null
  const b = fillerBrief(state, floor, encounter, names)
  if (b === null) return null
  const escort = encounter?.allies?.[0]
  return (
    <section className="pframe story-brief mission-brief" aria-label={t('Briefing')} data-mission={b.kind ?? 'legacy'}>
      <div className="story-brief-head">
        <span className="story-brief-kicker">
          {t('Briefing')} · {t('Floor {n}', { n: floor })} · {missionIcon(encounter?.mission.type ?? '')} {b.mission}
        </span>
        <b className="story-brief-title">{b.title}</b>
      </div>
      {(b.why || b.flavour) && (
        <div className="story-brief-who">
          {escort && <img className="px story-brief-face" src={allyBustUrl(escort.name)} alt="" />}
          <div>
            {b.why && <div>{b.why}</div>}
            {b.flavour && <div className="muted mission-flavour">{b.flavour}</div>}
          </div>
        </div>
      )}
      <div className="mission-terms">
        <div className="mission-wins">
          <span className="mission-term">{t('To win')}</span>
          {b.objectives.map((line) => (
            <div key={line}>✓ {line}</div>
          ))}
        </div>
        <div className="mission-fails">
          <span className="mission-term">{t('Lost if')}</span>
          {b.fails.map((line) => (
            <div key={line}>✗ {line}</div>
          ))}
        </div>
      </div>
      {b.isel && (
        <div className="story-brief-isel">
          <img className="px" src={iselBustUrl()} width={24} height={24} alt="" />
          <span>
            <b>{t('Isel')}</b> “{b.isel}”
          </span>
        </div>
      )}
    </section>
  )
}
