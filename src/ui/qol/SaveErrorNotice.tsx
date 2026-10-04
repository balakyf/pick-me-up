/**
 * When the browser refuses to save (storage full or blocked), say so and offer the export
 * (lane B's `store.getSaveError()` seam, picked up by lane K): a warning toast once, and a
 * bar with the export button that stays until a save succeeds again or it is dismissed.
 */
import { useEffect, useState } from 'react'
import type { Store } from '../../engine/store'
import { t } from '../i18n/i18n'
import { PxIcon } from '../bits'
import { toast } from './toastBus'
import { saveErrorChange, storageFull } from './saveError'
import './qol.css'

export function SaveErrorNotice({ store, onExport }: { store: Store; onExport: () => void }) {
  const [error, setError] = useState<Error | null>(null)
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    let showing = false
    const check = () => {
      const err = store.getSaveError()
      const change = saveErrorChange(showing, err)
      if (change === 'raise') {
        showing = true
        setDismissed(false)
        setError(err)
        toast(t('The game could not be saved in this browser.'), { tone: 'warn', icon: '⚠', ms: 6000 })
      } else if (change === 'clear') {
        showing = false
        setError(null)
      }
    }
    check()
    return store.subscribe(check)
  }, [store])
  if (error === null || dismissed) return null
  return (
    <div className="qol-toast save-error" role="alert">
      <span>
        <PxIcon name="save" />{' '}
        {storageFull(error) ? t('This browser’s storage is full: your progress is not being saved.') : t('This browser refused the save: your progress is not being saved.')}{' '}
        <span className="muted">{t('Export a copy to keep it safe.')}</span>
      </span>
      <button className="pbtn sm primary" onClick={onExport}>
        {t('Export')}
      </button>
      <button className="pbtn sm ghost" onClick={() => setDismissed(true)}>
        {t('Not now')}
      </button>
    </div>
  )
}
