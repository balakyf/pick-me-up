import { useEffect, useRef, useState } from 'react'
import type { GameState, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { synthesisUnlocked } from '../../engine/synthesis'
import { smithyUnlocked } from '../../engine/equipment'
import { dailyUnlocked } from '../../engine/daily'
import { loginClaimed } from '../../engine/shop'
import { toWorldTime } from '../../engine/time'
import { masterXpToNext } from '../../engine/master'
import { TUNING } from '../../engine/tuning'
import { activityOf, dayOfSlot, hourOfWorld, slotOf } from '../../engine/life'
import {
  BUILDINGS,
  MAP_H,
  MAP_W,
  MASTER_SPAWN,
  PLACE_LABEL,
  PROPS,
  ROOMS,
  TILE,
  ZONES,
  buildingAt,
  facingToward,
  findPath,
  graveTile,
  insideBuilding,
  isAdjacentTo,
  isWalkable,
  isWallChar,
  propAt,
  propForPlace,
  tileAt,
  type Building,
  type PlaceId,
  type Prop,
  type Pt,
  type RoomId,
} from './lobbyMap'
import { iselLines } from './lines'
import { activityKey, isOffsite, spotFor, type Spot } from './heroAgent'
import { accountDay, conversation, pairLines, speak, statusLine } from '../life/speech'
import { HeroProfile, HeroTracker, LetterWindow, letterReady } from '../life/lifeWindows'
import { FirstSteps } from '../life/FirstSteps'
import { AdviceWindow, useAdvice } from '../life/Advisor'
import { drawBuildingSign, drawZoneSign, ZONE_SIGN } from './roofSigns'
import { PlacePanel, type PanelPlace } from '../facilityPanels'
import { DialogBox, Gauge, PixelWindow, type DialogScript } from '../kit'
import { canvasAvailable, cachedCanvas } from '../pixel/render'
import { renderLobbyBase, drawSummonCircle } from '../pixel/tiles'
import { PROP_FRAMES, drawEmote, drawProp, type EmoteKind } from '../pixel/props'
import { ROOF_LIFT, blanket, drawRoof, smoke } from '../pixel/campusProps'
import { drawLot, drawSign, drawSiteFrame, drawSiteMarker, type SiteMarker } from '../pixel/siteArt'
import { gatedRooms, siteRooms, buildableCount } from './sites'
import { ConstructionBoard } from './ConstructionBoard'
import { drawSky, estateDrawables, skyLabel } from './estateLayer'
import { heroBustUrl, heroFrameCanvas, iselBustUrl, masterBustUrl, masterFrameCanvas } from '../pixel/sprites'
import type { Dir, WalkFrame } from '../pixel/heroSprite'
import { hashString } from '../pixel/rand'
import { t, t as tr } from '../i18n/i18n'
import { breakLigatures, canvasFont, plainText } from '../canvasText'

/**
 * The waiting room as a walkable campus (Living Lobby spec §3). The Master walks with
 * arrows / WASD / ZQSD or by clicking; E / Space / Enter uses what they face. Heroes are
 * driven by the Quanton Life engine: each walks to the building of their current
 * activity and does it there — sleeping in their own bed, hammering at the forge,
 * drinking in the tavern, standing at a friend's grave. Roofs hide interiors until the
 * Master steps inside; the light follows the world clock. Motion is cosmetic: the engine
 * is only touched through Commands.
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

/** The Master's zoom steps (screen pixels per world pixel); null = fit automatically. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4] as const
const ZOOM_KEY = 'pmu.lobbyZoom'

function loadZoom(): number | null {
  try {
    const v = Number(window.localStorage.getItem(ZOOM_KEY))
    return (ZOOM_STEPS as readonly number[]).includes(v) ? v : null
  } catch {
    return null
  }
}

/** One zoom step in (dir 1) or out (dir −1) from the current scale. */
export function stepZoom(current: number, dir: 1 | -1): number {
  const steps = ZOOM_STEPS as readonly number[]
  if (dir > 0) return steps.find((s) => s > current + 1e-6) ?? steps[steps.length - 1]!
  return [...steps].reverse().find((s) => s < current - 1e-6) ?? steps[0]!
}

/**
 * The viewport for a window: at a chosen scale, the view is as much of the estate as the
 * window holds (zoomed out, you see more); with no choice, an integer zoom that fits the
 * preferred view (phones get ×2 with a narrower view).
 */
export function fitViewport(W: number, H: number, scale: number | null = null): Viewport {
  if (scale !== null) {
    return {
      w: Math.max(TILE * 4, Math.min(MAP_W * TILE, Math.floor(W / scale))),
      h: Math.max(TILE * 4, Math.min(MAP_H * TILE, Math.floor(H / scale))),
      zoom: scale,
    }
  }
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
const MASTER_SPEED = 6.5 // tiles / s
const HERO_SPEED = 2.4
const PANEL_PLACES: PanelPlace[] = [
  'kitchen',
  'tacticalCenter',
  'promotionChamber',
  'trainingCenter',
  'transferStation',
  'synthesis',
  'armory',
  'daily',
  'shop',
  'hallOfMagic',
  'rift',
  'guild',
  'dormitory',
  'tavern',
  'infirmary',
  'garden',
  'memorial',
  'library',
  'watchtower',
  'market',
]
export const PLACE_ICON: Record<PlaceId, string> = {
  kitchen: '🍲',
  tacticalCenter: '🗺',
  promotionChamber: '⛩',
  trainingCenter: '⚔',
  transferStation: '⇄',
  shop: '♦',
  hallOfMagic: '✶',
  rift: '⟡',
  guild: '⚑',
  synthesis: '⚗',
  armory: '⚒',
  daily: '🌀',
  summon: '🔮',
  roster: '📜',
  party: '🛡',
  tower: '🗼',
  fairy: '✧',
  dormitory: '🛏',
  tavern: '🍺',
  infirmary: '✚',
  garden: '🌱',
  memorial: '🕯',
  library: '📚',
  watchtower: '🔭',
  market: '⚖',
}
/** Order of the fast-travel menu. */
export const MENU_PLACES: PlaceId[] = [
  'tower',
  'summon',
  'party',
  'roster',
  'kitchen',
  'tavern',
  'dormitory',
  'tacticalCenter',
  'promotionChamber',
  'trainingCenter',
  'armory',
  'transferStation',
  'synthesis',
  'library',
  'infirmary',
  'garden',
  'market',
  'watchtower',
  'memorial',
  'daily',
  'hallOfMagic',
  'rift',
  'guild',
  'shop',
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
  /** The activity the walker is currently acting out. */
  key: string
  spot: Spot | null
  departAt: number
  arrived: boolean
  lying: boolean
  hidden: boolean
  fidgetAt: number
  nextThought: number
  bubble: { text: string; until: number } | null
}

const ACTIVITY_EMOTE: Partial<Record<string, EmoteKind>> = {
  sleep: 'zz',
  eat: 'food',
  work: 'sword',
  train: 'sword',
  drilling: 'sword',
  socialize: 'note',
  read: 'book',
  pray: 'pray',
  promoting: 'pray',
  mourn: 'dots',
  heal: 'heart',
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

/** A speech bubble that wraps to up to three lines above a hero. */
function drawBubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  plainText(ctx, canvasFont(8))
  text = breakLigatures(text)
  const maxW = 128
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const wd of words) {
    const next = cur ? `${cur} ${wd}` : wd
    if (ctx.measureText(next).width > maxW - 8 && cur) {
      lines.push(cur)
      cur = wd
    } else cur = next
  }
  if (cur) lines.push(cur)
  if (lines.length > 3) {
    lines.length = 3
    lines[2] = lines[2]!.replace(/\s*\S*$/, '') + '…'
  }
  const w = Math.min(maxW, Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 8)
  const h = lines.length * 9 + 4
  const bx = Math.round(x - w / 2)
  const by = Math.round(y - h)
  ctx.fillStyle = '#fff6e0'
  ctx.fillRect(bx, by, w, h)
  ctx.fillRect(Math.round(x) - 1, by + h, 3, 2)
  ctx.strokeStyle = '#1b1225'
  ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1)
  ctx.fillStyle = '#1b1225'
  lines.forEach((l, i) => ctx.fillText(l, bx + 4, by + 9 + i * 9, w - 8))
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
  const f = state.facilities
  if (!synthesisUnlocked(state)) out.push('synthesis')
  if (!smithyUnlocked(state)) out.push('armory')
  if (!dailyUnlocked(state)) out.push('daily')
  if (f.promotionChamber.level === 0) out.push('promotionChamber')
  if (f.trainingCenter.level === 0) out.push('training')
  if (f.transferStation.level === 0) out.push('transfer')
  if (f.hallOfMagic.level === 0 && !state.meta.crackOpen) out.push('magic')
  if (f.tavern.level === 0) out.push('tavern')
  if (f.infirmary.level === 0) out.push('infirmary')
  if (f.garden.level === 0) out.push('garden')
  if (f.library.level === 0) out.push('library')
  if (f.watchtower.level === 0) out.push('watchtower')
  if (f.market.level === 0) out.push('market')
  return out
}

