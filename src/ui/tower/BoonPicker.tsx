/**
 * Boons (spec 2026-10-12 S14, WP4): pick 1 of 3 after an Elite or Boss clear. Built on
 * the Tower's event-panel pattern; the pick resolves the open 'boon' event through
 * RESOLVE_EVENT (the parent dispatches). Held Boons last the current Sortie.
 */
import type { BoonId, GameState } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { t } from '../i18n/i18n'
import { boonIcon, boonText } from './kinds'

/** The Sortie's held Boons as a row of icons (with names on hover). */
export function BoonIcons({ boons }: { boons: readonly BoonId[] }) {
  if (boons.length === 0) return null
  return (
    <span className="boon-icons">
      {boons.map((b) => {
        const { name, description } = boonText(b)
        const label = description ? `${name}: ${description}` : name
        // role="img": a generic span's aria-label is ignored, and the emoji would be read.
        return (
          <span key={b} className="boon-icon" role="img" title={label} aria-label={label}>
            {boonIcon(b)}
          </span>
        )
      })}
    </span>
  )
}

export function BoonPicker({ state, onPick }: { state: GameState; onPick: (id: BoonId) => void }) {
  const ev = state.tower.event
  if (!ev || ev.kind !== 'boon') return null
  const held = state.tower.sortie?.boons ?? []
  const max = TUNING.climb.boons.max
  return (
    <div className="pframe event-panel boon-panel">
      <div className="event-head">
        <span className="event-kind">✦ {t('Boon')}</span>
        <span className="muted">{t('between F{a} and F{b}', { a: ev.floor, b: ev.floor + 1 })}</span>
      </div>
      <p className="muted" style={{ margin: '4px 0 10px' }}>
        {t('The tower rewards the bold. Choose one blessing; it lasts until the party returns to campus.')}
      </p>
      <div className="boon-options">
        {ev.options.map((id) => {
          const { name, description } = boonText(id)
          return (
            <button key={id} className="event-option boon-option" onClick={() => onPick(id)}>
              <span className="boon-glyph" aria-hidden="true">
                {boonIcon(id)}
              </span>
              <span className="eo-name">{name}</span>
              {description && <span className="eo-blurb">{description}</span>}
            </button>
          )
        })}
      </div>
      <div className="muted small boon-held">
        {held.length > 0 ? (
          <>
            {t('Held this sortie ({n}/{max}):', { n: held.length, max })} <BoonIcons boons={held} />
          </>
        ) : (
          t('You can hold up to {max} Boons in a sortie.', { max })
        )}
      </div>
    </div>
  )
}
