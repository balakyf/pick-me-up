import { describe, it, expect } from 'vitest'
import { createBitmap, rect, outline, get, hex, flipX, opaqueCount, CLEAR } from './bitmap'
import { lookForHero, lookForMaster, type LookSource } from './look'
import { drawHeroFrame, drawHeroBust, drawHeroPose, FRAME_W, FRAME_H, BUST, HERO_POSES, KO_H, KO_W } from './heroSprite'
import { BOSS_SPRITES, drawEnemy, KNOWN_ENEMIES } from './enemySprite'
import * as BOSS from './bossSprite'
import { drawBattleBg } from './battleBg'
import { drawTowerExterior, TOWER_H, TOWER_W } from './towerMap'
import { drawSummonCircle } from './summonFx'
import { INK, CLASS_CLOTH, tame } from './palette'
import { hashString } from './rand'
import type { Star } from '../../engine/types'
import { ENEMY_TEMPLATES } from '../../engine/content'

const hero = (over: Partial<LookSource> = {}): LookSource => ({
  id: 'h_000001',
  name: 'Islat Han',
  star: 3,
  heroClass: 'warrior',
  element: 'fire',
  ...over,
})

describe('bitmap core', () => {
  it('parses hex colours as packed RGBA', () => {
    expect(hex('#ff0000')).toBe(0xff0000ff)
    expect(hex('#00ff0080')).toBe(0x00ff0080)
  })

  it('rect clips to bounds', () => {
    const b = createBitmap(4, 4)
    rect(b, -2, -2, 10, 10, hex('#ffffff'))
    expect(opaqueCount(b)).toBe(16)
  })

  it('outline rings opaque pixels with ink and leaves the inside alone', () => {
    const b = createBitmap(5, 5)
    rect(b, 2, 2, 1, 1, hex('#ff0000'))
    const o = outline(b, INK)
    expect(get(o, 2, 2)).toBe(hex('#ff0000'))
    expect(get(o, 1, 2)).toBe(INK)
    expect(get(o, 2, 1)).toBe(INK)
    expect(get(o, 1, 1)).toBe(CLEAR) // 4-neighbourhood only
  })

  it('flipX mirrors columns', () => {
    const b = createBitmap(3, 1)
    rect(b, 0, 0, 1, 1, hex('#ffffff'))
    expect(get(flipX(b), 2, 0)).toBe(hex('#ffffff'))
  })
})

describe('hero looks', () => {
  it('are a pure function of identity', () => {
    expect(lookForHero(hero())).toEqual(lookForHero(hero()))
  })

  it('map canon rarity to garb: 1★ commoner, 2★ mercenary, classed kit at 3★+', () => {
    expect(lookForHero(hero({ star: 1, heroClass: null })).outfit).toBe('peasant')
    expect(lookForHero(hero({ star: 1, heroClass: null })).weapon).toBe('none')
    expect(lookForHero(hero({ star: 2, heroClass: null })).outfit).toBe('merc')
    expect(lookForHero(hero({ heroClass: 'mage' })).weapon).toBe('staff')
    expect(lookForHero(hero({ heroClass: 'archer' })).weapon).toBe('bow')
  })

  it('adds a cape at 4★ and gold trim at 5★', () => {
    expect(lookForHero(hero({ star: 3 })).cape).toBeNull()
    expect(lookForHero(hero({ star: 4 })).cape).not.toBeNull()
    expect(lookForHero(hero({ star: 4 })).trim).toBe(false)
    expect(lookForHero(hero({ star: 5 })).trim).toBe(true)
  })

  it('uses the portraitToken as a palette-tamed signature cloth colour', () => {
    const l = lookForHero(hero({ portraitToken: '#d4af37' }))
    expect(l.cloth.m).toBe(tame(hex('#d4af37'), 0.3, 0.62, 0.32, 0.5))
    const neon = lookForHero(hero({ portraitToken: '#00ff00' }))
    expect(neon.cloth.m).not.toBe(hex('#00ff00')) // tamed into the palette
    const plain = lookForHero(hero({ star: 1, heroClass: null }))
    expect(plain.cloth).toEqual(CLASS_CLOTH.peasant)
  })

  it('promotion re-dresses a hero but never changes their face', () => {
    const before = lookForHero(hero({ star: 2, heroClass: null }))
    for (const heroClass of ['warrior', 'spearman', 'thief', 'archer', 'mage'] as const) {
      const after = lookForHero(hero({ star: 3, heroClass }))
      expect(after.skin).toEqual(before.skin)
      expect(after.hair).toEqual(before.hair)
      expect(after.hairStyle).toBe(before.hairStyle)
      expect(after.eyes).toBe(before.eyes)
      expect(after.mark).toBe(before.mark)
    }
  })

  it('stars escalate the regalia: sash 3★, cape 4★, gem 5★, aura 6★, glowing aura 7★', () => {
    const at = (star: Star) => lookForHero(hero({ star }))
    expect(at(3)).toMatchObject({ sash: true, gem: false, aura: 0 })
    expect(at(3).cape).toBeNull()
    expect(at(4).cape).not.toBeNull()
    expect(at(5)).toMatchObject({ gem: true, trim: true, aura: 0 })
    expect(at(6).aura).toBe(1)
    expect(at(7).aura).toBe(2)
    expect(lookForHero(hero({ star: 2, heroClass: null })).sash).toBe(false)
  })

  it('the master avatar is stable per account', () => {
    expect(lookForMaster('46631913')).toEqual(lookForMaster('46631913'))
  })
})

