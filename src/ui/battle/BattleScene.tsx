import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { sfx } from '../audio/sound'
import { useMusic } from '../audio/useSound'
import type { BattleOrder, CombatLog, CombatUnitInit, GameState, HeroId } from '../../engine/types'
import { lastWords } from '../life/speech'
import { bgTheme, BG_H, BG_W, HORIZON, LAYER_ORDER } from '../pixel/battleBg'
import { BattleFxCanvas, type FxHandle } from './BattleFxCanvas'
import { battleKeyAction, fitStage, hudBeside, isTypingTarget, weatherForFloor } from './battleFx'
import { allyBustUrl, allyFrameUrl, enemySize, enemyUrl, heroBustUrl, heroFrameUrl } from '../pixel/sprites'
import type { LookSource } from '../pixel/look'
import { ELEMENT_VIS } from '../bits'
import { t } from '../i18n/i18n'
import { attackStyle, choreograph, type AttackStyle } from './choreo'
import { actionSkillId, buildFrames, DURATION, eventActor, HERO_DEATH_MS, HITSTOP_MS, layout, type Snap } from './battleFrames'
import { useMourning } from './useMourning'
import { devFxFloor, layerUrls, punch, shake, useReducedMotion } from './stageFx'
import { UnitSprite } from './UnitSprite'
import { DamagePopups, popupEvents } from './DamagePopups'
import { FoeHud } from './FoeHud'
import { PartyRows } from './PartyRows'
import { BattleControls } from './BattleControls'
import type { Aim } from './OrderBar'
import { DeathCard, DeathVeil, ResultBanner } from './ResultBanner'
import './battle.css'

/**
 * The battle as a side-view JRPG scene. The engine resolved the fight already;
 * this replays its CombatLog event by event: attackers lunge, targets flash and
 * shake, damage numbers pop, the fallen collapse. Party right, foes left.
 *
 * The timeline (frames, layout, durations) is built in battleFrames.ts; the pieces on
 * screen are UnitSprite, DamagePopups, FoeHud, PartyRows, BattleControls/OrderBar and
 * ResultBanner. This component keeps the orchestration: the clock, the orders, the
 * keyboard, and the juice that fires as each blow lands.
 */

/** The Master's mid-battle levers (the tower passes these; replays and events don't). */
export interface BattleOrders {
  /** Focus / protect orders still available this battle. */
  left: number
  /** Re-resolve the fight with `order` (applied at its tick); returns the new log. */
  give: (order: BattleOrder) => CombatLog | null
}

