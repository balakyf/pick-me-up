import { useEffect, useRef, useState } from 'react'
import type { CombatUnitInit } from '../../engine/types'
import { HERO_DEATH_MS, MOURN_LINGER_MS } from './battleFrames'

export interface Mourning {
  unit: CombatUnitInit
  words: string
  seq: number
  fading: boolean
}

/**
 * The fallen hero's card: it appears with the death, lingers a moment after the replay
 * moves on, then fades and goes. Its timers outlive the death event (the replay moves to
 * the next event long before the card should fade), so they are only cleared when the
 * battle closes — clearing them on the next event left the card on screen for good.
 */
export function useMourning(
  death: { unit: CombatUnitInit; seq: number } | null,
  wordsFor: (unit: CombatUnitInit) => string,
  speed: number,
): Mourning | null {
  const [mourning, setMourning] = useState<Mourning | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(
    () => () => {
      for (const tm of timers.current) clearTimeout(tm)
      timers.current = []
    },
    [],
  )
  const seq = death?.seq ?? null
  useEffect(() => {
    if (!death) return
    const at = death.seq
    setMourning({ unit: death.unit, words: wordsFor(death.unit), seq: at, fading: false })
    const hold = HERO_DEATH_MS / Math.min(speed, 2) + MOURN_LINGER_MS
    timers.current.push(
      setTimeout(() => setMourning((m) => (m && m.seq === at ? { ...m, fading: true } : m)), hold),
      setTimeout(() => setMourning((m) => (m && m.seq === at ? null : m)), hold + 600),
    )
    // Only a new death restarts the card; speed changes don't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq])
  return mourning
}
