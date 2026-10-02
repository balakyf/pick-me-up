/**
 * The estate and the sky, drawn over the campus (spec 2026-09-30-estate-and-life §1, §4).
 *
 * - `estateDrawables` gives LobbyWorld's y-sorted list the things the Master bought:
 *   rugs and bunk lamps, the tavern hearth and music corner, flower boxes and benches,
 *   hall tapestries, the fountain's upgrades, road lanterns, yard pennants, statues of the
 *   fallen — plus the season on the ground and in the trees (blossom, autumn leaves,
 *   snow on the roofs).
 * - `drawSky` lays the weather over the frame: rain streaks and lightning, snowfall, fog
 *   banks, fireflies on summer nights, lantern light after dark.
 *
 * Everything reads the engine's deterministic calendar (`seasonAt`, `weatherAt`); motion
 * is cosmetic and honours `prefers-reduced-motion`. Presentation only.
 */
import type { GameState } from '../../engine/types'
import { seasonAt, weatherAt, type Season, type Weather } from '../../engine/estate'
import { cachedCanvas } from '../pixel/render'
import { bench } from '../pixel/campusProps'
import { ROOF_LIFT } from '../pixel/campusProps'
import { bunkLamp, flowerBox, fountainUpgrade, hearth, lanternPost, musicCorner, pennant, rug, scoreboard, statue, tapestry } from '../pixel/estateArt'
import type { PropSprite } from '../pixel/props'
import { heroLook } from '../pixel/sprites'
import { hashString } from '../pixel/rand'
import { BUILDINGS, PROPS, TILE, tileAt, type Building } from './lobbyMap'
import { t } from '../i18n/i18n'

export interface View {
  camX: number
  camY: number
  VW: number
  VH: number
}

type Drawable = { y: number; draw: () => void }
type Pt = [number, number]

// ─────────────────────────────────────────────────────────────────────────────
// Where things stand (tiles; checked against the map in world.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const ESTATE_SPOTS = {
  rugs: [[4, 6], [8, 6], [12, 6], [16, 6]] as Pt[],
  bunkLamps: [[4, 2], [9, 2], [12, 2], [17, 2]] as Pt[],
  hearth: [13, 35] as Pt,
  music: [13, 30] as Pt,
  flowerBoxes: [[32, 53], [43, 53], [34, 53], [41, 53], [36, 53], [38, 53], [32, 44], [42, 44], [34, 44], [36, 44]] as Pt[],
  benches: [[42, 45], [32, 45]] as Pt[],
  tapestries: [[30, 16], [49, 16], [37, 16], [42, 16], [48, 16]] as Pt[],
  fountain: [21, 19] as Pt,
  lanterns: [
    [37, 12], [42, 12], [18, 26], [52, 17], [22, 32], [33, 32], [45, 32], [52, 28],
    [18, 36], [52, 38], [18, 47], [20, 53], [30, 53], [47, 53], [67, 53],
  ] as Pt[],
  pennants: [[57, 14], [76, 14], [60, 14], [73, 14], [63, 14], [70, 14], [59, 14], [74, 14], [62, 14], [71, 14]] as Pt[],
  scoreboard: [72, 16] as Pt,
  /** Statue plinths on the Memorial's hedges: south, east, then north. */
  statues: [[56, 53], [58, 53], [60, 53], [62, 53], [64, 45], [64, 47], [64, 49], [64, 51], [56, 44], [58, 44], [61, 44], [63, 44]] as Pt[],
}

let reducedMotion: boolean | null = null
export function prefersReducedMotion(): boolean {
  if (reducedMotion === null) {
    const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    reducedMotion = Boolean(mq?.matches)
    mq?.addEventListener?.('change', (e) => (reducedMotion = e.matches))
  }
  return reducedMotion
}

