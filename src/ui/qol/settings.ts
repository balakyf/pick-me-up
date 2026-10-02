/**
 * The Master's settings: sound levels, comfort (screen shake, flashes, reduced motion),
 * the default battle speed, the dialogue's text speed and the UI scale. One per browser,
 * stored under localStorage 'pmu.settings' as JSON; every read is guarded, and anything
 * missing, malformed or out of range falls back to its default, so a stale or hand-edited
 * entry can never break the game. The language keeps its own key (i18n.ts).
 *
 * No React here (useSettings.ts wraps it), so it is unit-testable and the audio mixer,
 * motion helper and battle juice can read it at any moment.
 */

export type TextSpeed = 'slow' | 'normal' | 'fast' | 'instant'
export type MotionPref = 'auto' | 'on' | 'off'
export type BattleSpeed = 1 | 2 | 4

export interface Settings {
  /** 0..100 */
  masterVolume: number
  musicVolume: number
  sfxVolume: number
  /** Everything silent (the old Sound on/off; kept apart from the levels). */
  muted: boolean
  screenShake: boolean
  flashes: boolean
  battleSpeed: BattleSpeed
  textSpeed: TextSpeed
  /** 0.85 .. 1.3 (windows, HUD and text; the pixel world keeps its own fit). */
  uiScale: number
  /** 'auto' follows the OS preference; 'on' / 'off' override it. */
  reducedMotion: MotionPref
}

export const SETTINGS_KEY = 'pmu.settings'
/** Before this window existed, mute had its own key; a first load carries it over. */
const LEGACY_MUTE_KEY = 'pmu.muted'

export const UI_SCALES = [0.85, 1, 1.15, 1.3] as const
export const TEXT_SPEEDS: readonly TextSpeed[] = ['slow', 'normal', 'fast', 'instant']
export const BATTLE_SPEEDS: readonly BattleSpeed[] = [1, 2, 4]
export const MOTION_PREFS: readonly MotionPref[] = ['auto', 'on', 'off']

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  masterVolume: 80,
  musicVolume: 70,
  sfxVolume: 80,
  muted: false,
  screenShake: true,
  flashes: true,
  battleSpeed: 1,
  textSpeed: 'normal',
  uiScale: 1,
  reducedMotion: 'auto',
})

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

const pct = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
const oneOf = <T,>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d)

/** Clean any parsed value into a full, valid Settings (unknown fields dropped). Pure. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_SETTINGS
  return {
    masterVolume: pct(r.masterVolume, d.masterVolume),
    musicVolume: pct(r.musicVolume, d.musicVolume),
    sfxVolume: pct(r.sfxVolume, d.sfxVolume),
    muted: bool(r.muted, d.muted),
    screenShake: bool(r.screenShake, d.screenShake),
    flashes: bool(r.flashes, d.flashes),
    battleSpeed: oneOf(r.battleSpeed, BATTLE_SPEEDS, d.battleSpeed),
    textSpeed: oneOf(r.textSpeed, TEXT_SPEEDS, d.textSpeed),
    uiScale: oneOf(r.uiScale, UI_SCALES as readonly number[], d.uiScale),
    reducedMotion: oneOf(r.reducedMotion, MOTION_PREFS, d.reducedMotion),
  }
}

/** Read the stored settings (defaults where nothing valid is stored). */
export function loadSettings(): Settings {
  const s = storage()
  let raw: unknown = null
  let legacyMute: string | null = null
  try {
    const text = s?.getItem(SETTINGS_KEY) ?? null
    raw = text ? JSON.parse(text) : null
    legacyMute = s?.getItem(LEGACY_MUTE_KEY) ?? null
  } catch {
    raw = null
  }
  const out = sanitizeSettings(raw)
  // A player who muted before the settings window existed stays muted.
  if (raw === null && legacyMute === '1') out.muted = true
  return out
}

let current: Settings = loadSettings()
const listeners = new Set<(s: Settings) => void>()

export function getSettings(): Readonly<Settings> {
  return current
}

/** Change some settings, save them, and tell every listener. */
export function updateSettings(patch: Partial<Settings>): Settings {
  const next = sanitizeSettings({ ...current, ...patch })
  const changed = (Object.keys(next) as (keyof Settings)[]).some((k) => next[k] !== current[k])
  current = next
  if (!changed) return current
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(current))
  } catch {
    /* storage may be full or blocked: the change still applies for this session */
  }
  for (const fn of listeners) fn(current)
  return current
}

/** Back to the defaults (the language is left alone). */
export function resetSettings(): Settings {
  return updateSettings({ ...DEFAULT_SETTINGS })
}

export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Tests: re-read storage as a fresh page load would. */
export function reloadSettingsForTests(): Settings {
  current = loadSettings()
  return current
}

/** Characters revealed per typewriter tick (DialogBox), or Infinity for the whole line at once. */
export function charsPerTick(speed: TextSpeed): number {
  return speed === 'slow' ? 1 : speed === 'normal' ? 2 : speed === 'fast' ? 4 : Infinity
}

/** The screen shake / camera punch toggle, for the battle juice. */
export function screenShakeOn(): boolean {
  return current.screenShake
}

/** Full-screen and skill flashes (lightning in the lobby, the skill flare, the wave flash). */
export function flashesOn(): boolean {
  return current.flashes
}
