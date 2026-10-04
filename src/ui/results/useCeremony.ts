/**
 * The results ceremony's clock: runs `elapsed` along the plan on animation frames, plays
 * each cue as the clock passes it, and can be skipped to the end (a skip plays no cues —
 * the haul lands in silence rather than as a burst of coins).
 */
import { useEffect, useRef, useState } from 'react'
import { sfx } from '../audio/sound'
import { cuesBetween, type CeremonyPlan } from './ceremony'

export function useCeremony(plan: CeremonyPlan): { elapsed: number; done: boolean; skip: () => void } {
  const [elapsed, setElapsed] = useState(plan.instant ? plan.total : 0)
  const [skipped, setSkipped] = useState(false)
  const last = useRef(-1)
  const done = plan.instant || skipped || elapsed >= plan.total

  // Reduced motion: the one summary cue, once.
  useEffect(() => {
    if (!plan.instant) return
    for (const c of plan.cues) sfx(c.cue, c.gain !== undefined ? { gain: c.gain } : undefined)
  }, [plan])

  useEffect(() => {
    if (plan.instant || skipped) return
    let raf = 0
    let start: number | null = null
    const raw = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16) as unknown as number
    const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (id: number) => clearTimeout(id)
    const frame = (now: number) => {
      if (start === null) start = now
      const e = Math.min(plan.total, now - start)
      for (const c of cuesBetween(plan, last.current, e)) sfx(c.cue, c.gain !== undefined ? { gain: c.gain } : undefined)
      last.current = e
      setElapsed(e)
      if (e < plan.total) raf = raw(frame)
    }
    raf = raw(frame)
    return () => cancel(raf)
  }, [plan, skipped])

  const skip = () => {
    setSkipped(true)
    setElapsed(plan.total)
  }
  return { elapsed: done ? plan.total : elapsed, done, skip }
}
