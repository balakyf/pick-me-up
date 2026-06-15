import { useEffect, useMemo, useRef, useState } from 'react'
import type { CombatLog, CombatUnitInit } from '../engine/types'
import { ELEMENT_VIS, initials } from './bits'

/** A replay frame: the visible battle state AFTER applying events[0..k]. */
interface Snap {
  hp: Record<string, number>
  dead: Record<string, boolean>
  visible: Record<string, boolean>
  actor: string | null
  target: string | null
  line: { text: string; cls: string } | null
}

const SPEEDS = [1, 2, 4, 8] as const

export function CombatView({ log, onDone }: { log: CombatLog; onDone: () => void }) {
  const byId = useMemo(() => {
    const m: Record<string, CombatUnitInit> = {}
    for (const u of log.unitsInit) m[u.id] = u
    return m
  }, [log])

  // Fold the event stream into per-step snapshots once.
  const frames = useMemo<Snap[]>(() => {
    const maxHp: Record<string, number> = {}
    for (const u of log.unitsInit) maxHp[u.id] = u.maxHP
    const out: Snap[] = []
    let cur: Snap = { hp: { ...maxHp }, dead: {}, visible: {}, actor: null, target: null, line: null }
    out.push(cur)
    const nameOf = (id: string) => byId[id]?.name ?? id
    for (const e of log.events) {
      const next: Snap = {
        hp: { ...cur.hp },
        dead: { ...cur.dead },
        visible: { ...cur.visible },
        actor: null,
        target: null,
        line: null,
      }
      switch (e.kind) {
        case 'battle-start':
          for (const id of [...e.heroIds, ...e.enemyIds]) next.visible[id] = true
          next.line = { text: 'Battle begins.', cls: 'dim' }
          break
        case 'wave-spawn':
          for (const id of e.enemyIds) next.visible[id] = true
          next.line = { text: `Wave ${e.wave + 1} appears!`, cls: 'l-wave' }
          break
        case 'act':
          next.actor = e.actorId
          next.target = e.targetId
          break
        case 'hit':
          next.hp[e.targetId] = e.hpAfter
          next.actor = e.actorId
          next.target = e.targetId
          next.line = {
            text: `${nameOf(e.actorId)} hits ${nameOf(e.targetId)} for ${e.amount}${e.crit ? ' (CRIT!)' : ''}`,
            cls: e.crit ? 'l-crit' : '',
          }
          break
        case 'miss':
          next.line = { text: `${nameOf(e.actorId)} misses ${nameOf(e.targetId)}`, cls: 'dim' }
          break
        case 'death':
          next.dead[e.unitId] = true
          next.line = { text: `${nameOf(e.unitId)} falls!`, cls: 'l-death' }
          break
        case 'mission':
          next.line = { text: e.note, cls: 'l-wave' }
          break
        case 'end':
          next.line = {
            text: e.outcome === 'win' ? '✦ Victory!' : e.outcome === 'wipe' ? '✦ Party wiped' : '✦ Time up',
            cls: 'l-end',
          }
          break
      }
      out.push(next)
      cur = next
    }
    return out
  }, [log, byId])

  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<number>(2)
  const logRef = useRef<HTMLDivElement>(null)

  const atEnd = cursor >= frames.length - 1

  useEffect(() => {
    if (!playing || atEnd) return
    const t = setInterval(() => {
      setCursor((c) => Math.min(frames.length - 1, c + speed))
    }, 90)
    return () => clearInterval(t)
  }, [playing, atEnd, speed, frames.length])

  useEffect(() => {
    if (atEnd) setPlaying(false)
  }, [atEnd])

  // Keep the log scrolled to the latest line.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [cursor])

  const snap = frames[cursor]!
  const heroes = log.unitsInit.filter((u) => u.side === 'hero')
  const enemies = log.unitsInit.filter((u) => u.side === 'enemy' && snap.visible[u.id])
  const tickNow = cursor === 0 ? 0 : log.events[Math.min(cursor, log.events.length) - 1]?.tick ?? 0

  const visibleLog = log.events.slice(0, cursor)

  return (
    <div className="overlay">
      <div className="combat">
        <div className="combat-head">
          <h3 style={{ margin: 0 }}>Floor {log.floor}</h3>
          <span className="tag">{enemies.length + heroes.length} combatants</span>
          <span className="spacer" style={{ flex: 1 }} />
          <span className="tick">tick {tickNow}</span>
        </div>

        <div className="sides">
          <div className="side-col">
            <h4>Your Party</h4>
            {heroes.map((u) => (
              <CUnit key={u.id} u={u} snap={snap} />
            ))}
          </div>
          <div className="side-col">
            <h4>Enemies</h4>
            {enemies.length === 0 && <div className="muted">…</div>}
            {enemies.map((u) => (
              <CUnit key={u.id} u={u} snap={snap} />
            ))}
          </div>
        </div>

        <div className="log" ref={logRef}>
          {visibleLog.length === 0 && <div className="dim">Awaiting first blood…</div>}
          {visibleLog.map((_, i) => {
            const f = frames[i + 1]
            if (!f?.line) return null
            return (
              <div key={i} className={f.line.cls}>
                {f.line.text}
              </div>
            )
          })}
        </div>

        <div className="controls">
          {!atEnd ? (
            <>
              <button className="btn" onClick={() => setPlaying((p) => !p)}>
                {playing ? '⏸ Pause' : '▶ Play'}
              </button>
              <button className="btn ghost" onClick={() => setCursor(frames.length - 1)}>
                ⏭ Skip
              </button>
              <div className="speed">
                {SPEEDS.map((s) => (
                  <button key={s} className={`btn ghost ${speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)} style={speed === s ? { borderColor: 'var(--accent)' } : undefined}>
                    {s}×
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button className="btn primary big" onClick={onDone} style={{ marginLeft: 'auto', marginRight: 'auto' }}>
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CUnit({ u, snap }: { u: CombatUnitInit; snap: Snap }) {
  const hp = snap.hp[u.id] ?? u.maxHP
  const pct = Math.max(0, (hp / u.maxHP) * 100)
  const dead = snap.dead[u.id]
  const acting = snap.actor === u.id
  const targeted = snap.target === u.id
  const color = ELEMENT_VIS[u.element].color
  const barColor = pct > 55 ? '#5fd08a' : pct > 25 ? '#f2c75c' : '#ef5d6b'
  return (
    <div className={`cunit ${dead ? 'dead' : ''} ${acting ? 'act' : ''}`} style={targeted && !dead ? { boxShadow: '0 0 0 1px var(--bad) inset' } : undefined}>
      <div className="cp-dot" style={{ background: color }}>
        {initials(u.name)}
      </div>
      <div className="cbody">
        <div className="cname">
          <span>
            {ELEMENT_VIS[u.element].glyph} {u.name} <span className="muted">Lv{u.level}</span>
          </span>
          <span className="chp">{Math.max(0, hp)}/{u.maxHP}</span>
        </div>
        <div className="bar" style={{ marginTop: 4 }}>
          <span style={{ width: `${pct}%`, background: barColor }} />
        </div>
      </div>
    </div>
  )
}