describe('hero sprites', () => {
  it('produce 24×32 frames in every direction and a 32×32 bust', () => {
    const l = lookForHero(hero())
    for (const d of ['down', 'up', 'left', 'right'] as const) {
      for (const f of [0, 1, 2] as const) {
        const b = drawHeroFrame(l, d, f)
        expect(b.w).toBe(FRAME_W)
        expect(b.h).toBe(FRAME_H)
        expect(opaqueCount(b)).toBeGreaterThan(150)
      }
    }
    const bust = drawHeroBust(l)
    expect(bust.w).toBe(BUST)
    expect(bust.h).toBe(BUST)
  })

  it('are deterministic (same hero ⇒ identical pixels)', () => {
    const a = drawHeroFrame(lookForHero(hero()), 'down', 1)
    const b = drawHeroFrame(lookForHero(hero()), 'down', 1)
    expect(Array.from(a.px)).toEqual(Array.from(b.px))
  })

  it('right is the mirror of left', () => {
    const l = lookForHero(hero())
    expect(Array.from(drawHeroFrame(l, 'right', 2).px)).toEqual(Array.from(flipX(drawHeroFrame(l, 'left', 2)).px))
  })

  it('walk frames differ from the standing frame (the legs move)', () => {
    const l = lookForHero(hero())
    const stand = Array.from(drawHeroFrame(l, 'down', 0).px)
    expect(Array.from(drawHeroFrame(l, 'down', 1).px)).not.toEqual(stand)
    expect(Array.from(drawHeroFrame(l, 'left', 1).px)).not.toEqual(Array.from(drawHeroFrame(l, 'left', 0).px))
  })

  it('every class reads differently: distinct busts and walk frames for the same person', () => {
    const classes = [null, 'warrior', 'spearman', 'thief', 'archer', 'mage'] as const
    const busts = new Set<string>()
    const fronts = new Set<string>()
    const sides = new Set<string>()
    for (const heroClass of classes) {
      const l = lookForHero(hero({ heroClass, star: heroClass === null ? 2 : 3 }))
      busts.add(Array.from(drawHeroBust(l).px).join(','))
      fronts.add(Array.from(drawHeroFrame(l, 'down', 0).px).join(','))
      sides.add(Array.from(drawHeroFrame(l, 'left', 0).px).join(','))
    }
    expect(busts.size).toBe(classes.length)
    expect(fronts.size).toBe(classes.length)
    expect(sides.size).toBe(classes.length)
  })

  it('6★+ carry a translucent aura; 7★ glows harder and its sparkles move with the walk frame', () => {
    const translucent = (b: { px: Uint32Array }) => Array.from(b.px).filter((c) => (c & 255) > 0 && (c & 255) < 255).length
    const bust = (star: Star) => drawHeroBust(lookForHero(hero({ star })))
    expect(translucent(bust(5))).toBe(0)
    expect(translucent(bust(6))).toBeGreaterThan(20)
    expect(translucent(bust(7))).toBeGreaterThan(translucent(bust(6)))
    const seven = lookForHero(hero({ star: 7 }))
    const sparkleAt = (f: 0 | 1 | 2) => Array.from(drawHeroFrame(seven, 'down', f).px.slice(0, FRAME_W * 8)).join(',')
    expect(sparkleAt(0)).not.toBe(sparkleAt(1)) // the top rows hold only aura + sparkles
  })

  it('no duplicates: a spread of summoned heroes all get distinct portraits', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 60; i++) {
      // every gacha hero carries a random portraitToken colour, as the engine rolls it
      const token = '#' + (hashString(`tok${i}`) & 0xffffff).toString(16).padStart(6, '0')
      const b = drawHeroBust(lookForHero(hero({ id: `h_${i}`, name: `Hero ${i}`, portraitToken: token })))
      seen.add(Array.from(b.px).join(','))
    }
    expect(seen.size).toBe(60)
  })
})

