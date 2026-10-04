import { useEffect, useRef } from 'react'
import type { ActDef } from '../../engine/content/acts'
import type { ActStory } from '../../engine/content/story'
import { drawBattleBg, bgTheme } from '../pixel/battleBg'
import { cachedDataUrl } from '../pixel/render'
import { iselBustUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'
import { actNumeral } from './storyText'
import './story.css'

/** How long an act card holds the screen before it lifts on its own (ms). */
export const ACT_CARD_MS = 6500

/** The act's backdrop (its first floor's battle background, drawn once and cached). */
export function actBackdropUrl(act: Pick<ActDef, 'from'>): string {
  return cachedDataUrl(`actcard|${bgTheme(act.from)}`, () => drawBattleBg(act.from))
}

/**
 * An act's title card (lane M): the first time the Master stands in a new act, its name,
 * a one-line epigraph and Isel's word over the act's own backdrop. A chapter title, not a
 * question: it lifts on its own after ACT_CARD_MS, a click or Esc lifts it sooner, and the
 * hotkeys keep working under it (it is not a dialog). Once per save: the caller latches it
 * when it shows.
 */
export function ActCard({ act, story, calm, onClose }: { act: ActDef; story: ActStory; calm: boolean; onClose: () => void }) {
  // (The host re-renders often — the forecast — so the timer reads the latest onClose.)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const tm = setTimeout(() => close.current(), ACT_CARD_MS)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(tm)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])
  const bg = actBackdropUrl(act)
  return (
    <div className={`story-act ${calm ? 'calm' : ''}`} onClick={onClose} role="status" aria-live="polite">
      <div className="story-act-card" style={{ ['--act-ms' as string]: `${ACT_CARD_MS}ms` }}>
        <div className="story-act-bg px" style={bg ? { backgroundImage: `url(${bg})` } : undefined} aria-hidden="true" />
        <div className="story-act-body">
          <div className="story-act-kicker">
            {t('Act {n}', { n: actNumeral(act) })} · {t('Floors {a}–{b}', { a: act.from, b: act.to })}
          </div>
          <h2 className="story-act-name">{t(story.name)}</h2>
          <p className="story-act-epigraph">{t(story.epigraph)}</p>
          <div className="story-act-isel">
            <img className="px" src={iselBustUrl()} width={32} height={32} alt="" />
            <span>
              <b>{t('Isel')}</b> “{t(story.isel)}”
            </span>
          </div>
          <button type="button" className="pbtn sm story-act-go">
            {t('Climb ▸')}
          </button>
        </div>
        <div className="story-act-timer" aria-hidden="true" />
      </div>
    </div>
  )
}