function sprite(key: string, make: () => PropSprite): { img: HTMLCanvasElement | null; dx: number; dy: number } {
  let s = spriteMeta.get(key)
  if (!s) {
    const p = make()
    s = { dx: p.dx, dy: p.dy }
    spriteMeta.set(key, s)
    return { img: cachedCanvas(key, () => p.bmp), ...s }
  }
  return { img: cachedCanvas(key, () => make().bmp), ...s }
}
const spriteMeta = new Map<string, { dx: number; dy: number }>()

// ─────────────────────────────────────────────────────────────────────────────
// Decorations, statues and the season in the y-sorted list
// ─────────────────────────────────────────────────────────────────────────────

/** Everything the estate adds to the campus this frame (for LobbyWorld's y-sort). */
export function estateDrawables(
  ctx: CanvasRenderingContext2D,
  st: GameState,
  worldMs: number,
  time: number,
  v: View,
  roofAlpha: Map<string, number>,
  inside: Building | null,
): Drawable[] {
  const out: Drawable[] = []
  const lv = st.estate?.decor ?? {}
  const still = prefersReducedMotion()
  const f2 = still ? 0 : Math.floor(time * 3) % 2
  const f3 = still ? 0 : Math.floor(time * 6) % 3
  const onScreen = (x: number, y: number, pad = 48) => x > v.camX - pad && x < v.camX + v.VW + pad && y > v.camY - pad && y < v.camY + v.VH + pad
  const place = (key: string, make: () => PropSprite, [tx, ty]: Pt, sortY: number) => {
    const ox = tx * TILE
    const oy = ty * TILE
    if (!onScreen(ox, oy, 64)) return
    const s = sprite(key, make)
    if (!s.img) return
    const img = s.img
    out.push({ y: sortY, draw: () => ctx.drawImage(img, ox + s.dx - v.camX, oy + s.dy - v.camY) })
  }
  const floorY = -1e6 // flat things lie under everyone
  const wallY = (ty: number) => (ty + 0.5) * TILE
  const standY = (ty: number) => (ty + 1) * TILE

  // Dormitory: rugs in the aisle, lamps over the bunks.
  ESTATE_SPOTS.rugs.slice(0, Math.min(4, lv.rugs ?? 0)).forEach((p, i) => place(`est|rug|${i}`, () => rug(i), p, floorY))
  const lamps = (lv.rugs ?? 0) >= 4 ? 4 : (lv.rugs ?? 0) >= 2 ? 2 : 0
  ESTATE_SPOTS.bunkLamps.slice(0, lamps).forEach((p) => place(`est|bunklamp|${f2}`, () => bunkLamp(f2), p, wallY(p[1])))
  // Tavern: the hearth (level 1+) and the music corner (3+).
  if ((lv.hearth ?? 0) >= 1) place(`est|hearth|${f3}`, () => hearth(f3), ESTATE_SPOTS.hearth, standY(ESTATE_SPOTS.hearth[1] + 1))
  if ((lv.hearth ?? 0) >= 3) place('est|music', musicCorner, ESTATE_SPOTS.music, standY(ESTATE_SPOTS.music[1]))
  // Garden: two flower boxes a level, then benches.
  ESTATE_SPOTS.flowerBoxes.slice(0, 2 * (lv.flowerbeds ?? 0)).forEach((p, i) => place(`est|flowerbox|${i % 4}`, () => flowerBox(i % 4), p, standY(p[1])))
  ESTATE_SPOTS.benches.slice(0, (lv.flowerbeds ?? 0) >= 5 ? 2 : (lv.flowerbeds ?? 0) >= 3 ? 1 : 0).forEach((p) => place('est|bench', bench, p, standY(p[1])))
  // Great Hall: a tapestry a level (gilded at the top level).
  const trim = (lv.tapestries ?? 0) >= 5
  ESTATE_SPOTS.tapestries.slice(0, lv.tapestries ?? 0).forEach((p, i) => place(`est|tapestry|${i}|${trim}`, () => tapestry(i, trim), p, wallY(p[1])))
  // Courtyard: the fountain's upgrades, over the fountain itself.
  if ((lv.fountain ?? 0) > 0) {
    const n = lv.fountain!
    const f = still ? 0 : Math.floor(time * 6) % 4
    place(`est|fountain|${n}|${f}`, () => fountainUpgrade(n, f), ESTATE_SPOTS.fountain, (ESTATE_SPOTS.fountain[1] + 2) * TILE + 0.5)
  }
  // Road lanterns: three a level.
  ESTATE_SPOTS.lanterns.slice(0, 3 * (lv.lanterns ?? 0)).forEach((p) => place(`est|lantern|${f2}`, () => lanternPost(f2), p, standY(p[1])))
  // Training Yard: pennants on the fence, a scoreboard from level 3.
  ESTATE_SPOTS.pennants.slice(0, 2 * (lv.banners ?? 0)).forEach((p, i) => place(`est|pennant|${i % 4}|${f2}`, () => pennant(i % 4, f2), p, wallY(p[1])))
  if ((lv.banners ?? 0) >= 3) place('est|scoreboard', scoreboard, ESTATE_SPOTS.scoreboard, standY(ESTATE_SPOTS.scoreboard[1]))

  // Statues of the fallen on the Memorial's hedges.
  const statues = st.estate?.statues ?? []
  statues.slice(0, ESTATE_SPOTS.statues.length).forEach((id, i) => {
    const rec = st.life.memorial.find((r) => r.heroId === id)
    if (!rec) return
    const src = { id: rec.heroId, name: rec.name, star: rec.star, heroClass: rec.heroClass, element: rec.element, portraitToken: rec.portraitToken }
    const p = ESTATE_SPOTS.statues[i]!
    place(`est|statue|${id}`, () => statue(heroLook(src)), p, standY(p[1]) + 0.2)
  })

  // The season: on the ground, in the trees, on the roofs.
  const season = seasonAt(worldMs)
  const weather = weatherAt(st.seed, worldMs)
  out.push({ y: floorY - 1, draw: () => drawGround(ctx, season, weather, time, v) })
  if (season !== 'summer') {
    for (const p of PROPS) {
      if (p.kind !== 'tree') continue
      const cx = p.x * TILE + 8
      const cy = p.y * TILE - 12
      if (!onScreen(cx, cy)) continue
      out.push({ y: (p.y + p.h) * TILE + 0.1, draw: () => drawCanopy(ctx, season, p.x, p.y, cx - v.camX, cy - v.camY) })
    }
  }
  if (season === 'winter') {
    for (const b of BUILDINGS) {
      if (b === inside) continue
      const rx = b.rect.x * TILE - v.camX
      const ry = b.rect.y * TILE - ROOF_LIFT - v.camY
      if (rx > v.VW || ry > v.VH || rx + b.rect.w * TILE < 0 || ry + b.rect.h * TILE < 0) continue
      out.push({ y: (b.rect.y + b.rect.h - 1) * TILE + 1.1, draw: () => drawRoofSnow(ctx, b, rx, ry, roofAlpha.get(b.id) ?? 1) })
    }
  }
  return out
}

