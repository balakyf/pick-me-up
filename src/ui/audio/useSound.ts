import { useEffect, useState } from 'react'
import { isMuted, onMuteChange, playMusic, setMuted, type Music } from './sound'

/** Mute state as React state (re-renders when toggled anywhere). */
export function useMuted(): [boolean, (m: boolean) => void] {
  const [m, setM] = useState(isMuted())
  useEffect(() => onMuteChange(() => setM(isMuted())), [])
  return [m, setMuted]
}

/**
 * Scene music as a stack: the app asks for the lobby theme, a battle pushes its own on
 * top while it is up, and when it closes the theme underneath comes back. Clicks never
 * pick the track; the scene on screen does.
 */
const stack: { id: number; music: Music }[] = []
let nextId = 1

/** Push a scene's track; the returned function pops it (whatever was pushed since). */
export function pushMusic(music: Music): () => void {
  const id = nextId++
  stack.push({ id, music })
  playMusic(music)
  return () => {
    const i = stack.findIndex((e) => e.id === id)
    if (i < 0) return
    const wasTop = i === stack.length - 1
    stack.splice(i, 1)
    if (wasTop) playMusic(stack[stack.length - 1]?.music ?? 'none')
  }
}

/** Play a scene's music while mounted (the one underneath returns after). */
export function useMusic(m: Music): void {
  useEffect(() => pushMusic(m), [m])
}
