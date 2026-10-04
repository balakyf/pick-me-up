import { useEffect, useMemo, useRef, useState } from 'react'
import { useBattleAudio } from '../audio/useBattleAudio'
import { getSettings } from '../qol/settings'
import { useRegisterBattle } from '../qol/windowRegistry'
import type { BattleOrder, CombatLog, CombatUnitInit, GameState, HeroId } from '../../engine/types'
import { lastWordsTogether } from '../life/speech'
import { bgTheme, BG_H, BG_W, HORIZON, LAYER_ORDER } from '../pixel/battleBg'
import { BattleFxCanvas, type FxHandle } from './BattleFxCanvas'
import { battleKeyAction, isTypingTarget, weatherForFloor } from './battleFx'
import { allyBustUrl, allyFrameUrl, allyPosable, allyPoseUrl, enemySize, enemyUrl, heroBustUrl, heroFrameUrl, heroPoseUrl, poseSize } from '../pixel/sprites'
import type { HeroPose } from '../pixel/heroSprite'
import { heroPoseFor, isGuarded } from './battlePose'
import { useBossShow } from './useBossShow'
import { useStoryBox } from '../story/StoryBox'
import { bossBarView } from './bossBar'
import { BossBar } from './BossBar'
import { castTargets, skillFx } from './skillFx'
import { flashesOn } from '../qol/settings'
import type { LookSource } from '../pixel/look'
import { ELEMENT_VIS } from '../bits'
import { t } from '../i18n/i18n'
import { attackStyle, choreograph, type AttackStyle } from './choreo'
import {
  actionSkillId,
  beatEvents,
  beatLead,
  buildFrames,
  cutInActs,
  eventActor,
  frameAtEvents,
  DURATION,
  frameHold,
  showHoldsFor,
  type Snap,
} from './battleFrames'
import { useMourning } from './useMourning'
import { useImpactJuice } from './useImpactJuice'
import { useStageFit } from './useStageFit'
import { devFxFloor, layerUrls, useReducedMotion } from './stageFx'
import { UnitSprite } from './UnitSprite'
import { DamagePopups } from './DamagePopups'
import { unitStatus } from './statusCaptions'
import { beatPopups, flinchDelays } from './popupStyle'
import { FoeHud } from './FoeHud'
import { PartyRows } from './PartyRows'
import { BattleControls } from './BattleControls'
import type { Aim, AimOrder } from './OrderBar'
import { aimable, clickOrder, guardUp, holdGiven, ordersInHand, swappedPositions } from './ordersPlan'
import { anyCharge } from './bossCaptions'
import { Telegraphs } from './Telegraph'
import { PhaseCinematic } from './PhaseCinematic'
import { DeathCard, DeathVeil, ResultBanner, type BannerWords } from './ResultBanner'
import { foeColumnVars } from '../layout/foeColumn'
import { resumeCursor } from './orderResume'
import { objectiveView } from './objectives'
import { ObjectiveHud } from './ObjectiveHud'
import { upcomingTurns } from './turnOrder'
import { TurnStrip } from './TurnStrip'
import { SkillCutIn, WaveBanner, WaveCleared } from './StageBanners'
import { ElementsHint } from './ElementsHint'
import { CoachBattleTip } from '../qol/CoachTip'
import type { Lesson } from '../qol/coach'
import type { LessonId } from '../../engine/content/missions'
import { elementsHintSeen, markElementsHintSeen } from './elementsHint'
import './battle.css'
import './battleRead.css'
import './bossShow.css'

/**
 * The battle as a side-view JRPG scene. The engine resolved the fight already;
 * this replays its CombatLog beat by beat: attackers lunge, targets flash and
 * shake, damage numbers pop, the fallen collapse. Party right, foes left.
 *
 * The timeline (beats, frames, layout, timings) is built in battleFrames.ts; the pieces
 * on screen are UnitSprite, DamagePopups, FoeHud, PartyRows, ObjectiveHud, TurnStrip,
 * the stage banners, BattleControls/OrderBar and ResultBanner. This component keeps the
 * orchestration: the clock, the orders, the keyboard, the layout, and the juice that
 * fires as each blow lands.
 */

