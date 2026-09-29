/**
 * Lobby floor & wall tiles, pre-rendered into one base-layer bitmap.
 * Each tile varies by a hash of its coordinates so floors never look stamped.
 */
import { createBitmap, hex, hline, mix, rect, set, vline, type Bitmap, type RGBA } from './bitmap'
import { hashString, seededRand } from './rand'
import { MAP_H, MAP_W, TILE, isWallChar, tileAt, type TileChar } from '../world/lobbyMap'

const C = {
  plankD: hex('#4e2e1c'),
  plankM: hex('#7a4a2c'),
  plankL: hex('#946038'),
  carpetD: hex('#4e0e1c'),
  carpetM: hex('#7a1a2a'),
  carpetL: hex('#9a2a3a'),
  carpetGold: hex('#c8962a'),
  terraA: hex('#a8583a'),
  terraB: hex('#8e4630'),
  terraGrout: hex('#5e2e1e'),
  flagM: hex('#46506a'),
  flagL: hex('#56627e'),
  flagGrout: hex('#262a3a'),
  marble: hex('#d6d2e2'),
  marbleVein: hex('#b4aec8'),
  marbleGold: hex('#c8a24a'),
  synthM: hex('#34264a'),
  synthL: hex('#44325e'),
  rune: hex('#6ef0a0'),
  slateM: hex('#393236'),
  slateL: hex('#48404a'),
  ember: hex('#e8703a'),
  dailyM: hex('#264654'),
  dailyL: hex('#305a6a'),
  mist: hex('#6ab4c8'),
  sandM: hex('#b8966a'),
  sandL: hex('#cca87a'),
  sandD: hex('#9a7a52'),
  wallTop: hex('#241c30'),
  wallTopL: hex('#342a44'),
  brickM: hex('#5a4a5e'),
  brickL: hex('#6e5c72'),
  brickD: hex('#3e3244'),
  ledge: hex('#8a7a8e'),
  shade: hex('#00000055'),
}

function tileRand(x: number, y: number) {
  return seededRand(hashString(`tile|${x}|${y}`))
}

function blend(dst: Bitmap, x: number, y: number, c: RGBA, a: number) {
  const i = y * dst.w + x
  if (x < 0 || y < 0 || x >= dst.w || y >= dst.h) return
  dst.px[i] = mix(dst.px[i]!, c, a)
}