describe('enemy sprites', () => {
  it('every authored enemy template has non-empty art', () => {
    for (const t of Object.values(ENEMY_TEMPLATES)) {
      const b = drawEnemy(t.id, t.element)
      expect(opaqueCount(b), t.id).toBeGreaterThan(100)
    }
  })

  it('every template has a bespoke drawer (no silent fallbacks in the tower)', () => {
    for (const t of Object.values(ENEMY_TEMPLATES)) expect(KNOWN_ENEMIES, t.id).toContain(t.id)
  })

  it('every act has its own battle backdrop', () => {
    const seen = new Set<string>()
    const floors = [5, 10, 15, 20, 25, 30, 33, 45, 50, 75, 85, 90, 95, 100]
    for (const f of floors) seen.add(Array.from(drawBattleBg(f).px.slice(0, 20000)).join(','))
    expect(seen.size).toBe(floors.length)
  })

  it('unknown templates fall back to a generic figure instead of blank', () => {
    expect(opaqueCount(drawEnemy('does_not_exist', 'water'))).toBeGreaterThan(100)
  })
})

describe('tower exterior & summon circle', () => {
  it('lights cleared floors and marks the current one; the world greys after F90', () => {
    const early = drawTowerExterior({ current: 5, highest: 4, worldEnded: false, worldSaved: false })
    const late = drawTowerExterior({ current: 60, highest: 59, worldEnded: false, worldSaved: false })
    expect(Array.from(early.px).join()).not.toBe(Array.from(late.px).join())
    const ended = drawTowerExterior({ current: 91, highest: 90, worldEnded: true, worldSaved: false })
    expect(ended.px[(TOWER_H - 4) * TOWER_W + 2]).not.toBe(late.px[(TOWER_H - 4) * TOWER_W + 2])
  })

  it('draws a summoning circle in the rarity colour', () => {
    expect(opaqueCount(drawSummonCircle('#f2c75c'))).toBeGreaterThan(200)
  })
})

/** A boss drawer called fresh (no cache), to prove it is a pure function. */
function drawBoss(id: string, f: 0 | 1) {
  const fns: Record<string, (f: 0 | 1) => ReturnType<typeof BOSS.drawElCid>> = {
    black_priest: BOSS.drawBlackPriest,
    rodvick: BOSS.drawRodvick,
    lazenca: BOSS.drawLazenca,
    valention: BOSS.drawValention,
    versace: BOSS.drawVersace,
    darkan: BOSS.drawDarkan,
    el_cid: BOSS.drawElCid,
    chimera_matriarch: BOSS.drawChimeraMatriarch,
    pryos: BOSS.drawPryos,
    herald_of_end: BOSS.drawHerald,
    tell: BOSS.drawTell,
  }
  return (fns[id] ?? ((g: 0 | 1) => drawEnemy(id, 'physical', g)))(f)
}

