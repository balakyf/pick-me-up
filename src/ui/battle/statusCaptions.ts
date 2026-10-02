/**
 * Captions, timings and the field's statuses for lane F's events (a status taking hold or
 * wearing off, a DoT pulse, a shield soaking a blow, SP given or drained). BattleScene's
 * frames call `statusSnap` for any event kind they don't handle themselves (the
 * synergyCaptions pattern), so these stay out of the scene's own switch. Pure.
 */
import type { CombatEvent, DotKind, StatusKey } from '../../engine/types'
import { t } from '../i18n/i18n'

/** How long each status event holds the screen at 1× (merged into the scene's durations). */
export const STATUS_DURATION = {
  status: 440,
  'status-end': 150,
  dot: 420,
  shield: 340,
  sp: 320,
} as const

export type StatusEventKind = keyof typeof STATUS_DURATION
type StatusEvent = Extract<CombatEvent, { kind: StatusEventKind }>

/** The rest of a party-wide cast (the 2nd…5th hero a war cry reaches) passes quickly. */
const NTH_MS = 120
/** A shield breaking is a beat of its own. */
const BROKEN_MS = 460

function isStatusEvent(e: CombatEvent): e is StatusEvent {
  return e.kind in STATUS_DURATION
}

/** How long a status event holds the screen at 1×; undefined for any other kind. */
export function statusDuration(e: CombatEvent): number | undefined {
  if (!isStatusEvent(e)) return undefined
  if (e.kind === 'status' && e.nth !== undefined && e.nth > 0) return NTH_MS
  if (e.kind === 'status-end' && e.reason === 'broken') return BROKEN_MS
  return STATUS_DURATION[e.kind]
}

/** One status on a unit, as the replay shows it. */
export interface StatusMark {
  key: StatusKey
  /** The % of a buff/debuff (crit: points), a shield's pool, a DoT's or regen's HP per pulse. */
  value: number
  sourceId: string
}

/** A word or number thrown over a unit by a status event (each animates once on mount). */
export interface StatusPop {
  unitId: string
  text: string
  cls: string
  seq: number
}

/** The statuses on the field after an event, and the last few pops. */
export interface StatusView {
  marks: Record<string, StatusMark[]>
  pops: StatusPop[]
}

/** What one unit shows: its statuses and its recent pops. */
export interface UnitStatusView {
  marks: StatusMark[]
  pops: StatusPop[]
}

const NONE: UnitStatusView = { marks: [], pops: [] }
const MAX_POPS = 4

/** One unit's slice of the view (a stable empty view when it carries nothing). */
export function unitStatus(view: StatusView | undefined, unitId: string): UnitStatusView {
  if (view === undefined) return NONE
  const marks = view.marks[unitId] ?? NONE.marks
  const pops = view.pops.some((p) => p.unitId === unitId) ? view.pops.filter((p) => p.unitId === unitId) : NONE.pops
  return marks.length === 0 && pops.length === 0 ? NONE : { marks, pops }
}

/** The display name of a status (icon tooltips, the hero sheet). */
export function statusName(key: StatusKey): string {
  switch (key) {
    case 'taunt':
      return t('Taunting')
    case 'shield':
      return t('Shielded')
    case 'regen':
      return t('Regenerating')
    case 'stun':
      return t('Stunned')
    case 'bleed':
      return t('Bleeding')
    case 'poison':
      return t('Poisoned')
    case 'burn':
      return t('Burning')
    case 'atk-up':
      return t('Attack up')
    case 'atk-down':
      return t('Attack down')
    case 'def-up':
      return t('Defence up')
    case 'def-down':
      return t('Defence down')
    case 'spd-up':
      return t('Speed up')
    case 'spd-down':
      return t('Slowed')
    case 'crit-up':
      return t('Crit up')
    case 'crit-down':
      return t('Crit down')
    case 'guard-up':
      return t('Guarding')
    case 'guard-down':
      return t('Marked')
  }
}

/** The short word a status throws over its unit as it takes hold. */
export function statusShout(key: StatusKey): string {
  switch (key) {
    case 'taunt':
      return t('TAUNT!')
    case 'shield':
      return t('SHIELD')
    case 'regen':
      return t('REGEN')
    case 'stun':
      return t('STUN!')
    case 'bleed':
      return t('BLEED')
    case 'poison':
      return t('POISON')
    case 'burn':
      return t('BURN')
    case 'guard-up':
      return t('GUARD')
    case 'guard-down':
      return t('MARKED')
    default: {
      const [stat, dir] = key.split('-') as [string, string]
      const word = stat === 'atk' ? t('ATK') : stat === 'def' ? t('DEF') : stat === 'spd' ? t('SPD') : t('CRIT')
      return `${word}${dir === 'up' ? '↑' : '↓'}`
    }
  }
}

/** Does this status help its bearer (a blue/green icon) or hurt it (red)? */
export function statusIsGood(key: StatusKey): boolean {
  return key === 'taunt' || key === 'shield' || key === 'regen' || key.endsWith('-up')
}

