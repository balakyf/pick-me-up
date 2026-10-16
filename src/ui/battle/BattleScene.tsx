import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { playMusic, sfx } from '../audio/sound'
import type { BattleOrder, CombatEvent, CombatLog, CombatUnitInit, GameState, HeroId, Line } from '../../engine/types'
import { lastWords } from '../life/speech'
import { ENEMY_TEMPLATES, SKILLS } from '../../engine/content'
import { TUNING } from '../../engine/tuning'
import { drawBattleBg, BG_H, BG_W } from '../pixel/battleBg'
import { cachedDataUrl } from '../pixel/render'
import { allyBustUrl, allyPoseUrl, enemyPoseUrl, enemySize, heroBlinkUrl, heroBustUrl, heroPoseUrl, iselBustUrl } from '../pixel/sprites'
import { battlePose, idleStyle } from '../pixel/poses'
import { enemyName } from '../legacy/legacyText'
import type { LookSource } from '../pixel/look'
import { ELEMENT_VIS, hpColor } from '../bits'
import { inSentence, t } from '../i18n/i18n'
import { getPrefs, setPrefs, usePrefs } from '../prefs'
import {
  HOLD_1X,
  SPEEDS,
  addTrauma,
  decayTrauma,
  frameHoldMs,
  highlightPlan,
  hitstopMs,
  isKill,
  isPartyHero,
  normalizeSpeed,
  overtimeSpeed,
  shakeOffset,
  traumaFor,
  type Speed,
} from './fx'
import { MAX_DECISIVE_PROMPTS, findDangerMoment, findDecisive, savedCursor, wayOut, type Decisive, type WayOut } from './decisive'
import { findIntents, intentsAt, isAuthoredSkill } from './intents'
import { BARK_SHOW_MS, barkLine, canBark, firstName, isPriorityBark, planBarks, type BarkKind } from './narrator'
import { COMBO_MIN, comboSemis, comboSeries } from './combo'
import { Sparks, sparkCount, sparkSpecs } from './Sparks'
import { OrdersDock, type DockHero } from './OrdersDock'
import { DecisiveMoment, decisiveHeadline, ordersLeftText, type DecisiveChoice } from './DecisiveMoment'
import './battle.css'

/**
 * The battle as a side-view JRPG scene. The engine resolved the fight already; this
 * replays its CombatLog event by event (spec 2026-10-12, WP2):
 *  - feel: anticipation and lunge, hitstop scaled by the blow, white-then-red flash,
 *    squash, trauma shake on the moments that matter, element sparks, popping numbers,
 *    a combo counter, and a hero's death held in slow motion with a grave left behind;
 *  - pace: 2× by default (the last speed is remembered), 1/2/4/8×, short ordinary hits,
 *    overtime after 20 s, and a ~2 s highlight reel for swept floors;
 *  - agency: a portrait dock (tap to Protect, tap a foe to Focus), telegraphed enemy
 *    intents, and the Decisive Moment, which stops time before a hero's fatal blow.
 * Orders re-resolve the fight through the `orders.give` prop; this component never
 * dispatches anything to the store.
 */

interface Snap {
  hp: Record<string, number>
  /** Frame index on which each unit died. */
  dead: Record<string, number>
  visible: Record<string, boolean>
  actor: string | null
  target: string | null
  panic: string | null
  caption: string
  /** The authored skill being cast this action (kept through its hits). */
  skill: { name: string; color: string; caster: string; magic: boolean } | null
  /** Count of actions so far; its parity restarts the anticipation animation even when
   *  the same unit acts twice in a row. */
  actN: number
}

const HERO_X: Record<Line, number> = { front: 262, mid: 298, back: 334 }
const ENEMY_X: Record<Line, number> = { front: 128, mid: 90, back: 52 }

function skillName(id: string): string {
  if (id === 'basic') return t('Attack')
  return t(SKILLS[id]?.name ?? 'Strike')
}

