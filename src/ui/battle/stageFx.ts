/**
 * Stage helpers for the battle scene: the parallax layers of a floor's backdrop, the
 * dev backdrop preview, the reduced-motion preference, and the camera punch and screen
 * shake that sell a heavy blow.
 */
import { useEffect, useState } from 'react'
import { bgTheme, drawBattleLayers, LAYER_ORDER, type BattleLayerName, type BattleLayers } from '../pixel/battleBg'
import { canvasAvailable, cachedDataUrl } from '../pixel/render'

/** Which layers each backdrop theme has (known after its first build). */
const layerPresence = new Map<string, Set<BattleLayerName>>()

/** Data URLs of a floor's parallax layers, cached per backdrop theme ('' = no layer). */
export function layerUrls(floor: number): Record<BattleLayerName, string> {
  const out = { sky: '', drift: '', far: '', mid: '', ground: '', fog: '' }
  if (!canvasAvailable()) return out
  const theme = bgTheme(floor)
  let built: BattleLayers | null = null
  const get = () => (built ??= drawBattleLayers(floor))
  let present = layerPresence.get(theme)
  if (!present) {
    const L = get()
    present = new Set(LAYER_ORDER.filter((n) => L[n] !== null))
    layerPresence.set(theme, present)
  }
  for (const name of LAYER_ORDER) if (present.has(name)) out[name] = cachedDataUrl(`bbg|${theme}|${name}`, () => get()[name]!)
  return out
}

/** Dev-only: `?battlefx=<floor>` previews another floor's backdrop and weather. */
export function devFxFloor(): number | null {
  if (typeof window === 'undefined') return null
  const v = Number(new URLSearchParams(window.location.search).get('battlefx'))
  return Number.isInteger(v) && v > 0 ? v : null
}

/** The player's reduced-motion preference (no shake or zoom, sparse weather). */
export function useReducedMotion(): boolean {
  const query = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  const [reduce, setReduce] = useState(() => !!query()?.matches)
  useEffect(() => {
    const q = query()
    if (!q || typeof q.addEventListener !== 'function') return
    const on = () => setReduce(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return reduce
}

/** Camera punch: a quick zoom toward (x, y) and back, after `delay` ms of hit-stop. */
export function punch(el: HTMLElement | null, at: { x: number; y: number }, amount: number, delay: number) {
  if (!el || typeof el.animate !== 'function') return
  el.style.transformOrigin = `${at.x}px ${at.y}px`
  el.animate([{ transform: 'scale(1)' }, { transform: `scale(${amount})`, offset: 0.3 }, { transform: 'scale(1)' }], {
    duration: 380,
    delay,
    easing: 'steps(6, end)',
  })
}

/** Screen shake of the whole stage, `px` screen pixels at its strongest. */
export function shake(el: HTMLElement | null, px: number, delay: number) {
  if (!el || typeof el.animate !== 'function') return
  const k = (a: number, b: number) => ({ transform: `translate(${Math.round(a * px)}px, ${Math.round(b * px)}px)` })
  el.animate([k(0, 0), k(-1, 0.5), k(1, -0.5), k(-0.75, -0.25), k(0.75, 0.5), k(-0.25, 0), k(0, 0)], {
    duration: px > 2 ? 320 : 220,
    delay,
    easing: 'steps(6, end)',
  })
}
