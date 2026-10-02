import { describe, expect, it } from 'vitest'
import { HEAR_RADIUS, ambienceMix, isNight, positional, type AmbInput } from './ambience'
import { busLevels, sliderGain } from './mixer'
import { toastCue } from './uiSfx'

const base: AmbInput = {
  cx: 100,
  cy: 100,
  viewW: 384,
  sources: [
    { kind: 'forge', x: 300, y: 100 },
    { kind: 'hearth', x: 100, y: 100 },
  ],
  hour: 12,
  weather: 'clear',
  season: 'summer',
  indoors: false,
}

describe('lobby ambience mix', () => {
  it('a source is loudest under the camera, fades with distance, silent past its radius', () => {
    const at = (x: number) => positional(x, 0, 384, [{ kind: 'forge', x: 0, y: 0 }], 'forge').gain
    expect(at(0)).toBe(1)
    expect(at(HEAR_RADIUS / 2)).toBeGreaterThan(0.2)
    expect(at(HEAR_RADIUS / 2)).toBeLessThan(at(HEAR_RADIUS / 4))
    expect(at(HEAR_RADIUS + 1)).toBe(0)
  })

  it('pans toward the side of the screen the source is on', () => {
    expect(positional(0, 0, 384, [{ kind: 'forge', x: 100, y: 0 }], 'forge').pan).toBeGreaterThan(0)
    expect(positional(0, 0, 384, [{ kind: 'forge', x: -100, y: 0 }], 'forge').pan).toBeLessThan(0)
    expect(Math.abs(positional(0, 0, 384, [{ kind: 'forge', x: 5000, y: 0 }], 'forge').pan)).toBeLessThanOrEqual(0.8)
  })

  it('the nearest of several sources wins', () => {
    const p = positional(0, 0, 384, [
      { kind: 'hearth', x: 200, y: 0 },
      { kind: 'hearth', x: -20, y: 0 },
    ], 'hearth')
    expect(p.pan).toBeLessThan(0)
  })

  it('weather: rain and wind follow it, muffled indoors; thunder in a storm', () => {
    expect(ambienceMix(base)).toMatchObject({ rain: 0, thunder: false })
    const storm = ambienceMix({ ...base, weather: 'storm' })
    expect(storm.rain).toBe(1)
    expect(storm.thunder).toBe(true)
    expect(storm.wind).toBeGreaterThan(ambienceMix(base).wind)
    const inside = ambienceMix({ ...base, weather: 'rain', indoors: true })
    expect(inside.rain).toBeLessThan(ambienceMix({ ...base, weather: 'rain' }).rain)
    expect(inside.muffled).toBe(true)
    expect(ambienceMix({ ...base, weather: 'snow' }).rain).toBe(0)
  })

  it('crickets on fair nights out of winter', () => {
    expect(ambienceMix({ ...base, hour: 23 }).crickets).toBeGreaterThan(0)
    expect(ambienceMix({ ...base, hour: 3 }).crickets).toBeGreaterThan(0)
    expect(ambienceMix({ ...base, hour: 14 }).crickets).toBe(0)
    expect(ambienceMix({ ...base, hour: 23, weather: 'rain' }).crickets).toBe(0)
    expect(ambienceMix({ ...base, hour: 23, season: 'winter' }).crickets).toBe(0)
    expect(isNight(20)).toBe(true)
    expect(isNight(6)).toBe(false)
  })

  it('the forge and hearth come from their sources', () => {
    const m = ambienceMix(base)
    expect(m.hearth.gain).toBe(1)
    expect(m.forge.gain).toBeGreaterThan(0)
    expect(m.forge.gain).toBeLessThan(1)
    expect(m.forge.pan).toBeGreaterThan(0)
  })
})

describe('volume levels', () => {
  it('sliders feel even: a power curve, 0 is silence, 100 is full', () => {
    expect(sliderGain(0)).toBe(0)
    expect(sliderGain(100)).toBe(1)
    expect(20 * Math.log10(sliderGain(50))).toBeCloseTo(-10.2, 0)
    for (let v = 5; v <= 100; v += 5) expect(sliderGain(v)).toBeGreaterThan(sliderGain(v - 5))
    expect(sliderGain(150)).toBe(1)
    expect(sliderGain(-5)).toBe(0)
  })

  it('mute silences the master but keeps the bus levels', () => {
    const on = busLevels({ masterVolume: 80, musicVolume: 70, sfxVolume: 100, muted: false })
    const off = busLevels({ masterVolume: 80, musicVolume: 70, sfxVolume: 100, muted: true })
    expect(on.master).toBeGreaterThan(0)
    expect(off.master).toBe(0)
    expect(off.music).toBe(on.music)
    expect(on.sfx).toBeGreaterThan(on.music)
  })
})

describe('reward toasts', () => {
  it('gold or gems gained jingle; other good news chimes; warnings are silent', () => {
    expect(toastCue({ text: 'Daily login: +500 ◆', tone: 'good' })).toBe('coins')
    expect(toastCue({ text: 'Purchased: +60 ♦', tone: 'good' })).toBe('coins')
    expect(toastCue({ text: 'The Kitchen is built!', tone: 'good' })).toBe('confirm')
    expect(toastCue({ text: 'Party set: 3 heroes.', tone: 'info' })).toBeNull()
  })
})