/** The Master's mid-battle levers (the tower passes these; replays and events don't). */
export interface BattleOrders {
  /** Focus / protect orders still available this battle. */
  left: number
  /** Re-resolve the fight with `order` (applied at its tick); returns the new log. */
  give: (order: BattleOrder) => CombatLog | null
  /** The Tactical Center's concentrate-fire bonus a Focus carries (e.g. 0.06), for the tooltip. */
  focusBonus?: number
}

export function BattleScene({
  log: initialLog,
  state,
  onDone,
  orders,
  nonLethal = false,
  coach,
  banner,
}: {
  log: CombatLog
  state: GameState | null
  onDone: () => void
  orders?: BattleOrders
  /** A trial (the weekly echo): nobody dies, so no death moment and no DEFEAT. */
  nonLethal?: boolean
  /** Lane P: the coach's lesson this battle may teach as it happens (the tower passes it). */
  coach?: { lesson: Lesson | null; onSeen: (id: LessonId) => void; seen?: (id: LessonId) => boolean }
  /** Lane Q: the closing words for a non-lethal fight that is not a trial (PvP, the guild raid). */
  banner?: BannerWords
}) {
  const [log, setLog] = useState(initialLog)
  const [aim, setAim] = useState<Aim>(null)
  const [given, setGiven] = useState(0)
  // A swap waits for its second hero (lane G).
  const [swapFirst, setSwapFirst] = useState<string | null>(null)
  const byId = useMemo(() => Object.fromEntries(log.unitsInit.map((u) => [u.id, u])), [log])
  const nameOf = (id: string) => {
    const u = byId[id]
    return u ? (u.side === 'enemy' || u.isNpc ? t(u.name) : u.name) : id
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const frames = useMemo<Snap[]>(() => buildFrames(log, byId, nameOf, { nonLethal, fight: !!banner }), [log])

  const [cursor, setCursor] = useState(0)
  // Toasts wait while the fight plays.
  useRegisterBattle()
  const [playing, setPlaying] = useState(true)
  // The Master's default speed (Settings window).
  const [speed, setSpeed] = useState<number>(() => getSettings().battleSpeed)
  const atEnd = cursor >= frames.length - 1
  const reduced = useReducedMotion()
  // Portrait cut-ins (grade B+ skills; see cutInActs), never at 4× or under reduced motion.
  const allCutIns = useMemo(() => cutInActs(log, byId), [log, byId])
  const cutIns = useMemo(() => (speed < 4 && !reduced ? allCutIns : undefined), [speed, reduced, allCutIns])

  const snap = frames[Math.min(cursor, frames.length - 1)]!
  /** The event this beat is about (a sweep's first blow), and every event it plays. */
  const current = beatLead(log.events, snap)
  const beat = useMemo(() => beatEvents(log.events, snap), [log, snap])
  const leadIndex = current ? log.events.indexOf(current) : -1
  /** Events played through this frame. */
  const applied = snap.to + 1

  // Lane I: a boss's title card, a finisher's slow motion, the creature waking hold longer.
  const showHolds = useMemo(() => showHoldsFor(log, byId, { nonLethal }), [log, byId, nonLethal])
  const beatMs = atEnd ? 0 : frameHold(snap, log.events, byId, { speed, nonLethal, cutIns, shows: showHolds })
  useEffect(() => {
    if (!playing || atEnd) return
    const tm = setTimeout(() => setCursor((c) => Math.min(frames.length - 1, c + 1)), beatMs)
    return () => clearTimeout(tm)
  }, [cursor, playing, atEnd, beatMs, frames.length, log])

  // The layout (wide / a phone upright / on its side) and the stage's fit (useStageFit.ts).
  const sizeOf = (u: CombatUnitInit) => (u.side === 'hero' ? { w: 24, h: 32 } : enemySize(u.name, u.element))
  const { mode, pos: laidOut, zoom, stageW, ox, visible, hudRef, mainRef, wrapRef } = useStageFit(log, byId, sizeOf)
  // Two heroes who swapped stand in each other's places (lane G).
  const pos = useMemo(() => swappedPositions(laidOut, log.events, snap.to + 1), [laidOut, log.events, snap.to])
  const beside = mode === 'beside'
  const docked = mode === 'narrow'
  /** A skill name over a unit near the edge of the stage hangs inward instead of off screen. */
  const bannerW = (name: string) => name.length * Math.max(9, 11 / zoom) * 0.62 + 10
  const bannerEdge = (x: number, name: string): 'left' | 'right' | null => {
    const half = bannerW(name) / 2
    return x + half > visible.right ? 'right' : x - half < visible.left ? 'left' : null
  }

  const floorFx = devFxFloor() ?? log.floor
  const layers = layerUrls(floorFx)
  const weather = weatherForFloor(floorFx)

  const heroSrc = (u: CombatUnitInit): LookSource => {
    const h = state?.heroes[u.id as keyof GameState['heroes']]
    return h ?? { id: u.id, name: u.name, star: 3, heroClass: u.unitClass, element: u.element }
  }
  const bustOf = (u: CombatUnitInit) => (u.isNpc ? allyBustUrl(u.name) : heroBustUrl(heroSrc(u)))
  const iconOf = (u: CombatUnitInit) => (u.side === 'enemy' ? enemyUrl(u.name, u.element) : bustOf(u))

  // Numbers for this beat and the one before (a sweep's land one after another), and when
  // each struck unit flinches.
  const popups = useMemo(() => (atEnd ? [] : beatPopups(log.events, [frames[cursor - 1], snap], byId)), [cursor, log, atEnd, frames, snap, byId])
  const hurtDelay = useMemo(() => flinchDelays(beat), [beat])
  /** Where the skill name hangs over its caster (the numbers keep clear of it). */
  const bannerBox = (() => {
    const s = snap.skill
    const u = s ? byId[s.caster] : undefined
    const p = s ? pos[s.caster] : undefined
    if (!s || !u || !p || atEnd) return null
    const w = bannerW(s.name)
    const size = sizeOf(u)
    const edge = bannerEdge(p.x, s.name)
    const x = edge === 'left' ? p.x - size.w / 2 + w / 2 : edge === 'right' ? p.x + size.w / 2 - w / 2 : p.x
    return { x, y: p.y - size.h - 20, w, h: Math.max(9, 11 / zoom) * 1.2 + 2 }
  })()

  // Choreography: who runs where, who fires what (see choreo.ts).
  const style = useMemo<AttackStyle | null>(() => {
    const actor = eventActor(current)
    if (!actor) return null
    // The action's skill comes from its 'act' (hits and misses follow it); a follow-up
    // is the friend's own basic strike, with their own projectile.
    const skillId = actionSkillId(log.events, leadIndex, actor)
    const u = byId[actor]
    return u ? attackStyle(u, skillId, sizeOf(u).w) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.seq, log])
  const { poses, shot } = choreograph(
    atEnd ? undefined : current,
    pos,
    byId,
    style,
    (id) => (byId[id] ? sizeOf(byId[id]!).w : 24),
    (id) => (byId[id] ? sizeOf(byId[id]!).h : 32),
    snap.element,
    snap.targets,
  )
  // The parties march in at the start; a new wave charges on.
  const entering = (u: CombatUnitInit) =>
    cursor <= 1 || ((current?.kind === 'wave-spawn' || current?.kind === 'summon') && current.enemyIds.includes(u.id))

  const heroes = log.unitsInit.filter((u) => u.side === 'hero')
  const enemies = log.unitsInit.filter((u) => u.side === 'enemy')
  const liveEnemies = enemies.filter((u) => snap.visible[u.id] && !snap.dead[u.id])

  const outcome = log.outcome

  // The mission, the turn order and the waves (pure helpers over the log played so far).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => objectiveView(log, applied, nameOf), [log, applied])
  const upcoming = useMemo(() => (atEnd ? [] : upcomingTurns(log, applied, docked ? 5 : 6)), [log, applied, atEnd, docked])
  const turnNow = atEnd ? null : snap.actor ?? snap.panic
  const markOf = (id: string): 'target' | 'escort' | null => (view?.marked.includes(id) ? 'target' : view?.escorts.includes(id) ? 'escort' : null)
  const totalWaves = log.mission?.waves ?? 1 + log.events.filter((e) => e.kind === 'wave-spawn').length
  const waveBanner =
    current?.kind === 'wave-spawn'
      ? { n: current.wave + 1, total: Math.max(totalWaves, current.wave + 1) }
      : current?.kind === 'battle-start' && totalWaves > 1
        ? { n: 1, total: totalWaves }
        : null
  const waveCleared = current?.kind === 'mission' && current.code === 'wave-cleared' ? { n: current.params?.wave ?? 0, total: current.params?.waves ?? totalWaves } : null

  // The elements hint: the first time a blow lands on a weakness (once per player).
  const [hint, setHint] = useState<'off' | 'on' | 'done'>(() => (elementsHintSeen() ? 'done' : 'off'))
  useEffect(() => {
    if (hint === 'off' && beat.some((e) => e.kind === 'hit' && e.eff === 'weak')) setHint('on')
  }, [beat, hint])
  const closeHint = () => {
    markElementsHintSeen()
    setHint('done')
  }

  // The death moment: the world greys, the fallen hero sinks slowly, their last words…
  // (A trial has no deaths: a hero who drops is only out.)
  const fallen =
    !nonLethal && current?.kind === 'death' && byId[current.unitId]?.side === 'hero' && !byId[current.unitId]?.isNpc ? byId[current.unitId]! : null
  // …which linger a moment after the replay moves on, then fade.
  // Heroes who fall in one battle never share their last words (and the Memorial agrees).
  const fallenWords = useMemo(() => {
    const deaths = log.events.filter((e) => e.kind === 'death' && byId[e.unitId]?.side === 'hero' && !byId[e.unitId]?.isNpc)
    const recs = deaths.map((e) => ({ heroId: (e as { unitId: string }).unitId as HeroId, name: byId[(e as { unitId: string }).unitId]!.name }))
    return state ? lastWordsTogether(state, recs) : new Map<string, string>()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log])
  const mourning = useMourning(fallen && current ? { unit: fallen, seq: current.seq } : null, (u) => fallenWords.get(u.id) ?? '…', speed)
  // Music for the floor (act / boss / Wall / world's end), the jingle at the end, every
  // beat's sounds, and the death moment's duck and motif (audio/useBattleAudio.ts).
  useBattleAudio({
    beatKey: `${cursor}|${log.seed}|${log.events.length}`,
    beat,
    active: !atEnd,
    byId,
    element: snap.element,
    speed,
    floor: log.floor,
    ended: atEnd,
    outcome,
    nonLethal,
    deathSeq: fallen && current ? current.seq : null,
  })

  // Sparks, hit-stop, punch and shake as each blow of the beat lands (useImpactJuice.ts).
  const fx = useRef<FxHandle | null>(null)
  const camRef = useRef<HTMLDivElement | null>(null)
  // Lane I: boss intros, the waking, the finisher (useBossShow.tsx), and the boss bar.
  const boss = useBossShow({
    log,
    byId,
    snap,
    atEnd,
    speed,
    reduced,
    pos,
    ox,
    sizeOf,
    beatMs,
    cam: camRef,
    wrap: wrapRef,
    fx,
    onSkip: () => setCursor((c) => Math.min(frames.length - 1, c + 1)),
    wave: current?.kind === 'wave-spawn' ? { n: current.wave + 1, total: Math.max(log.mission?.waves ?? 1, current.wave + 1) } : null,
  })
  const pace = boss.pace
  // Lane M: the bosses' lines (entrance, phase, telegraph, defeat, victory) in a text box.
  const story = useStoryBox({ log, byId, snap, atEnd, speed, reduced })
  const bar = useMemo(() => (atEnd ? null : bossBarView(log, byId, snap, applied)), [log, byId, snap, applied, atEnd])

  useImpactJuice({
    beatKey: `${cursor}|${log.seed}|${log.events.length}`,
    beat,
    active: !atEnd,
    at: (id) => {
      const p = pos[id]
      const u = byId[id]
      if (!p || !u) return null
      return { x: ox + p.x, y: p.y - Math.round(sizeOf(u).h / 2) }
    },
    byId,
    element: snap.element,
    speed: pace,
    reduced,
    fx,
    cam: camRef,
    wrap: wrapRef,
  })

  // Lane I: a skill's own effect (skillFx.ts) plays as it is cast, over everyone it reaches.
  useEffect(() => {
    if (atEnd || current?.kind !== 'act') return
    const actor = byId[current.actorId]
    const profile = actor ? skillFx(current.skillId, actor.element) : null
    if (!actor || !profile) return
    const at = (id: string) => {
      const p = pos[id]
      const u = byId[id]
      return p && u ? { x: ox + p.x, y: p.y, h: sizeOf(u).h } : null
    }
    const caster = at(actor.id)
    if (!caster) return
    const targets = castTargets(log.events, leadIndex)
      .map(at)
      .filter((p): p is NonNullable<typeof p> => p !== null)
    // A striker who runs across the field lands the effect when it arrives.
    const runs = style === 'melee' && profile.shape !== 'aura-up' && profile.shape !== 'dome' && profile.shape !== 'motes'
    fx.current?.skill(
      { profile, caster, targets, dir: actor.side === 'enemy' ? 1 : -1, seed: (log.seed ^ (current.seq * 2654435761)) >>> 0 },
      profile.ms / pace,
      runs ? DURATION.act / pace : 0,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, log])

  const tick = current?.tick ?? 0
  const [retreatArmed, setRetreatArmed] = useState(false)
  function give(order: BattleOrder) {
    if (!orders) return
    const next = orders.give(order)
    setAim(null)
    setSwapFirst(null)
    setRetreatArmed(false)
    if (!next) return
    // The new log replays the old one exactly up to the order's tick, so the replay goes on
    // from the frame on screen: the rest of this tick still plays, then the order (B16).
    const nextById = Object.fromEntries(next.unitsInit.map((u) => [u.id, u]))
    const nextFrames = buildFrames(next, nextById, nameOf, { nonLethal, fight: !!banner })
    setCursor(frameAtEvents(nextFrames, resumeCursor(log, next, applied)))
    setLog(next)
    setPlaying(true)
    if (order.kind !== 'retreat') setGiven((n) => n + 1)
  }
  // Orders in hand: the battle's allowance, a refill per wave cleared (lane G), less those given.
  const ordersLeft = orders ? ordersInHand(orders.left, given, log, tick + 1) : 0
  const canAim = (u: CombatUnitInit) => aimable(aim, u, !!snap.dead[u.id], !!snap.visible[u.id])
  const aimAt = (u: CombatUnitInit) => {
    if (!aim || atEnd || !canAim(u)) return
    // B3: Protect shields anyone on the party's side — the escort too (combat steers enemies
    // off any overlooked ally, mission NPCs included). Unleash and Swap are for heroes.
    const r = clickOrder(aim, u, tick + 1, swapFirst)
    if (r === null) return
    if ('swapFirst' in r) setSwapFirst(r.swapFirst)
    else give(r.order)
  }
  /** Guard and Hold land at once (no target). */
  const orderNow = (kind: 'guard' | 'hold') => {
    if (!orders || atEnd || ordersLeft <= 0) return
    if (kind === 'hold' && holdGiven(log.events, applied)) return
    give(kind === 'guard' ? { tick: tick + 1, kind: 'guard' } : { tick: tick + 1, kind: 'hold' })
  }
  /** Play / pause; resuming puts away an aim or an armed retreat (the prompt never lingers). */
  const togglePlay = () => {
    if (!playing) {
      setAim(null)
      setSwapFirst(null)
      setRetreatArmed(false)
    }
    setPlaying(!playing)
  }
  const hasEscort = heroes.some((u) => u.isNpc)
  const toggleAim = (which: AimOrder) => {
    if (ordersLeft <= 0) return
    setAim(aim === which ? null : which)
    setSwapFirst(null)
    setRetreatArmed(false)
    setPlaying(false)
  }
  /** Retreat throws the fight away: the first press (key or click) asks, the second sounds it. */
  const retreat = () => {
    if (retreatArmed) give({ tick: tick + 1, kind: 'retreat' })
    else {
      setRetreatArmed(true)
      setAim(null)
      setPlaying(false)
    }
  }

  // Keyboard: the battle is a modal overlay, so it listens first (capture phase) and
  // keeps every key from reaching the lobby or the windows underneath.
  const introOn = boss.show !== null && boss.show.kind !== 'finisher'
  const live = useRef({ atEnd, hasOrders: !!orders, retreat, toggleAim, togglePlay, orderNow, onDone, last: frames.length - 1, introOn })
  live.current = { atEnd, hasOrders: !!orders, retreat, toggleAim, togglePlay, orderNow, onDone, last: frames.length - 1, introOn }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      e.stopPropagation()
      const L = live.current
      const act = battleKeyAction(e, L.atEnd)
      if (!act) return
      e.preventDefault()
      // A focused button would also "click" on Space/Enter: the shortcut wins.
      const focused = document.activeElement
      if (focused instanceof HTMLElement && focused.tagName === 'BUTTON') focused.blur()
      switch (act.kind) {
        case 'continue':
          L.onDone()
          return
        case 'pause':
          L.togglePlay()
          return
        case 'speed':
          setSpeed(act.speed)
          return
        case 'skip':
          setAim(null)
          setSwapFirst(null)
          setRetreatArmed(false)
          setCursor(L.last)
          return
        case 'focus':
        case 'protect':
        case 'unleash':
        case 'swap':
          if (L.hasOrders) L.toggleAim(act.kind)
          return
        case 'guard':
        case 'hold':
          if (L.hasOrders) L.orderNow(act.kind)
          return
        case 'retreat':
          if (L.hasOrders) L.retreat()
          return
        case 'escape':
          // Esc skips a boss's title card (lane I) as well as putting an aim away.
          if (L.introOn) setCursor((c) => Math.min(L.last, c + 1))
          setAim(null)
          setSwapFirst(null)
          setRetreatArmed(false)
          return
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const kbd = (k: string) => <kbd className="bkey">{t(k)}</kbd>
  // Lane Q: the foe column is as wide as the longest foe name needs (ui/layout).
  const foeCols = useMemo(() => foeColumnVars(log.unitsInit.filter((u) => u.side === 'enemy').map((u) => `${t(u.name)}`)), [log])
  const card = mourning ?? (fallen ? { unit: fallen, words: '', seq: -1, fading: false } : null)
  const stagePxW = Math.round(stageW * zoom)
  const cutIn =
    !atEnd && current?.kind === 'act' && cutIns?.has(snap.from) && snap.skill
      ? { key: current.seq, bust: bustOf(byId[current.actorId]!), name: snap.skill.name, color: snap.skill.color }
      : null

  const objective = view ? <ObjectiveHud view={view} snap={snap} byId={byId} nameOf={nameOf} bustOf={bustOf} docked={docked || beside} /> : null
  const turns = <TurnStrip now={turnNow} next={upcoming} byId={byId} iconOf={iconOf} nameOf={nameOf} docked={docked || beside} />
  // The hint steps aside for a death moment and the fallen hero's last words.
  const elementsCard = hint === 'on' && !card && !fallen ? <ElementsHint onClose={closeHint} docked={docked || beside} /> : null
  // Lane P: the coach's tip, the first time its lesson happens (it waits behind the hint).
  const hintCard = (
    <>
      {elementsCard}
      {coach && <CoachBattleTip lesson={coach.lesson} beat={beat} byId={byId} onSeen={coach.onSeen} seen={coach.seen} docked={docked || beside} hidden={!!card || !!fallen || elementsCard !== null} />}
    </>
  )

  return (
    <div
      className={`battle ${reduced ? 'calm' : ''} ${beside ? 'beside' : ''} ${docked ? 'narrow' : ''} ${nonLethal ? 'trial' : ''}`}
      style={{ ['--spd' as string]: speed, ['--pop-spd' as string]: Math.min(speed, 2), ['--zoom' as string]: zoom, ...foeCols }}
    >
      <div className="battle-main" ref={mainRef}>
        {docked && objective}
        <div
          ref={wrapRef}
          className={`battle-stage-wrap ${aim ? 'aiming' : ''} ${fallen ? 'death-moment' : ''}`}
          style={{ width: stagePxW, height: Math.round(BG_H * zoom) }}
        >
          <div
            className={`battle-stage ${boss.shattered ? 'slowmo' : ''}`}
            style={{ width: stageW, height: BG_H, transform: `scale(${zoom})`, ['--spd' as string]: pace, ['--pop-spd' as string]: Math.min(pace, 2) }}
          >
            <div className="battle-cam" ref={camRef}>
              {LAYER_ORDER.map((name) =>
                layers[name] ? (
                  <div
                    key={name}
                    className={`bg-layer bg-${name} bg-theme-${bgTheme(floorFx)}`}
                    style={{ backgroundImage: `url(${layers[name]})`, ['--ox' as string]: `${ox}px` }}
                  />
                ) : null,
              )}

              <div className="battle-units" style={{ left: ox }}>
                {log.unitsInit.map((u) => {
                  if (!snap.visible[u.id] && u.side === 'enemy') return null
                  const p = pos[u.id]!
                  const isHero = u.side === 'hero'
                  const acting =
                    snap.actor === u.id &&
                    (current?.kind === 'act' || current?.kind === 'hit' || current?.kind === 'miss' || current?.kind === 'followup')
                  // Every unit a blow of this beat lands on flinches (even when the sweep's first blow missed).
                  const hurt = beat.some((e) => e.kind === 'hit' && e.targetId === u.id)
                  const skillHit = hurt && snap.skill !== null
                  const dead = !!snap.dead[u.id]
                  // The skill's name stays over its caster through every blow of the act.
                  const casting = !atEnd && snap.skill !== null && snap.skill.caster === u.id
                  const status = unitStatus(snap.status, u.id)
                  // Lane I: the body for the moment (a pose for heroes, a two-frame idle for foes).
                  const body = (() => {
                    if (!isHero) {
                      const still = !dead && !hurt && !acting
                      return { src: enemyUrl(u.name, u.element), idleSrc: still ? enemyUrl(u.name, u.element, 1) : undefined }
                    }
                    if (u.isNpc && !allyPosable(u.name)) return { src: allyFrameUrl(u.name) }
                    const p = heroPoseFor({
                      dead,
                      falling: fallen?.id === u.id,
                      acting,
                      skillId: acting ? actionSkillId(log.events, leadIndex, u.id) : null,
                      unitClass: u.unitClass,
                      hurt,
                      guarded: !atEnd && isGuarded(status.marks, beat, u.id),
                      won: atEnd && outcome === 'win',
                    })
                    const url = (q: HeroPose) => (u.isNpc ? allyPoseUrl(u.name, q) : heroPoseUrl(heroSrc(u), q))
                    if (p === 'idle') return { src: u.isNpc ? allyFrameUrl(u.name) : heroFrameUrl(heroSrc(u), 'left', 0), idleSrc: url('idle'), posed: true }
                    return { src: url(p), posed: true, imgSize: p === 'ko' ? poseSize(p) : undefined }
                  })()
                  return (
                    <UnitSprite
                      key={u.id}
                      u={u}
                      onClick={() => aimAt(u)}
                      look={{
                        x: p.x,
                        y: p.y,
                        size: sizeOf(u),
                        ...body,
                        pose: poses[u.id],
                        acting,
                        hurt,
                        dead,
                        falling: fallen?.id === u.id,
                        entering: entering(u),
                        cheering: atEnd && outcome === 'win' && isHero && !dead,
                        aimable: canAim(u),
                        hpPct: (Math.max(0, snap.hp[u.id] ?? u.maxHP) / u.maxHP) * 100,
                        skillFlash: skillHit ? snap.skill!.color : null,
                        banner: casting ? { name: snap.skill!.name, color: snap.skill!.color, edge: bannerEdge(p.x, snap.skill!.name) } : null,
                        turnMark: snap.actor === u.id && !dead && !atEnd && !casting,
                        panic: snap.panic === u.id,
                        // A boss under its title card steps in at once, into its own spotlight.
                        enterDelayMs: boss.show?.kind === 'intro' && boss.show.units.includes(u.id) ? 0 : (isHero ? heroes.indexOf(u) : enemies.indexOf(u) % 6) * 70,
                        status,
                        mark: markOf(u.id),
                        hurtDelayMs: Math.round((hurtDelay[u.id] ?? 0) / pace),
                        // A shattered boss stays gone: without the class its KO dissolve would replay.
                        shatterAtMs: boss.shattered === u.id ? boss.shatterAt : boss.gone.has(u.id) ? 0 : undefined,
                      }}
                    />
                  )
                })}

                {shot && (
                  <div
                    key={shot.key}
                    className={`bshot ${shot.style}`}
                    style={{
                      left: shot.from.x,
                      top: shot.from.y,
                      zIndex: 998,
                      ['--dx' as string]: `${shot.to.x - shot.from.x}px`,
                      ['--dy' as string]: `${shot.to.y - shot.from.y}px`,
                      ['--shot' as string]: ELEMENT_VIS[shot.element].color,
                      ['--rot' as string]: `${Math.atan2(shot.to.y - shot.from.y, shot.to.x - shot.from.x)}rad`,
                    }}
                  />
                )}

                {boss.shatter}

                <Telegraphs view={snap.boss} pos={pos} heightOf={(id) => (byId[id] ? sizeOf(byId[id]!).h : 32)} dead={snap.dead} tick={tick} atEnd={atEnd} />

                <DamagePopups
                  items={popups}
                  pos={pos}
                  headOf={(id) => (byId[id] ? sizeOf(byId[id]!).h : 32)}
                  zoom={zoom}
                  speed={pace}
                  bounds={visible}
                  reserved={bannerBox ? [bannerBox] : []}
                />
              </div>

              <BattleFxCanvas
                ref={fx}
                width={stageW}
                height={BG_H}
                horizon={HORIZON}
                weather={weather}
                density={reduced ? 0.25 : 1}
                phone={mode !== 'wide'}
                flashes={flashesOn() && !reduced}
              />
              {boss.spotlight}
            </div>

            {fallen && <DeathVeil />}

            {atEnd && <ResultBanner outcome={outcome} nonLethal={nonLethal} words={banner} />}
            {card && <DeathCard key={card.unit.id} unit={card.unit} words={card.words} fading={card.fading} bust={heroBustUrl(heroSrc(card.unit))} />}
          </div>

          {/* Screen-space overlays: crisp at any zoom. */}
          {cutIn && <SkillCutIn key={cutIn.key} bust={cutIn.bust} name={cutIn.name} color={cutIn.color} side="right" />}
          {/* A boss's title card carries the wave count itself (lane I). */}
          {!atEnd && waveBanner && boss.show?.kind !== 'intro' && <WaveBanner key={`w${current!.seq}`} n={waveBanner.n} total={waveBanner.total} />}
          {!atEnd && waveCleared && <WaveCleared key={`c${current!.seq}`} n={waveCleared.n} total={waveCleared.total} calm={reduced} />}
          {!atEnd && current?.kind === 'phase' && <PhaseCinematic key={`p${current.seq}`} e={current} name={nameOf(current.unitId)} calm={reduced} />}
          {boss.card}
          {story}
          <div className="stage-top">
            <div className="stage-top-left">{!docked && !beside && objective}</div>
            <div className="stage-top-mid">
              <div className="battle-caption pframe">{snap.caption}</div>
              {bar && <BossBar key={bar.unitId} view={bar} docked={docked || beside} />}
            </div>
            <div className="stage-top-right">{!docked && !beside && turns}</div>
          </div>
          {!docked && !beside && hintCard}
        </div>
        {docked && turns}
        {docked && hintCard}
      </div>

      <div
        className="battle-hud"
        ref={hudRef}
        style={beside ? undefined : { width: Math.max(Math.min(stagePxW, 1280), Math.min(800, window.innerWidth - 16)) }}
      >
        {beside && objective}
        {beside && turns}
        {beside && hintCard}
        <FoeHud live={liveEnemies} snap={snap} aiming={aim === 'focus'} onAim={aimAt} marked={view?.marked ?? []} />
        <PartyRows heroes={heroes} snap={snap} aiming={aim === 'protect'} aimableFor={canAim} picked={swapFirst} bustOf={bustOf} onAim={aimAt} />
        <BattleControls
          atEnd={atEnd}
          playing={playing}
          speed={speed}
          onTogglePlay={togglePlay}
          onSpeed={setSpeed}
          onSkip={() => setCursor(frames.length - 1)}
          onDone={onDone}
          orders={
            orders
              ? {
                  aim,
                  left: ordersLeft,
                  retreatArmed,
                  onAim: toggleAim,
                  onRetreat: retreat,
                  focusBonus: orders.focusBonus ?? 0,
                  escort: hasEscort,
                  onGuard: () => orderNow('guard'),
                  onHold: () => orderNow('hold'),
                  bigMove: anyCharge(snap.boss),
                  holding: holdGiven(log.events, applied),
                  guarding: guardUp(log.events, applied),
                  swapFirst,
                }
              : null
          }
          kbd={kbd}
        />
      </div>
    </div>
  )
}
