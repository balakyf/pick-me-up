import { useEffect, useState } from 'react'
import { currentToasts, dismissToast, subscribeToasts, type ToastItem } from './toastBus'
import { t } from '../i18n/i18n'
import './toast.css'

/** One toast: it leaves on its own after its time, or at a click. */
function ToastRow({ item }: { item: ToastItem }) {
  useEffect(() => {
    const tm = setTimeout(() => dismissToast(item.id), item.ms)
    return () => clearTimeout(tm)
  }, [item.id, item.ms])
  return (
    <button type="button" className={`toast toast-${item.tone}`} onClick={() => dismissToast(item.id)} title={t('Dismiss')}>
      <span className="toast-icon" aria-hidden="true">
        {item.icon}
      </span>
      <span className="toast-text">{item.text}</span>
    </button>
  )
}

/** Where toasts appear: top centre, under the HUD, above windows. Mounted once by App. */
export function ToastHost() {
  const [items, setItems] = useState<readonly ToastItem[]>(currentToasts)
  useEffect(() => subscribeToasts(setItems), [])
  if (items.length === 0) return null
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((i) => (
        <ToastRow key={i.id} item={i} />
      ))}
    </div>
  )
}
