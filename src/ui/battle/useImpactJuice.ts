import { useEffect, type RefObject } from 'react'
import type { CombatEvent, CombatUnitInit, Element } from '../../engine/types'
import type { FxHandle } from './BattleFxCanvas'
import { HITSTOP_MS, popupDelay } from './battleFrames'
import { punch, shake } from './stageFx'

/**
 * Impact juice for each blow of a beat as it lands: element sparks (staggered over a
 * sweep's targets, in step with their numbers), and on a crit the hit-stop — the frame
 * freezes, sprites included (`.hitstop`) — the camera punch and the heavy shake; a killing
 * or heavy blow gets a smaller punch. Reduced motion keeps the sparks and the freeze only.
 */
export function useImpactJuice({
  beatKey,
  beat,
  active,
  at,
  byId,
  element,
  speed,
  reduced,
  fx,
  cam,
  wrap,
}: {
  /** Changes once per beat (the effect fires again). */
  beatKey: unknown
  beat: readonly CombatEvent[]
  active: boolean
  /** Where a unit's body is on the stage (stage px), or null when it is off it. */
  at: (id: string) => { x: number; y: number } | null
  byId: Record<string, CombatUnitInit>
  element: Element
  speed: number
  reduced: boolean
  fx: RefObject<FxHandle | null>
  cam: RefObject<HTMLDivElement | null>
  wrap: RefObject<HTMLDivElement | null>
}) {
  useEffect(() => {
    if (!active || beat.length === 0) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const later = (ms: number, f: () => void) => {
      if (ms <= 0) f()
      else timers.push(setTimeout(f, ms / speed))
    }
    const freeze = () => {
      fx.current?.freeze(HITSTOP_MS)
      const el = wrap.current
      el?.classList.add('hitstop')
      timers.push(setTimeout(() => el?.classList.remove('hitstop'), HITSTOP_MS))
    }
    let n = 0
    let stopped = false
    for (const e of beat) {
      if (e.kind === 'hit') {
        const i = n++
        const p = at(e.targetId)
        if (!p) continue
        const dir: 1 | -1 = byId[e.actorId]?.side === 'hero' ? -1 : 1
        const kill = e.hpAfter <= 0
        const big = e.amount >= (byId[e.targetId]?.maxHP ?? Infinity) * 0.25
        if (e.crit && !stopped) {
          // The first crit of the beat stops the world as it lands.
          stopped = true
          later(popupDelay(i), () => {
            freeze()
            fx.current?.burst('crit', element, p.x, p.y, dir)
            if (!reduced) {
              punch(cam.current, p, kill ? 1.14 : 1.1, HITSTOP_MS)
              shake(wrap.current, 5, HITSTOP_MS)
            }
          })
        } else {
          later(popupDelay(i), () => {
            fx.current?.burst(e.crit ? 'crit' : kill ? 'kill' : 'hit', element, p.x, p.y, dir)
            // A sweep shakes once, on its first blows, not on every one.
            if (!reduced && i < 2) {
              if (kill) punch(cam.current, p, 1.05, 0)
              if (kill || big) shake(wrap.current, 2, 0)
            }
          })
        }
      } else if (e.kind === 'heal') {
        const i = n++
        const p = at(e.unitId)
        if (p) later(popupDelay(i), () => fx.current?.burst('heal', 'wind', p.x, p.y + 6, 1))
      } else if (e.kind === 'guard') {
        const i = n++
        const p = at(e.targetId)
        if (p) later(popupDelay(i), () => fx.current?.burst('guard', 'physical', p.x, p.y, byId[e.actorId]?.side === 'hero' ? -1 : 1))
      } else if (e.kind === 'miss') {
        n++
      }
    }
    const el = wrap.current
    return () => {
      for (const tm of timers) clearTimeout(tm)
      el?.classList.remove('hitstop')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatKey])
}
