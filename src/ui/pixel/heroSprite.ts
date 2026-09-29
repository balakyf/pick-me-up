/**
 * Procedural 16-bit hero sprites.
 *
 *   drawHeroFrame(look, dir, frame) → 24×32 walk frame (down/up/left/right × 3)
 *   drawHeroBust(look)              → 32×32 dialog / card portrait
 *
 * Everything is hand-placed pixel geometry parameterised by a HeroLook, then run
 * through the universal outline pass. Pure: same look ⇒ identical pixels.
 */
import {
  createBitmap,
  ellipse,
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
  return outline(b, INK)
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
      rect(b, 8, 16, 8, 8, c.m)
      vline(b, 15, 16, 8, c.d)
      vline(b, 8, 16, 8, c.l)
      for (const x of [9, 11, 13]) for (const y of [18, 20]) set(b, x, y, L.metal.l)
      hline(b, 8, 23, 8, LEATHER.d)
      return
    }
    case 'thief': {
      rect(b, 8, 16, 8, 8, c.m)
      vline(b, 15, 16, 8, c.d)
      hline(b, 8, 23, 8, LEATHER.d)
      rect(b, 8, 16, 8, 2, L.accent.m) // scarf
      if (front) rect(b, 14, 18, 2, 3, L.accent.d)
      else rect(b, 10, 18, 2, 4, L.accent.d)
      return
    }
    case 'archer': {
      rect(b, 8, 16, 8, 9, c.m)
      vline(b, 15, 16, 9, c.d)
      vline(b, 8, 16, 9, c.l)
      line(b, front ? 15 : 8, 16, front ? 8 : 15, 23, LEATHER.m) // quiver strap
      hline(b, 8, 22, 8, LEATHER.d)
      return
    }
  }
}

function armsFront(b: Bitmap, L: HeroLook, frame: WalkFrame) {
  const swingL = frame === 1 ? 1 : frame === 2 ? -1 : 0
  const swingR = -swingL
  const sleeve = L.cloth
  const armDraw = (x: number, dy: number) => {
    rect(b, x, 16 + Math.max(0, dy), 2, 6, sleeve.m)
    vline(b, x, 16 + Math.max(0, dy), 6, sleeve.d)
    rect(b, x, 22 + dy, 2, 2, L.skin.m)
  }
  armDraw(6, swingL)
  armDraw(16, swingR)
  if (L.outfit === 'warrior' || L.outfit === 'spearman') {
    rect(b, 5, 16, 3, 2, L.metal.m)
    set(b, 5, 16, L.metal.l)
    rect(b, 16, 16, 3, 2, L.metal.m)
    set(b, 18, 17, L.metal.d)
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
  if (L.outfit !== 'mage') legsFrontBack(b, L, frame)
  else legsFrontBack(b, L, 0)
  torsoFront(b, L, true)
  if (L.trim && L.outfit !== 'mage') hline(b, 8, 16, 8, GOLD.m)
  armsFront(b, L, frame)
  faceFront(b, L)
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
      rect(b, 9, 23, 6, 2, c.d)
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
      break
    default:
      rect(b, 9, 16, 6, 8, c.m)
      vline(b, 14, 16, 8, c.d)
      vline(b, 9, 16, 8, c.l)
      if (L.outfit === 'archer') {
        rect(b, 14, 14, 3, 8, LEATHER.m) // quiver
        hline(b, 14, 13, 3, LINEN.l)
      }
  }
  if (L.trim && L.outfit !== 'mage') hline(b, 9, 16, 6, GOLD.m)
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
  rect(b, ax, 22, 2, 2, s.m)
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

  // hair / headgear
  const covered = L.headgear === 'hood' || L.headgear === 'helm' || L.headgear === 'plumedHelm'
  if (!covered) bustHair(b, L)
  bustHeadgear(b, L)

  return outline(b, INK)
}

function bustTorso(b: Bitmap, L: HeroLook) {
  const c = L.cloth
  const base = L.outfit === 'merc' ? LEATHER : L.outfit === 'warrior' ? L.metal : c
  roundRect(b, 3, 23, 26, 9, base.m)
  hline(b, 4, 31, 24, base.d)
  vline(b, 28, 24, 8, base.d)
  rect(b, 4, 24, 3, 2, base.l)
  switch (L.outfit) {
    case 'warrior':
      rect(b, 11, 25, 10, 7, c.m)
      vline(b, 15, 26, 5, L.accent.m)
      hline(b, 13, 28, 6, L.accent.m)
      ellipse(b, 1, 22, 9, 6, L.metal.m)
      ellipse(b, 22, 22, 9, 6, L.metal.d)
      set(b, 4, 23, L.metal.l)
      break
    case 'spearman':
      ellipse(b, 1, 22, 9, 6, L.metal.m)
      ellipse(b, 22, 22, 9, 6, L.metal.d)
      for (const x of [11, 15, 19]) set(b, x, 28, L.metal.l)
      break
    case 'mage':
      line(b, 11, 23, 15, 28, L.accent.m)
      line(b, 20, 23, 16, 28, L.accent.m)
      vline(b, 15, 28, 4, L.accent.m)
      break
    case 'thief':
      rect(b, 10, 20, 12, 5, L.accent.m)
      hline(b, 10, 24, 12, L.accent.d)
      break
    case 'archer':
      line(b, 6, 24, 24, 31, LEATHER.m)
      line(b, 6, 25, 23, 31, LEATHER.d)
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
  if (L.trim) hline(b, 4, 23, 24, GOLD.m)
  if (L.cape) {
    rect(b, 6, 25, 2, 2, GOLD.m)
    rect(b, 24, 25, 2, 2, GOLD.m)
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
