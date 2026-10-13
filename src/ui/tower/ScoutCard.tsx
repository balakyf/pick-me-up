/**
 * The scouting card (spec 2026-10-12 S12, WP4; refactored from TowerScreen's ScoutPanel):
 * the floor's kind, an honest threat rating, the 1-2 named threats and why, the rout
 * threshold, Last Stand and mercy notes, and a waiting Nemesis.
 */
import type { GameState, FloorKind } from '../../engine/types'
import { THREAT_BANDS, type ScoutReport } from '../../engine/scout'
import { t } from '../i18n/i18n'
import { enemyName } from '../legacy/legacyText'
import { ELEMENT_VIS } from '../bits'
import { KIND_ICON, KIND_LABEL } from './kinds'

export const THREAT_LABEL: Record<ScoutReport['threat'], string> = {
  safe: 'Safe',
  fair: 'Fair fight',
  risky: 'Risky',
  deadly: 'Deadly',
}
export const THREAT_COLOR: Record<ScoutReport['threat'], string> = {
  safe: 'var(--good)',
  fair: 'var(--gold)',
  risky: 'var(--warn)',
  deadly: 'var(--bad)',
}

function keywordNote(k: ScoutReport['enemies'][number]['keywords'][number]): string | null {
  switch (k.kind) {
    case 'immune':
      return t('immune to {what}', { what: t(k.damageType) })
    case 'resist':
      return t('resists {what}', { what: t(k.damageType) })
    case 'vulnerable':
      return t('weak to {what}', { what: t(ELEMENT_VIS[k.element].label) })
    case 'looming':
      return t('too strong to fight — finish first')
    case 'phased':
      return t('shielded until its guard falls')
    case 'enrage':
      return t('enrages after {n} ticks', { n: k.afterTick })
    case 'aegis':
      return t('shrugs off the first {n} hits', { n: k.charges })
    default:
      return null
  }
}

/** What the scout's trial runs saw, honestly: "In 8 trial runs: won 7 · lost a hero in 1". */
export function trialLine(tr: ScoutReport['trials']): string {
  const parts = [t('In {n} trial runs: won {w}', { n: tr.runs, w: tr.won })]
  if (tr.hurt === 0) {
    parts.push(t('nobody fell'))
    // Every run came home whole but someone nearly didn't: say so (that is why it isn't Safe).
    if (tr.closestCall > 0 && tr.closestCall < THREAT_BANDS.safeMargin) parts.push(t('closest call: a hero at {p}% HP', { p: Math.max(1, Math.round(tr.closestCall * 100)) }))
  } else if (tr.hurt === 1) parts.push(t('lost a hero in 1'))
  else parts.push(t('lost heroes in {h}', { h: tr.hurt }))
  if (tr.worstDeaths >= 2) parts.push(t('worst: {d} fell', { d: tr.worstDeaths }))
  if (tr.routed > 0) parts.push(tr.routed === 1 ? t('the party broke once') : t('the party broke {r} times', { r: tr.routed }))
  return parts.join(' · ')
}

/** A small pill naming a floor kind ("💀 Elite"). */
export function KindBadge({ kind }: { kind: FloorKind }) {
  return (
    <span className={`kind-badge kind-${kind}`}>
      <span aria-hidden="true">{KIND_ICON[kind]}</span> {t(KIND_LABEL[kind])}
    </span>
  )
}

