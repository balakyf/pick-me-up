/**
 * Glue between the store and the toast bus: a store whose dispatch announces what the
 * command did (for the Daily claim, banquets, Isel's one-click actions…), and a hook that
 * announces what time did on its own (a building finished, a promotion done).
 */
import { useEffect, useRef } from 'react'
import type { GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { describeCommand, describeTime } from './toastText'
import { toast } from './toastBus'

/** The same store, but every dispatch that changes something visible says so in a toast. */
export function withToasts(store: Store): Store {
  return {
    ...store,
    dispatch(cmd, nowReal) {
      const before = store.getState()
      const next = store.dispatch(cmd, nowReal)
      if (before) {
        const said = describeCommand(before, next, cmd)
        if (said) toast(said.text, { icon: said.icon, tone: said.tone })
      }
      return next
    },
  }
}

/** A clock jump bigger than this (world ms) is a catch-up after time away: Isel's letter
 *  tells that story, so it raises no toasts (ten real minutes at the 3x world clock). */
export const CATCH_UP_WORLD_MS = 30 * 60_000

/** Toast what changed between renders without a command (timers finishing). `epoch` resets it. */
export function useTimeToasts(state: GameState | null, epoch: number): void {
  const prev = useRef<{ state: GameState | null; epoch: number }>({ state, epoch })
  useEffect(() => {
    const was = prev.current
    prev.current = { state, epoch }
    if (!state || !was.state || was.epoch !== epoch || was.state === state) return
    if (state.meta.lastSeenAtWorld - was.state.meta.lastSeenAtWorld > CATCH_UP_WORLD_MS) return
    for (const said of describeTime(was.state, state)) toast(said.text, { icon: said.icon, tone: said.tone })
  }, [state, epoch])
}
