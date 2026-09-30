import { describe, expect, it } from 'vitest'
import { ELEMENT_VIS } from '../bits'
import { seededRand } from '../pixel/rand'
import {
  battleKeyAction,
  burstParams,
  emitCount,
  fitStage,
  hudBeside,
  isTypingTarget,
  spawnBurst,
  spawnWeather,
  SPARK_COLORS,
  stepParticles,
  STAGE_MAX_W,
  STAGE_MIN_W,
  WEATHER,
  weatherForFloor,
} from './battleFx'
import type { Element } from '../../engine/types'

const rnd = () => {
  const r = seededRand(42)
  return () => r.next()
}

describe('weather per act', () => {
  it('each act has its own weather', () => {
    expect(weatherForFloor(5)).toBe('pollen') // the prairie
    expect(weatherForFloor(15)).toBe('dust') // the ruins
    expect(weatherForFloor(25)).toBe('rain') // the swamp
    expect(weatherForFloor(33)).toBe('spray') // the drowned coast
    expect(weatherForFloor(45)).toBe('embers') // the Order's war
    expect(weatherForFloor(75)).toBe('ash') // the inflection
    expect(weatherForFloor(85)).toBe('darksnow') // the Wailing Wall
    expect(weatherForFloor(95)).toBe('glitch') // the unfinished floors
  })

  it('anchors burn or glow in their own way; the depths have motes', () => {
    expect(weatherForFloor(10)).toBe('embers') // the falling city
    expect(weatherForFloor(20)).toBe('embers') // the lair
    expect(weatherForFloor(50)).toBe('motes') // the Egg's vault
    expect(weatherForFloor(100)).toBe('sunmotes') // the summit
    expect(weatherForFloor(0)).toBe('motes')
    expect(weatherForFloor(250)).toBe('motes')
  })

  it('every weather is well-formed', () => {
    for (const spec of Object.values(WEATHER)) {
      expect(spec.streams.length).toBeGreaterThan(0)
      for (const s of spec.streams) {
        expect(s.rate).toBeGreaterThan(0)
        expect(s.colors.length).toBeGreaterThan(0)
        expect(s.life[0]).toBeLessThanOrEqual(s.life[1])
      }
    }
  })

  it('emission keeps its fraction and scales with density and width', () => {
    let carry = 0
    let n = 0
    for (let i = 0; i < 100; i++) {
      const out = emitCount(10, 0.01, 1, 384, carry)
      n += out.n
      carry = out.carry
    }
    expect(n + carry).toBeCloseTo(10) // 10 per second over one second, with no lost fractions
    expect(n).toBeGreaterThanOrEqual(9)
    expect(emitCount(10, 1, 0.25, 384, 0).n).toBe(2)
    expect(emitCount(10, 1, 1, 768, 0).n).toBe(20)
  })

  it('weather particles spawn where their stream says', () => {
    const r = rnd()
    const top = spawnWeather(WEATHER.rain.streams[0]!, 400, 216, 112, r)
    expect(top.y).toBeLessThan(0)
    expect(top.vy).toBeGreaterThan(100)
    const ground = spawnWeather(WEATHER.embers.streams[0]!, 400, 216, 112, r)
    expect(ground.y).toBeGreaterThanOrEqual(112)
    expect(ground.vy).toBeLessThan(0) // embers rise
  })
})