const BLOSSOM = ['#f4a6c8', '#ffd0e0', '#fff0f6']
const AUTUMN = ['#d8782a', '#c8502a', '#e8b040', '#a8401e']

function drawCanopy(ctx: CanvasRenderingContext2D, season: Season, tx: number, ty: number, cx: number, cy: number): void {
  const h = hashString(`canopy|${tx}|${ty}`)
  const cols = season === 'spring' ? BLOSSOM : season === 'autumn' ? AUTUMN : ['#f4f8ff', '#e0ecff']
  const n = season === 'winter' ? 9 : 12
  for (let i = 0; i < n; i++) {
    const a = ((h >>> (i % 24)) + i * 37) % 360
    const r = 3 + ((h >>> i) % 9)
    const x = Math.round(cx + Math.cos((a * Math.PI) / 180) * r)
    const y = Math.round(cy + Math.sin((a * Math.PI) / 180) * r * (season === 'winter' ? 0.5 : 1) - (season === 'winter' ? 6 : 0))
    ctx.fillStyle = cols[i % cols.length]!
    ctx.fillRect(x, y, season === 'winter' ? 3 : 2, season === 'winter' ? 1 : 2)
  }
}

function drawRoofSnow(ctx: CanvasRenderingContext2D, b: Building, rx: number, ry: number, alpha: number): void {
  if (alpha <= 0.05) return
  const w = b.rect.w * TILE
  const body = (b.rect.h - 1) * TILE + ROOF_LIFT
  const ridge = Math.round(body * 0.36)
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(240,246,255,0.9)'
  ctx.fillRect(rx + 1, ry + 1, w - 2, ridge - 2)
  ctx.fillStyle = 'rgba(236,244,255,0.55)'
  ctx.fillRect(rx + 1, ry + ridge + 2, w - 2, Math.max(0, body - ridge - 6))
  ctx.fillStyle = 'rgba(250,252,255,0.95)'
  ctx.fillRect(rx, ry + body - 4, w, 2)
  for (let x = 3; x < w - 2; x += 7) ctx.fillRect(rx + x, ry + body - 2, 1, 2 + ((x * 13) % 3)) // icicles
  ctx.globalAlpha = 1
}

