import { useEffect, useState } from 'react'
import { getSettings, onSettingsChange, updateSettings, type Settings } from './settings'

/** The settings as React state (re-renders when they change anywhere). */
export function useSettings(): [Readonly<Settings>, (patch: Partial<Settings>) => void] {
  const [s, setS] = useState(getSettings())
  useEffect(() => onSettingsChange(() => setS(getSettings())), [])
  return [s, updateSettings]
}

/**
 * Mirror the settings onto <html> so plain CSS can follow them: `--ui-scale` (windows and
 * HUD), `data-flashes="off"` (settings.css hides the flares). Reduced motion is mirrored
 * by motion.ts. Returns the unsubscribe.
 */
export function mirrorSettingsToDocument(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): () => void {
  if (!doc) return () => {}
  const apply = (s: Readonly<Settings>) => {
    const root = doc.documentElement
    root.style.setProperty('--ui-scale', String(s.uiScale))
    root.dataset.uiScale = s.uiScale === 1 ? '1' : String(s.uiScale)
    root.dataset.flashes = s.flashes ? 'on' : 'off'
    root.dataset.shake = s.screenShake ? 'on' : 'off'
  }
  apply(getSettings())
  return onSettingsChange(apply)
}
