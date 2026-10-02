import { useEffect, useRef, useState } from 'react'
import { isMuted, onMuteChange, playMusic, setMuted, type Music } from './sound'
import { asRequest } from './music'

/** Mute state as React state (re-renders when toggled anywhere). */
export function useMuted(): [boolean, (m: boolean) => void] {
  const [m, setM] = useState(isMuted())
  useEffect(() => onMuteChange(() => setM(isMuted())), [])
  return [m, setMuted]
}

/**
 * Scene music as a stack: the app asks for the lobby (or the title), the lobby refines
 * it with the hour and the weather, a battle or the summoning circle pushes its own on
 * top while it is up, and when it closes the one underneath comes back. Clicks never
 * pick the track; the scene on screen does. An entry can be updated in place (the
 * battle's floor → its victory jingle; the summon's tier) without reordering the stack.
 */
const stack: { id: number; music: Music }[] = []
let nextId = 1

function top(): Music {
  return stack[stack.length - 1]?.music ?? 'none'
}

/** Push a scene's music; the returned function pops it (whatever was pushed since). */
export function pushMusic(music: Music): () => void {
  const id = nextId++
  stack.push({ id, music })
  playMusic(music)
  return () => {
    const i = stack.findIndex((e) => e.id === id)
    if (i < 0) return
    const wasTop = i === stack.length - 1
    stack.splice(i, 1)
    if (wasTop) playMusic(top())
  }
}

/** A stack entry the caller can retarget (useMusic does this when its request changes). */
export function pushMusicEntry(music: Music): { set: (m: Music) => void; pop: () => void } {
  const id = nextId++
  stack.push({ id, music })
  playMusic(music)
  return {
    set: (m) => {
      const e = stack.find((x) => x.id === id)
      if (!e) return
      e.music = m
      if (stack[stack.length - 1] === e) playMusic(m)
    },
    pop: () => {
      const i = stack.findIndex((e) => e.id === id)
      if (i < 0) return
      const wasTop = i === stack.length - 1
      stack.splice(i, 1)
      if (wasTop) playMusic(top())
    },
  }
}

/** A stable key for a request (so a re-render with an equal request changes nothing). */
export function musicKey(m: Music): string {
  const r = asRequest(m)
  return `${r.scene}|${r.night ? 1 : 0}|${r.rain ? 1 : 0}|${r.floor ?? ''}|${r.boss === undefined ? '' : r.boss ? 1 : 0}|${r.tier ?? ''}`
}

/**
 * Play a scene's music while mounted (the one underneath returns after). A change of
 * request (the hour turning, the tier rising, the battle ending) retargets the same entry.
 */
export function useMusic(m: Music): void {
  const key = musicKey(m)
  const entry = useRef<ReturnType<typeof pushMusicEntry> | null>(null)
  const latest = useRef(m)
  latest.current = m
  useEffect(() => {
    const e = pushMusicEntry(latest.current)
    entry.current = e
    return () => {
      e.pop()
      if (entry.current === e) entry.current = null
    }
  }, [])
  useEffect(() => {
    entry.current?.set(latest.current)
  }, [key])
}