/** Ground layer: snow on the lawns, blossom or leaf litter, puddles in the rain. */
function drawGround(ctx: CanvasRenderingContext2D, season: Season, weather: Weather, time: number, v: View): void {
  const x0 = Math.max(0, Math.floor(v.camX / TILE))
  const y0 = Math.max(0, Math.floor(v.camY / TILE))
  const x1 = Math.ceil((v.camX + v.VW) / TILE)
  const y1 = Math.ceil((v.camY + v.VH) / TILE)
  const wet = weather === 'rain' || weather === 'storm'
  const still = prefersReducedMotion()
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const c = tileAt(tx, ty)
      const h = hashString(`g|${tx}|${ty}`)
      const px = tx * TILE - v.camX
      const py = ty * TILE - v.camY
      if (c === 'g' || c === 'y' || c === 'r') {
        if (season === 'winter') {
          ctx.fillStyle = 'rgba(236,244,255,0.55)'
          ctx.fillRect(px + (h % 9), py + ((h >>> 4) % 11), 5, 2)
          ctx.fillRect(px + ((h >>> 8) % 12), py + ((h >>> 12) % 13), 3, 1)
          if (weather === 'snow') ctx.fillRect(px + ((h >>> 16) % 10), py + ((h >>> 20) % 10), 6, 3)
        } else if (season === 'autumn' && h % 3 === 0) {
          ctx.fillStyle = AUTUMN[h % AUTUMN.length]!
          ctx.fillRect(px + (h % 13), py + ((h >>> 5) % 13), 2, 1)
        } else if (season === 'spring' && h % 5 === 0) {
          ctx.fillStyle = BLOSSOM[h % BLOSSOM.length]!
          ctx.fillRect(px + (h % 13), py + ((h >>> 5) % 13), 1, 1)
        }
      }
      if (wet && (c === 'c' || c === 'q' || c === 'r') && h % 7 === 0) {
        const shimmer = still ? 0.18 : 0.14 + 0.1 * Math.sin(time * 2 + (h % 17))
        ctx.fillStyle = `rgba(170,200,255,${shimmer.toFixed(3)})`
        ctx.fillRect(px + 3 + (h % 5), py + 6 + ((h >>> 3) % 5), 8, 3)
        ctx.fillRect(px + 5 + (h % 5), py + 5 + ((h >>> 3) % 5), 4, 1)
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The sky over everything
// ─────────────────────────────────────────────────────────────────────────────

const TINT: Record<Season, string | null> = {
  spring: 'rgba(255,220,235,0.05)',
  summer: 'rgba(255,220,150,0.06)',
  autumn: 'rgba(210,130,50,0.08)',
  winter: 'rgba(215,230,255,0.12)',
}

const WEATHER_WASH: Partial<Record<Weather, string>> = {
  cloudy: 'rgba(40,40,64,0.10)',
  rain: 'rgba(24,34,70,0.20)',
  storm: 'rgba(14,18,44,0.32)',
  fog: 'rgba(200,204,220,0.10)',
  snow: 'rgba(220,230,250,0.10)',
}

/** Fireflies drift around the garden and the courtyard trees on summer nights. */
const FIREFLY_HOMES: Pt[] = [
  [36, 49], [40, 47], [33, 51], [42, 52], [21, 29], [26, 31], [19, 31], [29, 45], [29, 51], [47, 46], [47, 52], [22, 39], [27, 39],
]

/**
 * Weather and light over the finished frame: the season's tint, the weather's wash,
 * lantern light after dark, rain / snow / fog / lightning, fireflies. `dark` is the
 * night overlay's strength (0..0.62).
 */
export function drawSky(
  ctx: CanvasRenderingContext2D,
  st: GameState,
  worldMs: number,
  time: number,
  v: View,
  dark: number,
  /** Screen rects with an open roof: rain, snow, fog and petals stay out of them. */
  shelters: readonly { x: number; y: number; w: number; h: number }[] = [],
): void {
  const season = seasonAt(worldMs)
  const weather = weatherAt(st.seed, worldMs)
  const still = prefersReducedMotion()
  const tt = still ? 0 : time
  const { VW, VH } = v
  const tint = TINT[season]
  if (tint) {
    ctx.fillStyle = tint
    ctx.fillRect(0, 0, VW, VH)
  }
  const wash = WEATHER_WASH[weather]
  if (wash) {
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, VW, VH)
  }

  // Lanterns along the roads glow after dusk.
  const lanterns = ESTATE_SPOTS.lanterns.slice(0, 3 * (st.estate?.decor?.lanterns ?? 0))
  if (dark > 0 && lanterns.length > 0) {
    ctx.globalCompositeOperation = 'lighter'
    for (const [lx, ly] of lanterns) {
      const cx = lx * TILE + 8 - v.camX
      const cy = ly * TILE - 4 - v.camY
      if (cx < -40 || cy < -40 || cx > VW + 40 || cy > VH + 40) continue
      const r = 34 * (1 + (still ? 0 : 0.05 * Math.sin(time * 7 + lx)))
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      g.addColorStop(0, `rgba(255,170,90,${(0.55 * dark).toFixed(3)})`)
      g.addColorStop(1, 'rgba(255,170,90,0)')
      ctx.fillStyle = g
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  // Fireflies: summer nights, near the garden and the trees.
  if (season === 'summer' && dark > 0.3 && weather !== 'rain' && weather !== 'storm') {
    FIREFLY_HOMES.forEach(([hx, hy], i) => {
      for (let k = 0; k < 2; k++) {
        const s = i * 2 + k
        const x = hx * TILE + 8 + Math.sin(tt * 0.7 + s * 1.9) * 18 - v.camX
        const y = hy * TILE + Math.cos(tt * 0.9 + s * 2.3) * 10 - v.camY
        if (x < 0 || y < 0 || x > VW || y > VH) continue
        const glow = still ? 0.8 : 0.5 + 0.5 * Math.sin(tt * 3 + s * 1.3)
        if (glow < 0.25) continue
        ctx.fillStyle = `rgba(210,255,120,${(glow * dark * 1.4).toFixed(3)})`
        ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1)
        ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 3)
      }
    })
  }

  // Weather falls outdoors only: clip out every building whose roof is open.
  const sheltered = shelters.length > 0
  if (sheltered) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, VW, VH)
    for (const s of shelters) ctx.rect(s.x, s.y, s.w, s.h)
    ctx.clip('evenodd')
  }

  // Precipitation (in screen space, anchored loosely to the camera so it doesn't slide).
  if (weather === 'rain' || weather === 'storm') {
    const n = weather === 'storm' ? 150 : 90
    ctx.fillStyle = weather === 'storm' ? 'rgba(190,205,255,0.55)' : 'rgba(170,190,240,0.45)'
    for (let i = 0; i < n; i++) {
      const h = (i * 2654435761) >>> 0
      const speed = 260 + (h % 120)
      const x = (((h >>> 3) % (VW + 40)) - (tt * 70) - v.camX * 0.3) % (VW + 40)
      const y = ((h >>> 11) % (VH + 40)) + tt * speed
      const px = Math.round(((x % (VW + 40)) + VW + 40) % (VW + 40)) - 20
      const py = Math.round(y % (VH + 40)) - 20
      ctx.fillRect(px, py, 1, 5)
      ctx.fillRect(px - 1, py + 5, 1, 2)
    }
    if (weather === 'storm' && !still) {
      // Lightning: a double flash every ten seconds or so, at seeded moments.
      const cycle = 9 + (hashString(`bolt|${Math.floor(time / 11)}`) % 5)
      const ph = time % cycle
      const a = ph < 0.08 ? 0.55 : ph > 0.18 && ph < 0.24 ? 0.35 : 0
      if (a > 0) {
        ctx.fillStyle = `rgba(235,240,255,${a})`
        ctx.fillRect(0, 0, VW, VH)
      }
    }
  } else if (weather === 'snow') {
    ctx.fillStyle = 'rgba(250,252,255,0.9)'
    for (let i = 0; i < 120; i++) {
      const h = (i * 2246822519) >>> 0
      const speed = 14 + (h % 18)
      const sway = still ? 0 : Math.sin(tt * 1.3 + i) * 6
      const x = (((h >>> 5) % (VW + 20)) + sway - v.camX * 0.2 + VW * 4) % (VW + 20)
      const y = (((h >>> 13) % (VH + 20)) + tt * speed) % (VH + 20)
      const s = h % 5 === 0 ? 2 : 1
      ctx.fillRect(Math.round(x) - 10, Math.round(y) - 10, s, s)
    }
  } else if (weather === 'fog') {
    for (let i = 0; i < 4; i++) {
      const y = ((i * 61 + tt * 4) % (VH + 60)) - 30
      const g = ctx.createLinearGradient(0, y - 22, 0, y + 22)
      g.addColorStop(0, 'rgba(210,214,228,0)')
      g.addColorStop(0.5, 'rgba(210,214,228,0.22)')
      g.addColorStop(1, 'rgba(210,214,228,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, y - 22, VW, 44)
    }
  }

  // Falling petals in spring, leaves in autumn (a light touch).
  if ((season === 'spring' || season === 'autumn') && weather !== 'storm' && !still) {
    const cols = season === 'spring' ? BLOSSOM : AUTUMN
    for (let i = 0; i < 18; i++) {
      const h = (i * 374761393) >>> 0
      const x = (((h >>> 4) % VW) + Math.sin(tt * 0.8 + i) * 14 + tt * 9 + VW * 8) % VW
      const y = (((h >>> 12) % (VH + 20)) + tt * (12 + (h % 10))) % (VH + 20)
      ctx.fillStyle = cols[i % cols.length]!
      ctx.fillRect(Math.round(x), Math.round(y) - 10, 2, 1)
    }
  }
  if (sheltered) ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// The HUD badge
// ─────────────────────────────────────────────────────────────────────────────

export const SEASON_ICON: Record<Season, string> = { spring: '🌸', summer: '☀', autumn: '🍂', winter: '❄' }
export const WEATHER_ICON: Record<Weather, string> = { clear: '☀', cloudy: '☁', rain: '🌧', storm: '⛈', fog: '🌫', snow: '🌨' }
const SEASON_NAME: Record<Season, string> = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' }
const WEATHER_NAME: Record<Weather, string> = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm', fog: 'Fog', snow: 'Snow' }

/** "🍂 Autumn · 🌧 Rain" for the HUD clock. */
export function skyLabel(st: GameState, worldMs: number, night: boolean): string {
  const season = seasonAt(worldMs)
  const weather = weatherAt(st.seed, worldMs)
  const wIcon = weather === 'clear' && night ? '☾' : WEATHER_ICON[weather]
  return `${SEASON_ICON[season]} ${t(SEASON_NAME[season])} · ${wIcon} ${t(WEATHER_NAME[weather])}`
}
