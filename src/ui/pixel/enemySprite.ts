/**
 * Enemy battle sprites (side view, facing RIGHT toward the party).
 *
 * Humanoid foes reuse the hero generator with an authored HeroLook (a goblin is a
 * green-skinned mercenary with a club); beasts and monsters have bespoke drawers.
 * Unknown template ids fall back to an element-tinted goblin so new content never
 * renders blank.
 */
import type { Element } from '../../engine/types'
import {
  createBitmap,
  ellipse,
  flipX,
  hex,
  hline,
  line,
  mix,
  rgbaParts,
  withAlpha,
  outline,
  rect,
  roundRect,
  set,
  vline,
  type Bitmap,
} from './bitmap'
import { drawHeroFrame } from './heroSprite'
import type { HeroLook } from './look'
import { BONE, ELEMENT_RAMP, GOLD, INK, LEATHER, STEEL, WOOD, ramp, type Ramp } from './palette'
import {
  drawBlackPriest,
  drawChimeraMatriarch,
  drawDarkan,
  drawElCid,
  drawHerald,
  drawLazenca,
  drawPryos,
  drawRodvick,
  drawTell,
  drawValention,
  drawVersace,
  type IdleFrame,
} from './bossSprite'
import { idleFrame } from './shape'

export type { IdleFrame } from './bossSprite'

const WHITE_PX = hex('#fff6e0')

const GOBLIN_SKIN = ramp('#2e5a1e', '#5a9a2e', '#8ec84a')
const OGRE_SKIN = ramp('#4a5a3a', '#7a8a5a', '#a8b47a')
const HARPY_SKIN = ramp('#a88a9a', '#e0c4cc', '#fff0f0')
const RED_EYE = hex('#ff3a2e')

function baseLook(over: Partial<HeroLook>): HeroLook {
  return {
    skin: GOBLIN_SKIN,
    hair: ramp('#1e2a14', '#2e3e1e', '#4a5a2e'),
    hairStyle: 'buzz',
    eyes: RED_EYE,
    outfit: 'merc',
    cloth: ramp('#3a2e1e', '#5a4a2e', '#7a6644'),
    cloth2: LEATHER,
    metal: STEEL,
    accent: ELEMENT_RAMP.earth,
    headgear: 'none',
    weapon: 'club',
    shield: false,
    cape: null,
    trim: false,
    apron: false,
    mark: 'none',
    ...over,
  }
}

function humanoid(look: HeroLook, extra?: (b: Bitmap) => void): Bitmap {
  // drawHeroFrame outlines already; extras (ears, tusks) are drawn on top then re-outlined
  const b = drawHeroFrame(look, 'right', 0)
  if (extra) {
    extra(b)
    return outline(b, INK)
  }
  return b
}

// ── quadrupeds ───────────────────────────────────────────────────────────────

function quadruped(fur: Ramp, eye: number, big: boolean): Bitmap {
  const W = big ? 44 : 32
  const H = big ? 32 : 24
  const k = big ? 1.35 : 1
  const b = createBitmap(W, H)
  const S = (v: number) => Math.round(v * k)
  // tail
  line(b, S(6), S(10), S(1), S(5), fur.d)
  line(b, S(6), S(11), S(1), S(6), fur.m)
  // far legs
  rect(b, S(10), S(15), S(2), S(7), fur.d)
  rect(b, S(22), S(15), S(2), S(7), fur.d)
  // body
  ellipse(b, S(5), S(8), S(20), S(10), fur.m)
  hline(b, S(8), S(8), S(14), fur.d)
  ellipse(b, S(9), S(14), S(12), S(4), fur.l)
  // near legs
  rect(b, S(7), S(15), S(3), S(8), fur.m)
  rect(b, S(19), S(15), S(3), S(8), fur.m)
  rect(b, S(7), S(22), S(3), 1, INK)
  rect(b, S(19), S(22), S(3), 1, INK)
  // head
  ellipse(b, S(20), S(3), S(10), S(10), fur.m)
  rect(b, S(27), S(8), S(5), S(4), fur.m)
  hline(b, S(27), S(11), S(5), fur.l)
  set(b, S(31), S(8), INK)
  set(b, S(31), S(9), INK)
  // ear
  line(b, S(22), S(4), S(23), 0, fur.d)
  line(b, S(23), S(4), S(24), S(1), fur.d)
  // eye + fangs
  set(b, S(26), S(6), eye)
  set(b, S(27), S(6), eye)
  set(b, S(29), S(12), BONE.l)
  if (big) {
    // horns + mane
    line(b, S(21), S(4), S(17), 0, BONE.m)
    line(b, S(22), S(4), S(18), 0, BONE.l)
    for (let i = 0; i < 5; i++) line(b, S(12 + i * 2), S(8), S(11 + i * 2), S(5), fur.d)
  }
  return outline(b, INK)
}