/** Where each unit stands (feet position) on the 384×216 stage. */
function layout(log: CombatLog): Record<string, { x: number; y: number }> {
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

/** The Master's mid-battle levers (the tower passes these; replays and events don't). */
export interface BattleOrders {
  /** Focus / protect orders still available this battle. */
  left: number
  /** Re-resolve the fight with `order` (applied at its tick); returns the new log. */
  give: (order: BattleOrder) => CombatLog | null
  /** The fight as it would go with `order` added to those given, without giving it (no
   *  side effect). The Decisive Moment offers a way out only if it really saves the hero;
   *  without a preview it offers Protect and Retreat only. */
  preview?: (order: BattleOrder) => CombatLog | null
}

type Aim = 'focus' | 'protect' | null

/** A won tower fight continues to the results on its own after this long (real ms). */
export const VICTORY_AUTO_MS = 1200
/** Screen height kept for everything around the stage when fitting its zoom. */
const STAGE_RESERVE_PX = 300
/** A stage at least this wide (CSS px) gets the Decisive card beside the party, not over it. */
const WIDE_STAGE_PX = 640
/** Real ms after the Decisive card opens before it takes keyboard choices. */
export const DECISIVE_KEY_GRACE_MS = 400
/** How long the "Saved!" callout stays (matches its CSS animation). */
const SAVED_FLASH_MS = 1800

export interface BattleSceneProps {
  log: CombatLog
  state: GameState | null
  onDone: () => void
  orders?: BattleOrders
  /** 'highlights' plays a ~2 s reel (top hits, the final kill, the end) then calls onDone.
   *  A log in which a hero dies always plays in full, and so does the tutorial fight. */
  mode?: 'full' | 'highlights'
  /** The scripted first Decisive Moment (S5): Isel coaches, and if nobody would die the
   *  moment before the heaviest blow is offered instead. Needs `orders`. */
  tutorialPrompt?: boolean
  /** An order pulled this hero back from death (called once per hero, when the replay
   *  passes the moment they would have died). */
  onSaved?: (heroId: string) => void
  /** Enemy unit ids that are nemeses (WP5): marked with a skull. */
  nemesisIds?: string[]
  /** The scripted first Decisive Moment actually opened with Isel's coaching on it
   *  (called once). The tower marks the tutorial done only then. */
  onTutorialShown?: () => void
}

/** The name a unit's art is drawn from: its template's (a Bane is named for the hero it
 *  killed, but it is still a Goblin to the sprite sheet). */
function artName(u: CombatUnitInit): string {
  return (u.templateId !== undefined ? ENEMY_TEMPLATES[u.templateId]?.name : undefined) ?? u.name
}

export function BattleScene({
  log: initialLog,
  state,
  onDone,
  orders,
  mode: modeProp = 'full',
  tutorialPrompt = false,
  onSaved,
  nemesisIds,
  onTutorialShown,
}: BattleSceneProps) {
  const [prefs] = usePrefs()
  /** The little effects panel (shake strength, reduced motion) is open. */
  const [fxOpen, setFxOpen] = useState(false)
  const calm = prefs.reducedMotion
  const [log, setLog] = useState(initialLog)
  // The scripted first Decisive Moment needs the whole fight: it outranks a Sweep.
  const [mode, setMode] = useState(tutorialPrompt && orders ? 'full' : modeProp)
  const [aim, setAim] = useState<Aim>(null)
  const [given, setGiven] = useState(0)
  /** Event index the current log started playing from (0, or where an order re-resolved it). */
  const [resumeFrom, setResumeFrom] = useState(0)
  const [decisive, setDecisive] = useState<Decisive | null>(null)
  /** Heroes a Decisive Moment has been offered for (its length is the prompt count). */
  const [prompted, setPrompted] = useState<string[]>([])
  /** A moment may open: true at the start, and again after an order re-resolves the fight
   *  (so "Let fate decide" is final, but a rescue that dooms someone else re-arms it). */
  const [armed, setArmed] = useState(true)
  /** Heroes a Decisive order tried to pull back, and the tick each would have died on.
   *  Each one that still stands in the current log gets its own "Saved!" (two moments in
   *  one fight can rescue two heroes). */
  const [rescues, setRescues] = useState<{ heroId: string; deathTick: number }[]>([])
  const [savedShown, setSavedShown] = useState<string[]>([])
  /** The "Saved!" callouts on screen (they clear themselves after their animation). */
  const [savedFlash, setSavedFlash] = useState<string[]>([])
  const [bark, setBark] = useState<{ text: string; n: number } | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const byId = useMemo(() => Object.fromEntries(log.unitsInit.map((u) => [u.id, u])), [log])
  const unit = (id: string): CombatUnitInit | undefined => byId[id]
  const nameOf = (id: string) => {
    const u = byId[id]
    return u ? (u.side === 'enemy' || u.isNpc ? enemyName(u.name) : u.name) : id
  }
  /** How the party is named on screen: a hero by first name (full name when two share
   *  it), an escort by its translated name without "Princess" (never "→ Princess" or
   *  "→ Key"), a foe by its translated name. */
  const shortName = (id: string): string => {
    const u = byId[id]
    if (!u) return id
    if (u.side === 'enemy') return enemyName(u.name)
    if (u.isNpc) return t(u.name).replace(/^(Princess|Princesse) /, '')
    const first = firstName(u.name)
    return log.unitsInit.filter((o) => o.side === 'hero' && !o.isNpc && firstName(o.name) === first).length > 1 ? u.name : first
  }
  const partyIds = useMemo(() => log.unitsInit.filter(isPartyHero).map((u) => u.id), [log])

  const frames = useMemo<Snap[]>(() => {
    const out: Snap[] = []
    let cur: Snap = {
      hp: Object.fromEntries(log.unitsInit.map((u) => [u.id, u.maxHP])),
      dead: {},
      visible: {},
      actor: null,
      target: null,
      panic: null,
      caption: t('Floor {n}', { n: log.floor }),
      skill: null,
      actN: 0,
    }
    out.push(cur)
    log.events.forEach((e, i) => {
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
          next.actN = cur.actN + 1
          next.caption = `${nameOf(e.actorId)} — ${skillName(e.skillId)}`
          const def = SKILLS[e.skillId]
          if (def) {
            const el = def.element ?? byId[e.actorId]?.element ?? 'physical'
            next.skill = { name: t(def.name), color: ELEMENT_VIS[el].color, caster: e.actorId, magic: def.damageType === 'magic' }
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
          next.dead[e.unitId] = i + 1
          next.caption = t('{name} falls!', { name: nameOf(e.unitId) })
          break
        case 'mission':
          next.caption = t(e.note)
          break
        case 'order': {
          const o = e.order
          next.caption =
            o.kind === 'retreat'
              ? t('The Master sounds the retreat!')
              : o.kind === 'focus'
                ? t('The Master: “Everyone on {name}!”', { name: inSentence(nameOf(o.enemyId)) })
                : o.kind === 'withdraw'
                  ? t('The Master: “Fall back, {name}!”', { name: nameOf(o.allyId) })
                  : t('The Master: “Cover {name}!”', { name: nameOf(o.allyId) })
          break
        }
        case 'end':
          next.caption =
            e.outcome === 'win'
              ? t('Victory!')
              : e.outcome === 'wipe'
                ? t('The party has fallen…')
                : e.outcome === 'failed'
                  ? t('The mission has failed…')
                  : e.outcome === 'retreat'
                    ? t('The party falls back through the gate.')
                    : t('Time is up…')
          break
      }
      out.push(next)
      cur = next
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log])

  const combos = useMemo(() => comboSeries(log), [log])
  const intents = useMemo(() => findIntents(log), [log])
  const barks = useMemo(() => planBarks(log), [log])
  const plan = useMemo(() => (mode === 'highlights' ? highlightPlan(log) : null), [log, mode])
  const reel = plan !== null

  const [cursor, setCursor] = useState(() => (plan ? plan[0]!.cursor : 0))
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeedState] = useState<Speed>(() => normalizeSpeed(getPrefs().battleSpeed))
  const setSpeed = (s: Speed) => {
    setSpeedState(s)
    setPrefs({ battleSpeed: s })
  }
  const atEnd = cursor >= frames.length - 1
  const snap = frames[Math.min(cursor, frames.length - 1)]!
  const current = cursor > 0 ? log.events[cursor - 1] : undefined
  const tick = current?.tick ?? 0
  const ordersLeft = orders ? Math.max(0, orders.left - given) : 0

  // Orders standing at this frame, including any just given (their events are next in line),
  // so the same Protect or Focus is never spent twice.
  const guarded = new Set<string>()
  let focusId: string | null = null
  /** Heroes pulled back behind the line, and the tick each returns on. */
  const backUntil = new Map<string, number>()
  for (let i = 0; i < log.events.length; i++) {
    const e = log.events[i]!
    if (i >= cursor && e.kind !== 'order') break
    if (e.kind === 'order' && e.order.kind === 'protect') guarded.add(e.order.allyId)
    if (e.kind === 'order' && e.order.kind === 'focus') focusId = e.order.enemyId
    if (e.kind === 'order' && e.order.kind === 'withdraw') backUntil.set(e.order.allyId, e.tick + TUNING.combat.withdrawTicks)
  }

  /** Replay time elapsed (real ms the scheduler has spent), for overtime and the narrator's pace. */
  const clock = useRef(0)
  const lastBarkAt = useRef<number | null>(null)
  const done = useRef(false)
  const finish = () => {
    if (done.current) return
    done.current = true
    onDone()
  }

  // ── The Decisive Moment ──────────────────────────────────────────────────
  const pending = useMemo<Decisive | null>(() => {
    if (!orders || reel || !armed || prompted.length >= MAX_DECISIVE_PROMPTS) return null
    // A hero already offered a moment is never offered a second one (the same hero still
    // doomed after an order means the order could not save them, and fate stands).
    const d = findDecisive(log, partyIds, resumeFrom, prompted)
    if (d) return d
    if (tutorialPrompt && prompted.length === 0) return findDangerMoment(log, partyIds, resumeFrom)
    return null
  }, [orders, reel, armed, prompted, log, partyIds, resumeFrom, tutorialPrompt])
  const isTutorialMoment = tutorialPrompt && prompted.length <= 1 && decisive !== null && prompted[0] === decisive.heroId
  // What the card may offer: never an order that is already standing (a second Protect on
  // the same hero, or a Focus on the foe already focused, would only burn an order).
  // Every way out the card offers must really change the doomed hero's fate: each order is
  // previewed (re-resolved without being given) and offered only if the hero then lives
  // through the whole fight. (Focus on the killer never made it in time — it stays on the
  // dock, off the card.) Retreat lands before the fatal tick, so it always saves.
  const outlook = useMemo(() => {
    if (!decisive || decisive.kind !== 'death' || !orders?.preview) return null
    const d = decisive
    const look = (order: BattleOrder) => {
      let next: CombatLog | null = null
      try {
        next = orders.preview!(order)
      } catch {
        next = null
      }
      const w = wayOut(log, next, d, partyIds)
      return w ? { ...w, warn: warnOf(w) } : null
    }
    return {
      protect: look({ tick: d.orderTick, kind: 'protect', allyId: d.heroId }),
      pullBack: look({ tick: d.orderTick, kind: 'withdraw', allyId: d.heroId }),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisive, log])
  /** What a way out leads to that is worse than the fight as it stands (null: nothing). */
  function warnOf(w: WayOut): string | null {
    if (w.fallsInstead.length === 1) return t('{name} falls in their place', { name: shortName(w.fallsInstead[0]!) })
    if (w.fallsInstead.length > 1) return t('{n} others fall in their place', { n: w.fallsInstead.length })
    if (w.floorLost) return t('The floor is lost')
    return null
  }
  const canProtectDoomed =
    !!decisive && ordersLeft > 0 && !guarded.has(decisive.heroId) && (decisive.kind !== 'death' || !orders?.preview || !!outlook?.protect)
  const canPullBack = !!outlook?.pullBack

  useEffect(() => {
    if (!pending || decisive || cursor !== pending.cursorIndex) return
    setDecisive(pending)
    setPrompted((p) => [...p, pending.heroId])
    setArmed(false)
    setAim(null)
    sfx('decisive')
  }, [cursor, pending, decisive])

  // The coaching is on screen when the tutorial moment's card shows it (a standing Protect
  // can drop it): only then is the tutorial done.
  const coached = useRef(false)
  const tutorialCoachShown = isTutorialMoment && canProtectDoomed
  useEffect(() => {
    if (!tutorialCoachShown || coached.current) return
    coached.current = true
    onTutorialShown?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialCoachShown])

  // The card takes keys only after a short grace: a Space or S pressed to pause or skip
  // just as time stops must not be read as "Let fate decide" (that choice is final).
  const [cardKeys, setCardKeys] = useState(false)
  useEffect(() => {
    setCardKeys(false)
    if (!decisive) return
    const tm = setTimeout(() => setCardKeys(true), DECISIVE_KEY_GRACE_MS)
    return () => clearTimeout(tm)
  }, [decisive])

  // ── Playback ─────────────────────────────────────────────────────────────
  const effSpeed = overtimeSpeed(speed, clock.current)
  const overtime = !reel && effSpeed > speed
  useEffect(() => {
    if (!playing || decisive) return
    if (reel) {
      const at = plan.findIndex((p) => p.cursor === cursor)
      if (at < 0) {
        setCursor(plan[0]!.cursor)
        return
      }
      const tm = setTimeout(() => {
        if (at + 1 >= plan.length) finish()
        else setCursor(plan[at + 1]!.cursor)
      }, plan[at]!.ms)
      return () => clearTimeout(tm)
    }
    if (atEnd) return
    if (pending && cursor === pending.cursorIndex) return // the Decisive Moment opens here
    const shown = cursor > 0 ? log.events[cursor - 1] : undefined
    const next = log.events[cursor]
    const ms = frameHoldMs(shown, next, { speed: effSpeed, reducedMotion: calm, unit, skillAction: snap.skill !== null })
    const tm = setTimeout(() => {
      clock.current += ms
      setCursor((c) => Math.min(frames.length - 1, c + 1))
    }, ms)
    return () => clearTimeout(tm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, playing, atEnd, effSpeed, frames.length, log, decisive, reel, pending, calm])

  // A clean tower victory moves on by itself after 1.2 s (S11: one click per floor, not
  // two). Losses, and wins that cost a hero, wait for the Master: that is not rushed.
  const costly = useMemo(() => log.events.some((e) => e.kind === 'death' && partyIds.includes(e.unitId)), [log, partyIds])
  // The ⚙ effects panel open means the Master is busy here: wait for them.
  useEffect(() => {
    if (!atEnd || reel || !orders || log.outcome !== 'win' || costly || decisive || fxOpen) return
    const tm = setTimeout(finish, VICTORY_AUTO_MS)
    return () => clearTimeout(tm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atEnd, reel, log.outcome, costly, decisive, fxOpen])

  // Battle music while the scene is up; the lobby theme returns after.
  useEffect(() => {
    playMusic('battle')
    return () => playMusic('lobby')
  }, [])

  // ── Per-event feedback: sound, shake, narrator ───────────────────────────
  const lastSeq = useRef(-1)
  const trauma = useRef(0)
  const shakeEl = useRef<HTMLDivElement>(null)
  const raf = useRef<number | null>(null)
  const zoomRef = useRef(2)
  useEffect(() => {
    const e = current
    if (!e || e.seq === lastSeq.current) return // a re-resolved log replays the same event at the resume point
    lastSeq.current = e.seq
    playCue(e, unit, combos[cursor] ?? 0)
    // Trauma: only crits, kills and blows worth half a life bar shake the stage.
    const add = traumaFor(e, unit)
    if (add > 0 && !calm && prefs.shake > 0) kick(add)
    // Isel, at most once every 10 s (a death may cut in sooner).
    const here = barks.filter((b) => b.cursor === cursor).sort((a, b) => Number(isPriorityBark(b.kind)) - Number(isPriorityBark(a.kind)))
    const b = here[0]
    if (b && !reel) say(b.kind, t(b.line, b.vars))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, log])

  function kick(amount: number) {
    trauma.current = addTrauma(trauma.current, amount)
    if (raf.current !== null || typeof requestAnimationFrame !== 'function') return
    let last = typeof performance !== 'undefined' ? performance.now() : 0
    const step = (now: number) => {
      trauma.current = decayTrauma(trauma.current, now - last)
      last = now
      const el = shakeEl.current
      const z = zoomRef.current
      const o = shakeOffset(trauma.current, now, getPrefs().shake)
      if (el) el.style.transform = trauma.current > 0 ? `translate(${Math.round(o.x * z) / z}px, ${Math.round(o.y * z) / z}px)` : ''
      raf.current = trauma.current > 0 ? requestAnimationFrame(step) : null
    }
    raf.current = requestAnimationFrame(step)
  }
  useEffect(
    () => () => {
      if (raf.current !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf.current)
    },
    [],
  )

  const barkSeq = useRef(0)
  function say(kind: BarkKind, text: string) {
    if (!canBark(kind, clock.current, lastBarkAt.current) && kind !== 'tutorial') return
    lastBarkAt.current = clock.current
    barkSeq.current += 1
    setBark({ text, n: barkSeq.current })
  }
  useEffect(() => {
    if (!bark) return
    const tm = setTimeout(() => setBark((b) => (b?.n === bark.n ? null : b)), BARK_SHOW_MS)
    return () => clearTimeout(tm)
  }, [bark])

  // "Saved!": the replay passes the moment the hero would have died, and they stand.
  // Judged against the CURRENT log, so a hero rescued once and doomed again by a later
  // re-resolve is never called saved.
  useEffect(() => {
    const due = rescues.filter((r) => {
      if (savedShown.includes(r.heroId)) return false
      const at = savedCursor(log, r.heroId, r.deathTick)
      return at !== null && cursor >= at
    })
    if (due.length === 0) return
    const ids = due.map((r) => r.heroId)
    setSavedShown((s) => [...s, ...ids])
    setSavedFlash((f) => [...f, ...ids])
    sfx('saved')
    for (const id of ids) onSaved?.(id)
    say('saved', t(barkLine('saved', `${log.seed}|${ids[0]}`), { name: shortName(ids[0]!) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, rescues, savedShown, log])

  useEffect(() => {
    if (savedFlash.length === 0) return
    const tm = setTimeout(() => setSavedFlash([]), SAVED_FLASH_MS)
    return () => clearTimeout(tm)
  }, [savedFlash])

  // ── Orders ───────────────────────────────────────────────────────────────
  function give(order: BattleOrder): CombatLog | null {
    if (!orders) return null
    setAim(null)
    const next = orders.give(order)
    if (!next) {
      setNote(t('The order could not reach the field.'))
      setPlaying(true)
      return null
    }
    setNote(null)
    // The new log replays the old one exactly up to the order's tick, and every frame shown
    // so far is from an earlier tick: resume right here (the rest of this tick still plays,
    // and the replay never jumps back).
    const at = Math.min(cursor, next.events.length - 1)
    setLog(next)
    setCursor(at)
    setResumeFrom(at)
    setPlaying(true)
    setArmed(true)
    // Retreat and Pull back are the Master's own calls: they spend no order.
    if (order.kind !== 'retreat' && order.kind !== 'withdraw') setGiven((n) => n + 1)
    return next
  }
  const orderTick = tick + 1
  /** The fight is over by the time an order given now would land (the final blow is on
   *  screen): no order is taken, spent or recorded. */
  const decided = atEnd || !log.events.some((e) => e.tick >= orderTick && e.kind !== 'end')
  const protect = (heroId: string) => {
    // An already-protected hero is not protected twice (that would only burn an order).
    if (ordersLeft <= 0 || decided || snap.dead[heroId] !== undefined || guarded.has(heroId)) return
    give({ tick: orderTick, kind: 'protect', allyId: heroId })
  }
  const focus = (enemyId: string) => {
    if (ordersLeft <= 0 || decided || snap.dead[enemyId] !== undefined || !snap.visible[enemyId] || focusId === enemyId) return
    give({ tick: orderTick, kind: 'focus', enemyId })
  }
  const retreat = () => {
    if (!orders || decided) return
    give({ tick: orderTick, kind: 'retreat' })
  }
  /** A tap on a unit (sprite or row): a foe takes a Focus, a hero a Protect. */
  const tapUnit = (u: CombatUnitInit) => {
    if (!orders || decisive || reel) return
    if (u.side === 'enemy' && (aim === 'focus' || aim === null)) focus(u.id)
    else if (isPartyHero(u) && (aim === 'protect' || aim === null)) protect(u.id)
  }

  function decide(choice: DecisiveChoice) {
    const d = decisive
    if (!d) return
    setDecisive(null)
    if (choice === 'fate') {
      setPlaying(true)
      return
    }
    if ((choice === 'protect' && !canProtectDoomed) || (choice === 'pullback' && !canPullBack)) {
      setPlaying(true)
      return
    }
    const order: BattleOrder =
      choice === 'protect'
        ? { tick: d.orderTick, kind: 'protect', allyId: d.heroId }
        : choice === 'pullback'
          ? { tick: d.orderTick, kind: 'withdraw', allyId: d.heroId }
          : { tick: d.orderTick, kind: 'retreat' }
    const next = give(order)
    if (next && d.kind === 'death') setRescues((r) => [...r, { heroId: d.heroId, deathTick: d.deathTick }])
  }

  function skip() {
    if (reel) return finish()
    // Skipping never jumps over a choice the Master has not made yet.
    if (pending && cursor < pending.cursorIndex) setCursor(pending.cursorIndex)
    else setCursor(frames.length - 1)
    setPlaying(true)
  }

  function watchFull() {
    setMode('full')
    setCursor(0)
    clock.current = 0
    lastSeq.current = -1
    setPlaying(true)
  }

  // The battle takes the focus from the page behind it (the Fight button that started it,
  // say), the way a modal dialog does: the stage root itself holds it, so Enter can never
  // reach that page while the battle is up.
  const rootEl = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const a = document.activeElement
    if (a instanceof HTMLElement && !rootEl.current?.contains(a)) {
      a.blur()
      rootEl.current?.focus({ preventScroll: true })
    }
  }, [])

  // ── Keyboard: Space pause · 1-4 speed · S skip · F/P/R orders · B pull back · Esc
  // Capture phase on window, and every key stops there: the battle is modal, so the lobby
  // (walk, E to interact) and any window underneath never see a key while it is up.
  // Only the keys the battle uses are prevented, and Enter and Space always are: their
  // default would press whatever button has focus behind the battle (a second "Fight").
  // Tab and the rest keep their defaults. A button of the battle's own that has keyboard
  // focus keeps Enter and Space (Space on a focused "Protect" protects; it is not fate).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      e.stopPropagation()
      const el = e.target instanceof Element ? e.target : null
      const inside = !!el && !!rootEl.current?.contains(el)
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const activation = k === 'Enter' || k === ' '
      if (inside) {
        const tag = el!.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (activation && el!.closest('button, [role="button"]')) return
      }
      let handled = true
      if (k === 'Escape' && fxOpen) setFxOpen(false)
      else if (decisive) {
        if (!cardKeys || e.repeat) {
          // swallowed: the grace period, or a key held down from before the card opened
        } else if (k === 'p' && canProtectDoomed) decide('protect')
        else if (k === 'b' && canPullBack) decide('pullback')
        else if (k === 'r') decide('retreat')
        else if (k === ' ' || k === 'Escape') decide('fate')
        else handled = false
      } else if (atEnd && !reel) {
        if (k === 'Enter' || k === ' ') finish()
        else handled = false
      } else if (k === ' ') setPlaying((p) => !p)
      else if (k >= '1' && k <= '4' && !reel) setSpeed(SPEEDS[Number(k) - 1]!)
      else if (k === 's') skip()
      else if (k === 'f' && orders && ordersLeft > 0 && !reel) {
        setAim((a) => (a === 'focus' ? null : 'focus'))
        setPlaying(false)
      } else if (k === 'p' && orders && ordersLeft > 0 && !reel) {
        setAim((a) => (a === 'protect' ? null : 'protect'))
        setPlaying(false)
      } else if (k === 'r' && orders && !reel) retreat()
      else if (k === 'Escape' && aim) setAim(null)
      else handled = false
      if (handled || activation) e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // Fit the stage: largest integer zoom that leaves room for the windows below.
  const [zoom, setZoom] = useState(2)
  useEffect(() => {
    const fit = () => {
      // Room below and above the stage: caption, foes + portrait dock, controls, hint.
      const z = Math.min((window.innerWidth - 20) / BG_W, (window.innerHeight - STAGE_RESERVE_PX) / BG_H)
      setZoom(z >= 1 ? Math.max(1, Math.floor(z)) : Math.max(0.5, z))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  zoomRef.current = zoom

  const pos = useMemo(() => layout(log), [log])
  const bg = cachedDataUrl(`bbg|${log.floor >= 1 && log.floor <= 9 ? 'p' : log.floor}`, () => drawBattleBg(log.floor))
  const heroSrc = (u: CombatUnitInit): LookSource => {
    const h = state?.heroes[u.id as keyof GameState['heroes']]
    return h ?? { id: u.id, name: u.name, star: 3, heroClass: u.unitClass, element: u.element }
  }
  const heroes = log.unitsInit.filter((u) => u.side === 'hero')
  const enemies = log.unitsInit.filter((u) => u.side === 'enemy')
  const liveEnemies = enemies.filter((u) => snap.visible[u.id] && snap.dead[u.id] === undefined)
  const enemyCounts = new Map<string, number>()
  for (const u of liveEnemies) enemyCounts.set(enemyName(u.name), (enemyCounts.get(enemyName(u.name)) ?? 0) + 1)
  const nemeses = new Set(nemesisIds ?? [])

  const liveIntents = reel || atEnd ? [] : intentsAt(intents, cursor)
  const targeted = new Set(liveIntents.map((it) => it.targetId))

  // Damage popups for the most recent few events (each animates once on mount).
  const popups = (atEnd ? [] : log.events.slice(Math.max(0, cursor - 3), cursor)).filter(
    (e) => e.kind === 'hit' || e.kind === 'miss' || e.kind === 'guard' || e.kind === 'heal',
  )
  const stackOf = new Map<string, number>()

  // The death moment: the fallen hero's portrait and last words.
  const fallen = current?.kind === 'death' && isPartyHero(byId[current.unitId]) ? byId[current.unitId]! : null
  const fatalBlow = current?.kind === 'hit' && isKill(current, log.events[cursor]) && isPartyHero(byId[current.targetId])
  const mourning = !!fallen || fatalBlow

  // Hitstop for the blow on screen (drives the victim's shake / flash timing).
  const hs =
    current?.kind === 'hit'
      ? hitstopMs({
          amount: current.amount,
          maxHP: byId[current.targetId]?.maxHP ?? 1,
          crit: current.crit,
          kill: isKill(current, log.events[cursor]),
          speed: reel ? 1 : effSpeed,
          reducedMotion: calm,
        })
      : 0
  // The wind-up length for the action on screen (stable across its act and hit frames).
  const actMs = Math.max(60, Math.round((snap.skill ? HOLD_1X.actSkill : HOLD_1X.act) / (reel ? 1 : effSpeed)))

  // Sparks for the blow (or the kill) on screen.
  let burst: { x: number; y: number; key: number; sparks: ReturnType<typeof sparkSpecs> } | null = null
  if (!calm && current && (current.kind === 'hit' || (current.kind === 'death' && byId[current.unitId]?.side === 'enemy'))) {
    const id = current.kind === 'hit' ? current.targetId : current.unitId
    const p = pos[id]
    const u = byId[id]
    if (p && u) {
      const h = u.side === 'hero' ? 32 : enemySize(artName(u), u.element).h
      const color =
        current.kind === 'death'
          ? '#b07adb'
          : snap.skill?.color ?? ELEMENT_VIS[byId[current.actorId]?.element ?? 'physical'].color
      const count = current.kind === 'death' ? sparkCount('death') : sparkCount(current.crit ? 'crit' : 'hit')
      burst = { x: p.x, y: p.y - h / 2, key: current.seq, sparks: sparkSpecs(current.seq, count, color, current.kind === 'hit' && current.crit ? '#f2c75c' : undefined) }
    }
  }

  const combo = !atEnd && !reel ? combos[cursor] ?? 0 : 0
  const canTap = !!orders && ordersLeft > 0 && !decided && !decisive && !reel
  const outcome = log.outcome
  const camFocus = decisive ? pos[decisive.heroId] : undefined

  const dock: DockHero[] = heroes.map((u) => ({
    id: u.id,
    name: shortName(u.id),
    bust: u.isNpc ? allyBustUrl(u.name) : heroBustUrl(heroSrc(u)),
    hp: Math.max(0, snap.hp[u.id] ?? u.maxHP),
    maxHP: u.maxHP,
    level: u.level,
    dead: snap.dead[u.id] !== undefined,
    isNpc: !!u.isNpc,
    active: snap.actor === u.id,
    guarded: guarded.has(u.id),
    targeted: targeted.has(u.id),
    doomed: decisive?.heroId === u.id,
  }))

  const rootCls = ['battle', calm ? 'calm' : '', decisive ? 'decisive-on' : '', mourning ? 'mourning' : '', reel ? 'reel' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={rootCls}
      ref={rootEl}
      tabIndex={-1}
      // A click does not leave a battle button focused (Chrome would): Space still pauses
      // after a click on 4×. Keyboard users Tab to a button and keep Enter / Space on it.
      onMouseDown={(e) => {
        if (e.target instanceof Element && e.target.closest('button')) e.preventDefault()
      }}
    >
      <div className="battle-caption pframe">
        {decisive ? decisiveHeadline(decisive.kind, shortName(decisive.heroId)) : snap.caption}
      </div>

      <div className={`battle-stage-wrap ${aim ? 'aiming' : ''}`} style={{ width: BG_W * zoom, height: BG_H * zoom }}>
        <div className="battle-stage" style={{ transform: `scale(${zoom})` }}>
          <div className="battle-shake" ref={shakeEl}>
            <div
              className="battle-cam"
              style={
                camFocus && !calm
                  ? { transform: 'scale(1.25)', transformOrigin: `${camFocus.x}px ${camFocus.y - 16}px` }
                  : undefined
              }
            >
              {bg && <img className="px battle-bg" src={bg} width={BG_W} height={BG_H} alt="" />}

              {liveIntents.length > 0 && (
                <svg className="intent-lines" viewBox={`0 0 ${BG_W} ${BG_H}`} width={BG_W} height={BG_H} aria-hidden="true">
                  {liveIntents.map((it) => {
                    const a = pos[it.actorId]
                    const b = pos[it.targetId]
                    if (!a || !b) return null
                    return <line key={`${it.actorId}-${it.actCursor}`} x1={a.x} y1={a.y - 14} x2={b.x} y2={b.y - 14} />
                  })}
                </svg>
              )}

              {log.unitsInit.map((u) => {
                if (!snap.visible[u.id] && u.side === 'enemy') return null
                const p = pos[u.id]!
                const isHero = u.side === 'hero'
                const party = isPartyHero(u)
                const acting = snap.actor === u.id && (current?.kind === 'act' || current?.kind === 'hit' || current?.kind === 'miss')
                const hurt = snap.target === u.id && current?.kind === 'hit'
                const skillHit = hurt && snap.skill !== null
                const diedAt = snap.dead[u.id]
                const dead = diedAt !== undefined
                const grave = party && dead && diedAt! < cursor
                // WP8's poses: the act frame is the wind-up (S7 anticipation), the blow the strike.
                const pose = battlePose({
                  dead,
                  hurt,
                  acting,
                  casting: snap.skill?.caster === u.id && snap.skill.magic,
                  windingUp: acting && current?.kind === 'act',
                })
                const size = isHero ? { w: 24, h: 32 } : enemySize(artName(u), u.element)
                const src = u.isNpc
                  ? allyPoseUrl(u.name, pose)
                  : isHero
                    ? heroPoseUrl(heroSrc(u), pose)
                    : enemyPoseUrl(artName(u), u.element, pose)
                // A hero with no drawn KO frame (a frame identical to idle) still tips over in CSS.
                const koTip = party && dead && heroPoseUrl(heroSrc(u), 'ko') === heroPoseUrl(heroSrc(u), 'idle')
                // Idle life: party heroes blink on their own rhythm while standing idle.
                const blink = party && pose === 'idle' && !calm ? heroBlinkUrl(heroSrc(u)) : null
                const hpNow = Math.max(0, snap.hp[u.id] ?? u.maxHP)
                const hpPct = (hpNow / u.maxHP) * 100
                const cls = [
                  'bunit',
                  isHero ? 'hero' : 'enemy',
                  acting ? `acting act-${snap.actN & 1}` : '',
                  hurt ? `hurt hit-${current!.seq & 1}` : '',
                  dead ? 'ko' : '',
                  koTip ? 'ko-tip' : '',
                  grave ? 'grave' : '',
                  !dead && isHero && hpPct < 25 ? 'low' : '',
                  decisive?.heroId === u.id ? 'doomed' : '',
                  decisive?.killerId === u.id ? 'killer' : '',
                  focusId === u.id && !dead ? 'focused' : '',
                  guarded.has(u.id) && !dead ? 'guarded' : '',
                  (backUntil.get(u.id) ?? 0) > tick && !dead ? 'withdrawn' : '',
                  nemeses.has(u.id) ? 'nemesis' : '',
                  canTap && !dead && ((u.side === 'enemy' && aim !== 'protect' && focusId !== u.id) || (party && aim !== 'focus' && !guarded.has(u.id)))
                    ? aim
                      ? 'tappable aimable'
                      : 'tappable'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <div
                    key={u.id}
                    className={cls}
                    data-unit={u.id}
                    onClick={() => tapUnit(u)}
                    style={{
                      left: p.x - size.w / 2,
                      top: p.y - size.h,
                      width: size.w,
                      height: size.h,
                      zIndex: p.y,
                      ...(hurt ? { ['--hs' as string]: `${hs}ms` } : {}),
                      ...(acting ? { ['--act-ms' as string]: `${actMs}ms` } : {}),
                      ...(skillHit ? { ['--skill-color' as string]: snap.skill!.color } : {}),
                    }}
                  >
                    {skillHit && <div className="skill-flash" />}
                    {snap.skill && snap.skill.caster === u.id && (
                      <div className="skill-banner" style={{ borderColor: snap.skill.color }}>
                        {snap.skill.name}
                      </div>
                    )}
                    <div className="bshadow" style={{ width: size.w * 0.7 }} />
                    <div className="bpose">
                      {src && (
                        <span className="bsprite blink-stack" style={idleStyle(u.id) as CSSProperties}>
                          <img className="px" src={src} width={size.w} height={size.h} alt={nameOf(u.id)} draggable={false} />
                          {blink && <img className="px blink" src={blink} width={size.w} height={size.h} alt="" aria-hidden="true" draggable={false} />}
                        </span>
                      )}
                    </div>
                    {grave && <div className="grave-marker" title={u.name} />}
                    {!dead && (
                      <div className={`bhp ${isHero ? 'mine' : ''}`}>
                        <span className="trail" style={{ width: `${hpPct}%` }} />
                        <span className="fill" style={{ width: `${hpPct}%`, background: hpColor(hpPct) }} />
                      </div>
                    )}
                    {snap.panic === u.id && <span className="bsweat">💧</span>}
                    {nemeses.has(u.id) && !dead && <span className="bnemesis">☠</span>}
                    {guarded.has(u.id) && !dead && <span className="bguard">🛡</span>}
                  </div>
                )
              })}

              {liveIntents.map((it) => {
                const p = pos[it.actorId]
                const u = byId[it.actorId]
                if (!p || !u) return null
                const h = enemySize(artName(u), u.element).h
                return (
                  <div key={`i-${it.actorId}-${it.actCursor}`} className={`intent ${it.kind}`} style={{ left: p.x, top: p.y - h - 22 }}>
                    {it.kind === 'skill' ? `✦ ${skillName(it.skillId)}` : `⚠ ${t('HEAVY')}`} → {shortName(it.targetId)}
                  </div>
                )
              })}

              {popups.map((e) => {
                if (e.kind !== 'hit' && e.kind !== 'miss' && e.kind !== 'guard' && e.kind !== 'heal') return null
                const id = e.kind === 'heal' ? e.unitId : e.targetId
                const p = pos[id]
                if (!p) return null
                const stack = stackOf.get(id) ?? 0
                stackOf.set(id, stack + 1)
                const big = e.kind === 'hit' && e.amount >= (byId[e.targetId]?.maxHP ?? Infinity) * 0.25
                const text =
                  e.kind === 'miss' ? t('MISS') : e.kind === 'guard' ? t('GUARD') : e.kind === 'heal' ? `+${e.amount}` : e.crit ? `${e.amount}!` : String(e.amount)
                const cls = e.kind === 'miss' || e.kind === 'guard' ? 'miss' : e.kind === 'heal' ? 'heal' : e.crit ? 'crit' : big ? 'big' : ''
                return (
                  <div key={e.seq} className={`dmg ${cls}`} style={{ left: p.x, top: p.y - 34 - stack * 9, zIndex: 999 }}>
                    {text}
                  </div>
                )
              })}

              {burst && <Sparks key={burst.key} x={burst.x} y={burst.y} sparks={burst.sparks} />}

              {savedFlash.map((id) =>
                pos[id] ? (
                  <div key={`saved-${id}`} className="saved-callout" style={{ left: pos[id]!.x, top: pos[id]!.y - 52 }}>
                    {t('Saved!')}
                  </div>
                ) : null,
              )}
            </div>
          </div>

          {atEnd && (
            <div className={`battle-banner ${outcome === 'win' ? 'win' : 'lose'}`} data-battle-end={outcome}>
              {outcome === 'win'
                ? t('VICTORY')
                : outcome === 'wipe'
                  ? t('DEFEAT')
                  : outcome === 'failed'
                    ? t('MISSION FAILED')
                    : outcome === 'retreat'
                      ? t('RETREAT')
                      : t('TIME UP')}
            </div>
          )}
          {fallen && (
            <div className="death-card" key={current?.seq}>
              <img className="px" src={heroBustUrl(heroSrc(fallen))} width={48} height={48} alt="" />
              <div>
                <div className="death-name">{fallen.name}</div>
                <div className="death-words">
                  “{state ? lastWords(state, { heroId: fallen.id as HeroId, name: fallen.name }) : '…'}”
                </div>
              </div>
            </div>
          )}
        </div>

        {combo >= COMBO_MIN && (
          <div className="combo" key={`c${combo}`}>
            {t('{n} HITS!', { n: combo })}
          </div>
        )}
        {overtime && <div className="overtime">{t('OVERTIME')}</div>}
        {bark && (
          <div className="isel-bark" key={bark.n}>
            <img className="px" src={iselBustUrl()} width={32} height={32} alt="" />
            <span>{bark.text}</span>
          </div>
        )}
      </div>

      {decisive && (
        <DecisiveMoment
          decisive={decisive}
          heroName={shortName(decisive.heroId)}
          heroBust={byId[decisive.heroId] ? heroBustUrl(heroSrc(byId[decisive.heroId]!)) : ''}
          iselBust={iselBustUrl()}
          ordersLeft={ordersLeft}
          canProtect={canProtectDoomed}
          canPullBack={canPullBack}
          protectWarn={outlook?.protect?.warn ?? null}
          pullBackWarn={outlook?.pullBack?.warn ?? null}
          tutorial={isTutorialMoment}
          onChoose={decide}
          wide={BG_W * zoom >= WIDE_STAGE_PX}
          style={
            BG_W * zoom >= WIDE_STAGE_PX
              ? // Over the foes' half of the stage, so the doomed hero stays in view.
                { left: `calc(50% - ${(BG_W * zoom) / 2}px + ${Math.round(BG_W * zoom * 0.03)}px)`, width: Math.min(460, Math.round(BG_W * zoom * 0.58)) }
              : undefined
          }
        />
      )}

      <div className="battle-windows">
        <div className="pframe battle-foes">
          {liveEnemies.length <= 6
            ? liveEnemies.map((u) => {
                const pct = (Math.max(0, snap.hp[u.id] ?? u.maxHP) / u.maxHP) * 100
                return (
                  <div
                    key={u.id}
                    className={`foe-row ${snap.target === u.id ? 'hit' : ''} ${canTap && aim !== 'protect' && focusId !== u.id ? (aim ? 'tappable aimable' : 'tappable') : ''} ${focusId === u.id ? 'focused' : ''} ${nemeses.has(u.id) ? 'nemesis' : ''}`}
                    onClick={() => tapUnit(u)}
                  >
                    <span className="foe-name">
                      {nemeses.has(u.id) && '☠ '}
                      {enemyName(u.name)} <span className="muted small">Lv{u.level}</span>
                    </span>
                    <span className="gauge foe-hp">
                      <span style={{ width: `${pct}%`, background: hpColor(pct) }} />
                    </span>
                  </div>
                )
              })
            : [...enemyCounts.entries()].map(([name, n]) => (
                <div key={name} className="foe-row">
                  <span>{name}</span>
                  {n > 1 && <span className="muted">×{n}</span>}
                </div>
              ))}
          {enemyCounts.size === 0 && <div className="muted">—</div>}
        </div>
        <OrdersDock heroes={dock} canProtect={canTap} aiming={aim === 'protect'} onProtect={protect} />
      </div>

      <div className="battle-controls">
        {reel ? (
          <>
            <span className="sweep-tag">{t('Sweep highlights')}</span>
            <button className="pbtn ghost" onClick={watchFull}>
              {t('Watch full replay ▸')}
            </button>
            <button className="pbtn ghost" onClick={finish}>
              {t('Skip ▸▸')}
            </button>
          </>
        ) : !atEnd ? (
          <>
            <button className="pbtn" onClick={() => setPlaying((p) => !p)} disabled={!!decisive}>
              {playing ? t('❚❚ Pause') : t('▶ Play')}
            </button>
            {SPEEDS.map((s) => (
              <button key={s} className={`pbtn ghost ${speed === s ? 'on' : ''}`} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
            <button className="pbtn ghost" onClick={skip} disabled={!!decisive}>
              {t('Skip ▸▸')}
            </button>
            {orders && (
              <span className="order-bar">
                <button
                  className={`pbtn sm ${aim === 'focus' ? 'on' : ''}`}
                  disabled={ordersLeft <= 0 || !!decisive}
                  onClick={() => {
                    setAim(aim === 'focus' ? null : 'focus')
                    setPlaying(false)
                  }}
                  title={t('Every hero attacks the enemy you pick')}
                >
                  🎯 {t('Focus')}
                </button>
                <span className="muted small order-count">{ordersLeftText(ordersLeft)}</span>
                <button className="pbtn sm danger" onClick={() => (decisive ? decide('retreat') : retreat())} title={t('End the fight now: the living come home, nothing is won')}>
                  🏳 {t('Retreat')}
                </button>
              </span>
            )}
          </>
        ) : (
          <button className="pbtn primary big" onClick={finish}>
            {t('Continue ▸')}
          </button>
        )}
        <span className="fx-prefs-anchor">
          <button
            type="button"
            className={`pbtn ghost sm fx-prefs-toggle ${fxOpen ? 'on' : ''}`}
            onClick={() => setFxOpen((v) => !v)}
            aria-expanded={fxOpen}
            aria-label={t('Battle effects')}
            title={t('Battle effects')}
          >
            ⚙
          </button>
          {fxOpen && (
            <span className="pframe fx-prefs" role="group" aria-label={t('Battle effects')}>
              <label className="fx-pref">
                <span>{t('Screen shake')}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.25}
                  value={prefs.shake}
                  disabled={calm}
                  onChange={(e) => setPrefs({ shake: Number(e.target.value) })}
                />
                <span className="fx-pref-val">{calm ? t('off') : `${Math.round(prefs.shake * 100)}%`}</span>
              </label>
              <label className="fx-pref">
                <input type="checkbox" checked={calm} onChange={(e) => setPrefs({ reducedMotion: e.target.checked })} />
                <span>{t('Reduce motion')}</span>
              </label>
            </span>
          )}
        </span>
      </div>
      <div className="battle-hint muted small">
        {note ??
          (aim === 'focus'
            ? t('Click an enemy…')
            : aim === 'protect'
              ? t('Click a hero…')
              : orders && !atEnd && !reel && ordersLeft > 0
                ? t('Tap a hero to Protect · tap a foe to Focus')
                : '')}
      </div>
    </div>
  )
}

/** The sound for one replayed event. Party hits climb a pentatonic scale with the combo. */
function playCue(e: CombatEvent, unit: (id: string) => CombatUnitInit | undefined, combo: number): void {
  if (e.kind === 'hit') {
    const mine = unit(e.actorId)?.side === 'hero'
    sfx(e.crit ? 'crit' : 'hit', { semis: mine ? comboSemis(combo) : -4 })
  } else if (e.kind === 'miss') sfx('miss')
  else if (e.kind === 'guard') sfx('guard')
  else if (e.kind === 'heal') sfx('heal')
  else if (e.kind === 'death') sfx(isPartyHero(unit(e.unitId)) ? 'heroFall' : 'death')
  else if (e.kind === 'panic') sfx('panic')
  else if (e.kind === 'act' && isAuthoredSkill(e.skillId)) sfx('click', { semis: -12 })
  else if (e.kind === 'end') sfx(e.outcome === 'win' ? 'victory' : 'defeat')
}
