/**
 * The battle replay's timeline, pure: the stage layout (where each unit stands), the
 * frame list (one snapshot of the field per CombatEvent) and how long each event holds
 * the screen. BattleScene plays these frames; nothing here touches the DOM.
 */
import type { CombatEvent, CombatLog, CombatUnitInit, Element, Line } from '../../engine/types'
import { ENEMY_TEMPLATES, SKILLS } from '../../engine/content'
import { ELEMENT_VIS } from '../bits'
import { t } from '../i18n/i18n'
import { DEPTH_DURATION, depthSnap } from './synergyCaptions'
import { missionCaption, missionDuration } from './missionCaptions'

/** One frame of the replay: the field as it stands after an event. */
export interface Snap {
  hp: Record<string, number>
  dead: Record<string, boolean>
  visible: Record<string, boolean>
  actor: string | null
  target: string | null
  panic: string | null
  caption: string
  /** The authored skill being cast this action (kept through its hits). */
  skill: { name: string; color: string; caster: string } | null
  /** The element of the current action (colours its hit sparks). */
  element: Element
}

export const SPEEDS = [1, 2, 4] as const

/** Real milliseconds each event is held on screen at 1× speed. */
export const DURATION: Record<CombatEvent['kind'], number> = {
  'battle-start': 700,
  'wave-spawn': 800,
  act: 340,
  hit: 460,
  miss: 400,
  'hp-cost': 450,
  panic: 650,
  guard: 420,
  heal: 380,
  death: 600,
  mission: 900,
  order: 900,
  end: 600,
  ...DEPTH_DURATION,
}

/** How long one event holds the screen at 1× (each mission beat has its own timing). */
export function eventDuration(e: CombatEvent): number {
  return e.kind === 'mission' ? missionDuration(e) : DURATION[e.kind]
}

/** A hero's death holds the scene: the moment is not skipped past at speed. */
export const HERO_DEATH_MS = 2600
/** Hit-stop: a critical blow freezes the frame this long before the impact lands. */
export const HITSTOP_MS = 120
/** The fallen hero's last words linger this long after the scene moves on. */
export const MOURN_LINGER_MS = 1200

const HERO_X: Record<Line, number> = { front: 250, mid: 286, back: 322 }
const ENEMY_X: Record<Line, number> = { front: 140, mid: 102, back: 64 }

/** The level a unit shows: an enemy template may override it (the F10 Lv999 Creature). */
export function shownLevel(u: Pick<CombatUnitInit, 'level' | 'templateId'>): number {
  return (u.templateId !== undefined ? ENEMY_TEMPLATES[u.templateId]?.displayLevel : undefined) ?? u.level
}

export function skillName(id: string): string {
  if (id === 'basic') return t('Attack')
  // A caster foe's basic attack (engine/unit ENEMY_SPELL_ID).
  if (id === 'e_spell') return t('Spell')
  return t(SKILLS[id]?.name ?? 'Strike')
}

