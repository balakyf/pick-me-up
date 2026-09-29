/**
 * Lobby furniture sprites. Each returns a bitmap plus its draw offset relative to
 * the prop's footprint origin (tall props rise above their footprint; wall-mounted
 * ones sit on the wall face). Animated props take a frame index.
 */
import {
  createBitmap,
  ellipse,
  hex,
  hline,
  line,
  outline,
  rect,
  roundRect,
  set,
  vline,
  type Bitmap,
} from './bitmap'
import { BONE, GOLD, INK, LINEN, STEEL, WOOD, ramp } from './palette'
import type { PropKind } from '../world/lobbyMap'

export interface PropSprite {
  bmp: Bitmap
  dx: number
  dy: number
}

/** How many animation frames each prop cycles through (1 = static). */
export const PROP_FRAMES: Record<PropKind, number> = {
  hearth: 3,
  table: 1,
  barrels: 1,
  warTable: 1,
  partyBoard: 1,
  weaponRack: 1,
  altar: 4,
  pillar: 1,
  cauldron: 3,
  shelves: 1,
  forge: 3,
  anvil: 1,
  portal: 4,
  summonCrystal: 4,
  lectern: 1,
  gate: 2,
  plant: 1,
  banner: 1,
  torch: 3,
  fairy: 4,
}

const STONE = ramp('#4a4452', '#6e6678', '#8e869a')
const FIRE = [hex('#8e1e12'), hex('#e8553b'), hex('#ffb040'), hex('#fff0a0')]
const BRASS = GOLD

function flame(b: Bitmap, cx: number, baseY: number, h: number, f: number) {
  const sway = [0, 1, -1][f % 3]!
  for (let i = 0; i < h; i++) {
    const w = Math.max(1, Math.round((h - i) * 0.55))
    const x = cx + Math.round((sway * i) / h) - Math.floor(w / 2)
    hline(b, x, baseY - i, w, FIRE[Math.min(3, Math.floor((i / h) * 3) + (i % 2))]!)
  }
  set(b, cx + sway, baseY - h, FIRE[3]!)
}

function hearth(f: number): PropSprite {
  const b = createBitmap(32, 32)
  rect(b, 1, 6, 30, 26, STONE.m)
  rect(b, 0, 2, 32, 5, STONE.d) // mantel
  hline(b, 0, 2, 32, STONE.l)
  for (let y = 9; y < 32; y += 4) {
    hline(b, 1, y, 30, STONE.d)
    for (let x = (y % 8) + 2; x < 31; x += 8) vline(b, x, y - 3, 3, STONE.d)
  }
  rect(b, 7, 14, 18, 18, hex('#140c10'))
  roundRect(b, 7, 12, 18, 4, hex('#140c10'))
  rect(b, 9, 29, 14, 3, WOOD.d) // logs
  flame(b, 12, 28, 9, f)
  flame(b, 19, 28, 11, f + 1)
  flame(b, 16, 28, 7, f + 2)
  ellipse(b, 11, 17, 10, 7, hex('#2a2430')) // pot
  hline(b, 12, 17, 8, hex('#4a4452'))
  // cups on the mantel
  rect(b, 4, 0, 3, 2, LINEN.l)
  rect(b, 25, 0, 3, 2, BRASS.m)
  return { bmp: outline(b, INK), dx: 0, dy: -16 }
}

function table(): PropSprite {
  const b = createBitmap(48, 24)
  rect(b, 1, 3, 46, 11, WOOD.m)
  hline(b, 1, 3, 46, WOOD.l)
  hline(b, 1, 13, 46, WOOD.d)
  for (const x of [3, 43]) rect(b, x, 14, 3, 9, WOOD.d)
  // food
  ellipse(b, 6, 4, 8, 5, LINEN.l) // plate
  ellipse(b, 8, 4, 5, 3, hex('#c8903a')) // bread
  rect(b, 20, 2, 3, 5, BRASS.m) // mug
  rect(b, 26, 2, 3, 5, BRASS.m)
  ellipse(b, 33, 4, 10, 6, LINEN.l)
  ellipse(b, 35, 5, 6, 3, hex('#b83a3a')) // apples
  return { bmp: outline(b, INK), dx: 0, dy: -6 }
}

