import { useEffect, useMemo, useRef } from 'react'
import type { CombatEvent, CombatOutcome, CombatUnitInit, Element } from '../../engine/types'
import { HERO_DEATH_MS } from '../battle/battleFrames'
import { CueLimiter, cuesForBeat } from './battleSfx'
import { playCue } from './cues'
import { duckMusic, releaseDuck } from './mixer'
import { isAnchorFloor, playStinger, type MusicRequest } from './music'
import { useMusic } from './useSound'

/**
 * The battle's sound, in one hook BattleScene mounts: the act's theme (or the boss's, the
 * Wailing Wall's, the world's end's) while it plays, the victory or defeat jingle at the
 * end, every beat's cues as its blows land (battleSfx.ts), and the death moment — the
 * music ducks and the death motif plays for the fallen.
 */
export function useBattleAudio({
  beatKey,
  beat,
  active,
  byId,
  element,
  speed,
  floor,
  ended,
  outcome,
  nonLethal = false,
  deathSeq,
}: {
  /** Changes once per beat. */
  beatKey: unknown
  beat: readonly CombatEvent[]
  /** False on the final frame (the music takes the end). */
  active: boolean
  byId: Record<string, CombatUnitInit>
  element: Element
  speed: number
  floor: number
  ended: boolean
  outcome: CombatOutcome
  nonLethal?: boolean
  /** The seq of a hero's death event while its moment is on screen. */
  deathSeq: number | null
}): void {
  // The music: the floor's theme, then the jingle. A trial ends softly either way.
  const request: MusicRequest = ended
    ? { scene: outcome === 'win' || (nonLethal && outcome !== 'retreat') ? 'victory' : 'defeat' }
    : { scene: 'battle', floor, boss: isAnchorFloor(floor) }
  useMusic(request)

  const limiter = useMemo(() => new CueLimiter(), [])
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    if (!active || beat.length === 0) return
    const cues = cuesForBeat(beat, { byId, element, nonLethal })
    const spd = Math.max(1, speed)
    for (const c of cues) {
      const fire = () => {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
        if (limiter.allow(c.cue, now)) playCue(c.cue, c.opts)
      }
      const ms = c.delayMs / spd
      if (ms <= 1) fire()
      else {
        const tm = setTimeout(() => {
          timers.current.delete(tm)
          fire()
        }, ms)
        timers.current.add(tm)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatKey])

  // The death moment: the music steps back and the motif plays for the fallen.
  useEffect(() => {
    if (deathSeq === null) return
    const hold = HERO_DEATH_MS / Math.min(Math.max(1, speed), 2) / 1000
    duckMusic(0.18, hold, 0.25, 1.4)
    playStinger('death-motif')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deathSeq])

  useEffect(() => {
    const set = timers.current
    return () => {
      for (const t of set) clearTimeout(t)
      set.clear()
      releaseDuck()
    }
  }, [])
}