function floorTile(b: Bitmap, ch: TileChar, tx: number, ty: number) {
  const ox = tx * TILE
  const oy = ty * TILE
  const r = tileRand(tx, ty)
  switch (ch) {
    case '.': {
      for (let row = 0; row < 4; row++) {
        const y0 = oy + row * 4
        rect(b, ox, y0, TILE, 4, r.chance(0.3) ? C.plankL : C.plankM)
        hline(b, ox, y0 + 3, TILE, C.plankD)
        const seam = (tx * 5 + row * 7 + ty * 3) % 16
        vline(b, ox + seam, y0, 3, C.plankD)
        if (r.chance(0.25)) set(b, ox + r.int(1, 14), y0 + 1, C.plankD)
      }
      break
    }
    case '~': {
      rect(b, ox, oy, TILE, TILE, C.carpetM)
      const border = (dx: number, dy: number) => tileAt(tx + dx, ty + dy) !== '~'
      if (border(0, -1)) { hline(b, ox, oy + 1, TILE, C.carpetGold); hline(b, ox, oy, TILE, C.carpetD) }
      if (border(0, 1)) { hline(b, ox, oy + 14, TILE, C.carpetGold); hline(b, ox, oy + 15, TILE, C.carpetD) }
      if (border(-1, 0)) { vline(b, ox + 1, oy, TILE, C.carpetGold); vline(b, ox, oy, TILE, C.carpetD) }
      if (border(1, 0)) { vline(b, ox + 14, oy, TILE, C.carpetGold); vline(b, ox + 15, oy, TILE, C.carpetD) }
      // diamond motif
      for (let i = 0; i < 4; i++) {
        set(b, ox + 8 - i, oy + 4 + i, C.carpetL)
        set(b, ox + 7 + i, oy + 4 + i, C.carpetL)
        set(b, ox + 8 - i, oy + 11 - i, C.carpetL)
        set(b, ox + 7 + i, oy + 11 - i, C.carpetL)
      }
      break
    }
    case 'k':
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          rect(b, ox + i * 8, oy + j * 8, 8, 8, (i + j + tx + ty) % 2 ? C.terraA : C.terraB)
          hline(b, ox + i * 8, oy + j * 8 + 7, 8, C.terraGrout)
          vline(b, ox + i * 8 + 7, oy + j * 8, 8, C.terraGrout)
        }
      break
    case 't': {
      rect(b, ox, oy, TILE, TILE, C.flagM)
      const split = r.int(5, 10)
      hline(b, ox, oy + 15, TILE, C.flagGrout)
      vline(b, ox + 15, oy, TILE, C.flagGrout)
      hline(b, ox, oy + split, TILE, C.flagGrout)
      vline(b, ox + r.int(4, 11), oy, split, C.flagGrout)
      rect(b, ox + 1, oy + 1, 3, 1, C.flagL)
      break
    }
    case 'p': {
      rect(b, ox, oy, TILE, TILE, C.marble)
      hline(b, ox, oy + 15, TILE, C.marbleGold)
      vline(b, ox + 15, oy, TILE, C.marbleGold)
      let vx = ox + r.int(0, 12)
      for (let y = 0; y < 14; y++) {
        vx += r.int(-1, 1)
        if (r.chance(0.7)) set(b, Math.max(ox, Math.min(ox + 14, vx)), oy + y, C.marbleVein)
      }
      break
    }
    case 'm':
      rect(b, ox, oy, TILE, TILE, C.synthM)
      hline(b, ox, oy + 7, TILE, C.wallTop)
      vline(b, ox + ((ty % 2) * 8 + 3), oy, 7, C.wallTop)
      vline(b, ox + ((ty % 2) * 8 + 11) % 16, oy + 8, 8, C.wallTop)
      rect(b, ox + 1, oy + 1, 2, 1, C.synthL)
      if (r.chance(0.18)) {
        const rx = ox + r.int(3, 11)
        const ry = oy + r.int(2, 11)
        set(b, rx, ry, C.rune)
        set(b, rx + 1, ry + 1, C.rune)
        set(b, rx - 1, ry + 1, C.rune)
      }
      break
    case 'a':
      rect(b, ox, oy, TILE, TILE, C.slateM)
      for (let i = 0; i < 6; i++) set(b, ox + r.int(0, 15), oy + r.int(0, 15), C.slateL)
      if (r.chance(0.15)) set(b, ox + r.int(2, 13), oy + r.int(2, 13), C.ember)
      hline(b, ox, oy + 15, TILE, C.wallTop)
      break
    case 'd':
      rect(b, ox, oy, TILE, TILE, C.dailyM)
      hline(b, ox, oy + 15, TILE, C.wallTop)
      vline(b, ox + 15, oy, TILE, C.wallTop)
      rect(b, ox + 2, oy + 2, 4, 1, C.dailyL)
      for (let i = 0; i < 3; i++) if (r.chance(0.5)) set(b, ox + r.int(0, 15), oy + r.int(0, 15), C.mist)
      break
    case 'r':
      // raked training sand: soft stripes + pebbles
      rect(b, ox, oy, TILE, TILE, C.sandM)
      for (let y = 1; y < TILE; y += 4) hline(b, ox, oy + y, TILE, (tx + ty) % 2 ? C.sandL : C.sandD)
      for (let i = 0; i < 3; i++) set(b, ox + r.int(0, 15), oy + r.int(0, 15), C.sandD)
      if (r.chance(0.2)) set(b, ox + r.int(2, 13), oy + r.int(2, 13), C.sandL)
      break
    default:
      break
  }
}