// ── bespoke monsters ─────────────────────────────────────────────────────────

function harpy(): Bitmap {
  const b = createBitmap(34, 34)
  const feather = ramp('#3a2a5a', '#6a4a8e', '#9a7ac0')
  // far wing
  for (let i = 0; i < 6; i++) line(b, 14, 12 + i, 2 + i, 3 + i * 3, feather.d)
  // body
  ellipse(b, 12, 12, 10, 11, feather.m)
  ellipse(b, 14, 14, 6, 7, feather.l)
  // talons
  vline(b, 14, 22, 5, BONE.d)
  vline(b, 18, 22, 5, BONE.d)
  hline(b, 13, 27, 3, INK)
  hline(b, 17, 27, 3, INK)
  // head
  roundRect(b, 14, 3, 9, 9, HARPY_SKIN.m)
  vline(b, 22, 4, 7, HARPY_SKIN.d)
  set(b, 20, 7, RED_EYE)
  set(b, 23, 8, HARPY_SKIN.m)
  // wild hair
  rect(b, 12, 1, 9, 4, feather.d)
  line(b, 12, 4, 9, 11, feather.d)
  line(b, 13, 4, 10, 12, feather.d)
  // near wing
  for (let i = 0; i < 7; i++) line(b, 16, 13 + i, 28 + (i % 3), 2 + i * 3, i % 2 ? feather.m : feather.l)
  return outline(b, INK)
}

function ogre(): Bitmap {
  const b = createBitmap(38, 42)
  const s = OGRE_SKIN
  // club (behind)
  line(b, 30, 30, 36, 8, WOOD.m)
  line(b, 31, 30, 37, 8, WOOD.d)
  ellipse(b, 32, 2, 6, 10, WOOD.l)
  // legs
  rect(b, 11, 31, 6, 9, s.d)
  rect(b, 21, 31, 6, 9, s.m)
  rect(b, 10, 39, 8, 2, LEATHER.d)
  rect(b, 20, 39, 8, 2, LEATHER.d)
  // torso
  roundRect(b, 7, 13, 24, 19, s.m)
  vline(b, 30, 14, 17, s.d)
  ellipse(b, 12, 18, 14, 10, s.l) // belly
  rect(b, 8, 28, 22, 5, LEATHER.m) // loincloth
  vline(b, 18, 28, 5, LEATHER.d)
  // arms
  roundRect(b, 2, 14, 6, 15, s.d)
  roundRect(b, 28, 14, 6, 15, s.m)
  rect(b, 29, 28, 5, 4, s.l)
  // head
  roundRect(b, 13, 2, 13, 12, s.m)
  vline(b, 25, 3, 10, s.d)
  hline(b, 14, 5, 11, s.d) // brow
  set(b, 21, 7, RED_EYE)
  set(b, 17, 7, RED_EYE)
  vline(b, 23, 11, 3, BONE.l) // tusks
  vline(b, 18, 11, 3, BONE.l)
  hline(b, 17, 12, 7, INK)
  return outline(b, INK)
}

/** The Mimic: a treasure chest with a mouth — teeth along the lid, a lolling tongue, eyes in the dark. */
function mimic(): Bitmap {
  const b = createBitmap(36, 32)
  const MAW = hex('#2a0e18')
  const TONGUE = ramp('#7a1a2e', '#c8405a', '#f07a8e')
  // the lid, thrown back
  roundRect(b, 3, 1, 30, 9, WOOD.m)
  hline(b, 4, 1, 28, WOOD.l)
  hline(b, 3, 9, 30, WOOD.d)
  vline(b, 9, 1, 9, GOLD.m)
  vline(b, 26, 1, 9, GOLD.m)
  // the maw
  rect(b, 5, 10, 26, 9, MAW)
  // eyes in the dark
  rect(b, 11, 12, 2, 2, RED_EYE)
  rect(b, 23, 12, 2, 2, RED_EYE)
  // the chest body
  rect(b, 3, 19, 30, 10, WOOD.m)
  hline(b, 3, 19, 30, WOOD.l)
  hline(b, 3, 28, 30, WOOD.d)
  vline(b, 9, 19, 10, GOLD.m)
  vline(b, 26, 19, 10, GOLD.m)
  // the lock plate
  rect(b, 16, 21, 4, 5, GOLD.l)
  set(b, 17, 23, INK)
  set(b, 18, 23, INK)
  // teeth: down from the lid, up from the rim
  for (let x = 6; x <= 29; x += 3) {
    set(b, x, 10, BONE.l)
    set(b, x + 1, 10, BONE.l)
    set(b, x, 11, BONE.m)
  }
  for (let x = 7; x <= 29; x += 3) {
    set(b, x, 18, BONE.l)
    set(b, x + 1, 18, BONE.l)
    set(b, x, 17, BONE.m)
  }
  // the tongue, lolling out over the front toward the party
  rect(b, 20, 16, 8, 3, TONGUE.m)
  rect(b, 26, 18, 4, 6, TONGUE.m)
  hline(b, 21, 16, 6, TONGUE.l)
  vline(b, 29, 19, 4, TONGUE.d)
  // stubby feet
  rect(b, 5, 29, 4, 2, WOOD.d)
  rect(b, 27, 29, 4, 2, WOOD.d)
  return outline(b, INK)
}

