import { useEffect, useRef, useState } from 'react'
import type { GameState, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { synthesisUnlocked } from '../../engine/synthesis'
import { smithyUnlocked } from '../../engine/equipment'
import { dailyUnlocked } from '../../engine/daily'
import { masterXpToNext } from '../../engine/master'
import {
  MAP_H,
  MAP_W,
  MASTER_SPAWN,
  PLACE_LABEL,
  PROPS,
  ROOMS,
  TILE,
  facingToward,
  findPath,
  isAdjacentTo,
  isWalkable,
  propAt,
  propForPlace,
  roomAt,
  walkableTilesIn,
  type PlaceId,
  type Prop,
  type Pt,
  type RoomId,
} from './lobbyMap'
import { heroLines, iselLines } from './lines'
import { PlacePanel, roomFor, type PanelPlace } from '../facilityPanels'
import { DialogBox, Gauge, PixelWindow, type DialogScript } from '../kit'
import { canvasAvailable, cachedCanvas } from '../pixel/render'
import { renderLobbyBase, drawSummonCircle } from '../pixel/tiles'
import { PROP_FRAMES, drawEmote, drawProp } from '../pixel/props'
import { heroBustUrl, heroFrameCanvas, iselBustUrl, masterBustUrl, masterFrameCanvas } from '../pixel/sprites'
import type { Dir, WalkFrame } from '../pixel/heroSprite'

/**
 * The Lobby as a walkable top-down world. The Master (player avatar) walks with
 * arrows / WASD / ZQSD or by clicking; E / Space / Enter uses what they face.
 * Heroes wander the room their state puts them in. All motion here is cosmetic:
 * the engine is only touched through Commands dispatched by facility panels.
 */

export type WorldView = 'tower' | 'summon' | 'party' | 'roster'

/** Preferred logical viewport; narrow screens see less width, tall ones more height. */
const VIEW_W = 384
const VIEW_H = 216

interface Viewport {
  w: number
  h: number
  zoom: number
}

/** Integer zoom that fits the preferred view; phones get ×2 with a narrower view. */
export function fitViewport(W: number, H: number): Viewport {
  let zoom = Math.floor(Math.min(W / VIEW_W, H / VIEW_H))
  if (zoom < 2) zoom = W >= 360 ? 2 : 1
  const w = Math.min(MAP_W * TILE, VIEW_W, Math.floor(W / zoom))
  const h = Math.min(MAP_H * TILE, Math.floor(H / zoom))
  return { w, h, zoom }
}

function cameraFor(px: number, py: number, vw: number, vh: number): { camX: number; camY: number } {
  const clampAxis = (c: number, view: number, world: number) =>
    world <= view ? Math.round((world - view) / 2) : Math.round(Math.max(0, Math.min(world - view, c - view / 2)))
  return { camX: clampAxis(px, vw, MAP_W * TILE), camY: clampAxis(py - 12, vh, MAP_H * TILE) }
}
const MASTER_SPEED = 5.5 // tiles / s
const HERO_SPEED = 2
const PANEL_PLACES: PanelPlace[] = ['kitchen', 'tacticalCenter', 'promotionChamber', 'trainingCenter', 'synthesis', 'armory', 'daily']
export const PLACE_ICON: Record<PlaceId, string> = {
  kitchen: '🍲',
  tacticalCenter: '🗺',
  promotionChamber: '⛩',
  trainingCenter: '⚔',
  synthesis: '⚗',
  armory: '⚒',
  daily: '🌀',
  summon: '🔮',
  roster: '📜',
  party: '🛡',
  tower: '🗼',
  fairy: '✧',
}
/** Order of the fast-travel menu. */
export const MENU_PLACES: PlaceId[] = [
  'tower',
  'summon',
  'party',
  'roster',
  'kitchen',
  'tacticalCenter',
  'promotionChamber',
  'trainingCenter',
  'synthesis',
  'armory',
  'daily',
]

interface Walker {
  x: number
  y: number
  fx: number
  fy: number
  t: number
  moving: boolean
  dir: Dir
  path: Pt[]
  steps: number
}

interface HeroWalker extends Walker {
  id: string
  room: RoomId
  idleUntil: number
}

type Target = { kind: 'prop'; prop: Prop } | { kind: 'hero'; id: string }

const DELTA: Record<Dir, Pt> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  z: 'up',
  s: 'down',
  a: 'left',
  q: 'left',
  d: 'right',
}

function newWalker(p: Pt, dir: Dir = 'down'): Walker {
  return { x: p.x, y: p.y, fx: p.x, fy: p.y, t: 1, moving: false, dir, path: [], steps: 0 }
}