const SIGN = drawSign()

/** A marker over one unbuilt place, in world pixels (the bubble's tip). */
interface Marker {
  kind: SiteMarker
  x: number
  y: number
  text: string
}

/** Markers for every construction site and every place still waiting on a level. */
export function siteMarkers(state: GameState): Marker[] {
  const at = (room: RoomId, place: PlaceId) => {
    const b = BUILDINGS.find((bb) => bb.id === room)
    if (b) return { x: (b.rect.x + b.rect.w / 2) * TILE, y: b.rect.y * TILE - ROOF_LIFT - 2 }
    const p = propForPlace(place)
    return { x: (p.x + p.w / 2) * TILE, y: p.y * TILE - 10 }
  }
  const out: Marker[] = []
  for (const site of siteRooms(state).values()) {
    const name = tr(site.label)
    const kind: SiteMarker = site.status === 'ready' ? 'build' : site.status === 'building' ? 'building' : site.status === 'short' ? 'short' : 'locked'
    const text =
      kind === 'build'
        ? tr('Build the {name} here', { name })
        : kind === 'building'
          ? tr('{name} · under construction', { name })
          : kind === 'short'
            ? tr('{name} · {cost} gold', { name, cost: (site.cost ?? 0).toLocaleString() })
            : site.unlockAt !== null && state.meta.masterLevel < site.unlockAt
              ? tr('{name} · Master Lv {n}', { name, n: site.unlockAt })
              : tr('{name} · not yet', { name })
    out.push({ kind, ...at(site.room, site.place), text })
  }
  for (const g of gatedRooms(state)) {
    out.push({ kind: 'locked', ...at(g.room, g.place), text: `${tr(g.label)} · ${tr(g.reason.key, { n: g.reason.n })}` })
  }
  return out
}

/** Darkness 0..1 by hour of the world day (dusk 17–20, dawn 5–7). */
export function darknessAt(hour: number): number {
  if (hour >= 7 && hour < 17) return 0
  if (hour >= 17 && hour < 20) return ((hour - 17) / 3) * 0.62
  if (hour >= 5 && hour < 7) return (1 - (hour - 5) / 2) * 0.62
  return 0.62
}

