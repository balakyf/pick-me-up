/**
 * The war room's forecast (O3): the crystal ran the real fight many times — here is the
 * truth. A big win %, the band, the expected deaths, each hero's risk, the enemy that
 * hurts most, the objective in plain words, the floor's roster (keywords and the Codex's
 * weaknesses, as the old scouting report showed them) and what would change the odds.
 */
import type { BattleOrder, CombatOutcome, GameState } from '../../engine/types'
import type { Forecast, ForecastAlternative } from '../../engine/scout/forecast'
import type { ScoutReport } from '../../engine/scout'
import { t } from '../i18n/i18n'
import { tn } from '../text'
import { ELEMENT_VIS } from '../bits'
import { shownLevel } from '../battle/battleFrames'
import { ScoutCodexNote } from '../codex/ScoutCodexNote'
import { FloorModsLine } from './FloorMods'
import { missionIcon } from './floorNames'
import type { ForecastView } from './useForecast'
import {
  THREAT_COLOR,
  altDelta,
  altDetail,
  altTitle,
  deathsLine,
  heroRiskChip,
  missionLines,
  openingText,
  threatLabel,
} from './warRoomText'

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

const OUTCOME_ORDER: CombatOutcome[] = ['win', 'timeout', 'failed', 'wipe', 'retreat']
const OUTCOME_COLOR: Record<CombatOutcome, string> = {
  win: 'var(--good)',
  timeout: 'var(--gold)',
  failed: 'var(--warn)',
  wipe: 'var(--bad)',
  retreat: 'var(--ink-faint)',
}
const OUTCOME_LABEL: Record<CombatOutcome, string> = {
  win: 'cleared',
  timeout: 'ran out of time',
  failed: 'mission failed',
  wipe: 'wiped',
  retreat: 'retreated',
}

/** How the runs ended, as one stacked bar (with the counts in its title). */
function OutcomeBar({ f }: { f: Forecast }) {
  const parts = OUTCOME_ORDER.filter((o) => f.outcomes[o] > 0)
  const title = parts.map((o) => `${t(OUTCOME_LABEL[o])}: ${f.outcomes[o]}/${f.runs}`).join(' · ')
  return (
    <div className="fc-bar" title={title} aria-label={title}>
      {parts.map((o) => (
        <span key={o} style={{ width: `${(f.outcomes[o] / f.runs) * 100}%`, background: OUTCOME_COLOR[o] }} />
      ))}
    </div>
  )
}

/** The floor's enemies, grouped (keywords and weaknesses once studied). */
function Roster({ report }: { report: ScoutReport }) {
  return (
    <>
      <div className="scout-enemies">
        {report.enemies.map((e) => {
          const notes = report.studied || e.studied || e.keywords.some((k) => k.kind === 'looming') ? e.keywords.map(keywordNote).filter(Boolean) : []
          return (
            <div key={`${e.name}|${e.level}`} className="scout-enemy">
              <span className="el-dot" style={{ background: ELEMENT_VIS[e.element].color }} title={t(ELEMENT_VIS[e.element].label)} />
              <b>{t(e.name)}</b>
              {e.count > 1 && <span className="muted">×{e.count}</span>}
              <span className="muted small">Lv{shownLevel(e)}</span>
              {e.target && <span className="chip">{t('target')}</span>}
              {notes.length > 0 && <span className="scout-notes">{notes.join(' · ')}</span>}
              <ScoutCodexNote enemy={e} floorStudied={report.studied} />
            </div>
          )
        })}
      </div>
      {!report.studied && <div className="muted small">{t('Weaknesses unknown — a Scholar in the Library can study this floor.')}</div>}
      {report.immune.physical && <div className="scout-warn">⚠ {t('Most of this floor shrugs off physical blows — bring magic.')}</div>}
      {report.immune.magic && <div className="scout-warn">⚠ {t('Most of this floor shrugs off magic — bring blades.')}</div>}
    </>
  )
}

