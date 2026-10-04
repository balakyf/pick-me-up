import { useState } from 'react'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { weeklyTrialWithResult } from '../../engine/store'
import {
  CHALLENGE,
  canEnterTrial,
  heroAllowed,
  weeklyAttemptsLeft,
  weeklyFor,
  weeklyRefusal,
  weeklyRule,
  weeklyUnlocked,
  type WeeklyOutcome,
  type WeeklyRule,
} from '../../engine/challenge'
import { toWorldTime } from '../../engine/time'
import { PixelWindow } from '../kit'
import { BattleScene } from '../battle/BattleScene'
import { cpOf, ELEMENT_VIS } from '../bits'
import { t } from '../i18n/i18n'
import { tn } from '../text'
import { lootLine } from './common'
import { HeroPicker } from '../hero/HeroPicker'
import './challenge.css'

const W = CHALLENGE.weekly

export function ruleName(rule: WeeklyRule): string {
  switch (rule.id) {
    case 'lowStar':
      return t('3★ and below')
    case 'element':
      return t('{el} heroes only', { el: t(ELEMENT_VIS[rule.element!].label) })
    case 'duo':
      return t('Two heroes')
    case 'tough':
      return t('Enemies ×{m} HP', { m: rule.enemyHpMult })
    case 'noMages':
      return t('No mages')
  }
}

function ruleBlurb(rule: WeeklyRule): string {
  switch (rule.id) {
    case 'lowStar':
      return t('The echoes only answer heroes of 3★ or less. Old hands, prove your recruits.')
    case 'element':
      return t('Only heroes of one element may enter. The rest of the roster watches.')
    case 'duo':
      return t('Two heroes, back to back, against everything the echoes send.')
    case 'tough':
      return t('The echoes come back thicker than they were. Every enemy has half again its HP.')
    case 'noMages':
      return t('The echoes swallow spells. Blades, bows and fists only.')
  }
}

/**
 * The weekly Echo Trial: this week's rule, the gauntlet, three attempts, the Master's
 * best, and the thresholds that pay once a week. A simulation — nobody dies, so its
 * replay ends on 'Trial ended', never on DEFEAT. (It used to be called the Crack of Time
 * trial, which collided with the ML20 Crack of Time; it is its own place now.)
 */
