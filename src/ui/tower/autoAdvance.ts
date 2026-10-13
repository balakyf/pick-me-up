/**
 * VICTORY auto-advances to the results after 1.2 s (spec 2026-10-12 S11, WP4), so a floor
 * costs one click instead of two. BattleScene (WP2) has no "ended" callback, so this
 * watches the battle's own DOM for its victory banner (`.battle-banner.win`, or a future
 * `[data-battle-end="win"]`). Defeats keep their Continue button: a loss deserves a beat.
 */
import { useEffect, useRef, type RefObject } from 'react'

export const VICTORY_SELECTOR = '.battle-banner.win, [data-battle-end="win"]'

/** True when the battle under `root` is showing its victory banner. */
export function victoryShown(root: ParentNode | null | undefined): boolean {
  return !!root && root.querySelector(VICTORY_SELECTOR) !== null
}

/** Call `onFire` once, `delayMs` after the victory banner appears under `ref`, while `active`. */
export function useVictoryAutoAdvance(ref: RefObject<HTMLElement | null>, active: boolean, onFire: () => void, delayMs = 1200): void {
  const fire = useRef(onFire)
  fire.current = onFire
  useEffect(() => {
    const root = ref.current
    if (!active || !root) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let fired = false
    const check = () => {
      if (timer !== null || fired) return
      if (victoryShown(root)) {
        timer = setTimeout(() => {
          fired = true
          fire.current()
        }, delayMs)
      }
    }
    check()
    const obs = typeof MutationObserver === 'function' ? new MutationObserver(check) : null
    obs?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-battle-end'] })
    return () => {
      obs?.disconnect()
      if (timer !== null) clearTimeout(timer)
    }
  }, [ref, active, delayMs])
}
