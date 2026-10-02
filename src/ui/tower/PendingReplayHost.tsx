/**
 * After a reload mid-battle (B14): the attempt already happened — show it before anything
 * else. The fight replays (its death moments and last words included), then its results;
 * dismissing them clears the record. Mounted once by the App over whatever scene is open.
 */
import { useState } from 'react'
import type { GameState } from '../../engine/types'
import { BattleScene } from '../battle/BattleScene'
import { ResultsScreen } from '../results/ResultsScreen'
import { t } from '../i18n/i18n'
import { clearPendingReplay, loadPendingReplay } from './pendingReplay'
import './tower.css'

export function PendingReplayHost({ state }: { state: GameState }) {
  // Read once, when the app opens: a replay saved later belongs to the Tower screen's own fight.
  const [pending, setPending] = useState(() => loadPendingReplay(state))
  const [phase, setPhase] = useState<'battle' | 'results'>('battle')
  if (!pending) return null
  const done = () => {
    clearPendingReplay()
    setPending(null)
  }
  return phase === 'battle' ? (
    <>
      <BattleScene log={pending.log} state={state} onDone={() => setPhase('results')} />
      <div className="replay-note" role="status">
        ⟲ {t('The battle you left on floor {n} — it was fought; here is how it went.', { n: pending.result.floor })}
      </div>
    </>
  ) : (
    <ResultsScreen result={pending.result} state={state} onContinue={done} />
  )
}
