/**
 * How a damage number reads, pure: its words and class (IMMUNE, WEAK!, RESIST, CRITICAL!),
 * its colour (the blow's element), its size (the share of the target's max HP it took: a
 * chip is small, a 40% blow is big, never below a readable size on a phone), when it lands
 * (a sweep's numbers land one after another) and where (in lanes, so no two ever overlap,
 * on one target or on neighbours). DamagePopups only draws the plan.
 */
import type { CombatEvent, CombatUnitInit, Element } from '../../engine/types'
import { blowElement, popupDelay } from './battleFrames'
import { ELEMENT_VIS } from '../bits'
import { t } from '../i18n/i18n'
import { popupPlaces, type PopupBox } from './choreo'

/** The events that throw a number (or a word) over a unit. */
export type PopupEvent = Extract<CombatEvent, { kind: 'hit' | 'miss' | 'guard' | 'heal' | 'hp-cost' }>

export function isPopupEvent(e: CombatEvent): e is PopupEvent {
  return e.kind === 'hit' || e.kind === 'miss' || e.kind === 'guard' || e.kind === 'heal' || e.kind === 'hp-cost'
}

/** The unit a popup floats over. */
export function popupUnit(e: PopupEvent): string {
  return e.kind === 'heal' || e.kind === 'hp-cost' ? e.unitId : e.targetId
}

export interface PopupLook {
  text: string
  cls: string
  /** The small badge over the number (CRITICAL!, WEAK!, RESIST), or null. */
  tag: string | null
  tagCls: string
  /** The same tags one by one, each with its own badge class (crit / weak / resist). */
  tags: { text: string; cls: string }[]
}

/**
 * How a popup reads: its text, its class, and the small tag over it — CRITICAL! for a
 * crit, WEAK! / RESIST for a blow that met the foe's weakness or resistance. A blow the
 * foe is immune to reads IMMUNE (never 'CRITICAL! 0').
 */
export function popupLook(e: PopupEvent): PopupLook {
  const word = (text: string, cls: string): PopupLook => ({ text, cls, tag: null, tagCls: '', tags: [] })
  if (e.kind === 'miss') return word(t('MISS'), 'miss')
  if (e.kind === 'guard') return word(t('GUARD'), 'guard')
  if (e.kind === 'heal') return word(`+${e.amount}`, 'heal')
  if (e.kind === 'hp-cost') return word(t('−{n} HP', { n: e.amount }), 'cost')
  if (e.eff === 'immune') return word(t('IMMUNE'), 'immune')
  const kill = e.hpAfter <= 0
  const cls = e.crit ? 'crit' : kill ? 'kill' : e.eff === 'weak' ? 'weak' : e.eff === 'resist' ? 'resist' : ''
  const tags = [
    e.crit ? { text: t('CRITICAL!'), cls: 'crit' } : null,
    e.eff === 'weak' ? { text: t('WEAK!'), cls: 'weak' } : e.eff === 'resist' ? { text: t('RESIST'), cls: 'resist' } : null,
  ].filter((x): x is { text: string; cls: string } => x !== null)
  return {
    text: String(e.amount),
    cls,
    tag: tags.length > 0 ? tags.map((x) => x.text).join(' ') : null,
    tagCls: e.eff === 'weak' || e.eff === 'resist' ? e.eff : '',
    tags,
  }
}

/** The smallest a number may read on screen (CSS px), and its tag. */
export const MIN_SCREEN_PX = 12
export const MIN_TAG_SCREEN_PX = 9
/** A tag's size on the stage (logical px) before the phone minimum. */
const TAG_PX = 7

/**
 * A blow's size on the stage (logical px) from the share of its target's max HP it took:
 * 9 for a scratch, 12 at 10%, 21 from 40% up. A crit is 25% bigger (14 to 24), a killing
 * blow a touch bigger, a resisted one smaller. Words (MISS, GUARD, IMMUNE) stay small.
 */
export function popupFontPx(e: PopupEvent, maxHP: number): number {
  const share = maxHP > 0 && 'amount' in e ? e.amount / maxHP : 0
  const look = popupLook(e)
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
  switch (look.cls) {
    case 'miss':
    case 'guard':
    case 'immune':
    case 'cost':
      return 10
    case 'heal':
      return Math.round(clamp(10 + 20 * share, 10, 16))
  }
  const base = clamp(9 + 30 * share, 9, 21)
  if (look.cls === 'crit') return Math.round(clamp(base * 1.25, 14, 24))
  if (look.cls === 'kill') return Math.round(base + 1)
  if (look.cls === 'weak') return Math.round(Math.max(11, base + 1))
  if (look.cls === 'resist') return Math.round(Math.max(9, base * 0.9))
  return Math.round(base)
}

/** A blow's colour: its element (a plain physical blow reads warm white). Words keep theirs. */
export function popupColor(e: PopupEvent, element: Element): string {
  if (e.kind === 'heal') return '#7be08a'
  if (e.kind === 'miss') return '#b4c8e8'
  if (e.kind === 'guard') return '#d8dce6'
  if (e.kind === 'hp-cost') return '#d79bff'
  if (e.eff === 'immune') return '#b4c8e8'
  return element === 'physical' ? '#fff6e6' : ELEMENT_VIS[element].color
}

