import { describe, it, expect, vi } from 'vitest'
import {
  CLEAR,
  capSaturation,
  chroma,
  createBitmap,
  flashWhite,
  get,
  grade,
  hex,
  luma,
  opaqueBounds,
  opaqueCount,
  outline,
  rect,
  rimLight,
  shear,
  squash,
  vignette,
  type Bitmap,
} from './bitmap'
import { INK } from './palette'
import { actGrade, BG_MAX_CHROMA, drawBattleBg } from './battleBg'
import { drawEnemy, monsterPose } from './enemySprite'

const RED = hex('#c03030')

/** A 10×12 block with an outline, sitting on the bottom row of a 20×20 bitmap. */
function block(): Bitmap {
  const b = createBitmap(20, 20)
  rect(b, 5, 8, 10, 11, RED)
  return outline(b, INK)
}

function frozenCopy(b: Bitmap): number[] {
  return Array.from(b.px)
}

describe('light & motion passes are pure', () => {
  it('never mutate their input', () => {
    const b = block()
    const before = frozenCopy(b)
    flashWhite(b, 1, INK)
    shear(b, 3)
    squash(b, 1.2, 0.6)
    rimLight(b, 'all', hex('#ffffff'), 0.5, INK)
    grade(b, hex('#ff8000'), 0.3)
    capSaturation(b, 0.2)
    vignette(b, 0.5, hex('#000000'))
    expect(frozenCopy(b)).toEqual(before)
  })
})

describe('flashWhite', () => {
  it('whitens the body and keeps the outline ink', () => {
    const b = flashWhite(block(), 1, INK)
    expect(get(b, 10, 12)).toBe(0xffffffff)
    expect(get(b, 4, 12)).toBe(INK)
    expect(get(b, 0, 0)).toBe(CLEAR)
  })
})

describe('shear', () => {
  it('leans the top and keeps the feet planted', () => {
    const src = block()
    const b = shear(src, 2)
    const box = opaqueBounds(b)!
    expect(box.y1).toBe(opaqueBounds(src)!.y1)
    // bottom row unchanged, top row moved right by 2
    expect(get(b, 5, 19)).toBe(get(src, 5, 19))
    expect(get(b, 7, 7)).toBe(get(src, 5, 7))
    expect(opaqueCount(b)).toBe(opaqueCount(src))
  })

  it('clamps to the margin so nothing is clipped', () => {
    const src = block()
    const b = shear(src, 50)
    expect(opaqueCount(b)).toBe(opaqueCount(src))
    expect(opaqueBounds(b)!.x1).toBeLessThanOrEqual(19)
  })
})

describe('squash', () => {
  it('anchors at the feet and keeps the bitmap size', () => {
    const src = block()
    const b = squash(src, 1.2, 0.6)
    expect(b.w).toBe(src.w)
    expect(b.h).toBe(src.h)
    const a = opaqueBounds(src)!
    const z = opaqueBounds(b)!
    expect(z.y1).toBe(a.y1)
    expect(z.y1 - z.y0).toBeLessThan(a.y1 - a.y0)
    expect(z.x1 - z.x0).toBeGreaterThan(a.x1 - a.x0)
  })

  it('never stretches content off the bitmap', () => {
    const full = createBitmap(8, 8)
    rect(full, 0, 0, 8, 8, RED)
    expect(opaqueCount(squash(full, 2, 2))).toBe(64)
  })
})

describe('rimLight, grade, capSaturation', () => {
  it('rim light brightens only the edge facing the light', () => {
    const src = block()
    const b = rimLight(src, 'left', hex('#ffffff'), 0.5, INK)
    expect(get(b, 5, 12)).not.toBe(RED) // the first body pixel inside the left outline
    expect(get(b, 10, 12)).toBe(RED) // the interior is untouched
    expect(get(b, 14, 12)).toBe(RED) // the right edge is untouched
  })

  it('grade keeps alpha and roughly keeps luma', () => {
    const b = grade(block(), hex('#4080ff'), 0.5)
    const c = get(b, 10, 12)
    expect(c & 255).toBe(255)
    expect(Math.abs(luma(c) - luma(RED))).toBeLessThanOrEqual(12)
    expect(get(b, 0, 0)).toBe(CLEAR)
  })

  it('caps chroma and leaves calm colours alone', () => {
    const neon = createBitmap(2, 1)
    rect(neon, 0, 0, 1, 1, hex('#ff00ff'))
    rect(neon, 1, 0, 1, 1, hex('#808078'))
    const b = capSaturation(neon, 0.5)
    expect(chroma(get(b, 0, 0))).toBeLessThanOrEqual(0.51)
    expect(get(b, 1, 0)).toBe(hex('#808078'))
  })
})

