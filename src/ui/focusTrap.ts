/**
 * Keyboard focus for modal windows: Tab and Shift+Tab cycle inside the topmost window
 * instead of wandering into the lobby behind it, the window takes focus when it opens,
 * and focus goes back to whatever opened it when it closes. DOM-only helpers (tested in
 * jsdom); PixelWindow (kit.tsx) wires them.
 */

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

/** The elements Tab can reach inside `root`, in order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[hidden], [inert], [aria-hidden="true"]') && el.getAttribute('tabindex') !== '-1',
  )
  // A radio group is one tab stop: its checked radio, or its first when none is checked
  // (the arrow keys move inside it). Otherwise a window ending on a row of choices would
  // count an unchecked radio as "last", and Tab would slip out of the window behind it.
  const groupStop = new Map<string, HTMLElement>()
  for (const el of all) {
    if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !el.name) continue
    const cur = groupStop.get(el.name)
    if (!cur || (el.checked && !(cur as HTMLInputElement).checked)) groupStop.set(el.name, el)
  }
  return all.filter((el) => !(el instanceof HTMLInputElement && el.type === 'radio' && el.name) || groupStop.get(el.name) === el)
}

/**
 * Keep a Tab press inside `root`. Returns true when it handled the key (the caller's
 * event is prevented). Shift+Tab on the first element wraps to the last and Tab on the
 * last wraps to the first; focus outside the window is pulled back in.
 */
export function trapTab(e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>, root: HTMLElement, doc: Document = root.ownerDocument): boolean {
  if (e.key !== 'Tab') return false
  const list = focusables(root)
  const active = doc.activeElement as HTMLElement | null
  if (list.length === 0) {
    e.preventDefault()
    root.focus()
    return true
  }
  const first = list[0]!
  const last = list[list.length - 1]!
  const inside = !!active && root.contains(active)
  if (e.shiftKey) {
    if (!inside || active === first || active === root) {
      e.preventDefault()
      last.focus()
      return true
    }
  } else if (!inside || active === last || active === root) {
    e.preventDefault()
    first.focus()
    return true
  }
  return false
}

/** Is `el` the topmost of the open windows (`selector`)? A window opened inside another wins. */
export function isTopmost(el: Element | null, selector = '.pwin-backdrop', doc: Document = document): boolean {
  if (!el) return false
  const all = doc.querySelectorAll(selector)
  return all.length > 0 && all[all.length - 1] === el
}

/** Put focus back where it was before a window opened (if that element is still there). */
export function restoreFocus(prev: Element | null, doc: Document = document): void {
  if (prev instanceof HTMLElement && doc.contains(prev) && typeof prev.focus === 'function') prev.focus()
}
