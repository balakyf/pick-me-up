import { useEffect, useMemo, useState } from 'react'
import { playMusic, sfx } from '../audio/sound'
import type { BattleOrder, CombatEvent, CombatLog, CombatUnitInit, GameState, HeroId, Line } from '../../engine/types'
import { lastWords } from '../life/speech'
import { SKILLS } from '../../engine/content'
import { drawBattleBg, BG_H, BG_W } from '../pixel/battleBg'
import { cachedDataUrl } from '../pixel/render'
import { allyBustUrl, allyFrameUrl, enemySize, enemyUrl, heroBustUrl, heroFrameUrl } from '../pixel/sprites'
import type { LookSource } from '../pixel/look'
import { ELEMENT_VIS, hpColor } from '../bits'
import { t } from '../i18n/i18n'
import { DEPTH_DURATION, depthSnap } from './synergyCaptions'

/**
 * The battle as a side-view JRPG scene. The engine resolved the fight already;
 * this replays its CombatLog event by event: attackers lunge, targets flash and
 * shake, damage numbers pop, the fallen collapse. Party right, foes left.
 */

interface Snap {
  hp: Record<string, number>
  dead: Record<string, boolean>
  visible: Record<string, boolean>
  actor: string | null
  target: string | null
  panic: string | null
  caption: string
  /** The authored skill being cast this action (kept through its hits). */
  skill: { name: string; color: string; caster: string } | null
}

const SPEEDS = [1, 2, 4] as const

/** Real milliseconds each event is held on screen at 1× speed. */
const DURATION: Record<CombatEvent['kind'], number> = {
  'battle-start': 700,
  'wave-spawn': 800,
  act: 260,
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

/** A hero's death holds the scene: the moment is not skipped past at speed. */
const HERO_DEATH_MS = 2600

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
}

type Aim = 'focus' | 'protect' | null

