/**
 * Lane Q: the App's host for PvP on stage. Whatever called `playOnStage` (stageBus) plays
 * here, above every scene and window: the rival's title card, then each battle in turn in
 * the shared BattleScene — non-lethal (PvP never kills; a fallen defender is carried off,
 * not slain), with the fight's own closing words.
 */
import { useState } from 'react'
import type { GameState } from '../../engine/types'
import { BattleScene } from '../battle/BattleScene'
import { RivalCardView } from './RivalCardView'
import { closeStage, useStage, type StageRequest } from './stageBus'
import './pvp.css'

export function PvpStageHost({ state }: { state: GameState | null }) {
  const req = useStage()
  if (!req) return null
  return <Stage key={req.nonce} req={req} state={state} />
}

function Stage({ req, state }: { req: StageRequest; state: GameState | null }) {
  const [phase, setPhase] = useState<'card' | number>(req.card ? 'card' : 0)
  if (phase === 'card' && req.card) return <RivalCardView card={req.card} onDone={() => setPhase(0)} />
  const i = phase === 'card' ? 0 : phase
  const log = req.logs[i]
  if (!log) {
    // Nothing (more) to play.
    queueMicrotask(closeStage)
    return null
  }
  return (
    <BattleScene
      key={i}
      log={log}
      state={state}
      nonLethal
      banner={req.banner}
      onDone={() => (i + 1 < req.logs.length ? setPhase(i + 1) : closeStage())}
    />
  )
}
