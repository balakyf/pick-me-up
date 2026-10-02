import { useState } from 'react'
import type { GameState } from '../../engine/types'
import { t } from '../i18n/i18n'
import { backupMilestone, lastExportAt, lastNudgedFloor, markNudged } from './saveBackup'
import { lastExportText } from './SaveTransfer'
import { useAnyWindowOpen } from './windowRegistry'
import './qol.css'
import { PxIcon } from '../bits'

/**
 * A gentle nudge after every tenth floor: permadeath makes a save precious, and it only
 * lives in this browser. Shown once per milestone, and not at all after a fresh export.
 */
export function BackupReminder({ state, onExport }: { state: GameState; onExport: () => void }) {
  const [hidden, setHidden] = useState<number | null>(null)
  // A letter, a facility window or a conversation comes first: the nudge waits.
  const busy = useAnyWindowOpen()
  const now = Date.now()
  const floor = backupMilestone(state.tower.highestCleared, lastNudgedFloor(), lastExportAt(), now)
  if (floor === null || hidden === floor || busy) return null
  const dismiss = () => {
    markNudged(floor)
    setHidden(floor)
  }
  return (
    <div className="qol-toast" role="status">
      <span>
        <PxIcon name="save" /> {t('Floor {n} cleared — back up your save?', { n: floor })} <span className="muted">{lastExportText(now)}</span>
      </span>
      <button
        className="pbtn sm primary"
        onClick={() => {
          dismiss()
          onExport()
        }}
      >
        {t('Export')}
      </button>
      <button className="pbtn sm ghost" onClick={dismiss} aria-label={t('Not now')}>
        {t('Not now')}
      </button>
    </div>
  )
}