function lv999(f: IdleFrame = 0): Bitmap {
  const b = createBitmap(60, 60)
  const flesh = ramp('#1a0a24', '#3a1a4e', '#6a3a8e')
  // aura spikes
  for (let i = 0; i < 9; i++) {
    const x = 6 + i * 6
    line(b, x, 14, x + 2, 2 + (i % 3) * 3, flesh.l)
  }
  // tendrils
  for (let i = 0; i < 6; i++) {
    const x = 8 + i * 8
    const sway = f === 1 ? (i % 2 ? 1 : -1) : 0
    line(b, x, 46, x - 3 + (i % 2) * 6 + sway, 58, flesh.d)
    line(b, x + 1, 46, x - 2 + (i % 2) * 6 + sway, 58, flesh.m)
  }
  ellipse(b, 3, 10, 54, 42, flesh.m)
  ellipse(b, 10, 14, 30, 20, flesh.l)
  ellipse(b, 30, 30, 24, 20, flesh.d)
  // eyes
  const eyes: [number, number, number][] = [[18, 22, 6], [34, 18, 8], [44, 30, 5], [24, 34, 4], [12, 32, 3], [38, 40, 4]]
  eyes.forEach(([x, y, r], i) => {
    // On the second frame some of its eyes are shut; the others roll toward the party.
    if (f === 1 && i % 2 === 1) {
      hline(b, x, y + Math.floor(r / 2), r + 2, flesh.d)
      return
    }
    ellipse(b, x, y, r + 2, r, hex('#ffe0a0'))
    rect(b, x + Math.floor(r / 2) + f, y + 1, 2, Math.max(1, r - 2), RED_EYE)
  })
  // maw
  hline(b, 16, 44, 26, INK)
  for (let x = 17; x < 42; x += 3) set(b, x, 43, BONE.l)
  return outline(b, INK)
}

function halgiraf(f: IdleFrame = 0): Bitmap {
  // The half black dragon (canon F20): hulking, scaled, wings spread, facing right.
  return dragon(ramp('#140e1e', '#2e2240', '#4e3a6a'), ramp('#4a3a2a', '#7a6248', '#a88a64'), ramp('#1a1024', '#3a2450', '#5a3a7a'), f)
}

/** A great winged dragon in the given scale/belly/wing ramps (Halgiraf, Kthat). */
function dragon(scale: Ramp, belly: Ramp, wing: Ramp, f: IdleFrame = 0): Bitmap {
  const b = createBitmap(76, 62)
  // The wings beat between the idle frames: their tips sink a few pixels.
  const beat = f === 1 ? 3 : 0
  // far wing (behind)
  for (let i = 0; i < 7; i++) line(b, 30, 22, 8 + i * 4, 2 + (i % 2) * 3 + beat, wing.d)
  line(b, 8, 2 + beat, 30, 22, wing.m)
  // tail
  for (let i = 0; i < 16; i++) ellipse(b, 2 + i, 40 + Math.round(Math.sin(i / 3) * 3), 6, 6, scale.m)
  line(b, 1, 43, 0, 36, BONE.m)
  // back legs
  rect(b, 22, 44, 8, 14, scale.d)
  rect(b, 20, 56, 12, 4, scale.d)
  // body
  ellipse(b, 14, 24, 40, 28, scale.m)
  ellipse(b, 22, 34, 28, 16, belly.m)
  for (let x = 24; x < 48; x += 4) vline(b, x, 36, 12, belly.d) // belly plates
  for (let x = 18; x < 50; x += 5) line(b, x, 25, x + 2, 21, scale.l) // dorsal ridge
  // front legs
  rect(b, 44, 44, 7, 14, scale.m)
  rect(b, 42, 56, 12, 4, scale.m)
  for (const x of [43, 47, 51]) set(b, x, 60, BONE.l) // claws
  // neck + head
  ellipse(b, 44, 14, 14, 20, scale.m)
  ellipse(b, 50, 6, 20, 14, scale.m)
  rect(b, 62, 10, 12, 7, scale.m) // snout
  hline(b, 62, 16, 12, scale.d)
  for (let x = 63; x < 74; x += 3) set(b, x, 17, BONE.l) // fangs
  set(b, 72, 11, INK) // nostril
  // horns
  line(b, 52, 6, 46, 0, BONE.m)
  line(b, 53, 6, 47, 0, BONE.l)
  line(b, 57, 5, 56, 0, BONE.m)
  // eye (glows)
  rect(b, 60, 8, 3, 2, hex('#ff3a2e'))
  set(b, 61, 8, hex('#ffd0a0'))
  // near wing (in front)
  for (let i = 0; i < 6; i++) line(b, 34, 24, 18 + i * 5, 4 + (i % 2) * 4 + beat, i % 2 ? wing.m : wing.l)
  line(b, 34, 24, 20, 2 + beat, wing.l)
  if (f === 1) set(b, 61, 8, hex('#ffd0a0')) // the eye flares
  return outline(b, INK)
}


