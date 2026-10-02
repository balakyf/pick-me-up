/**
 * Before the fight (lane G, orders 2.0): the Tactical Center's free levers — a MARK on one
 * foe (every hero strikes it from the first blow; sweeps land on it at fuller force) and up to
 * its slots of free PROTECTS (foes look past those heroes, and a big move lands on them
 * softened) — and the floor's big moves: who winds up what, and who changes when.
 * The directive rides on the attempt (ATTEMPT_FLOOR.focus) and on the forecast's plan.
 */
import type { Encounter, FocusDirective, GameState, HeroId, PhaseKeyword } from '../../engine/types'
import { freeProtects } from '../../engine/tactical'
import { deployReport } from '../../engine/tower'
import { SKILLS } from '../../engine/content'
import { t } from '../i18n/i18n'
import { tn } from '../text'
import { pickerName } from '../hero/heroLabel'
import './preBattle.css'

/** The foes worth knowing about: their wound-up moves and the phases they will turn at. */
export interface BigMoveNote {
  unitId: string
  name: string
  wave: number
  moves: string[]
  phases: { atHpPct: number; title?: string }[]
}

/** Every foe on the floor with a charged move or a phase (one note per kind of foe). */
export function bigMoves(enc: Encounter | null): BigMoveNote[] {
  if (enc === null) return []
  const out: BigMoveNote[] = []
  const seen = new Set<string>()
  enc.waves.forEach((w, i) => {
    for (const u of w.units) {
      const turns = u.keywords.filter((k): k is PhaseKeyword => k.kind === 'phase')
      // Its wound-up moves, the ones a phase teaches it included.
      const moves = [...new Set([...u.skills.map((s) => s.id), ...turns.flatMap((k) => k.skills ?? [])])].filter((id) => SKILLS[id]?.charge !== undefined)
      const phases = turns.map((k) => ({ atHpPct: k.atHpPct, ...(k.title !== undefined ? { title: k.title } : {}) }))
      const key = u.templateId ?? u.name
      if ((moves.length === 0 && phases.length === 0) || seen.has(key)) continue
      seen.add(key)
      out.push({ unitId: u.id, name: u.name, wave: i + 1, moves, phases })
    }
  })
  return out
}

/** The foes a mark can be put on (looming giants left out: a mark on them is wasted). */
export function markable(enc: Encounter | null): { unitId: string; name: string; wave: number }[] {
  if (enc === null) return []
  return enc.waves.flatMap((w, i) => w.units.filter((u) => !u.keywords.some((k) => k.kind === 'looming')).map((u) => ({ unitId: u.id, name: u.name, wave: i + 1 })))
}

export function PreBattleOrders({
  state,
  encounter,
  directive,
  onChange,
}: {
  state: GameState
  encounter: Encounter | null
  directive: FocusDirective | undefined
  onChange: (d: FocusDirective | undefined) => void
}) {
  const slots = freeProtects(state.facilities.tacticalCenter.level)
  const protects = directive?.overlookedAllyIds ?? []
  const mark = directive?.focusEnemyId
  const foes = markable(encounter)
  const waves = encounter?.waves.length ?? 1
  const label = (f: { name: string; wave: number }) => (waves > 1 ? t('{name} (wave {w})', { name: t(f.name), w: f.wave }) : t(f.name))
  const heroes = deployReport(state).filter((r) => r.heroId && r.fit)
  const set = (next: FocusDirective) => onChange(next.focusEnemyId === undefined && (next.overlookedAllyIds ?? []).length === 0 ? undefined : next)
  const toggle = (id: HeroId) => {
    const has = protects.includes(id)
    if (!has && protects.length >= slots) return
    set({ ...directive, overlookedAllyIds: has ? protects.filter((x) => x !== id) : [...protects, id] })
  }
  const notes = bigMoves(encounter)
  return (
    <div className="prebattle">
      <div className="prebattle-head">
        <span className="panel-sub">{t('Before the fight')}</span>
        <span className="muted small">{t('free — the Tactical Center')}</span>
      </div>
      <label className="prebattle-row">
        <span className="pb-ico" aria-hidden="true">
          ⌖
        </span>
        <span className="pb-what">{t('Mark')}</span>
        <select
          className="pinput sm"
          value={mark ?? ''}
          onChange={(e) => set({ ...directive, focusEnemyId: e.target.value === '' ? undefined : e.target.value })}
          aria-label={t('Mark a foe: every hero strikes it from the first blow')}
        >
          <option value="">{t('— nobody —')}</option>
          {foes.map((f) => (
            <option key={f.unitId} value={f.unitId}>
              {label(f)}
            </option>
          ))}
        </select>
      </label>
      <div className="prebattle-row">
        <span className="pb-ico" aria-hidden="true">
          🛡
        </span>
        <span className="pb-what">{t('Protect')}</span>
        <span className="pb-chips">
          {heroes.map((r) => {
            const on = protects.includes(r.heroId!)
            const hero = state.heroes[r.heroId!]!
            return (
              <button
                key={r.heroId}
                type="button"
                className={`pb-chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                disabled={!on && protects.length >= slots}
                onClick={() => toggle(r.heroId!)}
                title={t('Foes look past {name} while anyone else stands; a big move lands on them softened', { name: hero.name })}
              >
                {pickerName(state, hero)}
              </button>
            )
          })}
        </span>
        <span className="muted small">{t('{n}/{m} free', { n: protects.length, m: slots })}</span>
      </div>
      {notes.length > 0 && (
        <div className="prebattle-moves">
          {notes.map((n) => (
            <div key={n.unitId} className="pb-move">
              <span aria-hidden="true">⚠ </span>
              <b>{t(n.name)}</b>
              {n.moves.length > 0 && (
                <span>
                  {' '}
                  {t('winds up {moves} — Guard answers it.', { moves: n.moves.map((m) => t(SKILLS[m]?.name ?? m)).join(', ') })}
                </span>
              )}
              {n.phases.length > 0 && (
                <span className="muted">
                  {' '}
                  {tn(n.phases.length, 'Changes once: {at}.', 'Changes {n} times: {at}.', {
                    at: n.phases.map((p) => (p.title ? t('at {n}% — {title}', { n: p.atHpPct, title: t(p.title) }) : t('at {n}%', { n: p.atHpPct }))).join(', '),
                  })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