/** "What would change the odds": each plan re-forecast, one click to adopt it. */
function OddsChangers({ state, view, onUse }: { state: GameState; view: ForecastView; onUse: (a: ForecastAlternative) => void }) {
  const base = view.forecast
  if (!base || (base.fielded === 0 && (view.alternatives ?? []).length === 0)) return null
  return (
    <div className="fc-alts">
      <div className="fc-alts-title">{t('What would change the odds')}</div>
      {view.alternatives === null ? (
        <div className="muted small crystal-wait">{t('The crystal weighs other plans…')}</div>
      ) : view.alternatives.length === 0 ? (
        <div className="muted small">{base.winPct >= 100 && base.expectedDeaths === 0 ? t('Nothing to change: this is as good as it gets.') : t('No party or order within reach changes these odds much.')}</div>
      ) : (
        view.alternatives.map((a, i) => {
          const detail = altDetail(state, a)
          return (
            <div key={`${a.kind}|${i}`} className="fc-alt">
              <div className="fc-alt-text">
                <b>{altTitle(state, a)}</b>
                {detail && <div className="muted small">{detail}</div>}
                <div className="fc-alt-delta" style={{ color: THREAT_COLOR[a.forecast.threat] }}>
                  {altDelta(base, a.forecast)} · {threatLabel(a.forecast.threat)}
                </div>
              </div>
              <button className="pbtn sm" onClick={() => onUse(a)}>
                {a.kind === 'focus' ? t('Use this plan') : t('Use this party')}
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}

export function ForecastPanel({
  state,
  report,
  view,
  names,
  opening,
  onClearOpening,
  onUse,
  onSuggest,
}: {
  state: GameState
  report: ScoutReport
  view: ForecastView
  /** Display names by target tag and unit id (bosses, escorts, foes). */
  names: Record<string, string>
  opening: BattleOrder[]
  onClearOpening: () => void
  onUse: (a: ForecastAlternative) => void
  onSuggest: () => void
}) {
  const f = view.forecast
  const color = f ? THREAT_COLOR[f.threat] : 'var(--ink-dim)'
  const anyAlive = Object.values(state.heroes).some((h) => h.alive)
  return (
    <div className="pframe scout forecast" aria-busy={view.status === 'pending'}>
      <div className="event-head">
        <span className="event-kind">{t('Forecast · F{n}', { n: report.floor })}</span>
        <span className="muted">
          {missionIcon(report.mission)} {t(report.mission)} · {tn(report.waves, '1 wave', '{n} waves')}
        </span>
      </div>

      {!f ? (
        <div className="crystal-wait fc-pending">🔮 {t('Consulting the crystal…')}</div>
      ) : f.fielded === 0 ? (
        <div className="fc-top">
          <div className="fc-win" style={{ color: 'var(--bad)' }}>
            <span className="fc-pct">—</span>
          </div>
          <div className="fc-band">
            <span className="threat-label" style={{ color: 'var(--bad)' }}>
              {t('No one can fight')}
            </span>
            <div className="muted small">{t('Nobody in this party would answer the call. Field someone who can.')}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="fc-top">
            <div className="fc-win" style={{ color }}>
              <span className="fc-pct">{f.winPct}%</span>
              <span className="fc-pct-label">{t('to clear')}</span>
            </div>
            <div className="fc-band">
              <span className="threat-label" style={{ color }}>
                {threatLabel(f.threat)}
              </span>
              <OutcomeBar f={f} />
              <div className="fc-deaths" style={{ color: f.expectedDeaths > 0 ? 'var(--warn)' : 'var(--ink-dim)' }}>
                {deathsLine(f)}
              </div>
              <div className="muted small">
                {t('{runs} runs of the real fight · median {ticks} ticks', { runs: f.runs, ticks: f.medianTicks })} ·{' '}
                {t('party {p} vs floor {f}', { p: f.partyCp.toLocaleString(), f: f.enemyCp.toLocaleString() })}
              </div>
            </div>
          </div>

          <div className="fc-chips">
            {f.heroes.map((h) => {
              const c = heroRiskChip(state, h)
              return (
                <span key={h.heroId} className={`fc-chip ${c.tone}`} title={c.hint}>
                  {c.text}
                </span>
              )
            })}
            {f.emptySlots > 0 && <span className="fc-chip muted">{tn(f.emptySlots, '1 empty slot', '{n} empty slots')}</span>}
          </div>

          <div className="fc-objective">
            {missionLines(f, names).map((line) => (
              <div key={line}>🎯 {line}</div>
            ))}
            {f.escorts.map((e) => (
              <div key={e.unitId} className={e.fallsPct > 0 ? 'fc-warn' : 'muted small'}>
                👑 {e.fallsPct > 0 ? t('{name} falls in {p}% of the runs.', { name: t(e.name), p: e.fallsPct }) : t('{name} came through every run.', { name: t(e.name) })}
              </div>
            ))}
          </div>

          {f.deadliest && (
            <div className="fc-deadliest">
              ☠ {t('Deadliest: {name} (wave {w}) — {p}% of the damage your party takes.', { name: t(f.deadliest.name), w: f.deadliest.wave, p: f.deadliest.sharePct })}
              {f.deadliest.killsPerRun > 0 && <span className="muted small"> {t('It fells {n} an attempt.', { n: f.deadliest.killsPerRun })}</span>}
            </div>
          )}
          {f.boss && f.boss.hpLeftPct !== null && (
            <div className="muted small">{t('When the party lost, {name} still had {p}% of their strength.', { name: t(f.boss.name), p: f.boss.hpLeftPct })}</div>
          )}
        </>
      )}

      <FloorModsLine mods={report.modifiers} />
      <Roster report={report} />

      {opening.length > 0 && (
        <div className="fc-opening">
          {opening.map((o, i) => (
            <span key={i}>⚑ {openingText(o, names)}</span>
          ))}
          <button className="linkish" onClick={onClearOpening}>
            {t('cancel')}
          </button>
        </div>
      )}

      <OddsChangers state={state} view={view} onUse={onUse} />

      <div className="scout-actions">
        <button className="pbtn sm" onClick={onSuggest} disabled={!anyAlive}>
          ✦ {t('Suggest a party')}
        </button>
      </div>
    </div>
  )
}
