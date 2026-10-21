/**
 * Per-browser player preferences (spec 2026-10-12, WP0). Presentation only: the engine
 * never sees them. Stored in localStorage under `pmu.prefs` as the keys the player has
 * actually changed, so an untouched `reducedMotion` keeps following the OS setting.
 * Every storage access is guarded: private windows, blocked storage and jsdom all fall
 * back to the defaults.
 */
import { useEffect, useState } from 'react'

export interface Prefs {
  /** Battle playback speed multiplier (1 = the original pace). */
  battleSpeed: number
  /** Sweep (S6, WP4): a Breather or Safe floor won with no deaths plays as a short
   *  highlight instead of the full replay. */
  autoSweep: boolean
  /** Screen-shake strength, 0 (off) .. 1 (full). */
  shake: number
  /** Cut flashes, shakes and long animations. Defaults to the OS `prefers-reduced-motion`. */
  reducedMotion: boolean
}

export const PREFS_KEY = 'pmu.prefs'

/** The OS reduced-motion setting, or false where matchMedia is missing (jsdom, old browsers). */
function osReducedMotion(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
  } catch {
    return false
  }
}

/** Fresh defaults (reads the OS reduced-motion setting each time). */
export function defaultPrefs(): Prefs {
  return { battleSpeed: 2, autoSweep: true, shake: 1, reducedMotion: osReducedMotion() }
}

/** Keep only well-typed, in-range keys from untrusted storage. */
function sanitize(raw: unknown): Partial<Prefs> {
  if (raw === null || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: Partial<Prefs> = {}
  if (typeof r.battleSpeed === 'number' && Number.isFinite(r.battleSpeed) && r.battleSpeed > 0) out.battleSpeed = r.battleSpeed
  if (typeof r.autoSweep === 'boolean') out.autoSweep = r.autoSweep
  if (typeof r.shake === 'number' && Number.isFinite(r.shake)) out.shake = Math.min(1, Math.max(0, r.shake))
  if (typeof r.reducedMotion === 'boolean') out.reducedMotion = r.reducedMotion
  return out
}

/** The last change that could not be written (blocked or full storage): it still holds
 *  for this session, so getPrefs() agrees with what listeners were told. */
let unsaved: Partial<Prefs> | null = null

function readStored(): Partial<Prefs> {
  if (unsaved !== null) return unsaved
  try {
    if (typeof window === 'undefined') return {}
    const json = window.localStorage.getItem(PREFS_KEY)
    return json === null ? {} : sanitize(JSON.parse(json))
  } catch {
    return {}
  }
}

const listeners = new Set<(p: Prefs) => void>()

/** The current preferences: defaults overlaid with what the player has set. */
export function getPrefs(): Prefs {
  return { ...defaultPrefs(), ...readStored() }
}

/** Change some preferences, persist them (best effort) and notify listeners. Returns the new prefs. */
export function setPrefs(patch: Partial<Prefs>): Prefs {
  const stored = { ...readStored(), ...sanitize(patch) }
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(PREFS_KEY, JSON.stringify(stored))
    unsaved = null
  } catch {
    unsaved = stored // storage may be unavailable: the change still holds for this session
  }
  const next = { ...defaultPrefs(), ...stored }
  for (const fn of listeners) fn(next)
  return next
}

/** Subscribe to preference changes. Returns the unsubscribe function. */
export function onPrefsChange(fn: (p: Prefs) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Preferences as React state (re-renders when they change anywhere). */
export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => Prefs] {
  const [p, setP] = useState<Prefs>(getPrefs)
  useEffect(() => onPrefsChange(setP), [])
  return [p, setPrefs]
}