// ── late-tower monsters (Acts III–VIII) ──────────────────────────────────────

/** A blocky golem; `big` for the statue/colossus scale, `glow` for its core. */
function golem(stone: Ramp, glow: number, size: 'small' | 'big' | 'huge'): Bitmap {
  const k = size === 'huge' ? 2 : size === 'big' ? 1.45 : 1
  const W = Math.round(34 * k)
  const H = Math.round(40 * k)
  const S = (v: number) => Math.round(v * k)
  const b = createBitmap(W, H)
  // legs
  rect(b, S(8), S(28), S(7), S(11), stone.d)
  rect(b, S(19), S(28), S(7), S(11), stone.m)
  // torso block
  rect(b, S(5), S(10), S(24), S(19), stone.m)
  rect(b, S(5), S(10), S(24), S(3), stone.l)
  vline(b, S(28), S(10), S(19), stone.d)
  for (let y = S(15); y < S(28); y += S(5)) hline(b, S(6), y, S(22), stone.d) // cracks/seams
  // core
  ellipse(b, S(14), S(16), S(7), S(7), glow)
  set(b, S(16), S(18), WHITE_PX)
  // arms
  rect(b, S(0), S(11), S(6), S(17), stone.d)
  rect(b, S(28), S(11), S(6), S(17), stone.m)
  // head
  rect(b, S(11), S(2), S(12), S(9), stone.m)
  hline(b, S(11), S(2), S(12), stone.l)
  rect(b, S(18), S(5), S(3), S(2), glow)
  return outline(b, INK)
}

function shark(): Bitmap {
  const b = createBitmap(40, 24)
  const skin = ramp('#2a3e5a', '#4a6a8e', '#8aa8c8')
  // tail
  line(b, 6, 12, 0, 4, skin.d)
  line(b, 6, 12, 0, 20, skin.d)
  rect(b, 0, 4, 2, 17, skin.d)
  // body
  ellipse(b, 4, 6, 32, 13, skin.m)
  ellipse(b, 10, 12, 22, 6, hex('#d8e4ec')) // belly
  // dorsal fin
  for (let i = 0; i < 7; i++) hline(b, 16 + i, 6 - i, 7 - i, skin.d)
  // eye + teeth
  set(b, 31, 9, INK)
  for (let x = 28; x < 36; x += 2) set(b, x, 14, WHITE_PX)
  hline(b, 27, 13, 9, INK)
  return outline(b, INK)
}

/** A tentacled horror; `big` for the kraken, small for its spawn. */
function kraken(big: boolean): Bitmap {
  const k = big ? 1.6 : 1
  const S = (v: number) => Math.round(v * k)
  const b = createBitmap(S(36), S(34))
  const flesh = ramp('#3a1a3e', '#6a2e6a', '#9a5a9a')
  for (let i = 0; i < 6; i++) {
    const x = S(4 + i * 5)
    line(b, x, S(20), x - S(2) + (i % 2) * S(4), S(33), flesh.d)
    line(b, x + 1, S(20), x - S(1) + (i % 2) * S(4), S(33), flesh.m)
  }
  ellipse(b, S(5), S(2), S(26), S(22), flesh.m)
  ellipse(b, S(9), S(4), S(12), S(9), flesh.l)
  ellipse(b, S(19), S(10), S(7), S(6), hex('#ffe07a'))
  rect(b, S(22), S(11), S(2), S(4), INK)
  return outline(b, INK)
}

function chimera(): Bitmap {
  const b = quadruped(ramp('#6a3a14', '#a8642a', '#d8a050'), hex('#ffe07a'), true)
  // goat horn + serpent tail
  line(b, 30, 4, 26, 0, BONE.l)
  line(b, 31, 4, 27, 0, BONE.m)
  line(b, 2, 12, 0, 4, hex('#3a6a2e'))
  set(b, 0, 3, RED_EYE)
  return outline(b, INK)
}

