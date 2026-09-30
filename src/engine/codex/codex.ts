/**
 * The Enemy Codex (schema v11): what the Master has learned about each enemy — how
 * often it was met and felled, and whether its weaknesses have been studied (by
 * scouting or by beating it enough). Pure; filled in by the tower and scouting.
 *
 * `recordBattle` is the one seam: every battle against enemy templates (tower floors,
 * the daily, tournament rounds, the guild raid) folds its log in here. An enemy counts as
 * seen once per battle it actually appeared in (a later wave that never spawned wasn't
 * met), and as felled once per death.
 */
import type { CodexEntry, CodexState, CombatLog, Element, EnemyTemplate, KeywordTag } from '../types'
import { ELEMENT_ADVANTAGE } from '../tuning'
import { ACTS, ANCHORS, ENEMY_TEMPLATES } from '../content'
import { DEPTH } from '../depth/depthTuning'

const CX = DEPTH.codex

export function defaultCodex(): CodexState {
  return { entries: {} }
}

function blankEntry(): CodexEntry {
  return { seen: 0, defeated: 0, studied: false, floors: [] }
}

/**
 * Fold one battle into the codex. `studied` marks every enemy met as studied (the floor
 * was scouted); otherwise an entry becomes studied at `studyAfterDefeats` kills. Returns
 * the same object when the battle had no template enemies. PURE.
 */
export function recordBattle(codex: CodexState, log: CombatLog, opts: { studied?: boolean } = {}): CodexState {
  const templateOf = new Map<string, string>()
  for (const u of log.unitsInit) if (u.side === 'enemy' && u.templateId !== undefined) templateOf.set(u.id, u.templateId)
  if (templateOf.size === 0) return codex

  const met = new Set<string>()
  const felled = new Map<string, number>()
  for (const e of log.events) {
    const ids = e.kind === 'battle-start' || e.kind === 'wave-spawn' ? e.enemyIds : []
    for (const id of ids) {
      const tid = templateOf.get(id)
      if (tid !== undefined) met.add(tid)
    }
    if (e.kind === 'death') {
      const tid = templateOf.get(e.unitId)
      if (tid !== undefined) felled.set(tid, (felled.get(tid) ?? 0) + 1)
    }
  }
  if (met.size === 0) return codex

  const entries = { ...codex.entries }
  for (const tid of [...met].sort()) {
    const prev = entries[tid] ?? blankEntry()
    const defeated = prev.defeated + (felled.get(tid) ?? 0)
    const floors = prev.floors.includes(log.floor) || prev.floors.length >= CX.maxFloors ? prev.floors : [...prev.floors, log.floor].sort((a, b) => a - b)
    entries[tid] = {
      seen: prev.seen + 1,
      defeated,
      studied: prev.studied || opts.studied === true || defeated >= CX.studyAfterDefeats,
      floors,
    }
  }
  return { entries }
}

/** Is this template's weakness known? */
export function isStudied(codex: CodexState, templateId: string): boolean {
  return codex.entries[templateId]?.studied === true
}

// ── Reading an entry (the Codex window and the scouting report) ──────────────

/** The element that beats `el` on the wheel (null for physical). */
export function weakElementOf(el: Element): Element | null {
  for (const [atk, def] of Object.entries(ELEMENT_ADVANTAGE)) if (def === el) return atk as Element
  return null
}

/** What studying a template reveals. */
export interface CodexIntel {
  element: Element
  /** The wheel counter, plus any element it is vulnerable to. */
  weakTo: Element[]
  immune: KeywordTag[]
  resists: KeywordTag[]
  /** Everything else worth knowing (looming, phased, aegis, enrage, frenzy…). */
  traits: KeywordTag[]
}

export function intelOf(t: EnemyTemplate): CodexIntel {
  const kws = t.keywords ?? []
  const weak = new Set<Element>()
  const wheel = weakElementOf(t.element)
  if (wheel) weak.add(wheel)
  for (const k of kws) if (k.kind === 'vulnerable') weak.add(k.element)
  return {
    element: t.element,
    weakTo: [...weak],
    immune: kws.filter((k) => k.kind === 'immune'),
    resists: kws.filter((k) => k.kind === 'resist' || k.kind === 'guard'),
    traits: kws.filter((k) => k.kind !== 'immune' && k.kind !== 'resist' && k.kind !== 'guard' && k.kind !== 'vulnerable'),
  }
}

/** The act (id) where a template is first met — a filler pool or an anchor floor. */
export function actOfTemplate(templateId: string): string | null {
  for (const act of ACTS) {
    if (act.pool.includes(templateId)) return act.id
    for (let f = act.from; f <= act.to; f++) {
      const a = ANCHORS[f]
      if (a?.waves.some((w) => w.some((g) => g.templateId === templateId))) return act.id
    }
  }
  return null
}

/** Every enemy the Codex can hold, in act order (then authored order). */
export function codexTemplates(): EnemyTemplate[] {
  const order = new Map(ACTS.map((a, i) => [a.id, i]))
  const all = Object.values(ENEMY_TEMPLATES)
  const rank = (t: EnemyTemplate) => order.get(actOfTemplate(t.id) ?? '') ?? ACTS.length
  return all.map((t, i) => ({ t, i })).sort((x, y) => rank(x.t) - rank(y.t) || x.i - y.i).map((x) => x.t)
}
