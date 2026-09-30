import { useEffect, useRef } from 'react'

/**
 * App-level scene shortcuts (T Tower, P Party Board, R Registry, U/G Summon, L/Backspace
 * back to the Lobby, M/Esc Menu in a scene, ? keyboard help). They never collide with the
 * lobby's own keys (arrows/WASD/ZQSD, E/Space/Enter, H, N, M/Esc) and stand aside whenever
 * something else owns the keyboard: a text field, an open window or dialog, a battle,
 * a results overlay or the summoning ritual.
 */

export type SceneView = 'lobby' | 'tower' | 'summon' | 'party' | 'roster'

export type HotkeyAction = { kind: 'go'; view: Exclude<SceneView, 'lobby'> } | { kind: 'back' } | { kind: 'menu' } | { kind: 'help' }

const GO: Record<string, Exclude<SceneView, 'lobby'>> = { t: 'tower', p: 'party', r: 'roster', u: 'summon', g: 'summon' }

/** Map a key press to an action for the current view (null = not ours). Pure. */
export function hotkeyFor(key: string, view: SceneView): HotkeyAction | null {
  const k = key.length === 1 ? key.toLowerCase() : key
  if (k === '?') return { kind: 'help' }
  const target = GO[k]
  if (target) return target === view ? null : { kind: 'go', view: target }
  if (view === 'lobby') return null // the lobby handles its own Menu / Esc
  if (k === 'l' || k === 'Backspace') return { kind: 'back' }
  if (k === 'm' || k === 'Escape') return { kind: 'menu' }
  return null
}

/** Anything on screen that owns the keyboard while it's up. */
export const MODAL_SELECTOR = '.pwin-backdrop, [role="dialog"], .dialog, .battle, .overlay, .ritual'

/** Should this key press be left alone? (typing, modifiers, a modal, a battle…) */
export function hotkeysBlocked(e: KeyboardEvent, doc: Document = document): boolean {
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return true
  const el = e.target as HTMLElement | null
  const tag = el?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return true
  return doc.querySelector(MODAL_SELECTOR) !== null
}

/** Wire the scene shortcuts to the App's navigation. Handlers can change every render. */
export function useHotkeys(view: SceneView, on: (a: HotkeyAction) => void, enabled = true): void {
  const latest = useRef({ view, on, enabled })
  latest.current = { view, on, enabled }
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const { view: v, on: fire, enabled: live } = latest.current
      if (!live || hotkeysBlocked(e)) return
      const a = hotkeyFor(e.key, v)
      if (!a) return
      e.preventDefault()
      fire(a)
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])
}
