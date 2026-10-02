import { t } from '../i18n/i18n'
import { hpColor } from '../bits'
import type { BossBarView } from './bossBar'
import './bossShow.css'

/**
 * The boss's bar at the top of the stage (lane I): its name and epithet, its level, the HP
 * with a ghost that drains after each blow (like lane E's HpBar), a notch at every phase
 * lane G authored (lit once passed), a pip per aegis charge, and the clock that matters — an
 * enrage coming, or the mission's deadline. `docked` (a phone) folds it to two thin lines.
 */
export function BossBar({ view, docked = false }: { view: BossBarView; docked?: boolean }) {
  const pct = Math.max(0, Math.min(100, view.hpPct))
  const w = `${pct}%`
  const shown = Math.ceil(pct)
  return (
    <div
      className={`boss-bar pframe ${docked ? 'docked' : ''} ${view.dead ? 'down' : ''} ${view.enraged !== null ? 'enraged' : ''}`}
      style={{ ['--boss-color' as string]: view.color }}
      role="status"
      aria-label={t('{name}: {pct}% HP', { name: view.name, pct: shown })}
    >
      <div className="bb-head">
        <span className="bb-name">{view.name}</span>
        {!docked && <span className="bb-epithet">{view.epithet}</span>}
        <span className="bb-level">{t('Lv {n}', { n: view.level })}</span>
        {view.aegis > 0 && (
          <span className="bb-aegis" title={t('Aegis: the next {n} blows are turned aside', { n: view.aegis })}>
            {Array.from({ length: Math.min(view.aegis, 6) }, (_, i) => (
              <span key={i} className="bb-pip" aria-hidden="true" />
            ))}
            {view.aegis > 6 && <span className="bb-more">+{view.aegis - 6}</span>}
          </span>
        )}
      </div>
      <div className="bb-track hpbar">
        <span className="hp-ghost" style={{ width: w }} />
        <span className="hp-fill" style={{ width: w, background: hpColor(pct) }} />
        {view.phases.map((p) => (
          <span
            key={p.atHpPct}
            className={`bb-phase ${p.passed ? 'passed' : ''}`}
            style={{ left: `${p.atHpPct}%` }}
            title={t('At {pct}%: {title}', { pct: p.atHpPct, title: p.title })}
          />
        ))}
        <span className="bb-pct">{shown}%</span>
      </div>
      {(view.timer || view.enraged !== null) && (
        <div className="bb-foot">
          {view.timer && (
            <span className={`bb-timer ${view.timer.kind}`} title={view.timer.label}>
              <span className="bb-timer-label">{view.timer.label}</span>
              <span className="bb-timer-bar">
                <span style={{ width: `${Math.round(view.timer.left * 100)}%` }} />
              </span>
            </span>
          )}
          {view.enraged !== null && <span className="bb-enraged">{t('Enraged ×{m}', { m: view.enraged })}</span>}
        </div>
      )}
    </div>
  )
}
