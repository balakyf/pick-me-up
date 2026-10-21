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
import { ENEMY_TEMPLATES } from '../../engine/content'
import { drawHeroPose, HERO_POSES } from './heroSprite'
import { drawEnemyPose } from './enemySprite'

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

// ── WP8 (spec 2026-10-12 S10): battle poses ─────────────────────────────────

/** A spread that covers every outfit, weapon, headgear, hair style, cape and trim. */
function poseSpread(): LookSource[] {
  const classes = [null, 'warrior', 'spearman', 'thief', 'archer', 'mage'] as const
  const els = ['fire', 'water', 'wind', 'earth', 'light', 'dark', 'physical'] as const
  const out: LookSource[] = []
  for (let i = 0; i < 84; i++) {
    const heroClass = classes[i % classes.length]!
    const star = (heroClass === null ? 1 + (i % 2) : 3 + (i % 5)) as LookSource['star']
    const token = i % 3 === 0 ? '#' + (hashString(`pose${i}`) & 0xffffff).toString(16).padStart(6, '0') : undefined
    out.push({ id: `h_${String(i).padStart(6, '0')}`, name: `Pose ${i}`, star, heroClass, element: els[i % els.length]!, portraitToken: token })
  }
  return out
}

describe('battle poses (WP8)', () => {
  it('the idle pose is pixel-identical to the existing left frame 0 for every kind of hero', () => {
    const looks = [...poseSpread().map(lookForHero), lookForMaster('46631913'), lookForMaster('7')]
    for (const l of looks) {
      expect(Array.from(drawHeroPose(l, 'idle').px)).toEqual(Array.from(drawHeroFrame(l, 'left', 0).px))
    }
  })

  it('every pose frame is 24×32, solid, deterministic and differs from frame 0', () => {
    for (const src of poseSpread()) {
      const l = lookForHero(src)
      const stand = Array.from(drawHeroFrame(l, 'left', 0).px)
      for (const p of HERO_POSES) {
        const b = drawHeroPose(l, p)
        expect(b.w).toBe(FRAME_W)
        expect(b.h).toBe(FRAME_H)
        expect(opaqueCount(b), `${src.id} ${p}`).toBeGreaterThan(150)
        expect(Array.from(drawHeroPose(l, p).px)).toEqual(Array.from(b.px))
        if (p !== 'idle') expect(Array.from(b.px), `${src.id} ${p}`).not.toEqual(stand)
      }
    }
  })

  it('poses are distinct from one another', () => {
    const l = lookForHero(hero())
    const seen = new Set(HERO_POSES.map((p) => Array.from(drawHeroPose(l, p).px).join(',')))
    expect(seen.size).toBe(HERO_POSES.length)
  })

  it('a blink only shuts the eyes (a handful of face pixels change)', () => {
    for (const src of poseSpread().slice(0, 12)) {
      const l = lookForHero(src)
      const a = drawHeroPose(l, 'idle')
      const b = drawHeroPose(l, 'blink')
      let diff = 0
      for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) {
        diff++
        const y = Math.floor(i / FRAME_W)
        expect(y).toBeGreaterThanOrEqual(9)
        expect(y).toBeLessThanOrEqual(12)
      }
      expect(diff).toBeGreaterThan(0)
      expect(diff).toBeLessThanOrEqual(4)
    }
  })

  it('the KO slump stays on the ground line (nothing below row 30)', () => {
    for (const src of poseSpread()) {
      const b = drawHeroPose(lookForHero(src), 'ko')
      for (let x = 0; x < FRAME_W; x++) expect(get(b, x, 31), src.id).toBe(CLEAR)
    }
  })

  it('posing never touches the existing hero looks or walk frames', () => {
    const l = lookForHero(hero())
    const before = Array.from(drawHeroFrame(l, 'down', 1).px)
    for (const p of HERO_POSES) drawHeroPose(l, p)
    expect(lookForHero(hero())).toEqual(l)
    expect(Array.from(drawHeroFrame(l, 'down', 1).px)).toEqual(before)
  })
})

describe('enemy poses (WP8)', () => {
  const poses = ['windup', 'attack', 'cast', 'hurt', 'ko'] as const

  it('idle is exactly the existing enemy art', () => {
    for (const t of Object.values(ENEMY_TEMPLATES)) expect(drawEnemyPose(t.id, t.element, 'idle')).toBe(drawEnemy(t.id, t.element))
  })

  it('every template has every pose: same size as idle, solid, and visibly different', () => {
    for (const t of Object.values(ENEMY_TEMPLATES)) {
      const idle = drawEnemy(t.id, t.element)
      const idlePx = Array.from(idle.px)
      for (const p of poses) {
        const b = drawEnemyPose(t.id, t.element, p)
        expect(b.w, `${t.id} ${p}`).toBe(idle.w)
        expect(b.h, `${t.id} ${p}`).toBe(idle.h)
        expect(opaqueCount(b), `${t.id} ${p}`).toBeGreaterThan(60)
        expect(Array.from(b.px), `${t.id} ${p}`).not.toEqual(idlePx)
      }
      // posing must not mutate the cached idle bitmap
      expect(Array.from(drawEnemy(t.id, t.element).px)).toEqual(idlePx)
    }
  })

  it('humanoid foes wear the hero rig, mirrored to face the party', () => {
    const b = drawEnemyPose('soldier', 'physical', 'attack')
    expect(b.w).toBe(FRAME_W)
    // the posed soldier is a mirrored hero frame: its trail/weapon reaches the RIGHT edge region
    let rightHalf = 0
    let leftHalf = 0
    for (let y = 14; y < 24; y++) for (let x = 0; x < FRAME_W; x++) if (get(b, x, y) !== CLEAR) (x >= 12 ? rightHalf++ : leftHalf++)
    expect(rightHalf).toBeGreaterThan(leftHalf)
  })

  it('goblin ears follow the head when it moves (KO)', () => {
    const idle = drawEnemyPose('goblin', 'earth', 'idle')
    const ko = drawEnemyPose('goblin', 'earth', 'ko')
    expect(get(idle, 21, 6)).not.toBe(CLEAR)
    // the KO head drops 7 rows: the ear tip comes with it
    expect(get(ko, 22, 13)).not.toBe(CLEAR)
  })

  it('unknown templates still pose (the fallback figure)', () => {
    expect(opaqueCount(drawEnemyPose('does_not_exist', 'water', 'hurt'))).toBeGreaterThan(100)
  })
})
