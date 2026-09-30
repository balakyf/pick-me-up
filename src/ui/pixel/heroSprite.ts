/**
 * Procedural 16-bit hero sprites.
 *
 *   drawHeroFrame(look, dir, frame) → 24×32 walk frame (down/up/left/right × 3)
 *   drawHeroBust(look)              → 32×32 dialog / card portrait
 *
 * Everything is hand-placed pixel geometry parameterised by a HeroLook, then run
 * through the universal outline pass. Pure: same look ⇒ identical pixels.
 *
 * Class kits read at a glance (plate + pauldrons + greaves; mail + tabard; leather
 * jerkin + quiver; robe + high collar; mask + scarf), and star regalia stack on top
 * (sash → cape → trim + gem → aura). A 7★ aura's sparkles move with the walk frame,
 * so it twinkles wherever the hero walks.
 */
import {
  CLEAR,
  clone,
  createBitmap,
  ellipse,
  get,
  flipX,
  hline,
  line,
  mix,
  outline,
  rect,
  roundRect,
  set,
  vline,
  hex,
  withAlpha,
  type Bitmap,
  type RGBA,
} from './bitmap'
import { GOLD, INK, LEATHER, LINEN, WHITE, WOOD, type Ramp } from './palette'
import type { HeroLook } from './look'

export type Dir = 'down' | 'up' | 'left' | 'right'
export type WalkFrame = 0 | 1 | 2

export const FRAME_W = 24
export const FRAME_H = 32
export const BUST = 32

const BOOT: Ramp = { d: hex('#2a1a14'), m: LEATHER.d, l: LEATHER.m }
const SCLERA: RGBA = hex('#fff6e0')

function blush(skin: Ramp): RGBA {
  return mix(skin.m, hex('#e0505a'), 0.35)
}

// ─────────────────────────────────────────────────────────────────────────────
// Walk frames
// ─────────────────────────────────────────────────────────────────────────────

export function drawHeroFrame(L: HeroLook, dir: Dir, frame: WalkFrame): Bitmap {
  if (dir === 'right') return flipX(drawHeroFrame(L, 'left', frame))
  const b = createBitmap(FRAME_W, FRAME_H)
  if (dir === 'down') drawFront(b, L, frame)
  else if (dir === 'up') drawBack(b, L, frame)
  else drawSide(b, L, frame)
  return applyAura(outline(b, INK), L, frame)
}

// ── star regalia ─────────────────────────────────────────────────────────────

/** 6★ wear a pale-gold halo; 7★ glow in their element's own light. */
function auraColor(L: HeroLook): RGBA {
  return L.aura === 2 ? L.accent.l : GOLD.l
}

/** One translucent ring around everything opaque (4-neighbourhood, like the ink pass). */
function glowRing(b: Bitmap, c: RGBA): Bitmap {
  const out = clone(b)
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (get(b, x, y) !== CLEAR) continue
      if (get(b, x - 1, y) || get(b, x + 1, y) || get(b, x, y - 1) || get(b, x, y + 1)) out.px[y * b.w + x] = c
    }
  }
  return out
}

/** Sparkle anchors as fractions of the bitmap; each walk frame lights a different third. */
const SPARKLES: [number, number][] = [
  [0.1, 0.18], [0.88, 0.1], [0.08, 0.66], [0.9, 0.5], [0.14, 0.38], [0.86, 0.82],
]

/**
 * 6★: a faint outline aura. 7★: a stronger double ring plus 4-point sparkles whose
 * positions depend on `phase` (the walk frame), so the glow shimmers as they move.
 * Sparkles only land on empty/aura pixels — never over the hero.
 */
export function applyAura(b: Bitmap, L: HeroLook, phase: number): Bitmap {
  if (!L.aura) return b
  const c = auraColor(L)
  let o = glowRing(b, withAlpha(c, L.aura === 2 ? 0xb4 : 0x6c))
  if (L.aura === 1) return o
  o = glowRing(o, withAlpha(c, 0x46))
  SPARKLES.forEach(([fx, fy], i) => {
    if (i % 3 !== phase % 3) return
    const x = Math.round(fx * (b.w - 1))
    const y = Math.round(fy * (b.h - 1))
    const put = (px: number, py: number, col: RGBA) => {
      if (get(b, px, py) === CLEAR) set(o, px, py, col)
    }
    put(x, y, WHITE)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) put(x + dx, y + dy, withAlpha(c, 0xd0))
  })
  return o
}

/** 3★+: a waist sash in the element colour, knotted at one hip with a hanging tail. */
function waistSash(b: Bitmap, L: HeroLook, y: number, front: boolean) {
  hline(b, 8, y, 8, L.accent.m)
  if (front) {
    set(b, 14, y, L.accent.l)
    vline(b, 14, y + 1, 3, L.accent.d)
    vline(b, 15, y + 1, 2, L.accent.m)
  } else {
    vline(b, 9, y + 1, 3, L.accent.d)
    vline(b, 8, y + 1, 2, L.accent.m)
  }
}

/** Where each outfit's belt line sits (the sash replaces it). Robes carry their own sash. */
function beltY(L: HeroLook): number | null {
  switch (L.outfit) {
    case 'peasant':
      return 21
    case 'merc':
    case 'thief':
      return 23
    case 'mage':
    case 'master':
      return null
    default:
      return 22
  }
}

/** 5★+: a gem brooch at the breast, set in gold. */
function gemFront(b: Bitmap, L: HeroLook, x: number, y: number) {
  set(b, x, y, L.accent.l)
  set(b, x + 1, y, L.accent.m)
  set(b, x, y + 1, L.accent.m)
  set(b, x + 1, y + 1, L.accent.d)
  set(b, x - 1, y, GOLD.m)
  set(b, x + 2, y + 1, GOLD.d)
}

// ── shared bits ──────────────────────────────────────────────────────────────

function legsFrontBack(b: Bitmap, L: HeroLook, frame: WalkFrame) {
  const lUp = frame === 1 ? 1 : 0
  const rUp = frame === 2 ? 1 : 0
  const pants = L.cloth2
  rect(b, 9, 24, 2, 4 - lUp, pants.m)
  set(b, 10, 24, pants.d)
  rect(b, 13, 24, 2, 4 - rUp, pants.m)
  set(b, 14, 24, pants.d)
  rect(b, 8, 28 - lUp, 3, 2, BOOT.m)
  set(b, 8, 28 - lUp, BOOT.l)
  rect(b, 13, 28 - rUp, 3, 2, BOOT.m)
  set(b, 15, 28 - rUp, BOOT.l)
  if (L.outfit === 'warrior') {
    // steel greaves over the shins, sabatons on the boots
    const m = L.metal
    rect(b, 9, 26, 2, 2 - lUp, m.m)
    set(b, 9, 26, m.l)
    rect(b, 13, 26, 2, 2 - rUp, m.m)
    set(b, 13, 26, m.l)
    hline(b, 8, 28 - lUp, 3, m.d)
    hline(b, 13, 28 - rUp, 3, m.d)
  }
}

