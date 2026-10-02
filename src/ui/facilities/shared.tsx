import { useState } from 'react'
import type { GameState, OwnedHero, FacilityId } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { upgradeCost, canUpgrade, unlockMasterLevel } from '../../engine/facilities'
import { toWorldTime } from '../../engine/time'
import { Portrait } from '../bits'
import { t } from '../i18n/i18n'

/**
 * Pieces shared by the facility panels (src/ui/facilities/*): where a hero "is", the
 * morale colour, the occupant chips, countdowns, material labels, the hero chip used by
 * the pickers, and the build/upgrade control every room carries.
 */

const SANITY_MAX = TUNING.lobby.sanityMax

/** Decide which room a hero is "in" right now. Cosmetic, deterministic. */
export function roomFor(
  hero: OwnedHero,
  partyIds: Set<string>,
): 'kitchen' | 'promotionChamber' | 'tacticalCenter' | 'hall' | 'training' {
  if (hero.training !== null) return 'training' // mid-drill → in the Training Yard
  if (hero.sanity < 60) return 'kitchen' // low morale → resting in the Kitchen
  if (hero.xp.atCap) return 'promotionChamber' // capped → waiting on promotion
  if (partyIds.has(hero.id)) return 'tacticalCenter' // on the active party → on duty
  return 'hall'
}

export function sanityColor(s: number): string {
  if (s >= 60) return 'var(--good)'
  if (s >= 30) return 'var(--warn)'
  return 'var(--bad)'
}

/** Heroes currently in a room, as bust chips with their morale gauge. */
export function Occupants({ heroes, empty }: { heroes: OwnedHero[]; empty: string }) {
  if (heroes.length === 0) return <div className="lr-empty">{empty}</div>
  return (
    <div className="occupants">
      {heroes.map((h) => (
        <div key={h.id} className="occupant" title={`${h.name} · ${t('Sanity')} ${h.sanity}/${SANITY_MAX}`}>
          <Portrait hero={h} size="sm" />
          <span className="lh-name">{h.name.split(/\s+/)[0]}</span>
          <span className="lh-sanity">
            <span style={{ width: `${Math.round((h.sanity / SANITY_MAX) * 100)}%`, background: sanityColor(h.sanity) }} />
          </span>
        </div>
      ))}
    </div>
  )
}

/** Human-readable "time left" for a promotion countdown (cosmetic; whole units). */
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
          {isBuild ? '🔨 Build' : '⬆ Upgrade'} · {cost.toLocaleString()} ◆
        </button>
      )}
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

const MAT_LABEL: Record<string, string> = {
  promotionStone: '🪨 Stone',
  rankMaterial: '📦 Rank Mat',
  bookOfReverseHeaven: '📕 Book of Reverse Heaven',
}
export const matLabel = (id: string): string =>
  MAT_LABEL[id] !== undefined ? t(MAT_LABEL[id]) : id.startsWith('attrStone_') ? `🔹 ${id.slice('attrStone_'.length)}` : id

/** A clickable hero chip used by the synthesis pickers. */
export function HeroChip({
  hero,
  selected,
  onClick,
  label,
}: {
  hero: OwnedHero
  selected: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      className={`syn-chip ${selected ? 'sel' : ''}`}
      onClick={onClick}
      title={`${hero.name} · ${hero.star}★ · Sanity ${hero.sanity}`}
    >
      <Portrait hero={hero} size="sm" />
      <span className="syn-chip-name">{hero.name.split(/\s+/)[0]}</span>
      {label && <span className="muted"> {label}</span>}
    </button>
  )
}
