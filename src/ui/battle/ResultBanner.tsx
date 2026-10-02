import type { CombatLog, CombatUnitInit } from '../../engine/types'
import { t } from '../i18n/i18n'

/** The word that lands on the stage when the replay ends. */
export function ResultBanner({ outcome, nonLethal = false }: { outcome: CombatLog['outcome']; nonLethal?: boolean }) {
  // A trial is only an echo: it ends, nobody is defeated and nobody dies.
  if (nonLethal) {
    return (
      <div className={`battle-banner ${outcome === 'win' ? 'win' : 'trial-end'}`}>
        {outcome === 'win' ? t('TRIAL CLEARED') : t('TRIAL ENDED')}
        <span className="banner-sub">{t('Nobody dies here.')}</span>
      </div>
    )
  }
  return (
    <div className={`battle-banner ${outcome === 'win' ? 'win' : 'lose'}`}>
      {outcome === 'win'
        ? t('VICTORY')
        : outcome === 'wipe'
          ? t('DEFEAT')
          : outcome === 'failed'
            ? t('MISSION FAILED')
            : outcome === 'retreat'
              ? t('RETREAT')
              : t('TIME UP')}
    </div>
  )
}

/** The death moment's frame: the vignette and the cinema bars. */
export function DeathVeil() {
  return (
    <>
      <div className="death-vignette" />
      <div className="cine-bar top" />
      <div className="cine-bar bottom" />
    </>
  )
}

/** The fallen hero's card: their bust and last words, fading once the scene moves on. */
export function DeathCard({ unit, words, fading, bust }: { unit: CombatUnitInit; words: string; fading: boolean; bust: string }) {
  return (
    <div className={`death-card ${fading ? 'fading' : ''}`}>
      <img className="px" src={bust} width={48} height={48} alt="" />
      <div>
        <div className="death-name">{unit.name}</div>
        <div className="death-words">“{words || '…'}”</div>
      </div>
    </div>
  )
}
