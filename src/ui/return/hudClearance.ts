import { useEffect, useState, type CSSProperties } from 'react'

/** The lobby's HUD button bar (LobbyWorld). On phones it drops to the bottom edge and wraps. */
const HUD_BAR = '.stage .hud-tr'

/**
 * How far the lobby's HUD bar reaches up from the bottom of the window, in px, or null
 * when there is nothing to measure (no lobby, no layout: jsdom, or the bar at the top).
 *
 * On phones the bar wraps to two or three rows depending on which buttons are up (Letter,
 * Daily) and the language, so a fixed offset either covers its buttons or floats far above
 * them. The Return layer's bottom prompts ("Rest for now", the backup nudge) sit on this
 * instead; the CSS only reads it under its phone media query (see return.css).
 */
export function hudClearance(): number | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null
  const bar = document.querySelector(HUD_BAR)
  if (!bar) return null
  const top = bar.getBoundingClientRect().top
  const below = window.innerHeight - top
  // A bar at the top of the screen (wide layouts) or not laid out at all: no clearance.
  if (top <= 0 || below <= 0 || below > window.innerHeight / 2) return null
  return Math.round(below)
}

/** `hudClearance()`, kept current while `active` (window resizes, the bar re-wrapping). */
export function useHudClearance(active: boolean): number | null {
  const [px, setPx] = useState<number | null>(null)
  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    const measure = () => setPx(hudClearance())
    measure()
    window.addEventListener('resize', measure)
    const bar = document.querySelector(HUD_BAR)
    const ro = bar && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (bar && ro) ro.observe(bar)
    return () => {
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [active])
  return px
}

/** The inline custom property the phone CSS positions against (absent: its fallback). */
export function clearanceStyle(px: number | null): CSSProperties | undefined {
  return px === null ? undefined : ({ '--hud-clear': `${px}px` } as CSSProperties)
}
