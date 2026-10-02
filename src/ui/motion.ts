/**
 * Reduced motion, in one place. The Master's setting ('auto' | 'on' | 'off', Settings
 * window) decides; 'auto' follows the OS `prefers-reduced-motion`. Everything that moves
 * for show asks here: the battle (no shake, zoom or cut-ins, sparse weather), the summon
 * reveal (one beam, no surges), the lobby's estate and sky (still sprites, no lightning).
 *
 * <html data-motion="reduce|full"> mirrors the answer so CSS can follow the setting too
 * (motion.css); the CSS `@media (prefers-reduced-motion)` rules still follow the OS.
 */
import { useEffect, useState } from 'react'
import { getSettings, onSettingsChange, type MotionPref } from './qol/settings'

const QUERY = '(prefers-reduced-motion: reduce)'

function media(): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null
  } catch {
    return null
  }
}

/** The OS preference (false where matchMedia is missing, e.g. jsdom). */
export function osPrefersReducedMotion(): boolean {
  return !!media()?.matches
}

/** Resolve the setting against the OS preference. Pure. */
export function resolveReducedMotion(pref: MotionPref, os: boolean): boolean {
  return pref === 'on' ? true : pref === 'off' ? false : os
}

/** Should motion for show be calmed right now? */
export function reducedMotion(): boolean {
  return resolveReducedMotion(getSettings().reducedMotion, osPrefersReducedMotion())
}

const listeners = new Set<() => void>()
let wired = false
let last: boolean | null = null

function notify(): void {
  const now = reducedMotion()
  mirror(now)
  if (now === last) return
  last = now
  for (const fn of listeners) fn()
}

function mirror(reduce: boolean): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = reduce ? 'reduce' : 'full'
}

/** Listen for the answer changing (the setting or the OS preference). */
export function onReducedMotionChange(fn: () => void): () => void {
  if (!wired) {
    wired = true
    last = reducedMotion()
    mirror(last)
    onSettingsChange(notify)
    const q = media()
    if (q && typeof q.addEventListener === 'function') q.addEventListener('change', notify)
  }
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Mirror data-motion on <html> from now on (App calls this once). */
export function installMotionMirror(): () => void {
  return onReducedMotionChange(() => {})
}

/** The answer as React state. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(reducedMotion)
  useEffect(() => {
    const off = onReducedMotionChange(() => setReduce(reducedMotion()))
    setReduce(reducedMotion())
    return off
  }, [])
  return reduce
}
