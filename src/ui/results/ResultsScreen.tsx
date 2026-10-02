import type { GameState, OwnedHero, FloorResult } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { HIDDEN_OBJECTIVES } from '../../engine/content'
import { t } from '../i18n/i18n'
import { skillProgressLine } from './skillProgress'
import { fmtInt } from '../text'

// ── Results ──────────────────────────────────────────────────────────────────
export function ResultsScreen({
  result,
  state,
  onContinue,
}: {
  result: FloorResult
  state: GameState
  onContinue: () => void
}) {
  const win = result.cleared
  const failed = result.result.outcome === 'failed'
  const retreated = result.result.outcome === 'retreat'
  const fallen = result.fallenHeroIds.map((id) => state.heroes[id]).filter(Boolean) as OwnedHero[]
  return (
    <div className="overlay">
      <div className="result-card">
        <div className={`big-outcome ${win ? 'win' : 'lose'}`}>{win ? t('FLOOR CLEARED') : failed ? t('MISSION FAILED') : retreated ? t('RETREATED') : t('DEFEATED')}</div>
        <div className="muted">
          {t('Floor {floor}', { floor: result.floor })}
          {result.firstClear && win ? ' · ' + t('first clear bonus!') : ''}
          {failed ? ' · ' + t('the escort fell — the floor must be retried') : ''}
          {retreated ? ' · ' + t('you pulled them out — everyone standing came home') : ''}
        </div>

        <div className="reward-row">
          <div className="r">
            <div className="n" style={{ color: 'var(--gold)' }}>+{fmtInt(result.goldAwarded)}</div>
            <div className="l">{t('Gold')}</div>
          </div>
          <div className="r">
            <div className="n" style={{ color: 'var(--accent-2)' }}>+{fmtInt(result.xpAwarded)}</div>
            <div className="l">{t('XP each')}</div>
          </div>
        </div>

        {result.skillProgress.length > 0 && (
          <div className="skill-progress">
            {result.skillProgress.map((p, i) => (
              <div key={i} className={`sp-row ${p.kind}`}>{skillProgressLine(p, state)}</div>
            ))}
          </div>
        )}

        {result.hiddenFound.length > 0 && (
          <div className="skill-progress">
            {result.hiddenFound.map((id) => {
              const h = HIDDEN_OBJECTIVES.find((x) => x.id === id)
              return (
                <div key={id} className="sp-row achievement">
                  ✧ {t('Hidden objective:')} {t(h?.name ?? id)}
                  {h?.reward.gems ? ` · ${t('+{n} gems', { n: h.reward.gems })}` : ''}
                </div>
              )
            })}
          </div>
        )}

        {result.refusedHeroIds.length > 0 && (
          <div className="fallen">
            <div className="ft">{t('✋ Refused to fight')}</div>
            {result.refusedHeroIds.map((id) => (
              <div key={id}>
                {state.heroes[id]?.name ?? id} <span className="muted">{t('(Wary and broken — win back their trust)')}</span>
              </div>
            ))}
          </div>
        )}

        {result.worldSaved && (
          <div className="world-ended pframe" style={{ borderColor: 'var(--good)', color: '#c8f0d0' }}>
            {t('You refused the win condition. The Herald falls, and the world beneath the tower is still there.')}
          </div>
        )}

        {result.worldEnded && (
          <div className="world-ended pframe">
            {t('The ninetieth floor falls — and with it, the world beneath the tower. No one on its surface survives.')}
          </div>
        )}

        {result.loopRollback && (
          <div className="fallen">
            <div className="ft">{t('↺ The loop resets')}</div>
            <div>{t('The gate held. The waiting room drops back to floor {fallbackTo}.', { fallbackTo: TUNING.tower.loop.fallbackTo })}</div>
          </div>
        )}

        {result.event && (
          <div className="muted" style={{ marginBottom: 10 }}>
            {result.event.kind === 'tournament'
              ? t('🏆 A tournament gathers between the floors.')
              : result.event.kind === 'recovery'
                ? t('✚ The tower offers a recovery floor.')
                : t('✦ An event floor opens before the next climb.')}
          </div>
        )}

        {fallen.length > 0 && (
          <div className="fallen">
            <div className="ft">{t('☠ Permanently lost')}</div>
            {fallen.map((h) => (
              <div key={h.id}>
                {h.name} <span className="muted">{t('({star}★ Lv{level})', { star: h.star, level: h.xp.level })}</span>
              </div>
            ))}
          </div>
        )}

        <button className="btn primary big" onClick={onContinue} style={{ marginTop: 8 }}>
          {win ? t('Onward ▸') : t('Regroup')}
        </button>
      </div>
    </div>
  )
}