/** Torso for down/up views. `front` adds belt buckles, aprons, lapels… */
function torsoFront(b: Bitmap, L: HeroLook, front: boolean) {
  const c = L.cloth
  switch (L.outfit) {
    case 'mage': {
      for (let y = 16; y <= 28; y++) {
        const grow = Math.floor((y - 16) / 4)
        hline(b, 8 - grow, y, 8 + grow * 2, c.m)
        set(b, 15 + grow, y, c.d)
        set(b, 8 - grow, y, c.l)
      }
      hline(b, 8, 21, 8, L.accent.d) // sash
      if (front) vline(b, 11, 22, 7, L.accent.m)
      if (L.trim || front) hline(b, 5, 28, 14, L.trim ? GOLD.m : L.accent.m)
      return
    }
    case 'master': {
      rect(b, 8, 16, 8, 11, c.m)
      vline(b, 15, 16, 11, c.d)
      vline(b, 8, 16, 11, c.l)
      if (front) {
        vline(b, 11, 16, 11, c.d)
        set(b, 12, 18, GOLD.m)
        set(b, 12, 20, GOLD.m)
        set(b, 12, 22, GOLD.m)
        rect(b, 10, 16, 4, 1, WHITE) // cravat
      }
      hline(b, 8, 26, 8, GOLD.d)
      return
    }
    case 'peasant': {
      rect(b, 8, 16, 8, 10, c.m)
      vline(b, 15, 16, 10, c.d)
      vline(b, 8, 16, 10, c.l)
      hline(b, 8, 21, 8, LINEN.d) // rope belt
      if (front && L.apron) {
        rect(b, 10, 19, 4, 7, LINEN.l)
        vline(b, 13, 19, 7, LINEN.m)
      }
      return
    }
    case 'merc': {
      rect(b, 8, 16, 8, 8, LEATHER.m)
      vline(b, 15, 16, 8, LEATHER.d)
      if (front) {
        rect(b, 11, 16, 2, 6, c.m)
        line(b, 8, 16, 15, 23, LEATHER.d)
      }
      hline(b, 8, 23, 8, BOOT.m)
      return
    }
    case 'warrior': {
      rect(b, 8, 16, 8, 7, L.metal.m)
      vline(b, 15, 16, 7, L.metal.d)
      rect(b, 9, 17, 2, 2, L.metal.l)
      hline(b, 8, 20, 8, L.metal.d) // the breastplate's lower lame
      hline(b, 9, 16, 6, L.metal.l) // gorget rim
      if (front) {
        rect(b, 11, 18, 2, 5, c.m) // tabard
        set(b, 11, 19, L.accent.m)
        set(b, 12, 19, L.accent.m)
      }
      rect(b, 8, 23, 8, 2, c.d) // skirt
      set(b, 10, 24, c.m)
      set(b, 13, 24, c.m)
      return
    }
    case 'spearman': {
      // light mail (a steel checker) under a long cloth tabard, belted
      for (let y = 16; y <= 23; y++) for (let x = 8; x <= 15; x++) set(b, x, y, (x + y) % 2 ? L.metal.m : L.metal.d)
      rect(b, 10, 16, 4, 10, c.m)
      vline(b, 10, 16, 10, c.l)
      vline(b, 13, 16, 10, c.d)
      if (front) {
        set(b, 11, 18, L.accent.l)
        set(b, 12, 18, L.accent.m)
        set(b, 11, 19, L.accent.m)
        set(b, 12, 19, L.accent.d)
      }
      hline(b, 8, 22, 8, LEATHER.d)
      return
    }
    case 'thief': {
      rect(b, 8, 16, 8, 8, c.m)
      vline(b, 15, 16, 8, c.d)
      hline(b, 8, 23, 8, LEATHER.d)
      rect(b, 8, 16, 8, 2, L.accent.m) // scarf
      if (front) {
        rect(b, 14, 18, 2, 3, L.accent.d)
        line(b, 8, 18, 13, 23, LEATHER.d) // blade harness
        rect(b, 9, 23, 2, 2, LEATHER.m) // belt pouch
        set(b, 9, 23, LEATHER.l)
      } else rect(b, 10, 18, 2, 4, L.accent.d)
      return
    }
    case 'archer': {
      // a shirt under a laced leather jerkin; the quiver rides the right shoulder
      rect(b, 8, 16, 8, 9, c.m)
      vline(b, 15, 16, 9, c.d)
      rect(b, 9, 17, 6, 7, LEATHER.m)
      vline(b, 14, 17, 7, LEATHER.d)
      vline(b, 9, 17, 7, LEATHER.l)
      if (front) {
        set(b, 11, 17, c.l)
        set(b, 12, 17, c.l)
        set(b, 11, 19, LINEN.d)
        set(b, 12, 20, LINEN.d)
      }
      line(b, front ? 8 : 15, 16, front ? 15 : 8, 23, LINEN.d) // quiver strap
      hline(b, 8, 22, 8, LEATHER.d)
      return
    }
  }
}

function armsFront(b: Bitmap, L: HeroLook, frame: WalkFrame) {
  const swingL = frame === 1 ? 1 : frame === 2 ? -1 : 0
  const swingR = -swingL
  const o = L.outfit
  const sleeve = o === 'warrior' ? L.metal : o === 'thief' ? { ...L.cloth, m: L.cloth.d, d: INK } : L.cloth
  const armDraw = (x: number, dy: number) => {
    const top = 16 + Math.max(0, dy)
    rect(b, x, top, 2, 6, sleeve.m)
    vline(b, x, top, 6, sleeve.d)
    if (o === 'spearman') for (let y = top; y < top + 6; y++) set(b, x + ((y + 1) % 2), y, L.metal.m) // mail sleeves
    if (o === 'archer') rect(b, x, top + 4, 2, 2, LEATHER.m) // bracers
    if (o === 'thief') set(b, x + 1, top + 4, LINEN.d) // wrapped forearms
    if (o === 'warrior') {
      rect(b, x, 22 + dy, 2, 2, L.metal.m) // gauntlets
      set(b, x, 22 + dy, L.metal.l)
    } else rect(b, x, 22 + dy, 2, 2, L.skin.m)
  }
  armDraw(6, swingL)
  armDraw(16, swingR)
  if (o === 'warrior') {
    // broad pauldrons
    roundRect(b, 4, 15, 4, 4, L.metal.m)
    hline(b, 5, 15, 2, L.metal.l)
    hline(b, 4, 18, 4, L.metal.d)
    roundRect(b, 16, 15, 4, 4, L.metal.m)
    hline(b, 17, 15, 2, L.metal.l)
    hline(b, 16, 18, 4, L.metal.d)
  }
  if (L.outfit === 'mage') {
    // wide sleeves
    set(b, 5, 21, L.cloth.m)
    set(b, 18, 21, L.cloth.m)
  }
}