function dirBetween(a: Pt, b: Pt): Dir {
  if (b.x > a.x) return 'right'
  if (b.x < a.x) return 'left'
  if (b.y > a.y) return 'down'
  return 'up'
}

function beginStep(w: Walker, to: Pt) {
  w.dir = dirBetween(w, to)
  w.fx = w.x
  w.fy = w.y
  w.x = to.x
  w.y = to.y
  w.t = 0
  w.moving = true
}

function advance(w: Walker, dt: number, speed: number): boolean {
  if (!w.moving) return false
  w.t += dt * speed
  if (w.t >= 1) {
    w.t = 1
    w.moving = false
    w.fx = w.x
    w.fy = w.y
    w.steps++
    return true
  }
  return false
}

function walkerPx(w: Walker): { px: number; py: number } {
  return {
    px: (w.fx + (w.x - w.fx) * w.t) * TILE + TILE / 2,
    py: (w.fy + (w.y - w.fy) * w.t) * TILE + TILE - 2,
  }
}

function walkFrame(w: Walker): WalkFrame {
  if (!w.moving) return 0
  return w.t < 0.5 ? (w.steps % 2 ? 1 : 2) : 0
}

function heroRoom(h: OwnedHero, partyIds: Set<string>): RoomId {
  return roomFor(h, partyIds)
}

function randomTileIn(room: RoomId): Pt {
  const tiles = walkableTilesIn(room)
  return tiles[Math.floor(Math.random() * tiles.length)] ?? MASTER_SPAWN
}

function emoteFor(h: OwnedHero, inParty: boolean): 'zz' | 'dots' | 'bang' | 'heart' | null {
  if (h.sanity < 35) return 'zz'
  if (h.sanity < 60) return 'dots'
  if (h.xp.atCap && !h.promotion) return 'bang'
  if (inParty) return null
  return null
}

const offsetCache = new Map<string, { dx: number; dy: number }>()
/** Draw offsets are frame-independent; compute them once per kind. */
function propOffset(kind: Prop['kind']): { dx: number; dy: number } {
  let o = offsetCache.get(kind)
  if (!o) {
    const { dx, dy } = drawProp(kind, 0)
    o = { dx, dy }
    offsetCache.set(kind, o)
  }
  return o
}

function lockedRooms(state: GameState): RoomId[] {
  const out: RoomId[] = []
  if (!synthesisUnlocked(state)) out.push('synthesis')
  if (!smithyUnlocked(state)) out.push('armory')
  if (!dailyUnlocked(state)) out.push('daily')
  if (state.facilities.promotionChamber.level === 0) out.push('promotionChamber')
  if (state.facilities.trainingCenter.level === 0) out.push('training')
  return out
}

