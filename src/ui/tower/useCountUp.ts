/**
 * Count-up numbers for the reward cascade (spec 2026-10-12 S11, WP4). Presentation only.
 *
 * `countUpValue` is the pure easing (ease-out cubic, integers, lands exactly on `to`).
 * `useCountUp` animates it on requestAnimationFrame (setTimeout where that is missing)
 * and also arms a hard-stop timer, so the final value is exact even when frames are
 * throttled (background tabs, jsdom, fake timers). Reduced motion shows the final value.
 */
import { useEffect, useRef, useState } from 'react'

/** The displayed value at progress `p` (0..1) of a count from `from` to `to`. */
export function countUpValue(from: number, to: number, p: number): number {
  if (!(p > 0)) return from
  if (p >= 1) return to
  const eased = 1 - (1 - p) * (1 - p) * (1 - p)
  const v = from + (to - from) * eased
  // Never overshoot the target, and never land on it before the end.
  return to >= from ? Math.min(to, Math.floor(v)) : Math.max(to, Math.ceil(v))
}

export interface CountUpOpts {
  from?: number
  durationMs?: number
  delayMs?: number
  /** False shows `to` immediately (reduced motion, a re-shown card). */
  animate?: boolean
  /** Called as the number climbs (throttled to one call per `stepMs`), with a 0-based step index. */
  onStep?: (step: number) => void
  stepMs?: number
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
}

/** Animate a number from `from` up to `to`. Returns the value to display. */
export function useCountUp(to: number, opts: CountUpOpts = {}): number {
  const { from = 0, durationMs = 900, delayMs = 0, animate = true, stepMs = 70 } = opts
  const [value, setValue] = useState(animate ? from : to)
  const onStep = useRef(opts.onStep)
  onStep.current = opts.onStep

  useEffect(() => {
    if (!animate || to === from) {
      setValue(to)
      return
    }
    setValue(from)
    let cancelled = false
    let frame: number | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let start = -1
    let lastStep = -Infinity
    let steps = 0
    const raf =
      typeof requestAnimationFrame === 'function'
        ? (fn: () => void) => requestAnimationFrame(fn)
        : (fn: () => void) => setTimeout(fn, 16) as unknown as number
    const caf =
      typeof cancelAnimationFrame === 'function' ? (id: number) => cancelAnimationFrame(id) : (id: number) => clearTimeout(id)

    const tick = () => {
      if (cancelled) return
      const t = now()
      if (start < 0) start = t
      const p = (t - start) / durationMs
      const v = countUpValue(from, to, p)
      setValue(v)
      if (t - lastStep >= stepMs && v !== to) {
        lastStep = t
        onStep.current?.(steps++)
      }
      if (p < 1) frame = raf(tick)
    }
    const begin = setTimeout(() => {
      frame = raf(tick)
    }, delayMs)
    // Hard stop: whatever the frame rate did, the number ends exactly on target.
    timer = setTimeout(() => {
      if (cancelled) return
      cancelled = true
      if (frame !== null) caf(frame)
      setValue(to)
    }, delayMs + durationMs + 60)
    return () => {
      cancelled = true
      clearTimeout(begin)
      if (timer !== null) clearTimeout(timer)
      if (frame !== null) caf(frame)
    }
  }, [to, from, durationMs, delayMs, animate, stepMs])

  return value
}