function capeBehind(b: Bitmap, cape: Ramp) {
  rect(b, 7, 16, 10, 13, cape.d)
  vline(b, 7, 17, 11, cape.m)
}

// ── head (front) ─────────────────────────────────────────────────────────────

function hairBackLayerFront(b: Bitmap, L: HeroLook) {
  const h = L.hair
  if (L.headgear === 'hood') {
    roundRect(b, 4, 2, 16, 16, L.cloth.d)
    return
  }
  if (L.hairStyle === 'long') {
    rect(b, 4, 8, 3, 13, h.d)
    rect(b, 17, 8, 3, 13, h.d)
  } else if (L.hairStyle === 'bob') {
    rect(b, 5, 8, 2, 7, h.m)
    rect(b, 17, 8, 2, 7, h.m)
  }
}

function faceFront(b: Bitmap, L: HeroLook) {
  const s = L.skin
  roundRect(b, 6, 5, 12, 11, s.m)
  vline(b, 17, 6, 9, s.d)
  hline(b, 7, 15, 10, s.d)
  set(b, 7, 9, s.l)
  // eyes
  hline(b, 8, 10, 2, INK)
  hline(b, 14, 10, 2, INK)
  set(b, 8, 11, L.eyes)
  set(b, 9, 11, INK)
  set(b, 14, 11, INK)
  set(b, 15, 11, L.eyes)
  set(b, 7, 12, blush(s))
  set(b, 16, 12, blush(s))
  set(b, 11, 13, s.d)
  set(b, 12, 13, s.d)
  switch (L.mark) {
    case 'freckles':
      set(b, 8, 12, s.d)
      set(b, 15, 12, s.d)
      break
    case 'scar':
      line(b, 14, 9, 16, 12, mix(s.d, hex('#a02030'), 0.4))
      break
    case 'beard':
      rect(b, 7, 13, 10, 2, L.hair.d)
      set(b, 11, 13, s.d)
      set(b, 12, 13, s.d)
      break
    case 'mole':
      set(b, 16, 13, s.d)
      break
    case 'patch':
      rect(b, 14, 10, 2, 2, INK)
      line(b, 6, 8, 17, 9, INK)
      break
  }
}

function hairCapFront(b: Bitmap, L: HeroLook) {
  const h = L.hair
  const st = L.hairStyle
  if (st === 'buzz') {
    hline(b, 7, 4, 10, h.d)
    rect(b, 6, 5, 12, 2, h.d)
    vline(b, 5, 6, 3, h.d)
    vline(b, 18, 6, 3, h.d)
    return
  }
  hline(b, 8, 3, 8, h.m)
  hline(b, 6, 4, 12, h.m)
  rect(b, 5, 5, 14, 2, h.m)
  hline(b, 8, 4, 3, h.l) // shine
  hline(b, 6, 7, 12, h.m) // fringe base
  vline(b, 5, 7, st === 'bob' ? 8 : 5, h.m)
  vline(b, 18, 7, st === 'bob' ? 8 : 5, h.d)
  switch (st) {
    case 'short':
    case 'ponytail':
    case 'bun':
      for (const x of [6, 7, 9, 10, 13, 14, 16, 17]) set(b, x, 8, h.m)
      break
    case 'spiky':
      for (const sx of [6, 9, 12, 15]) {
        set(b, sx + 1, 1, h.m)
        hline(b, sx, 2, 3, h.m)
      }
      for (const x of [7, 10, 13, 16]) set(b, x, 8, h.m)
      set(b, 10, 9, h.m)
      set(b, 13, 9, h.m)
      break
    case 'long':
      hline(b, 6, 8, 3, h.m)
      hline(b, 15, 8, 3, h.m)
      break
    case 'bob':
      hline(b, 6, 8, 12, h.m)
      break
  }
  if (st === 'bun') ellipse(b, 9, 0, 6, 4, h.m)
  if (st === 'ponytail') rect(b, 19, 9, 2, 5, h.d)
}

function headgearFront(b: Bitmap, L: HeroLook) {
  const m = L.metal
  switch (L.headgear) {
    case 'helm':
    case 'plumedHelm':
      roundRect(b, 5, 2, 14, 7, m.m)
      hline(b, 5, 8, 14, m.d)
      vline(b, 7, 3, 3, m.l)
      rect(b, 11, 8, 2, 2, m.d)
      if (L.headgear === 'plumedHelm') rect(b, 10, 0, 4, 3, L.accent.m)
      break
    case 'hood':
      hline(b, 7, 2, 10, L.cloth.m)
      rect(b, 5, 3, 14, 5, L.cloth.m)
      hline(b, 6, 7, 12, L.cloth.d)
      vline(b, 5, 8, 8, L.cloth.m)
      vline(b, 18, 8, 8, L.cloth.d)
      break
    case 'hat': {
      const c = L.cloth
      hline(b, 3, 7, 18, c.d)
      hline(b, 4, 6, 16, c.m)
      hline(b, 7, 5, 10, L.accent.m)
      hline(b, 8, 4, 8, c.m)
      hline(b, 9, 3, 6, c.m)
      hline(b, 10, 2, 4, c.m)
      hline(b, 11, 1, 3, c.l)
      hline(b, 13, 0, 2, c.l)
      break
    }
    case 'bandana':
      hline(b, 6, 6, 12, L.accent.m)
      hline(b, 5, 7, 14, L.accent.d)
      rect(b, 19, 7, 2, 3, L.accent.d)
      break
    case 'circlet':
      hline(b, 6, 7, 12, GOLD.m)
      set(b, 11, 7, L.accent.l)
      set(b, 12, 7, L.accent.m)
      break
  }
}