export function BattleScene({
  log: initialLog,
  state,
  onDone,
  orders,
}: {
  log: CombatLog
  state: GameState | null
  onDone: () => void
  orders?: BattleOrders
}) {
  const [log, setLog] = useState(initialLog)
  const [aim, setAim] = useState<Aim>(null)
  const [given, setGiven] = useState(0)
  const byId = useMemo(() => Object.fromEntries(log.unitsInit.map((u) => [u.id, u])), [log])
  const nameOf = (id: string) => {
    const u = byId[id]
    return u ? (u.side === 'enemy' || u.isNpc ? t(u.name) : u.name) : id
  }

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
          if (def) {
            const el = def.element ?? byId[e.actorId]?.element ?? 'physical'
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
                ? t('The Master: “Everyone on {name}!”', { name: nameOf(o.enemyId) })
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
        default: {
          // Combat depth: cover, follow-ups, rivalry and the floor's conditions.
          const d = depthSnap(e, nameOf)
          if (d) Object.assign(next, d)
        }
      }
      out.push(next)
      cur = next
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log])

  const [cursor, setCursor] = useState(0)
  // Battle music while the scene is up; the lobby theme returns after.
  useEffect(() => {
    playMusic('battle')
    return () => playMusic('lobby')
  }, [])
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
    if (shown?.kind === 'hit' && shown.crit) ms += 140
    // A hero's death is not rushed, whatever the speed.
    if (shown?.kind === 'death' && byId[shown.unitId]?.side === 'hero' && !byId[shown.unitId]?.isNpc) ms = Math.max(ms, HERO_DEATH_MS / Math.min(speed, 2))
    const tm = setTimeout(() => setCursor((c) => Math.min(frames.length - 1, c + 1)), ms)
    return () => clearTimeout(tm)
  }, [cursor, playing, atEnd, speed, frames.length, log.events, byId])

  // Fit the stage: largest integer zoom that leaves room for the windows below.
  const [zoom, setZoom] = useState(2)
  useEffect(() => {
    const fit = () => {
      const z = Math.min(window.innerWidth / BG_W, (window.innerHeight - 190) / BG_H)
      setZoom(z >= 1 ? Math.max(1, Math.floor(z)) : Math.max(0.5, z))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  const snap = frames[cursor]!
  const current = cursor > 0 ? log.events[cursor - 1] : undefined
  const pos = useMemo(() => layout(log), [log])
  const bg = cachedDataUrl(`bbg|${log.floor >= 1 && log.floor <= 9 ? 'p' : log.floor}`, () => drawBattleBg(log.floor))

  const heroSrc = (u: CombatUnitInit): LookSource => {
    const h = state?.heroes[u.id as keyof GameState['heroes']]
    return h ?? { id: u.id, name: u.name, star: 3, heroClass: u.unitClass, element: u.element }
  }

  // Damage popups for the most recent few events (each animates once on mount).
  const popups = (atEnd ? [] : log.events.slice(Math.max(0, cursor - 3), cursor))
    .filter((e) => e.kind === 'hit' || e.kind === 'miss' || e.kind === 'guard' || e.kind === 'heal')

  const heroes = log.unitsInit.filter((u) => u.side === 'hero')
  const enemies = log.unitsInit.filter((u) => u.side === 'enemy')
  const liveEnemies = enemies.filter((u) => snap.visible[u.id] && !snap.dead[u.id])
  const enemyCounts = new Map<string, number>()
  for (const u of liveEnemies) enemyCounts.set(u.name, (enemyCounts.get(u.name) ?? 0) + 1)

  const outcome = log.outcome

  // Screen shake: a crit or a blow worth a quarter of the target's life shakes the stage.
  const shake =
    current?.kind === 'hit' && (current.crit || current.amount >= (byId[current.targetId]?.maxHP ?? Infinity) * 0.25)
      ? current.crit
        ? 'shake-heavy'
        : 'shake'
      : ''
  // The death moment: the fallen hero's portrait and last words.
  const fallen =
    current?.kind === 'death' && byId[current.unitId]?.side === 'hero' && !byId[current.unitId]?.isNpc ? byId[current.unitId]! : null

  const tick = current?.tick ?? 0
  function give(order: BattleOrder) {
    if (!orders) return
    const next = orders.give(order)
    setAim(null)
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

  return (
    <div className="battle">
      <div className="battle-caption pframe">{snap.caption}</div>

      <div className={`battle-stage-wrap ${shake} ${aim ? 'aiming' : ''}`} style={{ width: BG_W * zoom, height: BG_H * zoom }}>
        <div className="battle-stage" style={{ transform: `scale(${zoom})` }}>
          {bg && <img className="px battle-bg" src={bg} width={BG_W} height={BG_H} alt="" />}

          {log.unitsInit.map((u) => {
            if (!snap.visible[u.id] && u.side === 'enemy') return null
            const p = pos[u.id]!
            const isHero = u.side === 'hero'
            const acting = snap.actor === u.id && (current?.kind === 'act' || current?.kind === 'hit' || current?.kind === 'miss')
            const hurt = snap.target === u.id && current?.kind === 'hit'
            const skillHit = hurt && snap.skill !== null
            const dead = !!snap.dead[u.id]
            const size = isHero ? { w: 24, h: 32 } : enemySize(u.name, u.element)
            const src = u.isNpc
              ? allyFrameUrl(u.name)
              : isHero
                ? heroFrameUrl(heroSrc(u), 'left', acting ? 1 : 0)
                : enemyUrl(u.name, u.element)
            const cls = ['bunit', isHero ? 'hero' : 'enemy', acting ? 'acting' : '', hurt ? 'hurt' : '', dead ? 'ko' : '']
              .filter(Boolean)
              .join(' ')
            const hpPct = (Math.max(0, snap.hp[u.id] ?? u.maxHP) / u.maxHP) * 100
            return (
              <div
                key={u.id}
                className={`${cls} ${aim === 'focus' && !isHero && !dead ? 'aimable' : ''} ${aim === 'protect' && isHero && !u.isNpc && !dead ? 'aimable' : ''}`}
                onClick={() => aimAt(u)}
                style={{
                  left: p.x - size.w / 2,
                  top: p.y - size.h,
                  width: size.w,
                  height: size.h,
                  zIndex: p.y,
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
                {src && <img className="px bsprite" src={src} width={size.w} height={size.h} alt={u.name} />}
                {(!isHero || u.isNpc) && !dead && (
                  <div className="bhp">
                    <span style={{ width: `${hpPct}%`, background: hpColor(hpPct) }} />
                  </div>
                )}
                {snap.panic === u.id && <span className="bsweat">💧</span>}
              </div>
            )
          })}

          {popups.map((e) => {
            if (e.kind !== 'hit' && e.kind !== 'miss' && e.kind !== 'guard' && e.kind !== 'heal') return null
            const p = pos[e.kind === 'heal' ? e.unitId : e.targetId]
            if (!p) return null
            const text =
              e.kind === 'miss' ? t('MISS') : e.kind === 'guard' ? t('GUARD') : e.kind === 'heal' ? `+${e.amount}` : String(e.amount)
            const cls = e.kind === 'miss' || e.kind === 'guard' ? 'miss' : e.kind === 'heal' ? 'heal' : e.crit ? 'crit' : ''
            return (
              <div key={e.seq} className={`dmg ${cls}`} style={{ left: p.x, top: p.y - 34, zIndex: 999 }}>
                {text}
              </div>
            )
          })}

          {atEnd && (
            <div className={`battle-banner ${outcome === 'win' ? 'win' : 'lose'}`}>
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
      </div>

      <div className="battle-windows">
        <div className="pframe battle-foes">
          {liveEnemies.length <= 6
            ? liveEnemies.map((u) => {
                const pct = (Math.max(0, snap.hp[u.id] ?? u.maxHP) / u.maxHP) * 100
                return (
                  <div
                    key={u.id}
                    className={`foe-row ${snap.target === u.id ? 'hit' : ''} ${aim === 'focus' ? 'aimable' : ''}`}
                    onClick={() => aimAt(u)}
                  >
                    <span className="foe-name">
                      {t(u.name)} <span className="muted small">Lv{u.level}</span>
                    </span>
                    <span className="gauge foe-hp">
                      <span style={{ width: `${pct}%`, background: hpColor(pct) }} />
                    </span>
                  </div>
                )
              })
            : [...enemyCounts.entries()].map(([name, n]) => (
                <div key={name} className="foe-row">
                  <span>{t(name)}</span>
                  {n > 1 && <span className="muted">×{n}</span>}
                </div>
              ))}
          {enemyCounts.size === 0 && <div className="muted">—</div>}
        </div>
        <div className="pframe battle-party">
          {heroes.map((u) => {
            const hp = Math.max(0, snap.hp[u.id] ?? u.maxHP)
            const pct = (hp / u.maxHP) * 100
            const dead = !!snap.dead[u.id]
            return (
              <div
                key={u.id}
                className={`party-row ${snap.actor === u.id ? 'active' : ''} ${dead ? 'dead' : ''} ${aim === 'protect' && !u.isNpc && !dead ? 'aimable' : ''}`}
                onClick={() => aimAt(u)}
              >
                <img
                  className="px party-bust"
                  src={u.isNpc ? allyBustUrl(u.name) : heroBustUrl(heroSrc(u))}
                  width={24}
                  height={24}
                  alt=""
                />
                <span className="party-name">
                  {u.isNpc
                    ? t(u.name).replace(/^(Princess|Princesse) /, '')
                    : heroes.filter((o) => o.name.split(/\s+/)[0] === u.name.split(/\s+/)[0]).length > 1
                      ? u.name
                      : u.name.split(/\s+/)[0]}
                </span>
                <span className="party-lv">{u.isNpc ? t('escort') : `Lv${u.level}`}</span>
                <span className="party-hp">
                  <span className="gauge">
                    <span style={{ width: `${pct}%`, background: hpColor(pct) }} />
                  </span>
                  <span className="party-hpnum">
                    {hp}/{u.maxHP}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="battle-controls">
        {!atEnd ? (
          <>
            <button className="pbtn" onClick={() => setPlaying((p) => !p)}>
              {playing ? t('❚❚ Pause') : t('▶ Play')}
            </button>
            {SPEEDS.map((s) => (
              <button key={s} className={`pbtn ghost ${speed === s ? 'on' : ''}`} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
            <button className="pbtn ghost" onClick={() => setCursor(frames.length - 1)}>
              {t('Skip ▸▸')}
            </button>
            {orders && (
              <span className="order-bar">
                <button
                  className={`pbtn sm ${aim === 'focus' ? 'on' : ''}`}
                  disabled={ordersLeft <= 0}
                  onClick={() => {
                    setAim(aim === 'focus' ? null : 'focus')
                    setPlaying(false)
                  }}
                  title={t('Every hero attacks the enemy you pick')}
                >
                  🎯 {t('Focus')}
                </button>
                <button
                  className={`pbtn sm ${aim === 'protect' ? 'on' : ''}`}
                  disabled={ordersLeft <= 0}
                  onClick={() => {
                    setAim(aim === 'protect' ? null : 'protect')
                    setPlaying(false)
                  }}
                  title={t('Enemies avoid the hero you pick while anyone else stands')}
                >
                  🛡 {t('Protect')}
                </button>
                <span className="muted small">{t('{n} orders', { n: Math.max(0, ordersLeft) })}</span>
                <button className="pbtn sm danger" onClick={() => give({ tick: tick + 1, kind: 'retreat' })} title={t('End the fight now: the living come home, nothing is won')}>
                  🏳 {t('Retreat')}
                </button>
              </span>
            )}
            {aim && <span className="aim-hint">{aim === 'focus' ? t('Click an enemy…') : t('Click a hero…')}</span>}
          </>
        ) : (
          <button className="pbtn primary big" onClick={onDone}>
            {t('Continue ▸')}
          </button>
        )}
      </div>
    </div>
  )
}
