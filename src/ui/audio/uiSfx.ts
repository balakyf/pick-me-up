/**
 * The interface's own sounds: which cue a pressed button makes (a primary action
 * confirms, a close or "Keep" cancels, anything else clicks; `data-sfx` overrides), and
 * a chime or a jingle of coins when a toast announces a reward.
 */
import { subscribeToasts, type ToastItem } from '../qol/toastBus'
import type { CueName } from './cues'
import { sfx } from './sound'

const CUES = new Set<string>(['click', 'confirm', 'cancel', 'toggle', 'coins', 'none'])

/** The cue for a click on `target` (null = no sound: not a button, or disabled). Pure (DOM reads only). */
export function uiCueFor(target: EventTarget | null): CueName | null {
  const el = (target as Element | null)?.closest?.('button, [role="switch"], [role="radio"], input[type="radio"], input[type="checkbox"]')
  if (!el) return null
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return null
  const own = el.getAttribute('data-sfx')
  if (own && CUES.has(own)) return own === 'none' ? null : (own as CueName)
  if (el.matches('[role="switch"], [role="radio"], input')) return 'toggle'
  const cls = el.classList
  if (cls.contains('pwin-close') || el.getAttribute('aria-label') === 'Close') return 'cancel'
  if (cls.contains('primary') || cls.contains('gold')) return 'confirm'
  return 'click'
}

/** A reward toast jingles (gold or gems in its text), any other good news chimes. Pure. */
export function toastCue(item: Pick<ToastItem, 'text' | 'tone'>): CueName | null {
  if (/[◆♦]/.test(item.text) && /\+/.test(item.text)) return 'coins'
  if (item.tone === 'good') return 'confirm'
  return null
}

/** Sound new toasts as they arrive. Returns the unsubscribe. */
export function installToastSounds(): () => void {
  const seen = new Set<number>()
  return subscribeToasts((items) => {
    for (const it of items) {
      if (seen.has(it.id)) continue
      seen.add(it.id)
      const cue = toastCue(it)
      if (cue) sfx(cue)
    }
  })
}
