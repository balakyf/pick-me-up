// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  charsPerTick,
  flashesOn,
  getSettings,
  onSettingsChange,
  reloadSettingsForTests,
  resetSettings,
  sanitizeSettings,
  screenShakeOn,
  updateSettings,
} from './settings'
import { mirrorSettingsToDocument } from './useSettings'

beforeEach(() => {
  window.localStorage.clear()
  reloadSettingsForTests()
})
afterEach(() => {
  window.localStorage.clear()
  reloadSettingsForTests()
})

describe('settings', () => {
  it('a fresh browser gets the defaults', () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toMatchObject({ masterVolume: 80, musicVolume: 70, sfxVolume: 80, muted: false, battleSpeed: 1, textSpeed: 'normal', uiScale: 1, reducedMotion: 'auto', screenShake: true, flashes: true })
  })

  it('a change is saved under pmu.settings and survives a reload', () => {
    updateSettings({ musicVolume: 35, battleSpeed: 4, textSpeed: 'fast', reducedMotion: 'on', flashes: false })
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!)).toMatchObject({ musicVolume: 35, battleSpeed: 4 })
    const again = reloadSettingsForTests()
    expect(again).toMatchObject({ musicVolume: 35, battleSpeed: 4, textSpeed: 'fast', reducedMotion: 'on', flashes: false, sfxVolume: 80 })
  })

  it('listeners hear changes, not no-ops', () => {
    let calls = 0
    const off = onSettingsChange(() => calls++)
    updateSettings({ sfxVolume: 10 })
    updateSettings({ sfxVolume: 10 })
    off()
    updateSettings({ sfxVolume: 20 })
    expect(calls).toBe(1)
  })

  it('garbage, out-of-range and unknown values fall back field by field', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
    const s = sanitizeSettings({ masterVolume: 250, musicVolume: -3, sfxVolume: 'loud', battleSpeed: 3, textSpeed: 'warp', uiScale: 7, reducedMotion: 'maybe', muted: 'yes', extra: 1 })
    expect(s).toEqual({ ...DEFAULT_SETTINGS, masterVolume: 100, musicVolume: 0 })
    expect(sanitizeSettings({ musicVolume: 33.6 }).musicVolume).toBe(34)
  })

  it('a corrupt stored entry never breaks the game', () => {
    window.localStorage.setItem(SETTINGS_KEY, '{not json')
    expect(reloadSettingsForTests()).toEqual(DEFAULT_SETTINGS)
  })

  it('a player who muted before this window existed stays muted', () => {
    window.localStorage.setItem('pmu.muted', '1')
    expect(reloadSettingsForTests().muted).toBe(true)
    // Once settings are saved, they win over the old key.
    updateSettings({ muted: false })
    expect(reloadSettingsForTests().muted).toBe(false)
  })

  it('a storage that throws still lets the session change settings', () => {
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('quota')
    }
    try {
      expect(updateSettings({ sfxVolume: 5 }).sfxVolume).toBe(5)
    } finally {
      Storage.prototype.setItem = orig
    }
  })

  it('reset brings back the defaults', () => {
    updateSettings({ masterVolume: 3, uiScale: 1.3 })
    expect(resetSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('text speed: characters per typewriter tick', () => {
    expect([charsPerTick('slow'), charsPerTick('normal'), charsPerTick('fast'), charsPerTick('instant')]).toEqual([1, 2, 4, Infinity])
  })

  it('the shake and flash toggles', () => {
    expect(screenShakeOn()).toBe(true)
    updateSettings({ screenShake: false, flashes: false })
    expect(screenShakeOn()).toBe(false)
    expect(flashesOn()).toBe(false)
  })

  it('mirrors the UI scale and the flash toggle onto <html>', () => {
    const off = mirrorSettingsToDocument(document)
    const root = document.documentElement
    expect(root.dataset.uiScale).toBe('1')
    updateSettings({ uiScale: 1.3, flashes: false })
    expect(root.style.getPropertyValue('--ui-scale')).toBe('1.3')
    expect(root.dataset.uiScale).toBe('1.3')
    expect(root.dataset.flashes).toBe('off')
    off()
  })
})
