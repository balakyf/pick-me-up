import { HERALD } from '../../engine/content/story'
import { ALLY_TEMPLATES, ENEMY_TEMPLATES } from '../../engine/content'
import type { GameState } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { allyBustUrl, enemyUrl, iselBustUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'
import { truthStanding } from '../tower/warRoomText'
import { anchorBriefing, type Briefing } from './storyText'
import './story.css'

function faceUrl(face: Briefing['face']): string | null {
  if (!face) return null
  if (face.kind === 'ally') {
    const a = ALLY_TEMPLATES[face.templateId]
    return a ? allyBustUrl(a.name) : null
  }
  const e = ENEMY_TEMPLATES[face.templateId]
  return e ? enemyUrl(e.name, e.element) : null
}

/**
 * The anchor briefing (lane M): before an anchor floor, a small story card in the war room
 * — who is up there, why it matters, and Isel's word. On the ninetieth floor it frames the
 * choice (the mechanics stay the tower's: Enter, or Subvert with enough truths).
 */
export function AnchorBriefing({ state }: { state: GameState }) {
  const floor = state.tower.currentFloor
  const b = anchorBriefing(floor)
  if (!b || floor > TUNING.tower.sliceTopFloor) return null
  const face = faceUrl(b.face)
  const worldEnd = floor === TUNING.tower.worldEndFloor && !state.tower.worldEnded && !state.tower.worldSaved
  const truths = worldEnd ? truthStanding(state) : null
  return (
    <section className={`pframe story-brief ${worldEnd ? 'world' : ''}`} aria-label={t('Briefing')}>
      <div className="story-brief-head">
        <span className="story-brief-kicker">
          {t('Briefing')} · {t('Floor {n}', { n: floor })} · {t(b.mission)}
        </span>
        <b className="story-brief-title">{t(b.title)}</b>
      </div>
      <div className="story-brief-who">
        {face && <img className={`px story-brief-face ${b.face?.kind === 'enemy' ? 'foe' : ''}`} src={face} alt="" />}
        <div>
          <div>{t(b.who)}</div>
          <div className="muted">{t(b.why)}</div>
        </div>
      </div>
      {worldEnd && truths && (
        <div className="story-herald">
          <div className="story-herald-quote">
            “{t(HERALD.herald)}” <span className="muted">— {t('The Herald')}</span>
          </div>
          <div>▸ {t(HERALD.clear)}</div>
          <div className={truths.qualified ? '' : 'muted'}>▸ {truths.qualified || truths.reachable ? t(HERALD.subvert) : t(HERALD.unknowing)}</div>
        </div>
      )}
      <div className="story-brief-isel">
        <img className="px" src={iselBustUrl()} width={24} height={24} alt="" />
        <span>
          <b>{t('Isel')}</b> “{t(b.isel)}”
        </span>
      </div>
    </section>
  )
}
