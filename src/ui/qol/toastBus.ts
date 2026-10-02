/**
 * A tiny module-level toast bus: anything in the UI can `toast('…')` and the one
 * <ToastHost/> (Toast.tsx, mounted by App) shows it. Rewards and one-click actions use it
 * so nothing the Master gains arrives silently. No React here, so it is unit-testable.
 */

export type ToastTone = 'good' | 'info' | 'warn'

export interface ToastItem {
  id: number
  text: string
  tone: ToastTone
  icon: string
  /** How long it stays up (ms) before the host lets it go. */
  ms: number
}

/** At most this many toasts on screen; older ones make way. */
export const MAX_TOASTS = 4
const DEFAULT_MS = 3600

let nextId = 1
let items: ToastItem[] = []
const listeners = new Set<(items: readonly ToastItem[]) => void>()

function emit(): void {
  for (const fn of listeners) fn(items)
}

/** Show a toast; returns its id. Identical text already on screen is refreshed, not doubled. */
export function toast(text: string, opts: { tone?: ToastTone; icon?: string; ms?: number } = {}): number {
  const same = items.find((i) => i.text === text)
  if (same) items = items.filter((i) => i !== same)
  const item: ToastItem = { id: nextId++, text, tone: opts.tone ?? 'good', icon: opts.icon ?? '✦', ms: opts.ms ?? DEFAULT_MS }
  items = [...items, item].slice(-MAX_TOASTS)
  emit()
  return item.id
}

export function dismissToast(id: number): void {
  const before = items.length
  items = items.filter((i) => i.id !== id)
  if (items.length !== before) emit()
}

export function currentToasts(): readonly ToastItem[] {
  return items
}

export function subscribeToasts(fn: (items: readonly ToastItem[]) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Drop every toast (a new game, an import, tests). */
export function clearToasts(): void {
  if (items.length === 0) return
  items = []
  emit()
}