function wraith(): Bitmap {
  const b = createBitmap(26, 34)
  const mist = ramp('#2a2440', '#4a4270', '#8a80b8')
  for (let i = 0; i < 5; i++) line(b, 6 + i * 3, 22, 4 + i * 4, 33, i % 2 ? mist.d : mist.m) // tattered hem
  ellipse(b, 3, 6, 20, 20, mist.m)
  ellipse(b, 6, 2, 13, 13, mist.d) // hood
  ellipse(b, 9, 5, 7, 8, INK)
  set(b, 11, 8, hex('#7af0ff'))
  set(b, 14, 8, hex('#7af0ff'))
  line(b, 20, 14, 25, 10, mist.l) // reaching arm
  return outline(b, INK)
}

function egg(): Bitmap {
  const b = createBitmap(30, 36)
  const shell = ramp('#3a1a2e', '#6a2e4e', '#a85a7a')
  ellipse(b, 2, 2, 26, 33, shell.m)
  ellipse(b, 6, 6, 10, 14, shell.l)
  line(b, 12, 12, 18, 20, INK) // crack
  line(b, 18, 20, 15, 26, INK)
  ellipse(b, 15, 18, 4, 4, hex('#ff5a3a'))
  return outline(b, INK)
}

function brood(): Bitmap {
  return quadruped(ramp('#2a0e2a', '#5a1e5a', '#8a3a8a'), hex('#ff5a3a'), false)
}

/** A floating shard of the Fragment Series (dark crystal). */
function fragmentShard(): Bitmap {
  const b = createBitmap(22, 34)
  const c = ramp('#140e24', '#3a2a6a', '#8a7ae0')
  for (let i = 0; i < 12; i++) hline(b, 11 - Math.floor(i / 2), 2 + i, 1 + i, i % 3 === 0 ? c.l : c.m)
  for (let i = 0; i < 12; i++) hline(b, 5 + Math.floor(i / 2), 14 + i, 12 - i, c.d)
  vline(b, 11, 4, 20, hex('#c8b8ff'))
  set(b, 8, 30, c.l)
  set(b, 14, 32, c.l)
  return outline(b, INK)
}

function voidSpawn(): Bitmap {
  const b = createBitmap(30, 28)
  const v = ramp('#06040c', '#1a1030', '#3a2a5a')
  ellipse(b, 2, 6, 26, 20, v.m)
  ellipse(b, 6, 4, 14, 10, v.d)
  for (let i = 0; i < 7; i++) set(b, 4 + i * 3, 4 + ((i * 5) % 16), hex('#ff3aff'))
  rect(b, 16, 12, 6, 2, hex('#ff3aff'))
  for (let i = 0; i < 4; i++) line(b, 6 + i * 6, 24, 4 + i * 6, 27, v.d)
  return outline(b, INK)
}

const SCALY = ramp('#1e4a2a', '#3a7a3e', '#6aa85a')
const SEA_SKIN = ramp('#1e4a5a', '#3a7a8a', '#7ab8c0')
const DEMON_SKIN = ramp('#5a0e0e', '#9a2a1e', '#d0503a')
const PALE = ramp('#8a8a9a', '#c0c0d0', '#e8e8f4')
const FAIR = ramp('#b87450', '#e3a878', '#f6c79c')
const VOID_CLOTH = ramp('#06040c', '#1a1030', '#3a2a5a')
const ORDER_CLOTH = ramp('#6a6a7a', '#a8a8ba', '#e0e0ec')

/** A lizardman: scaly skin plus a tail. */
function lizard(over: Partial<HeroLook>): Bitmap {
  return humanoid(baseLook({ skin: SCALY, hair: SCALY, hairStyle: 'buzz', eyes: hex('#ffd24a'), ...over }), (b) => {
    line(b, 6, 24, 1, 29, SCALY.d)
    line(b, 6, 25, 2, 30, SCALY.m)
  })
}

// ── registry ─────────────────────────────────────────────────────────────────