function wallTile(b: Bitmap, tx: number, ty: number) {
  const ox = tx * TILE
  const oy = ty * TILE
  const below = tileAt(tx, ty + 1)
  const face = !isWallChar(below)
  if (face) {
    // Brick face seen from the room below.
    rect(b, ox, oy, TILE, TILE, C.brickM)
    rect(b, ox, oy, TILE, 3, C.wallTop)
    hline(b, ox, oy + 3, TILE, C.ledge)
    for (let row = 0; row < 3; row++) {
      const y0 = oy + 4 + row * 4
      hline(b, ox, y0 + 3, TILE, C.brickD)
      const off = (row + ty) % 2 ? 0 : 4
      vline(b, ox + off, y0, 3, C.brickD)
      vline(b, ox + off + 8, y0, 3, C.brickD)
      set(b, ox + off + 1, y0, C.brickL)
      set(b, ox + off + 9, y0, C.brickL)
    }
    return
  }
  rect(b, ox, oy, TILE, TILE, C.wallTop)
  const r = tileRand(tx, ty)
  for (let i = 0; i < 3; i++) set(b, ox + r.int(1, 14), oy + r.int(1, 14), C.wallTopL)
  // rim highlight where the wall top meets a floor
  if (!isWallChar(tileAt(tx - 1, ty))) vline(b, ox, oy, TILE, C.wallTopL)
  if (!isWallChar(tileAt(tx + 1, ty))) vline(b, ox + 15, oy, TILE, C.wallTopL)
  if (!isWallChar(tileAt(tx, ty - 1))) hline(b, ox, oy, TILE, C.wallTopL)
}

/** The whole lobby floor/wall layer (props and characters draw on top). */
export function renderLobbyBase(): Bitmap {
  const b = createBitmap(MAP_W * TILE, MAP_H * TILE)
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const ch = tileAt(tx, ty)
      if (isWallChar(ch)) wallTile(b, tx, ty)
      else floorTile(b, ch, tx, ty)
    }
  }
  // Ambient occlusion: floors right under a wall face get a soft top shadow,
  // floors beside a wall a thin side shadow.
  const shadow = hex('#0c0814')
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (isWallChar(tileAt(tx, ty))) continue
      const ox = tx * TILE
      const oy = ty * TILE
      if (isWallChar(tileAt(tx, ty - 1))) {
        for (let x = 0; x < TILE; x++) {
          blend(b, ox + x, oy, shadow, 0.55)
          blend(b, ox + x, oy + 1, shadow, 0.35)
          blend(b, ox + x, oy + 2, shadow, 0.15)
        }
      }
      if (isWallChar(tileAt(tx - 1, ty))) for (let y = 0; y < TILE; y++) blend(b, ox, oy + y, shadow, 0.35)
      if (isWallChar(tileAt(tx + 1, ty))) for (let y = 0; y < TILE; y++) blend(b, ox + 15, oy + y, shadow, 0.35)
    }
  }
  return b
}

/** Circular magic sigil laid over the hall carpet (animated by the renderer). */
export function drawSummonCircle(phase: number): Bitmap {
  const S = 72
  const b = createBitmap(S, S)
  const gold = hex('#e8c060')
  const cyan = hex('#7ae0ff')
  const c = (S - 1) / 2
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - c, y - c)
      const a = Math.atan2(y - c, x - c)
      if (Math.abs(d - 34) < 0.6 || Math.abs(d - 30) < 0.5) set(b, x, y, gold)
      else if (Math.abs(d - 22) < 0.5) set(b, x, y, cyan)
      else if (d < 30 && d > 22) {
        // rotating rune ticks
        const k = ((a + Math.PI) / (2 * Math.PI)) * 24 + phase
        if (Math.abs(k - Math.round(k)) < 0.08) set(b, x, y, gold)
      }
    }
  }
  // hexagram
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + phase * 0.05
    const a1 = ((i + 2) / 6) * Math.PI * 2 + phase * 0.05
    const x0 = c + Math.cos(a0) * 22
    const y0 = c + Math.sin(a0) * 22
    const x1 = c + Math.cos(a1) * 22
    const y1 = c + Math.sin(a1) * 22
    const steps = 40
    for (let s = 0; s <= steps; s++) set(b, x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps, cyan)
  }
  return b
}