export function WeeklyTrial({ state, store, onClose }: { state: GameState; store: Store; onClose: () => void }) {
  const nowWorld = toWorldTime(Date.now())
  const weekly = weeklyFor(state, nowWorld)
  const rule = weeklyRule(weekly.week)
  const eligible = (Object.values(state.heroes) as OwnedHero[])
    .filter((h) => canEnterTrial(h, state) && heroAllowed(rule, h))
    .sort((a, b) => cpOf(b, state) - cpOf(a, state))
  const [team, setTeam] = useState<HeroId[]>(() => eligible.slice(0, rule.maxHeroes).map((h) => h.id))
  const [err, setErr] = useState<string | null>(null)
  const [watch, setWatch] = useState<WeeklyOutcome | null>(null)
  const [result, setResult] = useState<WeeklyOutcome | null>(null)
  const left = weeklyAttemptsLeft(state, nowWorld)
  const why = weeklyRefusal(state, team, nowWorld)

  function toggle(id: HeroId) {
    setTeam((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < rule.maxHeroes ? [...cur, id] : cur))
  }

  function enter() {
    setErr(null)
    try {
      const { outcome } = weeklyTrialWithResult(store.getState(), team, Date.now())
      store.dispatch({ type: 'WEEKLY_TRIAL', heroIds: team }, Date.now())
      setWatch(outcome)
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }

  if (watch) {
    return (
      <BattleScene
        log={watch.log}
        state={state}
        nonLethal
        onDone={() => {
          setResult(watch)
          setWatch(null)
        }}
      />
    )
  }

  return (
    <PixelWindow title={t('The Echo Trial · weekly')} icon="⟡" onClose={onClose} wide>
      {!weeklyUnlocked(state) ? (
        <div className="muted">{t('The tower replays its echoes for Masters past F{n}.', { n: W.unlockFloor })}</div>
      ) : result ? (
        <div className="raid-result">
          <div className="big-outcome win">{tn(result.score, '1 wave', '{n} waves')}</div>
          <div className="muted">
            {result.newBest ? t('A new best this week!') : t('Best this week: {n} waves', { n: result.best })}
          </div>
          {result.reached.length > 0 ? (
            <div className="room-loot">🎁 {lootLine({ gems: result.gems, materials: result.materials })}</div>
          ) : (
            <div className="muted small">{t('No new threshold reached this time.')}</div>
          )}
          <div className="muted small">{t('It was only an echo: everyone walks back out unharmed.')}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
            <button className="pbtn" onClick={() => setWatch(result)}>
              ▸ {t('Watch again')}
            </button>
            <button className="btn primary" onClick={() => setResult(null)}>
              {t('Back')}
            </button>
          </div>
        </div>
      ) : (
        <div className="weekly">
          <div className="weekly-rule">
            <div className="weekly-rule-name">
              {t('This week')} · <b>{ruleName(rule)}</b>
            </div>
            <div className="muted small">{ruleBlurb(rule)}</div>
            <div className="muted small">
              {t('A gauntlet of {n} escalating waves. Score = waves cleared.', { n: W.waves })}{' '}
              <b style={{ color: 'var(--good)' }}>{t('A simulation: no permadeath, no Sanity lost.')}</b>
            </div>
          </div>
          <div className="weekly-stats">
            <span>
              {t('Attempts left')} <b>{left}</b>/{W.attempts}
            </span>
            <span>
              {t('Best')} <b>{weekly.best}</b>
            </span>
          </div>
          <div className="weekly-thresholds">
            {W.thresholds.map((th, i) => (
              <span key={th.waves} className={`wt ${i < weekly.claimed ? 'done' : ''}`} title={lootLine({ gems: th.gems, materials: th.materials })}>
                {i < weekly.claimed ? '✓' : '◇'} {th.waves} · {th.gems}💎
              </span>
            ))}
          </div>
          <h4 className="panel-sub">
            {t('Your team')} ({team.length}/{rule.maxHeroes})
          </h4>
          {eligible.length === 0 && <div className="muted">{t('No hero of yours meets this week’s rule.')}</div>}
          {/* Lane Q: the shared hero picker (lane N); the week's rule is each row's reason. */}
          <div className="raid-roster-picker">
            <HeroPicker
              state={state}
              selected={team}
              onPick={toggle}
              refusal={(h) =>
                !heroAllowed(rule, h)
                  ? 'Not allowed by this week’s rule.'
                  : !canEnterTrial(h, state)
                    ? 'Cannot enter the trial now.'
                    : team.length >= rule.maxHeroes && !team.includes(h.id)
                      ? 'The team is full.'
                      : null
              }
              label={t('Heroes for the Echo Trial')}
              filter={{ availableOnly: true }}
            />
          </div>
          <div className="raid-actions">
            <button className="pbtn ghost" onClick={() => setTeam(eligible.slice(0, rule.maxHeroes).map((h) => h.id))}>
              ✦ {t('Strongest team')}
            </button>
            <span className="spacer" />
            <button className="pbtn primary" disabled={why !== null} onClick={enter}>
              ⟡ {t('Enter the echo')}
            </button>
          </div>
          {why && <div className="muted small" style={{ color: 'var(--warn)' }}>{t(why)}</div>}
          {err && <div className="muted small" style={{ color: 'var(--bad)' }}>{err}</div>}
        </div>
      )}
    </PixelWindow>
  )
}

/** A small launcher for the Echo Trial (also reachable from the Crack of Time once it opens). */
export function WeeklyTrialLauncher({ state, store }: { state: GameState; store: Store }) {
  const [open, setOpen] = useState(false)
  const nowWorld = toWorldTime(Date.now())
  const rule = weeklyRule(weeklyFor(state, nowWorld).week)
  return (
    <div className="lr-action">
      <div className="lr-action-note">
        ⟡ {t('Echo Trial: {rule}', { rule: ruleName(rule) })} · {tn(weeklyAttemptsLeft(state, nowWorld), '1 attempt left', '{n} attempts left')}
      </div>
      <button className="pbtn" onClick={() => setOpen(true)} disabled={!weeklyUnlocked(state)}>
        {t('Open the Echo Trial')}
      </button>
      {open && <WeeklyTrial state={state} store={store} onClose={() => setOpen(false)} />}
    </div>
  )
}