/** One drawer per template; the animated ones take the idle frame (the rest get `idleFrame`). */
const DRAWERS: Record<string, (f: IdleFrame) => Bitmap> = {
  goblin: () =>
    humanoid(baseLook({}), (b) => {
      // pointy ears
      set(b, 19, 8, GOBLIN_SKIN.m)
      set(b, 20, 7, GOBLIN_SKIN.m)
      set(b, 21, 6, GOBLIN_SKIN.l)
    }),
  wolf: () => quadruped(ramp('#4a4a5a', '#7a7a8a', '#b0b0c0'), hex('#ffd24a'), false),
  beast: () => quadruped(ramp('#2a1a14', '#5a3424', '#8a5a3a'), RED_EYE, true),
  harpy,
  skeleton: () =>
    humanoid(
      baseLook({
        skin: BONE,
        hair: BONE,
        eyes: INK,
        outfit: 'thief',
        cloth: ramp('#2a2a30', '#44444e', '#5e5e6a'),
        cloth2: ramp('#8e8672', '#d0c8aa', '#f4eed8'),
        accent: ramp('#3a3a40', '#5a5a64', '#7a7a86'),
        weapon: 'sword',
      }),
      (b) => {
        hline(b, 13, 13, 4, INK) // jaw
        set(b, 15, 11, INK)
      },
    ),
  soldier: () =>
    humanoid(
      baseLook({
        skin: ramp('#b87450', '#e3a878', '#f6c79c'),
        eyes: INK,
        outfit: 'spearman',
        cloth: ramp('#3a3a4a', '#5a5a6e', '#7e7e96'),
        headgear: 'helm',
        weapon: 'spear',
      }),
    ),
  ogre_brute: ogre,
  mimic,
  dark_mage: () =>
    humanoid(
      baseLook({
        skin: ramp('#8a7a8a', '#c0b0c0', '#e0d4e0'),
        outfit: 'mage',
        cloth: ramp('#2a1240', '#4a2270', '#6e3aa0'),
        accent: ELEMENT_RAMP.dark,
        headgear: 'hood',
        weapon: 'staff',
      }),
    ),
  black_priest: drawBlackPriest,
  lv999_creature: lv999,
  assassin: () =>
    humanoid(
      baseLook({
        skin: ramp('#8a6a5a', '#c09a82', '#dcbca4'),
        outfit: 'thief',
        cloth: ramp('#0e0c14', '#1e1a28', '#34304a'),
        accent: ramp('#5a0e1e', '#9a1a2e', '#d0404a'),
        headgear: 'hood',
        weapon: 'daggers',
      }),
    ),
  knight: () =>
    humanoid(
      baseLook({
        skin: ramp('#b87450', '#e3a878', '#f6c79c'),
        eyes: INK,
        outfit: 'warrior',
        cloth: ramp('#2a2a3a', '#44445a', '#666680'),
        accent: GOLD,
        headgear: 'helm',
        weapon: 'sword',
        shield: true,
      }),
    ),
  halgiraf,
  // Act III — the Swamp
  lizardman: () => lizard({ outfit: 'warrior', cloth: ramp('#3a2e1e', '#5a4a2e', '#7a6644'), weapon: 'sword', shield: true }),
  lizard_shaman: () => lizard({ outfit: 'mage', cloth: ramp('#1e3a4a', '#2e5a6e', '#4a8aa0'), weapon: 'staff', headgear: 'hood' }),
  lizard_rider: () => lizard({ outfit: 'spearman', cloth: ramp('#4a2e1a', '#7a4a2a', '#a8703e'), weapon: 'spear' }),
  lizard_chief: () =>
    lizard({ outfit: 'warrior', cloth: ramp('#5a1414', '#8a2424', '#c04040'), weapon: 'club', headgear: 'helm', cape: GOLD, trim: true }),
  mud_golem: () => golem(ramp('#3a2a1a', '#5e4a30', '#8a6e4a'), hex('#c8a04a'), 'small'),
  mage_golem: () => golem(ramp('#2a2a3a', '#4a4a64', '#7a7a9a'), hex('#7af0ff'), 'small'),
  kurushahr: () =>
    humanoid(baseLook({ skin: PALE, eyes: hex('#7af0ff'), outfit: 'mage', cloth: ramp('#1e1a3a', '#34306a', '#5a54a0'), headgear: 'hood', weapon: 'staff', trim: true, accent: GOLD })),
  stone_statue: () => golem(ramp('#5a5a5a', '#8a8a86', '#b8b8b0'), hex('#ff5a3a'), 'huge'),
  crystal_core: () => fragmentShardTinted(ramp('#6a5a1e', '#c8b04a', '#fff0a0')),

  // Act IV — the Drowned Coast
  shark,
  merman: () =>
    humanoid(baseLook({ skin: SEA_SKIN, hair: ramp('#0e2a3a', '#1e4a5a', '#3a7a8a'), eyes: hex('#ffd24a'), outfit: 'spearman', cloth: ramp('#1e3a4a', '#2e5a6e', '#4a8aa0'), weapon: 'spear' })),
  kraken_spawn: () => kraken(false),
  kraken: () => kraken(true),
  guardian_golem: () => golem(ramp('#2a3a4a', '#4a6a7a', '#7a9aaa'), hex('#4aa3ff'), 'big'),
  jewel_guardian: () => golem(ramp('#1e2a4a', '#34487a', '#5a74b0'), hex('#3a6aff'), 'big'),
  kthat: (f) => dragon(ramp('#0e2a3a', '#1e5a6e', '#3a8aa0'), ramp('#6a8a8a', '#9ac0c0', '#cce8e8'), ramp('#0e1e2a', '#1e3a4a', '#3a6a7a'), f),
  // Act V — the Order's War
  order_soldier: () =>
    humanoid(baseLook({ skin: FAIR, eyes: INK, outfit: 'spearman', cloth: ORDER_CLOTH, headgear: 'helm', weapon: 'spear', accent: GOLD })),
  dark_knight: () =>
    humanoid(baseLook({ skin: PALE, eyes: RED_EYE, outfit: 'warrior', cloth: ramp('#0e0c14', '#1e1a28', '#34304a'), headgear: 'helm', weapon: 'sword', shield: true, accent: ramp('#3a0a14', '#6a1424', '#9a2a3a') })),
  demon_marksman: () =>
    humanoid(baseLook({ skin: DEMON_SKIN, hair: ramp('#140a0a', '#2a1414', '#4a2424'), eyes: hex('#ffd24a'), outfit: 'archer', cloth: ramp('#2a0e0e', '#4a1a1a', '#7a2a2a'), weapon: 'bow' }), (b) => {
      set(b, 12, 2, BONE.l) // horns
      set(b, 17, 2, BONE.l)
    }),
  order_mage: () => humanoid(baseLook({ skin: FAIR, eyes: INK, outfit: 'mage', cloth: ORDER_CLOTH, headgear: 'hat', weapon: 'staff', accent: GOLD, trim: true })),
  rodvick: drawRodvick,
  lazenca: drawLazenca,
  valention: drawValention,
  versace: drawVersace,
  darkan: drawDarkan,
  egg_brood: brood,
  the_egg: egg,
  order_inquisitor: () =>
    humanoid(baseLook({ skin: FAIR, eyes: INK, outfit: 'mage', cloth: ramp('#5a4a14', '#a8903a', '#e0c870'), headgear: 'hood', weapon: 'staff', trim: true, accent: GOLD })),
  el_cid: drawElCid,
  order_saint: () =>
    humanoid(baseLook({ skin: FAIR, hair: GOLD, hairStyle: 'long', eyes: hex('#2a6ab8'), outfit: 'mage', cloth: ramp('#a8a0b8', '#ece6f4', '#ffffff'), headgear: 'circlet', weapon: 'staff', trim: true, accent: GOLD })),

  // Act VI — the Inflection
  chimera,
  wraith,
  chimera_matriarch: drawChimeraMatriarch,

  // Act VII — the Wailing Wall (the Fragment Series)
  fragment_shard: fragmentShard,
  fragment_knight: () =>
    humanoid(baseLook({ skin: ramp('#140e24', '#3a2a6a', '#8a7ae0'), hair: VOID_CLOTH, eyes: hex('#c8b8ff'), outfit: 'warrior', cloth: ramp('#140e24', '#2a1e4a', '#5a4a9a'), headgear: 'helm', weapon: 'sword', shield: true })),
  fragment_warden: () =>
    humanoid(baseLook({ skin: ramp('#140e24', '#3a2a6a', '#8a7ae0'), hair: VOID_CLOTH, eyes: hex('#c8b8ff'), outfit: 'mage', cloth: ramp('#140e24', '#2a1e4a', '#5a4a9a'), headgear: 'hood', weapon: 'staff' })),
  pryos: drawPryos,
  fragment_colossus: () => golem(ramp('#0e0a1a', '#2a1e4a', '#5a4a9a'), hex('#c8b8ff'), 'huge'),

  // Act VIII — the Unfinished Floors
  void_spawn: voidSpawn,
  abyss_knight: () =>
    humanoid(baseLook({ skin: VOID_CLOTH, hair: VOID_CLOTH, eyes: hex('#ff3aff'), outfit: 'warrior', cloth: VOID_CLOTH, headgear: 'helm', weapon: 'sword', shield: true, accent: ramp('#3a0a3a', '#7a1a7a', '#ff3aff') })),
  herald_of_end: drawHerald,
  // Lane G — the echoes Tell calls back (F100).
  echo_halgiraf: (f) => echoOf(halgiraf, f),
  echo_el_cid: (f) => echoOf(drawElCid, f),
  echo_valention: (f) => echoOf(drawValention, f),
  echo_pryos: (f) => echoOf(drawPryos, f),
  echo_herald: (f) => echoOf(drawHerald, f),
  tell: drawTell,
}

