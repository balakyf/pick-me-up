import { useState } from 'react'
import type { FacilityId, GameState } from '../engine/types'
import type { Store } from '../engine/store'
import { TUNING } from '../engine/tuning'
import { upgradeCost, canUpgrade, unlockMasterLevel } from '../engine/facilities'
import { toWorldTime } from '../engine/time'
import { t, fmt } from './i18n/i18n'

/*
 * Shared by facilityPanels (every facility room) and legacy/MemorialPanel. It lives in
 * its own module so neither of those has to import the other's file: facilityPanels
 * renders MemorialPanel, and MemorialPanel used to import this from facilityPanels,
 * an import cycle (guarded by importCycles.test.ts).
 */

/** Human-readable "time left" for a build, promotion or training countdown (cosmetic; whole units). */
export function timeLeft(ms: number): string {
  if (ms <= 0) return t('finishing…')
  const mins = Math.ceil(ms / 60_000)
  if (mins < 60) return t('{m}m left', { m: mins })
  return t('{h}h {m}m left', { h: Math.floor(mins / 60), m: mins % 60 })
}

const FAC = TUNING.lobby.facilities

/** Upgrade control shared by every facility room: build/skip + Master-Level gating. */
export function UpgradeControl({ state, store, facility }: { state: GameState; store: Store; facility: FacilityId }) {
  const [err, setErr] = useState<string | null>(null)
  const f = state.facilities[facility]
  const nowWorld = toWorldTime(Date.now())

  function dispatch(cmd: Parameters<Store['dispatch']>[0]) {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
    } catch (e) {
      setErr(t(e instanceof Error ? e.message : 'Action failed'))
    }
  }

  // Build in progress → countdown + gem skip.
  if (f.build !== null) {
    return (
      <div className="lr-upgrade">
        <span className="muted">{t('⏳ Lv {toLevel} · {n}', { toLevel: f.build.toLevel, n: timeLeft(f.build.completesAtWorld - nowWorld) })}</span>
        <button
          className="btn gem sm"
          onClick={() => dispatch({ type: 'SKIP_TIMER', kind: 'facility', id: facility })}
          disabled={state.gems < FAC.skipGemCost}
        >
          ⏩ {FAC.skipGemCost} 💎
        </button>
      </div>
    )
  }

  const maxed = f.level >= FAC.maxLevel
  const unlockAt = unlockMasterLevel(facility)
  const chamberLocked = f.level === 0 && state.meta.masterLevel < unlockAt
  const mlCapped = !maxed && f.level >= state.meta.masterLevel
  const cost = upgradeCost(facility, f.level)
  const ok = canUpgrade(state, facility)
  const isBuild = f.level === 0

  const note = maxed
    ? t('Max level reached.')
    : chamberLocked
      ? t('Unlocks at Master Lv {unlockMasterLevel}.', { unlockMasterLevel: unlockAt })
      : mlCapped
        ? t('Raise Master Level to upgrade.')
        : state.gold < cost
          ? t('Not enough gold.')
          : t('Lv {n}: faster/stronger effects.', { n: f.level + 1 })

  return (
    <div className="lr-upgrade">
      <span className="lr-action-note">{note}</span>
      {!maxed && (
        <button className="btn sm" onClick={() => dispatch({ type: 'UPGRADE_FACILITY', facility })} disabled={!ok}>
          {isBuild ? t('🔨 Build') : t('⬆ Upgrade')} · {fmt(cost)} ◆
        </button>
      )}
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}