export function LobbyWorld({
  state,
  store,
  onNavigate,
  onMenu,
  travelRequest,
}: {
  state: GameState
  store: Store
  onNavigate: (v: WorldView) => void
  onMenu: () => void
  /** Fast-travel request from the app menu; a new nonce re-triggers it. */
  travelRequest?: { place: PlaceId; nonce: number } | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState<Viewport>({ w: VIEW_W, h: VIEW_H, zoom: 3 })
  const vpRef = useRef(vp)
  vpRef.current = vp
  const [openPlace, setOpenPlace] = useState<PanelPlace | null>(null)
  const [dialog, setDialog] = useState<DialogScript | null>(null)
  const [prompt, setPrompt] = useState<string | null>(null)

  // Live world state for the game loop (never React state: 60 fps mutation).
  const world = useRef({
    master: newWalker(MASTER_SPAWN, 'up'),
    heroes: new Map<string, HeroWalker>(),
    held: [] as Dir[],
    pending: null as Target | null,
    time: 0,
    promptLabel: null as string | null,
  })
  const stateRef = useRef(state)
  stateRef.current = state
  const modalRef = useRef(false)
  modalRef.current = openPlace !== null || dialog !== null

  // Pump the world clock (timers finish, Sanity regenerates) while in the lobby.
  useEffect(() => {
    const id = setInterval(() => store.dispatch({ type: 'TICK' }, Date.now()), 1000)
    return () => clearInterval(id)
  }, [store])

  // Keep one wandering walker per living hero, in the room their state implies.
  useEffect(() => {
    const w = world.current
    const partyIds = new Set(state.party.slots.filter(Boolean) as string[])
    const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
    const alive = new Set(living.map((h) => h.id as string))
    for (const id of [...w.heroes.keys()]) if (!alive.has(id)) w.heroes.delete(id)
    for (const h of living) {
      const room = heroRoom(h, partyIds)
      const hw = w.heroes.get(h.id)
      if (!hw) {
        w.heroes.set(h.id, { ...newWalker(randomTileIn(room)), id: h.id, room, idleUntil: Math.random() * 2 })
      } else if (hw.room !== room) {
        hw.room = room
        hw.idleUntil = 0
        hw.path = []
      }
    }
  }, [state])

  // Fit the stage to the window at an integer zoom (crisp pixels).
  useEffect(() => {
    const fit = () => {
      const el = stageRef.current
      const W = el?.clientWidth || window.innerWidth
      const H = el?.clientHeight || window.innerHeight
      setVp(fitViewport(W, H))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  function interact(target: Target) {
    const st = stateRef.current
    if (target.kind === 'hero') {
      const h = st.heroes[target.id as OwnedHero['id']]
      if (!h) return
      const inParty = st.party.slots.includes(h.id)
      setDialog({ speaker: h.name, bust: heroBustUrl(h), lines: heroLines(h, inParty) })
      return
    }
    const place = target.prop.place
    if (!place) return
    if (place === 'fairy') {
      setDialog({ speaker: 'Isel', bust: iselBustUrl(), lines: iselLines(st) })
    } else if ((PANEL_PLACES as string[]).includes(place)) {
      setOpenPlace(place as PanelPlace)
    } else {
      onNavigate(place as WorldView)
    }
  }

  function targetInFront(): Target | null {
    const m = world.current.master
    const d = DELTA[m.dir]
    const fx = m.x + d.x
    const fy = m.y + d.y
    for (const hw of world.current.heroes.values()) if (hw.x === fx && hw.y === fy) return { kind: 'hero', id: hw.id }
    const p = propAt(fx, fy)
    return p && p.place ? { kind: 'prop', prop: p } : null
  }

  function labelFor(t: Target | null): string | null {
    if (!t) return null
    if (t.kind === 'hero') return stateRef.current.heroes[t.id as OwnedHero['id']]?.name.split(/\s+/)[0] ?? null
    return t.prop.place ? PLACE_LABEL[t.prop.place] : null
  }

  /** Walk next to `target` then use it. */
  function goTo(target: Target) {
    const w = world.current
    const m = w.master
    let path: Pt[] | null
    if (target.kind === 'prop') {
      const p = target.prop
      path = findPath({ x: m.x, y: m.y }, (x, y) => isAdjacentTo(p, x, y))
    } else {
      const hw = w.heroes.get(target.id)
      if (!hw) return
      path = findPath({ x: m.x, y: m.y }, (x, y) => Math.abs(x - hw.x) + Math.abs(y - hw.y) === 1)
    }
    if (path) {
      m.path = path
      w.pending = target
    }
  }

  // Keyboard: held movement keys + interact.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (modalRef.current) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const dir = KEY_DIR[k]
      const w = world.current
      if (dir) {
        e.preventDefault()
        w.master.path = []
        w.pending = null
        if (!w.master.moving) w.master.dir = dir // a tap turns in place
        if (!w.held.includes(dir)) w.held.push(dir)
        return
      }
      if (k === 'e' || k === ' ' || k === 'Enter') {
        e.preventDefault()
        const t = targetInFront()
        if (t) interact(t)
      } else if (k === 'Escape' || k === 'm') {
        onMenu()
      }
    }
    const up = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const dir = KEY_DIR[k]
      if (dir) world.current.held = world.current.held.filter((d) => d !== dir)
    }
    const blur = () => (world.current.held = [])
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  })

  // The game loop.
  useEffect(() => {
    if (!canvasAvailable()) return
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    ctx.imageSmoothingEnabled = false
    const base = cachedCanvas('lobby-base', renderLobbyBase)
    let raf = 0
    let last = performance.now()

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const w = world.current
      w.time += dt
      const st = stateRef.current

      // ── master
      const m = w.master
      advance(m, dt, MASTER_SPEED)
      if (!m.moving) {
        if (modalRef.current) {
          m.path = []
        } else if (m.path.length > 0) {
          const n = m.path.shift()!
          if (isWalkable(n.x, n.y)) beginStep(m, n)
          else m.path = []
        } else if (w.held.length > 0) {
          const dir = w.held[w.held.length - 1]!
          m.dir = dir
          const n = { x: m.x + DELTA[dir].x, y: m.y + DELTA[dir].y }
          if (isWalkable(n.x, n.y)) beginStep(m, n)
        } else if (w.pending) {
          const t = w.pending
          w.pending = null
          if (t.kind === 'prop') m.dir = facingToward(t.prop, m.x, m.y)
          else {
            const hw = w.heroes.get(t.id)
            if (hw) {
              m.dir = dirBetween(m, hw)
              hw.dir = dirBetween(hw, m)
            }
          }
          interact(t)
        }
      }

      // ── heroes
      for (const hw of w.heroes.values()) {
        advance(hw, dt, HERO_SPEED)
        if (hw.moving) continue
        if (hw.path.length > 0) {
          const n = hw.path.shift()!
          if (isWalkable(n.x, n.y) && !(n.x === m.x && n.y === m.y)) beginStep(hw, n)
          else hw.path = []
          continue
        }
        if (w.time < hw.idleUntil) continue
        const inRoom = roomAt(hw.x, hw.y) === hw.room
        const goal = inRoom && Math.random() < 0.35 ? null : randomTileIn(hw.room)
        if (goal) hw.path = findPath(hw, (x, y) => x === goal.x && y === goal.y) ?? []
        hw.idleUntil = w.time + 1.5 + Math.random() * 4
      }

      // ── prompt
      const label = modalRef.current ? null : labelFor(targetInFront())
      if (label !== w.promptLabel) {
        w.promptLabel = label
        setPrompt(label)
      }

      // ── draw
      const mp = walkerPx(m)
      const { w: VW, h: VH } = vpRef.current
      if (cv.width !== VW || cv.height !== VH) {
        cv.width = VW
        cv.height = VH
        ctx.imageSmoothingEnabled = false
      }
      const { camX, camY } = cameraFor(mp.px, mp.py, VW, VH)
      ctx.fillStyle = '#0a0710'
      ctx.fillRect(0, 0, VW, VH)
      if (base) ctx.drawImage(base, -camX, -camY)

      // summoning circle on the hall carpet (under everything else)
      const phase = Math.floor(w.time * 4) % 24
      const circle = cachedCanvas(`circle|${phase}`, () => drawSummonCircle(phase))
      if (circle) {
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(w.time * 2)
        ctx.drawImage(circle, 15 * TILE - 36 - camX, 10 * TILE - 36 - camY)
        ctx.globalAlpha = 1
      }

      // locked rooms sit in darkness
      for (const room of lockedRooms(st)) {
        const r = ROOMS[room]
        ctx.fillStyle = 'rgba(8,4,16,0.55)'
        ctx.fillRect(r.x * TILE - camX, r.y * TILE - camY, r.w * TILE, r.h * TILE)
      }

      // y-sorted props + characters
      type Drawable = { y: number; draw: () => void }
      const list: Drawable[] = []
      for (const p of PROPS) {
        const frames = PROP_FRAMES[p.kind]
        const f = frames > 1 ? Math.floor(w.time * 6 + p.x) % frames : 0
        const img = cachedCanvas(`prop|${p.kind}|${f}`, () => drawProp(p.kind, f).bmp)
        if (!img) continue
        const spr = propOffset(p.kind)
        const wallMounted = p.y === 0 || p.kind === 'torch' || p.kind === 'banner' || p.kind === 'gate' || p.kind === 'drillBoard'
        list.push({
          y: wallMounted ? -1 : (p.y + p.h) * TILE,
          draw: () => ctx.drawImage(img, p.x * TILE + spr.dx - camX, p.y * TILE + spr.dy - camY),
        })
      }
      const drawShadow = (px: number, py: number) => {
        ctx.fillStyle = 'rgba(10,6,20,0.35)'
        ctx.fillRect(px - 6 - camX, py - 1 - camY, 12, 3)
        ctx.fillRect(px - 5 - camX, py - 2 - camY, 10, 5)
      }
      const partyIds = new Set(st.party.slots.filter(Boolean) as string[])
      for (const hw of w.heroes.values()) {
        const h = st.heroes[hw.id as OwnedHero['id']]
        if (!h) continue
        const { px, py } = walkerPx(hw)
        const img = heroFrameCanvas(h, hw.dir, walkFrame(hw))
        const emote = emoteFor(h, partyIds.has(h.id))
        list.push({
          y: py,
          draw: () => {
            drawShadow(px, py)
            if (img) ctx.drawImage(img, Math.round(px - 12 - camX), Math.round(py - 30 - camY))
            if (emote && Math.floor(w.time + hw.x) % 4 < 2) {
              const e = cachedCanvas(`emote|${emote}`, () => drawEmote(emote))
              if (e) ctx.drawImage(e, Math.round(px - 5 - camX), Math.round(py - 44 - camY))
            }
          },
        })
      }
      const mImg = masterFrameCanvas(st.accountId, m.dir, walkFrame(m))
      list.push({
        y: mp.py + 0.5,
        draw: () => {
          drawShadow(mp.px, mp.py)
          if (mImg) ctx.drawImage(mImg, Math.round(mp.px - 12 - camX), Math.round(mp.py - 30 - camY))
        },
      })
      list.sort((a, b) => a.y - b.y)
      for (const d of list) d.draw()

      // warm vignette
      const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.45, VW / 2, VH / 2, Math.max(VW, VH) * 0.7)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(6,2,14,0.55)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, VW, VH)

      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Click / tap to walk (and to use what was clicked).
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (modalRef.current) return
    const cv = canvasRef.current!
    const rect = cv.getBoundingClientRect()
    const { w: VW, h: VH } = vpRef.current
    const lx = ((e.clientX - rect.left) / rect.width) * VW
    const ly = ((e.clientY - rect.top) / rect.height) * VH
    const m = world.current.master
    const mp = walkerPx(m)
    const { camX, camY } = cameraFor(mp.px, mp.py, VW, VH)
    const tx = Math.floor((lx + camX) / TILE)
    const ty = Math.floor((ly + camY) / TILE)
    world.current.held = []
    for (const hw of world.current.heroes.values()) {
      // heroes are tall: a click on their head counts too
      if (hw.x === tx && (hw.y === ty || hw.y === ty + 1)) return goTo({ kind: 'hero', id: hw.id })
    }
    const p = propAt(tx, ty) ?? propAt(tx, ty + 1)
    if (p && p.place) return goTo({ kind: 'prop', prop: p })
    const path = findPath({ x: m.x, y: m.y }, (x, y) => x === tx && y === ty)
    if (path) {
      m.path = path
      world.current.pending = null
    }
  }

  /** Fast travel from the menu: open the place now, and send the Master walking there. */
  function travel(place: PlaceId) {
    const prop = propForPlace(place)
    const m = world.current.master
    const path = findPath({ x: m.x, y: m.y }, (x, y) => isAdjacentTo(prop, x, y))
    const dest = path && path.length > 0 ? path[path.length - 1]! : null
    if (dest) {
      // fast travel: step out of the menu already standing at the place
      Object.assign(m, newWalker(dest, facingToward(prop, dest.x, dest.y)))
    }
    world.current.pending = null
    interact({ kind: 'prop', prop })
  }
  useEffect(() => {
    if (travelRequest) travel(travelRequest.place)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelRequest?.nonce])

  const ml = state.meta.masterLevel
  const xpPct = (state.meta.masterXp / masterXpToNext(ml)) * 100
  const living = Object.values(state.heroes).filter((h) => h.alive).length

  return (
    <div className="stage" ref={stageRef}>
      <canvas
        ref={canvasRef}
        className="px world-canvas"
        width={vp.w}
        height={vp.h}
        style={{ width: vp.w * vp.zoom, height: vp.h * vp.zoom }}
        onPointerDown={onPointerDown}
        aria-label="The waiting room"
      />

      <div className="hud hud-tl">
        <img className="px hud-bust" src={masterBustUrl(state.accountId)} width={48} height={48} alt="" />
        <div>
          <div className="hud-title">Master Lv {ml}</div>
          <Gauge pct={xpPct} color="var(--accent-2)" label={`${state.meta.masterXp} / ${masterXpToNext(ml)} XP`} />
          <div className="hud-sub">
            {living} {living === 1 ? 'hero' : 'heroes'} · Floor {Math.min(state.tower.currentFloor, 10)}
          </div>
        </div>
      </div>

      <div className="hud hud-tr">
        <span className="coin gold">◆ {state.gold.toLocaleString()}</span>
        <span className="coin gem">♦ {state.gems.toLocaleString()}</span>
        <button className="pbtn" onClick={onMenu}>
          ☰ Menu
        </button>
      </div>

      {prompt && !dialog && !openPlace && (
        <div className="hud hud-prompt">
          <kbd>E</kbd> {prompt}
        </div>
      )}
      <div className="hud hud-help">↑↓←→ / WASD / ZQSD · E interact · click to walk · M menu</div>

      {openPlace && (
        <PixelWindow title={PLACE_LABEL[openPlace]} icon={PLACE_ICON[openPlace]} onClose={() => setOpenPlace(null)}>
          <PlacePanel place={openPlace} state={state} store={store} />
        </PixelWindow>
      )}
      {dialog && <DialogBox script={dialog} onDone={() => setDialog(null)} />}
    </div>
  )
}
