/**
 * The Sortie bar (spec 2026-10-12 S15, WP4): push your luck, or bank it. Shows the
 * floors in the streak, the at-risk purse, what the next clear adds, the held Boons and
 * a "Return to campus" button (the parent dispatches RETURN_TO_CAMPUS).
 */
import type { Sortie } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { t } from '../i18n/i18n'
import { BoonIcons } from './BoonPicker'
import { streakPct } from './rewards'

export function SortieBar({ sortie, onReturn, disabled = false }: { sortie: Sortie; onReturn: () => void; disabled?: boolean }) {
  const next = Math.round(streakPct(sortie.floors + 1) * 100)
  const keep = Math.round(TUNING.climb.sortie.keepOnRout * 100)
  return (
    <div className="pframe sortie-bar" role="status">
      <div className="sortie-main">
        <span className="sortie-title">⚑ {t('Sortie')}</span>
        <span className="sortie-stat">
          {sortie.floors === 1 ? t('1 floor') : t('{n} floors', { n: sortie.floors })}
        </span>
        <span className="sortie-purse coin gold" title={t('A rout or wipe keeps only {p}% of the purse.', { p: keep })}>
          ◆ {sortie.purse.toLocaleString()} <span className="muted small">{t('at risk')}</span>
        </span>
        <span className="sortie-stat muted small">{t('next clear +{p}% gold', { p: next })}</span>
        <BoonIcons boons={sortie.boons} />
        <span className="spacer" />
        <button className="pbtn sm" onClick={onReturn} disabled={disabled}>
          ⌂ {t('Return to campus (bank +{n})', { n: sortie.purse.toLocaleString() })}
        </button>
      </div>
      <div className="muted small">
        {t('Press on and the purse grows. A rout or wipe keeps only {p}% of it.', { p: keep })} {t('Leaving the tower banks it.')}
      </div>
    </div>
  )
}
