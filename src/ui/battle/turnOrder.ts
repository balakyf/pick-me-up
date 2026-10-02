/**
 * The turn order, pure: who acts next. Combat is an ATB loop (engine/combat runBattle):
 * every tick each living unit's action gauge fills by its speed, and everyone at or past
 * `actionGaugeMax` acts, highest gauge first (ties by id), paying the max back. This
 * replays those gauges from each unit's `spd` (CombatUnitInit.spd) along the log — who is
 * on the field, who fell, which turns were taken — and then runs them forward to name the
 * next few actors.
 *
 * Turns the log does not show (an escort never acts; a sleeping giant waits for its wake;
 * a unit with nothing to strike fizzles) are inferred: when a unit acts, everyone ranked
 * ahead of it that tick must have spent a silent turn. A foe that spends one is taken to be
 * dormant until its 'wakes' beat, and left out of the forecast meanwhile.
 *
 * What the gauges cannot know ahead: deaths and new waves (the forecast assumes the field
 * stays as it is), and anything that bends speed or skips turns mid-fight beyond the
 * floor's Gale and the statuses the log announces (a stun pushes the gauge back; a speed
 * buff or debuff bends the fill, as the engine does). A turn the replay did not expect is
 * counted in `divergences` and the gauges are resynchronised on the spot.
 *
 * Lane G: a foe winding up a big move spends its turn on the 'telegraph' and its gauge
 * stands still until the move fires at the start of its tick (a charged 'act', not a turn of
 * its own) — the strip names it there; a stun or a death cancels it. Summoned units join with
 * an empty gauge, a boss's phase may change its speed, and an Unleash order fills a hero's
 * gauge before the tick's fill, as the engine does.
 */
import type { CombatLog, CombatUnitInit, FloorModifierId } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { modSpeed } from '../../engine/depth/floorMods'

const MAX = TUNING.combat.actionGaugeMax

export interface GaugeState {
  /** The tick the replay stands in (its gauges already filled for it). */
  tick: number
  gauge: Map<string, number>
  /** Living units on the field. */
  alive: Set<string>
  /** Foes that spent a silent turn and have not woken since. */
  dormant: Set<string>
  mods: FloorModifierId[]
  /** Speed buffs and debuffs standing on each unit (percent; one of each at most) and the
   *  tick each wears off (a status applied in tick T for n ticks expires at the top of T+n). */
  spdPct: Map<string, { up: number; upEnd: number; down: number; downEnd: number }>
  /** Turns that came out of order (0 for every log the engine writes today). */
  divergences: number
  /** Foes winding up a move, and the tick it fires (their gauges stand still). */
  charging: Map<string, number>
  /** Moves that fire at the start of the current tick and have not fired in the log yet. */
  fireDue: Set<string>
  /** Speeds a boss phase changed (unit id → its new spd). */
  spd: Map<string, number>
}

const byIdOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function rank(st: GaugeState): string[] {
  const out: string[] = []
  for (const id of st.alive) if (!st.charging.has(id) && (st.gauge.get(id) ?? 0) >= MAX) out.push(id)
  return out.sort((a, b) => {
    const ga = st.gauge.get(a) ?? 0
    const gb = st.gauge.get(b) ?? 0
    return ga !== gb ? gb - ga : byIdOrder(a, b)
  })
}

/** A unit's gauge fill per tick: the engine's speedOf (floor mods, then speed statuses). */
function speedOf(st: GaugeState, units: Map<string, CombatUnitInit>, id: string): number {
  const base = modSpeed(st.mods, st.spd.get(id) ?? units.get(id)?.spd ?? 0)
  const m = st.spdPct.get(id)
  // A status that wears off in this tick is gone before the gauges fill.
  const pct = m ? (m.upEnd > st.tick ? m.up : 0) - (m.downEnd > st.tick ? m.down : 0) : 0
  return pct === 0 ? base : Math.floor((base * Math.max(10, 100 + pct)) / 100)
}

function fill(st: GaugeState, units: Map<string, CombatUnitInit>): void {
  for (const id of st.alive) if (!st.charging.has(id)) st.gauge.set(id, (st.gauge.get(id) ?? 0) + speedOf(st, units, id))
}

