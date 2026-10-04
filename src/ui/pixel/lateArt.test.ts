/**
 * Lane Q's art: the last seven native boss sprites, the campus architecture (a roof per
 * building, upgrades on show, night lights) and the place icon set.
 */
import { describe, expect, it } from 'vitest'
import { opaqueCount } from './bitmap'
import { BOSS_SPRITES, drawEnemy, KNOWN_ENEMIES } from './enemySprite'
import { LATE_BOSSES } from './lateBosses'
import { ARCHITECTURE, BUILDING_FACILITY, ROOF_SPIRE, buildingLevel, drawArchitecture, drawRoofLights } from './architecture'
import { PLACE_ICONS, placeIconBitmap, placeIconMask } from './placeIcons'
import { BUILDINGS, PLACE_LABEL, type PlaceId } from '../world/lobbyMap'
import { MENU_PLACES, PLACE_ICON } from '../world/LobbyWorld'
import { ENEMY_TEMPLATES } from '../../engine/content'
import { createAccount } from '../../engine/account'
import { enemyTemplateIdForName } from './sprites'

describe('the last seven bosses (lane I’s leftover)', () => {
  const ids = Object.keys(LATE_BOSSES)

  it('are the seven, real templates, drawn natively and counted among the boss sprites', () => {
    expect(ids.sort()).toEqual(['fragment_colossus', 'kraken', 'kurushahr', 'lizard_chief', 'order_inquisitor', 'order_saint', 'stone_statue'])
    for (const id of ids) {
      expect(ENEMY_TEMPLATES[id], id).toBeDefined()
      expect(KNOWN_ENEMIES).toContain(id)
      expect(BOSS_SPRITES).toContain(id)
      const b = drawEnemy(id, 'physical', 0)
      expect(b.h, id).toBeGreaterThanOrEqual(56)
      expect(opaqueCount(b), id).toBeGreaterThan(900)
    }
  })

  it('are deterministic, with an authored second frame of the same size', () => {
    for (const id of ids) {
      const a = LATE_BOSSES[id]!(0)
      expect(Array.from(LATE_BOSSES[id]!(0).px), id).toEqual(Array.from(a.px))
      const f = LATE_BOSSES[id]!(1)
      expect([f.w, f.h], id).toEqual([a.w, a.h])
      expect(Array.from(f.px).join(), id).not.toBe(Array.from(a.px).join())
      expect(Array.from(drawEnemy(id, 'dark', 1).px), id).toEqual(Array.from(f.px))
    }
  })

  it('the guild’s weekly Colossus wears the Fragment Colossus', () => {
    expect(enemyTemplateIdForName('Guild Colossus')).toBe('fragment_colossus')
  })
})

describe('campus architecture', () => {
  it('gives every building a roof of its own, the size of its footprint plus the spire and the sign', () => {
    const seen = new Set<string>()
    for (const b of BUILDINGS) {
      expect(ARCHITECTURE[b.id], b.id).toBeDefined()
      const bmp = drawArchitecture(b, 3)
      expect(bmp.w).toBe(b.rect.w * 16)
      expect(bmp.h).toBeGreaterThan((b.rect.h - 1) * 16 + ROOF_SPIRE)
      expect(opaqueCount(bmp)).toBeGreaterThan(bmp.w * (b.rect.h - 1) * 12)
      seen.add(Array.from(bmp.px.slice(0, bmp.w * 40)).join())
    }
    expect(seen.size).toBe(BUILDINGS.length)
  })

  it('is deterministic per building and level, and the upgrades show (studs, gilding, pennants, finial)', () => {
    for (const b of BUILDINGS) {
      expect(Array.from(drawArchitecture(b, 5).px)).toEqual(Array.from(drawArchitecture(b, 5).px))
      const lv = [0, 1, 4, 7, 10].map((l) => opaqueCount(drawArchitecture(b, l)))
      for (let i = 1; i < lv.length; i++) expect(lv[i]!, `${b.id} L${i}`).toBeGreaterThanOrEqual(lv[i - 1]!)
      expect(Array.from(drawArchitecture(b, 10).px).join()).not.toBe(Array.from(drawArchitecture(b, 0).px).join())
    }
  })

  it('lights windows at night, the same size as the roof', () => {
    for (const b of BUILDINGS) {
      const lit = drawRoofLights(b, 2)
      const roof = drawArchitecture(b, 2)
      expect([lit.w, lit.h]).toEqual([roof.w, roof.h])
      expect(opaqueCount(lit), b.id).toBeGreaterThan(8)
      expect(Array.from(drawRoofLights(b, 2).px)).toEqual(Array.from(lit.px))
    }
  })

  it('reads each building’s level from its facility (clamped), none for the hall', () => {
    const s = createAccount(5)
    const up = { ...s, facilities: { ...s.facilities, kitchen: { ...s.facilities.kitchen, level: 14 } } }
    expect(buildingLevel(up, 'kitchen')).toBe(10)
    expect(buildingLevel(up, 'hall')).toBe(0)
    for (const f of Object.values(BUILDING_FACILITY)) expect(s.facilities[f!], f).toBeDefined()
  })
})

describe('the place icon set (lane H’s leftover)', () => {
  const places = Object.keys(PLACE_ICON) as PlaceId[]

  it('covers every place of the campus, the menu and the labels', () => {
    expect(places.length).toBe(25)
    for (const p of places) expect(PLACE_ICONS[p], p).toBeDefined()
    for (const p of MENU_PLACES) expect(PLACE_ICONS[p], p).toBeDefined()
    for (const p of Object.keys(PLACE_LABEL)) expect(PLACE_ICONS[p as PlaceId], p).toBeDefined()
    expect(Object.keys(PLACE_ICONS).sort()).toEqual([...places].sort())
  })

  it('every icon paints at 14×14 with a rim, keeps the emoji as fallback, and no two share a silhouette', () => {
    for (const p of places) {
      const b = placeIconBitmap(p)
      expect([b.w, b.h], p).toEqual([14, 14])
      expect(opaqueCount(b), p).toBeGreaterThan(40)
      expect(PLACE_ICONS[p].glyph).toBe(PLACE_ICON[p])
      expect(Array.from(placeIconBitmap(p).px)).toEqual(Array.from(b.px))
    }
    expect(new Set(places.map(placeIconMask)).size).toBe(places.length)
  })
})