export function ScoutCard({
  state,
  report,
  kind,
  onSuggest,
  autoSweep,
  onToggleSweep,
  onFight,
  fightDisabled = false,
}: {
  state: GameState
  report: ScoutReport
  /** The floor's kind as the climb knows it (falls back to the report's). */
  kind?: FloorKind
  onSuggest: () => void
  /** The Sweep preference, when the card should offer its toggle. */
  autoSweep?: boolean
  onToggleSweep?: () => void
  /** The card's call to action: fight this floor now (same as the floor's own button). */
  onFight?: () => void
  fightDisabled?: boolean
}) {
  // The gauge shows the trial runs' win rate (the CP ratio is only a hint now).
  const pct = Math.round(report.winRate * 100)
  const k = kind ?? report.kind
  const threats = report.threats.slice(0, 2)
  return (
    <div className={`pframe scout kind-${k}`}>
      <div className="event-head">
        <span className="event-kind">
          {t('Scouting report · F{n}', { n: report.floor })} <KindBadge kind={k} />
        </span>
        <span className="muted">
          {t(report.mission)} · {report.waves === 1 ? t('1 wave') : t('{n} waves', { n: report.waves })}
        </span>
      </div>
      {report.nemesis && (
        <div className="scout-nemesis">
          ☠ {t('{name} waits here.', { name: enemyName(report.nemesis) })} <span className="muted small">{t('Avenge the fallen for a reward.')}</span>
        </div>
      )}
      <div className="threat-row">
        <span className="threat-label" style={{ color: THREAT_COLOR[report.threat] }}>
          {t(THREAT_LABEL[report.threat])}
        </span>
        <span className="gauge threat-gauge">
          <span style={{ width: `${pct}%`, background: THREAT_COLOR[report.threat] }} />
        </span>
        <span className="muted small">
          {t('party {p} vs floor {f}', { p: Math.round(report.partyCp).toLocaleString(), f: Math.round(report.budget).toLocaleString() })}
        </span>
      </div>
      {report.trials.runs > 0 && <div className="muted small scout-trials">{trialLine(report.trials)}</div>}
      {threats.length > 0 && (
        <ul className="scout-threats">
          {threats.map((th) => (
            <li key={`${th.name}|${th.why}`}>
              <b>{enemyName(th.name)}</b>: {t(th.why)}
            </li>
          ))}
        </ul>
      )}
      <div className="scout-notes-row">
        {report.rout !== null && (
          <span className="scout-note">
            ⚑ {report.rout === 1 ? t('The party breaks after 1 falls.') : t('The party breaks after {n} fall.', { n: report.rout })}
          </span>
        )}
        {report.lastStandPct > 0 && (
          <span className="scout-note good">✊ {t('Last Stand +{p}%: a thin roster fights harder.', { p: Math.round(report.lastStandPct * 100) })}</span>
        )}
        {report.mercyCapped && <span className="scout-note good">✚ {t('The tower eases off: it is pitched to your strongest five.')}</span>}
      </div>
      <div className="scout-enemies">
        {report.enemies.map((e) => {
          // One line per note: a unit can carry the same keyword twice (an anchor that
          // repeats its template's keywords), and "enrage · enrage" reads as a bug.
          const notes = report.studied || e.keywords.some((kw) => kw.kind === 'looming') ? [...new Set(e.keywords.map(keywordNote).filter(Boolean))] : []
          return (
            <div key={`${e.name}|${e.level}`} className="scout-enemy">
              <span className="el-dot" style={{ background: ELEMENT_VIS[e.element].color }} title={t(ELEMENT_VIS[e.element].label)} />
              <b>{enemyName(e.name)}</b>
              {e.count > 1 && <span className="muted">×{e.count}</span>}
              <span className="muted small">{t('Lv{level}', { level: e.level })}</span>
              {e.target && <span className="chip">{t('target')}</span>}
              {notes.length > 0 && <span className="scout-notes">{notes.join(' · ')}</span>}
            </div>
          )
        })}
      </div>
      {!report.studied && <div className="muted small">{t('Weaknesses unknown — a Scholar in the Library can study this floor.')}</div>}
      {report.immune.physical && <div className="scout-warn">⚠ {t('Most of this floor shrugs off physical blows — bring magic.')}</div>}
      {report.immune.magic && <div className="scout-warn">⚠ {t('Most of this floor shrugs off magic — bring blades.')}</div>}
      <div className="scout-actions">
        {onFight && (
          <button className="btn primary cta scout-fight" onClick={onFight} disabled={fightDisabled}>
            ⚔ {t('Fight floor {n} ▸', { n: report.floor })}
          </button>
        )}
        <button className="pbtn sm" onClick={onSuggest} disabled={Object.values(state.heroes).filter((h) => h.alive).length === 0}>
          ✦ {t('Suggest a party')}
        </button>
        {onToggleSweep && (
          <button
            className={`pbtn sm ghost ${autoSweep ? 'on' : ''}`}
            onClick={onToggleSweep}
            aria-pressed={!!autoSweep}
            title={t('Easy floors won with nobody lost play as a short highlight.')}
          >
            ⚡ {autoSweep ? t('Sweep easy floors: on') : t('Sweep easy floors: off')}
          </button>
        )}
      </div>
    </div>
  )
}