/**
 * An echo (lane G): an anchor boss redrawn in the Architect's spectral light — every pixel's
 * brightness kept, its colour washed to a pale blue-violet, the outline left dark. Tell calls
 * them back in his three drafts.
 */
function echoOf(draw: (f: IdleFrame) => Bitmap, f: IdleFrame): Bitmap {
  const src = draw(f)
  const b = createBitmap(src.w, src.h)
  const deep = hex('#2a2458')
  const pale = hex('#d8e4ff')
  const lumOf = (c: number) => {
    const [r, g, bl] = rgbaParts(c)
    return (r * 3 + g * 6 + bl) / 2550
  }
  // Stretch the sprite's own range of light over the spectral ramp, so a dark dragon and a
  // silver knight both keep their detail (a fixed curve washed El Cid out to a silhouette).
  let lo = 1
  let hi = 0
  for (const c of src.px) {
    if (c === 0 || c === INK) continue
    const l = lumOf(c)
    lo = Math.min(lo, l)
    hi = Math.max(hi, l)
  }
  const span = Math.max(0.05, hi - lo)
  for (let i = 0; i < src.px.length; i++) {
    const c = src.px[i]!
    if (c === 0) continue
    if (c === INK) {
      b.px[i] = c
      continue
    }
    const t = 0.3 + ((lumOf(c) - lo) / span) * 0.65
    b.px[i] = withAlpha(mix(deep, pale, t), c & 255)
  }
  return b
}