function weaponFront(b: Bitmap, L: HeroLook, handDy: number) {
  const m = L.metal
  const hy = 22 + handDy
  switch (L.weapon) {
    case 'sword':
      rect(b, 18, 10 + handDy, 2, 11, m.m)
      vline(b, 18, 10 + handDy, 11, m.l)
      hline(b, 16, hy - 1, 5, GOLD.m)
      rect(b, 18, hy, 2, 2, LEATHER.d)
      break
    case 'spear':
      vline(b, 19, 3, 27, WOOD.m)
      set(b, 19, 0, m.l)
      hline(b, 18, 1, 3, m.m)
      hline(b, 18, 2, 3, m.d)
      hline(b, 18, 4, 3, L.accent.m)
      break
    case 'staff':
      vline(b, 19, 5, 25, WOOD.m)
      ellipse(b, 17, 1, 5, 5, L.accent.m)
      set(b, 18, 2, L.accent.l)
      break
    case 'bow':
      line(b, 19, 12, 21, 16, WOOD.m)
      vline(b, 21, 16, 6, WOOD.m)
      line(b, 21, 22, 19, 26, WOOD.m)
      vline(b, 19, 12, 15, LINEN.l)
      break
    case 'daggers':
      vline(b, 18, hy - 4, 4, m.l)
      set(b, 18, hy, LEATHER.d)
      break
    case 'club':
      rect(b, 18, hy - 7, 2, 7, WOOD.m)
      rect(b, 17, hy - 9, 4, 3, WOOD.l)
      break
    case 'none':
      break
  }
}

function shieldFront(b: Bitmap, L: HeroLook, dy: number) {
  roundRect(b, 3, 17 + dy, 6, 8, L.metal.m)
  rect(b, 4, 18 + dy, 4, 6, WOOD.m)
  vline(b, 5, 18 + dy, 6, L.accent.m)
  hline(b, 4, 20 + dy, 4, L.accent.m)
}

function drawFront(b: Bitmap, L: HeroLook, frame: WalkFrame) {
  if (L.cape) capeBehind(b, L.cape)
  hairBackLayerFront(b, L)
  if (L.outfit === 'archer') {
    // fletchings peeking over the right shoulder
    vline(b, 3, 13, 2, LINEN.m)
    vline(b, 4, 11, 4, LINEN.l)
    vline(b, 5, 12, 3, L.accent.m)
    rect(b, 3, 15, 3, 2, LEATHER.d)
  }
  if (L.outfit !== 'mage') legsFrontBack(b, L, frame)
  else legsFrontBack(b, L, 0)
  torsoFront(b, L, true)
  const by = beltY(L)
  if (L.sash && by !== null) waistSash(b, L, by, true)
  if (L.trim && L.outfit !== 'mage') hline(b, 8, 16, 8, GOLD.m)
  if (L.gem) gemFront(b, L, 11, 17)
  armsFront(b, L, frame)
  faceFront(b, L)
  if (L.mask) {
    // the scarf pulled up over nose and mouth
    rect(b, 7, 12, 10, 4, L.accent.d)
    hline(b, 7, 12, 10, L.accent.m)
    set(b, 6, 12, L.accent.m)
    set(b, 17, 12, L.accent.d)
    set(b, 11, 14, L.accent.m)
  }
  if (L.outfit === 'mage') {
    // a high, flared collar framing the jaw
    const col = L.trim ? GOLD.m : L.cloth.l
    set(b, 6, 14, col)
    rect(b, 6, 15, 3, 1, col)
    set(b, 17, 14, L.cloth.m)
    rect(b, 15, 15, 3, 1, L.cloth.m)
  }
  if (L.headgear !== 'hood' && L.headgear !== 'helm' && L.headgear !== 'plumedHelm') hairCapFront(b, L)
  headgearFront(b, L)
  const handDy = frame === 1 ? 1 : frame === 2 ? -1 : 0
  weaponFront(b, L, -handDy)
  if (L.shield) shieldFront(b, L, frame === 1 ? 1 : frame === 2 ? -1 : 0)
}

// ── back view ────────────────────────────────────────────────────────────────

function drawBack(b: Bitmap, L: HeroLook, frame: WalkFrame) {
  const h = L.hair
  // held pole-arms appear on the viewer's left from behind, behind the body
  if (L.weapon === 'spear') {
    vline(b, 4, 3, 27, WOOD.m)
    hline(b, 3, 1, 3, L.metal.m)
    set(b, 4, 0, L.metal.l)
  } else if (L.weapon === 'staff') {
    vline(b, 4, 5, 25, WOOD.m)
    ellipse(b, 2, 1, 5, 5, L.accent.m)
  }
  legsFrontBack(b, L, L.outfit === 'mage' ? 0 : frame)
  torsoFront(b, L, false)
  const by = beltY(L)
  if (L.sash && by !== null) waistSash(b, L, by, false)
  armsFront(b, L, frame === 1 ? 2 : frame === 2 ? 1 : 0)
  // weapons slung on the back
  if (L.weapon === 'sword' || L.weapon === 'club') {
    line(b, 8, 25, 16, 14, L.weapon === 'sword' ? L.metal.m : WOOD.m)
    hline(b, 14, 16, 3, GOLD.m)
  } else if (L.weapon === 'bow') {
    line(b, 7, 15, 16, 25, WOOD.m)
    rect(b, 13, 15, 3, 7, LEATHER.m)
    hline(b, 13, 14, 3, LINEN.l)
  }
  if (L.shield) {
    roundRect(b, 8, 17, 8, 8, L.metal.m)
    rect(b, 9, 18, 6, 6, WOOD.m)
    vline(b, 11, 18, 6, L.accent.m)
  }
  if (L.cape) {
    rect(b, 7, 16, 10, 13, L.cape.m)
    vline(b, 16, 16, 13, L.cape.d)
    vline(b, 7, 16, 13, L.cape.l)
    if (L.trim) hline(b, 7, 28, 10, GOLD.m)
  }
  // head: all hair from behind
  if (L.headgear === 'hood') {
    roundRect(b, 4, 2, 16, 15, L.cloth.m)
    vline(b, 18, 3, 13, L.cloth.d)
    return
  }
  hline(b, 7, 3, 10, h.m)
  rect(b, 5, 4, 14, 11, h.m)
  hline(b, 6, 15, 12, h.d)
  vline(b, 18, 5, 10, h.d)
  vline(b, 5, 5, 9, h.l)
  hline(b, 8, 4, 4, h.l)
  if (L.hairStyle === 'long') {
    rect(b, 5, 14, 14, 7, h.m)
    vline(b, 18, 14, 7, h.d)
    hline(b, 6, 20, 12, h.d)
  } else if (L.hairStyle === 'bob') {
    rect(b, 5, 14, 14, 2, h.m)
  } else if (L.hairStyle === 'ponytail') {
    rect(b, 10, 11, 4, 5, h.m)
    rect(b, 11, 16, 2, 4, h.d)
    hline(b, 10, 10, 4, L.accent.m)
  } else if (L.hairStyle === 'bun') {
    ellipse(b, 9, 0, 6, 5, h.m)
  } else if (L.hairStyle === 'spiky') {
    for (const sx of [6, 9, 12, 15]) {
      set(b, sx + 1, 1, h.m)
      hline(b, sx, 2, 3, h.m)
    }
  } else if (L.hairStyle === 'buzz') {
    roundRect(b, 5, 3, 14, 13, h.d)
  }
  switch (L.headgear) {
    case 'helm':
    case 'plumedHelm':
      roundRect(b, 5, 2, 14, 9, L.metal.m)
      hline(b, 5, 10, 14, L.metal.d)
      if (L.headgear === 'plumedHelm') rect(b, 10, 0, 4, 4, L.accent.m)
      break
    case 'hat':
      hline(b, 3, 7, 18, L.cloth.d)
      hline(b, 4, 6, 16, L.cloth.m)
      hline(b, 7, 5, 10, L.accent.m)
      hline(b, 8, 4, 8, L.cloth.m)
      hline(b, 9, 3, 6, L.cloth.m)
      hline(b, 10, 2, 4, L.cloth.m)
      hline(b, 10, 1, 3, L.cloth.l)
      hline(b, 9, 0, 2, L.cloth.l)
      break
    case 'bandana':
      hline(b, 5, 6, 14, L.accent.m)
      hline(b, 5, 7, 14, L.accent.d)
      rect(b, 11, 8, 2, 3, L.accent.d)
      break
    case 'circlet':
      hline(b, 5, 7, 14, GOLD.m)
      break
  }
}