/** Step into the next tick: the moves due fire (their casters' gauges run again), then the fill. */
function nextTick(st: GaugeState, units: Map<string, CombatUnitInit>): string[] {
  st.tick++
  const fired: string[] = []
  for (const [id, at] of st.charging) if (at <= st.tick) fired.push(id)
  fired.sort(byIdOrder)
  st.fireDue.clear()
  for (const id of fired) {
    st.charging.delete(id)
    if (st.alive.has(id)) st.fireDue.add(id)
  }
  fill(st, units)
  return fired.filter((id) => st.alive.has(id))
}

/** Replay the gauges through the first `applied` events of the log. */
export function replayGauges(log: CombatLog, applied: number): GaugeState {
  const units = new Map(log.unitsInit.map((u) => [u.id, u]))
  const st: GaugeState = {
    tick: 0,
    gauge: new Map(),
    alive: new Set(),
    dormant: new Set(),
    mods: [],
    spdPct: new Map(),
    divergences: 0,
    charging: new Map(),
    fireDue: new Set(),
    spd: new Map(),
  }
  const silent = (id: string) => {
    st.gauge.set(id, (st.gauge.get(id) ?? 0) - MAX)
    const u = units.get(id)
    if (u && u.side === 'enemy') st.dormant.add(id)
  }
  const take = (id: string) => {
    for (let guard = 0; guard < 64; guard++) {
      const ready = rank(st)
      if (!ready.includes(id)) break
      if (ready[0] === id) {
        st.gauge.set(id, (st.gauge.get(id) ?? 0) - MAX)
        st.dormant.delete(id)
        return
      }
      silent(ready[0]!)
    }
    // Out of order: count it and resynchronise.
    st.divergences++
    st.gauge.set(id, Math.max(0, (st.gauge.get(id) ?? 0) - MAX))
    st.dormant.delete(id)
  }
  const endSpd = (unitId: string, status: string) => {
    const m = st.spdPct.get(unitId)
    if (m) st.spdPct.set(unitId, status === 'spd-up' ? { ...m, up: 0, upEnd: 0 } : { ...m, down: 0, downEnd: 0 })
  }
  const advanceTo = (tick: number) => {
    while (st.tick < tick) {
      // Whoever is still ready when a tick ends spent a silent turn in it.
      for (let r = rank(st); r.length > 0; r = rank(st)) silent(r[0]!)
      nextTick(st, units)
    }
  }
  // A sleeping giant is dormant from the moment it arrives: one that wakes later in the
  // log, or one that outlasts the whole fight without ever acting.
  const acted = new Set<string>()
  const fell = new Set<string>()
  const wakesAt = new Map<string, number>()
  log.events.forEach((e, i) => {
    if (e.kind === 'act' || e.kind === 'telegraph') acted.add(e.kind === 'act' ? e.actorId : e.unitId)
    else if (e.kind === 'panic') acted.add(e.unitId)
    else if (e.kind === 'death') fell.add(e.unitId)
    else if (e.kind === 'mission' && e.code === 'wakes' && e.params?.unitId !== undefined) wakesAt.set(e.params.unitId, i)
  })
  const sleepsOnArrival = (id: string) => units.get(id)?.side === 'enemy' && (wakesAt.has(id) || (!acted.has(id) && !fell.has(id)))
  const n = Math.min(applied, log.events.length)
  for (let i = 0; i < n; i++) {
    const e = log.events[i]!
    if (e.tick > st.tick) advanceTo(e.tick)
    switch (e.kind) {
      case 'battle-start':
        for (const id of [...e.heroIds, ...e.enemyIds]) {
          if ((units.get(id)?.startHP ?? 1) <= 0) continue
          st.alive.add(id)
          st.gauge.set(id, 0)
          if (sleepsOnArrival(id)) st.dormant.add(id)
        }
        break
      case 'floor-mods':
        st.mods = [...e.modifiers]
        break
      case 'wave-spawn':
      case 'summon':
        for (const id of e.enemyIds) {
          st.alive.add(id)
          st.gauge.set(id, 0)
          if (sleepsOnArrival(id)) st.dormant.add(id)
        }
        break
      case 'death':
        st.alive.delete(e.unitId)
        st.charging.delete(e.unitId)
        st.fireDue.delete(e.unitId)
        break
      case 'act':
        // A wound-up move firing on its tick is not a turn: the wind-up was.
        if (e.charged) st.fireDue.delete(e.actorId)
        else take(e.actorId)
        break
      case 'telegraph':
        take(e.unitId)
        st.charging.set(e.unitId, e.firesAtTick)
        break
      case 'telegraph-end':
        st.charging.delete(e.unitId)
        break
      case 'phase':
        if (e.spd !== undefined) st.spd.set(e.unitId, e.spd)
        break
      case 'order':
        // Unleash: the engine fills the hero's gauge to a whole turn before this tick's fill.
        if (e.order.kind === 'unleash' && st.alive.has(e.order.allyId)) {
          const id = e.order.allyId
          const sp = st.charging.has(id) ? 0 : speedOf(st, units, id)
          const pre = (st.gauge.get(id) ?? 0) - sp
          st.gauge.set(id, Math.max(pre, MAX) + sp)
        }
        break
      case 'panic':
        take(e.unitId)
        break
      case 'status': {
        if (e.status === 'stun') {
          // The engine pushes the gauge back by `value`% of a turn, never below its floor.
          const floor = -Math.floor((MAX * TUNING.roles.stunFloorPm) / 1000)
          const push = Math.floor((MAX * (e.value ?? 0)) / 100)
          st.gauge.set(e.unitId, Math.max(floor, (st.gauge.get(e.unitId) ?? 0) - push))
        } else if (e.status === 'spd-up' || e.status === 'spd-down') {
          const m = st.spdPct.get(e.unitId) ?? { up: 0, upEnd: 0, down: 0, downEnd: 0 }
          const end = e.tick + e.ticks
          st.spdPct.set(e.unitId, e.status === 'spd-up' ? { ...m, up: e.value ?? 0, upEnd: end } : { ...m, down: e.value ?? 0, downEnd: end })
        }
        break
      }
      case 'status-end':
        if (e.status === 'spd-up' || e.status === 'spd-down') endSpd(e.unitId, e.status)
        break
      case 'mission':
        if (e.code === 'wakes' && e.params?.unitId !== undefined) st.dormant.delete(e.params.unitId)
        break
      default:
        break
    }
  }
  return st
}

