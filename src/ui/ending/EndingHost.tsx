import { useEffect, useState } from 'react'
import type { GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { fateOf, cycleOf } from '../../engine/endgame'
import { useReducedMotion } from '../motion'
import { storyStep } from '../story/storyText'
import { t } from '../i18n/i18n'
import { Ending } from './Ending'
import { onEnding, type EndingRequest } from './endingBus'
import { cycleNumeral, epilogueDue, epilogueKey } from './endingText'
import './ending.css'

/**
 * The ending's one host (lane O), mounted once in App. It plays the epilogue when the Tower
 * asks (after the F90 results), when the Menu asks (a replay), or by itself in the lobby
 * when a sealed fate's epilogue was never seen (a reload after the decision). Playing it
 * latches it once per save (lane M's story latch). A New Cycle begins from its last page;
 * the new world opens on a short card.
 */
export function EndingHost({ state, store, hold, onNewCycle }: { state: GameState; store: Store; hold: boolean; onNewCycle: () => void }) {
  const calm = useReducedMotion()
  const [open, setOpen] = useState<EndingRequest | null>(null)
  const [newWorld, setNewWorld] = useState<number | null>(null)
  const fate = fateOf(state)

  useEffect(() => onEnding((req) => setOpen(req)), [])
  // A sealed fate's epilogue that was never seen plays once nothing else holds the screen.
  const due = hold ? null : epilogueDue(state)
  useEffect(() => {
    if (due && !open) setOpen({ start: 'epilogue' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due])
  // Latch it as it shows.
  useEffect(() => {
    if (open && fate && epilogueDue(state)) store.dispatch({ type: 'GUIDE_STEP', step: storyStep(epilogueKey(fate)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open !== null, fate])

  if (newWorld !== null) {
    return (
      <div className="ending-newworld" role="status" aria-live="polite" onClick={() => setNewWorld(null)}>
        <div className="ending-newworld-card">
          <div className="ending-kicker">{t('Cycle {n}', { n: cycleNumeral(newWorld) })}</div>
          <h2 className="ending-title">{t('A new world')}</h2>
          <p className="ending-line small">{t('Isel opens a new ledger. The first floor is waiting, and it is harder than you remember.')}</p>
          <button type="button" className="pbtn sm" onClick={() => setNewWorld(null)}>
            {t('Begin ▸')}
          </button>
        </div>
      </div>
    )
  }
  if (!open || !fate) return null
  return (
    <Ending
      state={state}
      fate={fate}
      start={open.start}
      calm={calm}
      onClose={() => setOpen(null)}
      onNewCycle={() => {
        try {
          store.dispatch({ type: 'NEW_CYCLE' }, Date.now())
        } catch {
          return
        }
        setOpen(null)
        setNewWorld(cycleOf(store.getState() ?? state))
        onNewCycle()
      }}
    />
  )
}
