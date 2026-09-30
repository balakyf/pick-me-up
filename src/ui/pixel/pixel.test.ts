import { describe, it, expect } from 'vitest'
import { createBitmap, rect, outline, get, hex, flipX, opaqueCount, CLEAR } from './bitmap'
import { lookForHero, lookForMaster, type LookSource } from './look'
import { drawHeroFrame, drawHeroBust, FRAME_W, FRAME_H, BUST } from './heroSprite'
import { drawEnemy, KNOWN_ENEMIES } from './enemySprite'
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
