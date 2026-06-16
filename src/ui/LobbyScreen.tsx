import { useState, useEffect } from 'react'
import type { GameState, OwnedHero, FacilityId, HeroId, EquipmentSlot, Command } from '../engine/types'
import type { Store } from '../engine/store'
import { TUNING } from '../engine/tuning'
import { banquetWouldHelp } from '../engine/kitchen'
import { canPromote, canAfford, promotionCost, promotionTargetStar } from '../engine/promotion'
import { tacticalFocusBonus, tacticalOverlookSlots } from '../engine/tactical'
import { masterXpToNext } from '../engine/master'
import { upgradeCost, canUpgrade } from '../engine/facilities'
import { worldDayIndex, dailyDungeonFor, dailyUnlocked, dailyAttemptsLeft } from '../engine/daily'
import type { DailyReward } from '../engine/daily'
import { attemptDailyWithResult } from '../engine/store'
import { toWorldTime } from '../engine/time'
import { canSynthesize, synthesisPreview, synthesisUnlocked, type SynthesisInput } from '../engine/synthesis'
import { smithyUnlocked, forgeGrade, forgeCost, canCraft, itemName, equippedItemIds } from '../engine/equipment'
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
  // A level-0 room with no actions is "locked" (needs building); the Promotion
  // Chamber is usable at Lv 0 (promotion gates on the hero, not the build), so it
  // ships actions and reads as operational at base speed.
  const locked = level === 0 && action == null
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

const SKIP_GEMS = TUNING.lobby.promotion.skipGemCost