function barrels(): PropSprite {
  const b = createBitmap(16, 24)
  roundRect(b, 1, 4, 14, 19, WOOD.m)
  vline(b, 3, 5, 17, WOOD.l)
  vline(b, 13, 5, 17, WOOD.d)
  hline(b, 1, 8, 14, STEEL.d)
  hline(b, 1, 18, 14, STEEL.d)
  ellipse(b, 2, 2, 12, 5, WOOD.l)
  ellipse(b, 4, 3, 8, 3, WOOD.d)
  return { bmp: outline(b, INK), dx: 0, dy: -8 }
}

function warTable(): PropSprite {
  const b = createBitmap(48, 32)
  rect(b, 0, 2, 48, 20, WOOD.d)
  rect(b, 3, 4, 42, 15, hex('#d8c490')) // parchment map
  // coastline & forest blobs
  ellipse(b, 6, 6, 14, 8, hex('#8ab070'))
  ellipse(b, 24, 9, 12, 8, hex('#7aa060'))
  ellipse(b, 34, 5, 9, 6, hex('#6aa0c8'))
  line(b, 8, 15, 40, 8, hex('#8e5a2a')) // road
  // the tower
  rect(b, 30, 10, 3, 7, hex('#4a4452'))
  set(b, 31, 9, hex('#e8553b'))
  // pins
  for (const [x, y] of [[10, 9], [19, 13], [37, 7]] as const) {
    set(b, x, y, hex('#e8553b'))
    set(b, x, y + 1, INK)
  }
  for (const x of [2, 43]) rect(b, x, 22, 3, 9, WOOD.d)
  return { bmp: outline(b, INK), dx: 0, dy: -4 }
}

function partyBoard(): PropSprite {
  const b = createBitmap(32, 16)
  rect(b, 1, 2, 30, 13, WOOD.m)
  rect(b, 3, 4, 26, 9, hex('#b08a58'))
  const cards = [hex('#e8e0c8'), hex('#e8e0c8'), hex('#e8e0c8'), hex('#e8e0c8'), hex('#e8e0c8')]
  cards.forEach((c, i) => {
    rect(b, 4 + i * 5, 5 + (i % 2), 4, 5, c)
    set(b, 5 + i * 5, 5 + (i % 2), hex('#e8553b'))
    rect(b, 5 + i * 5, 7 + (i % 2), 2, 2, hex('#7a6a5a'))
  })
  return { bmp: outline(b, INK), dx: 0, dy: 1 }
}

function weaponRack(): PropSprite {
  const b = createBitmap(16, 30)
  rect(b, 1, 6, 14, 2, WOOD.d)
  rect(b, 1, 24, 14, 3, WOOD.d)
  vline(b, 1, 6, 22, WOOD.m)
  vline(b, 14, 6, 22, WOOD.m)
  vline(b, 4, 1, 23, WOOD.l) // spear
  hline(b, 3, 1, 3, STEEL.l)
  set(b, 4, 0, STEEL.l)
  vline(b, 8, 3, 20, STEEL.l) // sword
  hline(b, 6, 18, 5, BRASS.m)
  vline(b, 11, 5, 18, WOOD.m) // axe
  rect(b, 11, 5, 3, 5, STEEL.m)
  return { bmp: outline(b, INK), dx: 0, dy: -14 }
}

function altar(f: number): PropSprite {
  const b = createBitmap(32, 44)
  // pedestal
  rect(b, 4, 28, 24, 16, hex('#d6d2e2'))
  rect(b, 2, 26, 28, 4, hex('#eeeaf6'))
  rect(b, 2, 40, 28, 4, hex('#b4aec8'))
  hline(b, 4, 33, 24, GOLD.m)
  vline(b, 15, 30, 10, GOLD.d)
  // floating promotion star-crystal
  const bob = [0, -1, -2, -1][f % 4]!
  const cy = 12 + bob
  for (let i = 0; i < 9; i++) {
    hline(b, 16 - i, cy - 8 + i, i * 2, i < 3 ? GOLD.l : GOLD.m)
    hline(b, 16 - i, cy + 8 - i, i * 2, GOLD.d)
  }
  vline(b, 16, cy - 7, 14, hex('#fff6d0'))
  // sparkles
  const sp = [[6, 6], [26, 10], [8, 20], [25, 22]] as const
  const [sx, sy] = sp[f % 4]!
  set(b, sx, sy + bob, hex('#fffbd0'))
  set(b, sx + 1, sy + bob, hex('#f5d86b'))
  return { bmp: outline(b, INK), dx: 0, dy: -28 }
}

