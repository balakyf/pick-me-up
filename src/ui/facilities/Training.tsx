import { useState } from 'react'
import type { GameState, OwnedHero, HeroId, Command } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { toWorldTime } from '../../engine/time'
import { SKILLS } from '../../engine/content'
import { maxTrainableGrade, drillXp, trainingOptions, practiceFocus, practiceRate } from '../../engine/training'
import { lifeOf } from '../../engine/life'
import { Portrait, SkillList } from '../bits'
import { skillBlurb } from '../skillText'
import { t } from '../i18n/i18n'
import { timeLeft } from './shared'
import { HeroPicker } from '../hero/HeroPicker'
import { busyRefusal } from '../hero/refusals'
import { HeroTag, pickerName } from '../hero/heroLabel'

const TRAIN = TUNING.skills.training

/** The Training Center: drills in progress + a hero → skill drill picker. */
export function TrainingAction({ state, store }: { state: GameState; store: Store }) {
  const [heroId, setHeroId] = useState<HeroId | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const level = state.facilities.trainingCenter.level
  const ceiling = maxTrainableGrade(level)
  const nowWorld = toWorldTime(Date.now())
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const drilling = living.filter((h) => h.training !== null)
  const free = living.filter((h) => h.training === null && h.promotion === null)
  const selected = heroId && state.heroes[heroId] && free.some((h) => h.id === heroId) ? state.heroes[heroId]! : null

  function run(cmd: Command) {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'Action failed'))
    }
  }

  if (ceiling === null) {
    return (
      <div className="lr-action-note">
        {t('Heroes already spar in the yard in their free time, at half pace. Build the Training Center to teach them new skills and to start drills.')}
      </div>
    )
  }

  return (
    <div className="lr-action training-action">
      <div className="ta-row"><span>{t('Max trainable grade')}</span><span className="ta-val">{ceiling}</span></div>
      <div className="ta-row"><span>{t('Skill XP per drill')}</span><span className="ta-val">+{drillXp(level)}</span></div>
      <div className="ta-row"><span>{t('Drill length')}</span><span className="ta-val">{t('{n} world-min', { n: Math.round(TRAIN.drillDurationMs / 60_000) })}</span></div>

      {drilling.length > 0 && (
        <>
          <h4 className="panel-sub">{t('In the yard')}</h4>
          {drilling.map((h) => (
            <div key={h.id} className="promo-row">
              <span className="promo-name">
                {pickerName(state, h)} · {h.training!.mode === 'learn' ? t('learning') : t('refining')} {t(SKILLS[h.training!.skillId]?.name ?? '')}
              </span>
              <span className="muted">{timeLeft(h.training!.completesAtWorld - nowWorld)}</span>
              <button
                className="btn gem sm"
                onClick={() => run({ type: 'SKIP_TIMER', kind: 'training', id: h.id })}
                disabled={state.gems < TRAIN.skipGemCost}
                title={t('Finish now for {n} gems', { n: TRAIN.skipGemCost })}
              >
                ⏩ {TRAIN.skipGemCost} ♦
              </button>
            </div>
          ))}
        </>
      )}

      <SelfPractice state={state} heroes={free} />

      <h4 className="panel-sub">{t('New drill')}</h4>
      <p className="muted small">{t('Optional: a drill focuses one hero on the skill you choose, much faster than practising alone.')}</p>
      {free.length === 0 ? (
        <div className="lr-empty">{t('Every hero is busy.')}</div>
      ) : (
        <HeroPicker
          state={state}
          heroes={living}
          label={t('New drill')}
          selected={selected ? [selected.id] : []}
          refusal={(h) => busyRefusal(state, h)}
          onPick={(id) => setHeroId(selected?.id === id ? null : id)}
          filter={{ availableOnly: true }}
        />
      )}
      {selected && (
        <div className="drill-list">
          <SkillList hero={selected} detailed />
          {trainingOptions(state, selected.id).map((o) => {
            const def = SKILLS[o.skillId]!
            return (
              <div key={o.skillId} className={`drill-row ${o.ok ? '' : 'off'}`} title={o.reason ? t(o.reason) : undefined}>
                <span className="skill-grade">{def.grade}</span>
                <span className="drill-name">
                  {o.mode === 'learn' ? t('Learn') : t('Refine')} {t(def.name)}
                  <span className="drill-blurb">{skillBlurb(def, selected.skills.find((s) => s.id === o.skillId)?.level ?? 1)}</span>
                </span>
                <span className="muted">{o.cost.toLocaleString()} ◆</span>
                <button
                  className="btn sm"
                  disabled={!o.ok}
                  onClick={() => run({ type: 'TRAIN_SKILL', heroId: selected.id, skillId: o.skillId })}
                >
                  {t('Train')}
                </button>
              </div>
            )
          })}
        </div>
      )}
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

/** Who is practising what on their own (no orders needed): the yard's free-time regulars. */
export function SelfPractice({ state, heroes }: { state: GameState; heroes: OwnedHero[] }) {
  const level = state.facilities.trainingCenter.level
  const rows = heroes
    .map((h) => ({ h, focus: practiceFocus(h, level), here: lifeOf(h).doing.kind === 'train' }))
    .filter((r) => r.focus !== null)
    .sort((a, b) => Number(b.here) - Number(a.here))
  return (
    <>
      <h4 className="panel-sub">{t('Practising on their own')}</h4>
      <p className="muted small">
        {t('In their free time heroes come to the yard and work on a skill of their choosing, for free. Instructors make it go faster.')}
      </p>
      <div className="ta-row"><span>{t('Practice per hour in the yard')}</span><span className="ta-val">+{(practiceRate(level) * 2).toFixed(1)} {t('skill XP')}</span></div>
      {rows.length === 0 ? (
        <div className="lr-empty">{t('Nobody has anything left to practise here.')}</div>
      ) : (
        <ul className="practice-list">
          {rows.map(({ h, focus, here }) => {
            const def = SKILLS[focus!.skillId]!
            const owned = h.skills.find((s) => s.id === focus!.skillId)
            const pts = lifeOf(h).practice?.skillId === focus!.skillId ? lifeOf(h).practice!.points : 0
            const pct =
              focus!.mode === 'learn'
                ? pts / TRAIN.self.learnPoints
                : owned
                  ? (owned.xp + pts) / (TUNING.skills.xpToNext[owned.level] ?? 1)
                  : 0
            return (
              <li key={h.id} className={`practice-row ${here ? 'here' : ''}`}>
                <Portrait hero={h} size="sm" />
                <span className="practice-name">
                  <span>
                    <b>{pickerName(state, h)}</b> <HeroTag hero={h} /> ·{' '}
                    {focus!.mode === 'learn' ? t('learning {skill}', { skill: t(def.name) }) : t('{skill} Lv {n}', { skill: t(def.name), n: owned?.level ?? 1 })}
                  </span>
                  <span className="practice-bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }} />
                  </span>
                </span>
                <span className="muted small">{here ? t('in the yard now') : ''}</span>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
