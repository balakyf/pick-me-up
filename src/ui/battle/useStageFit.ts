import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CombatLog, CombatUnitInit } from '../../engine/types'
import { BG_H, BG_W } from '../pixel/battleBg'
import { battleLayout, fitStage, NARROW_SQUEEZE, type BattleLayout } from './battleFx'
import { layout, unitSpan } from './battleFrames'

/**
 * The battle's layout and the stage's fit to the screen:
 * - wide: the windows under the stage, which grows as big as the room left allows (and
 *   wider than the 384px canon on wide screens, the backdrop tiling to fill);
 * - narrow (a phone held upright): the two sides draw in toward the middle, the stage crops
 *   to the stretch the units stand on and zooms in; the mission and the turn order dock
 *   above and below it;
 * - beside (a phone on its side): the windows stand next to the stage, which crops the same way.
 */
export function useStageFit(log: CombatLog, byId: Record<string, CombatUnitInit>, sizeOf: (u: CombatUnitInit) => { w: number; h: number }) {
  const [mode, setMode] = useState<BattleLayout>(() => (typeof window === 'undefined' ? 'wide' : battleLayout(window.innerWidth, window.innerHeight)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pos = useMemo(() => layout(log, mode === 'narrow' ? NARROW_SQUEEZE : 1, (id) => (byId[id] ? sizeOf(byId[id]!) : { w: 24, h: 32 })), [log, mode])
  /** The stretch of the canon the units stand on (a phone crops the stage to it). */
  const span = useMemo(() => {
    const s = unitSpan(pos, (id) => (byId[id] ? sizeOf(byId[id]!).w / 2 : 12) + 8)
    return { ...s, width: Math.ceil(s.right - s.left) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos])
  const hudRef = useRef<HTMLDivElement | null>(null)
  const mainRef = useRef<HTMLDivElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [fit, setFit] = useState(() => fitStage(BG_W * 2, BG_H * 2))
  const spanW = useRef(span.width)
  spanW.current = span.width
  /** The tallest the windows and docked strips have stood on this screen size: the stage
   *  fits under that, so it does not grow and shrink as foes fall and waves arrive. */
  const chrome = useRef({ screen: '', h: 0 })
  useLayoutEffect(() => {
    const measure = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const m = battleLayout(vw, vh)
      setMode((old) => (old === m ? old : m))
      // Whatever docks around the stage (the mission strip, the turn order) takes its room.
      const extras = Math.max(0, (mainRef.current?.offsetHeight ?? 0) - (wrapRef.current?.offsetHeight ?? 0))
      const screen = `${vw}x${vh}`
      if (chrome.current.screen !== screen) chrome.current = { screen, h: 0 }
      chrome.current.h = Math.max(chrome.current.h, (hudRef.current?.offsetHeight ?? 0) + extras)
      const taken = chrome.current.h
      const next =
        m === 'beside'
          ? fitStage(vw - (hudRef.current?.offsetWidth ?? 280) - 28, vh - 16, spanW.current)
          : m === 'narrow'
            ? fitStage(vw - 12, vh - taken - 22, spanW.current)
            : fitStage(vw - 16, vh - taken - 26)
      setFit((f) => (f.zoom === next.zoom && f.width === next.width ? f : next))
    }
    measure()
    window.addEventListener('resize', measure)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro && hudRef.current) ro.observe(hudRef.current)
    if (ro && mainRef.current) ro.observe(mainRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [span.width])
  const { zoom, width: stageW } = fit
  /** Where the 384px canon (the unit layout) sits inside the stage: centred on the canon on a
   *  wide screen, on the units when a phone crops the stage to them. */
  const ox = stageW >= BG_W ? Math.floor((stageW - BG_W) / 2) : Math.round(stageW / 2 - (span.left + span.right) / 2)
  /** The stretch of the canon on screen (numbers and skill names stay inside it). */
  const visible = { left: -ox + 2, right: stageW - ox - 2 }
  return { mode, pos, zoom, stageW, ox, visible, hudRef, mainRef, wrapRef }
}
