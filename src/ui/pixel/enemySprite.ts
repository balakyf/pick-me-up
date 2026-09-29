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

function lv999(): Bitmap {
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
    line(b, x, 46, x - 3 + (i % 2) * 6, 58, flesh.d)
    line(b, x + 1, 46, x - 2 + (i % 2) * 6, 58, flesh.m)
  }
  ellipse(b, 3, 10, 54, 42, flesh.m)
  ellipse(b, 10, 14, 30, 20, flesh.l)
  ellipse(b, 30, 30, 24, 20, flesh.d)
  // eyes
  const eyes: [number, number, number][] = [[18, 22, 6], [34, 18, 8], [44, 30, 5], [24, 34, 4], [12, 32, 3], [38, 40, 4]]
  for (const [x, y, r] of eyes) {
    ellipse(b, x, y, r + 2, r, hex('#ffe0a0'))
    rect(b, x + Math.floor(r / 2), y + 1, 2, Math.max(1, r - 2), RED_EYE)
  }
  // maw
  hline(b, 16, 44, 26, INK)
  for (let x = 17; x < 42; x += 3) set(b, x, 43, BONE.l)
  return outline(b, INK)
}

// ── registry ─────────────────────────────────────────────────────────────────

const DRAWERS: Record<string, () => Bitmap> = {
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
  black_priest: () =>
    humanoid(
      baseLook({
        skin: ramp('#7a6a6a', '#b0a0a0', '#d4c8c8'),
        outfit: 'mage',
        cloth: ramp('#0e0c14', '#1e1a28', '#34304a'),
        accent: GOLD,
        headgear: 'hood',
        weapon: 'staff',
        trim: true,
        cape: ramp('#3a0a14', '#6a1424', '#9a2a3a'),
      }),
    ),
  lv999_creature: lv999,
}

const cache = new Map<string, Bitmap>()

export function drawEnemy(templateId: string, element: Element = 'physical'): Bitmap {
  const key = `${templateId}|${element}`
  const hit = cache.get(key)
  if (hit) return hit
  const drawer = DRAWERS[templateId]
  const bmp = drawer ? drawer() : humanoid(baseLook({ accent: ELEMENT_RAMP[element], cloth: ELEMENT_RAMP[element] }))
  cache.set(key, bmp)
  return bmp
}

/** Enemies face right; heroes in battle face left — exposed for the battle scene. */
export function enemyFacingLeft(templateId: string, element?: Element): Bitmap {
  return flipX(drawEnemy(templateId, element))
}

export const KNOWN_ENEMIES = Object.keys(DRAWERS)
