/**
 * The story's small notes in other screens (lane M): the letter from Priasis folded into
 * Isel's letter, an anchor's aftermath under the results banner, and the Herald's word on
 * the ninetieth floor's Enter sheet. Each is one line or a few, mounted by its host screen.
 */
import { ANCHOR_STORY, HERALD } from '../../engine/content/story'
import type { FloorResult, GameState } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { allyBustUrl, iselBustUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'
import { priasisUnread } from './storyText'
import './story.css'

/** The newest letter of the Priasis arc, while the Master has not read it (Isel's letter). */
export function PriasisLetter({ state }: { state: GameState }) {
  const beat = priasisUnread(state)
  if (!beat?.letter) return null
  const fromPriasis = beat.letter.from === 'priasis'
  return (
    <div className="story-letter">
      <div className="story-letter-head">
        <img className="px" src={fromPriasis ? allyBustUrl('Princess Priasis') : iselBustUrl()} width={28} height={28} alt="" />
        <b>{fromPriasis ? t('A letter sealed with the Al Ragna crest') : t('About Priasis')}</b>
      </div>
      {beat.letter.lines.map((l, i) => (
        <p key={i}>{t(l)}</p>
      ))}
      {fromPriasis && <p className="story-letter-sign">— {t('Priasis Al Ragna')}</p>}
    </div>
  )
}

/** The aftermath line of a cleared anchor (the ninetieth floor says what the choice did). */
export function aftermathLine(result: Pick<FloorResult, 'floor' | 'cleared' | 'worldEnded' | 'worldSaved'>): string | null {
  if (!result.cleared) return null
  if (result.floor === TUNING.tower.worldEndFloor) {
    if (result.worldSaved) return t(HERALD.saved)
    if (result.worldEnded) return t(HERALD.ended)
  }
  const s = ANCHOR_STORY[result.floor]
  return s ? t(s.aftermath) : null
}

export function StoryAftermath({ result }: { result: FloorResult }) {
  const line = aftermathLine(result)
  return line ? <div className="rc-story story-aftermath">{line}</div> : null
}

/** The Herald's word on the ninetieth floor's Enter sheet. */
export function HeraldWord() {
  return (
    <p className="story-herald-quote">
      “{t(HERALD.herald)}” <span className="muted">— {t('The Herald')}</span>
    </p>
  )
}
