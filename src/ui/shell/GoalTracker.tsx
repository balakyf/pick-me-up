/**
 * The goal tracker (spec 2026-10-12 S4): always on screen, it answers "what do I do
 * next?" in one glance. Two shapes:
 *   - `hud`: the lobby's panel (short / medium / long lines, a gold "Summon now!" chip,
 *     one hero request, and Isel's first steps folded in until onboarding is done);
 *   - `bar`: one or two compact chips in a scene's title bar.
 *
 * It never dispatches on its own (the scene bar sits over the Tower view, where a
 * dispatch would invalidate mid-battle orders): a click only asks the shell to travel.
 * The one exception is the first-steps "I know my way" button, shown in the lobby only.
 */
import { useMemo, useState } from 'react'
import type { GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { toWorldTime } from '../../engine/time'
import { FirstStepsList } from '../life/FirstSteps'
import { nextGoals, type Goal, type GoalTarget } from './goals'
import { t } from '../i18n/i18n'
import { usePrefs } from '../prefs'
import './shell.css'

const COLLAPSE_KEY = 'pmu.goals.collapsed'

function readCollapsed(): boolean {
  try {
    const v = window.localStorage.getItem(COLLAPSE_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    /* storage may be unavailable */
  }
  // Phones start folded to the one line that matters.
  return typeof window !== 'undefined' && window.innerWidth < 560
}

function writeCollapsed(v: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
  } catch {
    /* storage may be unavailable */
  }
}

function Bar({ goal }: { goal: Goal }) {
  if (!goal.progress) return null
  const pct = goal.progress.max > 0 ? Math.max(0, Math.min(100, (goal.progress.cur / goal.progress.max) * 100)) : 0
  return (
    <span className="goal-bar" aria-hidden="true">
      <span className="goal-bar-track">
        <span className="goal-bar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="goal-bar-label">{goal.progress.label}</span>
    </span>
  )
}

function GoalLine({ goal, tier, onGo }: { goal: Goal; tier: string; onGo: (g: GoalTarget) => void }) {
  const body = (
    <>
      <span className="goal-icon" aria-hidden="true">
        {goal.icon}
      </span>
      <span className="goal-main">
        <span className="goal-text">{goal.text}</span>
        {goal.detail && <span className="goal-detail">{goal.detail}</span>}
        <Bar goal={goal} />
      </span>
    </>
  )
  const cls = `goal goal-${tier} tone-${goal.tone}`
  if (!goal.go) return <div className={cls}>{body}</div>
  const target = goal.go
  return (
    <button className={cls} onClick={() => onGo(target)} data-goal={goal.id}>
      {body}
    </button>
  )
}

export function GoalTracker({
  state,
  store,
  variant,
  view,
  onGo,
}: {
  state: GameState
  /** Lobby only: lets the first-steps list be dismissed. */
  store?: Store
  variant: 'hud' | 'bar'
  /** The scene being shown (bar variant): goals pointing at it are skipped. */
  view?: string
  onGo: (target: GoalTarget) => void
}) {
  const stack = useMemo(() => nextGoals(state, toWorldTime(Date.now())), [state])
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [stepsOpen, setStepsOpen] = useState(false)
  const [prefs] = usePrefs()

  if (variant === 'bar') {
    const here = (g: Goal | null) => g?.go?.kind === 'place' && g.go.place === view
    const chips: Goal[] = []
    // While Isel's first steps run, the step leads: a phone shows only the first chip, and
    // a new Master who just set a party should be pointed at Floor 1, not back at the
    // crystal (playtest 2026-10-13). After onboarding the gold "Summon now!" leads.
    const order = stack.onboarding ? [stack.short, stack.cta, stack.medium] : [stack.cta, stack.short, stack.medium]
    for (const g of order) {
      if (chips.length >= 2) break
      if (!g || here(g) || chips.some((c) => c.id === g.id)) continue
      if (g === stack.cta || g.go?.kind === 'place') chips.push(g)
    }
    if (chips.length === 0) return null
    return (
      <nav className="goals-bar" aria-label={t('Next goals')}>
        {chips.map((g) => (
          <button key={g.id} className={`goal-chip tone-${g.tone}`} onClick={() => onGo(g.go!)} title={g.detail}>
            <span aria-hidden="true">{g.icon}</span>
            <span className="goal-chip-text">{g.text}</span>
            {g.progress && <span className="goal-chip-num">{g.progress.label}</span>}
          </button>
        ))}
      </nav>
    )
  }

  const toggle = () => {
    writeCollapsed(!collapsed)
    setCollapsed(!collapsed)
  }
  return (
    <section className={`hud hud-goals${collapsed ? ' collapsed' : ''}`} aria-label={t('Next goals')}>
      <div className="goals-head">
        <button className="goals-title" onClick={toggle} aria-expanded={!collapsed}>
          ✧ {t('Next up')} <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        </button>
        {stack.cta && (
          <button className={`goal-cta${prefs.reducedMotion ? ' calm' : ''}`} onClick={() => onGo(stack.cta!.go!)} title={stack.cta.detail}>
            {stack.cta.icon} {stack.cta.text}
          </button>
        )}
      </div>
      <GoalLine goal={stack.short} tier="short" onGo={onGo} />
      {!collapsed && (
        <>
          {stack.step && <GoalLine goal={stack.step} tier="step" onGo={onGo} />}
          {stack.onboarding && store && (
            <div className="goal-steps">
              <button className="linkish goal-steps-toggle" onClick={() => setStepsOpen(!stepsOpen)} aria-expanded={stepsOpen}>
                {t('First steps')} · {stack.onboarding.done}/{stack.onboarding.total} {stepsOpen ? '▾' : '▸'}
              </button>
              {stepsOpen && <FirstStepsList state={state} store={store} onGo={onGo} />}
            </div>
          )}
          {stack.medium && <GoalLine goal={stack.medium} tier="medium" onGo={onGo} />}
          <GoalLine goal={stack.long} tier="long" onGo={onGo} />
          {stack.request && <GoalLine goal={stack.request} tier="request" onGo={onGo} />}
        </>
      )}
    </section>
  )
}