describe('boss sprites and idle frames (lane I)', () => {
  it('every template has two idle frames of one size, both drawn, and they differ', () => {
    for (const t of Object.values(ENEMY_TEMPLATES)) {
      const a = drawEnemy(t.id, t.element, 0)
      const b = drawEnemy(t.id, t.element, 1)
      expect([b.w, b.h], t.id).toEqual([a.w, a.h])
      expect(opaqueCount(b), t.id).toBeGreaterThan(100)
      expect(Array.from(b.px).join(), t.id).not.toBe(Array.from(a.px).join())
    }
  })

  it('the anchor bosses are drawn big at native size, not hero-sized or upscaled', () => {
    for (const id of BOSS_SPRITES) {
      const b = drawEnemy(id, 'physical')
      expect(b.h, id).toBeGreaterThanOrEqual(46)
      expect(opaqueCount(b), id).toBeGreaterThan(600) // a hero frame is about 400
    }
    // the six set pieces stand at least twice a hero's height
    for (const id of ['el_cid', 'versace', 'valention', 'pryos', 'herald_of_end', 'tell']) expect(drawEnemy(id, 'physical').h, id).toBeGreaterThanOrEqual(FRAME_H * 2)
  })

  it('no boss sprite is a nearest-neighbour upscale (its pixels do not come in uniform 2×2 blocks)', () => {
    for (const id of BOSS_SPRITES) {
      const b = drawEnemy(id, 'physical')
      let blocky = 0
      let cells = 0
      for (let y = 0; y + 1 < b.h; y += 2)
        for (let x = 0; x + 1 < b.w; x += 2) {
          const c = b.px[y * b.w + x]!
          if (c === CLEAR) continue
          cells++
          if (b.px[y * b.w + x + 1] === c && b.px[(y + 1) * b.w + x] === c && b.px[(y + 1) * b.w + x + 1] === c) blocky++
        }
      expect(blocky / cells, id).toBeLessThan(0.85)
    }
  })

  it('boss sprites are deterministic', () => {
    for (const id of BOSS_SPRITES) for (const f of [0, 1] as const) expect(Array.from(drawBoss(id, f).px)).toEqual(Array.from(drawBoss(id, f).px))
  })

  it("the echoes keep their boss's size and shape in spectral colours", () => {
    for (const [echo, boss] of [['echo_el_cid', 'el_cid'], ['echo_halgiraf', 'halgiraf'], ['echo_herald', 'herald_of_end'], ['echo_pryos', 'pryos'], ['echo_valention', 'valention']] as const) {
      const e = drawEnemy(echo, 'dark')
      const b = drawEnemy(boss, 'dark')
      expect([e.w, e.h], echo).toEqual([b.w, b.h])
      expect(opaqueCount(e), echo).toBe(opaqueCount(b))
      expect(Array.from(e.px).join(), echo).not.toBe(Array.from(b.px).join())
    }
  })
})

describe('hero battle poses (lane I)', () => {
  const classes = [null, 'warrior', 'spearman', 'thief', 'archer', 'mage'] as const
  it('every pose is the frame size (the fallen lie in a wider box), drawn and deterministic', () => {
    for (const heroClass of classes) {
      const l = lookForHero(hero({ heroClass, star: heroClass === null ? 2 : 4 }))
      for (const p of HERO_POSES) {
        const b = drawHeroPose(l, p)
        if (p === 'ko') expect([b.w, b.h]).toEqual([KO_W, KO_H])
        else expect([b.w, b.h]).toEqual([FRAME_W, FRAME_H])
        expect(opaqueCount(b), `${heroClass} ${p}`).toBeGreaterThan(150)
        expect(Array.from(drawHeroPose(l, p).px)).toEqual(Array.from(b.px))
      }
    }
  })

  it('every pose differs from the standing frame and from every other pose', () => {
    for (const heroClass of classes) {
      const l = lookForHero(hero({ heroClass, star: heroClass === null ? 2 : 4 }))
      const seen = new Set<string>([Array.from(drawHeroFrame(l, 'left', 0).px).join()])
      for (const p of HERO_POSES) seen.add(Array.from(drawHeroPose(l, p).px).join())
      expect(seen.size, String(heroClass)).toBe(HERO_POSES.length + 1)
    }
  })

  it('the fallen lie down: wider than tall, resting on the floor of their box', () => {
    const b = drawHeroPose(lookForHero(hero()), 'ko')
    let top = b.h
    let bottom = 0
    let left = b.w
    let right = 0
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++)
        if (b.px[y * b.w + x] !== CLEAR) {
          top = Math.min(top, y)
          bottom = Math.max(bottom, y)
          left = Math.min(left, x)
          right = Math.max(right, x)
        }
    expect(right - left).toBeGreaterThan(bottom - top)
    expect(bottom).toBeGreaterThanOrEqual(KO_H - 2)
  })
})
