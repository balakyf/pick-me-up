/** WP7 (spec 2026-10-12): the lock sign art, its placement, and the shell's French. */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { opaqueCount } from '../pixel/bitmap'
import { MAP_H, MAP_W, PROPS, isAdjacentTo, propForPlace, tileAt, BUILDINGS } from '../world/lobbyMap'
import { FR } from '../i18n/fr'
import { FR_SHELL } from '../i18n/frShell'
import { CORE_PLACES, MENU_ORDER } from './unlocks'
import { SIGN_H, SIGN_W, drawLockSign, signTileFor } from './lockSign'
import { sparkleSpots } from './UnlockBanner'
import { ISEL_COACH, iselCoach } from '../world/lines'
import { setLocale } from '../i18n/i18n'

describe('the boarded sign', () => {
  it('is a 16×18 sprite with a solid silhouette', () => {
    const b = drawLockSign()
    expect([b.w, b.h]).toEqual([SIGN_W, SIGN_H])
    expect(opaqueCount(b)).toBeGreaterThan(120)
  })

  it('stands on the map, outside any building but the Great Hall, and never on a door', () => {
    const doors = new Set(BUILDINGS.flatMap((b) => b.doors.map((d) => `${d.x},${d.y}`)))
    for (const p of MENU_ORDER.filter((x) => !CORE_PLACES.includes(x))) {
      const at = signTileFor(p)
      expect(at.x, p).toBeGreaterThanOrEqual(0)
      expect(at.y, p).toBeGreaterThanOrEqual(0)
      expect(at.x, p).toBeLessThan(MAP_W)
      expect(at.y, p).toBeLessThan(MAP_H)
      expect(doors.has(`${at.x},${at.y}`), `${p} sign on a door`).toBe(false)
      // A building's sign is outside its walls, within two tiles of its door.
      const prop = propForPlace(p)
      const b = BUILDINGS.find((x) => x.id !== 'hall' && prop.x >= x.rect.x && prop.x < x.rect.x + x.rect.w && prop.y >= x.rect.y && prop.y < x.rect.y + x.rect.h)
      if (b) {
        const inside = at.x >= b.rect.x && at.x < b.rect.x + b.rect.w && at.y >= b.rect.y && at.y < b.rect.y + b.rect.h
        expect(inside, `${p} sign inside ${b.id}`).toBe(false)
        expect(Math.min(...b.doors.map((d) => Math.abs(d.x - at.x) + Math.abs(d.y - at.y))), p).toBeLessThanOrEqual(3)
      } else {
        expect(isAdjacentTo(prop, at.x, at.y) || (at.x === prop.x + prop.w && at.y === prop.y), p).toBe(true)
      }
      expect(tileAt(at.x, at.y)).toBeDefined()
    }
    expect(PROPS.length).toBeGreaterThan(0)
  })
})

describe('the fanfare is deterministic', () => {
  it('sparkles sit at the same place-specific spots every time, inside the art box', () => {
    expect(sparkleSpots('kitchen')).toEqual(sparkleSpots('kitchen'))
    expect(sparkleSpots('kitchen')).not.toEqual(sparkleSpots('forge' as never))
    for (const s of sparkleSpots('library')) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(100)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(100)
    }
  })
})

/** Every literal `t('…')` key in a source file. */
function tKeys(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const out: string[] = []
  for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) out.push(m[1]!.replace(/\\'/g, "'"))
  return out
}

/** Every literal string that is passed to `t()` indirectly (tables of English source). */
function tableStrings(file: string, table: string): string[] {
  const src = readFileSync(file, 'utf8')
  const start = src.indexOf(table)
  const body = src.slice(start, src.indexOf('\n}', start))
  return [...body.matchAll(/:\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]!)
}

describe('French for every shell string', () => {
  const here = __dirname
  const files = [
    ...readdirSync(here)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
      .map((f) => join(here, f)),
    join(here, '../App.tsx'),
    join(here, '../life/FirstSteps.tsx'),
  ]

  it('every t() key in the shell has a French entry', () => {
    const missing: string[] = []
    for (const f of files) for (const k of tKeys(f)) if (!(k in FR) && k !== 'pmu:backup') missing.push(`${f.split('/').pop()}: ${k}`)
    expect(missing).toEqual([])
  })

  it('so do the tables of English that the shell translates', () => {
    const strings = [
      ...tableStrings(join(here, 'unlocks.ts'), 'const EVENT_TEXT'),
      ...tableStrings(join(here, 'unlocks.ts'), 'const UNLOCK_LINE'),
      ...tableStrings(join(here, 'goals.ts'), 'const THREAT_TEXT'),
      ...Object.values(ISEL_COACH),
    ]
    expect(strings.length).toBeGreaterThan(25)
    expect(strings.filter((s) => !(s in FR_SHELL))).toEqual([])
  })

  it('Isel coaches the first decisions in both languages', () => {
    expect(iselCoach('decisive')).toBe('Your orders change fate. Try Protect.')
    setLocale('fr')
    try {
      expect(iselCoach('decisive')).toBe('Vos ordres changent le destin. Essayez Protéger.')
      expect(iselCoach('doors')).toMatch(/^Deux portes, Maître\./)
    } finally {
      setLocale('en')
    }
  })
})