export function BattleScene({
  log: initialLog,
  state,
  onDone,
  orders,
  nonLethal = false,
}: {
  log: CombatLog
  state: GameState | null
  onDone: () => void
  orders?: BattleOrders
  /** A trial (the weekly echo): nobody dies, so no death moment and no DEFEAT. */
  nonLethal?: boolean
}) {
  const [log, setLog] = useState(initialLog)
  const [aim, setAim] = useState<Aim>(null)
  const [given, setGiven] = useState(0)
  const byId = useMemo(() => Object.fromEntries(log.unitsInit.map((u) => [u.id, u])), [log])
  const nameOf = (id: string) => {
    const u = byId[id]
    return u ? (u.side === 'enemy' || u.isNpc ? t(u.name) : u.name) : id
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const frames = useMemo<Snap[]>(() => buildFrames(log, byId, nameOf, { nonLethal }), [log])

  const [cursor, setCursor] = useState(0)
  // Battle music while the scene is up; the scene underneath gets its theme back after.
  useMusic('battle')
  // A sound for each event as it plays (cosmetic).
  useEffect(() => {
    const e = cursor > 0 ? log.events[cursor - 1] : undefined
    if (!e) return
    if (e.kind === 'hit') sfx(e.crit ? 'crit' : 'hit')
    else if (e.kind === 'miss') sfx('miss')
    else if (e.kind === 'guard') sfx('guard')
    else if (e.kind === 'heal') sfx('heal')
    else if (e.kind === 'death') sfx('death')
    else if (e.kind === 'panic') sfx('panic')
    else if (e.kind === 'end') sfx(e.outcome === 'win' ? 'victory' : 'defeat')
  }, [cursor, log.events])
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<number>(1)
  const atEnd = cursor >= frames.length - 1

  useEffect(() => {
    if (!playing || atEnd) return
    const ev = log.events[cursor] // the event that produces frame cursor+1
    const shown = cursor > 0 ? log.events[cursor - 1] : undefined
    let ms = (ev ? DURATION[ev.kind] : 400) / speed
    // Hit-stop: a critical blow freezes the frame for a beat.
    if (shown?.kind === 'hit' && shown.crit) ms += HITSTOP_MS
    // A hero's death is not rushed, whatever the speed (a trial's knock-out is).
    if (!nonLethal && shown?.kind === 'death' && byId[shown.unitId]?.side === 'hero' && !byId[shown.unitId]?.isNpc) ms = Math.max(ms, HERO_DEATH_MS / Math.min(speed, 2))
    const tm = setTimeout(() => setCursor((c) => Math.min(frames.length - 1, c + 1)), ms)
    return () => clearTimeout(tm)
  }, [cursor, playing, atEnd, speed, frames.length, log.events, byId])

  // Fit the stage to the screen: as big as the room left by the windows below allows,
  // and wider than the 384px canon on wide screens (the backdrop tiles to fill).
  const hudRef = useRef<HTMLDivElement | null>(null)
  const [fit, setFit] = useState(() => ({ ...fitStage(BG_W * 2, BG_H * 2), beside: false }))
  useLayoutEffect(() => {
    const measure = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      // A short landscape screen (a phone on its side) puts the windows beside the stage.
      const beside = hudBeside(vw, vh)
      const next = beside
        ? fitStage(vw - (hudRef.current?.offsetWidth ?? 280) - 28, vh - 16)
        : fitStage(vw - 16, vh - (hudRef.current?.offsetHeight ?? 0) - 26)
      setFit((f) => (f.zoom === next.zoom && f.width === next.width && f.beside === beside ? f : { ...next, beside }))
    }
    measure()
    window.addEventListener('resize', measure)
    const ro = typeof ResizeObserver !== 'undefined' && hudRef.current ? new ResizeObserver(measure) : null
    if (ro && hudRef.current) ro.observe(hudRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [])
  const { zoom, width: stageW, beside } = fit
  /** Where the 384px canon (the unit layout) sits inside the wider stage. */
  const ox = Math.floor((stageW - BG_W) / 2)

  const reduced = useReducedMotion()
  const snap = frames[cursor]!
  const current = cursor > 0 ? log.events[cursor - 1] : undefined
  const pos = useMemo(() => layout(log), [log])
  const floorFx = devFxFloor() ?? log.floor
  const layers = layerUrls(floorFx)
  const weather = weatherForFloor(floorFx)

  const heroSrc = (u: CombatUnitInit): LookSource => {
    const h = state?.heroes[u.id as keyof GameState['heroes']]
    return h ?? { id: u.id, name: u.name, star: 3, heroClass: u.unitClass, element: u.element }
  }

  // Damage popups for the most recent few events (each animates once on mount).
  const popups = popupEvents(atEnd ? [] : log.events.slice(Math.max(0, cursor - 3), cursor))

  // Choreography: who runs where, who fires what (see choreo.ts).
  const sizeOf = (u: CombatUnitInit) => (u.side === 'hero' ? { w: 24, h: 32 } : enemySize(u.name, u.element))
  const style = useMemo<AttackStyle | null>(() => {
    const actor = eventActor(current)
    if (!actor) return null
    // The action's skill comes from its 'act' (hits and misses follow it); a follow-up
    // is the friend's own basic strike, with their own projectile.
    const skillId = actionSkillId(log.events, cursor - 1, actor)
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
  )
  // The parties march in at the start; a new wave charges on.
  const entering = (u: CombatUnitInit) =>
    cursor <= 1 || (current?.kind === 'wave-spawn' && current.enemyIds.includes(u.id))

  const heroes = log.unitsInit.filter((u) => u.side === 'hero')
  const enemies = log.unitsInit.filter((u) => u.side === 'enemy')
  const liveEnemies = enemies.filter((u) => snap.visible[u.id] && !snap.dead[u.id])

  const outcome = log.outcome

  // The death moment: the world greys, the fallen hero sinks slowly, their last words…
  // (A trial has no deaths: a hero who drops is only out.)
  const fallen =
    !nonLethal && current?.kind === 'death' && byId[current.unitId]?.side === 'hero' && !byId[current.unitId]?.isNpc ? byId[current.unitId]! : null
  // …which linger a moment after the replay moves on, then fade.
  const mourning = useMourning(
    fallen && current ? { unit: fallen, seq: current.seq } : null,
    (u) => (state ? lastWords(state, { heroId: u.id as HeroId, name: u.name }) : '…'),
    speed,
  )

  // Impact juice for each blow as it lands: element sparks, and on a crit the hit-stop,
  // the camera punch and the heavy shake; a killing blow gets a smaller punch.
  const fx = useRef<FxHandle | null>(null)
  const camRef = useRef<HTMLDivElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const e = current
    if (!e || atEnd) return
    const at = (id: string) => {
      const p = pos[id]
      const u = byId[id]
      if (!p || !u) return null
      const h = u.side === 'hero' ? 32 : enemySize(u.name, u.element).h
      return { x: ox + p.x, y: p.y - Math.round(h / 2) }
    }
    if (e.kind === 'hit') {
      const p = at(e.targetId)
      if (!p) return
      const dir: 1 | -1 = byId[e.actorId]?.side === 'hero' ? -1 : 1
      const kill = e.hpAfter <= 0
      const big = e.amount >= (byId[e.targetId]?.maxHP ?? Infinity) * 0.25
      if (e.crit) {
        fx.current?.freeze(HITSTOP_MS)
        fx.current?.burst('crit', snap.element, p.x, p.y, dir)
        if (!reduced) {
          punch(camRef.current, p, kill ? 1.14 : 1.1, HITSTOP_MS)
          shake(wrapRef.current, 5, HITSTOP_MS)
        }
      } else {
        fx.current?.burst(kill ? 'kill' : 'hit', snap.element, p.x, p.y, dir)
        if (!reduced) {
          if (kill) punch(camRef.current, p, 1.05, 0)
          if (kill || big) shake(wrapRef.current, 2, 0)
        }
      }
    } else if (e.kind === 'heal') {
      const p = at(e.unitId)
      if (p) fx.current?.burst('heal', 'wind', p.x, p.y + 6, 1)
    } else if (e.kind === 'guard') {
      const p = at(e.targetId)
      if (p) fx.current?.burst('guard', 'physical', p.x, p.y, byId[e.actorId]?.side === 'hero' ? -1 : 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.seq, log])

  const tick = current?.tick ?? 0
  const [retreatArmed, setRetreatArmed] = useState(false)
  function give(order: BattleOrder) {
    if (!orders) return
    const next = orders.give(order)
    setAim(null)
    setRetreatArmed(false)
    if (!next) return
    // The new log replays the old one exactly up to the order's tick: resume there.
    const resume = next.events.findIndex((e) => e.tick >= order.tick)
    setLog(next)
    setCursor(resume < 0 ? 0 : resume)
    setPlaying(true)
    if (order.kind !== 'retreat') setGiven((n) => n + 1)
  }
  const ordersLeft = orders ? orders.left - given : 0
  const aimAt = (u: CombatUnitInit) => {
    if (!aim || atEnd || snap.dead[u.id]) return
    if (aim === 'focus' && u.side === 'enemy' && snap.visible[u.id]) give({ tick: tick + 1, kind: 'focus', enemyId: u.id })
    if (aim === 'protect' && u.side === 'hero' && !u.isNpc) give({ tick: tick + 1, kind: 'protect', allyId: u.id })
  }
  const toggleAim = (which: 'focus' | 'protect') => {
    if (ordersLeft <= 0) return
    setAim(aim === which ? null : which)
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
  const live = useRef({ atEnd, hasOrders: !!orders, retreat, toggleAim, onDone, last: frames.length - 1 })
  live.current = { atEnd, hasOrders: !!orders, retreat, toggleAim, onDone, last: frames.length - 1 }
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
          setPlaying((p) => !p)
          return
        case 'speed':
          setSpeed(act.speed)
          return
        case 'skip':
          setAim(null)
          setRetreatArmed(false)
          setCursor(L.last)
          return
        case 'focus':
        case 'protect':
          if (L.hasOrders) L.toggleAim(act.kind)
          return
        case 'retreat':
          if (L.hasOrders) L.retreat()
          return
        case 'escape':
          setAim(null)
          setRetreatArmed(false)
          return
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const kbd = (k: string) => <kbd className="bkey">{t(k)}</kbd>
  const card = mourning ?? (fallen ? { unit: fallen, words: '', seq: -1, fading: false } : null)
  const stagePxW = Math.round(stageW * zoom)

  return (
    <div className={`battle ${reduced ? 'calm' : ''} ${beside ? 'beside' : ''} ${nonLethal ? 'trial' : ''}`}>
      <div
        ref={wrapRef}
        className={`battle-stage-wrap ${aim ? 'aiming' : ''} ${fallen ? 'death-moment' : ''}`}
        style={{ width: stagePxW, height: Math.round(BG_H * zoom) }}
      >
        <div className="battle-stage" style={{ width: stageW, height: BG_H, transform: `scale(${zoom})`, ['--spd' as string]: speed }}>
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
                  snap.actor === u.id && (current?.kind === 'act' || current?.kind === 'hit' || current?.kind === 'miss' || current?.kind === 'followup')
                const hurt = snap.target === u.id && current?.kind === 'hit'
                const skillHit = hurt && snap.skill !== null
                const dead = !!snap.dead[u.id]
                const casting = snap.skill !== null && snap.skill.caster === u.id && current?.kind === 'act'
                return (
                  <UnitSprite
                    key={u.id}
                    u={u}
                    onClick={() => aimAt(u)}
                    look={{
                      x: p.x,
                      y: p.y,
                      size: sizeOf(u),
                      src: u.isNpc ? allyFrameUrl(u.name) : isHero ? heroFrameUrl(heroSrc(u), 'left', acting ? 1 : 0) : enemyUrl(u.name, u.element),
                      pose: poses[u.id],
                      acting,
                      hurt,
                      dead,
                      falling: fallen?.id === u.id,
                      entering: entering(u),
                      cheering: atEnd && outcome === 'win' && isHero && !dead,
                      aimable: (aim === 'focus' && !isHero && !dead) || (aim === 'protect' && isHero && !u.isNpc && !dead),
                      hpPct: (Math.max(0, snap.hp[u.id] ?? u.maxHP) / u.maxHP) * 100,
                      skillFlash: skillHit ? snap.skill!.color : null,
                      banner: casting ? { name: snap.skill!.name, color: snap.skill!.color } : null,
                      turnMark: snap.actor === u.id && !dead && !atEnd && !casting,
                      panic: snap.panic === u.id,
                      enterDelayMs: (isHero ? heroes.indexOf(u) : enemies.indexOf(u) % 6) * 70,
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

              <DamagePopups events={popups} pos={pos} headOf={(id) => (byId[id] ? sizeOf(byId[id]!).h : 32)} />
            </div>

            <BattleFxCanvas ref={fx} width={stageW} height={BG_H} horizon={HORIZON} weather={weather} density={reduced ? 0.25 : 1} />
          </div>

          {fallen && <DeathVeil />}

          {atEnd && <ResultBanner outcome={outcome} nonLethal={nonLethal} />}
          {card && <DeathCard key={card.unit.id} unit={card.unit} words={card.words} fading={card.fading} bust={heroBustUrl(heroSrc(card.unit))} />}
        </div>
        <div className="battle-caption pframe">{snap.caption}</div>
      </div>

      <div
        className="battle-hud"
        ref={hudRef}
        style={beside ? undefined : { width: Math.max(Math.min(stagePxW, 1280), Math.min(800, window.innerWidth - 16)) }}
      >
        <FoeHud live={liveEnemies} snap={snap} aiming={aim === 'focus'} onAim={aimAt} />
        <PartyRows
          heroes={heroes}
          snap={snap}
          aiming={aim === 'protect'}
          bustOf={(u) => (u.isNpc ? allyBustUrl(u.name) : heroBustUrl(heroSrc(u)))}
          onAim={aimAt}
        />
        <BattleControls
          atEnd={atEnd}
          playing={playing}
          speed={speed}
          onTogglePlay={() => setPlaying((p) => !p)}
          onSpeed={setSpeed}
          onSkip={() => setCursor(frames.length - 1)}
          onDone={onDone}
          orders={
            orders
              ? { aim, left: ordersLeft, retreatArmed, onAim: toggleAim, onRetreat: retreat }
              : null
          }
          kbd={kbd}
        />
      </div>
    </div>
  )
}
