import type { GameState } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { stampCard } from '../../engine/return'
import { t } from '../i18n/i18n'
import './return.css'

const ST = TUNING.return.stamps

/**
 * The login stamp card (spec 2026-10-12 S28): ten circles, never reset. `fresh` animates
 * the newest stamp; a card that just filled shows its payout instead of an empty card.
 */
export function StampCard({
  state,
  fresh = false,
  justCompleted = false,
  newcomer = null,
}: {
  state: GameState
  fresh?: boolean
  justCompleted?: boolean
  /** The hero the completed card's free summon brought (shown by name). */
  newcomer?: string | null
}) {
  const card = stampCard(state)
  const shown = justCompleted ? card.perCard : card.onCard
  return (
    <div className="stamp-card" aria-label={t('Stamp card: {n} of {of}', { n: shown, of: card.perCard })}>
      <div className="stamp-row">
        {Array.from({ length: card.perCard }, (_, i) => {
          const on = i < shown
          const last = i === card.perCard - 1
          const cls = ['stamp', on ? 'on' : '', last ? 'prize' : '', fresh && on && i === shown - 1 ? 'fresh' : ''].filter(Boolean).join(' ')
          return (
            <span key={i} className={cls} aria-hidden="true">
              {on ? '✦' : last ? '♦' : ''}
            </span>
          )
        })}
      </div>
      <div className="stamp-note muted">
        {justCompleted && newcomer
          ? t('Card complete! +{gems} ♦, and {name} answered the free summon. A fresh card begins.', { gems: ST.cardGems, name: newcomer })
          : justCompleted
          ? t('Card complete! +{gems} ♦ and a free summon. A fresh card begins.', { gems: ST.cardGems })
          : t('{n}/{of} · every {of}th stamp: +{gems} ♦ and a free summon. Missed days never cost a stamp.', { n: card.onCard, of: card.perCard, gems: ST.cardGems })}
      </div>
    </div>
  )
}

/** The newest hero a claim brought (the card's free summon), by short name, or null. */
export function newcomerName(before: GameState | null, after: GameState | null): string | null {
  if (!before || !after) return null
  const id = Object.keys(after.heroes).find((k) => !(k in before.heroes))
  const h = id ? after.heroes[id as keyof typeof after.heroes] : undefined
  return h ? (h.name.split(/\s+/)[0] ?? h.name) : null
}
