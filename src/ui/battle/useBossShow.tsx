import { useEffect, useMemo, type ReactNode, type RefObject } from 'react'
import type { CombatLog, CombatUnitInit } from '../../engine/types'
import { flashesOn, screenShakeOn } from '../qol/settings'
import { enemyUrl } from '../pixel/sprites'
import type { FxHandle } from './BattleFxCanvas'
import { popupDelay, type Snap } from './battleFrames'
import { bossShows, showIn, showMs, type BossShow } from './bossIntro'
import { BossIntroCard, BossSpotlight } from './BossIntro'
import { BossShatter } from './BossShatter'
import { shake } from './stageFx'

/** The finisher plays the killing blow at this share of the replay's speed (slow motion). */
export const SLOWMO = 0.4

/**
 * The boss shows of the beat on screen (lane I): an arrival's title card with the stage
 * dimmed and the camera easing in, the Lv999 Creature waking, and a boss's finisher — slow
 * motion, a white-out and the body shattering. BattleScene mounts what this returns:
 * `card` in screen space, `spotlight` in the stage, `shatter` among the units; `pace` is the
 * speed the beat's animations run at (the finisher's slow motion).
 */
export function useBossShow({
  log,
  byId,
  snap,
  atEnd,
  speed,
  reduced,
  pos,
  ox,
  sizeOf,
  beatMs,
  cam,
  wrap,
  fx,
  onSkip,
  wave = null,
}: {
  log: CombatLog
  byId: Record<string, CombatUnitInit>
  snap: Snap
  atEnd: boolean
  speed: number
  reduced: boolean
  pos: Record<string, { x: number; y: number }>
  ox: number
  sizeOf: (u: CombatUnitInit) => { w: number; h: number }
  /** How long this beat holds (real ms). */
  beatMs: number
  cam: RefObject<HTMLDivElement | null>
  wrap: RefObject<HTMLDivElement | null>
  fx: RefObject<FxHandle | null>
  onSkip: () => void
  /** The wave this arrival opens (the card names it; the wave banner stands aside). */
  wave?: { n: number; total: number } | null
}): {
  show: BossShow | null
  pace: number
  card: ReactNode
  spotlight: ReactNode
  shatter: ReactNode
  /** The boss breaking apart on this beat (its own sprite steps aside). */
  shattered: string | null
  /** When (real ms into the beat) the killing blow lands. */
  shatterAt: number
  /** Bosses whose finisher has already played: they stay broken (no second dissolve). */
  gone: ReadonlySet<string>
} {
  const shows = useMemo(() => bossShows(log, byId), [log, byId])
  const gone = useMemo(() => {
    const out = new Set<string>()
    for (const [i, s] of shows) if (s.kind === 'finisher' && (atEnd ? i <= snap.to : i < snap.from)) out.add(s.unitId)
    return out
  }, [shows, atEnd, snap.from, snap.to])
  const found = atEnd ? null : showIn(shows, snap.from, snap.to)
  const show = found?.show ?? null
  const key = found ? `${found.at}|${log.seed}|${log.events.length}` : null
  const finisher = show?.kind === 'finisher' ? show : null
  const pace = finisher && !reduced ? speed * SLOWMO : speed

  // Where the show is aimed: the main arrival, the one waking, the one falling.
  const focusId = show === null ? null : show.kind === 'intro' ? show.units[0]! : show.unitId
  const focusUnit = focusId !== null ? byId[focusId] : undefined
  const focusPos = focusId !== null ? pos[focusId] : undefined
  const focusSize = focusUnit ? sizeOf(focusUnit) : { w: 24, h: 32 }
  const focus = focusPos ? { x: ox + focusPos.x, y: focusPos.y - focusSize.h / 2 } : null

  // When the killing blow lands within the finisher's beat (its number's place in a sweep).
  const shatterAt = (() => {
    if (!finisher) return 0
    const evs = log.events.slice(snap.from, snap.to + 1)
    let n = 0
    for (const e of evs) {
      if (e.kind === 'hit' && e.targetId === finisher.unitId && e.hpAfter <= 0) break
      if (e.kind === 'hit' || e.kind === 'miss' || e.kind === 'guard' || e.kind === 'heal') n++
    }
    return Math.round((popupDelay(n) + 220) / pace)
  })()

  // The camera eases toward an arrival (or the waking), holds, and eases back; a finisher
  // and a waking shake the stage; a finisher throws the boss's own colours everywhere.
  useEffect(() => {
    if (!show || !focus) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const el = cam.current
    let ease: Animation | null = null
    if ((show.kind === 'intro' || show.kind === 'wakes') && !reduced && el && typeof el.animate === 'function') {
      el.style.transformOrigin = `${focus.x}px ${focus.y}px`
      const zoom = show.kind === 'wakes' ? 1.12 : show.kind === 'intro' && show.tier === 'boss' ? 1.18 : 1.08
      ease = el.animate(
        [
          { transform: 'scale(1)' },
          { transform: `scale(${zoom})`, offset: 0.22 },
          { transform: `scale(${zoom})`, offset: 0.78 },
          { transform: 'scale(1)' },
        ],
        { duration: Math.max(300, beatMs), easing: 'ease-in-out' },
      )
    }
    if (show.kind === 'wakes' && !reduced) {
      timers.push(setTimeout(() => shake(wrap.current, 6, 0), 200 / speed))
      timers.push(setTimeout(() => shake(wrap.current, 4, 0), 700 / speed))
    }
    if (show.kind === 'finisher') {
      const u = byId[show.unitId]
      timers.push(
        setTimeout(() => {
          if (u) for (let i = 0; i < 3; i++) fx.current?.burst(i === 0 ? 'crit' : 'kill', u.element, focus.x + (i - 1) * 8, focus.y + (i % 2) * 6, i % 2 ? 1 : -1)
          if (!reduced && screenShakeOn()) shake(wrap.current, 6, 0)
        }, shatterAt),
      )
    }
    return () => {
      for (const tm of timers) clearTimeout(tm)
      // A skipped card takes the camera's ease with it (the next beat plays unzoomed).
      ease?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const durMs = beatMs
  let card: ReactNode = null
  let spotlight: ReactNode = null
  let shatter: ReactNode = null
  if (show && focus) {
    const r = Math.max(focusSize.w, focusSize.h) * 0.75 + 18
    if (show.kind === 'intro') {
      const units = show.units.map((id) => byId[id]).filter((u): u is CombatUnitInit => u !== undefined)
      card = <BossIntroCard key={`bi${key}`} units={units} tier={show.tier} calm={reduced} durMs={durMs} onSkip={onSkip} wave={wave} />
      spotlight = <BossSpotlight key={`bs${key}`} x={focus.x} y={focus.y} r={r} durMs={durMs} />
    } else if (show.kind === 'wakes' && focusUnit) {
      card = <BossIntroCard key={`bw${key}`} units={[focusUnit]} tier="boss" calm={reduced} durMs={durMs} onSkip={onSkip} wakes />
      spotlight = <BossSpotlight key={`bs${key}`} x={focus.x} y={focus.y} r={r} durMs={durMs} wakes />
    } else if (show.kind === 'finisher' && focusUnit && focusPos) {
      shatter = (
        <BossShatter
          key={`sh${key}`}
          src={enemyUrl(focusUnit.name, focusUnit.element)}
          x={focusPos.x}
          y={focusPos.y}
          w={focusSize.w}
          h={focusSize.h}
          seed={focusUnit.id}
          durMs={Math.round(showMs(show) / pace)}
          delayMs={shatterAt}
        />
      )
      // The white-out is a flash: the Settings window can turn it off.
      card = flashesOn() ? (
        <div key={`wo${key}`} className={`bs-whiteout ${reduced ? 'calm' : ''}`} style={{ ['--wo-delay' as string]: `${shatterAt}ms` }} aria-hidden="true" />
      ) : null
    }
  }
  return { show, pace, card, spotlight, shatter, shattered: finisher?.unitId ?? null, shatterAt, gone }
}