describe('battle backdrop light pass (V8)', () => {
  const floors = [5, 10, 15, 20, 25, 30, 33, 45, 50, 75, 85, 90, 95, 100, 0]

  it('every act has a subtle grade', () => {
    for (const f of floors) {
      const g = actGrade(f)
      expect(g.amt).toBeGreaterThan(0)
      expect(g.amt).toBeLessThanOrEqual(0.12)
    }
  })

  it('grades, caps saturation and vignettes, but light:false is the raw art', () => {
    for (const f of [5, 85, 95]) {
      const lit = drawBattleBg(f)
      const raw = drawBattleBg(f, { light: false })
      expect(lit.w).toBe(raw.w)
      expect(Array.from(lit.px)).not.toEqual(Array.from(raw.px))
      let maxChroma = 0
      for (let i = 0; i < lit.px.length; i++) maxChroma = Math.max(maxChroma, chroma(lit.px[i]!))
      expect(maxChroma).toBeLessThanOrEqual(BG_MAX_CHROMA + 0.01)
      // the vignette darkens corners, not the centre
      const cx = (lit.h / 2) * lit.w + lit.w / 2
      // (an already-black corner can only lift by the vignette ink's own few levels)
      expect(luma(lit.px[0]!)).toBeLessThanOrEqual(Math.max(luma(raw.px[0]!) - 10, 6))
      expect(Math.abs(luma(lit.px[cx]!) - luma(raw.px[cx]!))).toBeLessThanOrEqual(20)
    }
  })

  it('is deterministic', () => {
    expect(Array.from(drawBattleBg(33).px)).toEqual(Array.from(drawBattleBg(33).px))
  })
})

describe('monster poses', () => {
  it('a hurt monster flashes white but keeps its ink outline', () => {
    const idle = drawEnemy('wolf', 'physical')
    const hurt = monsterPose(idle, 'hurt')
    let ink = 0
    let inkIdle = 0
    for (let i = 0; i < idle.px.length; i++) {
      if (idle.px[i] === INK) inkIdle++
      if (hurt.px[i] === INK) ink++
    }
    expect(ink).toBeGreaterThan(inkIdle * 0.8)
  })

  it('a KO monster is flatter than it stood', () => {
    const idle = drawEnemy('mud_golem', 'earth')
    const ko = monsterPose(idle, 'ko')
    const a = opaqueBounds(idle)!
    const z = opaqueBounds(ko)!
    expect(z.y1 - z.y0).toBeLessThan(a.y1 - a.y0)
    expect(z.y1).toBe(a.y1)
  })

  it('blink and idle are the art itself (monsters do not blink)', () => {
    const idle = drawEnemy('kraken', 'water')
    expect(monsterPose(idle, 'idle')).toBe(idle)
    expect(monsterPose(idle, 'blink')).toBe(idle)
  })
})

describe('enemy pose cache isolation', () => {
  it('drawing a posed humanoid first never leaves a posed frame in the idle cache', async () => {
    vi.resetModules()
    const a = await import('./enemySprite')
    const posedFirst = a.drawEnemyPose('goblin', 'fire', 'ko')
    const idleAfter = Array.from(a.drawEnemy('goblin', 'fire').px)
    vi.resetModules()
    const b = await import('./enemySprite')
    expect(idleAfter).toEqual(Array.from(b.drawEnemy('goblin', 'fire').px))
    expect(Array.from(posedFirst.px)).not.toEqual(idleAfter)
  })
})
