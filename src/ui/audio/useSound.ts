import { useEffect, useState } from 'react'
import { isMuted, onMuteChange, playMusic, setMuted, type Music } from './sound'

/** Mute state as React state (re-renders when toggled anywhere). */
export function useMuted(): [boolean, (m: boolean) => void] {
  const [m, setM] = useState(isMuted())
  useEffect(() => onMuteChange(() => setM(isMuted())), [])
  return [m, setMuted]
}

/** Play a scene's music while mounted. */
export function useMusic(m: Music): void {
  useEffect(() => {
    playMusic(m)
  }, [m])
}