/** A crystal shard in another colour (the F30 crystal cores). */
function fragmentShardTinted(c: Ramp): Bitmap {
  const b = createBitmap(22, 34)
  for (let i = 0; i < 12; i++) hline(b, 11 - Math.floor(i / 2), 2 + i, 1 + i, i % 3 === 0 ? c.l : c.m)
  for (let i = 0; i < 12; i++) hline(b, 5 + Math.floor(i / 2), 14 + i, 12 - i, c.d)
  vline(b, 11, 4, 20, WHITE_PX)
  return outline(b, INK)
}

/** The F50 Sealed Object: a glowing reliquary on a plinth (a mission NPC, not a person). */
export function drawReliquary(): Bitmap {
  const b = createBitmap(24, 32)
  const stone = ramp('#4a4452', '#6e6678', '#8e869a')
  rect(b, 3, 22, 18, 9, stone.m)
  hline(b, 2, 22, 20, stone.l)
  roundRect(b, 5, 8, 14, 14, GOLD.m)
  rect(b, 7, 10, 10, 10, hex('#fff0a0'))
  ellipse(b, 9, 12, 6, 6, hex('#ffffff'))
  vline(b, 12, 2, 6, GOLD.l)
  hline(b, 10, 4, 5, GOLD.l)
  return outline(b, INK)
}

/** Drawers that author their own second idle frame (the bosses, the dragons, the echoes). */
const ANIMATED = new Set([
  'black_priest', 'lv999_creature', 'halgiraf', 'kthat', 'rodvick', 'lazenca', 'valention', 'versace', 'darkan', 'el_cid',
  'chimera_matriarch', 'pryos', 'herald_of_end', 'tell', 'echo_halgiraf', 'echo_el_cid', 'echo_valention', 'echo_pryos', 'echo_herald',
])
/** Things that float bob on their second frame instead of breathing. */
const HOVER = new Set(['harpy', 'wraith', 'fragment_shard', 'crystal_core', 'void_spawn'])

/** The boss sprites drawn at native resolution (lane I): bigger than a hero, never upscaled. */
export const BOSS_SPRITES: readonly string[] = [
  'black_priest', 'halgiraf', 'kthat', 'rodvick', 'lazenca', 'valention', 'versace', 'darkan', 'el_cid', 'chimera_matriarch', 'pryos',
  'herald_of_end', 'tell', 'lv999_creature',
]

const cache = new Map<string, Bitmap>()

/**
 * A foe's battle sprite: frame 0 is its standing pose, frame 1 the other half of its idle
 * (a breath, a bob, a wingbeat). Both frames are the same size.
 */
export function drawEnemy(templateId: string, element: Element = 'physical', frame: IdleFrame = 0): Bitmap {
  const key = `${templateId}|${element}|${frame}`
  const hit = cache.get(key)
  if (hit) return hit
  const drawer = DRAWERS[templateId] as ((f: IdleFrame) => Bitmap) | undefined
  let bmp: Bitmap
  if (drawer === undefined) {
    // An unknown template: an element-tinted figure, breathing like everyone else.
    const base = humanoid(baseLook({ accent: ELEMENT_RAMP[element], cloth: ELEMENT_RAMP[element] }))
    bmp = frame === 0 ? base : idleFrame(base, 'breathe')
  } else if (frame === 0 || ANIMATED.has(templateId)) bmp = drawer(frame)
  else bmp = idleFrame(drawEnemy(templateId, element, 0), HOVER.has(templateId) ? 'hover' : 'breathe')
  cache.set(key, bmp)
  return bmp
}

/** Enemies face right; heroes in battle face left — exposed for the battle scene. */
export function enemyFacingLeft(templateId: string, element?: Element): Bitmap {
  return flipX(drawEnemy(templateId, element))
}

export const KNOWN_ENEMIES = Object.keys(DRAWERS)
