import { useState } from 'react'
import type { GameState, OwnedHero, FacilityId } from '../engine/types'
import type { Store } from '../engine/store'
import { TUNING } from '../engine/tuning'
import { banquetWouldHelp } from '../engine/kitchen'
import { Portrait } from './bits'

/**
 * The Lobby (waiting room) — a single-screen diorama over the v2 lobby state
 * (facilities, Master Level, gems, per-hero Sanity). Heroes are placed into rooms
 * by their current state; placement + motion are purely cosmetic, so no game state
 * rides on them and determinism/saves stay clean.
 *
 * The Kitchen surfaces the live Banquet action (Phase 3 — spend gold to restore
 * roster Sanity). Remaining facility actions (upgrades, promotion, Daily Dungeon)
 * arrive in their own later phases.
 */

const SANITY_MAX = TUNING.lobby.sanityMax

/** Display-only Master-XP curve (spec §3.1): round(60 × L^1.8). UI math only. */
function masterXpToNext(level: number): number {
  return Math.round(60 * level ** 1.8)
}

type RoomId = FacilityId | 'courtyard'

const FACILITY_VIS: Record<FacilityId, { glyph: string; name: string; blurb: string }> = {
  kitchen: { glyph: '🍲', name: 'Kitchen', blurb: 'Restores Sanity — banquet the roster' },
  promotionChamber: { glyph: '⛩️', name: 'Promotion Chamber', blurb: 'Raise heroes past their star cap' },
  tacticalCenter: { glyph: '🗺️', name: 'Tactical Center', blurb: 'Focus & overlook combat levers' },
}

/** Decide which room a hero is "in" right now. Cosmetic, deterministic. */
function roomFor(hero: OwnedHero, partyIds: Set<string>): RoomId {
  if (hero.sanity < 60) return 'kitchen' // low morale → resting in the Kitchen
  if (hero.xp.atCap) return 'promotionChamber' // capped → waiting on promotion
  if (partyIds.has(hero.id)) return 'tacticalCenter' // on the active party → on duty
  return 'courtyard'
}

function sanityColor(s: number): string {
  if (s >= 60) return 'var(--good)'
  if (s >= 30) return 'var(--warn)'
  return 'var(--bad)'
}

function LobbyHero({ hero }: { hero: OwnedHero }) {
  const pct = Math.round((hero.sanity / SANITY_MAX) * 100)
  return (
    <div className="lobby-hero" title={`${hero.name} · Sanity ${hero.sanity}/${SANITY_MAX}`}>
      <div className="bob">
        <Portrait hero={hero} size="sm" />
      </div>
      <div className="lh-name">{hero.name.split(/\s+/)[0]}</div>
      <div className="lh-sanity">
        <span style={{ width: `${pct}%`, background: sanityColor(hero.sanity) }} />
      </div>
    </div>
  )
}

function Room({
  id,
  level,
  build,
  heroes,
  action,
}: {
  id: FacilityId
  level: number
  build: { toLevel: number; completesAtWorld: number } | null
  heroes: OwnedHero[]
  action?: React.ReactNode
}) {
  const vis = FACILITY_VIS[id]
  const locked = level === 0
  return (
    <div className={`lobby-room ${locked ? 'locked' : ''}`}>
      <div className="lr-head">
        <span className="lr-glyph">{vis.glyph}</span>
        <span className="lr-name">{vis.name}</span>
        <span className="lr-lvl">{locked ? '🔒 Locked' : `Lv ${level}`}</span>
      </div>
      <div className="lr-blurb">{locked ? 'Unlocks at Master Lv 3' : vis.blurb}</div>
      {build && <div className="lr-build">⏳ Upgrading to Lv {build.toLevel}…</div>}
      {action}
      <div className="lr-floor">
        {heroes.length === 0 ? (
          <span className="lr-empty">— empty —</span>
        ) : (
          heroes.map((h) => <LobbyHero key={h.id} hero={h} />)
        )}
      </div>
    </div>
  )
}

const BANQUET = TUNING.lobby.banquet

/** The Kitchen's interactive Banquet action: spend gold → roster-wide Sanity. */
function BanquetAction({ state, store }: { state: GameState; store: Store }) {
  const [err, setErr] = useState<string | null>(null)
  const canAfford = state.gold >= BANQUET.gold
  const helps = banquetWouldHelp(state)
  const disabled = !canAfford || !helps

  function hold() {
    setErr(null)
    try {
      store.dispatch({ type: 'BANQUET' }, Date.now())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Banquet failed')
    }
  }

  return (
    <div className="lr-action">
      <button className="btn gold sm" onClick={hold} disabled={disabled}>
        🍴 Banquet · {BANQUET.gold.toLocaleString()} ◆
      </button>
      <div className="lr-action-note">
        {!canAfford
          ? 'Not enough gold.'
          : !helps
            ? 'Everyone is at full morale.'
            : `+${BANQUET.restore} Sanity to all living heroes.`}
      </div>
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

export function LobbyScreen({ state, store }: { state: GameState; store: Store }) {
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const partyIds = new Set(state.party.slots.filter(Boolean) as string[])

  const byRoom: Record<RoomId, OwnedHero[]> = {
    kitchen: [],
    promotionChamber: [],
    tacticalCenter: [],
    courtyard: [],
  }
  for (const h of living) byRoom[roomFor(h, partyIds)].push(h)

  const ml = state.meta.masterLevel
  const toNext = masterXpToNext(ml)
  const mlPct = Math.min(100, Math.round((state.meta.masterXp / toNext) * 100))
  const facilityOrder: FacilityId[] = ['kitchen', 'tacticalCenter', 'promotionChamber']

  return (
    <div className="screen">
      <h2>Waiting Room</h2>
      <p className="sub">
        Your heroes live here between climbs. Where they stand reflects what they're doing and how they feel.
      </p>

      {/* Master Level spine + currencies */}
      <div className="lobby-meta">
        <div className="ml-block">
          <div className="ml-top">
            <span className="ml-badge">★ Master Lv {ml}</span>
            <span className="muted">{state.meta.masterXp} / {toNext} XP</span>
          </div>
          <div className="bar">
            <span style={{ width: `${mlPct}%`, background: 'var(--accent-2)' }} />
          </div>
        </div>
        <div className="lobby-currencies">
          <span className="pill gold">◆ {state.gold.toLocaleString()}</span>
          <span className="pill gem">💎 {state.gems.toLocaleString()}</span>
        </div>
      </div>

      {/* The diorama */}
      <div className="lobby-diorama">
        {facilityOrder.map((id) => (
          <Room
            key={id}
            id={id}
            level={state.facilities[id].level}
            build={state.facilities[id].build}
            heroes={byRoom[id]}
            action={id === 'kitchen' ? <BanquetAction state={state} store={store} /> : undefined}
          />
        ))}
      </div>

      {/* Courtyard — everyone off-duty */}
      <div className="lobby-courtyard">
        <div className="lc-head">🌿 Courtyard <span className="muted">— off duty</span></div>
        <div className="lr-floor">
          {byRoom.courtyard.length === 0 ? (
            <span className="lr-empty">Nobody's lounging right now.</span>
          ) : (
            byRoom.courtyard.map((h) => <LobbyHero key={h.id} hero={h} />)
          )}
        </div>
      </div>

      {living.length === 0 && (
        <div className="empty" style={{ marginTop: 16 }}>
          No living heroes yet — visit the Summon tab to recruit your first.
        </div>
      )}
    </div>
  )
}