// ── side view (facing left) ──────────────────────────────────────────────────

function drawSide(b: Bitmap, L: HeroLook, frame: WalkFrame) {
  const s = L.skin
  const h = L.hair
  const c = L.cloth
  if (L.cape) {
    rect(b, 13, 16, 4, 12, L.cape.m)
    vline(b, 16, 17, 11, L.cape.d)
    if (frame !== 0) set(b, 17, 27, L.cape.d)
  }
  if (L.shield) {
    rect(b, 14, 17, 3, 8, L.metal.d)
    vline(b, 15, 18, 6, L.accent.d)
  }
  if (L.hairStyle === 'long' && L.headgear !== 'hood') {
    rect(b, 13, 8, 5, 12, h.d)
  }
  // legs
  const pants = L.cloth2
  if (L.outfit !== 'mage') {
    if (frame === 0) {
      rect(b, 12, 24, 2, 4, pants.d)
      rect(b, 10, 24, 2, 4, pants.m)
      rect(b, 11, 28, 3, 2, BOOT.d)
      rect(b, 9, 28, 3, 2, BOOT.m)
    } else {
      const near = frame === 1 ? pants.m : pants.d
      const far = frame === 1 ? pants.d : pants.m
      rect(b, 13, 24, 2, 4, far)
      rect(b, 12, 28, 3, 2, frame === 1 ? BOOT.d : BOOT.m)
      rect(b, 8, 24, 2, 4, near)
      rect(b, 7, 28, 3, 2, frame === 1 ? BOOT.m : BOOT.d)
    }
  } else {
    rect(b, 9, 28, 3, 2, BOOT.m)
    if (frame !== 0) rect(b, frame === 1 ? 7 : 12, 28, 3, 2, BOOT.d)
  }
  if (L.outfit === 'warrior') {
    // greaves: the shins turn to steel (near leg bright, far leg shadowed)
    for (let y = 26; y <= 27; y++) {
      for (let x = 7; x <= 15; x++) {
        const p = get(b, x, y)
        if (p === pants.m) set(b, x, y, L.metal.m)
        else if (p === pants.d) set(b, x, y, L.metal.d)
      }
    }
  }
  // torso
  switch (L.outfit) {
    case 'mage':
      for (let y = 16; y <= 28; y++) {
        const grow = Math.floor((y - 16) / 4)
        hline(b, 9 - grow, y, 6 + grow * 2, c.m)
        set(b, 14 + grow, y, c.d)
      }
      hline(b, 9, 21, 6, L.accent.d)
      hline(b, 6, 28, 12, L.trim ? GOLD.m : L.accent.m)
      break
    case 'master':
      rect(b, 9, 16, 6, 11, c.m)
      vline(b, 14, 16, 11, c.d)
      set(b, 9, 18, GOLD.m)
      set(b, 9, 21, GOLD.m)
      rect(b, 9, 16, 2, 1, WHITE)
      break
    case 'warrior':
      rect(b, 9, 16, 6, 7, L.metal.m)
      vline(b, 9, 17, 3, L.metal.l)
      hline(b, 9, 20, 6, L.metal.d)
      rect(b, 9, 23, 6, 2, c.d)
      break
    case 'spearman':
      for (let y = 16; y <= 23; y++) for (let x = 9; x <= 14; x++) set(b, x, y, (x + y) % 2 ? L.metal.m : L.metal.d)
      rect(b, 8, 16, 2, 10, c.m) // the tabard's front panel
      vline(b, 8, 16, 10, c.l)
      hline(b, 9, 22, 6, LEATHER.d)
      break
    case 'merc':
      rect(b, 9, 16, 6, 8, LEATHER.m)
      vline(b, 9, 16, 6, c.m)
      break
    case 'peasant':
      rect(b, 9, 16, 6, 10, c.m)
      vline(b, 14, 16, 10, c.d)
      hline(b, 9, 21, 6, LINEN.d)
      if (L.apron) rect(b, 8, 19, 2, 7, LINEN.l)
      break
    case 'thief':
      rect(b, 9, 16, 6, 8, c.m)
      rect(b, 9, 16, 6, 2, L.accent.m)
      rect(b, 15, 17, 2, 3, L.accent.d)
      rect(b, 9, 22, 2, 2, LEATHER.m) // belt pouch
      break
    default:
      rect(b, 9, 16, 6, 8, c.m)
      vline(b, 14, 16, 8, c.d)
      vline(b, 9, 16, 8, c.l)
      if (L.outfit === 'archer') {
        rect(b, 9, 17, 5, 6, LEATHER.m) // jerkin
        vline(b, 9, 17, 6, LEATHER.l)
        rect(b, 14, 13, 3, 9, LEATHER.m) // quiver
        vline(b, 16, 14, 8, LEATHER.d)
        hline(b, 14, 12, 3, LINEN.l)
        set(b, 15, 11, L.accent.m)
      }
  }
  {
    const by = beltY(L)
    if (L.sash && by !== null) {
      hline(b, 9, by, 6, L.accent.m)
      vline(b, 15, by, 3, L.accent.d) // the tail streams behind
      set(b, 16, by + 2, L.accent.m)
    }
  }
  if (L.trim && L.outfit !== 'mage') hline(b, 9, 16, 6, GOLD.m)
  if (L.gem) {
    set(b, 9, 17, L.accent.l)
    set(b, 9, 18, L.accent.d)
    set(b, 10, 17, GOLD.m)
  }
  // head
  roundRect(b, 6, 5, 12, 11, s.m)
  vline(b, 17, 6, 9, s.d)
  hline(b, 7, 15, 10, s.d)
  set(b, 5, 11, s.m) // nose
  set(b, 7, 13, s.d)
  hline(b, 7, 10, 2, INK)
  set(b, 8, 11, L.eyes)
  set(b, 7, 11, INK)
  set(b, 9, 12, blush(s))
  if (L.mask) {
    rect(b, 5, 12, 7, 4, L.accent.d)
    hline(b, 5, 12, 7, L.accent.m)
    set(b, 5, 11, L.accent.m) // over the nose
  }
  if (L.outfit === 'mage') {
    const col = L.trim ? GOLD.m : c.l
    vline(b, 14, 13, 3, col) // the collar stands up behind the jaw
    set(b, 15, 14, c.m)
    set(b, 15, 15, c.m)
  }
  // hair
  const covered = L.headgear === 'hood' || L.headgear === 'helm' || L.headgear === 'plumedHelm'
  if (!covered) {
    if (L.hairStyle === 'buzz') {
      rect(b, 8, 4, 9, 3, h.d)
      rect(b, 13, 6, 5, 4, h.d)
    } else {
      hline(b, 8, 3, 8, h.m)
      rect(b, 6, 4, 12, 3, h.m)
      hline(b, 8, 4, 3, h.l)
      rect(b, 11, 7, 7, L.hairStyle === 'bob' ? 8 : 5, h.m)
      vline(b, 17, 7, 7, h.d)
      hline(b, 6, 7, 4, h.m)
      set(b, 6, 8, h.m)
      if (L.hairStyle === 'spiky') {
        for (const sx of [7, 10, 13, 16]) set(b, sx, 2, h.m)
        set(b, 18, 5, h.m)
        set(b, 18, 8, h.m)
      }
      if (L.hairStyle === 'ponytail') {
        rect(b, 18, 8, 2, 6, h.m)
        set(b, 20, 12, h.d)
        set(b, 17, 8, L.accent.m)
      }
      if (L.hairStyle === 'bun') ellipse(b, 13, 1, 5, 5, h.m)
    }
    set(b, 13, 10, s.d) // ear
    set(b, 13, 11, s.d)
  }
  switch (L.headgear) {
    case 'helm':
    case 'plumedHelm':
      roundRect(b, 6, 2, 13, 7, L.metal.m)
      hline(b, 6, 8, 13, L.metal.d)
      vline(b, 8, 3, 3, L.metal.l)
      if (L.headgear === 'plumedHelm') {
        rect(b, 13, 0, 4, 3, L.accent.m)
        set(b, 17, 2, L.accent.d)
      }
      break
    case 'hood':
      rect(b, 9, 2, 9, 14, c.m)
      hline(b, 8, 3, 9, c.m)
      vline(b, 8, 4, 4, c.m)
      vline(b, 17, 3, 12, c.d)
      vline(b, 9, 8, 7, c.d)
      break
    case 'hat':
      hline(b, 3, 7, 17, c.d)
      hline(b, 6, 6, 12, c.m)
      hline(b, 8, 5, 9, L.accent.m)
      hline(b, 9, 4, 8, c.m)
      hline(b, 11, 3, 6, c.m)
      hline(b, 13, 2, 5, c.m)
      hline(b, 15, 1, 4, c.l)
      hline(b, 17, 0, 3, c.l)
      break
    case 'bandana':
      hline(b, 6, 6, 12, L.accent.m)
      hline(b, 6, 7, 12, L.accent.d)
      rect(b, 18, 7, 2, 3, L.accent.d)
      break
    case 'circlet':
      hline(b, 6, 7, 8, GOLD.m)
      set(b, 7, 7, L.accent.m)
      break
  }
  // near arm + weapon
  const swing = frame === 1 ? -1 : frame === 2 ? 1 : 0
  const ax = 11 + swing
  const sleeve = L.outfit === 'warrior' || L.outfit === 'spearman' ? L.metal : L.cloth
  rect(b, ax, 16, 2, 6, sleeve.d)
  vline(b, ax, 16, 6, sleeve.m)
  if (L.outfit === 'spearman') for (let y = 16; y < 22; y++) set(b, ax + (y % 2), y, L.metal.l)
  if (L.outfit === 'archer') rect(b, ax, 20, 2, 2, LEATHER.m)
  if (L.outfit === 'warrior') {
    rect(b, ax, 22, 2, 2, L.metal.m) // gauntlet
    roundRect(b, ax - 1, 15, 4, 4, L.metal.m) // pauldron
    hline(b, ax, 15, 2, L.metal.l)
    hline(b, ax - 1, 18, 4, L.metal.d)
  } else rect(b, ax, 22, 2, 2, s.m)
  const hx = ax
  const hy = 22
  switch (L.weapon) {
    case 'sword':
      line(b, hx - 1, hy - 1, hx - 7, hy - 9, L.metal.l)
      line(b, hx - 1, hy, hx - 7, hy - 8, L.metal.m)
      line(b, hx - 2, hy + 1, hx + 1, hy - 2, GOLD.m)
      break
    case 'spear':
      vline(b, hx - 1, 3, 27, WOOD.m)
      set(b, hx - 1, 0, L.metal.l)
      hline(b, hx - 2, 1, 3, L.metal.m)
      hline(b, hx - 2, 2, 3, L.metal.d)
      break
    case 'staff':
      vline(b, hx - 1, 5, 25, WOOD.m)
      ellipse(b, hx - 3, 1, 5, 5, L.accent.m)
      set(b, hx - 2, 2, L.accent.l)
      break
    case 'bow':
      line(b, hx - 3, hy - 9, hx - 5, hy - 5, WOOD.m)
      vline(b, hx - 5, hy - 5, 7, WOOD.m)
      line(b, hx - 5, hy + 2, hx - 3, hy + 6, WOOD.m)
      vline(b, hx - 3, hy - 8, 14, LINEN.l)
      break
    case 'daggers':
      line(b, hx - 1, hy, hx - 4, hy - 3, L.metal.l)
      break
    case 'club':
      line(b, hx, hy, hx - 4, hy - 6, WOOD.m)
      rect(b, hx - 6, hy - 9, 3, 4, WOOD.l)
      break
    case 'none':
      break
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bust portrait (32×32)
// ─────────────────────────────────────────────────────────────────────────────

export function drawHeroBust(L: HeroLook): Bitmap {
  const b = createBitmap(BUST, BUST)
  const s = L.skin
  const h = L.hair
  const c = L.cloth

  // back layers
  if (L.headgear === 'hood') rect(b, 5, 3, 22, 22, c.d)
  else if (L.hairStyle === 'long') {
    rect(b, 5, 9, 5, 21, h.d)
    rect(b, 22, 9, 5, 21, h.d)
  } else if (L.hairStyle === 'bob') {
    rect(b, 6, 8, 4, 12, h.m)
    rect(b, 22, 8, 4, 12, h.d)
  } else if (L.hairStyle === 'ponytail') {
    rect(b, 24, 10, 3, 10, h.d)
  }
  if (L.cape) rect(b, 2, 22, 28, 10, L.cape.m)

  // neck + shoulders
  rect(b, 13, 19, 6, 5, s.d)
  bustTorso(b, L)

  // head
  rect(b, 10, 5, 12, 1, s.m)
  rect(b, 9, 6, 14, 2, s.m)
  rect(b, 8, 8, 16, 10, s.m)
  rect(b, 9, 18, 14, 2, s.m)
  rect(b, 11, 20, 10, 1, s.m)
  vline(b, 23, 8, 10, s.d)
  vline(b, 22, 18, 2, s.d)
  hline(b, 11, 20, 10, s.d)
  rect(b, 9, 9, 2, 2, s.l)
  // ears
  rect(b, 7, 12, 1, 3, s.m)
  rect(b, 24, 12, 1, 3, s.d)
  // eyes
  hline(b, 11, 12, 3, INK)
  hline(b, 18, 12, 3, INK)
  set(b, 11, 13, SCLERA)
  set(b, 11, 14, SCLERA)
  rect(b, 12, 13, 2, 2, L.eyes)
  set(b, 12, 13, WHITE)
  set(b, 20, 13, SCLERA)
  set(b, 20, 14, SCLERA)
  rect(b, 18, 13, 2, 2, L.eyes)
  set(b, 19, 13, WHITE)
  // brows, nose, mouth, blush
  hline(b, 11, 10, 3, h.d)
  hline(b, 18, 10, 3, h.d)
  set(b, 16, 16, s.d)
  hline(b, 15, 18, 2, mix(s.d, hex('#a02030'), 0.3))
  set(b, 10, 16, blush(s))
  set(b, 21, 16, blush(s))

  switch (L.mark) {
    case 'freckles':
      for (const [x, y] of [[10, 15], [12, 16], [19, 16], [21, 15], [11, 17], [20, 17]] as const) set(b, x, y, s.d)
      break
    case 'scar':
      line(b, 19, 10, 22, 16, mix(s.d, hex('#a02030'), 0.45))
      break
    case 'beard':
      rect(b, 9, 17, 14, 3, L.hair.d)
      rect(b, 11, 20, 10, 2, L.hair.d)
      hline(b, 14, 18, 4, mix(s.d, hex('#a02030'), 0.3))
      break
    case 'mole':
      set(b, 20, 18, s.d)
      break
    case 'patch':
      rect(b, 17, 12, 5, 4, INK)
      line(b, 8, 9, 24, 11, INK)
      break
  }

  bustOverFace(b, L)

  // hair / headgear
  const covered = L.headgear === 'hood' || L.headgear === 'helm' || L.headgear === 'plumedHelm'
  if (!covered) bustHair(b, L)
  bustHeadgear(b, L)

  return applyAura(outline(b, INK), L, 0)
}

/** Kit pieces that sit in front of the face: a rogue's mask, a mage's standing collar. */
function bustOverFace(b: Bitmap, L: HeroLook) {
  const a = L.accent
  if (L.mask) {
    rect(b, 8, 16, 16, 2, a.d)
    rect(b, 9, 18, 14, 2, a.d)
    rect(b, 11, 20, 10, 2, a.d) // down over the chin (and any beard)
    hline(b, 8, 16, 16, a.m)
    set(b, 16, 17, a.m) // the nose under the cloth
    line(b, 12, 18, 14, 20, mix(a.d, INK, 0.3)) // folds
    line(b, 20, 18, 18, 20, mix(a.d, INK, 0.3))
  }
  if (L.outfit === 'mage') {
    const c = L.cloth
    const edge = L.trim ? GOLD.m : c.l
    // two stiff collar wings rising either side of the jaw
    for (let i = 0; i < 5; i++) {
      hline(b, 7, 18 + i, 1 + i, i === 0 ? edge : c.l)
      set(b, 7 + i, 18 + i, edge)
      hline(b, 24 - i, 18 + i, 1 + i, i === 0 ? edge : c.m)
      set(b, 24 - i, 18 + i, edge)
    }
  }
}

function bustTorso(b: Bitmap, L: HeroLook) {
  const c = L.cloth
  const a = L.accent
  const base = L.outfit === 'merc' ? LEATHER : L.outfit === 'warrior' || L.outfit === 'spearman' ? L.metal : c
  roundRect(b, 3, 23, 26, 9, base.m)
  hline(b, 4, 31, 24, base.d)
  vline(b, 28, 24, 8, base.d)
  rect(b, 4, 24, 3, 2, base.l)
  switch (L.outfit) {
    case 'warrior':
      rect(b, 11, 25, 10, 7, c.m)
      vline(b, 15, 26, 5, a.m)
      hline(b, 13, 28, 6, a.m)
      ellipse(b, 1, 22, 9, 6, L.metal.m)
      ellipse(b, 22, 22, 9, 6, L.metal.d)
      set(b, 4, 23, L.metal.l)
      // rivets and a steel gorget over the throat
      set(b, 6, 26, L.metal.l)
      set(b, 25, 26, L.metal.m)
      rect(b, 12, 21, 8, 3, L.metal.m)
      hline(b, 12, 21, 8, L.metal.l)
      hline(b, 12, 23, 8, L.metal.d)
      break
    case 'spearman':
      // light mail everywhere, a long tabard down the middle with its device
      for (let y = 24; y <= 31; y++) for (let x = 4; x <= 27; x++) if ((x + y) % 2 === 0) set(b, x, y, mix(L.metal.m, L.metal.d, 0.5))
      rect(b, 11, 23, 10, 9, c.m)
      vline(b, 11, 23, 9, c.l)
      vline(b, 20, 23, 9, c.d)
      hline(b, 12, 23, 8, LEATHER.d)
      set(b, 15, 26, a.l)
      set(b, 16, 26, a.m)
      rect(b, 14, 27, 4, 2, a.m)
      set(b, 14, 27, a.l)
      set(b, 15, 29, a.d)
      set(b, 16, 29, a.d)
      break
    case 'mage':
      line(b, 11, 23, 15, 28, L.accent.m)
      line(b, 20, 23, 16, 28, L.accent.m)
      vline(b, 15, 28, 4, L.accent.m)
      break
    case 'thief':
      rect(b, 10, 20, 12, 5, a.m)
      hline(b, 10, 24, 12, a.d)
      // dark leathers with a harness of throwing knives
      line(b, 5, 25, 11, 31, LEATHER.d)
      for (const [x, y] of [[6, 26], [8, 28], [10, 30]] as const) set(b, x, y, L.metal.l)
      break
    case 'archer':
      // a laced leather jerkin over the shirt; the quiver over the right shoulder
      rect(b, 9, 24, 14, 8, LEATHER.m)
      vline(b, 9, 24, 8, LEATHER.l)
      vline(b, 22, 24, 8, LEATHER.d)
      rect(b, 14, 23, 4, 2, c.l)
      for (const y of [26, 28, 30]) hline(b, 15, y, 2, LINEN.d)
      line(b, 6, 24, 24, 31, LINEN.d)
      line(b, 6, 25, 23, 31, LEATHER.d)
      rect(b, 2, 21, 6, 3, LEATHER.d)
      vline(b, 3, 18, 3, LINEN.m)
      vline(b, 4, 16, 5, LINEN.l)
      vline(b, 5, 17, 4, a.m)
      vline(b, 6, 18, 3, LINEN.l)
      break
    case 'merc':
      rect(b, 13, 24, 6, 8, c.m)
      line(b, 5, 24, 12, 31, LEATHER.d)
      break
    case 'peasant':
      rect(b, 14, 23, 4, 2, L.skin.d)
      if (L.apron) {
        vline(b, 11, 25, 7, LINEN.l)
        vline(b, 20, 25, 7, LINEN.l)
      }
      break
    case 'master':
      line(b, 12, 23, 15, 31, c.l)
      line(b, 19, 23, 16, 31, c.l)
      rect(b, 14, 23, 4, 3, WHITE)
      set(b, 16, 28, GOLD.m)
      set(b, 16, 30, GOLD.m)
      break
  }
  // 3★ sash across the chest (the archer's strap and the mage's robe already cross it)
  if (L.sash && L.outfit !== 'archer' && L.outfit !== 'mage') {
    for (let i = 0; i < 8; i++) {
      set(b, 23 - i, 24 + i, a.m)
      set(b, 24 - i, 24 + i, a.m)
      set(b, 25 - i, 24 + i, a.d)
    }
  }
  if (L.trim) hline(b, 4, 23, 24, GOLD.m)
  if (L.cape) {
    rect(b, 6, 25, 2, 2, GOLD.m)
    rect(b, 24, 25, 2, 2, GOLD.m)
  }
  if (L.gem) {
    // the brooch on the gold collar line
    set(b, 15, 23, a.l)
    set(b, 16, 23, a.m)
    set(b, 15, 24, a.m)
    set(b, 16, 24, a.d)
    set(b, 14, 24, GOLD.m)
    set(b, 17, 24, GOLD.d)
  }
}

function bustHair(b: Bitmap, L: HeroLook) {
  const h = L.hair
  const st = L.hairStyle
  if (st === 'buzz') {
    hline(b, 10, 3, 12, h.d)
    rect(b, 8, 4, 16, 4, h.d)
    rect(b, 7, 6, 2, 5, h.d)
    rect(b, 23, 6, 2, 5, h.d)
    return
  }
  hline(b, 11, 2, 10, h.m)
  hline(b, 9, 3, 14, h.m)
  rect(b, 7, 4, 18, 5, h.m)
  hline(b, 10, 4, 5, h.l)
  hline(b, 9, 5, 2, h.l)
  const sideLen = st === 'bob' ? 12 : st === 'long' ? 14 : 6
  rect(b, 7, 9, 2, sideLen, h.m)
  rect(b, 23, 9, 2, sideLen, h.d)
  vline(b, 24, 4, 5, h.d)
  switch (st) {
    case 'short':
    case 'ponytail':
    case 'bun':
      hline(b, 8, 9, 16, h.m)
      for (const x of [8, 9, 12, 13, 17, 18, 22, 23]) set(b, x, 10, h.m)
      break
    case 'spiky':
      for (const sx of [9, 13, 17, 21]) {
        set(b, sx, 0, h.m)
        hline(b, sx - 1, 1, 3, h.m)
      }
      hline(b, 8, 9, 16, h.m)
      for (const x of [9, 13, 18, 22]) {
        set(b, x, 10, h.m)
        set(b, x, 11, h.m)
      }
      break
    case 'long':
      hline(b, 8, 9, 6, h.m)
      hline(b, 18, 9, 6, h.m)
      hline(b, 8, 10, 4, h.m)
      hline(b, 20, 10, 4, h.m)
      break
    case 'bob':
      rect(b, 8, 9, 16, 2, h.m)
      break
  }
  if (st === 'bun') ellipse(b, 12, 0, 8, 4, h.m)
}

function bustHeadgear(b: Bitmap, L: HeroLook) {
  const m = L.metal
  const c = L.cloth
  switch (L.headgear) {
    case 'helm':
    case 'plumedHelm':
      roundRect(b, 6, 2, 20, 9, m.m)
      hline(b, 6, 10, 20, m.d)
      rect(b, 8, 3, 2, 4, m.l)
      rect(b, 15, 10, 2, 5, m.d)
      rect(b, 6, 10, 2, 6, m.d)
      rect(b, 24, 10, 2, 6, m.d)
      if (L.headgear === 'plumedHelm') rect(b, 13, 0, 6, 3, L.accent.m)
      break
    case 'hood':
      hline(b, 10, 2, 12, c.m)
      rect(b, 7, 3, 18, 6, c.m)
      hline(b, 8, 8, 16, c.d)
      rect(b, 6, 9, 3, 15, c.m)
      rect(b, 23, 9, 3, 15, c.d)
      hline(b, 9, 9, 14, c.d)
      break
    case 'hat':
      hline(b, 2, 9, 28, c.d)
      hline(b, 4, 8, 24, c.m)
      hline(b, 9, 7, 14, L.accent.m)
      hline(b, 10, 6, 12, c.m)
      hline(b, 11, 5, 10, c.m)
      hline(b, 12, 4, 8, c.m)
      hline(b, 13, 3, 7, c.m)
      hline(b, 15, 2, 5, c.l)
      hline(b, 17, 1, 4, c.l)
      hline(b, 20, 0, 3, c.l)
      break
    case 'bandana':
      hline(b, 7, 7, 18, L.accent.m)
      hline(b, 7, 8, 18, L.accent.d)
      rect(b, 25, 8, 2, 4, L.accent.d)
      set(b, 27, 11, L.accent.d)
      break
    case 'circlet':
      hline(b, 8, 8, 16, GOLD.m)
      rect(b, 15, 7, 2, 3, L.accent.m)
      set(b, 15, 7, L.accent.l)
      break
  }
}
