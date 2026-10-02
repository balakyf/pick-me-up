import { useState } from 'react'
import type { GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { worldDayIndex, dailyDungeonFor, dailyUnlocked, dailyAttemptsLeft } from '../../engine/daily'
import type { DailyReward } from '../../engine/daily'
import { attemptDailyWithResult } from '../../engine/store'
import { toWorldTime } from '../../engine/time'
import { skillProgressLine } from '../results/skillProgress'
import { t } from '../i18n/i18n'
import { matLabel } from './shared'

const DAILY = TUNING.lobby.daily

/** One-line summary of a daily reward bundle. */
function rewardSummary(r: DailyReward): string {
  const parts: string[] = []
  if (r.gold) parts.push(`+${r.gold.toLocaleString()} ◆`)
  if (r.gems) parts.push(`+${r.gems} 💎`)
  if (r.heroXp) parts.push(`+${r.heroXp} XP`)
  for (const id of Object.keys(r.materials ?? {})) parts.push(`+${r.materials![id]} ${matLabel(id)}`)
  return parts.join(' · ') || t('a reward')
}

/** The Daily Dungeon portal: an access point (not a leveled facility). */
export function DailyPortal({ state, store }: { state: GameState; store: Store }) {
  const [last, setLast] = useState<{ cleared: boolean; text: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const dayIndex = worldDayIndex(toWorldTime(Date.now()))
  const dungeon = dailyDungeonFor(dayIndex)
  const unlocked = dailyUnlocked(state)
  const free = dailyAttemptsLeft(state)
  const paid = free === 0
  const canPay = !paid || state.gems >= DAILY.extraAttemptGemCost
  const disabled = !unlocked || !canPay

  function enter() {
    setErr(null)
    try {
      const now = Date.now() // one timestamp for preview + dispatch (results must match)
      const { result } = attemptDailyWithResult(state, now)
      store.dispatch({ type: 'ATTEMPT_DAILY' }, now)
      setLast({
        cleared: result.cleared,
        text:
          (result.cleared ? `${t('Cleared!')} ${rewardSummary(result.rewards)}` : t('Failed — no reward this run.')) +
          result.skillProgress.map((p) => ` ${skillProgressLine(p, store.getState() ?? state)}`).join(''),
      })
    } catch (e) {
      setErr(t(e instanceof Error ? e.message : 'Run failed'))
    }
  }

  return (
    <div className="lobby-portal">
      <div className="lp-head">
        <span className="lp-glyph">🌀</span>
        <span className="lp-name">{t('Daily Dungeon')}</span>
        <span className="lp-today">{t(dungeon.weekday)} · {t(dungeon.name)}</span>
      </div>
      <div className="lp-body">
        <span className="muted">
          {unlocked
            ? free === 1
              ? t('1 free attempt left')
              : t('{n} free attempts left', { n: free })
            : t('Clear floor {n} to unlock', { n: DAILY.unlockHighestCleared })}
        </span>
        <button className={`btn ${paid ? 'gem' : 'primary'} sm`} onClick={enter} disabled={disabled}>
          {!unlocked ? t('🔒 Locked') : paid ? `${t('Enter')} · ${DAILY.extraAttemptGemCost} 💎` : t('⚔ Enter today’s run')}
        </button>
      </div>
      {last && (
        <div className="lp-result" style={{ color: last.cleared ? 'var(--good)' : 'var(--ink-faint)' }}>
          {last.text}
        </div>
      )}
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}
