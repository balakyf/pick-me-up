import { useEffect, useMemo, useState } from 'react'
import type { CombatEvent, CombatLog, CombatUnitInit, GameState, Line } from '../../engine/types'
import { SKILLS } from '../../engine/content'
import { drawBattleBg, BG_H, BG_W } from '../pixel/battleBg'
import { cachedDataUrl } from '../pixel/render'
import { allyBustUrl, allyFrameUrl, enemySize, enemyUrl, heroBustUrl, heroFrameUrl } from '../pixel/sprites'
import type { LookSource } from '../pixel/look'
import { ELEMENT_VIS, hpColor } from '../bits'

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
  end: 600,
}

const HERO_X: Record<Line, number> = { front: 262, mid: 298, back: 334 }
const ENEMY_X: Record<Line, number> = { front: 128, mid: 90, back: 52 }

function skillName(id: string): string {
  if (id === 'basic') return 'Attack'
  return SKILLS[id]?.name ?? 'Strike'
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
    const n = units.length
    const top = 134
    const bottom = 200
    units.forEach((u, i) => {
      const y = n === 1 ? 168 : top + ((bottom - top) * i) / (n - 1)
      const stagger = (i % 2) * 8
      const x = side === 'hero' ? HERO_X[u.line] + stagger : ENEMY_X[u.line] - stagger
      pos[u.id] = { x, y: Math.round(y) }
    })
  }
  return pos
}

export function BattleScene({ log, state, onDone }: { log: CombatLog; state: GameState | null; onDone: () => void }) {
  const byId = useMemo(() => Object.fromEntries(log.unitsInit.map((u) => [u.id, u])), [log])
  const nameOf = (id: string) => byId[id]?.name ?? id

  const frames = useMemo<Snap[]>(() => {
    const out: Snap[] = []
    let cur: Snap = {
      hp: Object.fromEntries(log.unitsInit.map((u) => [u.id, u.maxHP])),
      dead: {},
      visible: {},
      actor: null,
      target: null,
      panic: null,
      caption: `Floor ${log.floor}`,
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
          next.caption = 'Enemies approach!'
          break
        case 'wave-spawn':
          for (const id of e.enemyIds) next.visible[id] = true
          next.caption = `Wave ${e.wave + 1} appears!`
          break
        case 'act': {
          next.actor = e.actorId
          next.target = e.targetId
          next.caption = `${nameOf(e.actorId)} — ${skillName(e.skillId)}`
          const def = SKILLS[e.skillId]
          if (def) {
            const el = def.element ?? byId[e.actorId]?.element ?? 'physical'
            next.skill = { name: def.name, color: ELEMENT_VIS[el].color, caster: e.actorId }
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
          next.caption = `${nameOf(e.unitId)} pays ${e.amount} HP!`
          break
        case 'panic':
          next.panic = e.unitId
          next.caption = `${nameOf(e.unitId)} panics and freezes!`
          break
        case 'guard':
          next.actor = e.actorId
          next.target = e.targetId
          next.caption = `${nameOf(e.targetId)}'s scales turn the blow!`
          break
        case 'heal':
          next.hp[e.unitId] = e.hpAfter
          next.caption = cur.caption
          break
        case 'death':
          next.dead[e.unitId] = true
          next.caption = `${nameOf(e.unitId)} falls!`
          break
        case 'mission':
          next.caption = e.note
          break
        case 'end':
          next.caption =
            e.outcome === 'win'
              ? 'Victory!'
              : e.outcome === 'wipe'
                ? 'The party has fallen…'
                : e.outcome === 'failed'
                  ? 'The mission has failed…'
                  : 'Time is up…'
          break
      }
      out.push(next)
      cur = next
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log])

  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<number>(1)
  const atEnd = cursor >= frames.length - 1

  useEffect(() => {
    if (!playing || atEnd) return
    const ev = log.events[cursor] // the event that produces frame cursor+1
    const ms = ev ? DURATION[ev.kind] : 400
    const t = setTimeout(() => setCursor((c) => Math.min(frames.length - 1, c + 1)), ms / speed)
    return () => clearTimeout(t)
  }, [cursor, playing, atEnd, speed, frames.length, log.events])

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

  return (
    <div className="battle">
      <div className="battle-caption pframe">{snap.caption}</div>

      <div className="battle-stage-wrap" style={{ width: BG_W * zoom, height: BG_H * zoom }}>
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
                className={cls}
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
              e.kind === 'miss' ? 'MISS' : e.kind === 'guard' ? 'GUARD' : e.kind === 'heal' ? `+${e.amount}` : String(e.amount)
            const cls = e.kind === 'miss' || e.kind === 'guard' ? 'miss' : e.kind === 'heal' ? 'heal' : e.crit ? 'crit' : ''
            return (
              <div key={e.seq} className={`dmg ${cls}`} style={{ left: p.x, top: p.y - 34, zIndex: 999 }}>
                {text}
              </div>
            )
          })}

          {atEnd && (
            <div className={`battle-banner ${outcome === 'win' ? 'win' : 'lose'}`}>
              {outcome === 'win' ? 'VICTORY' : outcome === 'wipe' ? 'DEFEAT' : outcome === 'failed' ? 'MISSION FAILED' : 'TIME UP'}
            </div>
          )}
        </div>
      </div>

      <div className="battle-windows">
        <div className="pframe battle-foes">
          {[...enemyCounts.entries()].map(([name, n]) => (
            <div key={name} className="foe-row">
              <span>{name}</span>
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
              <div key={u.id} className={`party-row ${snap.actor === u.id ? 'active' : ''} ${dead ? 'dead' : ''}`}>
                <img
                  className="px party-bust"
                  src={u.isNpc ? allyBustUrl(u.name) : heroBustUrl(heroSrc(u))}
                  width={24}
                  height={24}
                  alt=""
                />
                <span className="party-name">{u.isNpc ? u.name.replace(/^Princess /, '') : u.name.split(/\s+/)[0]}</span>
                <span className="party-lv">{u.isNpc ? 'escort' : `Lv${u.level}`}</span>
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
              {playing ? '❚❚ Pause' : '▶ Play'}
            </button>
            {SPEEDS.map((s) => (
              <button key={s} className={`pbtn ghost ${speed === s ? 'on' : ''}`} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
            <button className="pbtn ghost" onClick={() => setCursor(frames.length - 1)}>
              Skip ▸▸
            </button>
          </>
        ) : (
          <button className="pbtn primary big" onClick={onDone}>
            Continue ▸
          </button>
        )}
      </div>
    </div>
  )
}
