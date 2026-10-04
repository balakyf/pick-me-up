/**
 * Lane Q: the rival's title card — a guild banner swings in, the rival Master's handle
 * slams down with their guild, floor and rating, then the battle starts. A click, Esc,
 * Space or Enter moves on at once; it moves on by itself after a beat.
 */
import { useEffect, useRef } from 'react'
import { cachedDataUrl } from '../pixel/render'
import { crestBanner } from '../pixel/crests'
import { useReducedMotion } from '../motion'
import { getSettings } from '../qol/settings'
import { t } from '../i18n/i18n'
import { guildLook, type RivalCard } from './pvpModel'

/** How long the card holds at 1× (ms); a faster default battle speed shortens it. */
export const CARD_MS = 2600

const KICKER: Record<RivalCard['kind'], string> = {
  invasion: 'Invasion',
  raid: 'Raid',
  counter: 'Counter-raid',
  war: 'Server war',
  guild: 'Guild raid',
}

export function CrestImg({ guildId, scale = 3, frame = 0 }: { guildId: string | null; scale?: number; frame?: 0 | 1 }) {
  const look = guildLook(guildId)
  const url = cachedDataUrl(`crest|${guildId ?? 'lone'}|${frame}`, () => crestBanner(look, frame))
  if (!url) return <span className="pvp-crest-fallback" aria-hidden="true" />
  return <img className="px pvp-crest" src={url} width={22 * scale} height={32 * scale} alt="" draggable={false} />
}

export function RivalCardView({ card, onDone }: { card: RivalCard; onDone: () => void }) {
  const reduced = useReducedMotion()
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const speed = Math.max(1, getSettings().battleSpeed)
    const id = setTimeout(() => done.current(), Math.round(CARD_MS / speed))
    const onKey = (e: KeyboardEvent) => {
      // A modal card: it listens first and keeps every key from the windows underneath.
      e.stopPropagation()
      if (e.repeat) return
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        done.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(id)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])
  const look = guildLook(card.guildId)
  const facts = [
    card.guildName ? t('of {guild}', { guild: t(card.guildName) }) : t('no guild'),
    card.floor !== null ? t('F{n}', { n: card.floor }) : null,
    card.rating !== null ? t('rating {n}', { n: card.rating.toLocaleString() }) : null,
  ].filter(Boolean)
  return (
    <div
      className={`overlay pvp-card-overlay ${reduced ? 'calm' : ''} kind-${card.kind}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('{kicker}: {name}', { kicker: t(KICKER[card.kind]), name: card.name })}
      onClick={() => done.current()}
      style={{ ['--g-d' as string]: look.cloth[0], ['--g-m' as string]: look.cloth[1], ['--g-l' as string]: look.cloth[2], ['--g-ink' as string]: look.ink }}
    >
      <div className="pvp-card">
        <div className="pvp-card-crest">
          <CrestImg guildId={card.guildId} scale={4} frame={0} />
          <span className="pvp-crest-alt">
            <CrestImg guildId={card.guildId} scale={4} frame={1} />
          </span>
        </div>
        <div className="pvp-card-text">
          <div className="pvp-kicker">{t(KICKER[card.kind])}</div>
          <div className="pvp-name">{card.name}</div>
          <div className="pvp-facts">
            {facts.join(' · ')}
            {card.whale && <b className="pvp-whale"> {t('WHALE')}</b>}
          </div>
          <div className="pvp-line">{t(card.line, card.vars)}</div>
        </div>
        <button type="button" className="pbtn sm ghost pvp-card-skip" onClick={(e) => (e.stopPropagation(), done.current())}>
          {t('Skip')} ▸
        </button>
      </div>
    </div>
  )
}