function caption(e: StatusEvent, name: string, current: string): string {
  switch (e.kind) {
    case 'status': {
      const n = e.value ?? 0
      switch (e.status) {
        case 'taunt':
          return t('{name} roars a challenge — every foe must face them!', { name })
        case 'shield':
          return t('{name} is shielded ({n})!', { name, n })
        case 'regen':
          return t('{name} begins to regenerate.', { name })
        case 'stun':
          return t('{name} is stunned!', { name })
        case 'bleed':
          return t('{name} is bleeding!', { name })
        case 'poison':
          return t('{name} is poisoned!', { name })
        case 'burn':
          return t('{name} is burning!', { name })
        case 'guard-up':
          return t('{name} braces — {n}% less damage!', { name, n })
        case 'guard-down':
          return t('{name} is marked — {n}% more damage!', { name, n })
        case 'crit-up':
          return t('{name} steadies — +{n} crit!', { name, n })
        case 'crit-down':
          return t('{name} falters — −{n} crit!', { name, n })
        case 'atk-up':
          return t("{name}'s attack rises {n}%!", { name, n })
        case 'atk-down':
          return t("{name}'s attack falls {n}%!", { name, n })
        case 'def-up':
          return t("{name}'s defence rises {n}%!", { name, n })
        case 'def-down':
          return t("{name}'s defence falls {n}%!", { name, n })
        case 'spd-up':
          return t('{name} quickens {n}%!', { name, n })
        case 'spd-down':
          return t('{name} slows {n}%!', { name, n })
      }
      return current
    }
    case 'status-end':
      if (e.reason === 'broken') return t("{name}'s shield shatters!", { name })
      return current
    case 'dot':
      return e.status === 'bleed'
        ? t('{name} bleeds for {n}.', { name, n: e.amount })
        : e.status === 'poison'
          ? t('Poison eats at {name} — {n}.', { name, n: e.amount })
          : t('{name} burns for {n}.', { name, n: e.amount })
    case 'shield':
      return e.left > 0 ? t("{name}'s shield soaks {n}!", { name, n: e.absorbed }) : t("{name}'s shield soaks {n} and breaks!", { name, n: e.absorbed })
    case 'sp':
      return e.amount > 0 ? t('{name} regains {n} SP.', { name, n: e.amount }) : t('{name} loses {n} SP.', { name, n: -e.amount })
  }
}

const DOT_CLS: Record<DotKind, string> = { bleed: 'st-bleed', poison: 'st-poison', burn: 'st-burn' }

function pop(e: StatusEvent): StatusPop | null {
  switch (e.kind) {
    case 'status':
      return { unitId: e.unitId, text: statusShout(e.status), cls: statusIsGood(e.status) ? 'st-good' : 'st-bad', seq: e.seq }
    case 'status-end':
      return e.reason === 'broken' ? { unitId: e.unitId, text: t('BREAK'), cls: 'st-bad', seq: e.seq } : null
    case 'dot':
      return { unitId: e.unitId, text: `-${e.amount}`, cls: DOT_CLS[e.status], seq: e.seq }
    case 'shield':
      return { unitId: e.unitId, text: `◆${e.absorbed}`, cls: 'st-shield', seq: e.seq }
    case 'sp':
      return { unitId: e.unitId, text: `${e.amount > 0 ? '+' : '−'}${Math.abs(e.amount)} ${t('SP')}`, cls: 'st-sp', seq: e.seq }
  }
}

/** The view after `e`: marks added, refreshed or removed (a new object; frames share the old). */
function nextView(view: StatusView | undefined, e: StatusEvent): StatusView {
  const marks = { ...(view?.marks ?? {}) }
  if (e.kind === 'status') {
    const mine = (marks[e.unitId] ?? []).filter((m) => m.key !== e.status)
    const had = view?.marks[e.unitId]?.find((m) => m.key === e.status)
    marks[e.unitId] = [...mine, { key: e.status, value: Math.max(had?.value ?? 0, e.value ?? 0), sourceId: e.sourceId }]
  } else if (e.kind === 'status-end') {
    marks[e.unitId] = (marks[e.unitId] ?? []).filter((m) => m.key !== e.status)
  } else if (e.kind === 'shield') {
    marks[e.unitId] = (marks[e.unitId] ?? []).map((m) => (m.key === 'shield' ? { ...m, value: e.left } : m))
  }
  const p = pop(e)
  const pops = p === null ? view?.pops ?? [] : [...(view?.pops ?? []), p].slice(-MAX_POPS)
  return { marks, pops }
}

/**
 * What the scene shows for a status event: the caption, and who acts on whom. It also
 * moves the frame on: a DoT's HP into `next.hp`, the statuses into `next.status`.
 * Null for any other kind (BattleScene handles those).
 */
export function statusSnap(
  e: CombatEvent,
  nameOf: (id: string) => string,
  next: { hp: Record<string, number>; caption: string; status?: StatusView },
): { caption: string; actor: string | null; target: string | null } | null {
  if (!isStatusEvent(e)) return null
  if (e.kind === 'dot') next.hp[e.unitId] = e.hpAfter
  next.status = nextView(next.status, e)
  const actor = e.kind === 'status' || e.kind === 'sp' ? e.sourceId : e.kind === 'shield' ? e.actorId : null
  return { caption: caption(e, nameOf(e.unitId), next.caption), actor: actor === e.unitId ? null : actor, target: e.unitId }
}
