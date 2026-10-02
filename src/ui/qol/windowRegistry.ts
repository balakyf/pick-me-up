/**
 * Which pixel windows and dialogs are open right now. PixelWindow and DialogBox (kit.tsx)
 * register while mounted, so a passing nudge (the backup reminder) can stand aside for
 * Isel's letter, a facility window or a conversation instead of sitting on top of it.
 */
import { useEffect, useState } from 'react'

let open = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
}

/** How many windows/dialogs are open. */
export function openWindowCount(): number {
  return open
}

/** Mark one window open; call the returned function when it closes. */
export function registerWindow(): () => void {
  open++
  emit()
  let done = false
  return () => {
    if (done) return
    done = true
    open = Math.max(0, open - 1)
    emit()
  }
}

/** Register the calling component as an open window while it is mounted. */
export function useRegisterWindow(): void {
  useEffect(() => registerWindow(), [])
}

/** True while any pixel window or dialog is open. */
export function useAnyWindowOpen(): boolean {
  const [n, setN] = useState(open)
  useEffect(() => {
    const on = () => setN(open)
    listeners.add(on)
    on()
    return () => {
      listeners.delete(on)
    }
  }, [])
  return n > 0
}
