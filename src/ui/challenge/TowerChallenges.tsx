import { useState } from 'react'
import type { CombatLog, GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { bonusRoomWithResult } from '../../engine/store'
import { CHALLENGE, RAID_FLOORS, raidChestReady, raidsOpen, weeklyAttemptsLeft, weeklyFor, weeklyRule, weeklyUnlocked, type RoomOutcome } from '../../engine/challenge'
import { toWorldTime } from '../../engine/time'
import { BattleScene } from '../battle/BattleScene'
import { t } from '../i18n/i18n'
import { tn } from '../text'
import { BonusRoomPanel, RoomOutcomeCard } from './BonusRoom'
import { RaidPlanner } from './RaidPlanner'
import { WeeklyTrial, ruleName } from './WeeklyTrial'
import { Memories, memoriesLabel } from '../ending/Memories'
import { relivableFloors } from '../../engine/endgame'
import './challenge.css'

/**
 * Everything beyond the plain climb, on the Tower screen: the optional side room an anchor
 * revealed, the raid table (cleared raid anchors, replayable), and the weekly Echo Trial.
 */
export function TowerChallenges({ state, store }: { state: GameState; store: Store }) {
  const [outcome, setOutcome] = useState<RoomOutcome | null>(null)
  const [replay, setReplay] = useState<CombatLog | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [win, setWin] = useState<'raid' | 'weekly' | 'memories' | null>(null)
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
                ? tn(chests, '· 1 chest waiting', '· {n} chests waiting')
                : t('· chests taken this week')}
          </span>
        </button>
        <button className="pbtn" onClick={() => setWin('weekly')} disabled={!weeklyOpen}>
          ⟡ {t('Echo Trial')}
          <span className="muted small">
            {' '}
            {weeklyOpen
              ? `· ${ruleName(rule)} · ${tn(weeklyAttemptsLeft(state, nowWorld), '1 attempt left', '{n} attempts left')}`
              : t('(clear F{n})', { n: CHALLENGE.weekly.unlockFloor })}
          </span>
        </button>
        {/* Lane O: relive a cleared anchor to find the truths missed there. */}
        <button className="pbtn" onClick={() => setWin('memories')} disabled={relivableFloors(state).length === 0}>
          ✧ {t('Memories')}
          <span className="muted small"> {relivableFloors(state).length === 0 ? t('(clear F{n})', { n: 5 }) : memoriesLabel(state, nowWorld)}</span>
        </button>
      </div>
      {win === 'raid' && <RaidPlanner state={state} store={store} onClose={() => setWin(null)} />}
      {win === 'weekly' && <WeeklyTrial state={state} store={store} onClose={() => setWin(null)} />}
      {win === 'memories' && <Memories state={state} store={store} onClose={() => setWin(null)} />}
      {outcome && !replay && <RoomOutcomeCard outcome={outcome} onReplay={setReplay} onClose={() => setOutcome(null)} />}
      {replay && <BattleScene log={replay} state={state} onDone={() => setReplay(null)} />}
    </>
  )
}