export interface PopupInput {
  e: PopupEvent
  /** The element the blow carried. */
  element: Element
  /** Max HP of the unit it lands on (sizes the number). */
  maxHP: number
  /** Stage-time delay before it lands (ms at 1×): the sweep's stagger. */
  delayMs: number
  /** How many numbers its beat throws (a sweep's crowd of numbers reads smaller). */
  crowd?: number
}

/** A crowded beat's numbers shrink (8 at once read at about half size), never below the phone minimum. */
export function crowdScale(crowd: number): number {
  return crowd <= 2 ? 1 : Math.max(0.5, 1 - (crowd - 2) * 0.08)
}

export interface PopupPlan {
  key: number
  look: PopupLook
  color: string
  /** Centre x and top y on the canon after lifting into its lane (stage px). */
  x: number
  y: number
  /** Font size of the number and of its tag (stage px, phone minimum applied). */
  fs: number
  tagFs: number
  delayMs: number
}

/**
 * Plan every popup on screen: size, colour, delay, and a lane (`popupLanes`) so that no two
 * boxes overlap — numbers, heals, misses, guards, IMMUNE and HP costs alike. `zoom` is the
 * stage's scale (a phone's ~1× needs bigger stage px to stay readable); `bounds` keeps a
 * number on the visible stretch of the canon.
 */
export function planPopups(
  items: readonly PopupInput[],
  pos: Record<string, { x: number; y: number }>,
  headOf: (id: string) => number,
  zoom = 1,
  bounds: { left: number; right: number } = { left: -Infinity, right: Infinity },
  /** Boxes on screen the numbers keep clear of (the skill name over its caster). */
  reserved: readonly PopupBox[] = [],
): PopupPlan[] {
  const minFs = MIN_SCREEN_PX / zoom
  const minTag = MIN_TAG_SCREEN_PX / zoom
  const rows = items
    .map((it) => {
      const who = popupUnit(it.e)
      const p = pos[who]
      if (!p) return null
      const look = popupLook(it.e)
      const fs = Math.round(Math.max(popupFontPx(it.e, it.maxHP) * crowdScale(it.crowd ?? 1), minFs) * 10) / 10
      const tagFs = Math.round(Math.max(TAG_PX, minTag) * 10) / 10
      const w = Math.max(Math.ceil(look.text.length * fs * 0.66) + 4, look.tag !== null ? Math.ceil(look.tag.length * tagFs * 0.72) + 6 : 0)
      const half = w / 2
      const x = bounds.right - bounds.left > w ? Math.min(Math.max(p.x, bounds.left + half), bounds.right - half) : p.x
      const box: PopupBox = { x, y: p.y - Math.min(headOf(who), 60) - fs - 4, w, h: fs + (look.tag !== null ? tagFs + 3 : 2) }
      return { it, look, fs, tagFs, box }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  const places = popupPlaces(
    rows.map((r) => r.box),
    3,
    140,
    0.9,
    reserved,
  )
  return rows.map((r, i) => ({
    key: r.it.e.seq,
    look: r.look,
    color: popupColor(r.it.e, r.it.element),
    x: r.box.x + places[i]!.dx,
    y: r.box.y - places[i]!.lift,
    fs: r.fs,
    tagFs: r.tagFs,
    delayMs: r.it.delayMs,
  }))
}

/**
 * The popups of some beats (each a [from, to] range of the log): every blow, heal, miss,
 * guard and HP cost, with its element, its target's max HP, its place in the beat's stagger
 * and the size of its crowd.
 */
export function beatPopups(
  events: readonly CombatEvent[],
  beats: readonly ({ from: number; to: number } | undefined)[],
  byId: Record<string, CombatUnitInit>,
): PopupInput[] {
  const out: PopupInput[] = []
  for (const b of beats) {
    if (!b || b.from < 0) continue
    const evs = events.slice(b.from, b.to + 1)
    const crowd = evs.filter(isPopupEvent).length
    let n = 0
    evs.forEach((e, k) => {
      if (!isPopupEvent(e)) return
      out.push({ e, element: blowElement(events, b.from + k, byId), maxHP: byId[popupUnit(e)]?.maxHP ?? 1, delayMs: popupDelay(n), crowd })
      n++
    })
  }
  return out
}

/** When each unit a beat strikes flinches (ms at 1×): its first blow's place in the stagger. */
export function flinchDelays(beat: readonly CombatEvent[]): Record<string, number> {
  const m: Record<string, number> = {}
  let n = 0
  for (const e of beat) {
    if (e.kind !== 'hit' && e.kind !== 'miss' && e.kind !== 'guard' && e.kind !== 'heal') continue
    if (e.kind === 'hit' && m[e.targetId] === undefined) m[e.targetId] = popupDelay(n)
    n++
  }
  return m
}
