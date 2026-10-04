import type { GameState } from '../../engine/types'
import { ENDGAME, fateOf } from '../../engine/endgame'
import { TUNING } from '../../engine/tuning'
import { iselBustUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'
import { truthStanding } from '../tower/warRoomText'
import { cycleLine, fateConsequences, postWallBriefing } from './endingText'
import { openEnding } from './endingBus'
import './ending.css'
import '../story/story.css'

/**
 * The endgame in the war room (lane O), one line among the command panel's banners:
 *  - the world's fate and what it changed (after F90), with the epilogue to replay;
 *  - the cycle (a New Cycle's world is harder);
 *  - on F81–89, the floor's briefing (like an anchor's: who, why, Isel's word);
 *  - on F90 before the choice, what each way through will leave behind.
 */
export function EndgameBriefing({ state }: { state: GameState }) {
  const floor = state.tower.currentFloor
  const fate = fateConsequences(state)
  const cycle = cycleLine(state)
  const b = floor <= TUNING.tower.sliceTopFloor ? postWallBriefing(floor) : null
  const atChoice = floor === TUNING.tower.worldEndFloor && fateOf(state) === null
  if (!fate && !cycle && !b && !atChoice) return null
  return (
    <>
      {cycle && <div className="endgame-cycle">✦ {cycle}</div>}
      {fate && (
        <div className={`pframe endgame-fate ${fateOf(state)}`}>
          <div>
            <b>{fate.title}</b>
            <button type="button" className="pbtn sm ghost endgame-replay" onClick={() => openEnding({ start: 'epilogue' })}>
              {t('Epilogue ▸')}
            </button>
          </div>
          <ul>
            {fate.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {atChoice && <ChoiceStakes state={state} />}
      {b && (
        <section className="pframe story-brief" aria-label={t('Briefing')}>
          <div className="story-brief-head">
            <span className="story-brief-kicker">
              {t('Briefing')} · {t('Floor {n}', { n: floor })} · {t(b.mission)}
            </span>
            <b className="story-brief-title">{t(b.title)}</b>
          </div>
          <div className="story-brief-who">
            <div>
              <div>{t(b.who)}</div>
              <div className="muted">{t(b.why)}</div>
            </div>
          </div>
          <div className="story-brief-isel">
            <img className="px" src={iselBustUrl()} width={24} height={24} alt="" />
            <span>
              <b>{t('Isel')}</b> “{t(b.isel)}”
            </span>
          </div>
        </section>
      )}
    </>
  )
}

/** What the ninetieth floor's two ways leave behind (a real decision: both have a price). */
function ChoiceStakes({ state }: { state: GameState }) {
  const F = ENDGAME.fate
  const truths = truthStanding(state)
  return (
    <div className="pframe endgame-fate">
      <b>{t('What each way leaves behind')}</b>
      <ul>
        <li>
          {t('Clear: the world ends. Past ninety the void is sated (foes at {pct}%), but the floors pay {gold}% of their gold and the waiting room goes grey.', {
            pct: Math.round(F.endedPowerMult * 100),
            gold: Math.round(F.endedGoldMult * 100),
          })}
        </li>
        <li className={truths.qualified ? '' : 'muted'}>
          {t('Subvert: the world lives and sends a tribute ({gems} 💎). The floors past ninety stay as hard as they were written.', {
            gems: F.savedTribute.gems,
          })}
          {!truths.qualified && ` ${t('(You know {n} of {k} truths: relive the floors where you missed them.)', { n: truths.found, k: truths.need })}`}
        </li>
      </ul>
    </div>
  )
}
