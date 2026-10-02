/**
 * The boss bar's view (lane I), pure: which boss the bar follows on this frame, its HP, the
 * aegis charges it still holds, its phases (lane G's thresholds) and which are behind it, and
 * the clock that matters — an enrage coming (its own, or a looming foe's beside it), or the
 * mission's deadline. Read from the log played so far; BossBar.tsx only draws it.
 */
import type { CombatEvent, CombatLog, CombatUnitInit, KeywordTag } from '../../engine/types'
import { ENEMY_TEMPLATES } from '../../engine/content'
import { t } from '../i18n/i18n'
import { anchorKeywords, bossName, introOf, phasesOf } from './bossIntro'
import { shownLevel } from './battleFrames'

export interface BossBarPhase {
  /** The HP share (0–100) the phase turns at. */
  atHpPct: number
  title: string
  passed: boolean
}

export interface BossBarTimer {
  kind: 'enrage' | 'deadline'
  label: string
  /** Time left, 0–1 (the bar drains). */
  left: number
}

export interface BossBarView {
  unitId: string
  name: string
  epithet: string
  color: string
  level: number
  /** HP left, 0–100. */
  hpPct: number
  dead: boolean
  phases: BossBarPhase[]
  /** Aegis charges it still holds (each negates a blow). */
  aegis: number
  timer: BossBarTimer | null
  /** Enraged: its blows hit this many times harder. */
  enraged: number | null
}

/** The frame's field, as much of it as the bar needs (a Snap fits). */
export interface BarField {
  hp: Record<string, number>
  dead: Record<string, boolean>
  boss?: { passed: Record<string, number> }
}

function keywordsOf(log: CombatLog, u: CombatUnitInit): KeywordTag[] {
  // The guild's boss is a stand-in with none of its template's keywords.
  if (log.mission?.type === 'Guild Raid') return []
  const tpl = u.templateId !== undefined ? ENEMY_TEMPLATES[u.templateId] : undefined
  const own = tpl?.keywords ?? []
  const extra = anchorKeywords(log.floor, u.templateId)
  // An anchor's group restates its template's keywords: count each kind once (the anchor's wins).
  const kinds = new Set(extra.map((k) => k.kind))
  return [...own.filter((k) => !kinds.has(k.kind) || k.kind === 'phase'), ...extra]
}

const isBoss = (u: CombatUnitInit | undefined) => introOf(u?.templateId)?.tier === 'boss'

/**
 * The bar after the first `applied` events (null when no boss has stepped onto the field).
 * It follows the living boss the mission names (else the latest to arrive); once every
 * boss has fallen it stays on the last one, empty.
 */
export function bossBarView(log: CombatLog, byId: Record<string, CombatUnitInit>, field: BarField, applied: number): BossBarView | null {
  const played: readonly CombatEvent[] = log.events.slice(0, Math.max(0, Math.min(applied, log.events.length)))
  const order: string[] = []
  for (const e of played) {
    if (e.kind === 'battle-start' || e.kind === 'wave-spawn' || e.kind === 'summon')
      for (const id of e.enemyIds) if (isBoss(byId[id]) && !order.includes(id)) order.push(id)
  }
  if (order.length === 0) return null
  const alive = order.filter((id) => !field.dead[id])
  const pick = (ids: string[]) => [...ids].reverse().find((id) => byId[id]!.targetTag !== undefined) ?? ids[ids.length - 1]!
  const unitId = alive.length > 0 ? pick(alive) : order[order.length - 1]!
  const u = byId[unitId]!
  const intro = introOf(u.templateId)!
  const tick = played.length > 0 ? played[played.length - 1]!.tick : 0
  const passed = field.boss?.passed[unitId] ?? 0
  const kws = keywordsOf(log, u)
  const phaseKws = log.mission?.type === 'Guild Raid' ? [] : phasesOf(u.templateId)
  const phases = phaseKws.map((p, i) => ({ atHpPct: p.atHpPct, title: p.title !== undefined ? t(p.title) : t('Phase {n}', { n: i + 2 }), passed: i < passed }))
  const gained = phaseKws.slice(0, passed).flatMap((p) => p.addKeywords ?? [])

  // Aegis: what it came with, plus what each phase adds as it turns, less every blow one
  // turned. A blow that lands while the count says a charge is left proves there is none
  // (the engine always spends a charge first): F90's subverted Herald comes without his.
  let aegis = 0
  for (const k of kws) if (k.kind === 'aegis') aegis += k.charges
  for (const e of played) {
    if (e.kind === 'phase' && e.unitId === unitId) {
      for (const k of phaseKws[e.phase - 1]?.addKeywords ?? []) if (k.kind === 'aegis') aegis += k.charges
    } else if (e.kind === 'guard' && e.targetId === unitId) aegis = Math.max(0, aegis - 1)
    else if (e.kind === 'hit' && e.targetId === unitId) aegis = 0
  }

  // Enraged: a phase that turned it (afterTick 0), or its enrage tick come and gone.
  let enraged: number | null = null
  for (const k of [...kws, ...gained]) if (k.kind === 'enrage' && k.afterTick <= tick) enraged = Math.max(enraged ?? 0, k.multiplier)

  // The clock: the soonest enrage still coming among the bosses on the field, else the deadline.
  let timer: BossBarTimer | null = null
  let soonest = Infinity
  for (const id of alive) {
    const v = byId[id]!
    for (const k of keywordsOf(log, v)) {
      if (k.kind !== 'enrage' || k.afterTick <= tick || k.afterTick >= soonest) continue
      soonest = k.afterTick
      timer = {
        kind: 'enrage',
        label: id === unitId ? t('Enrage') : t('{name} enrages', { name: bossName(v) }),
        left: Math.max(0, Math.min(1, (k.afterTick - tick) / k.afterTick)),
      }
    }
  }
  const m = log.mission
  if (timer === null && m?.timerTicks !== undefined && !m.objectives.some((o) => o.kind === 'survive')) {
    timer = { kind: 'deadline', label: t('Deadline'), left: Math.max(0, Math.min(1, 1 - tick / Math.max(1, m.timerTicks))) }
  }

  const hp = Math.max(0, field.hp[unitId] ?? u.startHP ?? u.maxHP)
  return {
    unitId,
    name: bossName(u),
    epithet: t(intro.epithet),
    color: intro.color,
    level: shownLevel(u),
    hpPct: (hp / u.maxHP) * 100,
    dead: !!field.dead[unitId],
    phases,
    aegis,
    timer,
    enraged,
  }
}