describe('impact sparks', () => {
  it('every element sparks in its own colour (the UI element colour is in the set)', () => {
    for (const el of Object.keys(ELEMENT_VIS) as Element[]) {
      expect(SPARK_COLORS[el].length).toBeGreaterThanOrEqual(3)
      expect(SPARK_COLORS[el]).toContain(ELEMENT_VIS[el].color)
    }
  })

  it('a crit bursts bigger than a kill, a kill bigger than a hit; reduced motion thins them', () => {
    const hit = burstParams('hit', 'fire', 1)
    const kill = burstParams('kill', 'fire', 1)
    const crit = burstParams('crit', 'fire', 1)
    expect(crit.count).toBeGreaterThan(kill.count)
    expect(kill.count).toBeGreaterThan(hit.count)
    expect(crit.speed[1]).toBeGreaterThan(hit.speed[1])
    expect(crit.size).toBeGreaterThan(hit.size)
    expect(burstParams('crit', 'fire', 1, 0.4).count).toBeLessThan(crit.count)
    expect(hit.colors).toBe(SPARK_COLORS.fire)
  })

  it('heals rise in green; sparks fly on through the target', () => {
    const heal = burstParams('heal', 'wind', 1)
    expect(heal.gravity).toBeLessThan(0)
    expect(heal.colors.some((c) => c === '#5fd08a')).toBe(true)
    const r = rnd()
    const right = spawnBurst({ ...burstParams('hit', 'water', 1), spread: 0.2 }, 100, 100, r)
    const left = spawnBurst({ ...burstParams('hit', 'water', -1), spread: 0.2 }, 100, 100, r)
    expect(right.every((p) => p.vx > 0)).toBe(true)
    expect(left.every((p) => p.vx < 0)).toBe(true)
  })

  it('particles fall, age and die', () => {
    const ps = spawnBurst(burstParams('hit', 'earth', 1), 100, 100, rnd())
    const n = ps.length
    const vy0 = ps[0]!.vy
    let alive = stepParticles(ps, 0.05, 384, 216)
    expect(alive.length).toBe(n)
    expect(alive[0]!.vy).toBeGreaterThan(vy0) // gravity
    for (let i = 0; i < 40; i++) alive = stepParticles(alive, 0.05, 384, 216)
    expect(alive.length).toBe(0)
  })
})

describe('stage fit', () => {
  it('prefers a whole-number zoom when it fills nearly as well, else a quarter step', () => {
    expect(fitStage(1424, 660)).toEqual({ zoom: 3, width: Math.min(STAGE_MAX_W, Math.floor(1424 / 3)) })
    const f = fitStage(1904, 860)
    expect(f.zoom).toBe(3.75)
    expect(f.width * f.zoom).toBeLessThanOrEqual(1904)
  })

  it('widens the stage on wide screens (capped) and never goes narrower than the canon', () => {
    expect(fitStage(3000, 216).width).toBe(STAGE_MAX_W)
    const phone = fitStage(374, 500)
    expect(phone.width).toBeGreaterThanOrEqual(STAGE_MIN_W)
    expect(phone.zoom).toBeLessThan(1)
    expect(phone.zoom * phone.width).toBeLessThanOrEqual(374)
  })

  it('puts the windows beside the stage on a phone held sideways', () => {
    expect(hudBeside(844, 390)).toBe(true)
    expect(hudBeside(390, 844)).toBe(false)
    expect(hudBeside(1440, 900)).toBe(false)
  })
})

describe('battle keys', () => {
  const k = (key: string, extra: object = {}) => battleKeyAction({ key, ...extra }, false)

  it('maps the shortcuts', () => {
    expect(k(' ')).toEqual({ kind: 'pause' })
    expect(k('1')).toEqual({ kind: 'speed', speed: 1 })
    expect(k('2')).toEqual({ kind: 'speed', speed: 2 })
    expect(k('3')).toEqual({ kind: 'speed', speed: 4 })
    expect(k('s')).toEqual({ kind: 'skip' })
    expect(k('S')).toEqual({ kind: 'skip' })
    expect(k('Enter')).toEqual({ kind: 'skip' })
    expect(k('f')).toEqual({ kind: 'focus' })
    expect(k('p')).toEqual({ kind: 'protect' })
    expect(k('R')).toEqual({ kind: 'retreat' })
    expect(k('Escape')).toEqual({ kind: 'escape' })
    expect(k('w')).toBeNull()
  })

  it('leaves browser shortcuts and key repeat alone', () => {
    expect(k('r', { ctrlKey: true })).toBeNull()
    expect(k('f', { metaKey: true })).toBeNull()
    expect(k(' ', { repeat: true })).toBeNull()
  })

  it('once the battle has ended only Esc / Enter act, and they continue', () => {
    expect(battleKeyAction({ key: 'Escape' }, true)).toEqual({ kind: 'continue' })
    expect(battleKeyAction({ key: 'Enter' }, true)).toEqual({ kind: 'continue' })
    expect(battleKeyAction({ key: ' ' }, true)).toBeNull()
    expect(battleKeyAction({ key: 'r' }, true)).toBeNull()
  })

  it('knows when the player is typing', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
