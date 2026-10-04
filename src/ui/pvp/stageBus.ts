/**
 * Lane Q: "play this PvP battle on stage" from anywhere — the PvP panel, the captive screen,
 * the guild hall, the lobby's invasion alarm. The App's `PvpStageHost` shows the rival's
 * title card, then the battle (non-lethal), then calls back.
 */
import { useSyncExternalStore } from 'react'
import type { CombatLog } from '../../engine/types'
import type { BannerWords } from '../battle/ResultBanner'
import type { RivalCard } from './pvpModel'

export interface StageRequest {
  /** The rival's title card (null: straight to the battle). */
  card: RivalCard | null
  /** The battles to play in turn (a server war has three). */
  logs: CombatLog[]
  /** The closing words of each battle. */
  banner: BannerWords
  /** Called once every battle has played (or been left). */
  onDone?: () => void
  /** Bumps per request so a second request re-mounts the stage. */
  nonce: number
}

let current: StageRequest | null = null
let nonce = 0
const subs = new Set<() => void>()

function emit(): void {
  for (const f of subs) f()
}

export function playOnStage(req: Omit<StageRequest, 'nonce'>): void {
  current = { ...req, nonce: ++nonce }
  emit()
}

export function closeStage(): void {
  if (current === null) return
  const done = current.onDone
  current = null
  emit()
  done?.()
}

export function useStage(): StageRequest | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => current,
    () => current,
  )
}

/** Tests: forget the stage. */
export function resetStage(): void {
  current = null
  emit()
}