/** Human-readable "time left" for a promotion countdown (cosmetic; whole units). */
function timeLeft(ms: number): string {
  if (ms <= 0) return 'finishing…'
  const mins = Math.ceil(ms / 60_000)
  if (mins < 60) return `${mins}m left`
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`
}

/** The Promotion Chamber's actions: promote at-cap heroes, or skip a running timer. */
function PromotionAction({ state, store }: { state: GameState; store: Store }) {
  const [err, setErr] = useState<string | null>(null)
  const nowWorld = toWorldTime(Date.now())
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const promoting = living.filter((h) => h.promotion !== null)
  const ready = living.filter(canPromote)

  function dispatch(cmd: Parameters<Store['dispatch']>[0]) {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed')
    }
  }

  if (promoting.length === 0 && ready.length === 0) {
    return <div className="lr-action-note">No heroes are at their star cap yet — keep climbing.</div>
  }

  return (
    <div className="lr-action promo-action">
      {promoting.map((h) => (
        <div key={h.id} className="promo-row">
          <span className="promo-name">{h.name.split(/\s+/)[0]} → {promotionTargetStar(h)}★</span>
          <span className="muted">{timeLeft(h.promotion!.completesAtWorld - nowWorld)}</span>
          <button
            className="btn gem sm"
            onClick={() => dispatch({ type: 'SKIP_TIMER', kind: 'promotion', id: h.id })}
            disabled={state.gems < SKIP_GEMS}
            title={`Finish now for ${SKIP_GEMS} gems`}
          >
            ⏩ {SKIP_GEMS} 💎
          </button>
        </div>
      ))}
      {ready.map((h) => {
        const cost = promotionCost(h)
        const affordable = canAfford(state, h)
        return (
          <div key={h.id} className="promo-row">
            <span className="promo-name">{h.name.split(/\s+/)[0]} → {promotionTargetStar(h)}★</span>
            <span className="muted">
              {cost.promotionStone}🪨 {cost[`attrStone_${h.element}`]}🔹
            </span>
            <button
              className="btn sm"
              onClick={() => dispatch({ type: 'PROMOTE_HERO', heroId: h.id })}
              disabled={!affordable}
              title={affordable ? 'Begin promotion' : 'Not enough materials'}
            >
              ⬆ Promote
            </button>
          </div>
        )
      })}
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

const FAC = TUNING.lobby.facilities

/** Upgrade control shared by every facility room: build/skip + Master-Level gating. */
function UpgradeControl({ state, store, facility }: { state: GameState; store: Store; facility: FacilityId }) {
  const [err, setErr] = useState<string | null>(null)
  const f = state.facilities[facility]
  const nowWorld = toWorldTime(Date.now())

  function dispatch(cmd: Parameters<Store['dispatch']>[0]) {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed')
    }
  }

  // Build in progress → countdown + gem skip.
  if (f.build !== null) {
    return (
      <div className="lr-upgrade">
        <span className="muted">⏳ Lv {f.build.toLevel} · {timeLeft(f.build.completesAtWorld - nowWorld)}</span>
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
  const chamberLocked = facility === 'promotionChamber' && f.level === 0 && state.meta.masterLevel < FAC.chamberUnlockMasterLevel
  const mlCapped = !maxed && f.level >= state.meta.masterLevel
  const cost = upgradeCost(facility, f.level)
  const ok = canUpgrade(state, facility)
  const isBuild = facility === 'promotionChamber' && f.level === 0

  const note = maxed
    ? 'Max level reached.'
    : chamberLocked
      ? `Unlocks at Master Lv ${FAC.chamberUnlockMasterLevel}.`
      : mlCapped
        ? 'Raise Master Level to upgrade.'
        : state.gold < cost
          ? 'Not enough gold.'
          : `Lv ${f.level + 1}: faster/stronger effects.`

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

/** The Tactical Center's current combat levers (read-only; upgrades deferred). */
function TacticalAction({ state }: { state: GameState }) {
  const level = state.facilities.tacticalCenter.level
  const bonusPct = Math.round(tacticalFocusBonus(level) * 100)
  const slots = tacticalOverlookSlots(level)
  return (
    <div className="lr-action tactical-action">
      <div className="ta-row"><span>🎯 Focus damage</span><span className="ta-val">+{bonusPct}%</span></div>
      <div className="ta-row"><span>🛡 Overlook slots</span><span className="ta-val">{slots}</span></div>
      <div className="lr-action-note">Mark a target in the Tower to concentrate fire.</div>
    </div>
  )
}

const DAILY = TUNING.lobby.daily
const MAT_LABEL: Record<string, string> = { promotionStone: '🪨 Stone', rankMaterial: '📦 Rank Mat' }
const matLabel = (id: string): string =>
  MAT_LABEL[id] ?? (id.startsWith('attrStone_') ? `🔹 ${id.slice('attrStone_'.length)}` : id)

/** One-line summary of a daily reward bundle. */
function rewardSummary(r: DailyReward): string {
  const parts: string[] = []
  if (r.gold) parts.push(`+${r.gold.toLocaleString()} ◆`)
  if (r.gems) parts.push(`+${r.gems} 💎`)
  if (r.heroXp) parts.push(`+${r.heroXp} XP`)
  for (const id of Object.keys(r.materials ?? {})) parts.push(`+${r.materials![id]} ${matLabel(id)}`)
  return parts.join(' · ') || 'a reward'
}

/** The Daily Dungeon portal: an access point (not a leveled facility). */
function DailyPortal({ state, store }: { state: GameState; store: Store }) {
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
        text: result.cleared ? `Cleared! ${rewardSummary(result.rewards)}` : 'Failed — no reward this run.',
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Run failed')
    }
  }

  return (
    <div className="lobby-portal">
      <div className="lp-head">
        <span className="lp-glyph">🌀</span>
        <span className="lp-name">Daily Dungeon</span>
        <span className="lp-today">{dungeon.weekday} · {dungeon.name}</span>
      </div>
      <div className="lp-body">
        <span className="muted">
          {unlocked ? `${free} free attempt${free === 1 ? '' : 's'} left` : `Clear floor ${DAILY.unlockHighestCleared} to unlock`}
        </span>
        <button className={`btn ${paid ? 'gem' : 'primary'} sm`} onClick={enter} disabled={disabled}>
          {!unlocked ? '🔒 Locked' : paid ? `Enter · ${DAILY.extraAttemptGemCost} 💎` : '⚔ Enter today’s run'}
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

const SYN = TUNING.lobby.synthesis

/** A clickable hero chip used by the synthesis pickers. */
function HeroChip({
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

/** The Synthesis Chamber — closed-door, ML-gated. Transfer or Salvage heroes. */
function SynthesisChamber({ state, store }: { state: GameState; store: Store }) {
  const [mode, setMode] = useState<'transfer' | 'salvage'>('salvage')
  const [survivorId, setSurvivorId] = useState<HeroId | null>(null)
  const [sacrificeIds, setSacrificeIds] = useState<HeroId[]>([])
  const [confirming, setConfirming] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const unlocked = synthesisUnlocked(state)
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)

  if (!unlocked) {
    return (
      <div className="lobby-portal synth-portal locked">
        <div className="lp-head">
          <span className="lp-glyph">🧪</span>
          <span className="lp-name">Synthesis Chamber</span>
          <span className="muted">— the door stays shut</span>
        </div>
        <div className="lr-blurb">Unlocks at Master Lv {SYN.unlockMasterLevel}.</div>
      </div>
    )
  }

  const reset = () => { setSacrificeIds([]); setSurvivorId(null); setConfirming(false); setErr(null) }
  const toggleSac = (id: HeroId) => {
    setConfirming(false)
    setSacrificeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }
  const chooseSurvivor = (id: HeroId) => {
    setConfirming(false)
    setSurvivorId((cur) => (cur === id ? null : id))
    setSacrificeIds((cur) => cur.filter((x) => x !== id)) // a survivor can't also be a sacrifice
  }

  const input: SynthesisInput = { mode, survivorId, sacrificeIds }
  const valid = canSynthesize(state, input)
  const preview = valid ? synthesisPreview(state, input) : null

  function run() {
    setErr(null)
    try {
      store.dispatch({ type: 'SYNTHESIZE', mode, survivorId, sacrificeIds }, Date.now())
      reset()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Synthesis failed')
    }
  }

  const sacrificeable = living.filter((h) => h.id !== survivorId && h.promotion === null)

  return (
    <div className="lobby-portal synth-portal">
      <div className="lp-head">
        <span className="lp-glyph">🧪</span>
        <span className="lp-name">Synthesis Chamber</span>
        <span className="muted">— the Master can’t watch</span>
      </div>

      <div className="syn-modes">
        <button className={`btn sm ${mode === 'salvage' ? 'primary' : ''}`} onClick={() => { setMode('salvage'); setConfirming(false) }}>
          ♻ Salvage
        </button>
        <button className={`btn sm ${mode === 'transfer' ? 'primary' : ''}`} onClick={() => { setMode('transfer'); setConfirming(false) }}>
          ⇄ Transfer
        </button>
      </div>

      <div className="syn-section">
        <div className="syn-label">
          {mode === 'transfer' ? 'Survivor (required)' : 'Rescue onto (optional)'}
        </div>
        <div className="syn-row">
          {living.map((h) => (
            <HeroChip key={h.id} hero={h} selected={survivorId === h.id} onClick={() => chooseSurvivor(h.id)} />
          ))}
        </div>
      </div>

      <div className="syn-section">
        <div className="syn-label">Sacrifices (permanently destroyed)</div>
        <div className="syn-row">
          {sacrificeable.map((h) => (
            <HeroChip key={h.id} hero={h} selected={sacrificeIds.includes(h.id)} onClick={() => toggleSac(h.id)} />
          ))}
        </div>
      </div>

      {preview && (
        <div className="syn-preview">
          {mode === 'transfer' ? (
            <span>
              {Object.keys(preview.gradeDeltas).length > 0
                ? 'Grades ' + Object.entries(preview.gradeDeltas).map(([k, v]) => `${k} +${v}`).join(', ')
                : 'No grade gain'}
              {' · '}{Math.round(preview.skillCopyChance * 100)}% skill copy/sac
            </span>
          ) : (
            <span>
              Yields {Object.entries(preview.materialYield).map(([k, v]) => `${v} × ${matLabel(k)}`).join(', ') || '—'}
              {preview.rescue ? ` · rescue ${preview.rescue}` : ''}
            </span>
          )}
          <span className="muted"> · −{preview.survivorSanityCost} survivor / −{preview.witnessSanityCost} witness Sanity</span>
        </div>
      )}

      <div className="syn-actions">
        {!confirming ? (
          <button className="btn sm" disabled={!valid} onClick={() => setConfirming(true)}>
            {mode === 'transfer' ? '⇄ Synthesize' : '♻ Render'}
          </button>
        ) : (
          <>
            <button className="btn sm syn-destroy" onClick={run}>
              Permanently destroy {sacrificeIds.length} hero{sacrificeIds.length === 1 ? '' : 'es'}
            </button>
            <button className="btn sm" onClick={() => setConfirming(false)}>Cancel</button>
          </>
        )}
      </div>
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

const EQUIP = TUNING.lobby.equipment
const EQUIP_SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'accessory']
const SLOT_GLYPH: Record<EquipmentSlot, string> = { weapon: '⚔', armor: '🛡', accessory: '💍' }

/** The Armory — the ML-gated Smithy forge plus per-hero equip/unequip (Layer 1 §5). */
function Armory({ state, store }: { state: GameState; store: Store }) {
  const [err, setErr] = useState<string | null>(null)

  if (!smithyUnlocked(state)) {
    return (
      <div className="lobby-portal armory-portal locked">
        <div className="lp-head">
          <span className="lp-glyph">🛠</span>
          <span className="lp-name">Armory</span>
          <span className="muted">— the forge is cold</span>
        </div>
        <div className="lr-blurb">Unlocks at Master Lv {EQUIP.unlockMasterLevel}.</div>
      </div>
    )
  }

  const grade = forgeGrade(state.meta.masterLevel)
  const cost = forgeCost(grade)
  const affordable = canCraft(state)
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const equipped = equippedItemIds(state)
  const freeItems = state.inventory.filter((i) => !equipped.has(i.id))

  const run = (cmd: Command, fail: string) => {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
    } catch (e) {
      setErr(e instanceof Error ? e.message : fail)
    }
  }

  return (
    <div className="lobby-portal armory-portal">
      <div className="lp-head">
        <span className="lp-glyph">🛠</span>
        <span className="lp-name">Armory</span>
        <span className="muted">— forge &amp; equip</span>
      </div>

      {/* Forge — one button per slot, each forging the best grade the Master Level allows. */}
      <div className="syn-section">
        <div className="syn-label">
          Forge · grade {grade} · ◆ {cost.gold.toLocaleString()} + {cost.promotionStone} stone{cost.promotionStone === 1 ? '' : 's'}
        </div>
        <div className="syn-modes">
          {EQUIP_SLOTS.map((slot) => (
            <button
              key={slot}
              className="btn sm"
              disabled={!affordable}
              onClick={() => run({ type: 'CRAFT_EQUIPMENT', slot }, 'Forge failed')}
              title={`Forge a ${itemName(slot, grade)}`}
            >
              {SLOT_GLYPH[slot]} {itemName(slot, grade)}
            </button>
          ))}
        </div>
        {!affordable && <div className="lr-action-note muted">Not enough gold or Promotion Stones to forge.</div>}
      </div>

      {/* Forged items not currently worn by anyone. */}
      <div className="syn-section">
        <div className="syn-label">Forged &amp; free ({freeItems.length})</div>
        <div className="syn-row">
          {freeItems.length === 0 ? (
            <span className="lr-empty">Nothing forged yet.</span>
          ) : (
            freeItems.map((it) => (
              <span key={it.id} className="arm-item" title={`${it.name} · ${it.slot}`}>
                {SLOT_GLYPH[it.slot]} {it.name}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Per-hero loadout — one control per slot: unequip what's worn, else equip the first free fit. */}
      <div className="syn-section">
        <div className="syn-label">Loadouts</div>
        {living.map((h) => (
          <div key={h.id} className="arm-hero">
            <span className="arm-hero-name">{h.name.split(/\s+/)[0]}</span>
            {EQUIP_SLOTS.map((slot) => {
              const wornId = h.equipment[slot]
              const worn = wornId ? state.inventory.find((i) => i.id === wornId) ?? null : null
              const candidate = freeItems.find((i) => i.slot === slot) ?? null
              if (worn) {
                return (
                  <button
                    key={slot}
                    className="btn sm arm-slot"
                    onClick={() => run({ type: 'UNEQUIP_ITEM', heroId: h.id, slot }, 'Unequip failed')}
                    title={`Unequip ${worn.name}`}
                  >
                    {SLOT_GLYPH[slot]} {worn.name} ✕
                  </button>
                )
              }
              if (candidate) {
                return (
                  <button
                    key={slot}
                    className="btn sm arm-slot"
                    onClick={() => run({ type: 'EQUIP_ITEM', heroId: h.id, itemId: candidate.id }, 'Equip failed')}
                    title={`Equip ${candidate.name}`}
                  >
                    {SLOT_GLYPH[slot]} + {candidate.name}
                  </button>
                )
              }
              return (
                <span key={slot} className="arm-slot muted">
                  {SLOT_GLYPH[slot]} —
                </span>
              )
            })}
          </div>
        ))}
      </div>

      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

export function LobbyScreen({ state, store }: { state: GameState; store: Store }) {
  // Live tick: while the lobby is open, pump the world clock once a second. This
  // both refreshes the cosmetic countdowns (a re-render with a fresh Date.now())
  // and lets advanceTime actually COMPLETE due timers — promotions finishing, the
  // daily attempt counter resetting, Sanity regenerating — without a manual action.
  useEffect(() => {
    const id = setInterval(() => store.dispatch({ type: 'TICK' }, Date.now()), 1000)
    return () => clearInterval(id)
  }, [store])

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
            action={
              <>
                {id === 'kitchen' && <BanquetAction state={state} store={store} />}
                {id === 'promotionChamber' && <PromotionAction state={state} store={store} />}
                {id === 'tacticalCenter' && <TacticalAction state={state} />}
                <UpgradeControl state={state} store={store} facility={id} />
              </>
            }
          />
        ))}
      </div>

      {/* Daily Dungeon portal — an access point, not a leveled facility */}
      <DailyPortal state={state} store={store} />

      {/* Synthesis Chamber — a closed-door access point, not a leveled facility */}
      <SynthesisChamber state={state} store={store} />

      {/* Armory — the Smithy forge + per-hero equip/unequip (an access point, not a leveled facility) */}
      <Armory state={state} store={store} />

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