/**
 * The next `n` units to act after the first `applied` events, as the gauges stand: the rest
 * of this tick first, then tick by tick. Escorts (who never act) and dormant foes are left
 * out. Assumes nobody falls and no wave arrives meanwhile.
 */
export function upcomingTurns(log: CombatLog, applied: number, n = 6): string[] {
  const st = replayGauges(log, applied)
  const units = new Map(log.unitsInit.map((u) => [u.id, u]))
  const counts = (id: string) => !units.get(id)?.isNpc && !st.dormant.has(id)
  const anyMoves = [...st.alive].some((id) => counts(id) && speedOf(st, units, id) > 0)
  const out: string[] = []
  // A move due this tick fires before anyone acts.
  for (const id of [...st.fireDue].sort(byIdOrder)) if (out.length < n) out.push(id)
  if (!anyMoves && st.charging.size === 0) return out
  for (let guard = 0; out.length < n && guard < 20_000; guard++) {
    const ready = rank(st)
    if (ready.length === 0) {
      for (const id of nextTick(st, units)) if (out.length < n) out.push(id)
      continue
    }
    const id = ready[0]!
    st.gauge.set(id, (st.gauge.get(id) ?? 0) - MAX)
    if (counts(id)) out.push(id)
  }
  return out
}

/** The actors of the turns the log shows, in order ('act', 'panic', a wind-up, and a
 *  wound-up move firing), with their event index. */
export function loggedTurns(log: CombatLog): { index: number; unitId: string }[] {
  const out: { index: number; unitId: string }[] = []
  log.events.forEach((e, index) => {
    if (e.kind === 'act') out.push({ index, unitId: e.actorId })
    else if (e.kind === 'panic' || e.kind === 'telegraph') out.push({ index, unitId: e.unitId })
  })
  return out
}

/** Moves being wound up as the gauges stand after `applied` events: who, and when each fires. */
export function chargesAhead(log: CombatLog, applied: number): { unitId: string; firesAtTick: number }[] {
  const st = replayGauges(log, applied)
  return [...st.charging].map(([unitId, firesAtTick]) => ({ unitId, firesAtTick })).sort((a, b) => a.firesAtTick - b.firesAtTick || byIdOrder(a.unitId, b.unitId))
}
