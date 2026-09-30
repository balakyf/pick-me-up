import { useState } from 'react'
import type { CombatLog, GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { bonusRoomWithResult } from '../../engine/store'
import { CHALLENGE, RAID_FLOORS, raidChestReady, raidsOpen, weeklyAttemptsLeft, weeklyFor, weeklyRule, weeklyUnlocked, type RoomOutcome } from '../../engine/challenge'
import { toWorldTime } from '../../engine/time'
import { BattleScene } from '../battle/BattleScene'
import { t } from '../i18n/i18n'
import { BonusRoomPanel, RoomOutcomeCard } from './BonusRoom'
import { RaidPlanner } from './RaidPlanner'
import { WeeklyTrial, ruleName } from './WeeklyTrial'
import './challenge.css'

/**
 * Everything beyond the plain climb, on the Tower screen: the optional side room an anchor
 * revealed, the raid table (cleared raid anchors, replayable), and the weekly Crack of Time
 * trial.
 */
export function TowerChallenges({ state, store }: { state: GameState; store: Store }) {
  const [outcome, setOutcome] = useState<RoomOutcome | null>(null)
  const [replay, setReplay] = useState<CombatLog | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [win, setWin] = useState<'raid' | 'weekly' | null>(null)
  const nowWorld = toWorldTime(Date.now())

  function choose(choice: string) {
    setErr(null)
    try {
      const pre = store.getState()
      const { outcome: out } = bonusRoomWithResult(pre, choice, Date.now())
      store.dispatch({ type: 'BONUS_ROOM', choice }, Date.now())
      if (choice !== 'leave') setOutcome(out)
      // A mimic fight plays out first.
      if (out.log) setReplay(out.log)
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }

  const raids = raidsOpen(state)
  const chests = raids.filter((f) => raidChestReady(state, f, nowWorld)).length
  const weeklyOpen = weeklyUnlocked(state)
  const rule = weeklyRule(weeklyFor(state, nowWorld).week)

  return (
    <>
      <BonusRoomPanel state={state} onChoose={choose} />
      {err && <div className="muted" style={{ color: 'var(--bad)' }}>{err}</div>}
      <div className="pframe challenge-bar">
        <button className="pbtn" onClick={() => setWin('raid')} disabled={raids.length === 0}>
          ⚔ {t('Raids')}
          <span className="muted small">
            {' '}
            {raids.length === 0
              ? t('(clear F{n})', { n: RAID_FLOORS[0]! })
              : chests > 0
                ? t('· {n} chests waiting', { n: chests })
                : t('· chests taken this week')}
          </span>
        </button>
        <button className="pbtn" onClick={() => setWin('weekly')} disabled={!weeklyOpen}>
          ⟡ {t('Weekly trial')}
          <span className="muted small">
            {' '}
            {weeklyOpen
              ? `· ${ruleName(rule)} · ${t('{n} attempts left', { n: weeklyAttemptsLeft(state, nowWorld) })}`
              : t('(clear F{n})', { n: CHALLENGE.weekly.unlockFloor })}
          </span>
        </button>
      </div>
      {win === 'raid' && <RaidPlanner state={state} store={store} onClose={() => setWin(null)} />}
      {win === 'weekly' && <WeeklyTrial state={state} store={store} onClose={() => setWin(null)} />}
      {outcome && !replay && <RoomOutcomeCard outcome={outcome} onReplay={setReplay} onClose={() => setOutcome(null)} />}
      {replay && <BattleScene log={replay} state={state} onDone={() => setReplay(null)} />}
    </>
  )
}