function pillar(): PropSprite {
  const b = createBitmap(16, 44)
  rect(b, 1, 0, 14, 4, hex('#eeeaf6'))
  rect(b, 3, 4, 10, 34, hex('#d6d2e2'))
  vline(b, 5, 4, 34, hex('#b4aec8'))
  vline(b, 9, 4, 34, hex('#b4aec8'))
  vline(b, 12, 4, 34, hex('#9a94ae'))
  rect(b, 1, 38, 14, 6, hex('#b4aec8'))
  hline(b, 1, 38, 14, GOLD.m)
  return { bmp: outline(b, INK), dx: 0, dy: -28 }
}

function cauldron(f: number): PropSprite {
  const b = createBitmap(32, 30)
  // fire underneath
  flame(b, 10, 29, 4, f)
  flame(b, 21, 29, 5, f + 1)
  ellipse(b, 2, 8, 28, 20, hex('#2a2430'))
  ellipse(b, 5, 11, 8, 8, hex('#3e3648'))
  ellipse(b, 3, 5, 26, 8, hex('#1e1a24'))
  ellipse(b, 5, 6, 22, 6, hex('#4ec87a'))
  ellipse(b, 8, 6, 10, 3, hex('#8ef0a8'))
  // bubbles
  const bx = [10, 17, 22][f % 3]!
  ellipse(b, bx, 1 + (f % 2), 4, 4, hex('#8ef0a8'))
  set(b, bx + 1, 2 + (f % 2), hex('#e0ffe8'))
  return { bmp: outline(b, INK), dx: 0, dy: -14 }
}

function shelves(): PropSprite {
  const b = createBitmap(32, 32)
  rect(b, 0, 0, 32, 32, WOOD.d)
  rect(b, 2, 2, 28, 28, hex('#2a1a12'))
  for (const y of [10, 20, 29]) hline(b, 1, y, 30, WOOD.m)
  const colors = ['#4ec87a', '#e8553b', '#7a5ad0', '#3f8fe0', '#f5d86b', '#e08ac8'].map(hex)
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 5; i++) {
      const c = colors[(i * 3 + row * 2) % colors.length]!
      const x = 3 + i * 6
      const y = 3 + row * 10
      rect(b, x, y + 2, 4, 5, c)
      rect(b, x + 1, y, 2, 2, LINEN.l)
      set(b, x, y + 3, hex('#ffffffaa'))
    }
  }
  return { bmp: outline(b, INK), dx: 0, dy: -16 }
}

function forge(f: number): PropSprite {
  const b = createBitmap(32, 32)
  rect(b, 10, 0, 12, 8, STONE.d) // chimney
  rect(b, 1, 6, 30, 26, STONE.m)
  hline(b, 1, 6, 30, STONE.l)
  for (let y = 10; y < 32; y += 5) hline(b, 1, y, 30, STONE.d)
  roundRect(b, 7, 14, 18, 12, hex('#3a0c08'))
  const glow = [hex('#e8553b'), hex('#ff8a3a'), hex('#ffb040')][f % 3]!
  rect(b, 9, 18, 14, 8, glow)
  rect(b, 11, 20, 10, 5, FIRE[3]!)
  for (let i = 0; i < 4; i++) set(b, 10 + ((i * 5 + f * 3) % 12), 16 + (i % 2), FIRE[2]!)
  return { bmp: outline(b, INK), dx: 0, dy: -16 }
}

function anvil(): PropSprite {
  const b = createBitmap(16, 16)
  rect(b, 1, 3, 14, 4, STEEL.m)
  hline(b, 1, 3, 14, STEEL.l)
  rect(b, 0, 4, 2, 2, STEEL.m) // horn
  rect(b, 5, 7, 6, 4, STEEL.d)
  rect(b, 3, 11, 10, 4, WOOD.d)
  rect(b, 11, 0, 2, 4, WOOD.m) // hammer handle
  rect(b, 9, 0, 6, 2, STEEL.d)
  return { bmp: outline(b, INK), dx: 0, dy: 0 }
}