/** Where each unit stands (feet position) on the 384×216 stage. */
export function layout(log: CombatLog): Record<string, { x: number; y: number }> {
  const waveOf: Record<string, number> = {}
  for (const e of log.events) {
    if (e.kind === 'battle-start') for (const id of e.enemyIds) waveOf[id] = 0
    if (e.kind === 'wave-spawn') for (const id of e.enemyIds) waveOf[id] = e.wave
  }
  const groups = new Map<string, CombatUnitInit[]>()
  for (const u of log.unitsInit) {
    const key = `${u.side}|${u.side === 'enemy' ? waveOf[u.id] ?? 0 : 0}|${u.line}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(u)
  }
  const pos: Record<string, { x: number; y: number }> = {}
  for (const [key, units] of groups) {
    const side = key.split('|')[0]
    // A crowded enemy line splits into two ranks so late-floor waves stay readable.
    const cols = side === 'enemy' && units.length > 3 ? 2 : 1
    const n = Math.ceil(units.length / cols)
    const top = 134
    const bottom = 200
    units.forEach((u, idx) => {
      const col = idx % cols
      const i = Math.floor(idx / cols)
      const y = n === 1 ? 168 : top + ((bottom - top) * i) / (n - 1)
      const stagger = (i % 2) * 8
      const x = side === 'hero' ? HERO_X[u.line] + stagger : ENEMY_X[u.line] - stagger - col * 34
      pos[u.id] = { x, y: Math.round(y) }
    })
  }
  return pos
}

export interface FrameOpts {
  /** A trial (the weekly echo): heroes who drop are out, not dead. */
  nonLethal?: boolean
}

/** The frames of a replay: frame 0 is the empty field, frame i+1 follows event i. */
export function buildFrames(
  log: CombatLog,
  byId: Record<string, CombatUnitInit>,
  nameOf: (id: string) => string,
  opts: FrameOpts = {},
): Snap[] {
  const out: Snap[] = []
  let cur: Snap = {
    hp: Object.fromEntries(log.unitsInit.map((u) => [u.id, u.startHP ?? u.maxHP])),
    dead: {},
    visible: {},
    actor: null,
    target: null,
    panic: null,
    caption: t('Floor {n}', { n: log.floor }),
    skill: null,
    element: 'physical',
  }
  out.push(cur)
  for (const e of log.events) {
    const keepSkill =
      e.kind === 'hit' || e.kind === 'miss' || e.kind === 'hp-cost' || e.kind === 'guard' || e.kind === 'heal'
    const next: Snap = {
      ...cur,
      hp: { ...cur.hp },
      dead: { ...cur.dead },
      visible: { ...cur.visible },
      actor: null,
      target: null,
      panic: null,
      skill: keepSkill ? cur.skill : null,
    }
    switch (e.kind) {
      case 'battle-start':
        for (const id of [...e.heroIds, ...e.enemyIds]) next.visible[id] = true
        next.caption = t('Enemies approach!')
        break
      case 'wave-spawn':
        for (const id of e.enemyIds) next.visible[id] = true
        next.caption = t('Wave {n} appears!', { n: e.wave + 1 })
        break
      case 'act': {
        next.actor = e.actorId
        next.target = e.targetId
        next.caption = `${nameOf(e.actorId)} — ${skillName(e.skillId)}`
        const def = SKILLS[e.skillId]
        const el = def?.element ?? byId[e.actorId]?.element ?? 'physical'
        next.element = el
        if (def) {
          next.skill = { name: t(def.name), color: ELEMENT_VIS[el].color, caster: e.actorId }
        }
        break
      }
      case 'hit':
        next.hp[e.targetId] = e.hpAfter
        next.actor = e.actorId
        next.target = e.targetId
        next.caption = cur.caption
        break
      case 'miss':
        next.actor = e.actorId
        next.target = e.targetId
        next.caption = cur.caption
        break
      case 'hp-cost':
        next.hp[e.unitId] = e.hpAfter
        next.actor = e.unitId
        next.caption = t('{name} pays {n} HP!', { name: nameOf(e.unitId), n: e.amount })
        break
      case 'panic':
        next.panic = e.unitId
        next.caption = t('{name} panics and freezes!', { name: nameOf(e.unitId) })
        break
      case 'guard':
        next.actor = e.actorId
        next.target = e.targetId
        next.caption = t("{name}'s scales turn the blow!", { name: nameOf(e.targetId) })
        break
      case 'heal':
        next.hp[e.unitId] = e.hpAfter
        next.caption = cur.caption
        break
      case 'death':
        next.dead[e.unitId] = true
        next.caption =
          opts.nonLethal && byId[e.unitId]?.side === 'hero'
            ? t('{name} is out of the trial.', { name: nameOf(e.unitId) })
            : t('{name} falls!', { name: nameOf(e.unitId) })
        break
      case 'mission':
        next.caption = missionCaption(e, nameOf)
        break
      case 'order': {
        const o = e.order
        next.caption =
          o.kind === 'retreat'
            ? t('The Master sounds the retreat!')
            : o.kind === 'focus'
              ? t('The Master: “Everyone on {name}!”', { name: nameOf(o.enemyId) })
              : t('The Master: “Cover {name}!”', { name: nameOf(o.allyId) })
        break
      }
      case 'end':
        next.caption =
          opts.nonLethal && e.outcome !== 'win'
            ? t('The trial ends. Nobody dies here.')
            : e.outcome === 'win'
            ? t('Victory!')
            : e.outcome === 'wipe'
              ? t('The party has fallen…')
              : e.outcome === 'failed'
                ? t('The mission has failed…')
                : e.outcome === 'retreat'
                  ? t('The party falls back through the gate.')
                  : t('Time is up…')
        break
      default: {
        // Combat depth: cover, follow-ups, rivalry and the floor's conditions.
        const d = depthSnap(e, nameOf)
        if (d) Object.assign(next, d)
        // A follow-up is the friend's own strike: their element colours the sparks.
        if (e.kind === 'followup') {
          next.element = byId[e.unitId]?.element ?? 'physical'
          next.skill = null
        }
      }
    }
    out.push(next)
    cur = next
  }
  return out
}

/** Who strikes in this event: the actor of an act, hit, miss or guard; the friend of a follow-up. */
export function eventActor(e: CombatEvent | undefined): string | null {
  if (!e) return null
  if (e.kind === 'act' || e.kind === 'hit' || e.kind === 'miss' || e.kind === 'guard') return e.actorId
  if (e.kind === 'followup') return e.unitId
  return null
}

/**
 * The skill behind the event at `index`: its action's 'act', or the basic strike of a
 * follow-up (a friend pressing the attack has no 'act' of their own). Null for none.
 */
export function actionSkillId(events: readonly CombatEvent[], index: number, actorId: string): string | null {
  for (let i = index; i >= 0; i--) {
    const ev = events[i]!
    if (ev.kind === 'followup' && ev.unitId === actorId) return 'basic'
    if (ev.kind === 'act' && ev.actorId === actorId) return ev.skillId
    if (ev.kind === 'act') break
  }
  return null
}
