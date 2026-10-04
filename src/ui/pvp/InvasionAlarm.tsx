/**
 * Lane Q: when the Master comes home to an invasion they have not seen, the lobby raises an
 * alarm — who came, from which guild, and how it went — with "Watch" to play the battle on
 * stage behind the raider's banner. Which invasions were seen is a per-browser convenience
 * (localStorage, keyed by account); the battle itself lives in the save.
 */
import { useState } from 'react'
import type { GameState, InvasionRecord } from '../../engine/types'
import { findRival, guildById, pvpReplayLog } from '../../engine/pvp'
import { t } from '../i18n/i18n'
import { CrestImg } from './RivalCardView'
import { invasionCard, invasionKey, unseenInvasions } from './pvpModel'
import { playOnStage } from './stageBus'
import { logNote } from './pvpText'
import './pvp.css'

const KEY = 'pmu.pvp.seen.'

function readSeen(account: string): Set<string> {
  try {
    const raw = localStorage.getItem(KEY + account)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function writeSeen(account: string, seen: Set<string>): void {
  try {
    localStorage.setItem(KEY + account, JSON.stringify([...seen].slice(-40)))
  } catch {
    // A private window: the alarm simply comes back next time.
  }
}

/** Play an invasion's battle on stage (from the alarm or the PvP log). */
export function watchInvasion(state: GameState, rec: InvasionRecord, onDone?: () => void): void {
  if (!rec.replay) return
  const rival = rec.rivalId ? findRival(state, rec.rivalId) : undefined
  playOnStage({
    card: invasionCard(rec, rival),
    logs: [pvpReplayLog(rec.replay)],
    banner: { win: t('THE DEFENSE HELD'), lose: t('THE DEFENSE FELL'), sub: t('Nobody dies in PvP. The fallen are carried off.') },
    onDone,
  })
}

export function InvasionAlarm({ state }: { state: GameState }) {
  const [seen, setSeen] = useState(() => readSeen(state.accountId))
  const fresh = unseenInvasions(state.pvp.log, seen)
  if (fresh.length === 0) return null
  const rec = fresh[0]!
  const g = guildById(rec.guildId ?? null)
  const mark = (all: boolean) => {
    const next = new Set(seen)
    for (const r of all ? fresh : [rec]) next.add(invasionKey(r))
    writeSeen(state.accountId, next)
    setSeen(next)
  }
  return (
    <div className={`invasion-alarm ${rec.won ? 'held' : 'fell'}`} role="alert">
      <CrestImg guildId={rec.guildId ?? null} scale={1} />
      <div className="ia-text">
        <b>{rec.won ? t('Invasion repelled') : t('Your lobby was raided')}</b>
        <span>
          {rec.rival}
          {g && <span className="muted"> · {t(g.name)}</span>} {logNote(rec.note)}
          {rec.goldDelta < 0 && <span className="muted"> ({rec.goldDelta.toLocaleString()} ◆)</span>}
        </span>
        {fresh.length > 1 && <span className="muted small">{t('+{n} more in the PvP log', { n: fresh.length - 1 })}</span>}
      </div>
      <button className="pbtn sm" onClick={() => (mark(false), watchInvasion(state, rec))}>
        ▸ {t('Watch')}
      </button>
      <button className="pbtn sm ghost" onClick={() => mark(true)}>
        {t('Later')}
      </button>
    </div>
  )
}
