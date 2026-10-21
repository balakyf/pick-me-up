/**
 * Coins that burst from the reward and fly to the gold counter in the scene bar
 * (spec 2026-10-12 S11/V6, WP4). Pure presentation: offsets come from `hashString`,
 * never Math.random, and the burst is capped at 12 nodes. Reduced motion draws nothing.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { hashString } from '../pixel/rand'

/** How many coins a reward of `gold` throws (4..12). */
export function coinCount(gold: number): number {
  if (gold <= 0) return 0
  return Math.max(4, Math.min(12, Math.round(gold / 150)))
}

export interface CoinSpec {
  /** Start offset from the source centre (px). */
  sx: number
  sy: number
  /** Animation delay (ms). */
  delay: number
}

/** Deterministic scatter for `n` coins of the burst keyed `seed`. */
export function coinSpecs(seed: string, n: number): CoinSpec[] {
  const out: CoinSpec[] = []
  for (let i = 0; i < n; i++) {
    const h = hashString(`${seed}|coin|${i}`)
    out.push({ sx: (h % 41) - 20, sy: ((h >>> 8) % 25) - 12, delay: 40 * i + ((h >>> 16) % 30) })
  }
  return out
}

/** Where the coins land: the results card's gold purse (the "Next summon" bar), else
 *  the header gold counter, if either is on screen. */
function goldCounter(): Element | null {
  if (typeof document === 'undefined') return null
  return document.querySelector('.coin-target') ?? document.querySelector('.scene-bar .coin.gold') ?? document.querySelector('.coin.gold')
}

export function CoinBurst({ gold, seed, enabled = true }: { gold: number; seed: string; enabled?: boolean }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [path, setPath] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null)
  const [done, setDone] = useState(false)
  const n = enabled ? coinCount(gold) : 0

  useLayoutEffect(() => {
    if (n === 0) return
    const from = anchor.current?.getBoundingClientRect()
    if (!from) return
    const to = goldCounter()?.getBoundingClientRect()
    const x = from.left + from.width / 2
    const y = from.top + from.height / 2
    // No counter on screen: the coins rise and fade instead.
    const dx = to ? to.left + to.width / 2 - x : 0
    const dy = to ? to.top + to.height / 2 - y : -120
    setPath({ x, y, dx, dy })
    const last = coinSpecs(seed, n).reduce((m, c) => Math.max(m, c.delay), 0)
    const timer = setTimeout(() => setDone(true), last + 900)
    return () => clearTimeout(timer)
  }, [n, seed])

  if (n === 0) return null
  return (
    <span ref={anchor} className="coin-burst-anchor" aria-hidden="true">
      {path &&
        !done &&
        coinSpecs(seed, n).map((c, i) => (
          <span
            key={i}
            className="coin-fx"
            style={
              {
                left: path.x + c.sx,
                top: path.y + c.sy,
                '--dx': `${path.dx - c.sx}px`,
                '--dy': `${path.dy - c.sy}px`,
                animationDelay: `${c.delay}ms`,
              } as CSSProperties
            }
          />
        ))}
    </span>
  )
}