function portal(f: number): PropSprite {
  const b = createBitmap(32, 46)
  // swirl
  const cols = [hex('#1a3a5a'), hex('#2e6a8e'), hex('#6ab4c8'), hex('#9a5ad0')]
  for (let y = 6; y < 44; y++) {
    for (let x = 5; x < 27; x++) {
      const dx = (x - 16) / 11
      const dy = (y - 25) / 19
      const d = dx * dx + dy * dy
      if (d > 1) continue
      const a = Math.atan2(dy, dx)
      const k = Math.floor((a * 3 + Math.sqrt(d) * 8 - f * 1.3 + 20) % 4)
      set(b, x, y, cols[(k + 4) % 4]!)
    }
  }
  // stone arch
  for (let y = 4; y < 46; y++) {
    const dy = (y - 25) / 21
    const w = Math.round(Math.sqrt(Math.max(0, 1 - dy * dy)) * 14)
    if (y < 25) {
      set(b, 16 - w - 1, y, STONE.m)
      set(b, 16 - w - 2, y, STONE.d)
      set(b, 16 + w, y, STONE.m)
      set(b, 16 + w + 1, y, STONE.d)
    }
  }
  rect(b, 0, 25, 4, 21, STONE.m)
  rect(b, 28, 25, 4, 21, STONE.d)
  hline(b, 0, 25, 4, STONE.l)
  hline(b, 28, 25, 4, STONE.l)
  set(b, 16, 3, hex('#6ab4c8'))
  return { bmp: outline(b, INK), dx: 0, dy: -30 }
}

function summonCrystal(f: number): PropSprite {
  const b = createBitmap(32, 44)
  // pedestal
  rect(b, 8, 32, 16, 12, STONE.m)
  rect(b, 6, 30, 20, 3, STONE.l)
  rect(b, 6, 41, 20, 3, STONE.d)
  hline(b, 8, 36, 16, GOLD.m)
  // Mobius crystal
  const bob = [0, -1, -2, -1][f % 4]!
  const cy = 14 + bob
  const vio = ramp('#3a1a6e', '#7a4ad0', '#c8a8ff')
  for (let i = 0; i < 12; i++) {
    const w = i < 4 ? i * 2 + 2 : Math.max(2, 12 - (i - 4) * 1.4)
    hline(b, 16 - Math.round(w / 2), cy - 10 + i * 2, Math.round(w), i < 3 ? vio.l : vio.m)
    hline(b, 16 - Math.round(w / 2), cy - 9 + i * 2, Math.round(w), vio.m)
  }
  vline(b, 14, cy - 8, 16, vio.l)
  vline(b, 18, cy - 6, 14, vio.d)
  // orbiting sparks
  const ang = (f / 4) * Math.PI * 2
  set(b, 16 + Math.round(Math.cos(ang) * 13), cy + Math.round(Math.sin(ang) * 4), hex('#7ae0ff'))
  set(b, 16 + Math.round(Math.cos(ang + Math.PI) * 13), cy + Math.round(Math.sin(ang + Math.PI) * 4), hex('#fff6e0'))
  return { bmp: outline(b, INK), dx: 0, dy: -28 }
}

function lectern(): PropSprite {
  const b = createBitmap(16, 26)
  rect(b, 6, 10, 4, 14, WOOD.m)
  rect(b, 3, 23, 10, 3, WOOD.d)
  // open book on a slanted top
  rect(b, 0, 4, 16, 7, WOOD.d)
  rect(b, 1, 2, 7, 6, LINEN.l)
  rect(b, 8, 2, 7, 6, hex('#fff6e0'))
  vline(b, 8, 2, 6, LINEN.d)
  for (const y of [4, 6]) {
    hline(b, 2, y, 5, LINEN.d)
    hline(b, 9, y, 5, LINEN.d)
  }
  vline(b, 12, 1, 5, hex('#b82a3a')) // ribbon
  return { bmp: outline(b, INK), dx: 0, dy: -10 }
}

function gate(f: number): PropSprite {
  const b = createBitmap(16, 32)
  rect(b, 0, 0, 16, 32, STONE.d)
  rect(b, 2, 4, 12, 28, WOOD.d)
  roundRect(b, 2, 2, 12, 6, WOOD.d)
  for (const x of [5, 8, 11]) vline(b, x, 4, 28, WOOD.m)
  hline(b, 2, 12, 12, STEEL.d)
  hline(b, 2, 24, 12, STEEL.d)
  set(b, 4, 18, BRASS.m)
  // glowing tower rune above the door
  const rune = f % 2 ? hex('#7ae0ff') : hex('#c8a8ff')
  set(b, 8, 1, rune)
  set(b, 7, 2, rune)
  set(b, 9, 2, rune)
  return { bmp: outline(b, INK), dx: 0, dy: 0 }
}

function plant(): PropSprite {
  const b = createBitmap(16, 26)
  const leaf = ramp('#1e5a2e', '#3a8a4a', '#6ac070')
  ellipse(b, 1, 0, 14, 14, leaf.m)
  ellipse(b, 3, 2, 6, 5, leaf.l)
  ellipse(b, 8, 7, 6, 6, leaf.d)
  rect(b, 3, 14, 10, 10, hex('#a8583a'))
  hline(b, 2, 14, 12, hex('#c8704a'))
  vline(b, 11, 15, 9, hex('#7a3a24'))
  return { bmp: outline(b, INK), dx: 0, dy: -10 }
}