export function clockLabel(worldMs: number): string {
  const h = hourOfWorld(worldMs)
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

const LIGHTS: Partial<Record<Prop['kind'], { color: string; r: number }>> = {
  torch: { color: '255,170,80', r: 36 },
  lamp: { color: '255,210,120', r: 44 },
  hearth: { color: '255,140,60', r: 52 },
  forge: { color: '255,120,50', r: 56 },
  summonCrystal: { color: '140,200,255', r: 60 },
  obelisk: { color: '255,160,80', r: 30 },
  portal: { color: '110,220,230', r: 44 },
  rift: { color: '190,120,255', r: 48 },
  fountain: { color: '150,200,255', r: 30 },
  orrery: { color: '200,180,255', r: 36 },
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
  const miniRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState<Viewport>({ w: VIEW_W, h: VIEW_H, zoom: 3 })
  const vpRef = useRef(vp)
  vpRef.current = vp
  const [openPlace, setOpenPlace] = useState<PanelPlace | null>(null)
  const [dialog, setDialog] = useState<DialogScript | null>(null)
  const [prompt, setPrompt] = useState<string | null>(null)
  const [profile, setProfile] = useState<string | null>(null)
  const [tracker, setTracker] = useState(false)
  const [letter, setLetter] = useState(false)
  const [showMap, setShowMap] = useState(() => typeof window === 'undefined' || window.innerWidth >= 720)
  const [clock, setClock] = useState(() => toWorldTime(Date.now()))
  const [following, setFollowing] = useState<string | null>(null)
  const [board, setBoard] = useState(false)
  const [adviceOpen, setAdviceOpen] = useState(false)
  const advice = useAdvice(state)

  // Live world state for the game loop (never React state: 60 fps mutation).
  const world = useRef({
    master: newWalker(MASTER_SPAWN, 'up'),
    heroes: new Map<string, HeroWalker>(),
    held: [] as Dir[],
    pending: null as Target | null,
    time: 0,
    promptLabel: null as string | null,
    follow: null as string | null,
    roofAlpha: new Map<string, number>(),
  })
  world.current.follow = following
  const stateRef = useRef(state)
  stateRef.current = state
  const modalRef = useRef(false)
  modalRef.current = openPlace !== null || dialog !== null || profile !== null || tracker || letter || board || adviceOpen

  // Pump the world clock (timers finish, heroes live, Sanity regenerates) while in the lobby.
  useEffect(() => {
    const id = setInterval(() => {
      store.dispatch({ type: 'TICK' }, Date.now())
      setClock(toWorldTime(Date.now()))
    }, 1000)
    return () => clearInterval(id)
  }, [store])

  // Isel's letter waits for a Master who has been away a while; a brand-new Master is
  // greeted instead, and pointed at the crystal's free first summon.
  useEffect(() => {
    const st = stateRef.current
    if (!st.life.guide.tutorialPull && !st.life.guide.done.includes('welcome') && st.tower.highestCleared === 0) {
      setDialog({
        speaker: 'Isel',
        bust: iselBustUrl(),
        lines: [
          t('Welcome, Master. I am Isel — I keep this waiting room in order.'),
          t('Everyone who lives here came through that crystal. They are people, with lives of their own. They eat, sleep, work, make friends… and they remember.'),
          t('The crystal owes you a first summon: ten heroes, free. Go and meet them.'),
        ],
        actions: [{ label: t('To the crystal'), onClick: () => onNavigate('summon') }],
      })
      store.dispatch({ type: 'GUIDE_STEP', step: 'welcome' })
    } else if (letterReady(st, toWorldTime(Date.now()))) setLetter(true)
  }, [])

  // Keep one walker per living hero; a new hero appears at their spot.
  useEffect(() => {
    const w = world.current
    const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
    const alive = new Set(living.map((h) => h.id as string))
    for (const id of [...w.heroes.keys()]) if (!alive.has(id)) w.heroes.delete(id)
    for (const h of living) {
      if (w.heroes.has(h.id)) continue
      const d = activityOf(h)
      const spot = spotFor(state, h, d)
      const at = spot.lie ?? spot.at
      w.heroes.set(h.id, {
        ...newWalker(at),
        id: h.id,
        key: activityKey(d),
        spot,
        departAt: 0,
        arrived: true,
        lying: Boolean(spot.lie),
        hidden: Boolean(spot.vanish),
        fidgetAt: Math.random() * 12,
        nextThought: 4 + Math.random() * 20,
        bubble: null,
      })
    }
  }, [state])

  // Fit the stage to the window: the Master's chosen zoom, else an integer auto-fit.
  const [zoomPick, setZoomPick] = useState<number | null>(() => (typeof window !== 'undefined' ? loadZoom() : null))
  useEffect(() => {
    const fit = () => {
      const el = stageRef.current
      const W = el?.clientWidth || window.innerWidth
      const H = el?.clientHeight || window.innerHeight
      setVp(fitViewport(W, H, zoomPick))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [zoomPick])
  const setZoom = (z: number | null) => {
    setZoomPick(z)
    try {
      if (z === null) window.localStorage.removeItem(ZOOM_KEY)
      else window.localStorage.setItem(ZOOM_KEY, String(z))
    } catch {
      /* a remembered zoom is only a convenience */
    }
  }
  const zoomBy = (dir: 1 | -1) => setZoom(stepZoom(vpRef.current.zoom, dir))
  const zoomByRef = useRef(zoomBy)
  zoomByRef.current = zoomBy

  function talkTo(id: string) {
    const st = stateRef.current
    const h = st.heroes[id as OwnedHero['id']]
    if (!h) return
    const inParty = st.party.slots.includes(h.id)
    if (!st.life.guide.done.includes('talk')) store.dispatch({ type: 'GUIDE_STEP', step: 'talk' })
    store.dispatch({ type: 'TALK_TO_HERO', heroId: h.id }, Date.now())
    setDialog({
      speaker: h.name,
      bust: heroBustUrl(h),
      lines: [...conversation(st, h, inParty), `— ${statusLine(st, h)}`],
      actions: [{ label: t('Profile'), onClick: () => setProfile(h.id) }],
    })
  }

  function interact(target: Target) {
    const st = stateRef.current
    if (target.kind === 'hero') return talkTo(target.id)
    const place = target.prop.place
    if (!place) return
    if (place === 'fairy') {
      const lines = iselLines(st)
      setDialog({
        speaker: 'Isel',
        bust: iselBustUrl(),
        lines,
        actions: [{ label: t('Read her letter'), onClick: () => setLetter(true) }],
      })
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
    for (const hw of world.current.heroes.values()) if (!hw.hidden && hw.x === fx && hw.y === fy) return { kind: 'hero', id: hw.id }
    const p = propAt(fx, fy)
    return p && p.place ? { kind: 'prop', prop: p } : null
  }

  function labelFor(tg: Target | null): string | null {
    if (!tg) return null
    if (tg.kind === 'hero') return stateRef.current.heroes[tg.id as OwnedHero['id']]?.name.split(/\s+/)[0] ?? null
    return tg.prop.place ? tr(PLACE_LABEL[tg.prop.place]) : null
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
      // A window the App opened over the lobby (the Menu, save transfer, key help) owns the keys.
      if (document.querySelector('.pwin-backdrop')) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const dir = KEY_DIR[k]
      const w = world.current
      if (dir) {
        e.preventDefault()
        w.master.path = []
        w.pending = null
        if (w.follow) setFollowing(null)
        if (!w.master.moving) w.master.dir = dir // a tap turns in place
        if (!w.held.includes(dir)) w.held.push(dir)
        return
      }
      if (k === 'e' || k === ' ' || k === 'Enter') {
        e.preventDefault()
        const tg = targetInFront()
        if (tg) interact(tg)
      } else if (k === 'Escape' || k === 'm') {
        onMenu()
      } else if (k === 'h') {
        setTracker(true)
      } else if (k === 'b') {
        setBoard(true)
      } else if (k === 'n') {
        setShowMap((v) => !v)
      } else if (k === '-' || k === '_') {
        zoomByRef.current(-1)
      } else if (k === '+' || k === '=') {
        zoomByRef.current(1)
      } else if (k === '0') {
        setZoom(null)
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
    const base = cachedCanvas('campus-base', renderLobbyBase)
    let raf = 0
    let last = performance.now()
    let miniAt = 0

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
          const tg = w.pending
          w.pending = null
          if (tg.kind === 'prop') m.dir = facingToward(tg.prop, m.x, m.y)
          else {
            const hw = w.heroes.get(tg.id)
            if (hw) {
              m.dir = dirBetween(m, hw)
              if (!hw.lying) hw.dir = dirBetween(hw, m)
            }
          }
          interact(tg)
        }
      }

      // ── heroes: act out the life engine's activity
      for (const hw of w.heroes.values()) {
        const h = st.heroes[hw.id as OwnedHero['id']]
        if (!h || !h.alive) continue
        const d = activityOf(h)
        const key = activityKey(d)
        if (key !== hw.key) {
          hw.key = key
          hw.spot = spotFor(st, h, d)
          hw.arrived = false
          hw.departAt = w.time + Math.random() * 6
          hw.path = []
          if (hw.lying) {
            // Get up: step off the bed onto the tile beside it.
            hw.lying = false
            const off = findPath(hw, () => true, isWalkable)
            const stand = off && off.length ? off[0]! : hw
            Object.assign(hw, newWalker(stand, 'down'))
          }
          if (hw.hidden && !isOffsite(h)) {
            hw.hidden = false
            const rift = propForPlace('rift')
            Object.assign(hw, newWalker({ x: rift.x, y: rift.y + 1 }, 'down'))
          }
        }
        advance(hw, dt, HERO_SPEED)
        if (hw.moving || hw.hidden) continue
        if (hw.path.length > 0) {
          const n = hw.path.shift()!
          if (isWalkable(n.x, n.y) && !(n.x === m.x && n.y === m.y)) beginStep(hw, n)
          else hw.path = []
          continue
        }
        const spot = hw.spot
        if (!spot) continue
        if (!hw.arrived) {
          if (w.time < hw.departAt) continue
          if (hw.x === spot.at.x && hw.y === spot.at.y) {
            hw.arrived = true
            if (spot.face) hw.dir = facingToward(spot.face, hw.x, hw.y)
            if (spot.lie) {
              hw.lying = true
              Object.assign(hw, { x: spot.lie.x, y: spot.lie.y, fx: spot.lie.x, fy: spot.lie.y, dir: 'down' as Dir })
            }
            if (spot.vanish) hw.hidden = true
          } else {
            const path = findPath(hw, (x, y) => x === spot.at.x && y === spot.at.y)
            if (path && path.length) hw.path = path
            else hw.arrived = true // unreachable: stay put
          }
          continue
        }
        // Arrived: fidget a little inside the place, now and then.
        if (!hw.lying && w.time > hw.fidgetAt) {
          hw.fidgetAt = w.time + 10 + Math.random() * 18
          if (['socialize', 'wander', 'work', 'hobby', 'train', 'eat', 'read'].includes(d.kind) && Math.random() < 0.45) {
            hw.spot = spotFor(st, h, d, String(Math.floor(Math.random() * 1000)))
            hw.arrived = false
            hw.departAt = w.time
          }
        }
      }

      // Pair chats and passing thoughts.
      for (const hw of w.heroes.values()) {
        if (hw.hidden || !hw.arrived || hw.lying) continue
        if (hw.bubble && w.time > hw.bubble.until) hw.bubble = null
        if (w.time < hw.nextThought) continue
        hw.nextThought = w.time + 18 + Math.random() * 40
        const h = st.heroes[hw.id as OwnedHero['id']]
        if (!h) continue
        const d = activityOf(h)
        const mate = d.with ? w.heroes.get(d.with) : undefined
        if (mate && mate.arrived && Math.abs(mate.x - hw.x) + Math.abs(mate.y - hw.y) <= 3 && !mate.bubble) {
          const mh = st.heroes[mate.id as OwnedHero['id']]
          if (mh) {
            const [a, b] = pairLines(st, h, mh, Math.floor(w.time / 60))
            hw.bubble = { text: a, until: w.time + 3.5 }
            mate.bubble = { text: b, until: w.time + 7.5 }
            mate.nextThought = w.time + 12
            hw.dir = dirBetween(hw, mate)
            mate.dir = dirBetween(mate, hw)
          }
        } else if (Math.random() < 0.35) {
          hw.bubble = { text: speak(st, h, st.party.slots.includes(h.id), String(Math.floor(w.time / 30))), until: w.time + 4.5 }
        }
      }

      // ── prompt
      const label = modalRef.current ? null : labelFor(targetInFront())
      if (label !== w.promptLabel) {
        w.promptLabel = label
        setPrompt(label)
      }

      // ── camera (the Master, or a hero being followed)
      const followed = w.follow ? w.heroes.get(w.follow) : undefined
      const focus = followed && !followed.hidden ? walkerPx(followed) : walkerPx(m)
      const { w: VW, h: VH } = vpRef.current
      if (cv.width !== VW || cv.height !== VH) {
        cv.width = VW
        cv.height = VH
        ctx.imageSmoothingEnabled = false
      }
      const { camX, camY } = cameraFor(focus.px, focus.py, VW, VH)
      const onScreen = (x: number, y: number, pad = 48) => x > camX - pad && x < camX + VW + pad && y > camY - pad && y < camY + VH + pad
      ctx.fillStyle = '#0a0710'
      ctx.fillRect(0, 0, VW, VH)
      if (base) ctx.drawImage(base, -camX, -camY)

      // summoning circle under the crystal
      const phase = Math.floor(w.time * 4) % 24
      const circle = cachedCanvas(`circle|${phase}`, () => drawSummonCircle(phase))
      const crystal = propForPlace('summon')
      if (circle) {
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(w.time * 2)
        ctx.drawImage(circle, (crystal.x + 1) * TILE - 36 - camX, (crystal.y + 1) * TILE - 36 - camY)
        ctx.globalAlpha = 1
      }

      // Unbuilt places: a yard or garden is a staked dirt lot, a building a dark shell
      // under its timber frame; places waiting on a level sit in darkness.
      const sites = siteRooms(st)
      for (const room of lockedRooms(st)) {
        const r = ROOMS[room]
        const zone = sites.has(room) && !BUILDINGS.some((b) => b.id === room)
        const lot = zone ? cachedCanvas(`lot|${room}`, () => drawLot(r, room)) : null
        if (lot) ctx.drawImage(lot, r.x * TILE - camX, r.y * TILE - camY)
        ctx.fillStyle = zone ? 'rgba(8,4,16,0.25)' : 'rgba(8,4,16,0.55)'
        ctx.fillRect(r.x * TILE - camX, r.y * TILE - camY, r.w * TILE, r.h * TILE)
      }
      const siteRects = [...sites.keys()].map((room) => ROOMS[room])
      const inSite = (x: number, y: number) => siteRects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)

      // y-sorted props, graves, characters and roofs
      type Drawable = { y: number; draw: () => void }
      const list: Drawable[] = []
      for (const p of PROPS) {
        const ox = p.x * TILE
        const oy = p.y * TILE
        if (!onScreen(ox, oy, 64)) continue
        const frames = PROP_FRAMES[p.kind]
        const f = frames > 1 ? Math.floor(w.time * (p.kind === 'tree' ? 1 : 6) + p.x) % frames : 0
        const img = cachedCanvas(`prop|${p.kind}|${f}`, () => drawProp(p.kind, f).bmp)
        if (!img) continue
        const spr = propOffset(p.kind)
        const wallMounted = isWallChar(tileAt(p.x, p.y)) || p.kind === 'torch' || p.kind === 'banner'
        if (inSite(p.x, p.y)) {
          // Not built yet: the furniture is only a blueprint; the counter is a signpost.
          const sign = p.place ? cachedCanvas('site|sign', () => drawSign().bmp) : null
          list.push({
            y: (p.y + p.h) * TILE,
            draw: () => {
              ctx.globalAlpha = 0.28
              ctx.drawImage(img, ox + spr.dx - camX, oy + spr.dy - camY)
              ctx.globalAlpha = 1
              if (sign) ctx.drawImage(sign, ox + SIGN.dx - camX, oy + SIGN.dy - camY)
            },
          })
          continue
        }
        list.push({
          y: wallMounted ? (p.y + 0.5) * TILE : (p.y + p.h) * TILE,
          draw: () => ctx.drawImage(img, ox + spr.dx - camX, oy + spr.dy - camY),
        })
      }
      const graves = st.life.memorial.slice(-12)
      graves.forEach((_, i) => {
        const g = graveTile(i)
        if (!g) return
        const img = cachedCanvas('prop|grave|0', () => drawProp('grave', 0).bmp)
        const spr = propOffset('grave')
        if (img) list.push({ y: (g.y + 1) * TILE, draw: () => ctx.drawImage(img, g.x * TILE + spr.dx - camX, g.y * TILE + spr.dy - camY) })
      })
      const drawShadow = (px: number, py: number) => {
        ctx.fillStyle = 'rgba(10,6,20,0.35)'
        ctx.fillRect(px - 6 - camX, py - 1 - camY, 12, 3)
        ctx.fillRect(px - 5 - camX, py - 2 - camY, 10, 5)
      }
      for (const hw of w.heroes.values()) {
        if (hw.hidden) continue
        const h = st.heroes[hw.id as OwnedHero['id']]
        if (!h) continue
        const { px, py } = walkerPx(hw)
        if (!onScreen(px, py)) continue
        const d = activityOf(h)
        const busy = hw.arrived ? d.kind : null
        const sparring = busy === 'train' || busy === 'drilling' || (busy === 'work' && (h.life?.job === 'blacksmith' || h.life?.job === 'instructor'))
        const frame = sparring ? (((Math.floor(w.time * 5) % 2) + 1) as WalkFrame) : walkFrame(hw)
        const img = heroFrameCanvas(h, hw.lying ? 'down' : hw.dir, hw.lying ? 0 : frame)
        const emote = busy ? ACTIVITY_EMOTE[busy] : null
        const isFollowed = w.follow === hw.id
        list.push({
          y: hw.lying ? py + 14 : py,
          draw: () => {
            if (hw.lying) {
              // Tucked in: the head on the pillow, the blanket over the rest.
              const bx = Math.round(hw.x * TILE - camX)
              const by = Math.round(hw.y * TILE - camY)
              if (img) ctx.drawImage(img, bx - 4, by - 4, 24, 32)
              const bl = cachedCanvas(`blanket|${hashString(hw.id) % 4}`, () => blanket(hashString(hw.id)))
              if (bl) ctx.drawImage(bl, bx + 1, by + 11)
            } else {
              drawShadow(px, py)
              if (img) ctx.drawImage(img, Math.round(px - 12 - camX), Math.round(py - 30 - camY))
            }
            if (isFollowed) {
              ctx.strokeStyle = '#f2c75c'
              ctx.strokeRect(Math.round(px - 7 - camX) + 0.5, Math.round(py - 1 - camY) + 0.5, 14, 4)
            }
            if (hw.bubble) drawBubble(ctx, hw.bubble.text, px - camX, py - (hw.lying ? 20 : 36) - camY)
            else if (emote && Math.floor(w.time + hw.x) % 4 < 2) {
              const e = cachedCanvas(`emote|${emote}`, () => drawEmote(emote))
              if (e) ctx.drawImage(e, Math.round(px - 5 - camX), Math.round(py - (hw.lying ? 26 : 44) - camY))
            }
          },
        })
      }
      const mp = walkerPx(m)
      const mImg = masterFrameCanvas(st.accountId, m.dir, walkFrame(m))
      list.push({
        y: mp.py + 0.5,
        draw: () => {
          drawShadow(mp.px, mp.py)
          if (mImg) ctx.drawImage(mImg, Math.round(mp.px - 12 - camX), Math.round(mp.py - 30 - camY))
        },
      })
      // Roofs: sorted at the building's front wall, faded away while the Master is inside.
      const inside = insideBuilding(m.x, m.y) ?? buildingAt(m.x, m.y)
      const roofFrame = Math.floor(w.time * 8)
      for (const b of BUILDINGS) {
        const target = inside === b ? 0 : 1
        const cur = w.roofAlpha.get(b.id) ?? target
        const next = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt * 4)
        w.roofAlpha.set(b.id, next)
        if (next <= 0.01) continue
        const rx = b.rect.x * TILE
        const ry = b.rect.y * TILE - ROOF_LIFT
        if (!onScreen(rx, ry, b.rect.w * TILE)) continue
        const site = sites.get(b.id)
        const building = site?.status === 'building'
        const roof = site
          ? cachedCanvas(`site|frame|${b.id}|${building}`, () => drawSiteFrame(b, building))
          : cachedCanvas(`roof|${b.id}`, () => drawRoof(b, 0))
        list.push({
          y: (b.rect.y + b.rect.h - 1) * TILE + 1,
          draw: () => {
            if (!roof) return
            ctx.globalAlpha = next
            ctx.drawImage(roof, rx - camX, ry - camY)
            if (b.chimney && !site) {
              const sm = cachedCanvas(`smoke|${roofFrame % 15}`, () => smoke(roofFrame % 15))
              if (sm) ctx.drawImage(sm, rx + Math.round(b.rect.w * TILE * 0.78) - 2 - camX, ry - 18 - camY)
            }
            if (next > 0.5) drawBuildingSign(ctx, b, rx - camX, ry - camY, vpRef.current.zoom, site ? (building ? 'building' : 'site') : 'built')
            ctx.globalAlpha = 1
          },
        })
      }
      // Name plaques for the open-air places (drawn at the top of their ground).
      for (const z of ZONES) {
        const info = ZONE_SIGN[z.id]
        if (!info) continue
        const zs = info.room ? sites.get(info.room) : undefined
        const zState = zs ? (zs.status === 'building' ? 'building' : 'site') : 'built'
        list.push({ y: z.rect.y * TILE + TILE, draw: () => drawZoneSign(ctx, z, camX, camY, vpRef.current.zoom, zState) })
      }
      // The estate: decorations, statues, the season on the ground, the trees and the roofs.
      list.push(...estateDrawables(ctx, st, toWorldTime(Date.now()), w.time, { camX, camY, VW, VH }, w.roofAlpha, inside))
      list.sort((a, b) => a.y - b.y)
      for (const d of list) d.draw()

      // Markers over every unbuilt place: a hammer (build here), a padlock (not yet), an
      // hourglass (under way). Labels show once the Master is close enough to read them.
      const bob = Math.round(Math.sin(w.time * 3) * 1.5)
      plainText(ctx, canvasFont(8))
      ctx.textAlign = 'center'
      for (const mk of siteMarkers(st)) {
        const mx = mk.x - camX
        const my = mk.y - camY + bob
        if (mx < -40 || my < -40 || mx > VW + 40 || my > VH + 40) continue
        const icon = cachedCanvas(`site|marker|${mk.kind}`, () => drawSiteMarker(mk.kind))
        if (icon) ctx.drawImage(icon, Math.round(mx - 7), Math.round(my - 16))
        const near = Math.abs(mk.x / TILE - m.x) + Math.abs(mk.y / TILE - m.y) < 16
        if (near) {
          const text = breakLigatures(mk.text)
          const tw = ctx.measureText(text).width
          ctx.fillStyle = 'rgba(20,12,32,0.8)'
          ctx.fillRect(Math.round(mx - tw / 2 - 3), Math.round(my - 28), Math.ceil(tw + 6), 10)
          ctx.fillStyle = mk.kind === 'build' ? '#ffe07a' : '#e8e0f0'
          ctx.fillText(text, Math.round(mx), Math.round(my - 20))
        }
      }
      ctx.textAlign = 'start'

      // ── day and night
      const hour = hourOfWorld(toWorldTime(Date.now()))
      const dark = darknessAt(hour)
      if (dark > 0) {
        ctx.fillStyle = `rgba(10,14,46,${dark})`
        ctx.fillRect(0, 0, VW, VH)
        ctx.globalCompositeOperation = 'lighter'
        const covered = (p: Prop) => {
          const b = buildingAt(p.x, p.y)
          return b !== null && b !== inside && (w.roofAlpha.get(b.id) ?? 1) > 0.5
        }
        for (const p of PROPS) {
          const L = LIGHTS[p.kind]
          if (!L || covered(p)) continue
          const cx = (p.x + p.w / 2) * TILE - camX
          const cy = (p.y + 0.5) * TILE - camY
          if (cx < -L.r || cy < -L.r || cx > VW + L.r || cy > VH + L.r) continue
          const flick = 1 + 0.06 * Math.sin(w.time * 9 + p.x)
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, L.r * flick)
          g.addColorStop(0, `rgba(${L.color},${0.5 * dark})`)
          g.addColorStop(1, `rgba(${L.color},0)`)
          ctx.fillStyle = g
          ctx.fillRect(cx - L.r * 1.1, cy - L.r * 1.1, L.r * 2.2, L.r * 2.2)
        }
        // lit windows on the roofs
        for (const b of BUILDINGS) {
          if (b === inside || sites.has(b.id)) continue
          const cx = (b.rect.x + b.rect.w / 2) * TILE - camX
          const cy = b.rect.y * TILE - ROOF_LIFT + Math.round(((b.rect.h - 1) * TILE + ROOF_LIFT) * 0.36) + 9 - camY
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14)
          g.addColorStop(0, `rgba(255,200,110,${0.7 * dark})`)
          g.addColorStop(1, 'rgba(255,200,110,0)')
          ctx.fillStyle = g
          ctx.fillRect(cx - 16, cy - 16, 32, 32)
        }
        ctx.globalCompositeOperation = 'source-over'
      }

      // the sky: weather, season, lantern light, fireflies
      drawSky(ctx, st, toWorldTime(Date.now()), w.time, { camX, camY, VW, VH }, dark)

      // warm vignette
      const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.45, VW / 2, VH / 2, Math.max(VW, VH) * 0.7)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(6,2,14,0.55)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, VW, VH)

      // ── minimap (a few times a second)
      const mini = miniRef.current
      if (mini && now - miniAt > 250) {
        miniAt = now
        drawMinimap(mini, st, w.heroes, m, { camX, camY, VW, VH })
      }

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
    const w = world.current
    const m = w.master
    const followed = w.follow ? w.heroes.get(w.follow) : undefined
    const focus = followed && !followed.hidden ? walkerPx(followed) : walkerPx(m)
    const { camX, camY } = cameraFor(focus.px, focus.py, VW, VH)
    const tx = Math.floor((lx + camX) / TILE)
    const ty = Math.floor((ly + camY) / TILE)
    w.held = []
    if (w.follow) setFollowing(null)
    for (const hw of w.heroes.values()) {
      if (hw.hidden) continue
      // heroes are tall: a click on their head counts too
      if (hw.x === tx && (hw.y === ty || hw.y === ty + 1)) return goTo({ kind: 'hero', id: hw.id })
    }
    const p = propAt(tx, ty) ?? propAt(tx, ty + 1)
    if (p && p.place) return goTo({ kind: 'prop', prop: p })
    walkTo(tx, ty)
  }

  function walkTo(tx: number, ty: number) {
    const m = world.current.master
    const path = findPath({ x: m.x, y: m.y }, (x, y) => Math.abs(x - tx) + Math.abs(y - ty) <= 1 && isWalkable(x, y))
    if (path) {
      m.path = path
      world.current.pending = null
    }
  }

  function onMiniClick(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const tx = Math.floor(((e.clientX - r.left) / r.width) * MAP_W)
    const ty = Math.floor(((e.clientY - r.top) / r.height) * MAP_H)
    setFollowing(null)
    walkTo(tx, ty)
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

  /** Find a hero: follow them with the camera (and walk the Master over). */
  function findHero(id: string) {
    setTracker(false)
    setProfile(null)
    setFollowing(id)
  }

  const ml = state.meta.masterLevel
  const xpPct = (state.meta.masterXp / masterXpToNext(ml)) * 100
  const living = Object.values(state.heroes).filter((h) => h.alive).length
  const hour = hourOfWorld(clock)
  const followedHero = following ? state.heroes[following as OwnedHero['id']] : null
  const buildable = buildableCount(state)
  const hasLetter = letterReady(state, clock, 20 * 60_000 * TUNING.time.worldTimeFactor)

  return (
    <div className="stage" ref={stageRef}>
      <canvas
        ref={canvasRef}
        className="px world-canvas"
        width={vp.w}
        height={vp.h}
        style={{ width: vp.w * vp.zoom, height: vp.h * vp.zoom }}
        onPointerDown={onPointerDown}
        onWheel={(e) => {
          if (modalRef.current || Math.abs(e.deltaY) < 1) return
          zoomBy(e.deltaY > 0 ? -1 : 1)
        }}
        aria-label="The waiting room"
      />

      <div className="hud hud-zoom" role="group" aria-label={t('Zoom')}>
        <button className="pbtn sm" onClick={() => zoomBy(1)} title={t('Zoom in (+)')} disabled={vp.zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]!}>
          ＋
        </button>
        <button className="pbtn sm ghost" onClick={() => setZoom(null)} title={t('Fit to the window (0)')}>
          {zoomPick === null ? t('Auto') : `×${vp.zoom}`}
        </button>
        <button className="pbtn sm" onClick={() => zoomBy(-1)} title={t('Zoom out (−)')} disabled={vp.zoom <= ZOOM_STEPS[0]}>
          －
        </button>
      </div>

      <div className="hud hud-tl">
        <img className="px hud-bust" src={masterBustUrl(state.accountId)} width={48} height={48} alt="" />
        <div>
          <div className="hud-title">{t('Master Lv {n}', { n: ml })}</div>
          <Gauge pct={xpPct} color="var(--accent-2)" label={`${state.meta.masterXp} / ${masterXpToNext(ml)} XP`} />
          {state.meta.piZeroSince !== null && toWorldTime(Date.now()) - state.meta.piZeroSince >= TUNING.lifecycle.greyMs && (
            <div className="hud-grey">{t('The waiting room is greying…')}</div>
          )}
          <div className="hud-sub">
            {living === 1 ? t('1 hero') : t('{n} heroes', { n: living })} ·{' '}
            {t('Floor {n}', { n: Math.min(state.tower.currentFloor, TUNING.tower.sliceTopFloor) })} · PI {Math.floor(state.meta.pi)}
          </div>
          <div className="hud-sub hud-clock">
            {hour >= 6 && hour < 19 ? '☀' : '☾'} {t('Day {n}', { n: accountDay(state, dayOfSlot(slotOf(clock))) })} · {clockLabel(clock)}
          </div>
          <div className="hud-sub hud-sky">{skyLabel(state, clock, hour < 6 || hour >= 19)}</div>
        </div>
      </div>

      <div className="hud hud-tr">
        {hasLetter && (
          <button className="pbtn gem pulse" onClick={() => setLetter(true)} title={t('Isel’s letter: what happened while you were away')}>
            ✉ {t('Letter')}
          </button>
        )}
        {!loginClaimed(state, toWorldTime(Date.now())) && (
          <button className="pbtn gem" onClick={() => store.dispatch({ type: 'CLAIM_LOGIN' }, Date.now())} title="Daily login reward">
            🎁 {t('Daily')}
          </button>
        )}
        <button className="pbtn cb-hud" onClick={() => setAdviceOpen(true)} title={t('Isel’s advice: who suits which job, who needs rest, what to do next')}>
          💡 {t('Advice')}
          {advice.tips.length > 0 && <span className="badge">{advice.tips.length}</span>}
        </button>
        <button className="pbtn cb-hud" onClick={() => setBoard(true)} title={t('Construction: build and upgrade (B)')}>
          🔨 {t('Build')}
          {buildable > 0 && <span className="badge">{buildable}</span>}
        </button>
        <button className="pbtn" onClick={() => setTracker(true)} title={t('Where is everyone? (H)')}>
          👥 {t('Heroes')}
        </button>
        <span className="coin gold">◆ {state.gold.toLocaleString()}</span>
        <span className="coin gem">♦ {state.gems.toLocaleString()}</span>
        <button className="pbtn" onClick={onMenu}>
          ☰ {t('Menu')}
        </button>
      </div>

      <FirstSteps state={state} store={store} />

      {showMap && (
        <div className="hud hud-mini">
          <canvas ref={miniRef} className="px minimap" width={MAP_W * 2} height={MAP_H * 2} onPointerDown={onMiniClick} aria-label={t('Map')} />
        </div>
      )}

      {followedHero && (
        <div className="hud hud-follow">
          <img className="px" src={heroBustUrl(followedHero)} width={24} height={24} alt="" />
          <span>
            <b>{followedHero.name.split(/\s+/)[0]}</b> · {statusLine(state, followedHero)}
          </span>
          <button className="pbtn sm" onClick={() => talkTo(followedHero.id)}>
            💬
          </button>
          <button className="pbtn sm" onClick={() => setProfile(followedHero.id)}>
            {t('Profile')}
          </button>
          <button className="pbtn sm ghost" onClick={() => setFollowing(null)}>
            ✕
          </button>
        </div>
      )}

      {prompt && !dialog && !openPlace && (
        <div className="hud hud-prompt">
          <kbd>E</kbd> {prompt}
        </div>
      )}
      <div className="hud hud-help">
        {t('↑↓←→ / WASD / ZQSD · E interact · click to walk · H heroes · B build · N map · −/+ zoom · M menu')} · {t('? all keys')}
        <button className="pbtn sm ghost" onClick={() => setShowMap((v) => !v)} style={{ marginLeft: 6 }}>
          🗺
        </button>
      </div>

      {openPlace && (
        <PixelWindow title={tr(PLACE_LABEL[openPlace])} icon={PLACE_ICON[openPlace]} onClose={() => setOpenPlace(null)}>
          <PlacePanel place={openPlace} state={state} store={store} onFindHero={findHero} onProfile={(id) => setProfile(id)} />
        </PixelWindow>
      )}
      {board && (
        <ConstructionBoard
          state={state}
          store={store}
          onClose={() => setBoard(false)}
          onGo={(place) => {
            setBoard(false)
            setFollowing(null)
            goTo({ kind: 'prop', prop: propForPlace(place) })
          }}
        />
      )}
      {adviceOpen && (
        <AdviceWindow
          state={state}
          store={store}
          tips={advice.tips}
          onDismiss={advice.dismiss}
          onProfile={(id) => setProfile(id)}
          onClose={() => setAdviceOpen(false)}
          onPlace={(p) => {
            setAdviceOpen(false)
            if (p === 'party') onNavigate('party')
            else if (p === 'build') setBoard(true)
            else setOpenPlace(p)
          }}
        />
      )}
      {tracker && <HeroTracker state={state} onClose={() => setTracker(false)} onFind={findHero} onProfile={(id) => setProfile(id)} />}
      {profile && state.heroes[profile as OwnedHero['id']] && (
        <HeroProfile state={state} store={store} heroId={profile} onClose={() => setProfile(null)} onFind={findHero} />
      )}
      {letter && (
        <LetterWindow
          state={state}
          onClose={() => {
            setLetter(false)
            store.dispatch({ type: 'READ_LETTER' }, Date.now())
          }}
        />
      )}
      {dialog && <DialogBox script={dialog} onDone={() => setDialog(null)} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimap
// ─────────────────────────────────────────────────────────────────────────────

const MINI_COLORS: Partial<Record<string, string>> = {
  '#': '#3a2e46',
  G: '#e8c060',
  D: '#a07a4e',
  '=': '#6a5a3a',
  g: '#2e5a2e',
  c: '#6e6a72',
  s: '#5e3e24',
  y: '#35603a',
  r: '#b8966a',
  q: '#8a7a6a',
  d: '#264654',
}

function miniBase(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = MAP_W * 2
  c.height = MAP_H * 2
  const x = c.getContext('2d')
  if (!x) return null
  for (let y = 0; y < MAP_H; y++)
    for (let xx = 0; xx < MAP_W; xx++) {
      const ch = tileAt(xx, y)
      x.fillStyle = MINI_COLORS[ch] ?? '#6a4a3a'
      x.fillRect(xx * 2, y * 2, 2, 2)
    }
  for (const b of BUILDINGS) {
    x.fillStyle = b.roof
    x.globalAlpha = 0.85
    x.fillRect(b.rect.x * 2, b.rect.y * 2, b.rect.w * 2, (b.rect.h - 1) * 2)
    x.globalAlpha = 1
  }
  return c
}

let miniCache: HTMLCanvasElement | null = null

function drawMinimap(
  cv: HTMLCanvasElement,
  st: GameState,
  heroes: Map<string, HeroWalker>,
  m: Walker,
  view: { camX: number; camY: number; VW: number; VH: number },
): void {
  const x = cv.getContext('2d')
  if (!x) return
  miniCache ??= miniBase()
  if (miniCache) x.drawImage(miniCache, 0, 0)
  for (const hw of heroes.values()) {
    if (hw.hidden) continue
    const inParty = st.party.slots.includes(hw.id as OwnedHero['id'])
    x.fillStyle = inParty ? '#f2c75c' : '#8ae0ff'
    x.fillRect(hw.x * 2, hw.y * 2, 2, 2)
  }
  // Unbuilt places: gold where a build can start now, grey where it waits.
  for (const site of siteRooms(st).values()) {
    const r = ROOMS[site.room]
    x.fillStyle = site.status === 'ready' ? '#ffe07a' : site.status === 'building' ? '#9ad4ff' : '#8e94aa'
    x.fillRect((r.x + r.w / 2) * 2 - 2, (r.y + r.h / 2) * 2 - 2, 4, 4)
  }
  x.fillStyle = '#ffffff'
  x.fillRect(m.x * 2 - 1, m.y * 2 - 1, 4, 4)
  x.strokeStyle = 'rgba(255,255,255,0.5)'
  x.strokeRect((view.camX / TILE) * 2 + 0.5, (view.camY / TILE) * 2 + 0.5, (view.VW / TILE) * 2, (view.VH / TILE) * 2)
}

export type { Building }
