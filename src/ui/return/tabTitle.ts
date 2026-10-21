/**
 * The honest tab title (spec 2026-10-12 S27). While the tab is hidden, the title says
 * "Pick Me Up! · ✓ Training done" — but only once a timer the Master chose has really
 * finished. It never cycles, never flashes and never begs. It is computed from a snapshot
 * of the timers taken when the tab was hidden, so it NEVER dispatches (a TICK here would
 * break mid-battle orders, which rely on `store.revise`).
 */
import { useEffect } from 'react'
import type { GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { toWorldTime } from '../../engine/time'
import { brewingTimers, type Brewing, type TimerKind } from './lightsOut'
import { t } from '../i18n/i18n'

export const APP_NAME = 'Pick Me Up!'

const DONE_LABEL: Record<TimerKind, string> = {
  promotion: 'Promotion done',
  training: 'Training done',
  build: 'Build done',
  expedition: 'Expedition home',
}

/** The timers still running at `nowWorld` (what the title may later report). */
export function snapshotTimers(state: GameState | null, nowWorld: number): Brewing[] {
  return state ? brewingTimers(state, nowWorld) : []
}

/** The snapshot's timers that have finished by `nowWorld`, earliest first. */
export function finishedTimers(snapshot: readonly Brewing[], nowWorld: number): Brewing[] {
  return snapshot.filter((b) => b.completesAtWorld <= nowWorld)
}

/**
 * The title to show while hidden: `base` until a chosen timer has finished, then
 * "Pick Me Up! · ✓ <first finished> (+n)". Pure.
 */
export function honestTitle(base: string, snapshot: readonly Brewing[], nowWorld: number): string {
  const done = finishedTimers(snapshot, nowWorld)
  if (done.length === 0) return base
  const more = done.length > 1 ? ` +${done.length - 1}` : ''
  return `${APP_NAME} · ✓ ${t(DONE_LABEL[done[0]!.kind])}${more}`
}

/** How often the hidden title is re-checked (real ms). Calm on purpose. */
export const TITLE_CHECK_MS = 15_000

/**
 * Hook: keep the tab title honest while the page is hidden; restore it when visible.
 * Reads the store, never dispatches. Safe under jsdom and SSR.
 */
export function useHonestTabTitle(store: Store): void {
  useEffect(() => {
    if (typeof document === 'undefined') return
    let base = document.title
    let snapshot: Brewing[] = []
    let timer: ReturnType<typeof setInterval> | null = null
    const update = () => {
      const next = honestTitle(base, snapshot, toWorldTime(Date.now()))
      if (document.title !== next) document.title = next
    }
    const stop = () => {
      if (timer !== null) clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (document.hidden) {
        base = document.title
        snapshot = snapshotTimers(store.getState(), toWorldTime(Date.now()))
        stop()
        if (snapshot.length > 0) timer = setInterval(update, TITLE_CHECK_MS)
      } else {
        stop()
        if (document.title !== base) document.title = base
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
      if (document.title !== base && !document.hidden) document.title = base
    }
  }, [store])
}