function banner(): PropSprite {
  const b = createBitmap(16, 20)
  hline(b, 1, 3, 14, BRASS.d)
  rect(b, 3, 4, 10, 13, hex('#6a1424'))
  set(b, 3, 17, hex('#6a1424'))
  set(b, 12, 17, hex('#6a1424'))
  rect(b, 4, 17, 3, 1, hex('#6a1424'))
  rect(b, 9, 17, 3, 1, hex('#6a1424'))
  // Mobius ∞ emblem
  ellipse(b, 4, 8, 4, 4, GOLD.m)
  ellipse(b, 8, 8, 4, 4, GOLD.m)
  set(b, 5, 9, hex('#6a1424'))
  set(b, 10, 9, hex('#6a1424'))
  return { bmp: outline(b, INK), dx: 0, dy: 0 }
}

function torch(f: number): PropSprite {
  const b = createBitmap(16, 16)
  rect(b, 6, 9, 4, 5, BRASS.d)
  hline(b, 5, 9, 6, BRASS.m)
  flame(b, 8, 8, 6, f)
  return { bmp: outline(b, INK), dx: 0, dy: 0 }
}

function fairy(f: number): PropSprite {
  const b = createBitmap(16, 18)
  const bob = [0, -1, -1, 0][f % 4]!
  const wing = f % 2 ? hex('#c8f0ffcc') : hex('#e8fbffcc')
  // wings
  ellipse(b, 1, 3 + bob, 6, 7, wing)
  ellipse(b, 9, 3 + bob, 6, 7, wing)
  // body
  ellipse(b, 5, 3 + bob, 6, 6, hex('#ffe0c8'))
  rect(b, 5, 2 + bob, 6, 2, hex('#7ae0ff')) // hair
  set(b, 6, 6 + bob, INK)
  set(b, 9, 6 + bob, INK)
  roundRect(b, 6, 9 + bob, 4, 5, hex('#8ae0c8'))
  set(b, 8, 16, hex('#fff6a0'))
  set(b, 7 + (f % 3), 17, BONE.l)
  // hovers above head height so she reads even with the Master in front
  return { bmp: outline(b, INK), dx: 0, dy: -18 }
}

const DRAW: Record<PropKind, (f: number) => PropSprite> = {
  hearth,
  table,
  barrels,
  warTable,
  partyBoard,
  weaponRack,
  altar,
  pillar,
  cauldron,
  shelves,
  forge,
  anvil,
  portal,
  summonCrystal,
  lectern,
  gate,
  plant,
  banner,
  torch,
  fairy,
}

export function drawProp(kind: PropKind, frame = 0): PropSprite {
  return DRAW[kind](frame % PROP_FRAMES[kind])
}

/** Tiny speech/emote bubble shown above a hero's head. */
export function drawEmote(kind: 'dots' | 'bang' | 'heart' | 'zz'): Bitmap {
  const b = createBitmap(11, 11)
  roundRect(b, 0, 0, 11, 8, hex('#fff6e0'))
  set(b, 4, 8, hex('#fff6e0'))
  set(b, 5, 9, hex('#fff6e0'))
  switch (kind) {
    case 'dots':
      for (const x of [2, 5, 8]) set(b, x, 4, INK)
      break
    case 'bang':
      vline(b, 5, 1, 4, hex('#d0302a'))
      set(b, 5, 6, hex('#d0302a'))
      break
    case 'heart':
      rect(b, 3, 2, 2, 2, hex('#e0405a'))
      rect(b, 6, 2, 2, 2, hex('#e0405a'))
      rect(b, 3, 4, 5, 1, hex('#e0405a'))
      rect(b, 4, 5, 3, 1, hex('#e0405a'))
      set(b, 5, 6, hex('#e0405a'))
      break
    case 'zz':
      hline(b, 2, 2, 3, hex('#3a4ab8'))
      set(b, 3, 3, hex('#3a4ab8'))
      hline(b, 2, 4, 3, hex('#3a4ab8'))
      hline(b, 6, 4, 3, hex('#3a4ab8'))
      set(b, 7, 5, hex('#3a4ab8'))
      hline(b, 6, 6, 3, hex('#3a4ab8'))
      break
  }
  return outline(b, INK)
}
